# FairValue

Real-time multiplayer real estate prediction market. Players bet on whether a property will appraise above or below its listing price using an LMSR automated market maker.

## How It Works

A host creates a room and selects a property. Players join via QR code or room code from their phones and place bets on whether the property's actual value is **over** or **under** the asking price. An LMSR (Logarithmic Market Scoring Rule) market maker provides infinite liquidity and continuous price discovery. An optional AI bot adds contrarian trading activity to keep markets liquid.

## Modes

- **Multiplayer** — Host creates a room at `/join`, gets a 4-character code using letters and numbers. Players scan QR or go to `/play/:roomCode` to bet from their phones with a local LMSR pre-bet read, reason to believe, reason to doubt, and wager-impact preview. Host views live dashboard at `/host/:roomCode` with chart, leaderboard, activity feed, phase/timer/lock controls, projector mode, and Live Room Intelligence generated from LMSR flow, players, recent bets, and optional Market Studio draft audit metadata.
- **Public bet reasoning** — Player bets can include an optional public thesis from the mobile betting panel. Reasons are cleared after a successful bet, replayed with the player position, shown in host activity, and carried into public recap/review surfaces.
- **Room and user reputation** — Settled rooms produce a `room-reputation/v1` summary from public bet history, public reason counts, final outcome accuracy, and Brier-style calibration. Signed-in players also accumulate a private `fairvalue.userReputation.v1` cross-room projection behind their user token, surfaced on the player room view after settlement and at `/me`. Public artifacts deliberately exclude session IDs, host/user tokens, and private evidence.
- **Private profile and watchlist** — `/me` shows the signed-in player's private prediction history, calibration, simulation-credit portfolio totals, property watchlist, and in-app price alert inbox. Signed users sync watchlist items, private notes, saved price thresholds, and deduped threshold-crossing alerts through `/api/me/watchlist` and `/api/me/alerts`; threshold evaluation can also send redacted, signed webhook payloads when `FAIRVALUE_ALERT_WEBHOOK_URL` is configured. The browser still keeps `fv_property_watchlist_v1` as a local fallback.
- **Property data provenance** — `public/data/property-data-manifest.json` is generated from the static provider snapshot with source hashes, field coverage, freshness windows, provider counts, and legal limitations. Property pages surface that data-quality contract beside listing provenance, `/api/properties` exposes a manifest-backed query API, and `npm run verify` fails if the manifest drifts from `properties.json`.
- **Market template registry** — `/api/market-templates` publishes `market-template-registry/v1`, including playable binary LMSR, rendered range price-band, rendered rent-yield, rendered time-on-market, and rendered renovation-budget over/under rooms.
- **Structured local intelligence** — Property pages emit deterministic `fairvalue.marketIntelligence.v2` output with bull, bear, comp, affordability, fraud/data-quality, and neighborhood analyst cases. These are debate prompts with explicit limitations, not provider-backed appraisals or compliance findings.
- **Market Studio** — Hosts can use `/join` to paste listing text and generate a local market draft with normalized address, asking price, market question, evidence checklist, provenance, warnings, existing-property matches, local saved drafts, server-validated draft audit metadata, and editable fields before creating a real room.
- **Operator review** — Hosts can open `/review/:roomCode` from the host dashboard to compare draft audits, event history, live market movement, settlement evidence, integrity checks, and a deterministic generated recap.
- **Public recap** — Hosts and players can open `/recap/:roomCode` to share a deterministic recap generated only from public room state. It summarizes live or settled LMSR movement, public activity, settlement result, and trust guardrails without fetching host-only events or showing host/user tokens.
- **Solo browsing** — Browse market cards at `/` and view individual markets at `/market/:propertyId` with chart, deterministic market intelligence, scenario prompts, settlement checklist, and trading panel.
- **Market trust** — Property detail, host, player, and settlement surfaces explain simulated credits, LMSR probability, implied fair value, listing provenance, and settlement evidence so FairValue does not imply unsupported real-money or appraisal authority.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5 |
| Database | Neon / Qdrant |
| Real-time | WebSocket (`ws`) |
| Charting | TradingView Lightweight Charts |
| AI Chat | Cognee Knowledge Graph API |
| Property Data | Zillow (static dataset) |

## Getting Started

### Prerequisites

- Node.js 18+
- A Neon database with `DATABASE_URL` in `.env`

### Install & Run

```bash
npm install

# Start the backend (port 8000)
npm run server

# In another terminal, start the frontend (Vite defaults to port 5173)
npm start
```

The frontend dev server proxies `/api` to `localhost:8000`; local WebSocket clients connect directly to the backend port by default.

### Seed the Database

```bash
node server/seed.js
```

Populates the Neon database with properties from `public/data/properties.json`.

### Property Data Manifest

```bash
npm run data:manifest
npm run check:data
```

`data:manifest` regenerates `public/data/property-data-manifest.json` from `public/data/properties.json`. The manifest is deterministic and records the source file hash, record count, provider summary, latest observed source date, tracked-field coverage, per-property critical gaps, and static-provider limitations. `check:data` is part of `npm run verify`, so changing the property snapshot without refreshing the manifest is caught before merge.

