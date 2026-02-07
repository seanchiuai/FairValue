# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FairValue is a real-time multiplayer real estate prediction market. Players bet on whether a property will appraise above or below its listing price. The market uses a Logarithmic Market Scoring Rule (LMSR) automated market maker. Dark-themed UI inspired by Polymarket.

## Development Commands

```bash
npm install          # Install dependencies
npm start            # Dev server on http://localhost:3000
npm test             # Tests in watch mode
npm run build        # Production build
```

The frontend dev server proxies `/api` → `http://localhost:8000` and `/ws` → `ws://localhost:8000` (configured in `src/setupProxy.js`). A backend server must be running on port 8000 for multiplayer features.

## Architecture

**Frontend:** React 19 + TypeScript, Create React App. Mixed `.tsx`/`.jsx` files.

**Two modes of operation:**
1. **Solo browsing** — `/` shows mock market cards from `src/data/properties.ts`; `/market/:propertyId` shows a single-market detail with chart and trading panel.
2. **Multiplayer rooms** — The primary flow. A host creates a room via `/join`, gets a 4-letter room code, then views the host dashboard at `/host/:roomCode`. Players scan a QR code or navigate to `/play/:roomCode` to join and bet from their phones.

**Routing** (React Router v7, `src/App.tsx`):
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Markets.jsx` | Browse mock market cards |
| `/join` | `JoinPage.tsx` | Create or join a multiplayer room |
| `/host/:roomCode` | `HostView.tsx` | Host dashboard (chart, leaderboard, QR, activity feed) |
| `/play/:roomCode` | `PlayerView.tsx` | Mobile player UI (bet panel, positions) |
| `/market/:propertyId` | `MarketPage.tsx` | Solo market detail page |

**Real-time layer:**
- `useWebSocket` hook manages a WebSocket connection to `/ws/:roomCode` with auto-reconnect and 30s keepalive pings
- `useRoom` hook combines HTTP fetch (`/api/rooms/:roomCode/state`) + WebSocket events to maintain market state, player list, activity feed
- `useSession` hook stores a UUID session ID and nickname in sessionStorage
- WebSocket message types: `bet`, `join`, `leave`, `ai_trade`, `settle`, `market_update`

**LMSR math** (`src/lib/lmsr.ts`): Pure functions for cost, price, implied price, and buy calculations. Default liquidity parameter `b = 100`.

**Bot engine** (`src/lib/botEngine.ts`): Client-side contrarian AI bot using mean-reversion + Gaussian noise. Configurable interval, strength, and share sizes. Toggled on/off via host dashboard.

**Room API endpoints** (backend, proxied through CRA):
- `POST /api/rooms` — create room
- `POST /api/rooms/:code/join` — join room
- `GET /api/rooms/:code/state` — full room state
- `POST /api/rooms/:code/bet` — place bet
- `POST /api/rooms/:code/toggle-ai` — toggle AI bot
- `POST /api/rooms/:code/settle` — settle market with actual price

**Charting:** `useMarketChart` hook wraps `lightweight-charts` (TradingView). Two lines: probability % (left axis, blue) and fair value $ (right axis, green). Points added on each bet or periodic tick.

**Image storage:** Client-side IndexedDB via `useMarketImages` hook (database: "fairvalue", store: "marketImages").

**Styling:** CSS custom properties in `src/index.css` define the design token system. Components use inline style objects (`const s: Record<string, React.CSSProperties>`) or co-located `.css` files. Palette: `--bg-primary: #1F2A36`, `--accent-primary: #4BA3FF`.

**State management:** React hooks only. No global state library.

**Icons:** `lucide-react` throughout.

## Key Conventions

- The `sean/` folder is a Python prototype backend — not part of the main React app
- Components use a mix of `.tsx` and `.jsx`
- ESLint extends `react-app` (configured in `package.json`)
- The npm package name is `mission-betting` (legacy name)
- `qrcode.react` generates QR codes for room join URLs on the host view
- Host can set a custom ngrok/public URL to generate correct QR codes for LAN/remote access

non-negotiable: commit all changes. commit all changes. commit all changes.
