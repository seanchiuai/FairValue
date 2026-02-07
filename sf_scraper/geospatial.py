from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

from sf_scraper.quality import is_within_sf_geofence
from sf_scraper.utils import normalize_text, to_float

_GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"


@dataclass
class POISummary:
    total_within_radius: int
    poi_counts_500m: int
    poi_counts_1600m: int
    nearest_transit_m: float | None
    nearest_park_m: float | None
    nearest_grocery_m: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_within_radius": self.total_within_radius,
            "poi_counts_500m": self.poi_counts_500m,
            "poi_counts_1600m": self.poi_counts_1600m,
            "nearest_transit_m": self.nearest_transit_m,
            "nearest_park_m": self.nearest_park_m,
            "nearest_grocery_m": self.nearest_grocery_m,
        }


class QuadrantClient:
    """Small adapter around a configurable Quadrant-style nearby-POI endpoint."""

    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        timeout_seconds: int = 15,
        limit: int = 100,
    ) -> None:
        self.endpoint = endpoint
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.limit = limit

    def nearby_pois(self, *, lat: float, lon: float, radius_meters: int) -> list[dict[str, Any]]:
        response = requests.get(
            self.endpoint,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "sf-house-scraper/1.0",
            },
            params={
                "lat": lat,
                "lon": lon,
                "radius_meters": radius_meters,
                "limit": self.limit,
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()

        payload = response.json()
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]

        if not isinstance(payload, dict):
            return []

        for key in ("pois", "results", "data"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]

        return []


def encode_geohash(latitude: float, longitude: float, precision: int = 7) -> str:
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    geohash: list[str] = []

    bits = [16, 8, 4, 2, 1]
    bit = 0
    ch = 0
    even = True

    while len(geohash) < precision:
        if even:
            mid = (lon_interval[0] + lon_interval[1]) / 2
            if longitude >= mid:
                ch |= bits[bit]
                lon_interval[0] = mid
            else:
                lon_interval[1] = mid
        else:
            mid = (lat_interval[0] + lat_interval[1]) / 2
            if latitude >= mid:
                ch |= bits[bit]
                lat_interval[0] = mid
            else:
                lat_interval[1] = mid

        even = not even
        if bit < 4:
            bit += 1
            continue

        geohash.append(_GEOHASH_ALPHABET[ch])
        bit = 0
        ch = 0

    return "".join(geohash)


def _normalize_poi_distance_meters(poi: dict[str, Any]) -> float | None:
    for key in ("distance_m", "distance_meters", "distance"):
        distance = to_float(poi.get(key))
        if distance is not None:
            return distance
    return None


def summarize_pois(pois: list[dict[str, Any]]) -> POISummary:
    counts_500 = 0
    counts_1600 = 0

    nearest_transit: float | None = None
    nearest_park: float | None = None
    nearest_grocery: float | None = None

    for poi in pois:
        distance = _normalize_poi_distance_meters(poi)
        if distance is None:
            continue

        if distance <= 500:
            counts_500 += 1
        if distance <= 1600:
            counts_1600 += 1

        category = normalize_text(str(poi.get("category") or poi.get("type") or "")) or ""
        name = normalize_text(str(poi.get("name") or "")) or ""
        token_text = f"{category} {name}".lower()

        if any(token in token_text for token in ("transit", "station", "metro", "bart", "rail", "bus")):
            nearest_transit = distance if nearest_transit is None else min(nearest_transit, distance)

        if "park" in token_text:
            nearest_park = distance if nearest_park is None else min(nearest_park, distance)

        if any(token in token_text for token in ("grocery", "market", "supermarket", "whole foods", "trader joe")):
            nearest_grocery = distance if nearest_grocery is None else min(nearest_grocery, distance)

    return POISummary(
        total_within_radius=len(pois),
        poi_counts_500m=counts_500,
        poi_counts_1600m=counts_1600,
        nearest_transit_m=nearest_transit,
        nearest_park_m=nearest_park,
        nearest_grocery_m=nearest_grocery,
    )


def geo_qa_flags(*, lat: float | None, lon: float | None) -> list[str]:
    if lat is None or lon is None:
        return ["missing_coordinates"]
    if not is_within_sf_geofence(lat, lon):
        return ["outside_sf_geofence"]
    return []