## Architecture

```
Browser (React)
  ├── /api/*  ──proxy──▶  Express server (port 8000)  ──▶  Neon Postgres
  ├── /ws/*   ──proxy──▶  WebSocket server
  ├── /api/ai/cognee/* ──▶ server-side Cognee AI proxy
  └── IndexedDB (local image cache)
```

### Frontend

- **Routing** (React Router v7): `/` browse, `/join` create/join room, `/host/:roomCode` host dashboard, `/play/:roomCode` player UI, `/me` private prediction profile, `/review/:roomCode` operator review, `/recap/:roomCode` public recap, `/market/:propertyId` solo market
- **State management:** React hooks only, no global store
- **Styling:** CSS custom properties (`--bg-primary: #1F2A36`, `--accent-primary: #4BA3FF`), dark theme

### Backend (`server/index.js`)

- **Rooms** are live in-memory objects with JSON snapshot durability for local degraded mode (`.fairvalue/rooms.json` by default in the real server process)
- **Room event logs** are kept with each durable room snapshot so state can be reconstructed after a local backend restart
- **Room event journals** append canonical room events to a local `.events.ndjson` stream for JSON-backed development or to `fairvalue_room_events` for Postgres-backed deployments, so replay recovery is less dependent on rewritten whole-room snapshots
- **User reputation and profile** aggregate signed-in player calibration plus private watchlist state. Reputation uses `FAIRVALUE_USER_REPUTATION_PATH` or `.fairvalue/user-reputation.json`; watchlists, notes, saved price thresholds, and in-app alert queue state use `FAIRVALUE_USER_PROFILE_PATH` or `.fairvalue/user-profile.json`. Optional alert webhooks use `FAIRVALUE_ALERT_WEBHOOK_URL` plus `FAIRVALUE_ALERT_WEBHOOK_SECRET`, send only redacted threshold-crossing payloads, and persist delivered status per alert so repeated evaluation does not resend a successful webhook. `/api/me/reputation`, `/api/me/watchlist`, and `/api/me/alerts` are user-token-protected and omit player session IDs, host tokens, user tokens, private watchlist notes, and raw evidence. The browser keeps `fv_property_watchlist_v1` as a local fallback and merges local-only items into signed sync when possible.
- **Operator incident workflow** overlays persisted ops triage state on generated room incidents. `FAIRVALUE_OPERATOR_INCIDENT_WORKFLOW_PATH` or `.fairvalue/operator-incidents.json` stores redacted assignment, status, and timeline entries so incident review can survive local server restarts without storing host tokens, user tokens, private profile state, or raw evidence documents.
- **Property data manifest** is generated by `scripts/property-data-manifest.js` into `public/data/property-data-manifest.json`. It treats the current Zillow/MLS export as a static provider snapshot, stores deterministic SHA-256 provenance, and gives frontend/server surfaces a typed freshness/coverage contract without claiming a live feed. `GET /api/properties` and `GET /api/properties/:propertyId` return a redacted property projection plus manifest provenance; `GET /api/neighborhoods` derives `fairvalue.neighborhoodIndex.v1` ZIP-code entities with directional aggregate metrics over the same snapshot. The private alert evaluator reads the same snapshot, so threshold alerts are static-snapshot evaluations rather than provider push events.
- **Room phases** are canonical room state (`open`, `discussion`, `locked`, `settled`) with optional discussion timers. Host phase changes are event-sourced, replayed, snapshotted, broadcast over WebSocket, and enforced server-side before any player or AI bet mutates a room.
- **Host projector mode** is a local presentation layout for live rooms. It enlarges the property, room code, consensus, implied value, phase/timer, join URL, and deterministic host cue/script while preserving the same canonical room state and controls.
- **Market Template Registry** is a versioned contract in `src/data/marketTemplates.json`, exposed publicly at `/api/market-templates`. `binary_over_under`, `range_price_band`, `rent_yield_over_under`, `time_on_market_over_under`, and `renovation_budget_over_under` are playable in the rendered room UI, canonical event replay, settlement, and public verification. Future formats should remain explicit `draft_only` contracts until real workflows exist.
- **Player Pre-Bet Intelligence** is deterministic local fallback output on `/play/:roomCode`; it uses LMSR math, the player's wager/balance, current room probability, and recent room activity to explain one reason to believe, one reason to doubt, and both OVER/UNDER wager previews before a bet is placed.
- **Live Room Intelligence** is deterministic local fallback output on the host dashboard; it combines room LMSR state, recent room activity, players, and optional server-accepted draft audits without claiming provider-backed comps
- **Structured Intelligence Provider Contract** is exposed at `GET /api/ai/intelligence/properties/:propertyId/contract`. It returns a redacted property context, the required `fairvalue.marketIntelligence.v2` output shape, required analyst roles, citation requirements, prohibited claims, and a deterministic request hash so future provider-backed intelligence can be validated before replacing local fallback.
- **Operator Review** is a host-facing deterministic recap surface over room state plus host-authorized event logs, including draft audit, settlement evidence, timeline, and integrity checks. `GET /api/ops/incidents` derives a redacted `fairvalue.operatorIncidentQueue.v1` triage queue for durability failures, missing settlement packets, locked unsettled rooms, missing event logs, and dispute-ready rooms.
- **Public Recap** is a share-safe deterministic route over `GET /api/rooms/:code/state` only; it includes public LMSR movement, activity, settlement, room reputation/calibration, and guardrails while deliberately omitting host-only event logs and capability tokens
- **Trades** are persisted to Neon on every bet
- **Solo market simulation** runs on startup — contrarian AI bot trades every 15s per market to generate 24/7 activity
- **WebSocket** broadcasts `bet`, `join`, `phase`, `ai_trade`, `settle` events to all room connections
- **AI analyst calls** are proxied through server routes so Cognee credentials never ship to browser bundles

