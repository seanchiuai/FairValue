from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import urljoin

import requests

from sf_scraper.models import Listing
from sf_scraper.quality import parse_missing_home_facts_from_text, passes_quality_filters
from sf_scraper.sources.base import SourceAdapter
from sf_scraper.utils import normalize_text, to_float, to_int

REDFIN_BASE_URL = "https://www.redfin.com"
REDFIN_GIS_URL = "https://www.redfin.com/stingray/api/gis"

# Region metadata for San Francisco (city-level region).
SF_REGION_ID = 17151
SF_REGION_TYPE = 6


PROPERTY_TYPE_MAP = {
    1: "Condo",
    2: "Townhouse",
    3: "Multi Family",
    4: "Single Family",
    5: "Land",
}


def _value(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw.get("value")
    return raw


def _payload_text_to_json(text: str) -> dict[str, Any]:
    cleaned = text[4:] if text.startswith("{}&&") else text
    payload = json.loads(cleaned)
    if not isinstance(payload, dict):
        return {}
    return payload


def parse_redfin_homes(text: str) -> list[Listing]:
    payload = _payload_text_to_json(text)
    homes = payload.get("payload", {}).get("homes", [])
    if not isinstance(homes, list):
        return []

    listings: list[Listing] = []
    for home in homes:
        if not isinstance(home, dict):
            continue

        price = to_int(_value(home.get("price")))

        lat_long = _value(home.get("latLong")) or {}
        latitude = to_float(lat_long.get("latitude"))
        longitude = to_float(lat_long.get("longitude"))

        street = normalize_text(_value(home.get("streetLine")))
        unit = normalize_text(_value(home.get("unitNumber")))
        address = street
        if address and unit:
            address = f"{address} {unit}"

        city = normalize_text(_value(home.get("city")))
        state = normalize_text(_value(home.get("state")))
        postal = normalize_text(_value(home.get("zip")) or _value(home.get("postalCode")))

        beds = to_float(_value(home.get("beds")))
        baths = to_float(_value(home.get("baths")))
        sqft = to_int(_value(home.get("sqFt")))

        detail_path = normalize_text(home.get("url"))
        source_url = urljoin(REDFIN_BASE_URL, detail_path or "") if detail_path else None

        title = normalize_text(
            " ".join(
                part
                for part in [street, city, state, postal]
                if part
            )
        )

        parsed_beds, parsed_baths, parsed_sqft = parse_missing_home_facts_from_text(title)
        if beds is None:
            beds = parsed_beds
        if baths is None:
            baths = parsed_baths
        if sqft is None:
            sqft = parsed_sqft

        if not passes_quality_filters(
            title=title,
            price_usd=price,
            latitude=latitude,
            longitude=longitude,
        ):
            continue

        raw_ui_property_type = _value(home.get("uiPropertyType"))
        property_type_value = (
            normalize_text(raw_ui_property_type)
            if isinstance(raw_ui_property_type, str)
            else None
        )
        if not property_type_value:
            property_type_value = PROPERTY_TYPE_MAP.get(
                to_int(raw_ui_property_type) or to_int(_value(home.get("propertyType")))
            )

        listings.append(
            Listing(
                source="redfin",
                source_id=str(home.get("listingId") or home.get("propertyId") or ""),
                source_url=source_url,
                title=title,
                address=address,
                city=city,
                state=state,
                postal_code=postal,
                price_usd=price,
                bedrooms=beds,
                bathrooms=baths,
                sqft=sqft,
                property_type=property_type_value,
                latitude=latitude,
                longitude=longitude,
                listing_status=normalize_text(_value(home.get("mlsStatus")) or _value(home.get("searchStatus"))),
                raw=home,
            )
        )

    return listings


class RedfinSanFranciscoSource(SourceAdapter):
    source_name = "redfin"

    def __init__(
        self,
        page_limit: int = 2,
        per_page: int = 100,
        timeout_seconds: int = 30,
        minimum_expected_count: int = 20,
        retry_attempts: int = 3,
    ) -> None:
        self.page_limit = page_limit
        self.per_page = per_page
        self.timeout_seconds = timeout_seconds
        self.minimum_expected_count = minimum_expected_count
        self.retry_attempts = max(1, retry_attempts)

    def fetch(self) -> list[Listing]:
        listings: list[Listing] = []
        with requests.Session() as session:
            session.headers.update({"User-Agent": "Mozilla/5.0"})

            for page in range(1, self.page_limit + 1):
                text = self._request_page(session=session, page_number=page)
                page_listings = parse_redfin_homes(text)
                if not page_listings:
                    break
                listings.extend(page_listings)
                if len(page_listings) < self.per_page:
                    break

        return listings

    def _request_page(self, session: requests.Session, page_number: int) -> str:
        params = {
            "al": 1,
            "market": "sfr",
            "num_homes": self.per_page,
            "ord": "redfin-recommended-asc",
            "page_number": page_number,
            "region_id": SF_REGION_ID,
            "region_type": SF_REGION_TYPE,
            "sf": "1,2,3,5,6,7",
            "status": 9,
            "uipt": "1,2,3,4,5",
            "v": 8,
        }

        last_error: Exception | None = None
        for attempt in range(self.retry_attempts):
            try:
                response = session.get(
                    REDFIN_GIS_URL,
                    params=params,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                return response.text
            except requests.RequestException as exc:
                last_error = exc
                if attempt + 1 < self.retry_attempts:
                    time.sleep(1.0 * (2**attempt))

        if last_error is None:
            raise RuntimeError("Redfin request failed without a captured exception.")
        raise last_error
