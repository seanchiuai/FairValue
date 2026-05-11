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
- Betting now requires idempotency keys, room mutations validate payloads server-side, guarded API routes have in-memory rate limits, and every API response includes a correlation ID.
- Rooms now emit append-only events for creation, joins, reconnect/leave, bets, AI phase changes, AI trades, settlement, and room-scoped errors; host-only audit and replay endpoints reconstruct room state from the event stream.
- Backend and frontend LMSR/domain behavior now routes through `src/lib/marketEngine.js`; server room markets use the canonical snake_case market state shape.
- Playwright E2E now runs the primary host/player room loop through the real CRA frontend and backend with managed web servers, Chromium execution, and retained screenshots/traces/videos on failure.
- Runtime dependencies are now separated from CRA/test/type tooling; `npm audit --omit=dev` reports zero vulnerabilities after removing the unused `codex` package and applying compatibility-safe overrides.
- Rooms, room event logs, settlement state, and bet idempotency receipts now survive local backend restarts through file-backed JSON snapshots at `.fairvalue/rooms.json` by default, with `FAIRVALUE_ROOM_STORE_PATH` and `FAIRVALUE_ROOM_PERSISTENCE=off` controls.
- CRA dev proxying now honors the same backend target env as the WebSocket client, so `/api` and `/ws` both point at the intended backend when fresh E2E/dev servers run on non-default ports.
- Browser E2E now has an isolated fresh-server script, a multiplayer burst/API/WebSocket test, and a serious axe accessibility gate over join, host, and mobile player surfaces.
- Accessibility pass tightened the app color tokens and added missing names for the AI send button, public URL input, QR SVG, and host settle button contrast.
- Negative-path browser coverage now exercises malformed/nonexistent room-code errors, fake host-token settlement rejection, join rate-limit retry metadata, and missing Cognee-key AI Analyst degradation.
- Host capability errors now distinguish missing host tokens from invalid host tokens so UI feedback can tell the host what actually failed.
- Server verification now includes a real backend child-process restart test that creates a room, joins, places a bet, kills and restarts the backend against the same snapshot file, proves restored state/idempotency, settles, then restarts again to prove settlement recovery.
- Browser restart recovery now has a dedicated Playwright harness that owns fresh backend/frontend child processes, keeps rendered host/player pages open, restarts the real backend against `/tmp/fairvalue-browser-restart-rooms.json`, and proves reconnect, post-restart betting, settlement, and settled reload.
- Restart E2E now drives one host plus two player browser contexts through three repeated pre-settlement backend restart cycles, a post-reconnect bet, settlement, and a final reload-after-restart recovery.
- Room persistence now has an adapter boundary: JSON remains the default local store, while `FAIRVALUE_ROOM_STORE=postgres` targets a Neon/Postgres `fairvalue_room_snapshots` table and startup can await async room loads before listening.
- Postgres room persistence now has a Docker-backed smoke command that verifies the adapter against a real disposable `postgres:16-alpine` database and removes the container afterward.
- Critical room mutations now wait for configured durable snapshot writes and return `503 Room persistence failed` instead of claiming success when create/join/bet/settle persistence fails.
- Browser sessions now use server-issued signed `fv1` user identity tokens persisted in `localStorage`, with nickname/session migration preserved for existing browser state.
- Room creation can bind a durable `host_user_id`; host-only controls accept that signed user identity while legacy room host tokens remain supported for old rooms and negative-path validation.
- Player join and bet requests now send authenticated user IDs from the browser and reject forged token/session mismatches when a user token is present.
- AI bot interval trades now wait for configured room snapshot persistence before broadcasting; persistence failures disable the bot, stop its interval, expose `durability_error`, and emit a room durability failure event.
- Host-only auth/audit errors now wait for durable room error-event persistence; if persistence fails, the response returns `503 Room persistence failed` instead of claiming a normal `403` authorization result.
- Browser E2E now has explicit matrix and soak commands: `test:e2e:matrix` runs the rendered host/player flow across Chromium, Firefox, and WebKit, while `test:e2e:soak` runs a 24-player API/WebSocket wave profile with idempotency replay, settlement, and snapshot reconciliation.
- Connected room clients now perform low-frequency state reconciliation while WebSocket remains primary, so rendered state can heal if a browser misses an otherwise successful broadcast.
- Restart E2E now combines rendered backend restart recovery with retrying API load waves while the backend is down and recovering, ending with 15 players, 15 trades, settlement, and snapshot reconciliation in the Chromium restart harness.
- Expanded accessibility E2E now covers browse/search/sort, property detail, mobile create/join forms, host settle modal, missing-key AI fallback, and mobile custom-wager states; expected Cognee missing-key 503 resource errors are asserted as degraded-path evidence while other console/page errors still fail.
- Keyboard and screen-reader-adjacent E2E now verifies browse search clear, sort menu keyboard selection/Escape/focus restoration, join-mode keyboard entry/autofocus/error alerts, settle dialog initial focus/Escape/focus restoration, missing-key AI alert semantics, and mobile wager keyboard activation.

## Current Test Status

