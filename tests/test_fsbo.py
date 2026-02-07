from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sf_scraper.sources.fsbo import FsboSanFranciscoSource, parse_fsbo_listing

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _load_fsbo_fixture() -> dict[str, Any]:
    return json.loads((FIXTURE_DIR / "fsbo_search_payload.json").read_text())


def test_parse_fsbo_listing_from_real_fixture() -> None:
    fixture = _load_fsbo_fixture()
    first = fixture["data"]["listings"][0]

    listing = parse_fsbo_listing(first)

    assert listing.source == "forsalebyowner"
    assert listing.source_id
    assert listing.city == "San Francisco"
    assert listing.state == "CA"
    assert listing.postal_code
    assert listing.price_usd is not None and listing.price_usd > 0
    assert listing.latitude is not None
    assert listing.longitude is not None


def test_parse_fsbo_listing_falls_back_to_title_facts() -> None:
    item: dict[str, Any] = {
        "id": 123,
        "listingTitle": "2550 Baker Street | 5 Bedrooms | 4.5 Baths | 3,100 sqft",
        "address": {
            "fullStreetAddress": "2550 Baker Street",
            "city": "San Francisco",
            "stateOrProvince": "CA",
            "postalCode": "94123",
        },
        "listPrice": "$8,995,000",
        "bedrooms": None,
        "bathrooms": None,
        "livingArea": None,
        "listingStatus": "ACTIVE",
        "center": {"coordinates": [-122.4449, 37.7945]},
    }

    listing = parse_fsbo_listing(item)

    assert listing.bedrooms == 5.0
    assert listing.bathrooms == 4.5
    assert listing.sqft == 3100


def test_fetch_filters_price_junk_and_outside_geofence(monkeypatch) -> None:
    valid = {
        "id": "ok-1",
        "listingURL": "https://example.com/ok-1",
        "listingTitle": "Valid SF Listing",
        "address": {
            "fullStreetAddress": "123 Market St",
            "city": "San Francisco",
            "stateOrProvince": "CA",
            "postalCode": "94105",
        },
        "listPrice": "$1,200,000",
        "bedrooms": "2",
        "bathrooms": "2",
        "livingArea": "1200",
        "propertyType": "Condo",
        "listingStatus": "ACTIVE",
        "center": {"coordinates": [-122.3966, 37.7903]},
    }
    zero_price = {
        **valid,
        "id": "junk-0",
        "listPrice": "$0",
        "listingTitle": "Off-market fixer available",
    }
    outside_sf = {
        **valid,
        "id": "junk-1",
        "address": {
            "fullStreetAddress": "999 Broadway",
            "city": "Oakland",
            "stateOrProvince": "CA",
            "postalCode": "94607",
        },
        "center": {"coordinates": [-122.2711, 37.8044]},
    }

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "success": True,
                "data": {
                    "listings": [valid, zero_price, outside_sf],
                    "paging": {"totalPageCount": 1},
                },
            }

    class FakeSession:
        def __init__(self) -> None:
            self.headers: dict[str, str] = {}

        def __enter__(self) -> "FakeSession":
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr("sf_scraper.sources.fsbo.requests.Session", FakeSession)

    source = FsboSanFranciscoSource(slug="san-francisco", page_limit=1, per_page=10)
    listings = source.fetch()

    assert [item.source_id for item in listings] == ["ok-1"]
