# FairValue

Real-time multiplayer real estate prediction market. Players bet on whether a property will appraise above or below its listing price using an LMSR automated market maker.

## How It Works

A host creates a room and selects a property. Players join via QR code or room code from their phones and place bets on whether the property's actual value is **over** or **under** the asking price. An LMSR (Logarithmic Market Scoring Rule) market maker provides infinite liquidity and continuous price discovery. An optional AI bot adds contrarian trading activity to keep markets liquid.

## Modes

- **Multiplayer** — Host creates a room at `/join`, gets a 4-character code using letters and numbers. Players scan QR or go to `/play/:roomCode` to bet from their phones with a local LMSR pre-bet read, reason to believe, reason to doubt, and wager-impact preview. Host views live dashboard at `/host/:roomCode` with chart, leaderboard, activity feed, phase/timer/lock controls, projector mode, and Live Room Intelligence generated from LMSR flow, players, recent bets, and optional Market Studio draft audit metadata.
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

## Architecture

```
Browser (React)
  ├── /api/*  ──proxy──▶  Express server (port 8000)  ──▶  Neon Postgres
  ├── /ws/*   ──proxy──▶  WebSocket server
  ├── /api/ai/cognee/* ──▶ server-side Cognee AI proxy
  └── IndexedDB (local image cache)
```

### Frontend

- **Routing** (React Router v7): `/` browse, `/join` create/join room, `/host/:roomCode` host dashboard, `/play/:roomCode` player UI, `/review/:roomCode` operator review, `/recap/:roomCode` public recap, `/market/:propertyId` solo market
- **State management:** React hooks only, no global store
- **Styling:** CSS custom properties (`--bg-primary: #1F2A36`, `--accent-primary: #4BA3FF`), dark theme

### Backend (`server/index.js`)

- **Rooms** are live in-memory objects with JSON snapshot durability for local degraded mode (`.fairvalue/rooms.json` by default in the real server process)
- **Room event logs** are kept with each durable room snapshot so state can be reconstructed after a local backend restart
- **Room event journals** append canonical room events to a local `.events.ndjson` stream for JSON-backed development or to `fairvalue_room_events` for Postgres-backed deployments, so replay recovery is less dependent on rewritten whole-room snapshots
- **Room phases** are canonical room state (`open`, `discussion`, `locked`, `settled`) with optional discussion timers. Host phase changes are event-sourced, replayed, snapshotted, broadcast over WebSocket, and enforced server-side before any player or AI bet mutates a room.
- **Host projector mode** is a local presentation layout for live rooms. It enlarges the property, room code, consensus, implied value, phase/timer, join URL, and deterministic host cue/script while preserving the same canonical room state and controls.
- **Player Pre-Bet Intelligence** is deterministic local fallback output on `/play/:roomCode`; it uses LMSR math, the player's wager/balance, current room probability, and recent room activity to explain one reason to believe, one reason to doubt, and both OVER/UNDER wager previews before a bet is placed.
- **Live Room Intelligence** is deterministic local fallback output on the host dashboard; it combines room LMSR state, recent room activity, players, and optional server-accepted draft audits without claiming provider-backed comps
- **Operator Review** is a host-facing deterministic recap surface over room state plus host-authorized event logs, including draft audit, settlement evidence, timeline, and integrity checks
- **Public Recap** is a share-safe deterministic route over `GET /api/rooms/:code/state` only; it includes public LMSR movement, activity, settlement, and guardrails while deliberately omitting host-only event logs and capability tokens
- **Trades** are persisted to Neon on every bet
- **Solo market simulation** runs on startup — contrarian AI bot trades every 15s per market to generate 24/7 activity
- **WebSocket** broadcasts `bet`, `join`, `phase`, `ai_trade`, `settle` events to all room connections
- **AI analyst calls** are proxied through server routes so Cognee credentials never ship to browser bundles

### LMSR Market Maker (`src/lib/lmsr.ts`)

