# FairValue

Real-time multiplayer real estate prediction market. Players bet on whether a property will appraise above or below its listing price using an LMSR automated market maker.

## How It Works

A host creates a room and selects a property. Players join via QR code or room code from their phones and place bets on whether the property's actual value is **over** or **under** the asking price. An LMSR (Logarithmic Market Scoring Rule) market maker provides infinite liquidity and continuous price discovery. An optional AI bot adds contrarian trading activity to keep markets liquid.

## Modes

- **Multiplayer** — Host creates a room at `/join`, gets a 4-character code using letters and numbers. Players scan QR or go to `/play/:roomCode` to bet from their phones. Host views live dashboard at `/host/:roomCode` with chart, leaderboard, and activity feed.
- **Solo browsing** — Browse market cards at `/` and view individual markets at `/market/:propertyId` with chart and trading panel.
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

- **Routing** (React Router v7): `/` browse, `/join` create/join room, `/host/:roomCode` host dashboard, `/play/:roomCode` player UI, `/market/:propertyId` solo market
- **State management:** React hooks only, no global store
- **Styling:** CSS custom properties (`--bg-primary: #1F2A36`, `--accent-primary: #4BA3FF`), dark theme

### Backend (`server/index.js`)

- **Rooms** are live in-memory objects with JSON snapshot durability for local degraded mode (`.fairvalue/rooms.json` by default in the real server process)
- **Room event logs** are kept with each durable room snapshot so state can be reconstructed after a local backend restart
- **Trades** are persisted to Neon on every bet
- **Solo market simulation** runs on startup — contrarian AI bot trades every 15s per market to generate 24/7 activity
- **WebSocket** broadcasts `bet`, `join`, `ai_trade`, `settle` events to all room connections
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

## API Endpoints

### Multiplayer Rooms

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rooms` | Create room |
| POST | `/api/rooms/:code/join` | Join room |
| GET | `/api/rooms/:code/state` | Full room state |
| POST | `/api/rooms/:code/bet` | Place bet |
| POST | `/api/rooms/:code/settle` | Settle market |
| POST | `/api/rooms/:code/toggle-ai` | Toggle AI bot |
| GET | `/api/rooms/:code/leaderboard` | Leaderboard |

`POST /api/rooms` returns a `host_token` only to the creator. Host-only routes (`settle` and `toggle-ai`) require that value in the `X-FairValue-Host-Token` header. Join, state, player, and WebSocket payloads do not expose the token.

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
- **`ai_trade`** — bot trade with market update
- **`settle`** — settlement results with per-player payouts

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
- `COGNEE_API_KEY` enables the AI Analyst. It must stay server-side only and must never be added as a `VITE_*` variable.
- `COGNEE_BASE_URL` defaults to `https://api.cognee.ai`.
- `VITE_BACKEND_PORT` defaults local frontend WebSockets to the backend on port `8000` when Vite runs on another port.
- `VITE_WS_BASE_URL` can override the WebSocket base URL for non-standard local or deployed setups.
- `FAIRVALUE_ROOM_STORE=json` keeps the default local JSON snapshot adapter; `FAIRVALUE_ROOM_STORE=postgres` uses the Neon/Postgres `fairvalue_room_snapshots` table when `DATABASE_URL` is configured.
- `FAIRVALUE_ROOM_STORE_PATH` overrides the local durable room snapshot file. If unset, `npm run server` uses `.fairvalue/rooms.json`.
- `FAIRVALUE_ROOM_PERSISTENCE=off` disables local room snapshots and returns to fully ephemeral in-memory room state.
- `FAIRVALUE_ROOM_RETENTION_DAYS` defaults to `30` for local JSON snapshots and prunes only settled rooms whose last saved room event/activity is older than that window. Set it to `0` or `off` to disable local retention pruning.
- `FAIRVALUE_ROOM_SNAPSHOT_SECRET` encrypts the local JSON room snapshot file with AES-256-GCM. Set a stable private value before creating rooms; encrypted local snapshots cannot be read without the same value.
- `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS` enables opt-in retention pruning for `FAIRVALUE_ROOM_STORE=postgres`; it is disabled by default and deletes only settled room rows whose room event/activity timestamp or row `updated_at` is older than the configured window.
- `FAIRVALUE_LIVE_POSTGRES_SMOKE=1` lets `npm run test:persistence:live` create, read, and delete one temporary `FV**` room row in the configured `DATABASE_URL`; without it, that command only checks configuration/connectivity and table presence.
- `FAIRVALUE_REQUIRE_DATABASE_URL=1` makes the live persistence readiness command fail when `DATABASE_URL` is missing. `FAIRVALUE_ROOM_STORE=postgres` implies that requirement.
- `FAIRVALUE_LIVE_POSTGRES_DRIVER=postgres` can force the live readiness script to use a plain Postgres TCP client; otherwise it uses the app's Neon serverless driver for Neon hosts and the Postgres client for localhost.
- `FAIRVALUE_OPS_TOKEN` protects `/api/ops/metrics`. Local development allows metrics without a token, but production requires this value and accepts either `Authorization: Bearer <token>` or `X-FairValue-Ops-Token`.
- `FAIRVALUE_IDENTITY_SECRET` signs anonymous browser identities used for durable player sessions and host authority. Set a stable private value anywhere rooms need to survive server restarts.