### LMSR Market Maker (`src/lib/lmsr.ts`)

- Cost function: `b * ln(e^(qOver/b) + e^(qUnder/b))`
- Default liquidity parameter `b = 100`
- Binary search to find shares for a given dollar budget
- Browser wrapper is parity-tested against the canonical backend market engine
- `src/lib/multiOutcomeMarketEngine.js` provides the generic `lmsr_multi_outcome_v1` core for range/ranked templates: n-outcome log-sum-exp cost, softmax probabilities, budget-to-shares execution, public state projection, and winning-outcome settlement math. `range_price_band` rooms use it in the server API path and rendered host/player room UI today. `rent_yield_over_under`, `time_on_market_over_under`, and `renovation_budget_over_under` reuse the binary LMSR core with configured yield, days-on-market, or budget thresholds and format-specific settlement inputs. The AI bot remains binary-first.

### Database Schema

- **`markets`** — property listings (address, asking_price, status, property_id)
- **`market_state`** — LMSR state per market (q_over, q_under, b, total_trades, total_wagered)
- **`trades`** — trade history (outcome, shares, wager, payout, probabilities after, source)
- **`fairvalue_room_snapshots`** — sensitive durable room snapshots for Postgres-backed multiplayer recovery
- **`fairvalue_room_events`** — append-only canonical room event stream for Postgres-backed replay recovery

## API Endpoints

