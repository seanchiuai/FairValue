from __future__ import annotations

import math
import re
from difflib import SequenceMatcher

from sf_scraper.utils import normalize_text, to_float, to_int

# A strict geofence that covers San Francisco city limits.
SF_LAT_MIN = 37.7070
SF_LAT_MAX = 37.8330
SF_LNG_MIN = -122.5160
SF_LNG_MAX = -122.3550

JUNK_TITLE_PATTERNS = [
    r"\bauction\b",
    r"\boff[\s-]?market\b",
    r"\bfixer\b",
    r"\bvacant\b",
    r"\bfire[\s-]?damaged\b",
    r"\binvest(or|ment)\b",
    r"\bwholesale\b",
    r"\bgreat\s+upside\b",
]

ZIP_TO_NEIGHBORHOOD = {
    "94102": "Civic Center / Tenderloin",
    "94103": "SoMa",
    "94104": "Financial District",
    "94105": "South Beach / Rincon Hill",
    "94107": "Potrero Hill / Dogpatch",
    "94108": "Chinatown",
    "94109": "Nob Hill / Russian Hill",
    "94110": "Mission District",
    "94111": "Financial District",
    "94112": "Ingleside / Oceanview",
    "94114": "Castro / Noe Valley",
    "94115": "Western Addition",
    "94116": "Sunset",
    "94117": "Haight-Ashbury",
    "94118": "Inner Richmond",
    "94121": "Outer Richmond",
    "94122": "Inner Sunset",
    "94123": "Marina",
    "94124": "Bayview",
    "94127": "West Portal",
    "94131": "Twin Peaks / Glen Park",
    "94132": "Lakeshore",
    "94133": "North Beach",
    "94134": "Visitacion Valley",
    "94158": "Mission Bay",
}

NEIGHBORHOOD_KEYWORDS = {
    "mission": "Mission District",
    "sunset": "Sunset",
    "richmond": "Richmond",
    "soma": "SoMa",
    "south of market": "SoMa",
    "noe valley": "Noe Valley",
    "castro": "Castro",
    "marina": "Marina",
    "north beach": "North Beach",
    "haight": "Haight-Ashbury",
    "potrero": "Potrero Hill",
    "bayview": "Bayview",
    "pac heights": "Pacific Heights",
    "pacific heights": "Pacific Heights",
    "russian hill": "Russian Hill",
    "nob hill": "Nob Hill",
    "mission bay": "Mission Bay",
    "outer sunset": "Outer Sunset",
    "inner sunset": "Inner Sunset",
    "outer richmond": "Outer Richmond",
    "inner richmond": "Inner Richmond",
}


def is_within_sf_geofence(latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return False
    return SF_LAT_MIN <= latitude <= SF_LAT_MAX and SF_LNG_MIN <= longitude <= SF_LNG_MAX


def is_obvious_junk_title(title: str | None) -> bool:
    normalized = (title or "").strip().lower()
    if not normalized:
        return False
    for pattern in JUNK_TITLE_PATTERNS:
        if re.search(pattern, normalized):
            return True
    return False


def passes_quality_filters(
    *,
    title: str | None,
    price_usd: int | None,
    latitude: float | None,
    longitude: float | None,
) -> bool:
    if price_usd is None or price_usd <= 0:
        return False
    if is_obvious_junk_title(title):
        return False
    if not is_within_sf_geofence(latitude, longitude):
        return False
    return True


def parse_missing_home_facts_from_text(text: str | None) -> tuple[float | None, float | None, int | None]:
    if not text:
        return None, None, None

    normalized = text.lower()

    bedrooms: float | None = None
    bathrooms: float | None = None
    sqft: int | None = None

    bed_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:bd|beds?|bedrooms?)\b", normalized)
    if bed_match:
        bedrooms = to_float(bed_match.group(1))

    bath_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:ba|baths?|bathrooms?)\b", normalized)
    if bath_match:
        bathrooms = to_float(bath_match.group(1))

    sqft_match = re.search(r"(\d[\d,\.]{2,})\s*(?:sq\s?ft|sqft|sf)\b", normalized)
    if sqft_match:
        sqft = to_int(sqft_match.group(1))

    return bedrooms, bathrooms, sqft


def normalized_zip(postal_code: str | None) -> str:
    if not postal_code:
        return ""
    match = re.search(r"(\d{5})", postal_code)
    return match.group(1) if match else ""


def normalize_address_for_key(address: str | None) -> str:
    text = normalize_text(address)
    if not text:
        return ""

    lowered = text.lower()
    lowered = re.sub(r"\b(?:apt|apartment|unit|suite|ste|#)\s*[a-z0-9-]+\b", "", lowered)
    lowered = re.sub(r"\s+#\s*[a-z0-9-]+\b", "", lowered)
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def fuzzy_address_ratio(address_a: str | None, address_b: str | None) -> float:
    left = normalize_address_for_key(address_a)
    right = normalize_address_for_key(address_b)
    if not left or not right:
        return 0.0
    return SequenceMatcher(a=left, b=right).ratio()


def metric_close(a: float | None, b: float | None, tolerance: float = 0.5) -> bool:
    if a is None or b is None:
        return True
    return abs(a - b) <= tolerance


def price_close(a: int | None, b: int | None, pct_tolerance: float = 0.1) -> bool:
    if a is None or b is None:
        return True
    if a <= 0 or b <= 0:
        return True
    max_price = max(a, b)
    return abs(a - b) / max_price <= pct_tolerance


def geo_distance_km(
    lat_a: float | None,
    lng_a: float | None,
    lat_b: float | None,
    lng_b: float | None,
) -> float | None:
    if None in {lat_a, lng_a, lat_b, lng_b}:
        return None

    lat1 = math.radians(float(lat_a))
    lon1 = math.radians(float(lng_a))
    lat2 = math.radians(float(lat_b))
    lon2 = math.radians(float(lng_b))

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    hav = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(hav))


def neighborhood_guess(address: str | None, title: str | None, postal_code: str | None) -> str | None:
    combined = " ".join(part for part in [address or "", title or ""] if part).lower()

    for token, neighborhood in NEIGHBORHOOD_KEYWORDS.items():
        if token in combined:
            return neighborhood

    zipcode = normalized_zip(postal_code)
    if zipcode and zipcode in ZIP_TO_NEIGHBORHOOD:
        return ZIP_TO_NEIGHBORHOOD[zipcode]

    return None
