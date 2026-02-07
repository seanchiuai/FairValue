from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sf_scraper.extractors import DistilCommandExtractor, HeuristicExtractor, HybridExtractor, ListingExtractor
from sf_scraper.geospatial import QuadrantClient
from sf_scraper.models import Listing
from sf_scraper.pipeline import (
    build_canonical_records,
    deduplicate,
    export_csv,
    export_json,
    persist_history,
)
from sf_scraper.qdrant_store import QdrantConfig, QdrantListingStore
from sf_scraper.sources.zillow import ZillowSanFranciscoSource


@dataclass
class ScrapeResult:
    listings: list[Listing]
    by_source: dict[str, int]
    errors: dict[str, str]
    alerts: dict[str, str]


def run_scrape(
    *,
    sources: list[str],
    zillow_page_limit: int,
    zillow_timeout: int,
    min_expected_zillow: int,
    zillow_sold_within_days: int,
    apify_token: str,
    apify_actor_id: str,
    apify_search_url: str,
    apify_actor_input: dict[str, Any] | None,
) -> ScrapeResult:
    raw_listings: list[Listing] = []
    by_source: dict[str, int] = {}
    errors: dict[str, str] = {}
    alerts: dict[str, str] = {}

    adapters = {
        "zillow": ZillowSanFranciscoSource(
            page_limit=zillow_page_limit,
            timeout_seconds=zillow_timeout,
            minimum_expected_count=min_expected_zillow,
            sold_within_days=zillow_sold_within_days,
            apify_token=apify_token,
            apify_actor_id=apify_actor_id,
            apify_search_url=apify_search_url,
            apify_actor_input=apify_actor_input,
        ),
    }

    for source_name in sources:
        adapter = adapters[source_name]
        try:
            source_listings = adapter.fetch()
            by_source[source_name] = len(source_listings)
            raw_listings.extend(source_listings)

            if len(source_listings) < adapter.minimum_expected_count:
                alerts[source_name] = (
                    "Listing volume below minimum expected count "
                    f"({len(source_listings)} < {adapter.minimum_expected_count})."
                )
        except Exception as exc:  # noqa: BLE001 - keep CLI resilient for multi-source scraping.
            errors[source_name] = str(exc)
            by_source[source_name] = 0

    return ScrapeResult(
        listings=deduplicate(raw_listings),
        by_source=by_source,
        errors=errors,
        alerts=alerts,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sf-house-scraper",
        description="Scrape Zillow sold-house listings for San Francisco only.",
    )
    parser.add_argument(
        "--sources",
        default="zillow",
        help="Comma-separated source list. Allowed value: zillow",
    )
    parser.add_argument(
        "--output-dir",
        default="data",
        help="Directory for output files (default: data).",
    )
    parser.add_argument(
        "--json-file",
        default="sf_listings.json",
        help="JSON filename inside output-dir (default: sf_listings.json).",
    )
    parser.add_argument(
        "--csv-file",
        default="sf_listings.csv",
        help="CSV filename inside output-dir (default: sf_listings.csv).",
    )
    parser.add_argument(
        "--sqlite-file",
        default="sf_listings.sqlite",
        help="SQLite filename inside output-dir for history snapshots (default: sf_listings.sqlite).",
    )

    parser.add_argument(
        "--extractor-mode",
        choices=["heuristic", "hybrid", "distil"],
        default="hybrid",
        help="Unstructured extraction strategy for canonical records (default: hybrid).",
    )
    parser.add_argument(
        "--distil-command",
        default=os.getenv("DISTIL_EXTRACT_COMMAND", ""),
        help="Command to run Distil extraction (JSON in stdin, JSON object on stdout).",
    )
    parser.add_argument(
        "--distil-timeout",
        type=int,
        default=45,
        help="Timeout in seconds for distil command execution (default: 45).",
    )

    parser.add_argument(
        "--enable-quadrant-poi",
        action="store_true",
        help="Enable Quadrant POI enrichment for each canonical listing.",
    )
    parser.add_argument(
        "--quadrant-endpoint",
        default=os.getenv("QUADRANT_POI_ENDPOINT", ""),
        help="Quadrant nearby-POI endpoint URL.",
    )
    parser.add_argument(
        "--quadrant-api-key",
        default=os.getenv("QUADRANT_API_KEY", ""),
        help="Quadrant API key.",
    )
    parser.add_argument(
        "--quadrant-timeout",
        type=int,
        default=15,
        help="Timeout in seconds for Quadrant POI calls (default: 15).",
    )
    parser.add_argument(
        "--quadrant-radius-meters",
        type=int,
        default=1200,
        help="POI search radius in meters for Quadrant enrichment (default: 1200).",
    )

    parser.add_argument(
        "--zillow-sold-within-days",
        type=int,
        default=30,
        help="Only include Zillow homes sold within this many days (default: 30).",
    )
    parser.add_argument(
        "--apify-token",
        default=os.getenv("APIFY_TOKEN", ""),
        help="Apify API token (or set APIFY_TOKEN).",
    )
    parser.add_argument(
        "--apify-actor-id",
        default=os.getenv("APIFY_ACTOR_ID", "propertyapi/zillow-property-lead-scraper"),
        help="Apify actor id in user/actor or user~actor format.",
    )
    parser.add_argument(
        "--apify-search-url",
        default=os.getenv("APIFY_SEARCH_URL", "https://www.zillow.com/san-francisco-ca/sold/"),
        help="Zillow search URL passed to the actor when actor input is not provided.",
    )
    parser.add_argument(
        "--apify-input-json",
        default=os.getenv("APIFY_INPUT_JSON", ""),
        help="Optional raw JSON object for actor input. If omitted, a default input with apify-search-url is used.",
    )
    parser.add_argument(
        "--qdrant-url",
        default=os.getenv("QDRANT_URL", "http://localhost:6333"),
        help="Qdrant base URL for raw + vector listing storage (default: http://localhost:6333).",
    )
    parser.add_argument(
        "--qdrant-api-key",
        default=os.getenv("QDRANT_API_KEY", ""),
        help="Qdrant API key (optional).",
    )
    parser.add_argument(
        "--qdrant-collection",
        default=os.getenv("QDRANT_COLLECTION", "sf_zillow_sold_houses"),
        help="Qdrant collection name (default: sf_zillow_sold_houses).",
    )
    parser.add_argument(
        "--qdrant-vector-size",
        type=int,
        default=256,
        help="Embedding vector size for Qdrant points (default: 256).",
    )
    parser.add_argument(
        "--qdrant-timeout",
        type=int,
        default=30,
        help="Timeout in seconds for Qdrant operations (default: 30).",
    )

    parser.add_argument(
        "--zillow-page-limit",
        type=int,
        default=2,
        help="Compatibility option. Pagination is controlled by the Apify actor input.",
    )
    parser.add_argument(
        "--zillow-timeout",
        type=int,
        default=30,
        help="Timeout in seconds for Apify actor requests (default: 30).",
    )
    parser.add_argument(
        "--min-expected-zillow",
        type=int,
        default=20,
        help="Alert threshold for Zillow listing count (default: 20).",
    )
    return parser