### Multiplayer Rooms

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rooms` | Create room |
| POST | `/api/identity` | Mint signed user identity |
| GET | `/api/me/reputation` | Signed user's private cross-room reputation |
| GET | `/api/market-templates` | Public market template registry |
| POST | `/api/rooms/:code/join` | Join room |
| GET | `/api/rooms/:code/state` | Full room state |
| GET | `/api/rooms/:code/events` | Host-only room event log |
| GET | `/api/rooms/:code/replay` | Host-only replayed room state |
| GET | `/api/rooms/:code/replay/verify` | Host-only replay/live integrity verification |
| GET | `/api/rooms/:code/public-verification` | Public settled-room verification digest |
| POST | `/api/rooms/:code/phase` | Host-only room phase/timer/lock control |
| POST | `/api/rooms/:code/bet` | Place bet |
| POST | `/api/rooms/:code/settle` | Settle market |
| POST | `/api/rooms/:code/toggle-ai` | Toggle AI bot |
| GET | `/api/rooms/:code/leaderboard` | Leaderboard |

`POST /api/rooms` returns a `host_token` only to the creator. Host-only routes (`phase`, `settle`, `toggle-ai`, `events`, `replay`, and `replay/verify`) require that value in the `X-FairValue-Host-Token` header or the durable signed host identity for newly created rooms. Join, state, player, and WebSocket payloads do not expose the token. Market Studio room creation may include a `market_draft`; the server accepts only draft metadata that matches the room address and asking price, preserves a `draft_audit` envelope in state/events/replay/snapshots, records the accepted market template projection, and stores a source-text hash and length instead of the raw pasted text. Registered draft-only market formats are rejected with an explicit "not playable yet" validation error instead of silently falling back to binary. Replay verification compares redacted hashes of the event-replayed projection against the live room projection, including canonical room phase state, and reports mismatch paths without returning host tokens, user tokens, snapshot contents, or private raw evidence.

`GET /api/me/reputation` requires `X-FairValue-User-Token` and returns the signed-in player's private cross-room simulation reputation: rooms played, total/correct bets, accuracy, reason count, wager/payout totals, Brier-style calibration, market-format counts, and recent settled rooms. It is updated at settlement for players who joined with a signed user identity and is designed not to return player session IDs, host tokens, user tokens, or raw evidence.

`GET /api/market-templates` returns the versioned public registry of room market formats. `binary_over_under` uses `lmsr_binary_v1` and is playable in the browser room UI. `range_price_band` uses `lmsr_multi_outcome_v1`: create a room with `market_draft.market_format = "range_price_band"` plus optional `band_low` and `band_high`, place bets on `below_band`, `inside_band`, or `above_band`, and settle with `actual_price`. `rent_yield_over_under` uses `lmsr_binary_v1`: create a room with `market_draft.market_format = "rent_yield_over_under"` plus optional `yield_threshold`, place bets on `over` or `under`, and settle with `actual_price` or `settlement_price` plus `annual_rent`. `time_on_market_over_under` uses `lmsr_binary_v1`: create a room with `market_draft.market_format = "time_on_market_over_under"` plus optional `days_threshold`, place bets on `over` or `under`, and settle with `days_on_market` or `listed_at` plus `contract_at`/`pending_at`. `renovation_budget_over_under` uses `lmsr_binary_v1`: create a room with `market_draft.market_format = "renovation_budget_over_under"` plus optional `budget_threshold`, place bets on `over` or `under`, and settle with `verified_cost`. Range, rent-yield, time-on-market, and renovation-budget room events include `market_format` and `market_config`, replay/live verification hashes them, public verification exports the settled outcome, and the host/player UI renders format-specific probabilities, positions, and settlement hints. The AI bot remains binary-first for standard asking-price over/under rooms.

`POST /api/rooms/:code/phase` accepts `phase` values of `open`, `discussion`, or `locked`; discussion phases may include `timer_seconds` up to three hours. Locked and settled phases reject player bets and prevent AI bot trades from starting. Phase changes emit canonical `phase_changed` events, appear in activity, persist through snapshots/event journals, and broadcast a `phase` WebSocket message with the normalized `room_phase` object.

`POST /api/rooms/:code/bet` requires an `Idempotency-Key` header and accepts optional public reasoning as `reason`, `bet_reason`, or `rationale`. Bet reasons are text-only, sanitized, capped at 280 characters, included in the idempotency fingerprint, stored with the player bet, emitted on `bet_placed` events/activity/WebSocket bet broadcasts, replayed from the canonical event stream, and reflected in public-safe projection hashes, public recaps, and operator review timelines.

`POST /api/rooms/:code/settle` accepts `actual_price` plus an optional `settlement_evidence` packet. Rent-yield rooms additionally require `annual_rent`; they resolve `over` when `annual_rent / settlement_price` meets or exceeds the configured yield threshold. Time-on-market rooms accept `days_on_market`, or derive it from `listed_at` plus `contract_at`/`pending_at`/`settled_at`; they resolve `over` when days on market meets or exceeds the configured days threshold. Renovation-budget rooms accept `verified_cost`; they resolve `over` when verified cost meets or exceeds the configured budget threshold. The packet may include a public-safe summary and up to six metadata items of type `sale_record`, `appraisal`, `signed_valuation`, `mls_update`, `permit_record`, `rental_outcome`, `insurer_notice`, `public_record`, or `host_attestation`, each with source/reference metadata, confidence, observed date, and notes. The server sanitizes text, rejects unsupported item types, never stores private document contents, and creates a low-confidence host-attestation packet when no metadata is supplied. Settlement also creates a replayed `room-reputation/v1` summary using each player's settled bet accuracy, public reason count, average entry confidence, Brier-style calibration score, payout, and final simulation-credit balance. Settlement responses, room state, WebSocket settlement broadcasts, replay, operator review, public recaps, and public verification all carry the normalized `evidence_packet` and share-safe reputation/calibration data without player session IDs.

`GET /api/rooms/:code/public-verification` is public and available after settlement. It returns a share-safe `public-room-verification/v1` artifact with event counts, replay/live hashes, public recap digest hash, settlement evidence packet hash, replay parity status, reputation/calibration counts and leaders, trust limitations, and a signature when `FAIRVALUE_PUBLIC_VERIFICATION_SECRET` or a non-default `FAIRVALUE_IDENTITY_SECRET` is configured. It does not return host tokens, user tokens, player session IDs, private evidence documents, or host-only event logs. The public recap and settled host review surfaces can copy or download the same JSON artifact for external audit, newsletter, SDK, or webhook consumers.

Signed example artifacts live at `docs/fixtures/public-room-verification-v1.json`, `docs/fixtures/public-room-verification-range-price-band-v1.json`, `docs/fixtures/public-room-verification-rent-yield-v1.json`, `docs/fixtures/public-room-verification-time-on-market-v1.json`, and `docs/fixtures/public-room-verification-renovation-budget-v1.json` so future SDK, webhook, and embed consumers can lock against binary, range, rent-yield, time-on-market, and renovation-budget export shapes without needing live room credentials.

The `/recap/:roomCode` route is frontend-only and reads the public state endpoint plus the settled-room public verification endpoint. It does not request `/api/rooms/:code/events`, does not require or send host authority, and is covered by token-leakage checks.

### Solo Markets (from Neon)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/markets` | All open markets |
| GET | `/api/markets/:id` | Single market |
| GET | `/api/markets/:id/history` | Trade history |
| GET | `/api/markets/charts` | 24h chart data |
| GET | `/api/markets/by-property/:id/chart` | Per-property chart |

