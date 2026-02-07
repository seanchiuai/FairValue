from __future__ import annotations

import re
from typing import Any


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.-]", "", value)
        if cleaned in {"", "-", ".", "-."}:
            return None
        try:
            return int(float(cleaned))
        except ValueError:
            return None
    return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.-]", "", value)
        if cleaned in {"", "-", ".", "-."}:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = re.sub(r"\s+", " ", value).strip()
    return stripped or None

