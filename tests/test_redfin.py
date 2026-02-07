from __future__ import annotations

import json
from pathlib import Path

from sf_scraper.sources.redfin import parse_redfin_homes

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _load_redfin_text() -> str:
    return (FIXTURE_DIR / "redfin_gis_payload.txt").read_text()


def test_parse_redfin_from_real_payload_fixture() -> None:
    text = _load_redfin_text()
    listings = parse_redfin_homes(text)

    assert listings
    sample = listings[0]
    assert sample.source == "redfin"
    assert sample.source_id
    assert sample.source_url and sample.source_url.startswith("https://www.redfin.com/")
    assert sample.city == "San Francisco"
    assert sample.price_usd is not None and sample.price_usd > 0
    assert sample.latitude is not None
    assert sample.longitude is not None


def test_parse_redfin_filters_zero_price_and_outside_geofence() -> None:
    text = _load_redfin_text()
    parsed = json.loads(text[4:] if text.startswith("{}&&") else text)

    homes = parsed["payload"]["homes"]
    assert homes

    homes[0]["price"] = {"value": 0, "level": 1}
    homes[0]["streetLine"] = {"value": "Off-market fixer special", "level": 1}
    homes[1]["latLong"] = {"value": {"latitude": 37.8044, "longitude": -122.2711}, "level": 1}

    mutated = "{}&&" + json.dumps(parsed)
    listings = parse_redfin_homes(mutated)

    assert len(listings) == len(homes) - 2
