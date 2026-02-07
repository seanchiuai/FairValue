# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FairValue is a real estate prediction market application where users bet on whether properties will appraise above or below listing price. The market uses a Logarithmic Market Scoring Rule (LMSR) automated market maker. The UI is inspired by Polymarket's dark theme design.

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm start

# Run tests (watch mode)
npm test

# Production build
npm run build
```

## Architecture

**Frontend:** React 19 + TypeScript (Create React App). Mixed `.tsx` and `.jsx` files.

**Routing** (React Router v7 in `src/App.tsx`):
- `/` → `Markets.jsx` — grid of property market cards with search, filtering, sorting
- `/market/:propertyId` → `MarketPage.tsx` — individual market detail with live chart and trading panel

**Data flow:** Currently uses mock data from `src/data/properties.ts`. The intended architecture connects to a backend API serving LMSR market state. The backend API contract is documented in `sean/ALGORITHM.md` (endpoints: `/api/market`, `/api/bet`, `/api/tick`, `/api/house`, `/api/history`, `/api/reset`).

**Image storage:** Client-side only via IndexedDB (browser). The `useMarketImages` hook (`src/hooks/useMarketImages.js`) manages image upload/retrieval/deletion using an IndexedDB database named "fairvalue" with a "marketImages" object store.

**Charting:** `MarketPage.tsx` uses `lightweight-charts` (TradingView) for real-time price history visualization.

**Styling:** CSS-in-JS via inline `<style>` tags in components (e.g., `Markets.jsx`) and co-located `.css` files (e.g., `MarketPage.css`, `PropertyCard.css`). Global design tokens in `src/index.css`. Dark theme with slate-blue palette (`#1F2A36` background, `#4BA3FF` accent).

**State management:** React hooks only (useState, useEffect, useRef). Props drilling, no global state library.

**Icons:** `lucide-react` throughout all components.

## Key Conventions

- The `sean/` folder is a test prototype backend — not part of the main application
- Components use a mix of TypeScript (`.tsx`) and JavaScript (`.jsx`)
- ESLint config extends `react-app` (configured in `package.json`)
- The npm package name is `mission-betting` (legacy name in `package.json`)

non-negotiable: commit all changes. commit all changes. commit all changes.