## WebSocket Protocol

Connect to `ws://localhost:8000/ws/:roomCode`. Server broadcasts:

- **`bet`** — player trade with updated market, player state, activity entry
- **`join`** — new player with player count
- **`phase`** — normalized room phase, optional AI enabled state, and activity entry
- **`ai_trade`** — bot trade with market update
- **`settle`** — settlement results with per-player payouts, normalized public-safe `evidence_packet`, and `room-reputation/v1` calibration summary

Client sends `ping` every 30s for keepalive.

## Integrations

- **Neon Postgres** — persistent storage for markets, trades, LMSR state
- **Cognee AI** — server-side knowledge graph API for AI market analysis chat
- **Zillow** — static property dataset (7.87 MB, `public/data/properties.json`)
- **Property data manifest** — deterministic provenance/coverage contract (`public/data/property-data-manifest.json`)
- **TradingView Lightweight Charts** — dual-axis probability/fair-value charting
- **QR Code** (`qrcode.react`) — room join codes on host dashboard
- **ngrok** (optional) — public URL for QR codes when on LAN

## Environment

Copy `.env.example` to `.env` for local backend configuration.

```bash
cp .env.example .env
```

- `DATABASE_URL` enables Neon-backed market persistence. If it is missing, the server boots in degraded mode and in-memory multiplayer rooms still work, while database-backed routes return DB errors.
- `COGNEE_API_KEY` enables the AI Analyst's Cognee knowledge-graph calls. It must stay server-side only and must never be added as a `VITE_*` variable. When it is missing, the host AI Analyst still returns a deterministic local room-state summary with citations to the submitted market snapshot, LMSR fair-value formula, and recent room flow, plus explicit limitations that no external comps or knowledge-graph memory were queried.
- `COGNEE_BASE_URL` defaults to `https://api.cognee.ai`.
- `VITE_BACKEND_PORT` defaults local frontend WebSockets to the backend on port `8000` when Vite runs on another port.
- `VITE_WS_BASE_URL` can override the WebSocket base URL for non-standard local or deployed setups.
- `FAIRVALUE_ROOM_STORE=json` keeps the default local JSON snapshot adapter; `FAIRVALUE_ROOM_STORE=postgres` uses the Neon/Postgres `fairvalue_room_snapshots` table when `DATABASE_URL` is configured.
- `FAIRVALUE_ROOM_STORE_PATH` overrides the local durable room snapshot file. If unset, `npm run server` uses `.fairvalue/rooms.json`.
- `FAIRVALUE_ROOM_EVENT_LOG=auto` keeps append-only room event journaling enabled. JSON room persistence writes a local `<room snapshot path>.events.ndjson` stream; Postgres room persistence writes canonical events to `fairvalue_room_events`. Set it to `off` only for local experiments where replay recovery is intentionally ephemeral.
- `FAIRVALUE_ROOM_EVENT_LOG_PATH` overrides the append-only local JSON event journal path. Do not set it in production with `FAIRVALUE_ROOM_STORE=postgres`; production readiness requires the Postgres event stream.
- `FAIRVALUE_ROOM_PERSISTENCE=off` disables local room snapshots and returns to fully ephemeral in-memory room state.
- `FAIRVALUE_ROOM_RETENTION_DAYS` defaults to `30` for local JSON snapshots and prunes only settled rooms whose last saved room event/activity is older than that window. Set it to `0` or `off` to disable local retention pruning.
- `FAIRVALUE_ROOM_SNAPSHOT_SECRET` encrypts the local JSON room snapshot file with AES-256-GCM. Set a stable private value before creating rooms; encrypted local snapshots cannot be read without the same value.
- `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS` enables opt-in retention pruning for `FAIRVALUE_ROOM_STORE=postgres`; it is disabled by default and deletes only settled room rows whose room event/activity timestamp or row `updated_at` is older than the configured window.
- `FAIRVALUE_LIVE_POSTGRES_SMOKE=1` lets `npm run test:persistence:live` create, read, and delete one temporary `FV**` room row in the configured `DATABASE_URL`; without it, that command only checks configuration/connectivity and table presence.
- `FAIRVALUE_REQUIRE_DATABASE_URL=1` makes the live persistence readiness command fail when `DATABASE_URL` is missing. `FAIRVALUE_ROOM_STORE=postgres` implies that requirement.
- `FAIRVALUE_LIVE_POSTGRES_DRIVER=postgres` can force the live readiness script to use a plain Postgres TCP client; otherwise it uses the app's Neon serverless driver for Neon hosts and the Postgres client for localhost.
- `FAIRVALUE_OPS_TOKEN` protects `/api/ops/metrics`. Local development allows metrics without a token, but production requires this value and accepts either `Authorization: Bearer <token>` or `X-FairValue-Ops-Token`.
- `FAIRVALUE_IDENTITY_SECRET` signs anonymous browser identities used for durable player sessions and host authority. Set a stable private value anywhere rooms need to survive server restarts.
- `FAIRVALUE_PUBLIC_VERIFICATION_SECRET` signs public settled-room verification artifacts. If unset, the public endpoint still returns deterministic hashes but marks the artifact as an unsigned local digest. Production readiness requires this value so shareable public artifacts do not ship unsigned.
- `FAIRVALUE_USER_PROFILE_PATH` overrides the private signed-user profile JSON store for watchlist items, private notes, and saved price thresholds. If unset, the real server process uses `.fairvalue/user-profile.json`.
- `FAIRVALUE_OPERATOR_INCIDENT_WORKFLOW_PATH` overrides the private ops incident workflow JSON store. If unset, the real server process uses `.fairvalue/operator-incidents.json`.
- `FAIRVALUE_ALERT_WEBHOOK_URL` enables optional outbound webhook delivery for private threshold alerts. If unset, alert delivery remains in-app only. The URL must use `https` outside localhost.
- `FAIRVALUE_ALERT_WEBHOOK_SECRET` adds `X-FairValue-Signature: sha256=<hmac>` to alert webhook POSTs.
- `FAIRVALUE_PROPERTY_SNAPSHOT_PATH` overrides the static property snapshot used by private alert evaluation and future server-side property query surfaces. If unset, the server reads `public/data/properties.json`.