Room snapshot note: `.fairvalue/` is git-ignored because snapshots include room host tokens. The Postgres adapter stores the same sensitive snapshot payload in `fairvalue_room_snapshots`, which it creates if missing. Treat both stores as sensitive runtime state. Restored rooms keep their market, players, event history, settlement, and bet idempotency receipts; AI bot intervals are not auto-resumed after a backend restart. Local JSON retention prunes settled rooms only; active rooms and rooms without a room-specific timestamp are kept. Postgres retention is opt-in and prunes settled rows only. If `FAIRVALUE_ROOM_SNAPSHOT_SECRET` is set, local JSON snapshots are saved as encrypted envelopes; existing plaintext snapshots still load and are rewritten encrypted on the next save. If a local JSON snapshot is malformed, startup quarantines it beside the original path as `.corrupt-*`, logs the quarantine path without snapshot contents, and continues with an empty room snapshot so operators can inspect or restore the file manually.

Security note: an older client-side Cognee key was committed in `src/services/cogneeService.ts`. Treat that key as compromised and rotate it before using Cognee in any environment.

HTTP hardening note: the Express server disables `X-Powered-By` and emits baseline browser security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Operations

- `GET /healthz` returns a minimal process health payload and is safe for basic uptime checks.
- `GET /readyz` reports whether the process is ready for its configured dependencies. Local degraded mode is ready without `DATABASE_URL`; `FAIRVALUE_REQUIRE_DATABASE_URL=1` or `FAIRVALUE_ROOM_STORE=postgres` makes the database requirement explicit.
- `GET /api/ops/metrics` returns an in-memory JSON snapshot for local triage: request counts/latency, room lifecycle counters, active room/player/connection counts, WebSocket counters, rate-limit rejections, database errors, persistence failures, and AI degraded/error counts. It does not include room host tokens or player payloads. Set `FAIRVALUE_OPS_TOKEN` before exposing it outside local development.
- `GET /metrics` exposes the same aggregate counters in Prometheus text format for an external scraper. It uses the same `FAIRVALUE_OPS_TOKEN` guard as `/api/ops/metrics`.

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

This prints a JSON report and exits non-zero until production-critical variables are set: `DATABASE_URL`, `FAIRVALUE_ROOM_STORE=postgres`, positive `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS`, non-default `FAIRVALUE_IDENTITY_SECRET`, enabled room persistence, and `FAIRVALUE_OPS_TOKEN`. Missing `COGNEE_API_KEY` is reported as a warning because the AI analyst can intentionally run degraded.

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