- 2026-05-10 baseline before patch: `npm test -- --watchAll=false` passed, 3 suites / 30 tests.
- 2026-05-10 baseline before patch: `npm run build` passed with one warning for an unused `priceOver` import in `src/hooks/useRoom.ts`.
- 2026-05-10 post-patch: `npm run verify` passed: client secret scan, 4 test suites / 33 tests, and production build.
- 2026-05-10 host-authority pass: `npm run verify` passed: client secret scan, server authority tests, 4 React/Jest suites / 33 tests, and production build.
- 2026-05-10 room-code contract pass: `npm run verify` passed: client secret scan, 6 server tests, 4 React/Jest suites / 33 tests, and production build.
- 2026-05-10 multiplayer protocol pass: `npm run verify` passed: client secret scan, 7 server tests, 4 React/Jest suites / 33 tests, and production build.
- 2026-05-10 server-authority pass: `npm run verify` passed: client secret scan, 11 server tests, 4 React/Jest suites / 33 tests, and production build.
- 2026-05-10 event-log pass: `npm run verify` passed: client secret scan, 13 server tests, 4 React/Jest suites / 33 tests, and production build.
- 2026-05-10 unified-market-engine pass: `npm run verify` passed: client secret scan, 13 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-10 Playwright E2E pass: `npm run test:e2e` passed 1 Chromium test covering host create, two player joins, bets, leaderboard/activity updates, AI toggle, reconnect/refresh, and settlement.
- 2026-05-10 post-E2E pass: `npm run verify` passed: client secret scan, 13 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-10 dependency audit pass: `npm audit --omit=dev --json` reported 0 vulnerabilities; full `npm audit --json` reported only 2 moderate dev-only findings from CRA's `webpack-dev-server`; `npm run verify` and `npm run test:e2e` passed.
- 2026-05-10 durable room snapshot pass: `npm run test:server` passed 14 server tests, `npm run verify` passed client secret scan, 14 server tests, 5 React/Jest suites / 41 tests, and production build, and fresh-port `npm run test:e2e` passed on frontend `3010` / backend `8010` with file-backed room snapshots enabled.
- 2026-05-10 load/accessibility pass: `npm run test:e2e:isolated` passed 3 Chromium tests on fresh frontend `3010` / backend `8010`; `npm run verify` passed client secret scan, 14 server tests, 5 React/Jest suites / 41 tests, and production build; production audit stayed clean.
- 2026-05-10 negative-path pass: `npm run test:e2e:isolated` passed 7 Chromium tests on fresh frontend `3010` / backend `8010`; `npm run verify` passed client secret scan, 14 server tests, 5 React/Jest suites / 41 tests, and production build; production audit stayed clean.
- 2026-05-10 real backend restart recovery pass: `node --test server/__tests__/restartPersistence.test.js` passed 1 child-process restart test, and `npm run verify` passed client secret scan, 15 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-10 browser restart recovery pass: `npm run test:e2e:restart` passed 1 Chromium host/player backend-restart test; `npx playwright test --list` confirmed the default suite remains 7 tests in 3 files; `npm run verify` passed client secret scan, 15 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-10 persistence adapter pass: `npm run test:server` passed 19 server tests including fake-Postgres adapter coverage; `npm run test:e2e:restart` passed 1 browser restart test; `npm run verify` passed client secret scan, 19 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-10 disposable Postgres smoke pass: `npm run test:persistence:postgres` passed against Docker `postgres:16-alpine`; `npm run verify` passed client secret scan, 19 server tests, 5 React/Jest suites / 41 tests, and production build; production audit stayed clean and full audit stayed at the known 2 moderate CRA dev findings.
- 2026-05-10 durable-write failure pass: `npm run test:server` passed 20 server tests including forced persistence-failure 503s; `npm run test:e2e:restart` passed 1 Chromium restart test; `npm run verify` passed client secret scan, 20 server tests, 5 React/Jest suites / 41 tests, and production build; `npm run test:persistence:postgres` stayed green.
- 2026-05-11 durable identity pass: `npm run verify` passed client secret scan, 22 server tests, 5 React/Jest suites / 41 tests, and production build; `npm run test:e2e:isolated` passed 7 Chromium tests; `npm run test:e2e:restart` passed 1 Chromium restart test.
- 2026-05-11 sustained restart pass: `npm run test:e2e:restart` passed the 3-context / 3-cycle restart recovery test; `npm run verify` passed client secret scan, 22 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-11 AI/audit durability pass: `npm run test:server` passed 24 server tests; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build; `npm run test:e2e:isolated` passed 7 Chromium tests; `npm run test:e2e:restart` passed the sustained restart test.
- 2026-05-11 browser matrix/soak pass: `npm run test:e2e:matrix` passed Chromium, Firefox, and WebKit rendered host/player flows; `npm run test:e2e:soak` passed the 24-player wave profile; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build; `npm run test:e2e:isolated` passed 7 Chromium tests; `npm run test:e2e:restart` passed the sustained restart test.
- 2026-05-11 restart/load combination pass: `npm run test:e2e:restart` passed the rendered restart test with retrying load waves during backend outage/recovery; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-11 expanded accessibility route pass: `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` passed 3 Chromium tests; `npm run test:e2e:isolated` passed 8 Chromium tests; `npm run test:e2e:matrix` passed Chromium, Firefox, and WebKit rendered host/player flows; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-11 keyboard accessibility pass: `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` passed 4 Chromium tests; `npm run test:e2e:isolated` passed 9 Chromium tests; `npm run test:e2e:matrix` passed Chromium, Firefox, and WebKit rendered host/player flows; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build.

## Current Known Risks

- Rotate the Cognee key that was previously committed in client code; treat it as compromised.
- Host-only settlement and AI toggles now accept durable signed host identity for newly created rooms while still supporting legacy room host tokens.
- Room connections, rate-limit buckets, and AI bot intervals are still process-local; restored rooms intentionally do not auto-resume AI intervals after restart.
- The Postgres snapshot adapter is covered by fake-SQL tests and disposable local Postgres, but not by a live Neon smoke in this environment.
- Room snapshot persistence still lacks retention policy, corruption recovery, and encryption-at-rest.
- Room snapshots include host capability tokens, so `.fairvalue/` must remain local runtime state and out of git.
- Shared LMSR/domain logic is still implemented as CommonJS under `src/lib` so CRA and Node can both consume it; this is intentional but should be revisited if the build system changes.
- Load coverage now includes a bounded synthetic burst and a 24-player wave soak, but not a k6-style latency profile, browser-driven high-concurrency soak, or production-like traffic mix.
- Accessibility coverage now gates serious/critical axe violations plus keyboard/screen-reader-adjacent behavior on the most important browse, join, host, player, settle, and AI fallback states; it still does not cover every route, every possible modal branch, or real assistive-technology/manual VoiceOver behavior.
- Full npm audit still reports 2 moderate dev-only `webpack-dev-server` findings through `react-scripts`; production/runtime audit is clean.
- Broader accessibility and deeper security test layers are still missing.
- Restart recovery is proven for one rendered Chromium host/two-player path across repeated backend restarts and retrying API load waves, but restart recovery itself is not yet multi-engine or k6/latency-profiled.

## Current Backlog Ranked By Impact

1. Add real assistive-technology/manual VoiceOver notes and any remaining route/modal accessibility states.
2. Add a browser-engine restart matrix or k6-style latency profile for restart/load paths.
3. Plan a CRA toolchain migration to remove the residual dev-server audit findings.

## Iteration History

### 2026-05-11 - Keyboard Accessibility Flow Coverage

- Added a Playwright keyboard/screen-reader-adjacent test for browse search, clear-search, sort-menu selection, sort Escape close, join-mode keyboard entry, validation alert semantics, host settle dialog focus behavior, missing-key AI alert semantics, and mobile wager keyboard activation.
- Added explicit label associations and `role="alert"` validation errors to create/join room forms.
- Added sort-menu `aria-expanded`, `aria-haspopup`, `role="menu"`, `role="menuitemradio"`, Escape close, and focus restoration after option selection.
- Added settle dialog description wiring, actual-price label association, error alert semantics, and focus restoration to the Settle button after Escape/close.
- Added AI chat `role="log"` semantics and alert semantics for degraded missing-key AI responses without introducing console errors.
- Documented the keyboard/screen-reader-adjacent isolated E2E scope in `README.md`.

### 2026-05-11 - Expanded Accessibility Route Coverage

- Added an expanded Playwright/axe test that visits the browse route, sort menu, property detail route, mobile create-room form, mobile join-room form, host settle modal, missing-key AI degraded response, and mobile custom-wager state.
- Preserved strict console/page-error gating while treating the expected Cognee missing-key `initialize`, `state`, and `search` 503s as explicit degraded-path evidence.
- Added accessible names for the browse search input and clear-search button.
- Darkened low-contrast browse, card, map, sparkline, market detail, status, and player-control colors uncovered by axe.
- Fixed the Leaflet grey price marker contrast, map popup metadata/link contrast, host settle modal cancel-button contrast, and bright green/red trade button gradients.
- Documented the broader isolated E2E accessibility scope in `README.md`.

### 2026-05-11 - Restart Load Combination Coverage