Room snapshot note: `.fairvalue/` is git-ignored because snapshots include room host tokens. The Postgres snapshot adapter stores the same sensitive snapshot payload in `fairvalue_room_snapshots`, which it creates if missing. Treat both snapshot stores as sensitive runtime state. Restored rooms keep their market, players, event history, phase/timer/lock state, settlement, bet idempotency receipts, and optional Market Studio draft audit envelopes; AI bot intervals are not auto-resumed after a backend restart. Draft audits intentionally keep source-text hashes and lengths, not raw pasted listing text. Local JSON retention prunes settled rooms only; active rooms and rooms without a room-specific timestamp are kept. Postgres retention is opt-in and prunes settled rows only. If `FAIRVALUE_ROOM_SNAPSHOT_SECRET` is set, local JSON snapshots are saved as encrypted envelopes; existing plaintext snapshots still load and are rewritten encrypted on the next save. If a local JSON snapshot is malformed, startup quarantines it beside the original path as `.corrupt-*`, logs the quarantine path without snapshot contents, and continues with an empty room snapshot so operators can inspect or restore the file manually. Append-only event journals store canonical room events without host tokens or private evidence documents: local JSON uses `.events.ndjson`, and Postgres uses `fairvalue_room_events` with unique `(room_code, sequence)` records. On restore, the server prefers the journal when it contains a longer event stream for a snapshotted room.

Security note: an older client-side Cognee key was committed in `src/services/cogneeService.ts`. Treat that key as compromised and rotate it before using Cognee in any environment.

HTTP hardening note: the Express server disables `X-Powered-By` and emits baseline browser security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Operations

- `GET /healthz` returns a minimal process health payload and is safe for basic uptime checks.
- `GET /readyz` reports whether the process is ready for its configured dependencies. Local degraded mode is ready without `DATABASE_URL`; `FAIRVALUE_REQUIRE_DATABASE_URL=1` or `FAIRVALUE_ROOM_STORE=postgres` makes the database requirement explicit.
- `GET /api/ops/metrics` returns an in-memory JSON snapshot for local triage: request counts/latency, room lifecycle counters, active room/player/connection counts, WebSocket counters, rate-limit rejections, database errors, persistence failures, and AI degraded/error counts. It does not include room host tokens or player payloads. Set `FAIRVALUE_OPS_TOKEN` before exposing it outside local development.
- `GET /api/ops/incidents` returns `fairvalue.operatorIncidentQueue.v1`, a redacted deterministic triage queue over current room/review state with an attached `fairvalue.operatorIncidentWorkflow.v1` workflow projection for each incident. Supported params: `room_code`, `severity`, and `limit`.
- `PATCH /api/ops/incidents/:incidentId` updates persisted internal triage status, assignee, and a sanitized timeline note for a currently generated incident. Valid statuses are `open`, `investigating`, `waiting_on_host`, `resolved`, and `dismissed`.
- Ops incident routes use the same `FAIRVALUE_OPS_TOKEN` guard as metrics and are not moderation enforcement, arbitration, legal advice, appraisal authority, fraud findings, or compliance review. Workflow notes are redacted before persistence and should not be used for host tokens, user tokens, private profile state, or raw evidence documents.
- `GET /metrics` exposes the same aggregate counters in Prometheus text format for an external scraper. It uses the same `FAIRVALUE_OPS_TOKEN` guard as `/api/ops/metrics`.
- Replay integrity checks from `GET /api/rooms/:code/replay/verify` and public settled-room verification digest generation increment replay-integrity counters in both ops metrics surfaces, making replay/live drift visible without exposing room authority tokens. Ops metrics also expose whether append-only event journaling is enabled and which adapter is active.

## Private User APIs

