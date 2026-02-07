# SF Sold-House Scraper

Zillow-only pipeline for **San Francisco houses sold in the last month**, using a ready-made **Apify actor** for scraping.

## What it does

1. Runs an Apify actor (default: `propertyapi/zillow-property-lead-scraper`) against Zillow.
2. Keeps only rows that are:
   - sold (`SOLD` / `RECENTLY_SOLD`)
   - sold within the configured lookback window (default 30 days)
   - house type (`SINGLE_FAMILY` / `HOUSE`)
   - inside strict SF geofence
3. Deduplicates records.
4. Maps data into canonical listing schema.
5. Stores outputs to:
   - JSON and CSV files
   - SQLite history tables
   - Qdrant collection with:
     - raw canonical payload
     - vector embedding per listing

## Quick start

```bash
cd /Users/rishabhbansal/Documents/web-scaper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export APIFY_TOKEN=your_apify_token
python -m sf_scraper
```

Default outputs:

- `/Users/rishabhbansal/Documents/web-scaper/data/sf_listings.json`
- `/Users/rishabhbansal/Documents/web-scaper/data/sf_listings.csv`
- `/Users/rishabhbansal/Documents/web-scaper/data/sf_listings.sqlite`

Default Qdrant target:

- URL: `http://localhost:6333`
- Collection: `sf_zillow_sold_houses`
- Vector size: `256`

## CLI usage

```bash
python -m sf_scraper \
  --sources zillow \
  --zillow-sold-within-days 30 \
  --apify-token "$APIFY_TOKEN" \
  --apify-actor-id propertyapi/zillow-property-lead-scraper \
  --apify-search-url https://www.zillow.com/san-francisco-ca/sold/ \
  --qdrant-url http://localhost:6333 \
  --qdrant-collection sf_zillow_sold_houses \
  --qdrant-vector-size 256
```

Optional actor input override (for actor-specific knobs):

```bash
python -m sf_scraper \
  --apify-token "$APIFY_TOKEN" \
  --apify-actor-id propertyapi/zillow-property-lead-scraper \
  --apify-input-json '{"url_list":["https://www.zillow.com/san-francisco-ca/sold/"]}'
```

Optional extractor and enrichment controls still supported:

- `--extractor-mode heuristic|hybrid|distil`
- `--distil-command ...`
- `--enable-quadrant-poi ...`

## Notes

- An Apify token is required.
- Actor output shape can vary by actor. This code normalizes common Zillow-style fields and then enforces SF/sold/house/date filters locally.
- CSV omits `raw`; JSON includes `raw`.
- SQLite tables:
  - `listing_history`
  - `listing_snapshots`
  - `current_listings`

## Testing

```bash
cd /Users/rishabhbansal/Documents/web-scaper
source .venv/bin/activate
pytest -q
```