- Added retrying API load waves inside `e2e/restart-recovery.spec.ts` while the backend is intentionally stopped and restarted.
- Each of three backend restart cycles now starts four API load players that retry through connection failures, join after recovery, place idempotent bets, and prove at least one failed attempt occurred during the outage window.
- Updated rendered host assertions after every restart cycle to verify recovered player count, total trades, total volume, leaderboard entries, and the original mobile player positions.
- Expanded final snapshot assertions to require the expected player count, trade count, and settled state after recovery plus load.
- Documented the stronger restart harness behavior in `README.md`.

### 2026-05-11 - Browser Matrix And Load Soak Coverage

- Added `playwright.matrix.config.ts` and `npm run test:e2e:matrix` for the rendered host/player room flow across Chromium, Firefox, and WebKit.
- Added `playwright.soak.config.ts`, `npm run test:e2e:soak`, and `e2e/load-soak.spec.ts` for 4 waves / 24 players, 24 bets, WebSocket broadcast counts, idempotency replay, settlement, and snapshot reconciliation.
- Kept the default Playwright config focused by excluding the heavier soak spec from `test:e2e` / `test:e2e:isolated`.
- Made the host/player E2E fixture Firefox-compatible by using touch-capable player contexts without Firefox's unsupported `isMobile` option.
- Added connected-state room reconciliation in `useRoom` so rendered pages recover from rare missed broadcasts while keeping WebSocket as the primary realtime path.
- Documented the new matrix and soak commands in `README.md`.

### 2026-05-11 - AI And Audit Durability Status

- Made AI bot ticks append AI trade events and await room snapshot persistence before broadcasting `ai_trade`.
- Added AI persistence-failure handling that disables the bot, stops its interval, records `durability_error`, and emits `room_durability_failed`.
- Made host capability and identity failures persist audit error events before returning `403`; failing audit persistence now returns `503`.
- Added room snapshot/state support for `durabilityError` / `durability_error` so operators can see the last response-critical persistence failure.
- Added focused server tests for host-only audit persistence failure and AI tick durability failure.

### 2026-05-11 - Durable Browser Identity And Host Authority

- Added `/api/identity` to mint server-signed anonymous browser identities.
- Added HMAC-backed `fv1.user_id.signature` validation with `FAIRVALUE_IDENTITY_SECRET` documentation.
- Bound newly created rooms to `host_user_id` when the creator supplies a valid user token.
- Let host-only event replay, AI toggles, and settlement accept either legacy host tokens or the bound durable host identity.
- Added user-token validation to joined player and bet routes so forged session IDs are rejected when an authenticated identity is present.
- Moved the browser session hook from `sessionStorage`-only UUIDs to durable `localStorage` identity records with nickname migration.
- Updated join, market-start, host, player, room, and settlement flows to send signed user tokens while preserving legacy host-token fallback.
- Added server tests for identity minting, host identity controls without room host tokens, and forged join/bet rejection.
- Verified the rendered host/player browser paths with full isolated E2E and restart E2E after the auth migration.

### 2026-05-11 - Sustained Restart Recovery Coverage

- Expanded the rendered restart E2E from one host/player pair to one host and two separate player browser contexts.
- Added three repeated pre-settlement backend restart cycles while all rendered pages remain open and must surface reconnecting then return to connected state.
- Verified state after every restart cycle: player count, leaderboard entries, trade count, and both players' positions.
- Added a post-reconnect bet before settlement to prove the recovered room remains writable after repeated restarts.
- Kept the final settlement, second backend restart, page reload, settled state, and persisted snapshot assertions.
- Raised the restart test timeout to match the larger recovery profile while retaining the same isolated dynamic-port process harness.

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

### 2026-05-10 - Room-Code Contract

- Made `A-Z0-9` the canonical 4-character room-code schema.
- Added shared backend normalization and validation for room-code route params.
- Kept generated codes on the same schema and exported the normalizer for server tests.
- Updated join UI normalization, placeholder, and error copy to accept letters and numbers.
- Updated README room-code copy and local WebSocket run notes.
- Added server tests for generated code shape, lowercase normalization, invalid codes, nonexistent rooms, and successful alphanumeric joins.

### 2026-05-10 - Multiplayer API And WebSocket Coverage

- Added a full server integration test for room creation, two joins, WebSocket join broadcasts, bets, leaderboard, settlement broadcasts, and recovered room state.
- Fixed join WebSocket broadcasts to include the same activity entry stored in the room event feed.
- Verified that state recovery after socket closure includes settlement payload, activity tail, players, and final market trade count.

### 2026-05-10 - Server Authority And Request Guardrails

- Added server-side payload validation for room creation, joins, bets, and settlement so invalid input returns `400` before mutating room state.
- Required `Idempotency-Key` for player bets, persisted in-room bet receipts, replayed identical duplicate submissions, and rejected key reuse with a different bet payload as `409`.
- Updated the React room hook to send a fresh idempotency key with every betting request.
- Added request correlation IDs through `X-Request-Id` response headers and structured request-completion logs.
- Added route-level in-memory rate limits for room creation, joins, bets, settlement, AI toggles, and Cognee AI routes.
- Added server tests for bad payloads, duplicate bet replay, conflicting idempotency reuse, concurrent bets, rate limiting, and request ID echo.

### 2026-05-10 - Durable Room Event Log

- Added `server/roomEventLog.js` with deterministic in-memory append-only storage, per-room sequence IDs, cursor reads, activity projection, and replay reconstruction.
- Wired room creation, joins, WebSocket reconnect/leave, bets, AI toggles, AI trades, settlement, and room-scoped errors into the event stream.
- Added host-token-protected `/api/rooms/:code/events` and `/api/rooms/:code/replay` endpoints for audit, support, and deterministic recovery.
- Made room state responses include `event_sequence` and derive visible activity from replayed events.
- Added tests for event ordering, cursor reads, replay state, host-only audit access, and settlement reconstruction.

### 2026-05-10 - Unified Market Engine

- Added `src/lib/marketEngine.js` as the single shared LMSR/domain implementation for CRA and the Node server.
- Moved stable LMSR cost/price math, implied value, canonical market-state construction, public market formatting, budget buys, trade application, slippage, winner selection, and settlement payout logic into that shared boundary.
- Replaced server-local LMSR functions and camel-case room market state with shared-engine imports and snake_case canonical state.
- Kept `src/lib/lmsr.ts` as a compatibility wrapper that delegates to the shared engine for existing frontend imports.
- Moved Cognee fair-value calculation onto the shared implied-price helper.
- Added tests for numerical stability, extreme values, invalid inputs, budget buys, slippage, payout math, settlement, and frontend compatibility wrapper parity.

### 2026-05-10 - Full Host/Player Playwright E2E

- Installed `@playwright/test` and Chromium browser support for project-local E2E execution.
- Added `playwright.config.ts` with managed backend/frontend web servers, `http://127.0.0.1:3001` base URL, one Chromium worker, and failure-retained screenshots, traces, and videos.
- Added `npm run test:e2e` and `npm run test:e2e:headed`.
- Added a deterministic E2E spec that creates a room through the UI, joins two mobile players by room code, verifies desktop and mobile viewports, places OVER and UNDER bets, checks host stats, leaderboard, and activity, toggles AI on and off, refreshes a player for reconnect recovery, and settles the room.
- Added small accessibility/testability labels and stable test IDs to join, bet, host stat, leaderboard, activity, position, and settlement surfaces without changing visual behavior.