- `GET /api/me/reputation` returns the signed user's private simulation-credit prediction record.
- `GET /api/me/watchlist` returns `fairvalue.userWatchlist.v1` with private property IDs, notes, saved price thresholds, and limitations.
- `PUT /api/me/watchlist/:propertyId` adds or replaces a watched property. `PATCH` updates note/threshold fields, and `DELETE` removes the property.
- `GET /api/me/alerts` returns `fairvalue.userWatchlistAlerts.v1` with the private in-app alert inbox and in-app delivery queue.
- `POST /api/me/alerts/evaluate` evaluates saved thresholds against the current property snapshot, queues deduped `price_below` or `price_above` alerts when crossed, and returns `fairvalue.alertDeliveryAdapter.v1` outbound delivery attempts. When `FAIRVALUE_ALERT_WEBHOOK_URL` is configured, ready alerts are POSTed once as `fairvalue.alertWebhookPayload.v1` with a redacted user reference, property snapshot fields, alert threshold fields, and optional HMAC signature.
- `PATCH /api/me/alerts/:alertId` acknowledges a queued alert.
- All `/api/me/*` routes require `X-FairValue-User-Token`. They are private profile state, not public market evidence. Alert webhook delivery is optional and redacted; no email, SMS, push, broker, lender, appraisal, fraud, or provider notifications are sent by FairValue itself.

## Property APIs

- `GET /api/properties` returns `fairvalue.propertyQuery.v1` with redacted property rows from the current static snapshot, filter echoes, match counts, limit, manifest provenance, and usage limitations.
- Supported query params: `ids` as comma-separated property IDs, `q` for address/city/state/ZIP/provider search, `city`, `state`, `min_price`, `max_price`, and `limit` up to 250.
- `GET /api/properties/:propertyId` returns the same query envelope for one property or `404` when the property is not in the current snapshot.
- `GET /api/neighborhoods` returns `fairvalue.neighborhoodIndex.v1` ZIP-code entities derived from the same static snapshot, with property counts, status/home-type mix, price/rent/school/area aggregates, field coverage, sample confidence, and provenance. Supported params: `city`, `state`, `zip` or `zip_code`, `min_properties`, and `limit`.
- `GET /api/neighborhoods/:zipCode` returns one ZIP-code entity or `404` when no entity exists in the current snapshot.
- The API intentionally omits raw provider payloads, photo arrays, street-view URLs, embedded provider keys, host tokens, and user profile state.

## Verification

```bash
npm run verify
```

This runs a client secret scan, checks that the property data manifest is current, typechecks, runs server integration tests, runs the non-watch Vitest suite, builds the Vite bundle, enforces bundle budgets, and smoke-boots the local backend.

`npm run check:bundle` defaults to 240 kB for any JS chunk, 25 kB for any CSS chunk, and 810 kB total JS after `npm run build`. Override with `FAIRVALUE_MAX_JS_CHUNK_KB`, `FAIRVALUE_MAX_CSS_CHUNK_KB`, or `FAIRVALUE_MAX_TOTAL_JS_KB` when intentionally raising a budget.

For a deployment environment gate, run:

```bash
npm run check:production
```

This prints a JSON report and exits non-zero until production-critical variables are set: `DATABASE_URL`, `FAIRVALUE_ROOM_STORE=postgres`, positive `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS`, `FAIRVALUE_ROOM_EVENT_LOG=auto` or `postgres` without a local event-log path override, non-default `FAIRVALUE_IDENTITY_SECRET`, `FAIRVALUE_PUBLIC_VERIFICATION_SECRET`, enabled room persistence, and `FAIRVALUE_OPS_TOKEN`. Missing `COGNEE_API_KEY` is reported as a warning because the AI analyst can intentionally run degraded.

For browser flow coverage, run:

```bash
npm run test:e2e
npm run test:e2e:isolated
npm run test:e2e:matrix
npm run test:e2e:restart
npm run test:e2e:restart:matrix
npm run test:e2e:soak
npm run test:e2e:browser-load
npm run test:e2e:mixed-traffic
npm run test:latency:restart
npm run test:performance:cold
npm run smoke:boot
npm run test:persistence:postgres
npm run test:persistence:live
npm run test:a11y:assistive
```

`smoke:boot` starts `node server/index.js` on a free local port with an isolated temporary room snapshot file, checks health/readiness, verifies ops metrics token gating, creates/joins/bets/settles one room through HTTP plus a WebSocket join broadcast, verifies host token non-leakage, and confirms local room snapshot persistence wrote.

`test:e2e:isolated` starts fresh backend/frontend ports (`8010`/`3010`), enables the local room snapshot file at `/tmp/fairvalue-e2e-rooms.json`, and includes the host/player flow plus multiplayer burst, public recap privacy and public verification route, serious axe accessibility checks, and keyboard/screen-reader-adjacent checks across the browse page, property route, market trust explainer, host/player room trust notes, player pre-bet intelligence, join forms, Market Studio draft generation/matching/saved-draft/host-audit/live-intelligence/operator-review flow, identity-minting failure notifications, join-page create/join/host-auto-join API failure notifications, malformed join success responses, host/player room surfaces, host projector mode, settled operator review, private `/me` prediction history, synced property watchlist, and in-app alert inbox, room-state load failure notifications, missing-host-authority controls, settle modal, settlement evidence packet display, settlement recap trust notes, market-start room creation/host-auto-join failure notifications, settlement failure notifications, malformed settlement success handling, host-action failure notifications, malformed AI-toggle success handling, missing-key AI fallback, direct player join validation/API notifications, player bet failure rollback, player validation notifications, and mobile wager controls.