def parse_sources(raw: str) -> list[str]:
    allowed = {"zillow"}
    parsed = [item.strip().lower() for item in raw.split(",") if item.strip()]
    parsed_unique = list(dict.fromkeys(parsed))
    unknown = sorted(set(parsed_unique) - allowed)
    if unknown:
        raise ValueError(f"Unsupported sources: {', '.join(unknown)}")
    if not parsed_unique:
        raise ValueError("At least one source is required.")
    return parsed_unique


def _parse_json_object(raw: str, *, option_name: str) -> dict[str, Any] | None:
    cleaned = raw.strip()
    if not cleaned:
        return None

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{option_name} must be valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{option_name} must be a JSON object.")
    return parsed


def _build_qdrant_store(args: argparse.Namespace) -> QdrantListingStore:
    vector_size = max(8, int(args.qdrant_vector_size))
    config = QdrantConfig(
        url=args.qdrant_url.strip(),
        api_key=args.qdrant_api_key.strip() or None,
        collection_name=args.qdrant_collection.strip() or "sf_zillow_sold_houses",
        vector_size=vector_size,
        timeout_seconds=max(5, int(args.qdrant_timeout)),
    )
    if not config.url:
        raise ValueError("--qdrant-url is required.")
    return QdrantListingStore(config)


