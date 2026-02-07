from __future__ import annotations

from sf_scraper.geospatial import encode_geohash, geo_qa_flags, summarize_pois


def test_encode_geohash_for_sf_coordinate() -> None:
    value = encode_geohash(37.7749, -122.4194, precision=8)
    assert value == "9q8yyk8y"


def test_geo_qa_flags() -> None:
    assert geo_qa_flags(lat=None, lon=-122.4) == ["missing_coordinates"]
    assert geo_qa_flags(lat=37.80, lon=-122.27) == ["outside_sf_geofence"]
    assert geo_qa_flags(lat=37.7749, lon=-122.4194) == []


def test_summarize_pois() -> None:
    summary = summarize_pois(
        [
            {"distance_m": 200, "category": "park", "name": "Mission Creek Park"},
            {"distance_meters": 700, "category": "transit", "name": "BART Station"},
            {"distance": 1400, "category": "grocery", "name": "Trader Joe's"},
        ]
    )

    assert summary.total_within_radius == 3
    assert summary.poi_counts_500m == 1
    assert summary.poi_counts_1600m == 3
    assert summary.nearest_park_m == 200
    assert summary.nearest_transit_m == 700
    assert summary.nearest_grocery_m == 1400
