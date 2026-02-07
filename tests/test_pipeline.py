from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from sf_scraper.canonical import canonical_key
from sf_scraper.models import Listing
from sf_scraper.pipeline import (
    build_canonical_key,
    build_canonical_records,
    deduplicate,
    export_csv,
    export_json,
    persist_history,
)


def _listing(
    *,
    source: str,
    source_id: str,
    address: str | None,
    postal_code: str,
    price: int | None,
    beds: float | None,
    baths: float | None,
    sqft: int | None,
    lat: float,
    lng: float,
    title: str | None = None,
) -> Listing:
    return Listing(
        source=source,
        source_id=source_id,
        source_url=None,
        title=title,
        address=address,
        city="San Francisco",
        state="CA",
        postal_code=postal_code,
        price_usd=price,
        bedrooms=beds,
        bathrooms=baths,
        sqft=sqft,
        property_type=None,
        latitude=lat,
        longitude=lng,
        listing_status="Active",
        raw={"source": source, "listingDescription": "Great home with garage and parking"},
    )


def test_deduplicate_uses_canonical_and_fuzzy_matching() -> None:
    rows = [
        _listing(
            source="redfin",
            source_id="r1",
            address="123 Market St Unit 4",
            postal_code="94105",
            price=1_200_000,
            beds=2.0,
            baths=2.0,
            sqft=1200,
            lat=37.7903,
            lng=-122.3966,
        ),
        _listing(
            source="zillow",
            source_id="z1",
            address="123 Market Street #4",
            postal_code="94105",
            price=1_210_000,
            beds=2.0,
            baths=2.0,
            sqft=None,
            lat=37.79029,
            lng=-122.39659,
        ),
        _listing(
            source="forsalebyowner",
            source_id="f1",
            address="200 Main St",
            postal_code="94105",
            price=950_000,
            beds=1.0,
            baths=1.0,
            sqft=850,
            lat=37.789,
            lng=-122.394,
        ),
    ]

    deduped = deduplicate(rows)

    assert len(deduped) == 2
    assert any(item.source_id == "r1" for item in deduped)
    assert any(item.source_id == "f1" for item in deduped)


def test_export_json_and_csv_shape(tmp_path) -> None:
    rows = [
        _listing(
            source="redfin",
            source_id="1",
            address="123 Market St",
            postal_code="94105",
            price=1_200_000,
            beds=2.0,
            baths=2.0,
            sqft=1200,
            lat=37.7903,
            lng=-122.3966,
            title="123 Market St, San Francisco, CA 94105",
        )
    ]
    canonical = build_canonical_records(rows)
    json_path = tmp_path / "out.json"
    csv_path = tmp_path / "out.csv"

    export_json(canonical, json_path)
    export_csv(canonical, csv_path)

    loaded = json.loads(json_path.read_text())
    assert loaded[0]["source"] == "redfin"
    assert loaded[0]["raw"]["source"] == "redfin"
    assert loaded[0]["price"] == 1_200_000
    assert loaded[0]["geohash"]
    assert loaded[0]["address_norm"] == "123 market st"

    csv_text = csv_path.read_text()
    header = csv_text.splitlines()[0]
    columns = header.split(",")
    assert "source" in columns
    assert "source_listing_id" in columns
    assert "raw" not in columns
    assert "geohash" in columns
    assert "poi_summary" in columns


def test_persist_history_tracks_first_last_seen_and_price_history(tmp_path) -> None:
    db_path = tmp_path / "history.sqlite"
    base_listing = _listing(
        source="redfin",
        source_id="x1",
        address="123 Market St",
        postal_code="94105",
        price=1_200_000,
        beds=2.0,
        baths=2.0,
        sqft=1200,
        lat=37.7903,
        lng=-122.3966,
        title="123 Market St",
    )

    base_record = build_canonical_records([base_listing])[0]
    persist_history([base_record], db_path)

    updated_listing = _listing(
        source="redfin",
        source_id="x1",
        address="123 Market St",
        postal_code="94105",
        price=1_180_000,
        beds=2.0,
        baths=2.0,
        sqft=1200,
        lat=37.7903,
        lng=-122.3966,
        title="123 Market St",
    )
    updated_record = build_canonical_records([updated_listing])[0]
    persist_history([updated_record], db_path)

    key = canonical_key(base_record)
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT first_seen, last_seen, price_history FROM listing_history WHERE canonical_key = ?",
            (key,),
        ).fetchone()
        assert row is not None

        first_seen, last_seen, price_history_raw = row
        assert datetime.fromisoformat(first_seen)
        assert datetime.fromisoformat(last_seen)
        assert datetime.fromisoformat(last_seen) >= datetime.fromisoformat(first_seen)

        price_history = json.loads(price_history_raw)
        assert len(price_history) == 2
        assert price_history[0]["price"] == 1_200_000
        assert price_history[1]["price"] == 1_180_000

        snapshots = conn.execute(
            "SELECT COUNT(*) FROM listing_snapshots WHERE canonical_key = ?",
            (key,),
        ).fetchone()
        assert snapshots is not None
        assert snapshots[0] >= 2

        current = conn.execute(
            "SELECT geohash, price FROM current_listings WHERE canonical_key = ?",
            (key,),
        ).fetchone()
        assert current is not None
        assert current[0]
        assert current[1] == 1_180_000


def test_build_canonical_key_still_available_for_raw_listing_dedupe() -> None:
    listing = _listing(
        source="redfin",
        source_id="k1",
        address="456 Pine St",
        postal_code="94108",
        price=900_000,
        beds=1.0,
        baths=1.0,
        sqft=700,
        lat=37.792,
        lng=-122.409,
    )

    key = build_canonical_key(listing)
    assert key.startswith("addr:456 pine st|zip:94108")