### 2026-05-10 - Dependency Audit Runtime Cleanup

- Removed the unused direct `codex` npm package, which was pulling obsolete vulnerable `connect`, `marked`, `highlight.js`, `tea`, `orchid`, and legacy `ws` dependencies.
- Moved CRA, Jest/testing-library, TypeScript, web-vitals, and type packages into `devDependencies` so production audit reflects the Node/runtime install surface.
- Ran non-forced `npm audit fix` to update compatible patched transitive packages, including Express runtime transitive fixes for `path-to-regexp` and `qs`.
- Added bounded npm overrides for `@tootallnate/once`, `bfj`, `nth-check`, `postcss`, `serialize-javascript`, and `underscore`, then proved CRA still builds and tests pass.
- Added `yaml` as an explicit dev dependency to satisfy Tailwind/postcss-load-config's optional peer while keeping vulnerable YAML 1.x out of the root peer slot.
- Left the remaining 2 moderate full-audit findings as an explicit CRA dev-server/toolchain migration item because npm's advertised fix is the breaking `react-scripts@0.0.0` path.

### 2026-05-10 - Local Durable Room Snapshots

- Added `server/roomPersistence.js`, a file-backed JSON room snapshot adapter with versioned payloads, directory creation, atomic temp-file writes, load, save, and clear operations.
- Snapshots now include the room code, host token, house, canonical market state, players, bet idempotency receipts, settlement state, activity, market ID, and full room event log.
- The real server process now loads `.fairvalue/rooms.json` by default on startup, while tests/imported modules remain persistence-disabled unless explicitly configured.
- Added `FAIRVALUE_ROOM_STORE_PATH` and `FAIRVALUE_ROOM_PERSISTENCE=off` controls, ignored `.fairvalue/`, and documented that snapshots include host tokens.
- Added `roomEventStore.replace(...)` so persisted event logs restore with stable ordering and the next append continues after the highest sequence.
- Persisted snapshots after room events and after bet receipt creation so replay, state recovery, and duplicate bet idempotency survive a local backend restart.
- Restored rooms intentionally start with empty WebSocket connections and AI disabled, because bot intervals are live process resources rather than durable state.
- Fixed CRA `setupProxy.js` so `/api` and `/ws` both honor `REACT_APP_BACKEND_PORT`, `BACKEND_PORT`, `REACT_APP_API_BASE_URL`, or `BACKEND_TARGET`; this fixed a fresh-port E2E split-brain between API creation and WebSocket connection.
- Added server coverage for file-backed restore of room state, event sequence, duplicate bet replay, settlement, and the restart edge where a stale `aiEnabled` snapshot must not claim a running AI interval.

### 2026-05-10 - Multiplayer Load And Accessibility Gate

- Added `@axe-core/playwright` and `e2e/multiplayer-resilience.spec.ts`.
- Added a room API/WebSocket burst test with 12 players, 12 concurrent-ish bets, WebSocket join/bet broadcast assertions, state reconciliation, and duplicate bet idempotency replay.
- Added a serious/critical axe accessibility gate across the join pick screen, active host screen, and active mobile player screen, with console/page-error assertions.
- Added `npm run test:e2e:isolated`, which forces fresh backend/frontend servers on `8010`/`3010`, disables Playwright server reuse, and uses `/tmp/fairvalue-e2e-rooms.json` for snapshot-backed E2E evidence.
- Exposed `E2E_REUSE_EXISTING=false` in Playwright config so future E2E runs can avoid accidentally proving against stale local servers.
- Fixed real axe findings by naming the AI analyst input/send control, adding QR SVG title text, wiring the public URL label/input, changing the settle button to white-on-warning, and darkening primary/success/warning/muted tokens to meet contrast on the room surfaces.
- Documented the isolated E2E path in README.

### 2026-05-10 - Negative Path Browser Coverage

- Added `e2e/negative-paths.spec.ts`.
- Covered join-form handling for malformed room code input and valid-but-nonexistent room codes.
- Covered fake host-token settlement from the rendered host UI and proved the room remains unsettled after the 403.
- Split host capability copy so missing tokens return `Host token required` and wrong tokens return `Invalid host token`.
- Covered join-route rate limiting from Playwright's HTTP client, including `Retry-After` and `retry_after` response metadata.
- Covered missing `COGNEE_API_KEY` behavior from the rendered AI Analyst by waiting for the degraded search 503 and asserting the visible fallback message.
- Fixed the settlement modal confirm button to use white text on the darker warning token for contrast consistency.

### 2026-05-10 - Real Backend Restart Recovery

- Added `server/__tests__/restartPersistence.test.js`.
- Spawned the real backend entrypoint in a child process with a temp `FAIRVALUE_ROOM_STORE_PATH`, no `DATABASE_URL`, and persistence explicitly enabled.
- Proved a created room, joined player, and idempotent bet write to the snapshot file before shutdown.
- Killed and restarted the backend against the same snapshot file, then verified restored house data, player data, trade count, disabled AI interval state, and duplicate bet replay without a second trade.
- Settled the restored room with the original host capability token, killed and restarted the backend again, and verified the settled state plus join/bet/settle activity survived.
- Fixed the restart-test shutdown helper so child stdout/stderr pipes close cleanly after SIGTERM instead of hanging the Node test runner.

### 2026-05-10 - Browser Restart Recovery E2E

- Added `e2e/restart-recovery.spec.ts` and `playwright.restart.config.ts`.
- Added `npm run test:e2e:restart` for a dedicated browser restart harness that does not piggyback on Playwright's opaque managed backend.
- The restart harness starts backend/frontend child processes on free local ports, verifies the frontend is the actual CRA app before opening pages, and enables snapshots at `/tmp/fairvalue-browser-restart-rooms.json`.
- The rendered host creates a room, the rendered mobile player joins and places a bet, both pages show reconnecting while the backend is stopped, then both recover after backend restart with room state intact.
- The same browser test places a second bet after reconnect, settles with the persisted host capability token, restarts the backend again, reloads both pages, and verifies settled host/player UI plus activity.
- Default Playwright config now ignores the restart spec so `npm run test:e2e` / `test:e2e:isolated` keep their normal managed-server scope while the restart path stays explicit.
- Documented the restart E2E command and proof model in `README.md`.

### 2026-05-10 - Room Persistence Adapter Boundary

- Reworked `server/roomPersistence.js` into a real adapter factory with disabled, local JSON, and Postgres/Neon modes.
- Kept local JSON as the default store and preserved `FAIRVALUE_ROOM_STORE_PATH` plus `FAIRVALUE_ROOM_PERSISTENCE=off`.
- Added explicit `FAIRVALUE_ROOM_STORE=postgres` support for the `fairvalue_room_snapshots` table, including create-if-missing schema setup, load, upsert, stale-room deletion, and clear operations.
- Updated server startup so async room loads can complete before the backend starts listening.
- Added a persistence write queue for non-JSON adapters so async snapshot writes preserve order instead of racing prior writes.
- Added deterministic fake-SQL tests for the Postgres adapter and factory behavior without requiring live Neon credentials.
- Documented the new env switch in `README.md` and `.env.example`, including the warning that Postgres snapshots contain the same sensitive host-token payload as local JSON snapshots.

