# FairValue

Real-time multiplayer real estate prediction market. Players bet on whether a property will appraise above or below its listing price using an LMSR automated market maker.

## How It Works

A host creates a room and selects a property. Players join via QR code or room code from their phones and place bets on whether the property's actual value is **over** or **under** the asking price. An LMSR (Logarithmic Market Scoring Rule) market maker provides infinite liquidity and continuous price discovery. An optional AI bot adds contrarian trading activity to keep markets liquid.

## Modes

- **Multiplayer** — Host creates a room at `/join`, gets a 4-letter code. Players scan QR or go to `/play/:roomCode` to bet from their phones. Host views live dashboard at `/host/:roomCode` with chart, leaderboard, and activity feed.
- **Solo browsing** — Browse market cards at `/` and view individual markets at `/market/:propertyId` with chart and trading panel.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Create React App |
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

# In another terminal, start the frontend (port 3000)
npm start
```

The frontend dev server proxies `/api` and `/ws` to `localhost:8000`.

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
  ├── Cognee AI API (market analysis chat)
  └── IndexedDB (local image cache)
```

### Frontend

- **Routing** (React Router v7): `/` browse, `/join` create/join room, `/host/:roomCode` host dashboard, `/play/:roomCode` player UI, `/market/:propertyId` solo market
- **State management:** React hooks only, no global store
- **Styling:** CSS custom properties (`--bg-primary: #1F2A36`, `--accent-primary: #4BA3FF`), dark theme

### Backend (`server/index.js`)

- **Rooms** are ephemeral in-memory objects (players, connections, market state, activity feed)
- **Trades** are persisted to Neon on every bet
- **Solo market simulation** runs on startup — contrarian AI bot trades every 15s per market to generate 24/7 activity
- **WebSocket** broadcasts `bet`, `join`, `ai_trade`, `settle` events to all room connections

### LMSR Market Maker (`src/lib/lmsr.ts`)

- Cost function: `b * ln(e^(qOver/b) + e^(qUnder/b))`
- Default liquidity parameter `b = 100`
- Binary search to find shares for a given dollar budget
- Shared between frontend (solo mode) and backend (multiplayer)

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
- **Cognee AI** — knowledge graph API for AI market analysis chat
- **Zillow** — static property dataset (7.87 MB, `public/data/properties.json`)
- **TradingView Lightweight Charts** — dual-axis probability/fair-value charting
- **QR Code** (`qrcode.react`) — room join codes on host dashboard
- **ngrok** (optional) — public URL for QR codes when on LAN

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