`test:e2e:isolated` starts fresh backend/frontend ports (`8010`/`3010`), enables the local room snapshot file at `/tmp/fairvalue-e2e-rooms.json`, and includes the host/player flow plus multiplayer burst, serious axe accessibility checks, and keyboard/screen-reader-adjacent checks across the browse page, property route, market trust explainer, host/player room trust notes, join forms, join-page create/join/host-auto-join API failure notifications, host/player room surfaces, settle modal, settlement recap trust notes, market-start room creation/host-auto-join failure notifications, settlement failure notifications, malformed settlement success handling, host-action failure notifications, malformed AI-toggle success handling, missing-key AI fallback, direct player join validation/API notifications, player bet failure rollback, player validation notifications, and mobile wager controls.

`test:e2e:matrix` starts fresh backend/frontend ports (`8030`/`3030`) and runs the rendered host/player room flow across Chromium, Firefox, and WebKit projects.

`test:e2e:restart` starts its own fresh backend/frontend on free local ports, keeps the rendered host/player pages open, restarts the real backend process against `/tmp/fairvalue-browser-restart-rooms.json`, runs retrying API load waves while the backend is down and recovering, and verifies room recovery, post-restart betting, settlement, and settled-state reload.

`test:e2e:restart:matrix` runs that same restart/load recovery proof across Chromium, Firefox, and WebKit, using `/tmp/fairvalue-browser-restart-matrix-rooms.json`.

`test:e2e:soak` starts fresh backend/frontend ports (`8031`/`3031`) and runs a longer API/WebSocket join-bet wave profile against `/tmp/fairvalue-e2e-soak-rooms.json`, including idempotency replay, settlement, and snapshot reconciliation.

`test:e2e:browser-load` starts fresh backend/frontend ports (`8032`/`3032`) and runs a rendered browser load profile: one desktop host plus 10 mobile player pages join concurrently, bet concurrently, receive settlement, and reconcile the persisted snapshot. Set `FAIRVALUE_BROWSER_LOAD_PLAYERS=4..16` to tune the rendered player count locally.

`test:e2e:mixed-traffic` starts fresh backend/frontend ports (`8033`/`3033`) and runs a mixed profile: one desktop host, throttled rendered mobile clients, concurrent API join/bet churn, state polling, settlement broadcast checks, console/page-error checks, and snapshot reconciliation. Tune with `FAIRVALUE_MIXED_SLOW_PLAYERS=2..8` and `FAIRVALUE_MIXED_API_PLAYERS=4..20`.

`test:latency:restart` starts a real backend on a free local port, drives create/join/bet/state traffic through a backend restart, records latency percentiles plus restart/recovery timing, and fails if the local latency budgets regress.

`test:performance:cold` builds the production Vite bundle with a fresh backend port, serves `dist` through a local static/proxy server, then drives cold `/join` room creation, cold `/play/:roomCode` player join, bet sync, and settlement broadcast timing through headless Chromium with explicit local budgets.

`test:a11y:assistive` starts fresh backend/frontend ports, opens headed Playwright Chrome with renderer accessibility enabled, captures the macOS accessibility tree plus Playwright ARIA snapshots for join, host, settle, and player flows, and writes `docs/accessibility-assistive-tech-notes.md`. It is intentionally not part of `npm run verify` because it opens a headed browser window.

`test:persistence:postgres` requires Docker. It starts a disposable `postgres:16-alpine` container, verifies the Postgres room snapshot adapter against a real database, and removes the container afterward.

`test:persistence:live` is the production database readiness gate. With no `DATABASE_URL`, it records a local degraded/skip result unless `FAIRVALUE_REQUIRE_DATABASE_URL=1` or `FAIRVALUE_ROOM_STORE=postgres` is set. With `DATABASE_URL` configured, it verifies live connectivity and whether `fairvalue_room_snapshots` exists. Set `FAIRVALUE_LIVE_POSTGRES_SMOKE=1` to run the non-destructive live write/read/delete path against a single temporary `FV**` room row; it never calls the whole-table snapshot replacement path against a live database.

## Project Structure

```
server/
  index.js          # Express + WebSocket backend
  db.js             # Neon database connection
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
