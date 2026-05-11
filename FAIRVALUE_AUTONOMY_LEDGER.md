# FairValue Autonomy Ledger

## North-Star Goal

Transform FairValue into a trusted real-time real estate prediction-market operating system with multiplayer rooms, property intelligence, market integrity, AI analysis, durable realtime infrastructure, polished UX, and continuously expanding verification.

## Current Runtime Status

- Baseline dependency install: `npm ci` completed on 2026-05-10 with deprecation warnings and 47 reported npm audit vulnerabilities.
- Baseline backend load before patch failed because `DATABASE_URL` was missing and `server/db.js` called Neon at module load.
- Backend now supports local degraded database mode when `DATABASE_URL` is missing.
- Cognee AI now routes through server endpoints and degrades when `COGNEE_API_KEY` is missing.
- Local verification stack ran with backend on `http://localhost:8000` and frontend on `http://localhost:3001`.
- Local frontend WebSockets now connect directly to the backend in CRA dev mode when the frontend runs on a different port.

## Current Test Status

- 2026-05-10 baseline before patch: `npm test -- --watchAll=false` passed, 3 suites / 30 tests.
- 2026-05-10 baseline before patch: `npm run build` passed with one warning for an unused `priceOver` import in `src/hooks/useRoom.ts`.
- 2026-05-10 post-patch: `npm run verify` passed: client secret scan, 4 test suites / 33 tests, and production build.
- 2026-05-10 host-authority pass: `npm run verify` passed: client secret scan, server authority tests, 4 React/Jest suites / 33 tests, and production build.

## Current Known Risks

- Rotate the Cognee key that was previously committed in client code; treat it as compromised.
- Host-only settlement and AI toggles now require a room host capability token, but durable user identity is still missing.
- Room state is still in memory and will not survive process restart.
- LMSR math remains duplicated between frontend and backend.
- npm audit currently reports 47 vulnerabilities, including 28 high severity.
- Full API, WebSocket, E2E, load, accessibility, and security test layers are still missing.

## Current Backlog Ranked By Impact

1. Align room-code generation, UI validation, and API tests.
2. Add API/WebSocket tests for create room, join, bet, leaderboard, and settlement.
3. Add idempotency keys, validation, rate limits, and request correlation IDs.
4. Create an append-only room event log with replay tests.
5. Unify backend and frontend LMSR logic behind one shared domain boundary.
6. Add Playwright E2E coverage for host/player room flow.
7. Address npm audit vulnerabilities without breaking CRA compatibility.

## Iteration History

### 2026-05-10 - Secret Boundary And Local Degraded Runtime

- Installed dependencies with `npm ci`.
- Ran baseline tests and production build.
- Confirmed the exposed Cognee key was present in `src/services/cogneeService.ts`.
- Moved Cognee calls behind `/api/ai/cognee/*` server routes.
- Removed Cognee credential headers and direct Cognee URL usage from browser service code.
- Added graceful missing-key degraded behavior for the AI Analyst.
- Added `.env.example` and README environment/rotation documentation.
- Added `scripts/scan-client-secrets.js`, `npm run scan:secrets`, and `npm run verify`.
- Added Jest coverage proving the browser client calls local AI routes and that the old key/header are absent from client source.
- Made `server/db.js` boot in degraded mode when `DATABASE_URL` is missing.
- Removed the unused `priceOver` import that caused the baseline build warning.
- Made no-DB chart endpoints return empty chart data instead of browser-visible 500s.
- Fixed backend WebSocket upgrades for `/ws/:roomCode`.
- Added CRA dev-mode WebSocket base selection so local React ports connect to backend port `8000`.
- Added settlement payloads to room state and join responses so polling/reconnect recovery can render settlement results without relying on WebSocket delivery.

### 2026-05-10 - Host Authority Capability Token

