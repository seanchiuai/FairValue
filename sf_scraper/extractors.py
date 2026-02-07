from __future__ import annotations

import json
import re
import shlex
import subprocess
from dataclasses import dataclass
from typing import Any, Protocol

from sf_scraper.utils import normalize_text, to_float, to_int

_FEATURE_PATTERNS = {
    "garage": r"\bgarage\b",
    "ev_charger": r"\bev\s?charger\b",
    "in_unit_laundry": r"\bin[-\s]?unit\s+laundry\b",
    "fireplace": r"\bfireplace\b",
    "hardwood_floors": r"\bhardwood\b",
    "view": r"\bview(s)?\b",
    "parking": r"\bparking\b",
    "updated_kitchen": r"\b(updated|renovated)\s+kitchen\b",
    "new_construction": r"\bnew\s+construction\b",
    "backyard": r"\bbackyard\b",
}


class ListingExtractor(Protocol):
    def extract(self, *, text: str, context: dict[str, Any]) -> dict[str, Any]:
        """Extract structured fields from unstructured listing content."""


@dataclass
class HeuristicExtractor:
    def extract(self, *, text: str, context: dict[str, Any]) -> dict[str, Any]:
        normalized = text.lower()

        beds = None
        baths = None
        sqft = None
        lot_sqft = None

        bed_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:bd|beds?|bedrooms?)\b", normalized)
        if bed_match:
            beds = to_float(bed_match.group(1))

        bath_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:ba|baths?|bathrooms?)\b", normalized)
        if bath_match:
            baths = to_float(bath_match.group(1))

        sqft_match = re.search(r"(\d[\d,\.]{2,})\s*(?:sq\s?ft|sqft|sf)\b", normalized)
        if sqft_match:
            sqft = to_int(sqft_match.group(1))

        lot_match = re.search(r"lot\s*(?:size)?\s*[:\-]?\s*(\d[\d,\.]{2,})\s*(?:sq\s?ft|sqft|sf)?", normalized)
        if lot_match:
            lot_sqft = to_int(lot_match.group(1))

        extracted_features: list[str] = []
        for name, pattern in _FEATURE_PATTERNS.items():
            if re.search(pattern, normalized):
                extracted_features.append(name)

        status = None
        if re.search(r"\b(active|for sale|new listing)\b", normalized):
            status = "Active"
        elif re.search(r"\b(pending|under contract)\b", normalized):
            status = "Pending"
        elif re.search(r"\b(sold|closed)\b", normalized):
            status = "Sold"

        property_type = None
        if re.search(r"\b(condo|minium)?\b", normalized):
            property_type = "Condo"
        elif re.search(r"\b(single\s+family|house)\b", normalized):
            property_type = "Single Family"
        elif re.search(r"\b(townhome|townhouse)\b", normalized):
            property_type = "Townhouse"
        elif re.search(r"\b(multi[-\s]?family|duplex|triplex|fourplex)\b", normalized):
            property_type = "Multi Family"

        return {
            "beds": beds,
            "baths": baths,
            "sqft": sqft,
            "lot_sqft": lot_sqft,
            "status": status,
            "property_type": property_type,
            "key_features": extracted_features,
            "description": normalize_text(text),
        }


@dataclass
class DistilCommandExtractor:
    command: str
    timeout_seconds: int = 45

    def extract(self, *, text: str, context: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "text": text,
            "context": context,
        }

        completed = subprocess.run(  # noqa: S603
            shlex.split(self.command),
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            timeout=self.timeout_seconds,
            check=False,
        )

        if completed.returncode != 0:
            raise RuntimeError(
                "Distil extraction command failed "
                f"(exit={completed.returncode}): {completed.stderr.strip()}"
            )

        stdout = completed.stdout.strip()
        if not stdout:
            raise RuntimeError("Distil extraction command returned empty output.")

        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Distil extraction command returned invalid JSON.") from exc

        if not isinstance(parsed, dict):
            raise RuntimeError("Distil extraction response must be a JSON object.")

        return parsed


@dataclass
class HybridExtractor:
    fallback: ListingExtractor
    primary: ListingExtractor | None = None

    def extract(self, *, text: str, context: dict[str, Any]) -> dict[str, Any]:
        if self.primary is not None:
            try:
                result = self.primary.extract(text=text, context=context)
                if isinstance(result, dict) and result:
                    return result
            except Exception:
                pass
        return self.fallback.extract(text=text, context=context)
