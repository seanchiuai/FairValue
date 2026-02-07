from __future__ import annotations

import csv
import json
import sqlite3
from dataclasses import asdict, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sf_scraper.canonical import CanonicalListing, canonical_key, to_canonical_listing
from sf_scraper.extractors import HeuristicExtractor, ListingExtractor
from sf_scraper.geospatial import QuadrantClient
from sf_scraper.models import Listing
from sf_scraper.quality import (
    fuzzy_address_ratio,
    geo_distance_km,
    metric_close,
    normalize_address_for_key,
    normalized_zip,
    price_close,
)

_LISTING_FIELD_NAMES = [field.name for field in fields(Listing)]
_SOURCE_QUALITY_PRIORITY = {
    "redfin": 3,
    "zillow": 2,
    "forsalebyowner": 1,
}


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _metric_key(value: float | None) -> str:
    if value is None:
        return "na"
    return f"{round(value * 2) / 2:.1f}"


def build_canonical_key(listing: Listing) -> str:
    normalized_address = normalize_address_for_key(listing.address or listing.title)
    zipcode = normalized_zip(listing.postal_code)
    beds_key = _metric_key(listing.bedrooms)
    baths_key = _metric_key(listing.bathrooms)

    if normalized_address and zipcode:
        return f"addr:{normalized_address}|zip:{zipcode}|beds:{beds_key}|baths:{baths_key}"

    if listing.latitude is not None and listing.longitude is not None:
        return (
            f"geo:{round(listing.latitude, 4)}:{round(listing.longitude, 4)}"
            f"|beds:{beds_key}|baths:{baths_key}"
        )

    if listing.source_id:
        return f"source:{listing.source}:{listing.source_id}"

    fallback_title = normalize_address_for_key(listing.title)
    return f"title:{fallback_title or 'unknown'}"


def _listing_quality_score(listing: Listing) -> int:
    populated_fields = sum(
        1
        for field_name in _LISTING_FIELD_NAMES
        if field_name != "raw" and not _is_missing(getattr(listing, field_name))
    )
    source_bonus = _SOURCE_QUALITY_PRIORITY.get(listing.source, 0)
    return populated_fields * 10 + source_bonus


def _merge_listing_records(existing: Listing, incoming: Listing) -> Listing:
    if _listing_quality_score(incoming) > _listing_quality_score(existing):
        preferred = incoming
        fallback = existing
    else:
        preferred = existing
        fallback = incoming

    merged: dict[str, Any] = {name: getattr(preferred, name) for name in _LISTING_FIELD_NAMES}
    for name in _LISTING_FIELD_NAMES:
        if name == "raw":
            continue
        if _is_missing(merged[name]):
            fallback_value = getattr(fallback, name)
            if not _is_missing(fallback_value):
                merged[name] = fallback_value

    if not isinstance(merged.get("raw"), dict) or not merged.get("raw"):
        merged["raw"] = fallback.raw

    return Listing(**merged)


def _is_fuzzy_duplicate(existing: Listing, incoming: Listing) -> bool:
    existing_zip = normalized_zip(existing.postal_code)
    incoming_zip = normalized_zip(incoming.postal_code)
    if existing_zip and incoming_zip and existing_zip != incoming_zip:
        return False

    if not metric_close(existing.bedrooms, incoming.bedrooms, tolerance=0.5):
        return False

    if not metric_close(existing.bathrooms, incoming.bathrooms, tolerance=0.5):
        return False

    if not price_close(existing.price_usd, incoming.price_usd, pct_tolerance=0.1):
        return False

    existing_address = existing.address or existing.title
    incoming_address = incoming.address or incoming.title
    ratio = fuzzy_address_ratio(existing_address, incoming_address)
    if ratio >= 0.92:
        return True

    distance_km = geo_distance_km(
        existing.latitude,
        existing.longitude,
        incoming.latitude,
        incoming.longitude,
    )
    if distance_km is not None and distance_km <= 0.12 and ratio >= 0.72:
        return True

    return False


def _find_fuzzy_duplicate_index(listings: list[Listing], incoming: Listing) -> int | None:
    for idx, existing in enumerate(listings):
        if _is_fuzzy_duplicate(existing, incoming):
            return idx
    return None


