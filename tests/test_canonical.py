from __future__ import annotations

from sf_scraper.canonical import canonical_key, to_canonical_listing
from sf_scraper.extractors import HeuristicExtractor
from sf_scraper.models import Listing


def test_to_canonical_listing_maps_contract_fields() -> None:
    listing = Listing(
        source="redfin",
        source_id="abc123",
        source_url="https://www.redfin.com/CA/San-Francisco/123-Market-St-94105/home/123",
        title="123 Market St 2 bed 2 bath 1,200 sqft",
        address="123 Market St #4",
        city="San Francisco",
        state="CA",
        postal_code="94105",
        price_usd=1_250_000,
        bedrooms=None,
        bathrooms=None,
        sqft=None,
        property_type="Condo",
        latitude=37.7903,
        longitude=-122.3966,
        listing_status="Active",
        raw={
            "mlsId": "MLS-123",
            "listingDate": "2026-02-01",
            "updatedDate": "2026-02-05",
            "listingDescription": "Great unit with garage, in-unit laundry and EV charger.",
            "openHouses": [{"displayTime": "Sun 1-4 PM"}],
            "photos": [{"url": "https://img.example.com/1.jpg"}],
        },
    )

    record = to_canonical_listing(
        listing,
        extractor=HeuristicExtractor(),
        quadrant_client=None,
        quadrant_radius_meters=1200,
    )

    assert record.source == "redfin"
    assert record.source_listing_id == "abc123"
    assert record.mls_id == "MLS-123"
    assert record.status == "Active"
    assert record.price == 1_250_000
    assert record.beds == 2.0
    assert record.baths == 2.0
    assert record.sqft == 1200
    assert record.address_norm == "123 market st"
    assert record.unit == "4"
    assert record.zip == "94105"
    assert record.geohash
    assert record.listed_date == "2026-02-01"
    assert record.updated_at == "2026-02-05"
    assert record.open_house_times == ["Sun 1-4 PM"]
    assert record.photo_urls == ["https://img.example.com/1.jpg"]
    assert "garage" in record.key_features
    assert record.poi_summary == {}
    assert canonical_key(record).startswith("addr:123 market st|zip:94105")