- Added a server-generated `host_token` to room creation responses only.
- Required `X-FairValue-Host-Token` for settlement and AI toggle routes.
- Stored host tokens in `sessionStorage` under the room-specific host key when the host creates a room.
- Sent the host token from host controls and settlement modal.
- Disabled host controls when a host page is opened without the room capability.
- Added server integration tests proving join/state do not expose host tokens, players cannot settle/toggle AI, and the creator token can settle/toggle.
- Updated `npm run verify` to include `npm run test:server`.

## Commands Run And Results

- `git status --short --branch` -> `## main...origin/main [ahead 1]`.
- `npm test -- --watchAll=false` before dependency install -> failed because `react-scripts` was missing.
- `npm run build` before dependency install -> failed because `react-scripts` was missing.
- `npm ls --depth=0` before dependency install -> all package dependencies were unmet.
- `npm ci` -> installed 1391 packages; npm reported 47 vulnerabilities.
- `npm test -- --watchAll=false` -> passed, 3 suites / 30 tests.
- `npm run build` -> passed with one unused import warning.
- `node -e "require('./server/db'); console.log('db module loaded')"` before patch -> failed because `DATABASE_URL` was missing.
- Secret boundary scan before patch -> confirmed the old Cognee key was in `src/services/cogneeService.ts`.
- `npm run scan:secrets` -> passed.
- `npm test -- --watchAll=false` after secret-boundary patch -> passed, 4 suites / 33 tests.
- `npm run build` after secret-boundary patch -> passed without warnings.
- API smoke through `http://127.0.0.1:8000` -> created room `DOXM`, direct WebSocket opened, two joins returned 200, two bets advanced trades from 1 to 2, room state included settlement `over`, and missing Cognee key returned degraded 503.
- Browser smoke through Playwright fallback -> `/`, `/market/440298192`, `/join`, `/host/HMA7`, and two `/play/HMA7` mobile pages rendered; host and players showed `Connected`; two players placed bets; leaderboard and activity feed updated; settlement rendered on host and both players.
- `npm run verify` final -> passed: `scan:secrets`, 4 Jest suites / 33 tests, production build.
- `npm run test:server` -> passed 3 host-authority tests.
- `npm run verify` after host-authority patch -> passed: `scan:secrets`, `test:server`, React/Jest tests, production build.
- Host-token API smoke through `http://127.0.0.1:8000` -> room `M8QP` returned a host token, join/state did not leak it, WebSocket opened, settle/toggle without or with fake token returned 403, valid host token toggled AI on/off and settled `over`.
- Browser host-token smoke through Playwright fallback -> room `EHPA` stored host token in host `sessionStorage`, player had no token, player settle attempt returned 403, host controls were enabled, and host UI settlement rendered on host/player.

## Screens And Routes Verified

- `/` at `http://localhost:3001/` rendered FairValue browse.
- `/market/440298192` rendered a solo property market without a framework overlay.
- `/join` created a room through the real UI.
- `/host/HMA7` rendered host cockpit, connected realtime status, leaderboard, activity feed, and settlement.
- `/play/HMA7` rendered two mobile player sessions, connected realtime status, betting controls, and settlement result.
- `/host/EHPA` verified host-token-backed controls and settlement.
- `/play/EHPA` verified player session did not receive host token and saw settlement result.

## Screenshots Or Traces

- `/tmp/fairvalue-home.png`
- `/tmp/fairvalue-market.png`
- `/tmp/fairvalue-host.png`
- `/tmp/fairvalue-player-mobile.png`
- `/tmp/fairvalue-settled.png`
- `/tmp/fairvalue-host-token-settled.png`

## Commits Made

- `7df90d6` - Harden AI boundary and realtime recovery.
- `b1936cb` - Protect host-only room controls.

## Next Action Queue

1. Align room-code generation, join validation, UI copy, and API tests.
2. Add backend API/WebSocket integration tests for joins, bets, settlement, and reconnect state recovery.
3. Add idempotency keys and payload validation for betting.
4. Add server-side rate limits and request correlation IDs.
5. Start the next loop with `npm run verify`, then attack the room-code contract.
