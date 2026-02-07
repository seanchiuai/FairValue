from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sf_scraper.sources.zillow import parse_apify_dataset_items

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def test_parse_zillow_payload_fixture_and_filtering() -> None:
    items = json.loads((FIXTURE_DIR / "zillow_search_payload.json").read_text())

    listings = parse_apify_dataset_items(
        items,
        now=datetime(2026, 2, 7, tzinfo=timezone.utc),
        sold_within_days=30,
    )

    assert len(listings) == 2
    assert [item.source_id for item in listings] == ["10000001", "10000003"]
    assert all(item.listing_status in {"SOLD", "RECENTLY_SOLD"} for item in listings)

    parsed_from_title = listings[1]
    assert parsed_from_title.bedrooms == 3.0
    assert parsed_from_title.bathrooms == 2.0
    assert parsed_from_title.sqft == 1450
    assert parsed_from_title.property_type == "SINGLE_FAMILY"


def test_parse_zillow_blocked_html_gracefully_returns_empty() -> None:
    blocked = (FIXTURE_DIR / "zillow_blocked.html").read_text()

    listings = parse_apify_dataset_items([{"html": blocked}])

    assert listings == []


def test_parse_sparse_detail_payload_when_sold_status_not_required() -> None:
    details_payload = [
        {
            "zpid": 15104184,
            "detailUrl": "https://www.zillow.com/homedetails/1483-47th-Ave-San-Francisco-CA-94122/15104184_zpid/",
            "streetAddress": "1483 47th Ave",
            "city": "San Francisco",
            "state": "CA",
            "zipcode": "94122",
            "price": 799000,
            "bedrooms": 2,
            "bathrooms": 2,
            "livingArea": 1177,
            "homeType": "SINGLE_FAMILY",
            "homeStatus": "FOR_SALE",
            "latitude": 37.7608,
            "longitude": -122.5065,
        }
    ]

    listings = parse_apify_dataset_items(
        details_payload,
        now=datetime(2026, 2, 7, tzinfo=timezone.utc),
        sold_within_days=30,
        require_sold_status=False,
    )

    assert len(listings) == 1
    listing = listings[0]
    assert listing.price_usd == 799000
    assert listing.sqft == 1177
    assert listing.bedrooms == 2.0
    assert listing.bathrooms == 2.0
    assert listing.address == "1483 47th Ave"
    assert listing.source_url and "zillow.com/homedetails" in listing.source_url


def test_zillow_source_fetches_from_apify_actor(monkeypatch) -> None:
    from sf_scraper.sources.zillow import ZillowSanFranciscoSource

    payload = json.loads((FIXTURE_DIR / "zillow_search_payload.json").read_text())
    called_url: dict[str, str] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return payload

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, **kwargs):
            called_url["url"] = url
            return FakeResponse()

    monkeypatch.setattr("sf_scraper.sources.zillow.requests.Session", FakeSession)

    source = ZillowSanFranciscoSource(
        apify_token="token",
        apify_actor_id="propertyapi/zillow-property-lead-scraper",
        sold_within_days=30,
    )
    listings = source.fetch()

    assert "run-sync-get-dataset-items" in called_url["url"]
    assert len(listings) == 2


def test_zillow_source_enriches_sparse_lead_rows_with_details_actor(monkeypatch) -> None:
    from sf_scraper.sources.zillow import ZillowSanFranciscoSource

    lead_payload = [
        {
            "zpid": "15104184",
            "detailUrl": "https://www.zillow.com/homedetails/1483-47th-Ave-San-Francisco-CA-94122/15104184_zpid/",
        }
    ]
    details_payload = [
        {
            "zpid": 15104184,
            "detailUrl": "https://www.zillow.com/homedetails/1483-47th-Ave-San-Francisco-CA-94122/15104184_zpid/",
            "streetAddress": "1483 47th Ave",
            "city": "San Francisco",
            "state": "CA",
            "zipcode": "94122",
            "price": 799000,
            "bedrooms": 2,
            "bathrooms": 2,
            "livingArea": 1177,
            "homeType": "SINGLE_FAMILY",
            "homeStatus": "FOR_SALE",
            "latitude": 37.7608,
            "longitude": -122.5065,
        }
    ]
    called_urls: list[str] = []

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self):
            return self._payload

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, **kwargs):
            called_urls.append(url)
            if "propertyapi~zillow-property-lead-scraper" in url:
                return FakeResponse(lead_payload)
            if "mido_99~zillow-details-scraper" in url:
                return FakeResponse(details_payload)
            raise AssertionError(f"Unexpected actor URL: {url}")

    monkeypatch.setattr("sf_scraper.sources.zillow.requests.Session", FakeSession)

    source = ZillowSanFranciscoSource(
        apify_token="token",
        apify_actor_id="propertyapi/zillow-property-lead-scraper",
        apify_details_actor_id="mido_99/zillow-details-scraper",
        sold_within_days=30,
    )
    listings = source.fetch()

    assert len(listings) == 1
    assert listings[0].price_usd == 799000
    assert any("propertyapi~zillow-property-lead-scraper" in url for url in called_urls)
    assert any("mido_99~zillow-details-scraper" in url for url in called_urls)
