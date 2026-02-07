from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests

from sf_scraper.extractors import ListingExtractor
from sf_scraper.geospatial import QuadrantClient, encode_geohash, geo_qa_flags, summarize_pois
from sf_scraper.models import Listing
from sf_scraper.quality import normalize_address_for_key, normalized_zip
from sf_scraper.utils import normalize_text, to_float, to_int


@dataclass
class CanonicalListing:
    source: str
    source_listing_id: str
    mls_id: str | None
    status: str | None
    price: int | None
    beds: float | None
    baths: float | None
    sqft: int | None
    lot_sqft: int | None
    property_type: str | None
    address_raw: str | None
    address_norm: str | None
    unit: str | None
    city: str | None
    zip: str | None
    lat: float | None
    lon: float | None
    geohash: str | None
    listed_date: str | None
    updated_at: str | None
    description: str | None
    key_features: list[str]
    open_house_times: list[str]
    url: str | None
    photo_urls: list[str]
    geo_qa_flags: list[str]
    poi_summary: dict[str, Any]
    raw: dict[str, Any]

    def to_dict(self, *, include_raw: bool = True, exported_at: str | None = None) -> dict[str, Any]:
        row = {
            "source": self.source,
            "source_listing_id": self.source_listing_id,
            "mls_id": self.mls_id,
            "status": self.status,
            "price": self.price,
            "beds": self.beds,
            "baths": self.baths,
            "sqft": self.sqft,
            "lot_sqft": self.lot_sqft,
            "property_type": self.property_type,
            "address_raw": self.address_raw,
            "address_norm": self.address_norm,
            "unit": self.unit,
            "city": self.city,
            "zip": self.zip,
            "lat": self.lat,
            "lon": self.lon,
            "geohash": self.geohash,
            "listed_date": self.listed_date,
            "updated_at": self.updated_at,
            "description": self.description,
            "key_features": self.key_features,
            "open_house_times": self.open_house_times,
            "url": self.url,
            "photo_urls": self.photo_urls,
            "geo_qa_flags": self.geo_qa_flags,
            "poi_summary": self.poi_summary,
        }
        if include_raw:
            row["raw"] = self.raw
        row["exported_at"] = exported_at or datetime.now(timezone.utc).isoformat()
        return row


def canonical_key(record: CanonicalListing) -> str:
    beds_key = "na" if record.beds is None else f"{round(record.beds * 2) / 2:.1f}"
    baths_key = "na" if record.baths is None else f"{round(record.baths * 2) / 2:.1f}"

    if record.address_norm and record.zip:
        return f"addr:{record.address_norm}|zip:{record.zip}|beds:{beds_key}|baths:{baths_key}"

    if record.lat is not None and record.lon is not None:
        return f"geo:{round(record.lat, 4)}:{round(record.lon, 4)}|beds:{beds_key}|baths:{baths_key}"

    if record.source_listing_id:
        return f"source:{record.source}:{record.source_listing_id}"

    return "unknown"


def _first_non_empty(values: list[Any]) -> str | None:
    for value in values:
        normalized = normalize_text(str(value)) if value is not None else None
        if normalized:
            return normalized
    return None


def _extract_description(raw: dict[str, Any], fallback_title: str | None) -> str | None:
    description = _first_non_empty(
        [
            raw.get("listingDescription"),
            raw.get("description"),
            raw.get("publicRemarks"),
            raw.get("remarks"),
            raw.get("propertyDescription"),
            fallback_title,
        ]
    )
    return description