### 2026-05-10 - Disposable Postgres Persistence Smoke

- Added `scripts/smoke-postgres-room-persistence.js`.
- Added dev-only `postgres` so the smoke can use a real tagged-template Postgres client against a local disposable database.
- Added `npm run test:persistence:postgres`.
- The smoke command starts Docker if already available, runs `postgres:16-alpine` on a free local port, waits for readiness, creates/uses the adapter table, saves and loads a room snapshot with host token, player, receipt, and event payloads, replaces it with a second snapshot to prove stale-room deletion, clears the table, and removes the container.
- Documented the Docker-backed persistence smoke in `README.md`.

### 2026-05-10 - Durable Persistence Failure Honesty

- Tagged room persistence failures so route handlers can distinguish durable-store failures from normal validation errors.
- Made room creation await the configured room snapshot write before returning a room code.
- Made join, bet, settlement, and AI-toggle routes await the configured room snapshot write before returning success.
- Moved join, bet, and settlement broadcasts behind successful durable snapshot writes so connected clients do not receive success events for mutations the configured store rejected.
- Extracted AI bot interval startup so AI toggles start the interval only after the toggle event is durably accepted.
- Added route coverage that forces the Postgres adapter to fail and proves create, join, bet, and settle return `503 Room persistence failed`.

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
- `npm run test:server` after room-code patch -> passed 6 server tests.
- `npm run verify` after room-code patch -> passed: `scan:secrets`, 6 server tests, React/Jest tests, production build.
- Room-code API smoke through `http://127.0.0.1:8000` -> created digit-bearing room `Q4IU`, lowercase `/api/rooms/q4iu/join` returned 200, invalid `AB!2` returned 400, valid nonexistent `Z9X8` returned 404.
- Browser room-code smoke through Playwright fallback -> `/join` accepted lowercase `q4iu`, normalized the input to `Q4IU`, navigated to `/play/Q4IU`, connected, and showed the room property.
- `npm run test:server` after multiplayer protocol patch -> passed 7 server tests.
- `npm run verify` after multiplayer protocol patch -> passed: `scan:secrets`, 7 server tests, React/Jest tests, production build.
- Live WebSocket smoke through `http://127.0.0.1:8000` -> room `RMOF` emitted join, bet, and settlement broadcasts with activity entries; recovered room state was settled with `over` winner and settlement activity tail.
- `npm run test:server` after server-authority patch -> passed 11 server tests.
- `npm run verify` after server-authority patch -> passed: `scan:secrets`, 11 server tests, 4 React/Jest suites / 33 tests, and production build.
- Restarted the live backend on `http://localhost:8000` after the server-authority patch; frontend remained listening on `http://localhost:3001`.
- Live idempotency/API/WebSocket smoke through `http://127.0.0.1:8000` -> room `R5Z7` echoed request ID `live-smoke-1778479055066`, emitted a bet broadcast, replayed a duplicate bet with `idempotent_replay: true`, rejected conflicting key reuse with `409`, rejected invalid settlement with `400`, and recovered settled room state with one trade.
- `npm run test:server` after event-log patch -> passed 13 server tests.
- `npm run verify` after event-log patch -> passed: `scan:secrets`, 13 server tests, 4 React/Jest suites / 33 tests, and production build.
- Restarted the live backend on `http://localhost:8000` after the event-log patch; frontend remained listening on `http://localhost:3001`.
- Live event-log smoke through `http://127.0.0.1:8000` -> room `JUE8` produced 9 ordered events including room creation, host-token error, WebSocket reconnect/leave, join, bet, AI phase changes, and settlement; host replay reconstructed settled state with one trade and state recovery exposed the final event sequence.
- `npm run verify` before unified-market-engine patch -> passed: `scan:secrets`, 13 server tests, 4 React/Jest suites / 33 tests, and production build.
- `npm run test:server` after unified-market-engine patch -> passed 13 server tests.
- `npm test -- --watchAll=false` after unified-market-engine patch -> passed 5 suites / 41 tests.
- `npm run build` after unified-market-engine patch -> passed.
- `npm run verify` after unified-market-engine patch -> passed: `scan:secrets`, 13 server tests, 5 React/Jest suites / 41 tests, and production build.
- Restarted the live backend on `http://localhost:8000` after the unified-market-engine patch; frontend remained listening on `http://localhost:3001`.
- Live shared-engine smoke through `http://127.0.0.1:8000` -> room `U8DB` produced API bet market output matching `marketEngine.placeBetWithBudget`, settlement results matching `marketEngine.settlePlayers`, canonical snake_case market fields with no camel-case market keys, and replay recovered one settled trade.
- `npm run verify` before Playwright E2E patch -> passed: `scan:secrets`, 13 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm install -D @playwright/test` -> added Playwright 1.59.1; npm still reported the known 47 vulnerabilities.
- `npx playwright install chromium` -> completed successfully.
- `npm run test:e2e` after Playwright E2E patch -> passed 1 Chromium test covering host creation, two player joins, two bets, host stats, leaderboard, activity feed, AI toggle, player refresh/reconnect, and settlement.
- `npm run verify` after Playwright E2E patch -> passed: `scan:secrets`, 13 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm audit --json` at the start of dependency-audit pass -> 47 vulnerabilities before cleanup.
- `npm install` after dependency split and unused `codex` removal -> removed 31 packages and reduced full audit to 40 vulnerabilities.
- `npm audit --omit=dev --json` after dependency split -> 2 production findings: `path-to-regexp` and `qs`.
- `npm audit fix` -> updated compatible transitive packages; production audit then reported 0 vulnerabilities.
- `npm install -D yaml@^2.4.2` -> resolved the Tailwind/postcss-load-config optional peer conflict and left production audit clean.
- `npm install` after bounded overrides -> reduced full audit to 2 moderate dev-only findings, both through `react-scripts` -> `webpack-dev-server`.
- `npm audit --omit=dev --json` final -> 0 vulnerabilities.
- `npm audit --json` final -> 2 moderate vulnerabilities, both dev-only `webpack-dev-server` findings reachable through `react-scripts`.
- SVGO v1 smoke through `new SVGO().optimize(...)` -> passed after the `nth-check` override.
- `npm run verify` after dependency-audit patch -> passed: `scan:secrets`, 13 server tests, 5 React/Jest suites / 41 tests, and production build. Jest emitted a Watchman recrawl warning, not a test failure.
- `npm run test:e2e` after dependency-audit patch -> passed 1 Chromium host/player room-flow test.
- `PORT=3011 BROWSER=none REACT_APP_BACKEND_PORT=8000 npm start` -> CRA dev server compiled successfully on `http://localhost:3011`; `curl /` and `curl /join` returned HTML; the temporary server was stopped.
- `node -e "require('./server/index'); console.log('server loaded')"` after the durable room snapshot patch -> passed.
- `npm run test:server` after the durable room snapshot patch -> passed 14 server tests, including file-backed restore of room state, events, idempotency receipts, settlement, and AI-disabled restart behavior.
- `npm run verify` after the durable room snapshot patch -> passed: `scan:secrets`, 14 server tests, 5 React/Jest suites / 41 tests, and production build. Jest emitted a Watchman recrawl warning, not a test failure.
- `FAIRVALUE_ROOM_STORE_PATH=/tmp/fairvalue-e2e-rooms.json E2E_BACKEND_PORT=8010 E2E_FRONTEND_PORT=3010 npm run test:e2e` before the CRA proxy fix -> failed because the frontend API proxy still targeted backend `8000` while the WebSocket client targeted backend `8010`, leaving the host UI reconnecting.
- `FAIRVALUE_ROOM_STORE_PATH=/tmp/fairvalue-e2e-rooms.json E2E_BACKEND_PORT=8010 E2E_FRONTEND_PORT=3010 npm run test:e2e` after the CRA proxy fix -> passed 1 Chromium host/player room-flow test on isolated frontend/backend ports.
- `/tmp/fairvalue-e2e-rooms.json` snapshot probe after the final fresh-port E2E -> one room `XRZO`, 25 persisted events, 2 bet receipts, settled `true`, and `aiEnabled` `false`.
- Browser plugin fallback -> Browser skill was available, but tool discovery did not expose the required Node REPL JavaScript browser-control tool; used the repo Playwright path instead.
- `npm install -D @axe-core/playwright` -> added axe Playwright support; full audit remained at the known 2 moderate dev-only `webpack-dev-server` findings.
- `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` initial run -> burst test passed, accessibility test failed on host-screen unlabeled AI send button, low-contrast host labels/metrics, and QR SVG missing text alternative.
- `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` second run -> host screen passed, player screen failed on primary/success contrast for room badge, probability label, preset button, and OVER button.
- `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` final run -> passed 2 Chromium tests: burst API/WebSocket loop and serious axe accessibility checks without console errors.
- `npm run test:e2e:isolated` final run -> passed 3 Chromium tests: original host/player room flow, burst API/WebSocket loop, and serious axe accessibility checks.
- `npm run verify` after load/accessibility patch -> passed: `scan:secrets`, 14 server tests, 5 React/Jest suites / 41 tests, and production build. Jest emitted the Watchman recrawl warning, not a test failure.
- `npm audit --omit=dev --json` after adding axe -> 0 vulnerabilities.
- `npm audit --json` after adding axe -> unchanged 2 moderate dev-only findings through `react-scripts` -> `webpack-dev-server`.
- `/tmp/fairvalue-e2e-rooms.json` after full isolated E2E -> three rooms `IM8M`, `MP3I`, `QYZQ`; event counts `21`, `27`, `11`; one settled room; receipt counts `2`, `12`, `0`.
- `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts` initial run -> 3 passed and fake host-token settlement failed because the server returned generic `Host token required` copy for a present-but-invalid token.
- `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts` final run -> passed 4 Chromium tests: malformed/nonexistent room-code UI, fake-token settlement rejection, join rate-limit metadata, and missing Cognee-key AI fallback.
- `npm run test:e2e:isolated` after negative-path patch -> passed 7 Chromium tests: host/player happy path, load/accessibility checks, and negative-path coverage.
- `npm run verify` after negative-path patch -> passed: `scan:secrets`, 14 server tests, 5 React/Jest suites / 41 tests, and production build. Jest emitted the Watchman recrawl warning, not a test failure.
- `npm audit --omit=dev --json` after negative-path patch -> 0 vulnerabilities.
- `npm audit --json` after negative-path patch -> unchanged 2 moderate dev-only findings through `react-scripts` -> `webpack-dev-server`.
- `/tmp/fairvalue-e2e-rooms.json` after 7-test isolated E2E -> six rooms `1409`, `BAR7`, `K0TE`, `72AV`, `KATU`, `5S3L`; event counts `6`, `27`, `27`, `11`, `31`, `4`; one settled room; receipt counts `0`, `2`, `12`, `0`, `0`, `0`.
- `node --test server/__tests__/restartPersistence.test.js` initial run -> exposed a shutdown helper hang after the assertions finished; stale child test processes were killed and the helper was updated to clear its force-kill timer and destroy stdio streams on exit.
- `node --test server/__tests__/restartPersistence.test.js` final run -> passed 1 child-process restart test in 722 ms.
- `npm run verify` after restart-recovery patch -> passed: `scan:secrets`, 15 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:e2e:restart` initial run -> failed after the default 30s timeout because the fixed frontend port `3020` was already serving an unrelated Next.js 404 page; the harness was changed to use free ports by default, assert explicit ports are free, verify the CRA shell before proceeding, and use a 120s restart-test timeout.
- `npm run test:e2e:restart` final run -> passed 1 Chromium browser restart test in 29.1s; the test body took 8.9s.
- `/tmp/fairvalue-browser-restart-rooms.json` after the restart E2E -> room `30BP`, 30 persisted events, 2 bet receipts, 2 players, settled `true`, and `aiEnabled` `false`.
- `npx playwright test --list` after adding the restart config -> default Playwright suite remains 7 tests in 3 files, excluding `restart-recovery.spec.ts`.
- `npm run verify` after browser restart patch -> passed: `scan:secrets`, 15 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:server` after adding the persistence adapter boundary -> passed 19 server tests, including fake-Postgres save/load/stale-delete/clear coverage.
- `npm run test:e2e:restart` after async startup/persistence wiring -> passed 1 Chromium browser restart test in 21.8s; the test body took 6.0s.
- `/tmp/fairvalue-browser-restart-rooms.json` after the adapter-boundary restart E2E -> room `76OO`, 24 persisted events, 2 bet receipts, 2 players, settled `true`, and `aiEnabled` `false`.
- `FAIRVALUE_ROOM_STORE=postgres DATABASE_URL='' node -e "..."` -> reported `{"kind":"postgres","enabled":false,"reason":"DATABASE_URL is not configured"}`, proving explicit Postgres mode degrades honestly without credentials.
- `npm run verify` after persistence adapter patch -> passed: `scan:secrets`, 19 server tests, 5 React/Jest suites / 41 tests, and production build.
- `open -a Docker` then `docker info` -> Docker daemon became ready for disposable database smoke.
- `npm install -D postgres` -> added one dev dependency; full audit stayed at the known 2 moderate CRA dev-server findings.
- `npm run test:persistence:postgres` -> passed against `postgres:16-alpine` on local port `54801`, adapter `postgres`, table `fairvalue_room_snapshots`.
- `npm run verify` after adding the disposable Postgres smoke -> passed: `scan:secrets`, 19 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm audit --omit=dev --json` after adding `postgres` -> 0 vulnerabilities.
- `npm audit --json` after adding `postgres` -> unchanged 2 moderate dev-only findings through `react-scripts` -> `webpack-dev-server`.
- `docker ps --filter name=fairvalue-room-postgres` -> no leftover smoke containers.
- `npm run test:server` after durable failure surfacing -> passed 20 server tests, including forced create/join/bet/settle persistence-failure 503 coverage.
- `npm run test:e2e:restart` after moving broadcasts behind durable writes -> passed 1 Chromium browser restart test in 50.4s; the test body took 10.0s.
- `/tmp/fairvalue-browser-restart-rooms.json` after durable failure surfacing -> room `6OLW`, 28 persisted events, 2 bet receipts, 2 players, settled `true`, and `aiEnabled` `false`.
- `npm run verify` after durable failure surfacing -> passed: `scan:secrets`, 20 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:persistence:postgres` after durable failure surfacing -> passed against `postgres:16-alpine` on local port `57107`.
- `node --check server/index.js` after durable identity patch -> passed.
- `npm run test:server` after durable identity patch -> passed 22 server tests, including signed host-identity authority and forged user-token/session rejection.
- `npm run verify` after durable identity patch -> passed: `scan:secrets`, 22 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:e2e:restart` after durable identity patch -> passed 1 Chromium browser restart test.
- `npm run test:e2e:isolated` first durable-identity run -> 6 passed and fake-host-token UI rejection failed because the new UI preferred durable identity over an explicitly injected legacy fake host token.
- `FAIRVALUE_ROOM_STORE_PATH=/tmp/fairvalue-e2e-rooms.json E2E_REUSE_EXISTING=false E2E_BACKEND_PORT=8010 E2E_FRONTEND_PORT=3010 npx playwright test e2e/negative-paths.spec.ts -g "fake host token cannot settle"` after host-authority precedence fix -> passed.
- `npm run test:e2e:isolated` final durable-identity run -> passed 7 Chromium tests: host/player happy path, load/accessibility checks, and negative-path coverage.
- Final `npm run verify` after host-authority precedence fix -> passed: `scan:secrets`, 22 server tests, 5 React/Jest suites / 41 tests, and production build.
- Final `npm run test:e2e:restart` after host-authority precedence fix -> passed 1 Chromium browser restart test in 43.1s.
- Browser plugin smoke attempt after durable identity patch -> local backend/frontend started on `http://localhost:8010` and `http://localhost:3010`, but the in-app Playwright MCP returned `Transport closed`; repo Playwright browser suites above remained the rendered-path verification source.
- `npm run test:e2e:restart` after sustained restart coverage -> passed 1 Chromium test in 16.3s; the rendered test now uses one host context, two player contexts, three repeated pre-settlement backend restart cycles, a post-reconnect bet, settlement, and final settled reload recovery.
- `/tmp/fairvalue-browser-restart-rooms.json` after sustained restart coverage -> room `YLLG`, 37 persisted events, 3 bet receipts, 3 players, 3 total trades, settled `true`, and `aiEnabled` `false`.
- `npm run verify` after sustained restart coverage -> passed: `scan:secrets`, 22 server tests, 5 React/Jest suites / 41 tests, and production build.
- `node --check server/index.js` after AI/audit durability patch -> passed.
- `npm run test:server` after AI/audit durability patch -> passed 24 server tests, including host audit persistence-failure 503 and AI tick durability failure coverage.
- `npm run verify` after AI/audit durability patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:e2e:isolated` after AI/audit durability patch -> passed 7 Chromium tests.
- `npm run test:e2e:restart` after AI/audit durability patch -> passed 1 Chromium sustained restart test in 16.2s.
- `/tmp/fairvalue-browser-restart-rooms.json` after AI/audit durability patch -> room `DEOB`, 45 persisted events, 3 players, 3 receipts, 3 total trades, settled `true`, `aiEnabled` `false`, and `durabilityError` `null`.
- `npx playwright install firefox webkit` before matrix coverage -> passed.
- `npx playwright test --list -c playwright.matrix.config.ts` -> listed 3 tests: Chromium, Firefox, and WebKit host/player flow.
- `npx playwright test --list -c playwright.soak.config.ts` -> listed 1 Chromium load-soak test.
- Initial `npm run test:e2e:matrix` exposed the Firefox `isMobile` fixture incompatibility and a missed-broadcast/stale-render risk; the E2E fixture and connected-state reconciliation were updated before final verification.
- Final `npm run test:e2e:matrix` -> passed 3 projects in 20.2s: Chromium, Firefox, and WebKit.
- Final `npm run test:e2e:soak` -> passed 1 Chromium load-soak test in 6.4s.
- `npm run verify` after matrix/soak patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:e2e:isolated` after matrix/soak patch -> passed 7 Chromium tests in 32.9s.
- `npm run test:e2e:restart` after matrix/soak patch -> passed 1 Chromium sustained restart test in 33.7s.
- Snapshot probe after matrix/soak patch -> matrix rooms `MHWR`, `YWAI`, and `TU8I` each had 3 players, 2 trades, 2 receipts, settled true, and no durability error; soak room `BMXD` had 24 players, 24 trades, 24 receipts, 52 events, settled true, and no durability error; restart room `G43J` had 3 players, 3 trades, 3 receipts, 41 events, settled true, and no durability error.
- `npm run test:e2e:restart` after restart/load combination patch -> passed 1 Chromium rendered restart/load test in 16.5s.
- Snapshot probe after restart/load combination patch -> room `GJTU`, 15 players, 12 restart-load players, 15 trades, 15 receipts, 64 events, settled true, `aiEnabled` false, and `durabilityError` null.
- `npm run verify` after restart/load combination patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- Initial `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` for expanded accessibility coverage exposed serious color-contrast failures on market browse sort labels, result count, card metadata, zestimate deltas, and the Leaflet grey price marker.
- Follow-up focused accessibility runs exposed and then fixed the host settle modal cancel-button contrast and the expected missing-key Cognee 503 browser resource errors.
- Final `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` after expanded accessibility patch -> passed 3 Chromium tests.
- Final `npm run test:e2e:isolated` after expanded accessibility patch -> passed 8 Chromium tests.
- Final `npm run verify` after expanded accessibility patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- Final `npm run test:e2e:matrix` after expanded accessibility patch -> passed 3 projects in 1.0m: Chromium, Firefox, and WebKit.
- Snapshot probe after expanded accessibility patch -> isolated rooms `GLLW`, `OH5H`, `QZJG`, `YTAH`, `XAEE`, `YHFH`, `UJ65`; matrix rooms `9SBF`, `I2CD`, and `UIOV` each had 3 players, 2 trades, 2 receipts, 25 events, settled true, and no durability error.
- Initial keyboard accessibility focused run exposed that selecting a sort option dropped focus instead of returning it to the sort trigger; the sort component now restores focus after selection.
- Follow-up keyboard accessibility focused run exposed that degraded missing-key AI responses were visible but not announced as alerts; the AI chat now marks degraded missing-key responses as alert-style error messages without logging console errors.
- Final `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` after keyboard accessibility patch -> passed 4 Chromium tests.
- Final `npm run test:e2e:isolated` after keyboard accessibility patch -> passed 9 Chromium tests.
- Final `npm run verify` after keyboard accessibility patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- Final `npm run test:e2e:matrix` after keyboard accessibility patch -> passed 3 projects: Chromium, Firefox, and WebKit.
- Snapshot probe after keyboard accessibility patch -> isolated rooms `R1PQ`, `BQCL`, `XCPX`, `MLUF`, `Q5WS`, `DAR9`, `SOJQ`, `AMEP`; matrix rooms `Q5JO`, `DC2Q`, and `H4K5` each had 3 players, 2 trades, 2 receipts, settled true, and no durability error.