- Cost function: `b * ln(e^(qOver/b) + e^(qUnder/b))`
- Default liquidity parameter `b = 100`
- Binary search to find shares for a given dollar budget
- Browser wrapper is parity-tested against the canonical backend market engine

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

`POST /api/rooms` returns a `host_token` only to the creator. Host-only routes (`phase`, `settle`, `toggle-ai`, `events`, `replay`, and `replay/verify`) require that value in the `X-FairValue-Host-Token` header or the durable signed host identity for newly created rooms. Join, state, player, and WebSocket payloads do not expose the token. Market Studio room creation may include a `market_draft`; the server accepts only draft metadata that matches the room address and asking price, preserves a `draft_audit` envelope in state/events/replay/snapshots, and stores a source-text hash and length instead of the raw pasted text. Replay verification compares redacted hashes of the event-replayed projection against the live room projection, including canonical room phase state, and reports mismatch paths without returning host tokens, user tokens, snapshot contents, or private raw evidence.

`POST /api/rooms/:code/phase` accepts `phase` values of `open`, `discussion`, or `locked`; discussion phases may include `timer_seconds` up to three hours. Locked and settled phases reject player bets and prevent AI bot trades from starting. Phase changes emit canonical `phase_changed` events, appear in activity, persist through snapshots/event journals, and broadcast a `phase` WebSocket message with the normalized `room_phase` object.

`POST /api/rooms/:code/settle` accepts `actual_price` plus an optional `settlement_evidence` packet. The packet may include a public-safe summary and up to six metadata items of type `sale_record`, `appraisal`, `signed_valuation`, `mls_update`, `permit_record`, `rental_outcome`, `insurer_notice`, `public_record`, or `host_attestation`, each with source/reference metadata, confidence, observed date, and notes. The server sanitizes text, rejects unsupported item types, never stores private document contents, and creates a low-confidence host-attestation packet when no metadata is supplied. Settlement responses, room state, WebSocket settlement broadcasts, replay, operator review, and public recaps all carry the normalized `evidence_packet`.

`GET /api/rooms/:code/public-verification` is public and available after settlement. It returns a share-safe `public-room-verification/v1` artifact with event counts, replay/live hashes, public recap digest hash, settlement evidence packet hash, replay parity status, trust limitations, and a signature when `FAIRVALUE_PUBLIC_VERIFICATION_SECRET` or a non-default `FAIRVALUE_IDENTITY_SECRET` is configured. It does not return host tokens, user tokens, player session IDs, private evidence documents, or host-only event logs. The public recap and settled host review surfaces can copy or download the same JSON artifact for external audit, newsletter, SDK, or webhook consumers.

A signed example artifact lives at `docs/fixtures/public-room-verification-v1.json` so future SDK, webhook, and embed consumers can lock against the export shape without needing live room credentials.

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
- **`settle`** — settlement results with per-player payouts and normalized public-safe `evidence_packet`

Client sends `ping` every 30s for keepalive.

## Integrations

- **Neon Postgres** — persistent storage for markets, trades, LMSR state
- **Cognee AI** — server-side knowledge graph API for AI market analysis chat
- **Zillow** — static property dataset (7.87 MB, `public/data/properties.json`)
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

Room snapshot note: `.fairvalue/` is git-ignored because snapshots include room host tokens. The Postgres snapshot adapter stores the same sensitive snapshot payload in `fairvalue_room_snapshots`, which it creates if missing. Treat both snapshot stores as sensitive runtime state. Restored rooms keep their market, players, event history, phase/timer/lock state, settlement, bet idempotency receipts, and optional Market Studio draft audit envelopes; AI bot intervals are not auto-resumed after a backend restart. Draft audits intentionally keep source-text hashes and lengths, not raw pasted listing text. Local JSON retention prunes settled rooms only; active rooms and rooms without a room-specific timestamp are kept. Postgres retention is opt-in and prunes settled rows only. If `FAIRVALUE_ROOM_SNAPSHOT_SECRET` is set, local JSON snapshots are saved as encrypted envelopes; existing plaintext snapshots still load and are rewritten encrypted on the next save. If a local JSON snapshot is malformed, startup quarantines it beside the original path as `.corrupt-*`, logs the quarantine path without snapshot contents, and continues with an empty room snapshot so operators can inspect or restore the file manually. Append-only event journals store canonical room events without host tokens or private evidence documents: local JSON uses `.events.ndjson`, and Postgres uses `fairvalue_room_events` with unique `(room_code, sequence)` records. On restore, the server prefers the journal when it contains a longer event stream for a snapshotted room.

