from __future__ import annotations

import hashlib
import math
import re
import uuid
from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models

from sf_scraper.canonical import CanonicalListing, canonical_key
from sf_scraper.utils import normalize_text


def build_embedding_text(record: CanonicalListing) -> str:
    parts = [
        record.status,
        record.property_type,
        record.address_raw,
        record.city,
        record.zip,
        record.description,
        " ".join(record.key_features),
        " ".join(record.open_house_times),
        str(record.price) if record.price is not None else None,
        str(record.beds) if record.beds is not None else None,
        str(record.baths) if record.baths is not None else None,
        str(record.sqft) if record.sqft is not None else None,
    ]
    return "\n".join(part for part in (normalize_text(item) for item in parts) if part)


def hash_embed_text(text: str, *, dimensions: int) -> list[float]:
    if dimensions <= 0:
        raise ValueError("Embedding dimensions must be a positive integer.")

    vector = [0.0] * dimensions
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], byteorder="big", signed=False) % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0)
        vector[idx] += sign * weight

    norm = math.sqrt(sum(value * value for value in vector))
    if norm > 0:
        vector = [value / norm for value in vector]
    return vector


def qdrant_point_id(record: CanonicalListing) -> str:
    key = canonical_key(record)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def build_payload(record: CanonicalListing, *, embedding_text: str) -> dict[str, Any]:
    payload = record.to_dict(include_raw=True)
    payload["canonical_key"] = canonical_key(record)
    payload["embedding_text"] = embedding_text
    return payload


@dataclass
class QdrantConfig:
    url: str
    collection_name: str
    vector_size: int = 256
    api_key: str | None = None
    timeout_seconds: int = 30


class QdrantListingStore:
    def __init__(self, config: QdrantConfig) -> None:
        self.config = config
        self.client = QdrantClient(
            url=config.url,
            api_key=config.api_key,
            timeout=config.timeout_seconds,
        )

    def ensure_collection(self) -> None:
        collections = self.client.get_collections().collections
        if self.config.collection_name in {item.name for item in collections}:
            return

        self.client.create_collection(
            collection_name=self.config.collection_name,
            vectors_config=models.VectorParams(
                size=self.config.vector_size,
                distance=models.Distance.COSINE,
            ),
        )

    def upsert_records(self, records: list[CanonicalListing]) -> int:
        if not records:
            return 0

        self.ensure_collection()
        points: list[models.PointStruct] = []
        for record in records:
            embedding_text = build_embedding_text(record)
            points.append(
                models.PointStruct(
                    id=qdrant_point_id(record),
                    vector=hash_embed_text(embedding_text, dimensions=self.config.vector_size),
                    payload=build_payload(record, embedding_text=embedding_text),
                )
            )

        batch_size = 100
        for start in range(0, len(points), batch_size):
            self.client.upsert(
                collection_name=self.config.collection_name,
                points=points[start : start + batch_size],
            )
        return len(points)