def _build_extractor(args: argparse.Namespace) -> ListingExtractor:
    heuristic = HeuristicExtractor()
    distil_command = args.distil_command.strip()

    if args.extractor_mode == "heuristic":
        return heuristic

    if args.extractor_mode == "distil":
        if not distil_command:
            raise ValueError("--extractor-mode distil requires --distil-command.")
        return DistilCommandExtractor(command=distil_command, timeout_seconds=max(5, args.distil_timeout))

    # hybrid
    if distil_command:
        return HybridExtractor(
            primary=DistilCommandExtractor(command=distil_command, timeout_seconds=max(5, args.distil_timeout)),
            fallback=heuristic,
        )
    return heuristic


def _build_quadrant_client(args: argparse.Namespace) -> QuadrantClient | None:
    if not args.enable_quadrant_poi:
        return None

    endpoint = args.quadrant_endpoint.strip()
    api_key = args.quadrant_api_key.strip()
    if not endpoint or not api_key:
        raise ValueError("--enable-quadrant-poi requires --quadrant-endpoint and --quadrant-api-key.")

    return QuadrantClient(
        endpoint=endpoint,
        api_key=api_key,
        timeout_seconds=max(5, args.quadrant_timeout),
    )


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        sources = parse_sources(args.sources)
        extractor = _build_extractor(args)
        quadrant_client = _build_quadrant_client(args)
        apify_actor_input = _parse_json_object(args.apify_input_json, option_name="--apify-input-json")
        qdrant_store = _build_qdrant_store(args)
    except ValueError as exc:
        parser.error(str(exc))
        return 2

    apify_token = args.apify_token.strip()
    apify_actor_id = args.apify_actor_id.strip()
    apify_search_url = args.apify_search_url.strip()
    if not apify_token:
        parser.error("--apify-token is required (or set APIFY_TOKEN).")
        return 2
    if not apify_actor_id:
        parser.error("--apify-actor-id is required.")
        return 2
    if not apify_search_url and apify_actor_input is None:
        parser.error("--apify-search-url is required when --apify-input-json is not set.")
        return 2

    result = run_scrape(
        sources=sources,
        zillow_page_limit=max(1, args.zillow_page_limit),
        zillow_timeout=max(5, args.zillow_timeout),
        min_expected_zillow=max(0, args.min_expected_zillow),
        zillow_sold_within_days=max(1, args.zillow_sold_within_days),
        apify_token=apify_token,
        apify_actor_id=apify_actor_id,
        apify_search_url=apify_search_url,
        apify_actor_input=apify_actor_input,
    )

    canonical_records = build_canonical_records(
        result.listings,
        extractor=extractor,
        quadrant_client=quadrant_client,
        quadrant_radius_meters=max(50, args.quadrant_radius_meters),
    )

    output_dir = Path(args.output_dir)
    json_path = output_dir / args.json_file
    csv_path = output_dir / args.csv_file
    sqlite_path = output_dir / args.sqlite_file

    export_json(canonical_records, json_path)
    export_csv(canonical_records, csv_path)
    persist_history(canonical_records, sqlite_path)

    qdrant_error: str | None = None
    qdrant_points = 0
    try:
        qdrant_points = qdrant_store.upsert_records(canonical_records)
    except Exception as exc:  # noqa: BLE001 - surfacing Qdrant write issues as CLI warnings.
        qdrant_error = str(exc)

    print("San Francisco scrape complete.")
    print(f"Total listings: {len(canonical_records)}")
    print(f"JSON: {json_path}")
    print(f"CSV: {csv_path}")
    print(f"SQLite: {sqlite_path}")
    print(f"Qdrant collection: {qdrant_store.config.collection_name} ({qdrant_points} points upserted)")
    for source, count in result.by_source.items():
        print(f"- {source}: {count}")

    if result.alerts:
        print("Alerts:")
        for source, alert in result.alerts.items():
            print(f"- {source}: {alert}")

    if result.errors:
        print("Warnings:")
        for source, err in result.errors.items():
            print(f"- {source}: {err}")
    if qdrant_error:
        if not result.errors:
            print("Warnings:")
        print(f"- qdrant: {qdrant_error}")

    if len(result.errors) == len(sources) or qdrant_error is not None:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