Security note: an older client-side Cognee key was committed in `src/services/cogneeService.ts`. Treat that key as compromised and rotate it before using Cognee in any environment.

HTTP hardening note: the Express server disables `X-Powered-By` and emits baseline browser security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Operations

- `GET /healthz` returns a minimal process health payload and is safe for basic uptime checks.
- `GET /readyz` reports whether the process is ready for its configured dependencies. Local degraded mode is ready without `DATABASE_URL`; `FAIRVALUE_REQUIRE_DATABASE_URL=1` or `FAIRVALUE_ROOM_STORE=postgres` makes the database requirement explicit.
- `GET /api/ops/metrics` returns an in-memory JSON snapshot for local triage: request counts/latency, room lifecycle counters, active room/player/connection counts, WebSocket counters, rate-limit rejections, database errors, persistence failures, and AI degraded/error counts. It does not include room host tokens or player payloads. Set `FAIRVALUE_OPS_TOKEN` before exposing it outside local development.
- `GET /metrics` exposes the same aggregate counters in Prometheus text format for an external scraper. It uses the same `FAIRVALUE_OPS_TOKEN` guard as `/api/ops/metrics`.
- Replay integrity checks from `GET /api/rooms/:code/replay/verify` and public settled-room verification digest generation increment replay-integrity counters in both ops metrics surfaces, making replay/live drift visible without exposing room authority tokens. Ops metrics also expose whether append-only event journaling is enabled and which adapter is active.

## Verification

```bash
npm run verify
```

This currently runs a client secret scan, TypeScript type checking, server integration tests, the non-watch Vitest suite, a production build, the bundle budget check, and a real backend child-process boot smoke.

`npm run check:bundle` defaults to 240 kB for any JS chunk, 25 kB for any CSS chunk, and 760 kB total JS after `npm run build`. Override with `FAIRVALUE_MAX_JS_CHUNK_KB`, `FAIRVALUE_MAX_CSS_CHUNK_KB`, or `FAIRVALUE_MAX_TOTAL_JS_KB` when intentionally raising a budget.

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

`test:e2e:isolated` starts fresh backend/frontend ports (`8010`/`3010`), enables the local room snapshot file at `/tmp/fairvalue-e2e-rooms.json`, and includes the host/player flow plus multiplayer burst, public recap privacy and public verification route, serious axe accessibility checks, and keyboard/screen-reader-adjacent checks across the browse page, property route, market trust explainer, host/player room trust notes, player pre-bet intelligence, join forms, Market Studio draft generation/matching/saved-draft/host-audit/live-intelligence/operator-review flow, identity-minting failure notifications, join-page create/join/host-auto-join API failure notifications, malformed join success responses, host/player room surfaces, host projector mode, settled operator review, room-state load failure notifications, missing-host-authority controls, settle modal, settlement evidence packet display, settlement recap trust notes, market-start room creation/host-auto-join failure notifications, settlement failure notifications, malformed settlement success handling, host-action failure notifications, malformed AI-toggle success handling, missing-key AI fallback, direct player join validation/API notifications, player bet failure rollback, player validation notifications, and mobile wager controls.

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
  seed.js           # Database seeding script
src/
  components/       # Reusable UI components
  pages/            # Route-level pages (HostView, PlayerView, MarketPage, etc.)
  hooks/            # Custom hooks (useRoom, useWebSocket, useSession, useMarketChart, etc.)
  lib/              # Pure logic (lmsr.ts, botEngine.ts)
  services/         # External API clients (cogneeService.ts)
  data/             # Property data loader
sean/               # Python prototype (FastAPI, reference implementation)
```