def deduplicate(listings: list[Listing]) -> list[Listing]:
    unique: list[Listing] = []
    seen_source_ids: set[tuple[str, str]] = set()
    exact_index: dict[str, int] = {}

    for listing in listings:
        source_key = (listing.source, listing.source_id)
        if listing.source_id and source_key in seen_source_ids:
            continue
        if listing.source_id:
            seen_source_ids.add(source_key)

        canonical = build_canonical_key(listing)
        if canonical in exact_index:
            idx = exact_index[canonical]
            unique[idx] = _merge_listing_records(unique[idx], listing)
            continue

        fuzzy_match_idx = _find_fuzzy_duplicate_index(unique, listing)
        if fuzzy_match_idx is not None:
            unique[fuzzy_match_idx] = _merge_listing_records(unique[fuzzy_match_idx], listing)
            merged_key = build_canonical_key(unique[fuzzy_match_idx])
            exact_index[merged_key] = fuzzy_match_idx
            continue

        unique.append(listing)
        exact_index[canonical] = len(unique) - 1

    return unique


def build_canonical_records(
    listings: list[Listing],
    *,
    extractor: ListingExtractor | None = None,
    quadrant_client: QuadrantClient | None = None,
    quadrant_radius_meters: int = 1200,
) -> list[CanonicalListing]:
    selected_extractor = extractor or HeuristicExtractor()
    return [
        to_canonical_listing(
            listing,
            extractor=selected_extractor,
            quadrant_client=quadrant_client,
            quadrant_radius_meters=quadrant_radius_meters,
        )
        for listing in listings
    ]


def _serialize_csv_value(value: Any) -> Any:
    if isinstance(value, (list, dict)):
        return json.dumps(value, separators=(",", ":"))
    return value


def export_json(records: list[CanonicalListing], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exported_at = datetime.now(timezone.utc).isoformat()
    rows = [record.to_dict(include_raw=True, exported_at=exported_at) for record in records]
    with path.open("w", encoding="utf-8") as fp:
        json.dump(rows, fp, indent=2)


def export_csv(records: list[CanonicalListing], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exported_at = datetime.now(timezone.utc).isoformat()
    rows = [record.to_dict(include_raw=False, exported_at=exported_at) for record in records]
    if not rows:
        with path.open("w", encoding="utf-8") as fp:
            fp.write("")
        return

    headers = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(fp, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _serialize_csv_value(value) for key, value in row.items()})


def persist_history(records: list[CanonicalListing], sqlite_path: Path) -> None:
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    seen_at = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(sqlite_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS listing_history (
                canonical_key TEXT PRIMARY KEY,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                price_history TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS listing_snapshots (
                canonical_key TEXT NOT NULL,
                seen_at TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                PRIMARY KEY (canonical_key, seen_at)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS current_listings (
                canonical_key TEXT PRIMARY KEY,
                geohash TEXT,
                lat REAL,
                lon REAL,
                status TEXT,
                price INTEGER,
                updated_at TEXT,
                record_json TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_current_listings_geohash ON current_listings(geohash)")

        for record in records:
            record_key = canonical_key(record)
            snapshot = record.to_dict(include_raw=True, exported_at=seen_at)
            snapshot_json = json.dumps(snapshot, separators=(",", ":"))

            conn.execute(
                """
                INSERT OR REPLACE INTO listing_snapshots (canonical_key, seen_at, snapshot_json)
                VALUES (?, ?, ?)
                """,
                (record_key, seen_at, snapshot_json),
            )

            conn.execute(
                """
                INSERT OR REPLACE INTO current_listings (
                    canonical_key,
                    geohash,
                    lat,
                    lon,
                    status,
                    price,
                    updated_at,
                    record_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_key,
                    record.geohash,
                    record.lat,
                    record.lon,
                    record.status,
                    record.price,
                    record.updated_at,
                    snapshot_json,
                ),
            )

            existing = conn.execute(
                """
                SELECT first_seen, price_history
                FROM listing_history
                WHERE canonical_key = ?
                """,
                (record_key,),
            ).fetchone()

            if existing is None:
                price_history: list[dict[str, Any]] = []
                if record.price is not None and record.price > 0:
                    price_history.append({"seen_at": seen_at, "price": record.price})

                conn.execute(
                    """
                    INSERT INTO listing_history (canonical_key, first_seen, last_seen, price_history)
                    VALUES (?, ?, ?, ?)
                    """,
                    (record_key, seen_at, seen_at, json.dumps(price_history)),
                )
                continue

            first_seen = str(existing[0])
            loaded_history = json.loads(str(existing[1]))
            if not isinstance(loaded_history, list):
                loaded_history = []

            if record.price is not None and record.price > 0:
                last_price = loaded_history[-1].get("price") if loaded_history else None
                if last_price != record.price:
                    loaded_history.append({"seen_at": seen_at, "price": record.price})

            conn.execute(
                """
                UPDATE listing_history
                SET first_seen = ?, last_seen = ?, price_history = ?
                WHERE canonical_key = ?
                """,
                (first_seen, seen_at, json.dumps(loaded_history), record_key),
            )

        conn.commit()
    finally:
        conn.close()