`test:e2e:matrix` starts fresh backend/frontend ports (`8030`/`3030`) and runs the rendered host/player room flow across Chromium, Firefox, and WebKit projects.

`test:e2e:restart` starts its own fresh backend/frontend on free local ports, keeps the rendered host/player pages open, restarts the real backend process against `/tmp/fairvalue-browser-restart-rooms.json`, runs retrying API load waves while the backend is down and recovering, and verifies room recovery, post-restart betting, settlement, and settled-state reload.

`test:e2e:restart:matrix` runs that same restart/load recovery proof across Chromium, Firefox, and WebKit, using `/tmp/fairvalue-browser-restart-matrix-rooms.json`.

`test:e2e:soak` starts fresh backend/frontend ports (`8031`/`3031`) and runs a longer API/WebSocket join-bet wave profile against `/tmp/fairvalue-e2e-soak-rooms.json`, including idempotency replay, settlement, and snapshot reconciliation.

`test:e2e:browser-load` starts fresh backend/frontend ports (`8032`/`3032`) and runs a rendered browser load profile: one desktop host plus 10 mobile player pages join concurrently, bet concurrently, receive settlement, and reconcile the persisted snapshot. Set `FAIRVALUE_BROWSER_LOAD_PLAYERS=4..16` to tune the rendered player count locally.

`test:e2e:mixed-traffic` starts fresh backend/frontend ports (`8033`/`3033`) and runs a mixed profile: one desktop host, throttled rendered mobile clients, concurrent API join/bet churn, state polling, settlement broadcast checks, console/page-error checks, and snapshot reconciliation. Tune with `FAIRVALUE_MIXED_SLOW_PLAYERS=2..8` and `FAIRVALUE_MIXED_API_PLAYERS=4..20`.

`test:latency:restart` starts a real backend on a free local port, drives create/join/bet/state traffic through a backend restart, records latency percentiles plus restart/recovery timing, and fails if the local latency budgets regress.

`test:performance:cold` builds the production Vite bundle with a fresh backend port, serves `dist` through a local static/proxy server, then drives cold `/join` room creation, cold `/play/:roomCode` player join, bet sync, and settlement broadcast timing through headless Chromium with explicit local budgets.

`test:a11y:assistive` starts fresh backend/frontend ports, opens headed Playwright Chrome with renderer accessibility enabled, captures the macOS accessibility tree plus Playwright ARIA snapshots for join, host, settle, and player flows, and writes `docs/accessibility-assistive-tech-notes.md`. It is intentionally not part of `npm run verify` because it opens a headed browser window.

`test:persistence:postgres` requires Docker. It starts a disposable `postgres:16-alpine` container, verifies the Postgres room snapshot adapter plus the append-only `fairvalue_room_events` event stream against a real database, and removes the container afterward.

`test:persistence:live` is the production database readiness gate. With no `DATABASE_URL`, it records a local degraded/skip result unless `FAIRVALUE_REQUIRE_DATABASE_URL=1` or `FAIRVALUE_ROOM_STORE=postgres` is set. With `DATABASE_URL` configured, it verifies live connectivity and whether `fairvalue_room_snapshots` and `fairvalue_room_events` exist. Set `FAIRVALUE_LIVE_POSTGRES_SMOKE=1` to run the non-destructive live write/read/delete path against a single temporary `FV**` room row and its matching event stream rows; it never calls the whole-table snapshot replacement path against a live database.

## Project Structure

```
server/
  index.js          # Express + WebSocket backend
  db.js             # Neon database connection
  replayIntegrity.js # Host-only replay/live projection verification
  publicVerification.js # Share-safe settled-room verification digests
  roomEventLog.js    # Canonical room events, replay projection, and local append-only event journal
  settlementEvidence.js # Public-safe settlement evidence packet normalization
  structuredIntelligenceAdapter.js # Provider contract and validation boundary for structured intelligence
  seed.js           # Database seeding script
scripts/
  property-data-manifest.js # Static property snapshot provenance and coverage manifest
src/
  components/       # Reusable UI components
  pages/            # Route-level pages (HostView, PlayerView, MarketPage, etc.)
  hooks/            # Custom hooks (useRoom, useWebSocket, useSession, useMarketChart, etc.)
  lib/              # Pure logic (lmsr.ts, botEngine.ts)
  services/         # External API clients (cogneeService.ts)
  data/             # Property data and manifest loaders
sean/               # Python prototype (FastAPI, reference implementation)
```
