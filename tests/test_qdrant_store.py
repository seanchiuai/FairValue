from __future__ import annotations

from dataclasses import dataclass

from sf_scraper.canonical import CanonicalListing
from sf_scraper.qdrant_store import QdrantConfig, QdrantListingStore, build_embedding_text, hash_embed_text


def _record() -> CanonicalListing:
    return CanonicalListing(
        source="zillow",
        source_listing_id="z-1",
        mls_id=None,
        status="SOLD",
        price=1_250_000,
        beds=2.0,
        baths=2.0,
        sqft=1100,
        lot_sqft=None,
        property_type="SINGLE_FAMILY",
        address_raw="123 Market St",
        address_norm="123 market st",
        unit=None,
        city="San Francisco",
        zip="94105",
        lat=37.7903,
        lon=-122.3966,
        geohash="9q8yyz98",
        listed_date=None,
        updated_at="2026-02-01T00:00:00+00:00",
        description="Sold single-family home with garage and views.",
        key_features=["garage", "view"],
        open_house_times=[],
        url="https://www.zillow.com/example",
        photo_urls=[],
        geo_qa_flags=[],
        poi_summary={},
        raw={"zpid": "z-1", "statusType": "SOLD", "soldDate": "2026-02-01"},
    )


def test_hash_embed_text_dimensions_and_norm() -> None:
    vector = hash_embed_text("123 market street sold home", dimensions=32)
    assert len(vector) == 32
    assert any(abs(value) > 0 for value in vector)
    norm = sum(value * value for value in vector) ** 0.5
    assert 0.99 <= norm <= 1.01


def test_build_embedding_text_contains_key_fields() -> None:
    text = build_embedding_text(_record())
    assert "SOLD" in text
    assert "SINGLE_FAMILY" in text
    assert "123 Market St" in text


def test_upsert_records_creates_collection_and_includes_raw_payload(monkeypatch) -> None:
    @dataclass
    class _CollectionInfo:
        name: str

    @dataclass
    class _Collections:
        collections: list[_CollectionInfo]

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            self.created_collection = False
            self.upsert_calls: list[list[object]] = []

        def get_collections(self) -> _Collections:
            return _Collections(collections=[])

        def create_collection(self, *args, **kwargs) -> None:
            self.created_collection = True

        def upsert(self, *, collection_name: str, points: list[object]) -> None:
            self.upsert_calls.append(points)

    monkeypatch.setattr("sf_scraper.qdrant_store.QdrantClient", FakeClient)

    store = QdrantListingStore(
        QdrantConfig(
            url="http://localhost:6333",
            collection_name="test_collection",
            vector_size=16,
        )
    )

    upserted = store.upsert_records([_record()])

    assert upserted == 1
    assert store.client.created_collection is True
    assert len(store.client.upsert_calls) == 1

    point = store.client.upsert_calls[0][0]
    payload = point.payload
    assert payload["raw"]["zpid"] == "z-1"
    assert payload["embedding_text"]
