from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class Listing:
    source: str
    source_id: str
    source_url: str | None
    title: str | None
    address: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    price_usd: int | None
    bedrooms: float | None
    bathrooms: float | None
    sqft: int | None
    property_type: str | None
    latitude: float | None
    longitude: float | None
    listing_status: str | None
    raw: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        row = asdict(self)
        row["scraped_at"] = datetime.now(timezone.utc).isoformat()
        return row