## Screens And Routes Verified

- `/` at `http://localhost:3001/` rendered FairValue browse.
- `/market/440298192` rendered a solo property market without a framework overlay.
- `/join` created a room through the real UI.
- `/host/HMA7` rendered host cockpit, connected realtime status, leaderboard, activity feed, and settlement.
- `/play/HMA7` rendered two mobile player sessions, connected realtime status, betting controls, and settlement result.
- `/host/EHPA` verified host-token-backed controls and settlement.
- `/play/EHPA` verified player session did not receive host token and saw settlement result.
- `/join` -> `/play/Q4IU` verified lowercase alphanumeric room-code entry through the rendered mobile join flow.
- Playwright E2E verified `/join` -> `/host/:roomCode` on a 1440x900 desktop viewport and two `/join` -> `/play/:roomCode` player sessions on 390x844 mobile viewports.
- Playwright E2E verified host stats, leaderboard, activity feed, AI toggle, refreshed player state recovery, settlement modal, and settled result rendering.
- Fresh-port Playwright E2E verified the same host/player loop through managed `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend with `FAIRVALUE_ROOM_STORE_PATH=/tmp/fairvalue-e2e-rooms.json`.
- Isolated E2E verified join, host, and mobile player surfaces with serious/critical axe checks and no captured console/page errors.
- Isolated E2E verified a 12-player / 12-bet API burst while a live room WebSocket observed all join and bet broadcasts.
- Negative-path E2E verified `/join` malformed code feedback, `/join` nonexistent room feedback, `/host/:roomCode` fake-token settlement rejection, join route rate limiting, and host AI Analyst missing-key fallback.
- Backend child-process restart test verified `/api/rooms`, `/join`, `/bet`, `/state`, and `/settle` across two real backend restarts using the same local snapshot file.
- Restart E2E verified rendered `/join`, `/host/:roomCode`, and `/play/:roomCode` pages through a real backend restart, post-restart bet, settlement, second restart, and reload recovery on fresh dynamic local ports.
- Persistence adapter tests verified Postgres snapshot save/load/delete/clear semantics through a deterministic fake tagged SQL client.
- Disposable Postgres smoke verified the same snapshot adapter semantics against a real local Postgres container.
- Server tests verified forced durable persistence failures return `503` for `/api/rooms`, `/join`, `/bet`, and `/settle`.
- Server tests verified `/api/identity`, host identity authorization for AI toggle/settlement, and forged user-token/session rejection for joins and bets.
- Isolated E2E verified durable identity migration did not regress host/player happy path, accessibility/load checks, or fake host-token UI rejection.
- Restart E2E verified one rendered host context plus two rendered player contexts through three consecutive backend restart/reconnect cycles before settlement and another restart/reload after settlement.
- Server tests verified AI bot durability failure status and host-only audit error durable `503` behavior.
- Matrix E2E verified the rendered `/join` -> `/host/:roomCode` plus two `/play/:roomCode` player flow across Chromium, Firefox, and WebKit.
- Soak E2E verified a 24-player / 24-bet API and WebSocket wave profile with idempotency replay, settlement, and persisted snapshot reconciliation.
- Restart E2E verified rendered host/player recovery while retrying API load waves attempted joins/bets during real backend outage and recovery windows.
- Expanded isolated accessibility E2E verified `/`, browse sort menu, `/market/440298192`, `/join` create/join forms, `/host/:roomCode` settle modal and missing-key AI fallback, and `/play/:roomCode` mobile custom-wager state with serious/critical axe checks.
- Keyboard accessibility E2E verified keyboard operation and alert/focus semantics on `/`, `/join`, `/host/:roomCode`, and `/play/:roomCode`.

## Screenshots Or Traces

- `/tmp/fairvalue-home.png`
- `/tmp/fairvalue-market.png`
- `/tmp/fairvalue-host.png`
- `/tmp/fairvalue-player-mobile.png`
- `/tmp/fairvalue-settled.png`
- `/tmp/fairvalue-host-token-settled.png`
- `/tmp/fairvalue-room-code-digit-join.png`
- Playwright E2E is configured to retain screenshots, traces, and videos on failure under `test-results/e2e-artifacts`; the passing run produced no failure screenshots/videos.
- `playwright-report/index.html` was generated locally for the passing E2E run and is ignored by git.

## Commits Made

- `7df90d6` - Harden AI boundary and realtime recovery.
- `b1936cb` - Protect host-only room controls.
- `baa8e98` - Align room code contract.
- `0071f82` - Cover multiplayer API and websocket flow.
- `ea7ad72` - Harden server betting contract.
- `8cbecb1` - Add room event log replay.
- `1249f4b` - Unify LMSR market engine.
- `362a705` - Record event log evidence.
- `9fa1761` - Record unified engine evidence.
- `3c6b3e2` - Add Playwright room flow E2E.
- `b792157` - Record Playwright E2E evidence.
- `2551685` - Reduce dependency audit surface.
- `d787971` - Record dependency audit evidence.
- `76814c8` - Add durable local room snapshots.
- `ee356b4` - Record durable room snapshot evidence.
- `61a27a6` - Add multiplayer load and accessibility E2E.
- `ffbea1d` - Record load and accessibility evidence.
- `cfe26ff` - Add negative path Playwright coverage.
- `dc0f37f` - Add backend restart persistence test.
- `f3ee986` - Add browser restart recovery E2E.
- `4d9d3ba` - Add room persistence adapter boundary.
- `aa0f78c` - Add disposable Postgres persistence smoke.
- `4fe4f09` - Surface durable room persistence failures.
- `6bae782` - Add durable browser identity auth.
- `f88ad3c` - Record durable identity evidence.
- `2687d54` - Expand restart recovery E2E coverage.
- `ed2fa3a` - Record sustained restart evidence.
- `c9148e5` - Surface AI and audit durability failures.
- `864c81b` - Record AI audit durability evidence.
- `6f63ffa` - Add browser matrix and soak E2E coverage.
- `914f927` - Record browser matrix soak evidence.
- `9f52d92` - Add restart load recovery E2E coverage.
- `3bb0392` - Record restart load recovery evidence.
- `83893bc` - Expand accessibility route coverage.
- `058e09a` - Record expanded accessibility evidence.
- `14f9241` - Add keyboard accessibility flow coverage.

## Next Action Queue

1. Add real assistive-technology/manual VoiceOver notes and any remaining route/modal accessibility states.
2. Add a browser-engine restart matrix or k6-style latency profile for restart/load paths.
3. Plan a CRA toolchain migration to remove the residual dev-server audit findings.
4. Start the next loop with `npm run verify`, then inspect actual VoiceOver/manual assistive-tech gaps in the rendered browse, host, player, join, and market surfaces.
