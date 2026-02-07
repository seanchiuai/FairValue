from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urljoin

import requests

from sf_scraper.models import Listing
from sf_scraper.quality import (
    is_obvious_junk_title,
    is_within_sf_geofence,
    normalized_zip,
    parse_missing_home_facts_from_text,
)
from sf_scraper.sources.base import SourceAdapter
from sf_scraper.utils import normalize_text, to_float, to_int

APIFY_API_BASE_URL = "https://api.apify.com/v2"
APIFY_DEFAULT_ACTOR_ID = "propertyapi~zillow-property-lead-scraper"
APIFY_DEFAULT_SEARCH_URL = "https://www.zillow.com/san-francisco-ca/sold/"
ZILLOW_BASE_URL = "https://www.zillow.com"


def _first(mapping: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 1e11:
            timestamp /= 1000.0
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None

    if not isinstance(value, str):
        return None

    cleaned = normalize_text(value)
    if not cleaned:
        return None

    if re.fullmatch(r"\d{10,13}", cleaned):
        return _parse_datetime(int(cleaned))

    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        pass

    date_candidate = None
    date_match = re.search(r"(\d{1,2}/\d{1,2}/\d{2,4})", cleaned)
    if date_match:
        date_candidate = date_match.group(1)
    else:
        iso_match = re.search(r"(\d{4}-\d{2}-\d{2})", cleaned)
        if iso_match:
            date_candidate = iso_match.group(1)

    if date_candidate is None:
        return None

    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(date_candidate, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _is_sold_status(status: str | None) -> bool:
    normalized = (status or "").strip().upper().replace("-", "_").replace(" ", "_")
    return normalized in {"SOLD", "RECENTLY_SOLD"}


def _is_house_type(home_type: str | None) -> bool:
    normalized = (home_type or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not normalized:
        return False
    if normalized in {"SINGLE_FAMILY", "HOUSE", "SINGLEFAMILY"}:
        return True
    if "SINGLE_FAMILY" in normalized:
        return True
    return normalized.endswith("_HOUSE")


def _sold_within_days(sold_at: datetime, *, now: datetime, lookback_days: int) -> bool:
    threshold = now - timedelta(days=lookback_days)
    return sold_at >= threshold


def _parse_city_state_zip(text: str | None) -> tuple[str | None, str | None, str | None]:
    if not text:
        return None, None, None

    cleaned = normalize_text(text)
    if not cleaned:
        return None, None, None

    parts = [part.strip() for part in cleaned.split(",")]
    if len(parts) < 2:
        return None, None, None

    city = normalize_text(parts[-2])
    state_zip = normalize_text(parts[-1])
    if not state_zip:
        return city, None, None

    tokens = state_zip.split()
    if len(tokens) >= 2:
        return city, normalize_text(tokens[0]), normalize_text(tokens[1])
    return city, state_zip, None


def _extract_lat_lon(item: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = to_float(
        _first(
            item,
            [
                "latitude",
                "lat",
                "propertyLatitude",
            ],
        )
    )
    lon = to_float(
        _first(
            item,
            [
                "longitude",
                "lng",
                "lon",
                "propertyLongitude",
            ],
        )
    )

    if lat is not None and lon is not None:
        return lat, lon

    lat_long = item.get("latLong")
    if isinstance(lat_long, dict):
        return to_float(lat_long.get("latitude")), to_float(lat_long.get("longitude"))

    coordinates = item.get("coordinates")
    if isinstance(coordinates, dict):
        return to_float(coordinates.get("latitude")), to_float(coordinates.get("longitude"))

    return lat, lon


def _extract_sold_datetime(property_item: dict[str, Any], context_item: dict[str, Any]) -> datetime | None:
    candidates: list[Any] = [
        _first(
            property_item,
            [
                "soldDate",
                "dateSold",
                "soldAt",
                "soldOn",
                "closeDate",
                "closedDate",
                "lastSoldDate",
                "recentlySoldDate",
                "statusText",
            ],
        ),
        _first(
            context_item,
            [
                "soldDate",
                "dateSold",
                "soldAt",
                "soldOn",
                "closeDate",
                "closedDate",
                "statusText",
            ],
        ),
    ]

    for value in candidates:
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed
    return None


def _is_sf_listing(
    *,
    city: str | None,
    state: str | None,
    postal_code: str | None,
    address: str | None,
    latitude: float | None,
    longitude: float | None,
) -> bool:
    if latitude is not None and longitude is not None:
        return is_within_sf_geofence(latitude, longitude)

    zipcode = normalized_zip(postal_code)
    if zipcode.startswith("941"):
        return True

    normalized_city = (city or "").strip().lower()
    normalized_state = (state or "").strip().lower()
    if normalized_city == "san francisco" and normalized_state in {"ca", "california", ""}:
        return True

    normalized_address = (address or "").lower()
    return "san francisco" in normalized_address


def _normalize_actor_id(actor_id: str) -> str:
    return actor_id.strip().replace("/", "~")


def _build_default_actor_input(search_url: str, extra_input: dict[str, Any] | None) -> dict[str, Any]:
    payload = dict(extra_input or {})
    if not any(key in payload for key in ("url_list", "urlList", "startUrls", "searchUrls")):
        payload["url_list"] = [search_url]
    return payload


def _parse_apify_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("items", "data", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _request_apify_dataset_items(
    *,
    session: requests.Session,
    actor_id: str,
    token: str,
    actor_input: dict[str, Any],
    timeout_seconds: int,
    retry_attempts: int,
) -> list[dict[str, Any]]:
    actor_code = _normalize_actor_id(actor_id)
    url = f"{APIFY_API_BASE_URL}/acts/{actor_code}/run-sync-get-dataset-items"

    last_error: Exception | None = None
    for attempt in range(max(1, retry_attempts)):
        try:
            response = session.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "User-Agent": "sf-house-scraper/1.0",
                },
                params={"format": "json", "clean": "true"},
                json=actor_input,
                timeout=timeout_seconds,
            )
            response.raise_for_status()

            try:
                payload = response.json()
            except ValueError as exc:
                raise RuntimeError("Apify actor response was not valid JSON.") from exc

            items = _parse_apify_items(payload)
            if not items and isinstance(payload, list):
                return []
            if not isinstance(items, list):
                raise RuntimeError("Apify actor response does not contain dataset items.")
            return items
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc
            if attempt + 1 < max(1, retry_attempts):
                time.sleep(1.0 * (2**attempt))

    if last_error is None:
        raise RuntimeError("Apify actor request failed without a captured exception.")
    raise last_error


def _to_listing(
    property_item: dict[str, Any],
    *,
    context_item: dict[str, Any],
    now: datetime,
    sold_within_days: int,
) -> Listing | None:
    details = property_item.get("details") if isinstance(property_item.get("details"), dict) else {}

    status = normalize_text(
        _first(
            property_item,
            ["statusType", "status", "homeStatus", "listingStatus"],
        )
        or _first(context_item, ["statusType", "status", "homeStatus", "listingStatus"])
    )
    if not _is_sold_status(status):
        return None

    sold_at = _extract_sold_datetime(property_item, context_item)
    if sold_at is None or not _sold_within_days(sold_at, now=now, lookback_days=sold_within_days):
        return None

    source_id = str(_first(property_item, ["zpid", "zuid", "id", "propertyId"]) or "")
    detail_url = normalize_text(_first(property_item, ["detailUrl", "url", "propertyUrl", "zillowUrl"]))
    source_url: str | None = None
    if detail_url:
        source_url = urljoin(ZILLOW_BASE_URL, detail_url)

    full_address = normalize_text(_first(property_item, ["address", "streetAddress", "fullAddress"]))
    city = normalize_text(_first(property_item, ["city", "addressCity"]))
    state = normalize_text(_first(property_item, ["state", "addressState"]))
    postal = normalize_text(_first(property_item, ["zipcode", "zip", "postalCode", "addressZipcode"]))

    if city is None or state is None or postal is None:
        parsed_city, parsed_state, parsed_postal = _parse_city_state_zip(full_address)
        city = city or parsed_city
        state = state or parsed_state
        postal = postal or parsed_postal

    price = to_int(_first(property_item, ["price", "listPrice", "unformattedPrice"]))
    beds = to_float(_first(property_item, ["beds", "bedrooms", "bed"]))
    baths = to_float(_first(property_item, ["baths", "bathrooms", "bath"]))
    sqft = to_int(_first(property_item, ["area", "sqft", "livingArea"]))

    if beds is None:
        beds = to_float(_first(details, ["beds", "bedrooms"]))
    if baths is None:
        baths = to_float(_first(details, ["baths", "bathrooms"]))
    if sqft is None:
        sqft = to_int(_first(details, ["sqft", "livingArea"]))

    latitude, longitude = _extract_lat_lon(property_item)
    if latitude is None or longitude is None:
        detail_lat, detail_lon = _extract_lat_lon(details)
        latitude = latitude if latitude is not None else detail_lat
        longitude = longitude if longitude is not None else detail_lon

    title = normalize_text(" ".join(part for part in [full_address, city, state, postal] if part))

    parsed_beds, parsed_baths, parsed_sqft = parse_missing_home_facts_from_text(title)
    if beds is None:
        beds = parsed_beds
    if baths is None:
        baths = parsed_baths
    if sqft is None:
        sqft = parsed_sqft

    if price is None or price <= 0:
        return None
    if is_obvious_junk_title(title):
        return None

    property_type = normalize_text(
        _first(property_item, ["homeType", "propertyType", "propertySubType"])
        or _first(details, ["homeType", "propertyType", "propertySubType"])
    )
    if not _is_house_type(property_type):
        return None

    if not _is_sf_listing(
        city=city,
        state=state,
        postal_code=postal,
        address=full_address,
        latitude=latitude,
        longitude=longitude,
    ):
        return None

    if not source_id:
        fallback = f"{full_address or ''}|{price}|{sold_at.date().isoformat()}"
        source_id = hashlib.sha1(fallback.encode("utf-8")).hexdigest()[:16]

    raw = dict(property_item)
    if context_item.get("url"):
        raw["_apify_context_url"] = context_item.get("url")

    return Listing(
        source="zillow",
        source_id=source_id,
        source_url=source_url,
        title=title,
        address=full_address,
        city=city,
        state=state,
        postal_code=postal,
        price_usd=price,
        bedrooms=beds,
        bathrooms=baths,
        sqft=sqft,
        property_type=property_type,
        latitude=latitude,
        longitude=longitude,
        listing_status=status,
        raw=raw,
    )


def parse_apify_dataset_items(
    items: list[dict[str, Any]],
    *,
    now: datetime | None = None,
    sold_within_days: int = 30,
) -> list[Listing]:
    current_time = now or datetime.now(timezone.utc)

    listings: list[Listing] = []
    for item in items:
        properties = item.get("properties") if isinstance(item.get("properties"), list) else None
        if properties is None:
            listing = _to_listing(item, context_item={}, now=current_time, sold_within_days=sold_within_days)
            if listing is not None:
                listings.append(listing)
            continue

        for property_item in properties:
            if not isinstance(property_item, dict):
                continue
            listing = _to_listing(property_item, context_item=item, now=current_time, sold_within_days=sold_within_days)
            if listing is not None:
                listings.append(listing)

    return listings


class ZillowSanFranciscoSource(SourceAdapter):
    source_name = "zillow"

    def __init__(
        self,
        page_limit: int = 2,
        timeout_seconds: int = 60,
        minimum_expected_count: int = 20,
        retry_attempts: int = 3,
        sold_within_days: int = 30,
        apify_token: str | None = None,
        apify_actor_id: str = APIFY_DEFAULT_ACTOR_ID,
        apify_search_url: str = APIFY_DEFAULT_SEARCH_URL,
        apify_actor_input: dict[str, Any] | None = None,
    ) -> None:
        self.page_limit = page_limit
        self.timeout_seconds = timeout_seconds
        self.minimum_expected_count = minimum_expected_count
        self.retry_attempts = max(1, retry_attempts)
        self.sold_within_days = max(1, sold_within_days)
        self.apify_token = (apify_token or "").strip()
        self.apify_actor_id = apify_actor_id.strip() or APIFY_DEFAULT_ACTOR_ID
        self.apify_search_url = apify_search_url.strip() or APIFY_DEFAULT_SEARCH_URL
        self.apify_actor_input = dict(apify_actor_input or {})

    def fetch(self) -> list[Listing]:
        if not self.apify_token:
            raise ValueError("Missing Apify token. Set APIFY_TOKEN or pass --apify-token.")

        actor_input = _build_default_actor_input(self.apify_search_url, self.apify_actor_input)

        with requests.Session() as session:
            items = _request_apify_dataset_items(
                session=session,
                actor_id=self.apify_actor_id,
                token=self.apify_token,
                actor_input=actor_input,
                timeout_seconds=self.timeout_seconds,
                retry_attempts=self.retry_attempts,
            )

        return parse_apify_dataset_items(items, sold_within_days=self.sold_within_days)
