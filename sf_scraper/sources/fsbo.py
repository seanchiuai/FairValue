from __future__ import annotations

import time
from typing import Any

import requests

from sf_scraper.models import Listing
from sf_scraper.quality import parse_missing_home_facts_from_text, passes_quality_filters
from sf_scraper.sources.base import SourceAdapter
from sf_scraper.utils import normalize_text, to_float, to_int

FSBO_SEARCH_URL = "https://directory.forsalebyowner.com/search/listings"
FSBO_DEFAULT_SLUGS = [
    "san-francisco-county-california",
    "san-francisco-california",
    "san-francisco-ca",
    "san-francisco",
]


def parse_fsbo_listing(item: dict[str, Any]) -> Listing:
    center = item.get("center") or {}
    coordinates = center.get("coordinates") or [None, None]
    longitude = to_float(coordinates[0]) if len(coordinates) > 0 else None
    latitude = to_float(coordinates[1]) if len(coordinates) > 1 else None

    address = item.get("address") or {}
    source_id = str(item.get("id") or item.get("sourceKey") or "")
    source_url = item.get("listingURL") or item.get("vendorUrl")

    title = normalize_text(item.get("listingTitle") or item.get("fullName"))
    bedrooms = to_float(item.get("bedrooms"))
    bathrooms = to_float(item.get("bathrooms"))
    sqft = to_int(item.get("livingArea"))

    parsed_beds, parsed_baths, parsed_sqft = parse_missing_home_facts_from_text(title)
    if bedrooms is None:
        bedrooms = parsed_beds
    if bathrooms is None:
        bathrooms = parsed_baths
    if sqft is None:
        sqft = parsed_sqft

    return Listing(
        source="forsalebyowner",
        source_id=source_id,
        source_url=normalize_text(source_url),
        title=title,
        address=normalize_text(address.get("fullStreetAddress")),
        city=normalize_text(address.get("city")),
        state=normalize_text(address.get("stateOrProvince")),
        postal_code=normalize_text(address.get("postalCode")),
        price_usd=to_int(item.get("listPrice")),
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        sqft=sqft,
        property_type=normalize_text(item.get("propertyType")),
        latitude=latitude,
        longitude=longitude,
        listing_status=normalize_text(item.get("listingStatus") or item.get("sourceStatus")),
        raw=item,
    )


class FsboSanFranciscoSource(SourceAdapter):
    source_name = "forsalebyowner"

    def __init__(
        self,
        slug: str | None = None,
        page_limit: int = 5,
        per_page: int = 50,
        timeout_seconds: int = 30,
        minimum_expected_count: int = 5,
        retry_attempts: int = 3,
    ) -> None:
        self.slugs = [slug] if slug else FSBO_DEFAULT_SLUGS
        self.page_limit = page_limit
        self.per_page = per_page
        self.timeout_seconds = timeout_seconds
        self.minimum_expected_count = minimum_expected_count
        self.retry_attempts = max(1, retry_attempts)

    def fetch(self) -> list[Listing]:
        for slug in self.slugs:
            listings = self._fetch_slug(slug)
            if listings:
                return listings
        return []

    def _fetch_slug(self, slug: str) -> list[Listing]:
        listings: list[Listing] = []
        with requests.Session() as session:
            session.headers.update({"User-Agent": "Mozilla/5.0"})
            for page in range(1, self.page_limit + 1):
                payload = {
                    "listing_search": {
                        "slug": slug,
                        "page": page,
                        "limit": self.per_page,
                    }
                }
                body = self._request_page(session=session, payload=payload)
                if not body.get("success"):
                    break

                page_listings = body.get("data", {}).get("listings", [])
                if not page_listings:
                    break

                for item in page_listings:
                    parsed = parse_fsbo_listing(item)
                    if not passes_quality_filters(
                        title=parsed.title,
                        price_usd=parsed.price_usd,
                        latitude=parsed.latitude,
                        longitude=parsed.longitude,
                    ):
                        continue
                    listings.append(parsed)

                paging = body.get("data", {}).get("paging", {})
                total_pages = to_int(paging.get("totalPageCount")) or page
                if page >= total_pages:
                    break

        return listings

    def _request_page(self, session: requests.Session, payload: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.retry_attempts):
            try:
                response = session.post(FSBO_SEARCH_URL, json=payload, timeout=self.timeout_seconds)
                response.raise_for_status()
                return response.json()
            except (requests.RequestException, ValueError) as exc:
                last_error = exc
                if attempt + 1 < self.retry_attempts:
                    time.sleep(1.0 * (2**attempt))
        if last_error is None:
            raise RuntimeError("FSBO request failed without a captured exception.")
        raise last_error
