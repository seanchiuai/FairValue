from __future__ import annotations

import os

import pytest
import requests

from sf_scraper.sources.zillow import ZillowSanFranciscoSource


@pytest.mark.live
def test_live_sources_smoke() -> None:
    token = os.getenv("APIFY_TOKEN", "").strip()
    if not token:
        pytest.skip("Set APIFY_TOKEN to run live Apify smoke test.")

    zillow = ZillowSanFranciscoSource(
        page_limit=1,
        timeout_seconds=60,
        sold_within_days=30,
        apify_token=token,
    )

    try:
        zillow_rows = zillow.fetch()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        if response is not None and response.status_code in {401, 403, 429}:
            pytest.skip("Apify actor request blocked or unauthorized in this environment.")
        raise
    else:
        assert isinstance(zillow_rows, list)