def _extract_photo_urls(raw: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    candidates = raw.get("photos")
    if isinstance(candidates, list):
        for item in candidates:
            if isinstance(item, dict):
                url = normalize_text(item.get("url") if isinstance(item.get("url"), str) else None)
                if url:
                    urls.append(url)
    for key in ("photo_urls", "images", "imageUrls"):
        maybe = raw.get(key)
        if isinstance(maybe, list):
            for value in maybe:
                if isinstance(value, str):
                    normalized = normalize_text(value)
                    if normalized:
                        urls.append(normalized)

    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return deduped


def _extract_open_house_times(raw: dict[str, Any]) -> list[str]:
    results: list[str] = []
    open_houses = raw.get("openHouses")
    if isinstance(open_houses, list):
        for item in open_houses:
            if isinstance(item, str):
                normalized = normalize_text(item)
                if normalized:
                    results.append(normalized)
            elif isinstance(item, dict):
                value = _first_non_empty(
                    [
                        item.get("startTime"),
                        item.get("start"),
                        item.get("date"),
                        item.get("displayTime"),
                        item.get("formattedTime"),
                    ]
                )
                if value:
                    results.append(value)

    return results


def _extract_mls_id(raw: dict[str, Any]) -> str | None:
    return _first_non_empty(
        [
            raw.get("mlsID"),
            raw.get("mlsId"),
            raw.get("mlsNumber"),
            raw.get("listingId"),
        ]
    )


def _extract_lot_sqft(raw: dict[str, Any]) -> int | None:
    lot = to_int(raw.get("lotSize"))
    if lot is not None and lot > 0:
        return lot
    lot_sqft = to_int(raw.get("lotSqft"))
    if lot_sqft is not None and lot_sqft > 0:
        return lot_sqft
    return None


def _extract_dates(raw: dict[str, Any]) -> tuple[str | None, str | None]:
    listed_date = _first_non_empty(
        [
            raw.get("listedDate"),
            raw.get("listingDate"),
            raw.get("onMarketDate"),
            raw.get("activatedDate"),
        ]
    )
    updated_at = _first_non_empty(
        [
            raw.get("updatedDate"),
            raw.get("modificationTimestamp"),
            raw.get("lastUpdated"),
        ]
    )
    return listed_date, updated_at


def _extract_unit(address_raw: str | None) -> str | None:
    if not address_raw:
        return None
    match = re.search(
        r"(?:\b(?:apt|apartment|unit|suite|ste)\b|#)\s*([a-z0-9-]+)\b",
        address_raw,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return normalize_text(match.group(1))


def _clean_features(values: Any) -> list[str]:
    if isinstance(values, list):
        features = [normalize_text(str(item)) for item in values]
        return [item for item in features if item]
    return []


def build_unstructured_text(listing: Listing) -> str:
    parts: list[str] = []
    for value in [listing.title, listing.address]:
        normalized = normalize_text(value)
        if normalized:
            parts.append(normalized)

    for key in ("listingDescription", "description", "publicRemarks", "remarks"):
        raw_value = listing.raw.get(key)
        if isinstance(raw_value, str):
            normalized = normalize_text(raw_value)
            if normalized:
                parts.append(normalized)

    return "\n".join(parts)


def to_canonical_listing(
    listing: Listing,
    *,
    extractor: ListingExtractor,
    quadrant_client: QuadrantClient | None,
    quadrant_radius_meters: int,
) -> CanonicalListing:
    unstructured_text = build_unstructured_text(listing)
    extracted = extractor.extract(
        text=unstructured_text,
        context={
            "source": listing.source,
            "source_url": listing.source_url,
            "raw": listing.raw,
        },
    )

    lot_sqft = _extract_lot_sqft(listing.raw)
    if lot_sqft is None:
        lot_sqft = to_int(extracted.get("lot_sqft"))

    listed_date, updated_at = _extract_dates(listing.raw)

    description = _extract_description(listing.raw, fallback_title=listing.title)
    extracted_description = normalize_text(extracted.get("description") if isinstance(extracted.get("description"), str) else None)
    if not description:
        description = extracted_description

    key_features = _clean_features(extracted.get("key_features"))

    open_house_times = _extract_open_house_times(listing.raw)
    photo_urls = _extract_photo_urls(listing.raw)

    address_raw = normalize_text(listing.address or listing.title)
    address_norm = normalize_address_for_key(address_raw)

    city = normalize_text(listing.city)
    postal_code = normalized_zip(listing.postal_code)

    geohash = None
    if listing.latitude is not None and listing.longitude is not None:
        geohash = encode_geohash(listing.latitude, listing.longitude, precision=8)

    geo_flags = geo_qa_flags(lat=listing.latitude, lon=listing.longitude)

    poi_summary: dict[str, Any] = {}
    if quadrant_client is not None and listing.latitude is not None and listing.longitude is not None:
        try:
            pois = quadrant_client.nearby_pois(
                lat=listing.latitude,
                lon=listing.longitude,
                radius_meters=quadrant_radius_meters,
            )
            poi_summary = summarize_pois(pois).to_dict()
        except requests.RequestException:
            poi_summary = {"error": "quadrant_request_failed"}

    status = normalize_text(listing.listing_status)
    extracted_status = normalize_text(extracted.get("status") if isinstance(extracted.get("status"), str) else None)
    if not status:
        status = extracted_status

    property_type = normalize_text(listing.property_type)
    extracted_property_type = normalize_text(
        extracted.get("property_type") if isinstance(extracted.get("property_type"), str) else None
    )
    if not property_type:
        property_type = extracted_property_type

    beds = listing.bedrooms if listing.bedrooms is not None else to_float(extracted.get("beds"))
    baths = listing.bathrooms if listing.bathrooms is not None else to_float(extracted.get("baths"))
    sqft = listing.sqft if listing.sqft is not None else to_int(extracted.get("sqft"))

    return CanonicalListing(
        source=listing.source,
        source_listing_id=listing.source_id,
        mls_id=_extract_mls_id(listing.raw),
        status=status,
        price=listing.price_usd,
        beds=beds,
        baths=baths,
        sqft=sqft,
        lot_sqft=lot_sqft,
        property_type=property_type,
        address_raw=address_raw,
        address_norm=address_norm or None,
        unit=_extract_unit(address_raw),
        city=city,
        zip=postal_code or None,
        lat=listing.latitude,
        lon=listing.longitude,
        geohash=geohash,
        listed_date=listed_date,
        updated_at=updated_at,
        description=description,
        key_features=key_features,
        open_house_times=open_house_times,
        url=listing.source_url,
        photo_urls=photo_urls,
        geo_qa_flags=geo_flags,
        poi_summary=poi_summary,
        raw=listing.raw,
    )
