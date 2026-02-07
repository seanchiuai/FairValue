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
