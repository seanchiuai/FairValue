from __future__ import annotations

from sf_scraper.cli import parse_sources, run_scrape
from sf_scraper.models import Listing


def _listing(
    source: str,
    source_id: str,
    address: str,
    price: int,
    latitude: float = 37.7903,
    longitude: float = -122.3966,
) -> Listing:
    return Listing(
        source=source,
        source_id=source_id,
        source_url=None,
        title=None,
        address=address,
        city="San Francisco",
        state="CA",
        postal_code="94105",
        price_usd=price,
        bedrooms=2.0,
        bathrooms=2.0,
        sqft=1200,
        property_type=None,
        latitude=latitude,
        longitude=longitude,
        listing_status=None,
        raw={},
    )


def test_parse_sources_valid_and_invalid() -> None:
    assert parse_sources("zillow") == ["zillow"]

    try:
        parse_sources("fsbo")
    except ValueError as exc:
        assert "Unsupported sources" in str(exc)
    else:
        raise AssertionError("Expected ValueError for invalid source")


def test_run_scrape_collects_deduplicates_and_alerts(monkeypatch) -> None:
    class FakeZillow:
        minimum_expected_count = 2

        def __init__(self, *args, **kwargs) -> None:
            pass

        def fetch(self):
            return [
                _listing("zillow", "x", "100 Main St", 1_000_000),
                _listing("zillow", "x", "100 Main St", 1_000_000),
            ]

    monkeypatch.setattr("sf_scraper.cli.ZillowSanFranciscoSource", FakeZillow)

    result = run_scrape(
        sources=["zillow"],
        zillow_page_limit=1,
        zillow_timeout=5,
        min_expected_zillow=2,
        zillow_sold_within_days=30,
        apify_token="token",
        apify_actor_id="propertyapi/zillow-property-lead-scraper",
        apify_search_url="https://www.zillow.com/san-francisco-ca/sold/",
        apify_actor_input=None,
    )

    assert result.by_source["zillow"] == 2
    assert len(result.listings) == 1
    assert result.errors == {}
    assert result.alerts == {}
