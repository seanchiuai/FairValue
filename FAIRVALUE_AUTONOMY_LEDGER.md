# FairValue Autonomy Ledger

## North-Star Goal

Transform FairValue into a trusted real-time real estate prediction-market operating system with multiplayer rooms, property intelligence, market integrity, AI analysis, durable realtime infrastructure, polished UX, and continuously expanding verification.

## Current Runtime Status

- Baseline dependency install: `npm ci` completed on 2026-05-10 with deprecation warnings and 47 reported npm audit vulnerabilities.
- Baseline backend load before patch failed because `DATABASE_URL` was missing and `server/db.js` called Neon at module load.
- Backend now supports local degraded database mode when `DATABASE_URL` is missing.
- Cognee AI now routes through server endpoints and, when `COGNEE_API_KEY` is missing, returns a deterministic local room-state analyst response with citations, limitations, and no browser-visible 503 resource failure.
- Local verification stack has run with backend on `http://localhost:8000` and frontend on managed Vite ports such as `http://127.0.0.1:3010`.
- Local frontend WebSockets now connect directly to the backend in Vite dev mode when the frontend runs on a different port.
- Betting now requires idempotency keys, room mutations validate payloads server-side, guarded API routes have in-memory rate limits, and every API response includes a correlation ID.
- Rooms now emit append-only events for creation, joins, reconnect/leave, bets, AI phase changes, AI trades, settlement, and room-scoped errors; host-only audit and replay endpoints reconstruct room state from the event stream.
- Backend LMSR/domain behavior now routes through `src/lib/marketEngine.js`; the browser LMSR wrapper stays ESM-native for Vite and has parity tests against the canonical server engine.
- Playwright E2E now runs the primary host/player room loop through the real Vite frontend and backend with managed web servers, Chromium execution, and retained screenshots/traces/videos on failure.
- Runtime dependencies are now separated from frontend test/type tooling; full `npm audit --json` and production `npm audit --omit=dev --json` both report zero vulnerabilities after migrating off CRA/react-scripts.
- Rooms, room event logs, settlement state, and bet idempotency receipts now survive local backend restarts through file-backed JSON snapshots at `.fairvalue/rooms.json` by default, with `FAIRVALUE_ROOM_STORE_PATH` and `FAIRVALUE_ROOM_PERSISTENCE=off` controls.
- Local JSON room snapshots now quarantine malformed snapshot files as `.corrupt-*` beside the configured path, log the quarantine path without snapshot contents, and restart with an empty room map instead of crashing on parse.
- Local JSON room snapshots can now be encrypted at rest with `FAIRVALUE_ROOM_SNAPSHOT_SECRET`; plaintext snapshots still load, encrypted snapshots fail closed without the secret, and the E2E/profile snapshot readers use the persistence adapter so encrypted evidence runs remain supported.
- Local JSON room snapshots now prune settled rooms after `FAIRVALUE_ROOM_RETENTION_DAYS` days by defaulting to 30 days; active rooms and rooms without room-specific timestamps are retained, and `0`/`off` disables local pruning.
- Vite dev proxying honors the same backend target env as the WebSocket client, so `/api` and `/ws` both point at the intended backend when fresh E2E/dev servers run on non-default ports.
- Browser E2E now has an isolated fresh-server script, a multiplayer burst/API/WebSocket test, and a serious axe accessibility gate over join, host, and mobile player surfaces.
- On 2026-08-04 the isolated browser suite passed all 42 Chromium scenarios on fresh backend/frontend ports, including host/player recovery, room-format flows, profile/recap/export, negative-path notifications, expanded serious/critical axe coverage, and the comparison workflow.
- On 2026-08-04 the fresh-port browser-engine matrix passed the host/two-player/reconnect/AI/settle flow in Chromium, Firefox, and WebKit: 3 tests in 1.7 minutes. The final run used the package-matched Playwright browser revisions installed with Node 22 after the initial Chromium cache revision was removed during browser setup.
- On 2026-08-04 the headed assistive-tech capture passed all 12 required surfaces using room `9OWU` on frontend `62444` and backend `62443`; it verified local AI citations/limits through the `200` search response, and recorded Playwright ARIA fallback evidence where macOS System Events timed out or omitted a dynamic app-region marker.
- On 2026-08-04 the focused negative-path browser suite passed 24 Chromium scenarios on fresh backend/frontend ports, including the new unauthorised `/review/:roomCode` branch: public evidence remained visible, the host-only events endpoint was not requested, the private host token was absent from rendered content, and the route passed serious/critical axe checks.
- On 2026-08-04 the browse surface's light-background accent labels were corrected after axe reported serious contrast failures; the expanded accessibility scenario and the full 42-test suite now pass.
- Accessibility pass tightened the app color tokens and added missing names for the AI send button, public URL input, QR SVG, and host settle button contrast.
- Negative-path browser coverage now exercises malformed/nonexistent room-code errors, fake host-token settlement rejection, join rate-limit retry metadata, and missing Cognee-key AI Analyst degradation.
- Host capability errors now distinguish missing host tokens from invalid host tokens so UI feedback can tell the host what actually failed.
- Server verification now includes a real backend child-process restart test that creates a room, joins, places a bet, kills and restarts the backend against the same snapshot file, proves restored state/idempotency, settles, then restarts again to prove settlement recovery.
- Browser restart recovery now has a dedicated Playwright harness that owns fresh backend/frontend child processes, keeps rendered host/player pages open, restarts the real backend against `/tmp/fairvalue-browser-restart-rooms.json`, and proves reconnect, post-restart betting, settlement, and settled reload.
- Restart E2E now drives one host plus two player browser contexts through three repeated pre-settlement backend restart cycles, a post-reconnect bet, settlement, and a final reload-after-restart recovery.
- Room persistence now has an adapter boundary: JSON remains the default local store, while `FAIRVALUE_ROOM_STORE=postgres` targets a Neon/Postgres `fairvalue_room_snapshots` table and startup can await async room loads before listening.
- Postgres room persistence now has a Docker-backed smoke command that verifies the adapter against a real disposable `postgres:16-alpine` database and removes the container afterward.
- Postgres room snapshots now support opt-in settled-row retention with `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS`; it is disabled by default, and when enabled it prunes expired settled rows on load, targeted load, and save using room event/activity timestamps with row `updated_at` as a fallback.
- Room persistence adapters now expose targeted `loadRoom`, `saveRoom`, and `deleteRoom` methods so readiness tooling can safely inspect or mutate one room row without invoking whole-table snapshot replacement.
- Live database readiness now has `npm run test:persistence:live`; without `DATABASE_URL` it records an honest local degraded/skip result, with credentials it checks connectivity/table presence, and with `FAIRVALUE_LIVE_POSTGRES_SMOKE=1` it writes, reads, and deletes one temporary `FV**` room row.
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
- Keyboard and screen-reader-adjacent E2E now verifies browse search clear, sort menu keyboard selection/Escape/focus restoration, join-mode keyboard entry/autofocus/error alerts, settle dialog initial focus/Escape/focus restoration, missing-key AI local-analysis live-region semantics, and mobile wager keyboard activation.
- Restart/load browser recovery now has an explicit Chromium/Firefox/WebKit matrix command that runs the same real backend restart harness with retrying API load waves.
- Restart/load latency now has a deterministic local profile command that starts the real backend, drives create/join/bet/state traffic through a backend restart, records p50/p95/max plus recovery timings, and fails on explicit local latency budgets.
- Frontend dev/build/test tooling now uses Vite and Vitest instead of Create React App/react-scripts; the old CRA proxy template, web-vitals hook, and `%PUBLIC_URL%` HTML template are removed.
- Vite route splitting now keeps the `/join` entry flow eager for keyboard reliability while lazy-loading browse, market detail, host, and player routes; the largest production JS chunk dropped from about 512 kB to 199 kB and the build no longer emits the large-chunk warning.
- `npm run verify` now includes TypeScript `tsc --noEmit` type checking over the Vite/React source tree, Vite config, Playwright configs, and E2E specs, plus a post-build bundle budget gate with defaults of 240 kB per JS chunk, 25 kB per CSS chunk, and 760 kB total JS, plus a real backend child-process boot smoke.
- Assistive-technology evidence now has a headed Playwright command that starts fresh backend/frontend ports, opens Chrome with renderer accessibility enabled, captures the macOS app-region AX tree plus Playwright ARIA snapshots, and records join/host/settle/player findings in `docs/accessibility-assistive-tech-notes.md`.
- Assistive-technology evidence now also covers the browse route, sort menu, property detail route, host AI degraded live analysis, and settled host/player result states; dense browse/detail routes use bounded Playwright ARIA evidence while room/dialog/player states still capture macOS AX when available.
- Accessibility edge states now expose field-level `aria-invalid` / `aria-describedby` semantics for create/join validation errors and settlement errors; map pins have accessible names and map popup contrast is gated by axe.
- Player validation notifications now use the existing global toast system for join/bet errors while preserving inline alerts; error toasts announce assertively, non-error toasts announce politely, dismiss buttons are message-specific, mobile width is bounded, and the toast entrance no longer fades text through low-contrast states.
- Player bet API failures now treat non-OK or malformed mutation responses as failed bets, roll back optimistic market/player state, and announce the failure inline plus through the global toast system.
- Direct player join validation and API failure paths now have browser proof that empty nicknames stay local-only, server join failures are announced without marking the nickname field invalid, and no failed join mutates room players.
- Market detail Start a Bid room creation and host auto-join failures now surface inline on `/market/:propertyId` and through the global toast system instead of silently re-enabling the Start a Bid button.
- Market detail pages now include a verified trust explainer for simulated credits, LMSR probability, implied fair value, listing provenance/freshness, and host settlement/event evidence so the solo market surface does not imply real-money or appraisal authority.
- Host/player room entry, active room, settlement modal, and settled recap surfaces now share trust notes for simulated credits, non-appraisal fair value, settlement evidence, and event-history preservation.
- Join-page create-room, host auto-join, and room-code join API failures now validate HTTP status and response shape before navigation, preserve inline errors, avoid blaming fields for backend outages, and emit message-specific global error toasts for async server failures.
- Host AI toggle failures now use the global toast system instead of console-only errors, so invalid/missing host authority is visible and announced to room operators; AI toggle success also emits a polite status notification.
- Host settlement failures now preserve the modal inline error while also using the global toast system for announced, message-specific failure feedback; successful settlement emits a polite status toast.
- Host AI toggle and settlement responses now require OK status plus valid success payload shape before showing success; malformed 200 responses keep state unchanged, stay visible to the operator, and are announced through accessible error toasts.
- Host pages opened without the original host authority now render a visible warning and link disabled AI/Settle controls to that warning with `aria-describedby`, so missing capability is explained without requiring hover.
- Browser identity minting now treats non-JSON outages and malformed 200 responses as controlled identity errors, so create/join flows show stable inline/toast messages instead of JSON parser internals and do not mutate rooms without a valid signed identity.
- Initial host/player room state loads now validate HTTP status and payload shape, show a retryable room-load alert for transient or malformed state failures, keep genuine missing rooms as `Room not found`, and ignore invalid refresh/poll payloads instead of mutating rendered room state.
- The AI Analyst conversation log is keyboard-focusable when responses become scrollable, so cited local analysis remains accessible after longer evidence/limitations output.
- The unused `useCloudFairValue` hook and `cloudPersistence` stub were removed so the client no longer carries a fake `api.fairvalue.io` fair-value sync surface or mock/stub cloud logging path.
- Rendered browser load coverage now has an explicit Chromium command that runs one desktop host plus 10 mobile player pages through concurrent joins, concurrent bets, settlement broadcast checks, and persisted snapshot reconciliation.
- Cold production performance coverage now builds the Vite production bundle, serves `dist` through a local static/API proxy, and times cold join route load, room creation, player route load, player join, bet sync, and settlement broadcast through headless Chromium.
- Mixed-traffic coverage now combines one rendered host, throttled rendered mobile clients, concurrent API join/bet churn, state polling, settlement broadcast checks, and durable snapshot reconciliation.
- Backend operations now expose `GET /healthz`, `GET /readyz`, token-guarded JSON `GET /api/ops/metrics`, and token-guarded Prometheus `GET /metrics` with in-memory request, latency, room lifecycle, WebSocket, rate-limit, database-error, persistence-failure, and AI degraded/error counters.
- Production environment readiness now has `npm run check:production`, which fails until deploy-critical env values are set for Postgres persistence, retention, identity signing, ops metrics protection, and database availability.
- Express now disables `X-Powered-By` and emits baseline browser security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Local boot readiness now has `npm run smoke:boot`, which launches `node server/index.js` on a free local port with an isolated temporary room snapshot, checks health/readiness/security headers, proves ops-token gating, drives create/join/bet/settle plus a WebSocket join broadcast, confirms host-token non-leakage, and verifies snapshot persistence wrote.
- Market Studio now exists as a real `/join` creation mode: hosts can paste listing text, generate a deterministic local market draft, review normalized address/asking price/facts/provenance/warnings/settlement evidence, edit generated fields, and create a real host room through the existing authenticated room creation and host auto-join path.
- Market Studio now matches generated drafts against the local property dataset on demand and lets hosts save, reload, update, and delete local draft artifacts in browser storage before creating a real room.
- Market Studio room creation now sends draft metadata to the server, which validates that the draft address/asking price match the room, stores an audit envelope with a source-text hash instead of raw pasted text, persists it through snapshots/events/replay/state, and shows the host a draft-audit note.
- Market detail pages now include deterministic Market Intelligence: a local property brief, confidence reason, valuation metrics, bull/bear/uncertainty cases, scenario prompts, and settlement checklist generated from existing property snapshot fields without external AI credentials.
- Host rooms now include deterministic Live Room Intelligence: LMSR consensus, implied room value, room liquidity, participant depth, movement summaries from recent bets, pressure points, host script prompts, and draft-audit provenance notes, all explicitly marked as local fallback with no provider-backed comps queried.
- Host rooms now link to `/review/:roomCode`, an operator-facing deterministic review surface that combines public room state with host-authorized event logs to compare draft audits, settlement evidence, live movement, integrity checks, timeline entries, and generated recap bullets.
- Player rooms now include deterministic Pre-Bet Intelligence: a compact local LMSR read with one reason to believe, one reason to doubt, OVER/UNDER wager-impact previews, balance-capped warnings, and no-provider-comps provenance before the player taps a bet.
- Host and settled player rooms now link to `/recap/:roomCode`, a share-safe public recap route that reads only public room state, summarizes live or settled LMSR movement, public activity, settlement result, and guardrails, and avoids host-only event logs plus host/user tokens.
- Operator review and public recap now share `RoomArtifact` UI primitives plus co-located CSS for artifact page chrome, headers, status pills, metrics, panels, evidence rows, timelines, notices, lists, and mobile responsive behavior.
- Player pre-bet intelligence now uses a dedicated `PreBetIntelligenceCard` component with co-located CSS, preserving LMSR preview copy, balance warnings, provenance, accessibility labels, and existing browser test IDs while shrinking the route-local inline style surface.
- Player settled recaps now use a dedicated `PlayerSettlementResultCard` component with co-located CSS, preserving settlement evidence, public recap navigation, payout rows, outcome coloring, and the existing `player-settlement-result` / `player-recap-link` browser contracts.
- Player pre-bet balance-capped warnings now expose a stable rendered test hook and polite live semantics, with browser coverage proving an over-balance selected wager previews against the player's remaining simulation-credit balance and rejects cleanly without mutating the balance.
- Host Live Room Intelligence now uses a dedicated `HostRoomIntelligencePanel` component with co-located CSS, preserving deterministic room-intelligence copy, provenance notes, accessible heading structure, icons, confidence state, and the existing `host-room-intelligence-panel` test hook.
- Host Market Studio draft audits now use a dedicated `HostDraftAuditCard` component with co-located CSS, preserving source, validation, linked-property, format, question, audit-retention copy, the existing `host-draft-audit-note` test hook, and the route's host command-column placement.
- Market Studio generated drafts now render through a dedicated `MarketStudioDraftCard` component with co-located CSS, preserving editable generated address/price fields, settlement-evidence lists, local-generation warnings, provenance, and the existing `market-studio-draft` browser test hook.
- Market Studio saved drafts and existing-property matches now render through dedicated `MarketStudioSavedDrafts` and `MarketStudioMatches` components with co-located CSS, preserving load/delete/use-match controls and the existing `market-studio-saved-drafts` / `market-studio-matches` browser test hooks.
- `/join` pick, create-room, and join-room chrome now render through `JoinModePicker`, `CreateRoomForm`, and `JoinRoomForm` components with co-located CSS, preserving labels, validation IDs, autofocus, room-code normalization, disabled/loading states, and the existing create/join navigation flows.
- Market Studio's host/source/generate/match/save/create form shell now renders through `MarketStudioForm` with co-located CSS, preserving local draft generation, saved draft handling, existing-property matching, draft editing, validation/error wiring, and host room creation while shrinking `JoinPage` to route orchestration.
- `/join` page chrome now renders through `JoinPageShell` with co-located CSS, preserving the FairValue logo/header, Studio-width container expansion, Browse Markets footer action, and mobile responsive frame while removing the last route-local style object from `JoinPage`.
- Host room chrome now renders through `HostTopBar` and `HostAuthorityNotice` with co-located CSS, preserving room code, player count, connection status, Review/Recap links, AI toggle, Settle control, disabled-authority descriptions, loading-bar behavior, and existing host test hooks while removing route-local command-bar styles from `HostView`.
- Host property/probability summary now renders through `HostPropertySummary` with co-located CSS, and `HostView` now uses responsive page/layout CSS so the host command column collapses above the right rail on mobile instead of forcing horizontal overflow.
- Host market probability chart and live room stats now render through `HostMarketChartPanel` with co-located CSS, preserving the chart callback ref, legend, responsive stat layout, and existing `total-trades`, `total-volume`, and `avg-bet` test hooks.
- Host settlement results now render through `HostSettlementResultCard` with co-located CSS, preserving settlement evidence copy, outcome coloring, the `host-settlement-result` test hook, and removing the final route-local style object from `HostView`.

## Current Test Status

- 2026-05-16 Player Settlement Result Card pass: `npm run typecheck` passed; focused host/player Playwright flow passed room `04GQ`, covering settlement broadcast and the extracted player settlement surface; rendered mobile probe on backend `8107` / frontend `3107` created room `NINA`, opened `/play/NINA` at `390x844`, verified `Market Settled`, `Actual price: $735,000`, `OVER wins!`, settlement recap trust copy, public recap link, payout row `Mobile Host` / `$0`, no active alerts, no framework overlay, no horizontal overflow with `documentWidth=384`, and screenshot `/tmp/fairvalue-player-settlement-result-mobile.png`; Browser plugin was present but its required Node REPL control tool was unavailable through tool discovery, so rendered proof used Playwright MCP fallback and recorded two benign dev WebSocket close warnings during route transitions; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 734.77 kB / 760.00 kB, and `smoke:boot` room `QV0O`.
- 2026-05-16 Host Settlement Result Card pass: `npm run typecheck` passed; focused host/player Playwright flow passed room `AKFP`, covering host settlement and the extracted `host-settlement-result` surface; rendered mobile probe on backend `8105` / frontend `3105` created room `S2LJ`, settled at actual price `735000`, verified `Market Settled`, `Actual: $735,000`, `OVER WINS`, settlement-evidence trust copy, no active alerts, no horizontal overflow, and screenshot `/tmp/fairvalue-host-settlement-result-mobile.png`; rendered probe used Playwright MCP fallback because Browser Node REPL remained unavailable and recorded one benign dev WebSocket close warning during route setup; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 735.11 kB / 760.00 kB, and `smoke:boot` room `K4HB`.
- 2026-05-16 Host Market Chart Panel pass: `npm run typecheck` passed; focused host/player Playwright flow passed room `EXR4`, covering real bets and the moved `total-trades`, `total-volume`, and `avg-bet` values; rendered mobile probe on backend `8103` / frontend `3103` created room `Y3ET`, scrolled `host-market-chart-panel` into view at `390x844`, verified title, legend, stat labels, mounted chart canvases, no active alerts, no horizontal overflow, and screenshot `/tmp/fairvalue-host-market-chart-panel-mobile.png`; rendered probe used Playwright MCP fallback because Browser Node REPL remained unavailable and recorded one benign dev WebSocket close warning during route setup; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 735.16 kB / 760.00 kB, and `smoke:boot` room `47DW`.
- 2026-05-16 Host Property Summary And Responsive Layout pass: `npm run typecheck` passed; focused host/player Playwright flow passed room `FG01`, covering the rendered host property address plus the full AI/settlement path; rendered mobile probe on backend `8101` / frontend `3101` initially caught host-page overflow at `documentWidth=656` on a `390x844` viewport from the fixed right rail, then after adding responsive `HostView.css` reran room `B3WX` and verified `documentWidth=384`, no horizontal overflow, no active alerts, connected state, summary text `987 Narrow View Lane`, `$925,000`, and `THINK OVER`, with screenshot `/tmp/fairvalue-host-property-summary-mobile.png`; rendered probe used Playwright MCP fallback because Browser Node REPL remained unavailable and recorded one benign dev WebSocket close warning during route reload; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 735.20 kB / 760.00 kB, and `smoke:boot` room `JN3C`.
- 2026-05-16 Host Top Bar And Authority Notice pass: `npm run typecheck` passed; focused host/player Playwright flow passed room `SW78`, covering player count, AI toggle, settlement modal, and settlement result; focused missing-authority Playwright passed room `3HA9`, covering disabled AI/Settle controls and `aria-describedby` wiring; rendered desktop probe on backend `8099` / frontend `3099` created room `LQR7`, verified normal top-bar text, connected state, AI `aria-pressed=false`, no active alerts, no horizontal overflow, then cleared browser authority and verified the `host-authority-warning`, disabled AI/Settle controls, matching descriptions, no overflow, and screenshots `/tmp/fairvalue-host-topbar-desktop.png` plus `/tmp/fairvalue-host-topbar-authority-desktop.png`; rendered probe used Playwright MCP fallback because Browser Node REPL remained unavailable and recorded two benign dev WebSocket close warnings during route reloads; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 735.55 kB / 760.00 kB, and `smoke:boot` room `OBRQ`.
- 2026-05-16 Host Draft Audit UI Component pass: `npm run typecheck` passed; focused `npm test -- marketIntelligence roomReview publicRoomRecap` passed 3 files / 10 tests; focused Playwright passed the Market Studio draft-to-host-room path with room `ZE7T`; rendered desktop probe on backend `8096` / frontend `3096` created room `UPZF`, opened `/host/UPZF` at `1366x900`, verified source `Local property dataset match`, linked property `440298192`, server-validated audit copy, Live Room Intelligence draft-audit linkage, connected state, no active alerts, and no horizontal overflow with screenshot `/tmp/fairvalue-host-draft-audit-card-desktop.png`; Browser plugin Node REPL was unavailable through tool discovery, so the rendered probe used Playwright MCP fallback and recorded one benign dev WebSocket close warning during route setup; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 736.07 kB / 760.00 kB, and `smoke:boot` room `KU9R`.
- 2026-05-16 Player Pre-Bet Balance Cap/Rejection pass: `npm run typecheck` passed; focused `npm test -- playerBetPreview` passed 1 file / 2 tests; focused Playwright passed the balance-capped preview plus over-balance rejection spec with room `N0J8`; rendered mobile probe on backend `8094` / frontend `3094` created room `AMTB`, joined `/play/AMTB`, placed a `$950` OVER wager, verified remaining balance `50`, verified `Preview capped at your current $50 balance.`, clicked the still-selected `$950` OVER action again, verified the natural `400 Insufficient balance` response, inline alert, toast, `aria-invalid`, `aria-describedby`, rollback to balance `50`, no horizontal overflow, and captured the error at `/tmp/fairvalue-overbalance-error-mobile.png` with the expected rejected-bet resource console entry plus one benign dev WebSocket close warning; full `npm run test:e2e:isolated` passed 34 Chromium tests; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 736.17 kB / 760.00 kB, and `smoke:boot` room `ADNL`.
- 2026-05-16 Join Page Shell pass: `npm run typecheck` passed; focused `npm test -- marketStudioDrafts marketDrafts` passed 2 files / 9 tests; focused Playwright passed the Market Studio, expanded accessibility, and keyboard/screen-reader-adjacent specs with rooms `S4KR`, `3UVC`, and `VN0I`; rendered mobile probe on backend `8090` / frontend `3090` opened `/join` at `390x844`, verified pick/create/join/studio shell states, Studio container expansion, Browse Markets footer text, `ab12` to `AB12` room-code normalization, no active alerts, no console errors beyond the expected React DevTools info line, and no horizontal overflow with screenshot `/tmp/fairvalue-join-page-shell-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 736.11 kB / 760.00 kB, and `smoke:boot` room `2USE`.
- 2026-05-16 Market Studio Form Shell pass: `npm run typecheck` passed; focused `npm test -- marketStudioDrafts marketDrafts` passed 2 files / 9 tests; focused Playwright passed the Market Studio draft-to-host-room path with room `406B`; rendered mobile probe on backend `8088` / frontend `3088` opened `/join` at `390x844`, generated a matching draft for `3004 26th St`, used the local property, saved the draft, verified draft/match/saved panel text, no active alerts, no console errors beyond the expected React DevTools info line, and no horizontal overflow with screenshot `/tmp/fairvalue-market-studio-form-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 736.70 kB / 760.00 kB, and `smoke:boot` room `YIXT`.
- 2026-05-16 Join Entry UI Component pass: `npm run typecheck` passed; focused `npm test -- marketStudioDrafts marketDrafts` passed 2 files / 9 tests; focused Playwright batch passed Market Studio and keyboard/screen-reader-adjacent specs while the expanded accessibility spec timed out during context close, then a single-spec rerun of expanded routes/forms/modal accessibility passed in 8.3s; rendered mobile probe on backend `8086` / frontend `3086` opened `/join` at `390x844`, verified the extracted picker, create form values, join form values, `ab12` to `AB12` room-code normalization, no active alerts, no failed resources, and no horizontal overflow with screenshot `/tmp/fairvalue-join-entry-components-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 737.39 kB / 760.00 kB, and `smoke:boot` room `JJ9P`.
- 2026-05-16 Market Studio Saved/Match UI Component pass: `npm run typecheck` passed; focused `npm test -- marketStudioDrafts marketDrafts` passed 2 files / 9 tests; focused Playwright passed the Market Studio draft-to-host-room path covering existing-property match use and saved draft creation; rendered mobile probe on backend `8083` / frontend `3083` opened `/join` at `390x844`, generated a matching draft for `3004 26th St`, used the local property, saved the draft, verified match/saved panel text, no active alerts, and no horizontal overflow with screenshot `/tmp/fairvalue-market-studio-panels-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 736.54 kB / 760.00 kB, and `smoke:boot` room `SS91`.
- 2026-05-16 Market Studio Draft UI Component pass: `npm run typecheck` passed; focused `npm test -- marketDrafts marketStudioDrafts` passed 2 files / 9 tests; focused Playwright passed the Market Studio draft-to-host-room path including generated draft editing and host room creation; rendered mobile probe on backend `8081` / frontend `3081` opened `/join` at `390x844`, generated a draft from pasted listing text, verified the extracted draft-card text, no active alerts, and no horizontal overflow with screenshot `/tmp/fairvalue-market-studio-draft-component-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 737.85 kB / 760.00 kB, and `smoke:boot` room `DFRN`.
- 2026-05-16 Host Room Intelligence UI Component pass: `npm run typecheck` passed; focused `npm test -- marketIntelligence` passed 1 file / 6 tests; focused Playwright passed the Market Studio draft-to-host-room path including Live Room Intelligence assertions and serious/critical axe coverage; rendered desktop probe on backend `8079` / frontend `3079` created room `ZS9X`, opened `/host/ZS9X` at `1440x900`, verified the extracted host-intelligence panel text, no active alerts, and no horizontal overflow with screenshot `/tmp/fairvalue-host-intelligence-component-desktop.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 738.67 kB / 760.00 kB, and `smoke:boot` room `Y0YV`.
- 2026-05-16 Player Pre-Bet UI Component pass: `npm run typecheck` passed; focused `npm test -- playerBetPreview` passed 1 file / 2 tests; focused Playwright passed the multiplayer room entry/settlement trust-language path including pre-bet assertions; rendered mobile probe on backend `8077` / frontend `3077` created room `9KGP`, joined `/play/9KGP` at `390x844`, verified the extracted pre-bet card text, no active alerts, and no horizontal overflow with screenshot `/tmp/fairvalue-prebet-component-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 740.32 kB / 760.00 kB, and `smoke:boot` room `RUJZ`.
- 2026-05-16 Room Artifact UI Foundation pass: `npm run typecheck` passed after extracting the shared component/CSS layer; focused Playwright passed 3 Chromium tests covering public recap privacy, Market Studio operator review, and settled operator review from the room flow; rendered visual probe on backend `8075` / frontend `3075` created settled room `S9IS`, verified `/review/S9IS` at `1440x900` and `/recap/S9IS` at `390x844` with no horizontal overflow and zero console/page issues, saving `/tmp/fairvalue-artifact-review-desktop.png` and `/tmp/fairvalue-artifact-recap-mobile.png`; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 741.12 kB / 760.00 kB, and `smoke:boot` room `XQX0`.
- 2026-05-16 Share-Safe Public Recap pass: focused `npm test -- publicRoomRecap` passed 1 file / 2 tests; `npm run typecheck` passed; focused Playwright passed the public recap route privacy/accessibility test; mobile visual probe on backend `8072` / frontend `3072` rendered settled room `Z7IM`, verified `/recap/Z7IM` at `390x844` with no horizontal overflow, no console/page issues, settlement evidence, no private-token text, and screenshot `/tmp/fairvalue-public-recap.png`; final full `npm run test:e2e:isolated` passed 33 Chromium tests; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 12 Vitest suites / 65 tests, production build, bundle budget with total JS 747.00 kB / 760.00 kB, and `smoke:boot` room `JNS6`.
- 2026-05-16 Player Pre-Bet Intelligence pass: focused `npm test -- playerBetPreview` passed 1 file / 2 tests after a retry from a Vitest worker-start timeout; `npm run typecheck` passed; focused Playwright passed 3 Chromium tests for player trust/pre-bet render, wager validation, and keyboard/mobile control paths; mobile visual probe on backend `8068` / frontend `3068` created room `FZNS`, rendered the pre-bet read, verified the `$25` OVER button stayed visible, and saved `/tmp/fairvalue-player-prebet-mobile.png`; final full `npm run test:e2e:isolated` passed 32 Chromium tests; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 11 Vitest suites / 63 tests, production build, bundle budget with total JS 735.24 kB / 760.00 kB, and `smoke:boot` room `100V`.
- 2026-05-16 Operator Review Route pass: focused `npm test -- roomReview marketIntelligence` passed 2 files / 8 tests; focused Market Studio/settlement Playwright passed paste listing -> create host room -> open operator review plus settled-room review assertions; targeted negative-path tail rerun passed 10 Chromium tests after investigating an earlier backend `ECONNREFUSED` run interruption; final full `npm run test:e2e:isolated` passed 32 Chromium tests; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 10 Vitest suites / 61 tests, production build, bundle budget with total JS 729.93 kB / 760.00 kB, and `smoke:boot` room `191L`.
- 2026-05-16 Room-Aware Market Intelligence pass: focused `npm test -- marketIntelligence` passed 1 file / 6 tests; `npm run typecheck` passed; focused Market Studio Playwright passed paste listing -> local match -> create host room -> render draft audit and live intelligence; targeted host/browser regressions passed 5 Chromium tests; targeted negative-path regressions passed 3 Chromium tests; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 9 Vitest suites / 59 tests, production build, bundle budget, and `smoke:boot` room `ZC39`; final full `npm run test:e2e:isolated` passed 32 Chromium tests; live local Playwright render on backend `8052` / frontend `3052` created room `L5B1`, rendered host draft audit plus Live Room Intelligence with linked property `440298192`, no-bet movement read, `$0` liquidity copy, accepted draft audit, and no-provider-comps provenance, returned backend `/healthz` ok, and reported zero page errors with one benign dev WebSocket close warning during navigation.
- 2026-05-16 Market Studio server draft-audit pass: focused `node --test server/__tests__/validationAndIdempotency.test.js server/__tests__/roomEventLog.test.js` passed 11 server tests; focused `npm test -- marketDrafts marketStudioDrafts` passed 2 files / 9 tests; `npm run typecheck` passed; focused Market Studio Playwright passed paste listing -> local match -> use matched property -> create host room -> render host draft audit; final `npm run verify` passed client secret scan, typecheck, 44 server tests, 9 Vitest suites / 57 tests, production build, bundle budget, and `smoke:boot` room `MFJD`; final full `npm run test:e2e:isolated` passed 32 Chromium tests; live local render on backend `8049` / frontend `3049` created room `298G`, rendered the server-validated draft audit card with linked property `440298192`, returned `/healthz` ok, and reported zero console/page errors.
- 2026-05-16 Market Studio matching/saved-drafts pass: focused `npm test -- marketStudioDrafts marketDrafts` passed 2 files / 9 tests; `npm run typecheck` passed; focused Market Studio Playwright passed paste listing -> local property match -> use matched property -> save draft -> create host room; final `npm run verify` passed client secret scan, typecheck, 43 server tests, 9 Vitest suites / 57 tests, production build, bundle budget, and `smoke:boot` room `LYSK`; final full `npm run test:e2e:isolated` passed 32 Chromium tests; live local render on backend `8047` / frontend `3047` returned `/join` 200 and `/healthz` ok, with desktop/mobile Studio snapshots showing match/save/create controls and only the expected React DevTools info console entry.
- 2026-05-16 Market Detail Intelligence pass: focused `npm test -- marketIntelligence` passed 4 tests; `npm run typecheck` passed; focused Playwright market-detail route passed desktop/mobile content and serious axe checks; final `npm run verify` passed client secret scan, typecheck, 43 server tests, 8 Vitest suites / 53 tests, production build, bundle budget, and `smoke:boot` room `FWGP`; final full `npm run test:e2e:isolated` passed 32 Chromium tests; live browser render on backend `8045` / frontend `3045` returned `/market/440298192` 200 and `/healthz` ok with desktop/mobile snapshots and only the expected React DevTools info console entry.
- 2026-05-16 Market Studio pass: baseline `npm run typecheck`, `npm test`, and `npm run test:server` passed before edits; focused `npm test -- marketDrafts` passed 5 tests; focused Market Studio Playwright passed; live local dev smoke on backend `8042` / frontend `3042` returned `/join` 200 and `/healthz` ok, with desktop/mobile browser snapshots showing the new Market Studio option and only the expected React DevTools info console entry; final `npm run verify` passed client secret scan, typecheck, 43 server tests, 7 Vitest suites / 49 tests, production build, bundle budget, and `smoke:boot` room `1NFU`; final full `npm run test:e2e:isolated` passed 32 Chromium tests after a strict-locator assertion was tightened.
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
- 2026-05-11 restart browser matrix pass: `npx playwright test --list -c playwright.restart.matrix.config.ts` listed Chromium, Firefox, and WebKit restart-recovery projects; `npm run test:e2e:restart` passed the default Chromium restart/load test; `npm run test:e2e:restart:matrix` passed Chromium, Firefox, and WebKit restart/load recovery; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-11 restart latency profile pass: `npm run test:latency:restart` passed with create p95 84ms, join p95 263ms, bet p95 161ms, state p95 69ms, settle p95 8ms, restart readiness 1271ms, first recovered state 1478ms, and recovery wave 1696ms; `npm run verify` passed client secret scan, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- 2026-05-11 Vite/Vitest toolchain pass: `npm test` passed 5 Vitest suites / 41 tests; `npm run build` passed with Vite; `npm audit --json` and `npm audit --omit=dev --json` both reported 0 vulnerabilities; `npm run test:e2e:isolated` passed 9 Chromium tests on Vite frontend `3010` / backend `8010`; `npm run test:e2e:restart` passed the Chromium restart harness; `npm run test:e2e:matrix` passed Chromium, Firefox, and WebKit host/player flow; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, and Vite production build; `npm run test:e2e:restart:matrix` passed Chromium, Firefox, and WebKit restart/load recovery.
- 2026-05-11 Vite route-splitting pass: `npm run build` dropped the largest JS chunk to 199.30 kB with no Vite large-chunk warning; focused keyboard E2E passed after keeping `/join` eager; full `npm run test:e2e:isolated` passed 9 Chromium tests; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, and Vite production build; `npm run test:e2e:matrix` passed Chromium, Firefox, and WebKit host/player flows.
- 2026-05-11 bundle budget pass: `npm run check:bundle` passed with largest JS 194.63 kB / 240 kB, total JS 656.45 kB / 760 kB, and largest CSS 14.74 kB / 25 kB; `npm run verify` passed with the same bundle budget gate included after build.
- 2026-05-11 assistive-technology AX pass: `npm run test:a11y:assistive` passed with room `N5A8` on frontend `64036` / backend `64034`, recording PASS for `/join`, create-room form, host dashboard, settle modal, player join form, and mobile betting controls; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 rendered browser load pass: `npm run test:e2e:browser-load` passed with room `VF08`, 10 rendered mobile player pages, 11 persisted players including host, 10 trades, 77 events, settlement, join wave 1703ms, bet wave 502ms, settlement 130ms, total 5031ms; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 cold production performance pass: `npm run test:performance:cold` passed with room `P4AZ`, production build 1778ms, cold join route ready 94ms, create-to-connected 162ms, cold player route ready 832ms, player join 166ms, bet-to-host sync 97ms, settlement broadcast 63ms, and all local budgets passing; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 mixed traffic pass: `npm run test:e2e:mixed-traffic` passed with room `6PD9`, 4 throttled rendered mobile players, 12 API churn players, 18 state reads, 17 persisted players including host, 16 trades, 65 events, 419 total wagered, join/churn 127295ms, rendered slow bets 780ms, settlement 510ms, total 129663ms; `npm run verify` passed client secret scan, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 live Postgres readiness path pass: `npm run test:persistence:live` passed in no-credential degraded/skip mode, `npm run test:server` passed 26 server tests including targeted room persistence methods, `npm run test:persistence:postgres` passed against Docker `postgres:16-alpine` on local port `60192`, and `npm run verify` passed client secret scan, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 expanded assistive route coverage pass: `npm run test:a11y:assistive` passed with room `TFKC` on frontend `57887` / backend `57886`, recording PASS for browse, sort menu, property detail, join pick, create-room form, host dashboard, AI degraded alert, settle modal, player join, betting controls, host settled result, and player settled result; `npm run verify` passed client secret scan, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 accessibility edge-state pass: focused edge E2E first caught serious Leaflet popup contrast failures, then passed after popup styling fixes; full `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` passed 5 Chromium tests, full `npm run test:e2e:isolated` passed 10 Chromium tests, and `npm run verify` passed client secret scan, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 corrupt snapshot recovery pass: `npm run test:server` passed 27 server tests including malformed JSON snapshot quarantine/rewrite coverage; `npm run test:e2e:restart` passed the Chromium repeated-backend-restart harness; `npm run verify` passed client secret scan, 27 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 encrypted snapshot pass: `node --test server/__tests__/restartPersistence.test.js` passed plaintext and encrypted child-process restart restore cases; `FAIRVALUE_ROOM_SNAPSHOT_SECRET=playwright-encrypted-restart npm run test:e2e:restart` passed the Chromium repeated-backend-restart harness with encrypted local snapshots; final `npm run verify` passed client secret scan, 29 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 local retention pass: `npm run test:server` passed 30 server tests including settled-room retention pruning; `npm run test:e2e:restart` passed the Chromium repeated-backend-restart harness; `npm run verify` passed client secret scan, 30 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 Postgres retention pass: `node --test server/__tests__/roomPersistence.test.js` passed 10 targeted persistence tests; `npm run test:persistence:postgres` passed against Docker `postgres:16-alpine` with `retentionPruned: true`; `npm run test:server` passed 31 server tests; `npm run verify` passed client secret scan, 31 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 backend observability pass: baseline `npm run verify` passed before the loop; `node --test server/__tests__/observability.test.js` passed 3 focused ops tests; `npm run test:server` passed 34 server tests; final `npm run verify` passed client secret scan, 34 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 production readiness pass: `node --test server/__tests__/productionReadiness.test.js` passed 3 checker tests; local `npm run check:production` failed as expected with 5 blockers and 3 warnings; a synthetic production Postgres env passed with only the optional Cognee warning; `npm run test:server` passed 37 server tests; final `npm run verify` passed client secret scan, 37 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 Prometheus metrics pass: baseline `npm run verify` passed before the exporter; `node --check server/observability.js && node --check server/index.js && node --check server/__tests__/observability.test.js && node --test server/__tests__/observability.test.js` passed 4 focused ops tests; `npm run test:server` passed 38 server tests; final `npm run verify` passed client secret scan, 38 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 TypeScript verification pass: `npx tsc --noEmit` initially failed because TypeScript 4.9 could not resolve Vite 8 plugin package-export types; after upgrading TypeScript and switching to `moduleResolution: bundler`, `npm run typecheck` passed, `npm run verify` passed client secret scan, TypeScript type checking, 38 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate, and `npm audit --json` reported 0 vulnerabilities.
- 2026-05-11 HTTP security headers pass: `node --check server/index.js && node --check server/__tests__/securityHeaders.test.js && node --test server/__tests__/securityHeaders.test.js` passed 3 focused header tests; `npm run verify` passed client secret scan, TypeScript type checking, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- 2026-05-11 E2E TypeScript coverage pass: a broad `tsc` probe first exposed unchecked Playwright/WebSocket spec types and a nullable restart-process guard; after adding `@types/ws`, fixing the guard, and expanding `tsconfig.json`, `npm run typecheck` passed over E2E specs and Playwright configs, `npx playwright test --list -c playwright.restart.config.ts` listed the restart test, `npm run verify` passed client secret scan, typecheck, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate, and `npm audit --json` reported 0 vulnerabilities.
- 2026-05-11 local backend boot smoke pass: `node --check scripts/smoke-local-boot.js && npm run smoke:boot` passed with room `UL61` on a free local port; final `npm run verify` passed client secret scan, typecheck, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, bundle budget gate, and `smoke:boot` with room `KA6M`.
- 2026-05-11 player validation notification pass: `npm test -- ToastContainer` passed 1 suite / 2 tests, `npm run typecheck` passed, focused player-validation E2E first caught a serious toast contrast regression during the opacity animation, the fixed focused E2E passed, `npm test` passed 6 Vitest suites / 43 tests, `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` passed 5 Chromium tests, full `npm run test:e2e:isolated` passed 10 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate, and `smoke:boot` with room `VAE4`.
- 2026-05-11 host action notification pass: focused fake-token AI-toggle E2E passed, `npm run typecheck` passed, first full isolated E2E run caught a strict-locator collision between the AI control and the new success-toast dismiss button, the fixed host/player flow passed, final full `npm run test:e2e:isolated` passed 11 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate, and `smoke:boot` with room `DV6G`.
- 2026-05-11 settlement notification pass: focused fake-token settlement E2E passed, `npm run typecheck` passed, full `npm run test:e2e:isolated` passed 11 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.67 kB / 760.00 kB, and `smoke:boot` with room `3IO2`.
- 2026-05-11 fake cloud-sync removal pass: repository search found no remaining `useCloudFairValue`, `cloudPersistence`, `fairvalue_cloud_data`, `api.fairvalue.io`, `VITE_COGNEE_API_URL`, mock API endpoint, or stub implementation references under `src`, `server`, `e2e`, `README.md`, or `package.json`; `npm run scan:secrets`, `npm run typecheck`, `git diff --check`, and final `npm run verify` passed with 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets, and `smoke:boot` room `CVKK`.
- 2026-05-11 direct player join validation pass: focused E2E initially failed because the test incorrectly waited for the post-join `Connected` badge on the pre-join player form; after aligning the test with the actual pre-join surface, focused direct-player-join E2E passed, full `npm run test:e2e:isolated` passed 12 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets, and `smoke:boot` room `K7HY`.
- 2026-05-11 market-start failure notification pass: focused market detail room-creation failure E2E passed with an axe serious/critical check, full `npm run test:e2e:isolated` passed 13 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.15 kB / 760.00 kB, and `smoke:boot` room `IIAA`.
- 2026-05-11 join-page API failure notification pass: focused E2E first caught a strict text-locator collision between inline `Room not found` and the new toast; after scoping the assertion to `#join-room-error`, focused E2E passed 2 Chromium tests, full `npm run test:e2e:isolated` passed 14 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.44 kB / 760.00 kB, and `smoke:boot` room `SCUB`.
- 2026-05-11 player bet rollback notification pass: focused E2E passed a forced non-JSON `POST /api/rooms/:roomCode/bet` 503 branch, full `npm run test:e2e:isolated` passed 15 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.62 kB / 760.00 kB, and `smoke:boot` room `YAIQ`.
- 2026-05-11 direct player join API failure pass: focused E2E passed a forced non-JSON `POST /api/rooms/:roomCode/join` 503 branch, full `npm run test:e2e:isolated` passed 16 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.63 kB / 760.00 kB, and `smoke:boot` room `OGC4`.
- 2026-05-11 join-page room-code outage pass: focused E2E passed a forced non-JSON `/join` room-code submit 503 branch, full `npm run test:e2e:isolated` passed 17 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.63 kB / 760.00 kB, and `smoke:boot` room `V22O`.
- 2026-05-11 join-page host auto-join outage pass: focused E2E passed the partial-success branch where `/api/rooms` succeeds but the host auto-join returns a non-JSON 503; full `npm run test:e2e:isolated` passed 18 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with total JS 659.63 kB / 760.00 kB, and `smoke:boot` room `GPVX`.
- 2026-05-11 market host auto-join outage pass: focused E2E passed the partial-success branch where `/market/:propertyId` room creation succeeds but the automatic host join returns a non-JSON 503; full `npm run test:e2e:isolated` passed 19 Chromium tests, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.75 kB / 240.00 kB and total JS 659.63 kB / 760.00 kB, and `smoke:boot` room `RZIO`.
- 2026-05-11 market trust explainer pass: focused E2E passed desktop/mobile market-trust assertions with serious/critical axe checks, full `npm run test:e2e:isolated` passed 20 Chromium tests, a rendered visual probe on `http://127.0.0.1:3010/market/440298192` confirmed desktop/mobile visibility and no console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.76 kB / 240.00 kB and total JS 662.87 kB / 760.00 kB, and `smoke:boot` room `BPII`.
- 2026-05-11 multiplayer trust notes pass: focused E2E passed host/player room-entry and settlement-recap trust-note assertions with serious/critical axe checks, full `npm run test:e2e:isolated` passed 21 Chromium tests, a rendered visual probe on room `PL34` confirmed host/player entry, active room, settlement modal, and settled recaps with zero console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.76 kB / 240.00 kB and total JS 665.59 kB / 760.00 kB, and `smoke:boot` room `RLDH`.
- 2026-05-11 malformed host action response pass: focused malformed-response E2E passed 3 Chromium tests after first catching and fixing toast contrast over the settlement modal, `npm test -- ToastContainer` passed 1 file / 2 tests, full `npm run test:e2e:isolated` passed 23 Chromium tests, rendered visual probe on room `0D8A` confirmed settlement/AI malformed-response toasts with zero console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.65 kB / 240.00 kB and total JS 665.89 kB / 760.00 kB, and `smoke:boot` room `IH9I`.
- 2026-05-11 missing host authority controls pass: focused E2E passed 1 Chromium test for `/host/:roomCode` without host authority, full `npm run test:e2e:isolated` passed 24 Chromium tests, rendered visual probe on room `CFHB` confirmed the warning and disabled-control descriptions with zero console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.65 kB / 240.00 kB and total JS 667.13 kB / 760.00 kB, and `smoke:boot` room `TGHR`.
- 2026-05-11 identity failure handling pass: focused identity E2E passed 2 Chromium tests, full `npm run test:e2e:isolated` passed 26 Chromium tests, rendered visual probe on room `XEPD` confirmed create-room identity outage and malformed player-join identity states with 2 expected `/api/identity` 503 resource console entries and zero unexpected console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.72 kB / 240.00 kB and total JS 667.20 kB / 760.00 kB, and `smoke:boot` room `REAG`.
- 2026-05-11 room state load failure pass: focused room-state E2E passed 2 Chromium tests; the first full isolated run caught an anonymous create-room rate-limit harness issue, the helper was fixed to send a unique `session_id`, the rerun passed 28 Chromium tests, a rendered visual probe on rooms `I39X` and `XON8` confirmed host state-outage and player malformed-state alerts with 1 expected state `503` resource error and zero unexpected console/page errors, and final `npm run verify` passed client secret scan, typecheck, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budgets with largest JS 195.71 kB / 240.00 kB and total JS 669.25 kB / 760.00 kB, and `smoke:boot` room `P6T9`.
- 2026-05-11 cited local AI analyst pass: focused server AI tests passed 2 node tests, focused Cognee service Vitest passed 4 tests, focused AI E2E passed 1 Chromium test, the broader accessibility/keyboard E2E passed 2 Chromium tests after adding keyboard access to the scrollable AI log, full `npm run test:e2e:isolated` passed 28 Chromium tests, rendered visual probe on room `RL7D` confirmed initialize/state/search all return 200 with cited local analysis and zero unexpected console issues, and final `npm run verify` passed client secret scan, typecheck, 43 server tests, 6 Vitest suites / 44 tests, Vite production build, bundle budgets with largest JS 195.71 kB / 240.00 kB and total JS 669.75 kB / 760.00 kB, and `smoke:boot` room `EWKR`.

## Current Known Risks

- Rotate the Cognee key that was previously committed in client code; treat it as compromised.
- Host-only settlement and AI toggles now accept durable signed host identity for newly created rooms while still supporting legacy room host tokens.
- Room connections, rate-limit buckets, and AI bot intervals are still process-local; restored rooms intentionally do not auto-resume AI intervals after restart.
- The Postgres snapshot adapter and opt-in retention are covered by fake-SQL tests, disposable local Postgres, and a no-credential live-readiness skip path; actual Neon write/read/delete plus retention-prune smoke still needs `DATABASE_URL` in this environment.
- Postgres retention is disabled by default; production operators still need to choose the actual retention/erasure window before enabling it live.
- Room snapshots include host capability tokens, so `.fairvalue/` must remain local runtime state and out of git.
- Shared LMSR/domain logic still has a server CommonJS canonical module and a browser ESM wrapper; parity tests guard the browser wrapper, but a future package-level dual-build could remove the duplication.
- Load/performance coverage now includes a bounded synthetic burst, a 24-player API/WebSocket wave soak, a local restart/load latency profile, a 10-rendered-mobile-player browser load profile, a cold production build/room-flow profile, and a network-throttled mixed traffic profile; production-hosted load and real external network profiles are still missing.
- Operations metrics are now visible locally, token-guarded for production, and available as JSON plus Prometheus text, but they are still process-local/in-memory and need a real external collector/dashboard config before multi-instance deployment.
- The production readiness checker is covered locally with synthetic envs; it still needs to be run against the actual deployment environment once real secrets/URLs exist.
- Accessibility coverage now gates serious/critical axe violations, keyboard/screen-reader-adjacent behavior, and macOS AX/ARIA evidence on the browse, property detail, market-start failure, join, host, player, settle, cited local AI fallback, settled-result, validation-error, map-popup, player notification, direct-player-join notification, identity-minting failure, room-state load failure, host-action notification, malformed host-action success, missing-host-authority controls, unauthorised operator-review event-history lock, and settlement-failure notification states; it still needs a human-listened VoiceOver rotor/audio pass and deeper coverage for remaining validation branches beyond the currently covered market-start room creation/host-auto-join, join-page API create/host-auto-join/join outage, direct-player-join validation/API failure, identity-minting failure, room-state load failure, cited local AI fallback, player-wager, player-bet API failure rollback, natural insufficient-balance rollback, pre-bet balance cap, settle, host-toggle, settlement-failure, malformed host-action response, and missing-host-authority paths.
- Market detail, multiplayer entry/settlement, and public recap surfaces now make simulated-credit and non-appraisal authority explicit; future invite or exported-result surfaces still need the same trust language when they exist.
- The cited local AI fallback is deterministic and covered without credentials; real Cognee-backed citation quality still needs live-key verification once a usable `COGNEE_API_KEY` is available.
- The production/runtime audit is otherwise clean after migrating off CRA/react-scripts; `npm audit --omit=dev` still reports the React Router RSC-mode advisory, which is documented as a BrowserRouter-only architecture boundary in `SECURITY.md` and remains a release-owner gate.
- Broader accessibility and deeper security test layers are still missing, though baseline HTTP security headers are now enforced and tested.
- Restart recovery is proven across Chromium, Firefox, and WebKit rendered host/two-player paths with retrying API load waves, plus a local restart/load latency budget profile.

## Current Backlog Ranked By Impact

1. Continue deeper branch-level coverage beyond the now-passing 42-test Chromium suite, prioritizing validation and notification states added after the current browser matrix.
2. Run a human-listened VoiceOver rotor/audio pass and close any remaining route/modal/accessibility edge states it uncovers.
3. Run `FAIRVALUE_LIVE_POSTGRES_SMOKE=1 npm run test:persistence:live` against a real Neon/Postgres URL once credentials are available.
4. Run a live `COGNEE_API_KEY` smoke once credentials are available to verify provider-backed citation quality against the deterministic local fallback.
5. Add production-hosted or externally tunneled load evidence once an environment/URL is available.
6. Configure the real external Prometheus/log collector/dashboard in the production deployment once an environment exists.
7. Run `npm run check:production` against the actual deployment environment once production env values are available.

## Iteration History

### 2026-05-16 - Player Settlement Result Card

- Extracted the settled player recap into `PlayerSettlementResultCard` with co-located CSS, preserving the trophy icon, actual price, winning-outcome styling, settlement trust copy, public recap link, and payout rows.
- Removed the settled-result style keys and settlement icon/link ownership from `PlayerView`, shrinking the route-local inline style surface while keeping the existing browser test hooks intact.
- Verified the player settled state with TypeScript, focused host/player Playwright coverage, a mobile rendered settlement probe, and the full `npm run verify` gate.

### 2026-05-16 - Host Settlement Result Card

- Extracted the settled host outcome recap into `HostSettlementResultCard` with co-located CSS, preserving the trophy icon, actual price, winning-outcome styling, settlement evidence trust notice, and `host-settlement-result` browser contract.
- Removed the final route-local `s` style object from `HostView`, leaving the route focused on room state, host controls, and composition.
- Kept outcome color semantics tied to the settled OVER/UNDER result while standardizing the card radius and spacing with the current host component layer.
- Verified the slice with TypeScript, focused host/player Playwright coverage, a mobile rendered settlement probe, and the full `npm run verify` gate.

### 2026-05-16 - Host Market Chart Panel

- Extracted the host market probability chart, legend, and stat rail into `HostMarketChartPanel` with co-located CSS.
- Preserved the `useMarketChart` callback ref and existing browser contracts for total trades, volume, and average bet.
- Added responsive stat layout so mobile host views stack market stats cleanly below the chart.
- Verified the slice with TypeScript, focused host/player Playwright coverage, a mobile rendered chart-panel probe, and the full `npm run verify` gate.

### 2026-05-16 - Host Property Summary And Responsive Layout

- Extracted the host property/probability summary into `HostPropertySummary` with co-located CSS, preserving address, asking price, OVER probability, and the host column placement.
- Added responsive `HostView.css` for the route shell, replacing fixed inline page/layout styles and collapsing the right rail beneath the main host column below `900px`.
- Used the rendered mobile probe to catch and fix a real host overflow bug where the fixed `360px` right rail forced a `656px` document width on a `390px` viewport.
- Verified the slice with TypeScript, focused host/player Playwright coverage, a before/after mobile rendered probe, and the full `npm run verify` gate.

### 2026-05-16 - Host Top Bar And Authority Notice

- Extracted the host command bar into `HostTopBar` with co-located CSS while preserving room code, player count, connection state, Review/Recap links, AI toggle semantics, and the Settle button ref used for modal focus restoration.
- Extracted the missing-host-authority warning into `HostAuthorityNotice`, preserving the `host-authority-warning` ID/test hook and disabled-control `aria-describedby` relationship.
- Routed the loading skeleton through the same top-bar component with status/actions hidden so the loading state no longer depends on removed route-local style keys.
- Verified the slice with TypeScript, focused host/player and missing-authority Playwright coverage, rendered normal/disabled host desktop probes, and the full `npm run verify` gate.

### 2026-05-16 - Host Draft Audit UI Component

- Extracted the host Market Studio draft-audit note into `HostDraftAuditCard` with co-located CSS, keeping `HostView` focused on orchestration and live room layout.
- Preserved the source, validation, linked-property, market-format, market question, server-validated audit-retention copy, accessibility label, and existing `host-draft-audit-note` browser contract.
- Removed the route-local draft-audit style block from `HostView` and aligned the extracted card with the host component styling pattern.
- Verified the slice with TypeScript, focused room-intelligence/review/recap unit tests, focused Market Studio Playwright coverage, a desktop rendered probe of the host command column, and the full `npm run verify` gate.

### 2026-05-16 - Player Pre-Bet Balance Cap And Rejection Coverage

- Added a stable `player-prebet-balance-warning` hook and polite live semantics to the rendered pre-bet balance warning.
- Added Chromium coverage for a player who spends `$950`, drops to a `$50` balance, and still has an over-balance wager selected so the pre-bet preview must cap movement math to the remaining simulation-credit balance.
- Extended the same browser path to click the over-balance wager, assert the natural `Insufficient balance` rejection, preserve the `$50` balance after rollback, and expose inline/toast/ARIA error semantics.
- Captured rendered mobile proof for the capped-warning and over-balance rejection state after joining and betting through the real `/play/:roomCode` UI.
- Verified the slice with TypeScript, focused player-preview unit tests, the new focused Playwright spec, full isolated Playwright, rendered mobile proof, and the full `npm run verify` gate.

### 2026-05-16 - Join Page Shell

- Extracted the `/join` route chrome into `JoinPageShell` with co-located CSS, preserving the logo/header, responsive glass frame, Studio-width expansion, and Browse Markets footer action.
- Removed the last route-local style object and lucide icon ownership from `JoinPage`, leaving it focused on room creation, Market Studio state, identity, validation, and navigation orchestration.
- Verified all pick/create/join/studio shell states at mobile width, including the footer, Studio expanded class, room-code normalization, no active alerts, and no horizontal overflow.
- Verified the slice with TypeScript, focused draft/storage unit tests, focused route accessibility/keyboard/Market Studio Playwright specs, a mobile rendered probe of `/join`, and the full `npm run verify` gate.

### 2026-05-16 - Market Studio Form Shell

- Extracted the remaining Market Studio form shell into `MarketStudioForm` with co-located CSS while preserving saved drafts, local-property matches, listing text input, generated draft rendering, save draft, create room, and back navigation.
- Kept `JoinPage` responsible for session identity, sanitization, validation, draft generation, property matching, persistence calls, and navigation while removing the large inline Market Studio JSX branch.
- Removed the remaining negative title letter spacing from `/join` page chrome so the route follows the current UI typography constraint.
- Verified the slice with TypeScript, focused draft/storage unit tests, focused Market Studio Playwright coverage, a mobile rendered probe of `/join`, and the full `npm run verify` gate.

### 2026-05-16 - Join Entry UI Components

- Extracted the `/join` picker into `JoinModePicker` with co-located CSS while preserving Create Room, Market Studio, and Join Room entry actions.
- Extracted simple create-room and join-room forms into `CreateRoomForm` and `JoinRoomForm`, preserving field labels, validation wiring, loading/disabled button states, autofocus, and room-code normalization.
- Reused one `RoomEntryForm.css` surface for the simple form chrome so the route stops carrying those repeated inline structures.
- Verified the slice with TypeScript, focused draft unit tests, focused Playwright route/form coverage, an expanded accessibility rerun, and a mobile rendered probe of `/join`.

### 2026-05-16 - Market Studio Saved And Match UI Components

- Extracted saved Market Studio draft rows into `MarketStudioSavedDrafts` with co-located CSS while preserving load and delete behavior.
- Extracted existing-property match rows into `MarketStudioMatches` with co-located CSS while preserving the local-property match action and match metadata.
- Removed the saved-draft and match-panel style objects from `JoinPage`, further narrowing the route to state, validation, and orchestration.
- Verified the slice with TypeScript, focused draft/storage unit tests, focused Market Studio Playwright coverage, and a mobile rendered probe of `/join`.

### 2026-05-16 - Market Studio Draft UI Component

- Extracted the generated Market Studio draft card into `MarketStudioDraftCard` with co-located CSS while preserving the deterministic `MarketDraft` contract.
- Moved the card's editable generated address/price fields, confidence/provenance header, settlement evidence list, metadata grid, and warning copy out of `JoinPage`.
- Preserved the `Generated market draft` accessibility label and `market-studio-draft` test hook so existing Market Studio browser coverage still exercises the generated draft surface.
- Verified the slice with TypeScript, focused draft unit tests, focused Market Studio Playwright coverage, and a mobile rendered probe of `/join`.

### 2026-05-16 - Host Room Intelligence UI Component

- Extracted the host dashboard's Live Room Intelligence section into `HostRoomIntelligencePanel` with co-located CSS while preserving the deterministic `RoomMarketIntelligence` contract.
- Removed the room-intelligence icon imports and style objects from `HostView`, leaving the route focused on room state, host authority, and layout orchestration.
- Preserved the `Live Room Intelligence` accessibility label and `host-room-intelligence-panel` test hook so existing browser coverage still exercises the same operator-facing surface.
- Verified the slice with TypeScript, focused market-intelligence unit tests, focused Market Studio Playwright coverage, and a desktop rendered probe of `/host/:roomCode`.

### 2026-05-16 - Player Pre-Bet UI Component

- Extracted the player room's pre-bet intelligence markup into `PreBetIntelligenceCard` with co-located CSS while preserving the deterministic `PlayerBetPreview` contract.
- Removed the pre-bet card's route-local inline style objects from `PlayerView`, keeping `PlayerView` focused on identity, room state, and betting behavior.
- Preserved the existing accessibility label and `player-prebet-*` test IDs so the multiplayer browser tests continue to exercise the same product surface.
- Verified the slice with TypeScript, focused player-preview unit tests, focused Playwright multiplayer coverage, and a mobile rendered probe of `/play/:roomCode`.

### 2026-05-16 - Room Artifact UI Foundation

- Added `RoomArtifact` primitives and co-located CSS for shared artifact page layout, header/status rails, notices, metric cards, panels, evidence rows, timeline rows, bullet lists, footer notes, and mobile responsiveness.
- Refactored `/review/:roomCode` and `/recap/:roomCode` off large route-local style objects while preserving existing route data loading, host-authorized event loading, public-state-only recap behavior, test IDs, and accessibility labels.
- Reduced duplicated inline page styling between operator review and public recap, and moved responsive artifact behavior into one CSS surface.
- Verified the refactor with TypeScript, focused Playwright route coverage, desktop/mobile visual probes, and full `npm run verify`.

### 2026-05-16 - Share-Safe Public Recap

- Added a deterministic public recap generator that summarizes live or settled room state from public state only, including LMSR movement, public activity, settlement result, evidence, and guardrails.
- Added `/recap/:roomCode` as a share-safe route that does not fetch host-only events, does not send host authority, and explicitly excludes capability tokens and provider-backed comps.
- Linked the host dashboard and settled player view to the public recap route so a room outcome can be shared without exposing the operator review surface.
- Added focused Vitest coverage for live and settled public recap generation, plus Playwright coverage for settled recap privacy, settlement evidence, token non-leakage, and serious/critical axe checks.
- Captured a mobile visual probe at `/tmp/fairvalue-public-recap.png` proving the public recap renders at `390x844` without horizontal overflow or console/page issues.

### 2026-05-16 - Player Pre-Bet Intelligence

- Added a deterministic player pre-bet preview generator that uses LMSR math, current room probability, wager size, balance, and recent activity to produce a compact reason to believe, reason to doubt, and both OVER/UNDER outcome previews.
- Added the pre-bet read to the mobile player room before wagering, with local-provenance and no-provider-comps copy so the player surface stays trust-bounded.
- Added focused Vitest coverage for balanced opening rooms plus consensus/herd-risk/balance-capped preview states.
- Expanded Playwright coverage so the player flow must render the pre-bet read before settlement and still pass existing wager validation and keyboard/mobile control paths.
- Captured a mobile visual probe at `/tmp/fairvalue-player-prebet-mobile.png` proving the card renders above the compact fixed bet controller without hiding the active bet buttons.

### 2026-05-16 - Operator Review Route

- Added a deterministic room review generator that compares draft audit metadata, room movement, player/trade metrics, host-only event history, settlement evidence, integrity checks, timeline entries, and generated recap bullets.
- Added `/review/:roomCode` as a host-facing route that loads public room state and, when host authority is present, fetches the host-only room event log without exposing host tokens.
- Linked the host dashboard to the operator review route so active and settled rooms can be audited without typing a URL.
- Added focused Vitest coverage for pending-review and settled-review generation.
- Expanded Playwright coverage so Market Studio rooms render a pre-settlement review and settled rooms render settlement evidence, event timeline, and accessibility-clean operator review states.
- Verified the slice with focused unit/browser checks, a targeted negative-path rerun after investigating an E2E backend interruption, full isolated Playwright, and the full `npm run verify` gate.

### 2026-05-16 - Room-Aware Market Intelligence

- Extended the deterministic Market Intelligence library with `generateRoomMarketIntelligence`, combining host room LMSR probability, implied room value, liquidity, participant count, recent bet activity, and optional server-preserved draft audit metadata.
- Added explicit local-fallback provenance and no-provider-comps language so the room intelligence panel does not imply external valuation authority.
- Added focused Vitest coverage for high-confidence draft-audited rooms and low-confidence no-audit/no-bet rooms.
- Added a Live Room Intelligence panel to the host dashboard with summary, metrics, movement read, pressure points, host script prompts, and provenance notes.
- Expanded the Market Studio Playwright path so a generated room must render both the server draft audit and the room-aware intelligence panel inside the serious/critical axe accessibility gate.

### 2026-05-16 - Market Studio Server Draft Audit

- Added server-side validation for optional `market_draft` room creation payloads, requiring valid source/type fields plus address and asking price parity with the room before any room mutation is accepted.
- Added a persisted `draft_audit` envelope that captures normalized draft fields, provenance, market question, settlement evidence requirements, warnings, validation status, source-text hash, and source-text length while intentionally omitting raw pasted listing text.
- Carried draft audits through room creation responses, durable snapshots, room event logs, replay, state payloads, cached room state, and the host dashboard.
- Updated `/join` Market Studio room creation so generated or matched drafts are submitted to the server, while manual create-room flow still creates rooms without audit metadata.
- Added host UI proof that a Market Studio room is backed by server-validated draft metadata and linked property provenance.
- Verified with focused server/type/unit checks, focused Market Studio Playwright, full `npm run verify`, full isolated Playwright, and a live local render of a Market Studio host room.

### 2026-05-16 - Market Studio Matching And Saved Drafts

- Exported lazy property loading so `/join` can keep the pick/create/join path light and only fetch the property snapshot dataset when Market Studio generates a draft that needs matching.
- Added `src/lib/marketStudioDrafts.ts` for deterministic existing-property matching, local property draft hydration, saved draft upsert/read/delete behavior, capped saved draft storage, and corrupted-storage recovery.
- Added focused Vitest coverage for exact local property matching, weak-match rejection, property-to-draft generation, and saved draft update/delete behavior.
- Upgraded `/join` Market Studio with an existing-property match panel, address-specific match buttons, linked-property draft state, local saved draft list, save/load/delete actions, and a create-room flow that still uses the existing authenticated room creation and host auto-join path.
- Expanded the Market Studio Playwright test to prove paste listing -> local match -> use matched property -> save draft -> accessibility check -> create host room.
- Updated `README.md` so Market Studio's supported behavior includes existing-property matches and saved drafts.

### 2026-05-16 - Market Detail Intelligence

- Added `src/lib/marketIntelligence.ts` as a deterministic local analyst layer for property snapshots, producing confidence, valuation metrics, bull/bear/uncertainty cases, scenario prompts, and settlement checklist without external AI credentials.
- Added focused Vitest coverage for high-confidence briefs, over/under valuation pressure, scenario/checklist output, and downgraded confidence when valuation references are missing.
- Added a Market Intelligence section to `/market/:propertyId` beneath the trust/provenance panel so solo property pages now provide actionable debate structure before a host starts a room.
- Expanded the market-detail Playwright test so desktop and mobile route coverage assert Market Intelligence content inside the existing serious/critical axe accessibility gate.
- Updated `README.md` and the backlog so this slice is documented as shipped and the next step is room-aware/live evidence intelligence.

### 2026-05-16 - Market Studio Vertical Slice

- Added `src/lib/marketDrafts.ts` as a deterministic local market-draft generator for pasted listing text, including address, city/state/zip, asking price, beds, baths, square footage, home type, market question, settlement rule, evidence checklist, provenance confidence, generated summary, and warnings.
- Added focused Vitest coverage for listing parsing, shorthand million prices, independent address/fact parsing, incomplete-draft validation, deterministic provenance, warnings, and settlement evidence.
- Added Market Studio as a real `/join` mode that lets hosts paste listing text, generate a draft, review/edit generated address and asking price, see settlement evidence and parser warnings, and create a real room through the existing host identity, host token, room creation, and host auto-join path.
- Added Playwright coverage proving paste listing -> generate draft -> accessibility check -> create room -> host page with one player works against fresh local backend/frontend servers.
- Updated `README.md` so Market Studio is documented as a supported mode instead of an aspirational future feature.
- Verified with focused unit/type checks, focused Playwright, live local desktop/mobile browser snapshots of `/join`, full `npm run verify`, and full `npm run test:e2e:isolated`.

### 2026-05-11 - Cited Local AI Analyst

- Replaced the missing-key AI Analyst search outage with a deterministic local room-state analysis that cites the room market snapshot, LMSR fair-value formula, and recent room flow.
- Updated the client to send structured local market context, render evidence and limitation sections, and treat missing-Cognee analysis as useful degraded output instead of an error bubble.
- Added server, service, and browser coverage proving missing Cognee returns 200, remains secret-safe, has citations/limitations, avoids browser-visible resource failures, and keeps the scrollable AI conversation keyboard-accessible.

### 2026-05-11 - Room State Load Failures

- Hardened `useRoom` initial state loading so non-OK, non-JSON, and malformed `GET /api/rooms/:roomCode/state` responses produce stable room-load errors instead of parser noise or misleading not-found states.
- Added a shared `RoomLoadError` surface for host/player routes with retry support for transient state failures and the existing no-retry `Room not found` copy for genuine missing rooms.
- Added host/player negative-path E2E for state-store outage and malformed state response branches, and fixed the E2E room factory to use unique session identities so the expanded suite no longer exhausts the anonymous create-room rate bucket.

### 2026-05-11 - Identity Failure Handling

- Hardened `useSession.ensureIdentity` so non-JSON identity outages and malformed identity-success payloads produce stable `Identity unavailable` / `Identity response was invalid` messages instead of parser noise.
- Added negative-path browser coverage proving create-room identity outages stop before `POST /api/rooms` and malformed identity success stops direct player join before `POST /api/rooms/:roomCode/join`.
- Captured rendered mobile proof for both identity failure states; expected forced 503 resource console entries were classified separately from unexpected app/page errors.

### 2026-05-11 - Missing Host Authority Controls

- Added a visible host-authority warning on `/host/:roomCode` when the browser has neither the durable host identity nor the legacy host token.
- Linked disabled AI and Settle controls to the warning with `aria-describedby`, preserving the existing disabled state while making the reason visible and screen-reader-described.
- Added focused negative-path E2E and visual probe evidence proving the missing-authority state stays non-mutating, axe-clean, and console-error-free.

### 2026-05-11 - Malformed Host Action Responses

- Hardened host AI toggle and settlement clients so non-OK, non-JSON, and malformed success responses cannot produce false success UI.
- Added negative-path browser coverage for malformed settlement success staying in the modal with inline/toast errors and malformed AI-toggle success leaving `aria-pressed=false` plus server `ai_enabled=false`.
- The first focused run caught a serious toast contrast regression when an error toast rendered over the modal backdrop; toasts now use opaque status backgrounds so alert text stays readable in dimmed modal states.

### 2026-05-11 - Multiplayer Trust Notes

- Added reusable `TrustNotice` copy and wired it into the host active room, direct player entry, active player room, settlement modal, and host/player settled recaps.
- Verified the new trust notes cover simulated credits/no real-money, market-implied non-appraisal value, actual sale/appraisal settlement evidence, and event-history preservation.
- Added a focused host/player E2E flow with settlement-modal and settled-recap assertions plus serious/critical axe checks, then captured visual screenshots across the room flow.

### 2026-05-11 - Market Trust Explainer

- Added a verified `/market/:propertyId` trust section that explains play-money credits, LMSR Over probability, market-implied fair value, listing provenance/freshness, and host settlement/event evidence.
- Extended the property mapper to preserve listing source and attribution metadata, then surfaced `MLSListings Inc` and the checked date from the static property snapshot instead of hardcoding provenance copy.
- Added desktop and mobile E2E coverage for the trust explainer with serious/critical axe checks, updated README coverage wording, and captured rendered desktop/mobile screenshots with no console/page errors.

### 2026-05-11 - Market Host Auto-Join Outage

- Added browser coverage for the partial-success branch where `/market/:propertyId` room creation succeeds, a room code and host token are issued, but the automatic host join returns a plain-text `503`.
- Verified the Start a Bid flow stays on `/market/440298192`, shows inline `#market-start-room-error`, emits the message-specific `Failed to join room as host` toast, links the button to the alert, and leaves the real created room with zero players.
- Ran a serious/critical axe check on the partial-success failure state and updated README isolated E2E wording to include market-start room creation/host-auto-join outage coverage.

### 2026-05-11 - Join Page Host Auto-Join Outage

- Added browser coverage for the partial-success branch where `/join` room creation succeeds, a room code and host token are issued, but the automatic host join returns a plain-text `503`.
- Verified the create form stays on `/join`, shows inline `#create-room-error`, emits the message-specific `Failed to join room as host` toast, links all create fields to the alert without invalid field semantics, and leaves the real created room with zero players.
- Ran a serious/critical axe check on the partial-success failure state and updated README isolated E2E wording to include join-page host-auto-join outage coverage.

### 2026-05-11 - Join Page Room Join Outage

- Added negative-path browser coverage for a valid-looking `/join` room-code submission receiving a plain-text `503` from `POST /api/rooms/:code/join`.
- Verified the join page keeps the user on `/join`, shows inline `#join-room-error`, emits the message-specific `Failed to join room` toast, links both fields to the alert, and does not mark either field invalid for a backend outage.
- Ran a serious/critical axe check on the joined failure state and updated README isolated E2E wording to distinguish join-page create/join API failure coverage.

### 2026-05-11 - Direct Player Join API Failure

- Split direct player join error semantics so empty nickname validation marks the nickname field invalid, while server/API join failures only describe the alert without blaming the field.
- Added a negative-path browser test that forces `POST /api/rooms/:roomCode/join` to return a plain-text 503, verifies inline `#player-join-error`, the message-specific `Failed to join room` toast, preserved `/play/:roomCode` URL, enabled retry button, no server-side player mutation, and serious/critical axe cleanliness.
- Updated README isolated E2E wording to call out direct player join validation/API notifications.

### 2026-05-11 - Player Bet Failure Rollback

- Hardened `useRoom.placeBet` so non-OK responses, non-JSON error bodies, and malformed success payloads roll back the optimistic market/player update instead of leaving stale UI state.
- Hardened `useRoom.joinRoom` to treat non-OK room-join responses as failed joins even when the body does not include an `error` field.
- Added a stable player balance test id so browser tests can prove failed bets do not deduct the rendered balance.
- Added a negative-path browser test that joins a room, intercepts `POST /api/rooms/:roomCode/bet` with a plain-text 503, verifies inline `#player-bet-error`, the message-specific `Bet failed` toast, wager field error semantics, unchanged balance, no positions, unchanged server trades/balance, and serious/critical axe cleanliness.
- Updated README isolated E2E wording to include player bet failure rollback.

### 2026-05-11 - Join Page API Failure Notifications

- Hardened `/join` create-room and room-code join response handling so non-OK responses, JSON error payloads, and malformed room-creation success payloads fail before navigation.
- Added global error toasts for async create/join API failures while keeping local field validation inline-only to avoid duplicate validation alerts.
- Expanded negative-path E2E so nonexistent room-code feedback asserts inline `#join-room-error` plus the message-specific `Room not found` toast.
- Added a forced `POST /api/rooms` 503 browser test that verifies inline `#create-room-error`, the message-specific toast, preserved `/join` URL, and serious/critical axe cleanliness.
- Updated README isolated E2E wording to include join-page API failure notifications.

### 2026-05-11 - Market Start Failure Notifications

- Replaced the silent `/market/:propertyId` Start a Bid failure path with a visible inline alert and a global error toast.
- Validated both room-creation and host-join responses before navigating to `/host/:roomCode`, including malformed success payloads.
- Linked the Start a Bid button to the inline failure with `aria-describedby` and styled the alert for contrast on the blue market-start section.
- Added a negative-path browser test that forces `POST /api/rooms` to return `503 Room persistence failed`, verifies the inline alert, message-specific toast, preserved `/market/440298192` URL, and serious/critical axe cleanliness.
- Updated README isolated E2E coverage wording to include market-start failure notifications.

### 2026-05-11 - Direct Player Join Validation Coverage

- Added a negative-path browser test for a player opening `/play/:roomCode` directly and pressing Join Room with an empty nickname.
- Verified the pre-join player form shows inline `#player-join-error`, marks the nickname field invalid, links it with `aria-describedby`, and renders the message-specific error-toast dismiss control.
- Asserted that the invalid empty-name branch does not submit `/api/rooms/:roomCode/join`.
- Captured and fixed a test assumption from the first focused run: the direct pre-join player form is usable before it renders the post-join connection status text.
- Updated README isolated E2E coverage wording to include direct player join notifications.

### 2026-05-11 - Fake Cloud Sync Removal

- Removed the unused `src/hooks/useCloudFairValue.ts` hook that attempted to sync fair values to a mock/public cloud API URL.
- Removed the unused `src/services/cloudPersistence.ts` stub that logged fake listener/cleanup calls and described unsupported cross-tab cloud sync behavior.
- Verified there are no remaining references to the hook, service, local fair-value cache key, mock endpoint, or old `VITE_COGNEE_API_URL` client env path in the app/test/docs surfaces searched.
- Kept the real Cognee AI path server-routed through the existing `src/services/cogneeService.ts` boundary.

### 2026-05-11 - Settlement Failure Notifications

- Wired host settlement API failures into `showToast` while preserving the existing inline modal error surface.
- Added a polite success toast for completed settlement so the host receives the same global status treatment as other room actions.
- Kept client-side settlement validation inside the dialog only, avoiding duplicate alert regions for required/invalid actual-price checks that are already covered by modal accessibility E2E.
- Tightened the fake-host-token settlement E2E to assert the modal `#settle-error`, the message-specific `Invalid host token` toast dismiss control, and the unsettled server state.
- Documented settlement failure notifications in the isolated E2E coverage description.

### 2026-05-11 - Host Action Notifications

- Wired host AI toggle API errors and missing host authority into `showToast` so operators get visible, announced feedback instead of console-only failures.
- Added polite success notifications when the host turns the AI bot on or off.
- Added a negative-path browser test proving a fake host token cannot toggle AI, the host sees an `Invalid host token` alert toast, the dismiss control is message-specific, and `ai_enabled` remains false in server state.
- Tightened the happy-path host/player E2E AI-control locators to exact accessible names so success toasts can coexist with the AI button names.
- Documented host-action failure notifications in the isolated E2E coverage description.

### 2026-05-11 - Player Validation Notifications

- Wired `PlayerView` join and bet error paths into the existing toast system instead of leaving the toast surface unused.
- Kept inline form errors while adding `role="alert"`, `aria-live`, `aria-invalid`, and `aria-describedby` semantics for player join and wager validation.
- Hardened `ToastContainer` so error notifications use assertive alerts, non-error notifications use polite status regions, icons are hidden from assistive tech, and dismiss buttons identify the exact notification message.
- Expanded the browser accessibility edge-state E2E to verify an invalid `$0` wager on `/play/:roomCode` announces inline, links the custom wager input to the error, renders a dismissible toast, and passes serious/critical axe checks.
- A first focused E2E run caught that the toast opacity animation temporarily reduced text contrast to 1.85:1; the animation now slides without fading alert text through a low-contrast state.
- Added unit coverage for error/status toast live-region semantics and message-specific dismissal.

### 2026-05-11 - Local Backend Boot Smoke

- Added `scripts/smoke-local-boot.js` and `npm run smoke:boot`.
- The smoke starts the real `server/index.js` process on a free local port with a temporary JSON room snapshot path, then shuts it down and removes the temp state.
- It verifies `/healthz`, `/readyz`, security headers, ops metrics token gating, room creation, WebSocket join broadcast, join, bet, settlement, state recovery, host-token non-leakage, aggregate metrics, and snapshot-file creation.
- Wired `smoke:boot` into `npm run verify` so the standard gate now proves a real backend child process can boot and serve the core degraded-local multiplayer path.

### 2026-05-11 - E2E TypeScript Coverage

- Expanded `tsconfig.json` so `npm run typecheck` covers `e2e/*.ts` and all `playwright*.config.ts` files, not only app source.
- Added `@types/ws` so WebSocket-backed E2E specs are checked with the real `ws` API types.
- Fixed a real nullable-process guard in the restart recovery harness that was only visible once the E2E specs were typechecked.
- Verified the restart Playwright config still lists its Chromium recovery test.

### 2026-05-11 - Baseline HTTP Security Headers

- Added a first-party security-header middleware to the Express server and disabled `X-Powered-By`.
- Every response now emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- Added server tests proving those headers are present on successful health responses, validation errors, and unknown routes.
- Documented the HTTP hardening baseline in the README.

### 2026-05-11 - TypeScript Verification Gate

- Added `npm run typecheck` as `tsc --noEmit` and wired it into `npm run verify` after the client secret scan.
- Upgraded TypeScript from 4.9 to 6.0.3 so the compiler can resolve Vite 8 / `@vitejs/plugin-react` package-export types.
- Updated `tsconfig.json` to target `ES2020` and use `moduleResolution: bundler`, matching the modern Vite toolchain.
- Documented the typecheck gate in the README verification section.

### 2026-05-11 - Prometheus Metrics Export

- Added token-guarded `GET /metrics` Prometheus text output for external scrapers, sharing the ops token guard with `/api/ops/metrics`.
- Exported aggregate process uptime, request status/latency, active/settled rooms, player/connection gauges, room lifecycle counters, WebSocket counters, rate-limit rejections, database configuration/errors, persistence status/failures, and AI degraded/error counters.
- Kept scrape output aggregate-only and covered host-token non-leakage plus unauthenticated/authorized scrape behavior.
- Documented the scrape endpoint in the README operations section.

### 2026-05-11 - Production Readiness Environment Gate

- Added `scripts/check-production-readiness.js` and `npm run check:production`.
- The checker emits a JSON report and exits non-zero when deployment-critical environment requirements are missing.
- Fails on missing/invalid `DATABASE_URL`, disabled room persistence, non-Postgres room storage, missing positive Postgres retention, default/weak `FAIRVALUE_IDENTITY_SECRET`, and missing/weak `FAIRVALUE_OPS_TOKEN`.
- Treats `NODE_ENV`, `FAIRVALUE_REQUIRE_DATABASE_URL`, and missing `COGNEE_API_KEY` as warnings so intentional degraded-AI deployments can still be explicit.
- Added tests proving local defaults fail without echoing secret values, a durable Postgres production config passes with only the optional Cognee warning, and disabled room persistence fails.
- Documented the production check in the README verification section.

### 2026-05-11 - Backend Observability Readiness

- Added `server/observability.js`, a small in-memory metrics collector for request counts/status classes/latency, room lifecycle counters, WebSocket counters, rate-limit rejections, persistence failures, database errors, and AI degraded/error counts.
- Added `GET /healthz` for minimal process health and `GET /readyz` for dependency-aware readiness that treats local degraded mode as ready unless a database is explicitly required.
- Added `GET /api/ops/metrics`, guarded by `FAIRVALUE_OPS_TOKEN` when configured and mandatory in production if the token is missing.
- Kept metrics free of room host tokens and player payloads; the snapshot reports aggregate room/player/connection counts only.
- Documented the operations endpoints and `FAIRVALUE_OPS_TOKEN` in `README.md` and `.env.example`.
- Added server tests proving health/readiness behavior, degraded Postgres readiness, lifecycle metrics, secret non-leakage, and token-gated metrics access.

### 2026-05-11 - Postgres Snapshot Retention

- Added opt-in Postgres room snapshot retention through `FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS`, leaving production deletion disabled by default.
- Reused the settled-room expiry rules for Postgres whole-snapshot load/save and targeted `loadRoom` / `saveRoom` paths.
- Pruned only settled rows whose room event/activity timestamp, or row `updated_at` fallback, is older than the configured window.
- Expanded fake-SQL adapter coverage and the disposable Docker Postgres smoke to prove an expired settled row is deleted while a recent settled row and an old active row remain.
- Hardened the Docker smoke startup path with create/start timeouts so the local smoke fails bounded and still cleans up the disposable container.

### 2026-05-11 - Local Snapshot Retention

- Added configurable local JSON room snapshot retention through `FAIRVALUE_ROOM_RETENTION_DAYS`, defaulting to 30 days.
- Pruned only settled rooms whose latest room event/activity timestamp is older than the configured window.
- Kept active rooms and timestamp-less rooms to avoid unexpected room loss.
- Rewrote the local snapshot after pruning so expired settled rooms and their host tokens leave the JSON store.
- Documented the retention control in `.env.example` and the README.
- Added server coverage proving an expired settled room is pruned while a recent settled room and an old active room remain.

### 2026-05-11 - Encrypted Local Snapshots

- Added optional AES-256-GCM encryption for local JSON room snapshots behind `FAIRVALUE_ROOM_SNAPSHOT_SECRET`.
- Kept plaintext snapshots backward-compatible; loading a plaintext snapshot with the secret configured rewrites it encrypted on the next save.
- Made encrypted snapshots fail closed when the secret is missing or wrong, instead of silently returning empty room state.
- Wired the secret through the real server persistence factory and documented it in `.env.example` and the README.
- Updated Playwright/profile snapshot readers to load through the persistence adapter so encrypted local snapshot evidence remains readable in those harnesses.
- Added unit coverage for encrypted snapshot contents and child-process restart coverage proving encrypted local snapshots restore rooms across backend restarts.

### 2026-05-11 - Corrupt Snapshot Recovery

- Added malformed local JSON snapshot recovery for the default room snapshot adapter.
- Quarantined corrupt files beside the original snapshot path as `.corrupt-*`, preserving the bad bytes for operator inspection while avoiding snapshot-content logging.
- Returned an empty versioned room snapshot after successful quarantine so the server can continue booting.
- Added server coverage that writes malformed JSON, proves quarantine, proves the original path is cleared, then saves and reloads a fresh room through the same adapter.
- Documented the recovery behavior in the room snapshot operator note.

### 2026-05-11 - Accessibility Edge-State Semantics

- Added `aria-invalid` and `aria-describedby` wiring for create-room and join-room validation alerts.
- Changed the settle modal from silently ignoring empty/invalid actual prices to showing alert text, marking the actual-price input invalid, and describing it with the alert.
- Marked the error-boundary fallback as an assertive alert.
- Added accessible names to map price pins and hardened Leaflet popup foreground/background colors after the new axe test exposed serious color-contrast failures in the popup state.
- Added a Playwright edge-state test for create/join validation, settle validation, map marker accessible names, map popup link visibility, and serious axe checks.

### 2026-05-11 - Expanded Assistive Route Coverage

- Expanded `scripts/capture-assistive-tech-notes.js` beyond the room core to include browse route, sort menu, property detail route, host AI degraded alert, and host/player settled-result states.
- Added a 20-second timeout to macOS System Events AX extraction so the harness fails bounded instead of hanging indefinitely.
- Kept macOS AX capture for room/dialog/player states, but switched dense browse/detail states to bounded Playwright ARIA assertions after the unbounded System Events full-window crawl hung on the browse page.
- Updated `docs/accessibility-assistive-tech-notes.md` with a 12-surface PASS table and refreshed manual VoiceOver checklist.

### 2026-05-11 - Live Postgres Readiness Smoke

- Added targeted `loadRoom`, `saveRoom`, and `deleteRoom` methods to JSON and Postgres room persistence adapters.
- Kept the existing server-facing `save(snapshot)` whole-store semantics, but made live readiness tooling use targeted row mutation so it does not delete unrelated production rows.
- Added `scripts/smoke-live-postgres-room-persistence.js` and `npm run test:persistence:live`.
- The live readiness script loads `.env`, reports a degraded/skip result when `DATABASE_URL` is absent, fails missing credentials when Postgres room storage is explicitly required, checks connectivity/table presence when credentials exist, and only performs a live write/read/delete when `FAIRVALUE_LIVE_POSTGRES_SMOKE=1`.
- Documented the live readiness flags in `.env.example` and `README.md`.

### 2026-05-11 - Mixed Traffic Resilience Profile

- Added `e2e/mixed-traffic.spec.ts`.
- Added `playwright.mixed-traffic.config.ts` and `npm run test:e2e:mixed-traffic`, using fresh `8033` / `3033` ports and `/tmp/fairvalue-mixed-traffic-rooms.json`.
- Kept the heavier mixed traffic spec out of the default Playwright suite.
- The harness runs one rendered host, throttled rendered mobile clients with Chromium network emulation and route jitter, concurrent API join/bet churn, repeated state reads, rendered slow-client betting, host sync checks, settlement broadcast checks for every slow client, console/page-error checks, and durable snapshot reconciliation.
- Browser MCP tools were exposed, but this workload used repo Playwright because it needs committed multi-context CDP throttling, API churn, and a repeatable CLI gate rather than a single in-app tab session.

### 2026-05-11 - Cold Production Performance Profile

- Added `scripts/profile-cold-production-flow.js`.
- Added `npm run test:performance:cold` and documented it in `README.md`.
- The profile builds the production Vite bundle with a fresh backend port baked into `VITE_BACKEND_PORT`, starts a real local backend with temp snapshot persistence, serves `dist` through a local static server that proxies `/api` to the backend, and drives the production bundle with headless Chromium.
- Timed cold `/join` readiness, room creation to host connected, cold `/play/:roomCode` readiness, player join to connected, bet-to-host sync, and settlement broadcast.
- Added explicit local budgets with `FAIRVALUE_COLD_*` environment overrides.
- Initial runs caught harness issues around null static-server polling and ambiguous text waits; the final harness scopes waits to specific surfaces and waits for bet-specific activity.

### 2026-05-11 - Rendered Browser Load Profile

- Added `e2e/browser-load.spec.ts` for one rendered desktop host plus configurable rendered mobile player pages.
- Added `playwright.browser-load.config.ts` and `npm run test:e2e:browser-load`, using fresh `8032` / `3032` ports and `/tmp/fairvalue-browser-load-rooms.json`.
- Kept the heavier rendered-load spec out of the default Playwright config while documenting the explicit command in `README.md`.
- The harness concurrently joins 10 mobile player pages, concurrently places rendered UI bets, verifies host totals/activity/leaderboard, verifies settlement broadcast on every player page, rejects console/page errors, and reconciles the durable snapshot.
- The first run caught a strict accessible-name lookup issue where `$10` also matched `$100`; exact role matching now protects the test from false interaction.
- The second run exposed tiny floating-point drift in persisted `total_wagered`; the snapshot assertion now uses a close numeric comparison while the UI remains rounded to whole-dollar volume.

### 2026-05-11 - Assistive Technology AX Notes

- Added `scripts/capture-assistive-tech-notes.js`, a headed Playwright harness that starts fresh backend/frontend processes on free ports with a temp room snapshot file.
- Launched Playwright Google Chrome for Testing with `--force-renderer-accessibility` and captured app-region macOS System Events AX output for `/join`, create-room, host, settle modal, player join, and mobile betting states.
- Recorded Playwright `ariaSnapshot({ mode: 'ai' })` excerpts beside the macOS AX evidence in `docs/accessibility-assistive-tech-notes.md`.
- Added `npm run test:a11y:assistive` and documented why it stays outside `npm run verify`: it opens a headed browser window.
- Captured the Browser plugin fallback reality: Browser was available, but the required JavaScript browser-control runtime was not exposed, so the repo Playwright path provided the rendered evidence.

### 2026-05-11 - Vite Route Splitting

- Converted the app route shell to use `React.lazy` and `Suspense` for browse, market detail, host, and player routes.
- Kept `/join` eagerly loaded after the keyboard E2E caught that lazy-loading the first-entry flow can swallow an immediate Tab press before the route chunk finishes.
- Added an accessible `role="status"` loading fallback for lazy route transitions.
- Verified the Vite build split host/player/market/chart/map code into route or feature chunks and removed the previous >500 kB main-chunk warning.

### 2026-05-11 - Bundle Budget Gate

- Added `scripts/check-bundle-size.js`.
- Added `npm run check:bundle` and wired it into `npm run verify` after `npm run build`.
- Set default budgets for any JS chunk, any CSS chunk, and total JS, with `FAIRVALUE_MAX_*` environment overrides for intentional budget changes.
- Documented the bundle budget gate in `README.md`.

### 2026-05-11 - Vite/Vitest Toolchain Migration

- Replaced `react-scripts` with Vite for dev/build and Vitest for unit tests.
- Added root `index.html` and `vite.config.ts` with `/api` and `/ws` proxying through `VITE_BACKEND_PORT` / `VITE_API_BASE_URL`.
- Removed CRA-only `public/index.html`, `src/setupProxy.js`, `src/reportWebVitals.ts`, CRA env references, and active `REACT_APP_*` config paths.
- Migrated Jest globals to Vitest `vi`, switched `setupTests.ts` to `@testing-library/jest-dom/vitest`, and preserved the server market-engine parity test with Node `createRequire`.
- Kept the browser LMSR wrapper ESM-native so Vite dev server does not import the CommonJS server engine into browser modules.
- Updated Playwright managed frontend commands and the restart harness to launch Vite with explicit host/port args.
- Updated docs and env samples for Vite/Vitest, and ignored generated `/dist`.

### 2026-05-11 - Restart Load Latency Profile

- Added `scripts/profile-restart-latency.js`, a deterministic local profiler that starts the real backend on a free port with a temp snapshot file.
- Added `npm run test:latency:restart`.
- The profiler creates a room, runs 8 initial joins and bets, samples room state reads, stops the backend, starts retrying state/join/bet traffic while the backend is down, restarts the backend, settles the recovered room, and asserts final player/trade/settlement state.
- Added explicit local latency budgets for create/join/bet/state/settle p95, restart readiness, first state recovery, and full recovery wave timing; budgets can be overridden with `FAIRVALUE_PROFILE_*` env vars.
- Documented the restart latency command in `README.md`.

### 2026-05-11 - Restart Recovery Browser Matrix

- Added `playwright.restart.matrix.config.ts` for the existing real backend restart/load harness across Chromium, Firefox, and WebKit.
- Added `npm run test:e2e:restart:matrix`, using `/tmp/fairvalue-browser-restart-matrix-rooms.json`.
- Made the restart recovery spec Firefox-compatible by avoiding Firefox's unsupported `isMobile` context option while preserving touch-capable mobile viewport coverage in Chromium/WebKit.
- Kept the default `npm run test:e2e:restart` as the faster Chromium restart/load gate.
- Documented the restart matrix command in `README.md`.

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
- `npx playwright test --list -c playwright.restart.matrix.config.ts` after restart matrix patch -> listed 3 restart-recovery projects: Chromium, Firefox, and WebKit.
- `npm run test:e2e:restart` after restart matrix patch -> passed 1 Chromium restart/load test in 12.7s.
- `npm run test:e2e:restart:matrix` after restart matrix patch -> passed 3 restart/load projects in 45.0s: Chromium, Firefox, and WebKit.
- Snapshot probe after restart matrix patch -> default restart room `TDYV` and restart-matrix final room `DF0V` each had 15 players, 15 trades, 15 receipts, settled true, and no durability error.
- `npm run verify` after restart matrix patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:latency:restart` after latency profile patch -> passed with room `AMND`, create p95 84ms, join p95 263ms, bet p95 161ms, state p95 69ms, settle p95 8ms, initial ready 2275ms, restart ready 1271ms, first recovered state 1478ms, recovery wave 1696ms, 79 join retry failures during restart, and 10 state retry failures during restart.
- `npm run verify` after latency profile patch -> passed: `scan:secrets`, 24 server tests, 5 React/Jest suites / 41 tests, and production build.
- `npm run test:a11y:assistive` after assistive-tech AX capture -> passed and wrote `docs/accessibility-assistive-tech-notes.md` with room `N5A8`, frontend `64036`, backend `64034`, and PASS results for join pick, create-room form, host dashboard, settle modal, player join form, and mobile betting controls.
- `git diff --check` after assistive-tech AX capture -> passed.
- `npm run verify` after assistive-tech AX capture -> passed: `scan:secrets`, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npx playwright test --list -c playwright.browser-load.config.ts` -> listed 1 Chromium browser-load test.
- Initial `npm run test:e2e:browser-load` -> failed on a strict-mode accessible-name lookup because `Set wager to $10` also matched `Set wager to $100`; the rendered-load test now uses exact button names.
- Second `npm run test:e2e:browser-load` -> completed the rendered flow and exposed persisted floating-point drift (`405.000...` for `$405` volume); the durable snapshot assertion now uses close numeric comparison while UI volume stays rounded.
- Final `npm run test:e2e:browser-load` -> passed with room `VF08`, 10 rendered mobile players, join wave 1703ms, bet wave 502ms, settlement 130ms, total 5031ms, and `$405` rendered wager volume.
- `/tmp/fairvalue-browser-load-rooms.json` after the final browser-load run -> room `VF08`, 11 players including host, 10 trades, 77 events, settled true, and persisted wagered amount close to 405.
- `npx playwright test --list` after adding browser-load coverage -> default Playwright suite stayed at 9 tests in 3 files, excluding the heavier browser-load spec.
- `npm run verify` after browser-load coverage -> passed: `scan:secrets`, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Initial `npm run test:performance:cold` -> failed on a static-server readiness guard that treated a null process as exited; the poller now only inspects a managed child process when one exists.
- Follow-up `npm run test:performance:cold` runs -> reached the real flow and exposed strict text ambiguities for `Cold Player` in leaderboard/activity and join/bet activity; the profile now scopes those waits to leaderboard and the bet-specific activity row.
- Final `npm run test:performance:cold` -> passed with room `P4AZ`, production build 1778ms, cold `/join` ready 94ms, create-to-connected 162ms, cold `/play` ready 832ms, player join 166ms, bet-to-host sync 97ms, settlement broadcast 63ms, snapshot 2 players / 1 trade / 7 events / settled true.
- `npm run verify` after cold production profile -> passed: `scan:secrets`, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npm run verify` before mixed-traffic profile -> passed: `scan:secrets`, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npx playwright test --list -c playwright.mixed-traffic.config.ts` -> listed 1 Chromium mixed-traffic test.
- `npm run test:e2e:mixed-traffic` -> passed with room `6PD9`, 4 throttled rendered mobile players, 12 API churn players, 18 state reads, join/churn 127295ms, slow rendered bets 780ms, settlement 510ms, total 129663ms, 16 trades, and `$419` rendered wager volume.
- `/tmp/fairvalue-mixed-traffic-rooms.json` after the mixed-traffic run -> room `6PD9`, 17 players including host, 16 trades, 65 events, settled true, and persisted wagered amount close to 419.
- `npx playwright test --list` after adding mixed-traffic coverage -> default Playwright suite stayed at 9 tests in 3 files, excluding the heavier mixed-traffic spec.
- `npm run verify` after mixed-traffic profile -> passed: `scan:secrets`, 24 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npm run test:server` after live-readiness adapter methods -> passed 26 server tests, including targeted JSON/Postgres room read/write/delete coverage.
- `npm run test:persistence:live` with no `DATABASE_URL` -> passed with `ok: true`, `ready: false`, `skipped: true`, `roomStore: default-json`, and a next-step message for `FAIRVALUE_LIVE_POSTGRES_SMOKE=1`.
- `npm run test:persistence:postgres` after targeted adapter methods -> passed against Docker `postgres:16-alpine`, adapter `postgres`, table `fairvalue_room_snapshots`, local port `60192`.
- `npm run verify` after live-readiness smoke -> passed: `scan:secrets`, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Initial `npm run test:a11y:assistive` after adding browse/detail states exposed that full-window macOS System Events traversal can hang on dense browse pages; the harness now uses bounded Playwright ARIA evidence for those dense routes and applies a 20-second timeout to AX extraction.
- Follow-up `npm run test:a11y:assistive` runs exposed truthful AX-name mismatches for the host degraded-AI response, the settlement confirm button, and split `OVER` / `WINS` static text; expected names now match the actual platform tree.
- Final `npm run test:a11y:assistive` -> passed with room `TFKC`, frontend `57887`, backend `57886`, and 12 PASS surfaces across browse, sort, property detail, join, host, AI degraded alert, settle modal, player betting, and settled results.
- `npm run verify` after expanded assistive coverage -> passed: `scan:secrets`, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "validation, settlement error, and map popup"` first failed on serious Leaflet popup color-contrast violations for price, address, and View Details link text.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "validation, settlement error, and map popup"` after map popup color fixes -> passed 1 Chromium edge-state test.
- `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` after edge-state semantics -> passed 5 Chromium tests.
- `npm run verify` after edge-state semantics -> passed: `scan:secrets`, 26 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npm run test:e2e:isolated` after edge-state semantics -> passed 10 Chromium tests including host/player flow, resilience/accessibility edge states, keyboard flow, and negative paths.
- `node --test server/__tests__/roomPersistence.test.js` after Postgres retention -> passed 10 targeted persistence tests, including expired-settled Postgres row pruning.
- `npm run test:persistence:postgres` after Postgres retention -> passed against Docker `postgres:16-alpine` with `retentionPruned: true`, adapter `postgres`, table `fairvalue_room_snapshots`, and local port `61953`.
- `npm run test:server` after Postgres retention -> passed 31 server tests.
- `npm run verify` after Postgres retention -> passed: `scan:secrets`, 31 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Baseline `npm run verify` before backend observability -> passed: `scan:secrets`, 31 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `node --test server/__tests__/observability.test.js` -> passed 3 focused ops tests covering `/healthz`, `/readyz`, degraded Postgres readiness, lifecycle metrics, metrics secret non-leakage, and token-gated access.
- `npm run test:server` after backend observability -> passed 34 server tests.
- `npm run verify` after backend observability -> passed: `scan:secrets`, 34 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `node --test server/__tests__/productionReadiness.test.js` -> passed 3 production-readiness checker tests.
- `npm run check:production` with the local repo env -> failed as expected with 5 blockers and 3 warnings, proving local degraded env is not silently deployable.
- Synthetic production env with Postgres room store, positive retention, strong identity secret, strong ops token, and required database flag -> `npm run check:production` passed with 0 failures and 1 optional Cognee warning.
- `npm run test:server` after production readiness gate -> passed 37 server tests.
- `npm run verify` after production readiness gate -> passed: `scan:secrets`, 37 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Baseline `npm run verify` before Prometheus metrics exporter -> passed: `scan:secrets`, 37 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `node --check server/observability.js && node --check server/index.js && node --check server/__tests__/observability.test.js && node --test server/__tests__/observability.test.js` after Prometheus metrics exporter -> passed 4 focused ops tests covering `/healthz`, `/readyz`, JSON ops metrics, Prometheus `/metrics`, host-token non-leakage, and token-gated scrape access.
- `npm run test:server` after Prometheus metrics exporter -> passed 38 server tests.
- `npm run verify` after Prometheus metrics exporter -> passed: `scan:secrets`, 38 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npx tsc --noEmit` before TypeScript verification gate -> failed because TypeScript 4.9 could not resolve `@vitejs/plugin-react` under Vite 8 package exports.
- `npm install -D typescript@latest` -> upgraded TypeScript to 6.0.3 and kept npm audit at 0 vulnerabilities.
- `npx tsc --noEmit` after the compiler and `tsconfig.json` updates -> passed.
- `npm run typecheck` after adding the package script -> passed.
- `npm run verify` after wiring typecheck into the gate -> passed: `scan:secrets`, `typecheck`, 38 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npm audit --json` after the TypeScript verification gate -> reported 0 vulnerabilities.
- `node --check server/index.js && node --check server/__tests__/securityHeaders.test.js && node --test server/__tests__/securityHeaders.test.js` after HTTP security headers -> passed 3 focused tests covering success, validation-error, and unknown-route responses.
- `npm run verify` after HTTP security headers -> passed: `scan:secrets`, `typecheck`, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- Broad one-off E2E/config TypeScript probe before expanding `tsconfig.json` -> failed on missing `@types/ws`, implicit WebSocket callback types, and a nullable restart-process guard.
- `npm install -D @types/ws` -> added WebSocket declarations and kept npm audit at 0 vulnerabilities.
- `npm run typecheck` after expanding E2E/config coverage -> passed.
- `npx playwright test --list -c playwright.restart.config.ts` after fixing the restart harness guard -> listed 1 Chromium restart-recovery test.
- `npm run verify` after E2E TypeScript coverage -> passed: `scan:secrets`, `typecheck`, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, and bundle budget gate.
- `npm audit --json` after E2E TypeScript coverage -> reported 0 vulnerabilities.
- `node --check scripts/smoke-local-boot.js && npm run smoke:boot` -> passed with real backend child process on `http://127.0.0.1:62005`, room `UL61`, and a temporary snapshot path under `/var/folders/.../fairvalue-local-boot-*`.
- `npm run verify` after wiring `smoke:boot` into the standard gate -> passed: `scan:secrets`, `typecheck`, 41 server tests, 5 Vitest suites / 41 tests, Vite production build, bundle budget gate, and `smoke:boot` with real backend child process on `http://127.0.0.1:62172`, room `KA6M`.
- `npm test -- ToastContainer` after player notification hardening -> passed 1 Vitest suite / 2 tests.
- `npm run typecheck` after player notification hardening -> passed.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "validation, settlement error"` first run -> failed on a serious toast text contrast violation because the opacity animation lowered contrast to 1.85:1 during the alert entrance.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "validation, settlement error"` after removing toast opacity animation -> passed 1 Chromium test.
- `npm test` after player notification hardening -> passed 6 Vitest suites / 43 tests.
- `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts` after player notification hardening -> passed 5 Chromium tests.
- `npm run test:e2e:isolated` after player notification hardening -> passed 10 Chromium tests.
- `npm run verify` after player notification hardening -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.49 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:50653`, room `VAE4`.
- `npm run typecheck` after host action notification patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "fake host token cannot toggle AI"` -> passed 1 Chromium test.
- First full `npm run test:e2e:isolated` after host action notification patch -> 10 passed and 1 failed because the happy-path `/AI bot enabled/i` locator also matched the new success-toast dismiss button; the test locator was tightened to exact AI-control names.
- `npm run test:e2e:isolated -- e2e/host-player-flow.spec.ts` after exact AI-control locator fix -> passed 1 Chromium test.
- Final `npm run test:e2e:isolated` after host action notification patch -> passed 11 Chromium tests, including host/player flow, resilience/accessibility states, keyboard flow, negative paths, and fake-token AI-toggle announcement.
- Final `npm run verify` after host action notification patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.58 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:54670`, room `DV6G`.
- `npm run typecheck` after settlement notification patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "fake host token cannot settle"` -> passed 1 Chromium test, proving the inline modal error and global error toast both announce the invalid host token.
- Full `npm run test:e2e:isolated` after settlement notification patch -> passed 11 Chromium tests, including host/player flow, resilience/accessibility states, keyboard flow, negative paths, fake-token settlement announcement, and fake-token AI-toggle announcement.
- Final `npm run verify` after settlement notification patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.67 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:57217`, room `3IO2`.
- `rg -n "useCloudFairValue|cloudPersistence|fairvalue_cloud_data|api\\.fairvalue\\.io|VITE_COGNEE_API_URL|mock API endpoint|stub implementation" src server e2e README.md package.json` after fake cloud-sync removal -> no matches.
- `npm run scan:secrets` after fake cloud-sync removal -> passed.
- `npm run typecheck` after fake cloud-sync removal -> passed.
- `git diff --check` after fake cloud-sync removal -> passed.
- Final `npm run verify` after fake cloud-sync removal -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.67 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:60103`, room `CVKK`.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "direct player join announces missing nickname"` first failed because the test waited for the post-join `Connected` text on the pre-join player form; Playwright captured screenshot/video/trace under `test-results/e2e-artifacts/negative-paths-direct-play-92543--nickname-before-submitting-chromium/`.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "direct player join announces missing nickname"` after aligning to the real pre-join UI -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after direct player join validation coverage -> passed 12 Chromium tests, including the new direct-player empty-nickname notification branch.
- Final `npm run verify` after direct player join validation coverage -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 658.67 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:62603`, room `K7HY`.
- `npm run typecheck` after market-start failure notification patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "market detail room creation failure"` after adding inline/toast failure feedback and axe check -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after market-start failure notification patch -> passed 13 Chromium tests, including the new market detail room creation failure branch.
- Final `npm run verify` after market-start failure notification patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.47 kB / 240.00 kB and total JS 659.15 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:49820`, room `IIAA`.
- `git diff --check` after join-page API failure notification patch -> passed.
- `npm run typecheck` after join-page API failure notification patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "join flow reports|create room API failure"` first failed because `page.getByText('Room not found')` matched both the inline alert and the new toast; Playwright captured screenshot/video/trace under `test-results/e2e-artifacts/negative-paths-join-flow-r-d0cc4--and-nonexistent-room-codes-chromium/`.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "join flow reports|create room API failure"` after scoping the nonexistent-room assertion to `#join-room-error` -> passed 2 Chromium tests.
- Full `npm run test:e2e:isolated` after join-page API failure notification patch -> passed 14 Chromium tests, including the new create-room API failure branch.
- Final `npm run verify` after join-page API failure notification patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.44 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:53982`, room `SCUB`.
- `git diff --check` after player bet failure rollback patch -> passed.
- `npm run typecheck` after player bet failure rollback patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "player bet API failure"` after intercepting bet with a non-JSON 503 -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after player bet failure rollback patch -> passed 15 Chromium tests, including the new player bet API failure branch.
- Final `npm run verify` after player bet failure rollback patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.62 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:58360`, room `YAIQ`.
- `git diff --check` after direct player join API failure patch -> passed.
- `npm run typecheck` after direct player join API failure patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "direct player join API failure"` after intercepting player join with a non-JSON 503 -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after direct player join API failure patch -> passed 16 Chromium tests, including the new direct player join API failure branch.
- Final `npm run verify` after direct player join API failure patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.63 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:61376`, room `OGC4`.
- `git diff --check` after join-page room join outage coverage -> passed.
- `npm run typecheck` after join-page room join outage coverage -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "join page room-code API failure"` after intercepting `/api/rooms/FAIL/join` with a non-JSON 503 -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after join-page room join outage coverage -> passed 17 Chromium tests, including the new join-page room-code API outage branch.
- Final `npm run verify` after join-page room join outage coverage -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.63 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:64489`, room `V22O`.
- `git diff --check` after join-page host auto-join outage coverage -> passed.
- `npm run typecheck` after join-page host auto-join outage coverage -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "host auto-join failure"` after letting room creation hit the real backend and intercepting only the dynamic host join with a non-JSON 503 -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after join-page host auto-join outage coverage -> passed 18 Chromium tests, including the partial-success host auto-join failure branch.
- Final `npm run verify` after join-page host auto-join outage coverage -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.63 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:51302`, room `GPVX`.
- `git diff --check` after market host auto-join outage coverage -> passed.
- `npm run typecheck` after market host auto-join outage coverage -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "market detail host auto-join failure"` after letting market room creation hit the real backend and intercepting only the dynamic host join with a non-JSON 503 -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after market host auto-join outage coverage -> passed 19 Chromium tests, including the partial-success market host auto-join failure branch.
- Final `npm run verify` after market host auto-join outage coverage -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.75 kB / 240.00 kB and total JS 659.63 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:53862`, room `RZIO`.
- `git diff --check` after market trust explainer patch -> passed.
- `npm run typecheck` after market trust explainer patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "market detail explains simulated market mechanics"` after adding the trust section and provenance fields -> passed 1 Chromium test with desktop/mobile assertions and serious/critical axe checks.
- Full `npm run test:e2e:isolated` after market trust explainer patch -> passed 20 Chromium tests, including the new market trust explainer proof.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified `/market/440298192` desktop 1440x900 and mobile 390x844 trust-section visibility, exact text for play-money/LMSR/fair-value/provenance/settlement evidence, zero console/page errors, and screenshots at `/tmp/fairvalue-market-trust-desktop.png` and `/tmp/fairvalue-market-trust-mobile.png`; Browser Node runtime was unavailable and the exposed Playwright MCP transport closed, so shell Playwright was used for the visual probe.
- Final `npm run verify` after market trust explainer patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.76 kB / 240.00 kB and total JS 662.87 kB / 760.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:60499`, room `BPII`.
- `git diff --check` after multiplayer trust notes patch -> passed.
- `npm run typecheck` after multiplayer trust notes patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "multiplayer room entry and settlement recaps carry trust language"` after adding room-flow trust notes -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after multiplayer trust notes patch -> passed 21 Chromium tests, including the new host/player entry and settlement recap trust-note proof.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified room `PL34` across host active room, direct player entry, active player room, settlement modal, host settled recap, and player settled recap; the first probe only produced expected WebSocket close noise during teardown, and the final console-error/page-error probe returned zero issues with screenshots at `/tmp/fairvalue-room-trust-host.png`, `/tmp/fairvalue-room-trust-player-entry.png`, `/tmp/fairvalue-room-trust-player-active.png`, `/tmp/fairvalue-room-trust-settle-modal.png`, `/tmp/fairvalue-room-trust-host-settled.png`, and `/tmp/fairvalue-room-trust-player-settled.png`.
- Focused multiplayer trust-note E2E after final visual/style polish -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after final multiplayer trust-note polish -> passed 21 Chromium tests.
- Final `npm run verify` after multiplayer trust notes patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.76 kB / 240.00 kB, total JS 665.59 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:52677`, room `RLDH`.
- `git diff --check` after malformed host action response patch -> passed.
- `npm run typecheck` after malformed host action response patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "malformed"` after adding malformed settlement/AI response coverage -> first run passed 2 tests and failed the settlement case on serious toast contrast over the modal backdrop; after making toast backgrounds opaque, the focused run passed 3 Chromium tests.
- `npm test -- ToastContainer` after opaque toast background patch -> passed 1 file / 2 tests.
- Full `npm run test:e2e:isolated` after malformed host action response patch -> passed 23 Chromium tests, including malformed settlement success and malformed AI-toggle success branches.
- Browser plugin fallback for malformed host action visual QA -> Browser skill was available, but tool discovery did not expose the required Node REPL JavaScript execution tool; shell Playwright was used for the rendered probe.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified room `0D8A` malformed settlement response keeps the modal open with inline/toast errors, malformed AI-toggle response leaves room state unchanged with a toast, and console/page errors were zero; screenshots saved at `/tmp/fairvalue-malformed-settlement-toast.png` and `/tmp/fairvalue-malformed-ai-toggle-toast.png`.
- Final `npm run verify` after malformed host action response patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.65 kB / 240.00 kB, total JS 665.89 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:52244`, room `IH9I`.
- `git diff --check` after missing host authority controls patch -> passed.
- `npm run typecheck` after missing host authority controls patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "host page without authority"` after adding missing-authority warning coverage -> passed 1 Chromium test.
- Full `npm run test:e2e:isolated` after missing host authority controls patch -> passed 24 Chromium tests.
- Browser plugin fallback for missing host authority visual QA -> Browser skill was available, but tool discovery did not expose the required Node REPL JavaScript execution tool; shell Playwright was used for the rendered probe.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified room `CFHB` shows `Host controls unavailable`, links both AI and Settle controls to `host-authority-warning`, leaves server state `ai_enabled=false` and `settled=false`, and had zero console/page errors; screenshot saved at `/tmp/fairvalue-host-authority-warning.png`.
- Final `npm run verify` after missing host authority controls patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.65 kB / 240.00 kB, total JS 667.13 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:57797`, room `TGHR`.
- `git diff --check` after identity failure handling patch -> passed.
- `npm run typecheck` after identity failure handling patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "identity"` after adding identity failure branches -> passed 2 Chromium tests.
- Full `npm run test:e2e:isolated` after identity failure handling patch -> passed 26 Chromium tests.
- Browser plugin fallback for identity failure visual QA -> Browser skill was available, but tool discovery exposed Playwright MCP only and not the required Node REPL JavaScript execution tool; shell Playwright was used for the rendered probe.
- First strict rendered visual probe correctly failed on the expected browser resource console entries from forced `/api/identity` 503s; the rerun filtered those expected outage entries and reported zero unexpected console/page errors.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified create-room identity outage and malformed direct-player identity success states on mobile viewports, with room `XEPD`; screenshots saved at `/tmp/fairvalue-identity-outage-create.png` and `/tmp/fairvalue-malformed-identity-player.png`.
- Final `npm run verify` after identity failure handling patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.72 kB / 240.00 kB, total JS 667.20 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:64841`, room `REAG`.
- `git diff --check` after room-state load failure patch -> passed.
- `npm run typecheck` after room-state load failure patch -> passed.
- Focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "room state"` after adding state-load failure branches -> passed 2 Chromium tests.
- First full `npm run test:e2e:isolated` after room-state load failure patch -> failed after 26 passed because the negative-path `createRoom` helper exhausted the anonymous room-creation rate limit; failure traces were retained at `test-results/e2e-artifacts/negative-paths-join-route--02189-en-server-rate-limit-is-hit-chromium/trace.zip` and `test-results/e2e-artifacts/negative-paths-AI-analyst--293b5-instead-of-failing-silently-chromium/trace.zip`.
- Updated the negative-path room factory to send a unique `session_id` for each helper-created room, then reran full `npm run test:e2e:isolated` -> passed 28 Chromium tests.
- Browser plugin fallback for room-state load visual QA -> Browser skill was available, but tool discovery exposed Playwright MCP only and not the required Node REPL JavaScript execution tool; shell Playwright was used for the rendered probe.
- Rendered visual probe against temporary `http://127.0.0.1:3010` frontend and `http://127.0.0.1:8010` backend verified `/host/I39X` forced state-store `503` and `/play/XON8` malformed state JSON branches, with 1 expected `/api/rooms/:code/state` `503` resource error, zero unexpected console/page errors, and screenshots at `/tmp/fairvalue-host-room-state-outage.png` and `/tmp/fairvalue-player-malformed-room-state.png`.
- Final `npm run verify` after room-state load failure patch -> passed: `scan:secrets`, `typecheck`, 41 server tests, 6 Vitest suites / 43 tests, Vite production build, bundle budget gate with largest JS 195.71 kB / 240.00 kB, total JS 669.25 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:56230`, room `P6T9`.
- `npm run typecheck` after cited local AI analyst patch -> passed.
- Initial focused `node --test server/__tests__/aiAnalyst.test.js` failed because the new test assumed a nonexistent `observability.reset()` helper; the test cleanup was narrowed to restore `COGNEE_API_KEY`, then focused server AI tests passed 2 node tests.
- Focused `npm test -- cogneeService` after adding local AI context transport -> passed 1 Vitest file / 4 tests.
- Initial focused `npm run test:e2e:isolated -- e2e/negative-paths.spec.ts -g "AI analyst"` failed because the assertion used case-sensitive `No external comps`; the rendered output used lowercase `no external comps`, then the focused AI E2E passed 1 Chromium test.
- Focused `npm run test:e2e:isolated -- e2e/multiplayer-resilience.spec.ts -g "expanded routes|keyboard"` first caught an axe `scrollable-region-focusable` violation on the longer AI conversation log; after adding `aria-label="AI analyst conversation"` and `tabIndex={0}`, the focused accessibility/keyboard E2E passed 2 Chromium tests.
- Full `npm run test:e2e:isolated` after cited local AI analyst patch and console-warning cleanup -> passed 28 Chromium tests.
- Browser plugin fallback for cited local AI visual QA -> Browser skill was available, but tool discovery exposed Playwright MCP and not the required Node REPL JavaScript execution tool; shell Playwright was used for the rendered probe.
- First cited local AI visual probe used the wrong Vite backend env and did not reach connected state; rerun with `VITE_BACKEND_PORT=8010` reached room `CLGM`, and the final focused screenshot probe on room `RL7D` verified `/host/RL7D` local AI analysis, evidence, limitations, AI initialize/state/search all `200`, one expected React/Vite dev WebSocket close warning, zero unexpected console/page issues, and screenshot `/tmp/fairvalue-ai-local-analyst-evidence.png`.
- Final `npm run verify` after cited local AI analyst patch -> passed: `scan:secrets`, `typecheck`, 43 server tests, 6 Vitest suites / 44 tests, Vite production build, bundle budget gate with largest JS 195.71 kB / 240.00 kB, total JS 669.75 kB / 760.00 kB, largest CSS 14.74 kB / 25.00 kB, and `smoke:boot` with real backend child process on `http://127.0.0.1:52164`, room `EWKR`.

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
- Restart matrix E2E verified the rendered real backend restart/load recovery path across Chromium, Firefox, and WebKit.
- Restart latency profile verified the real backend API path for `/api/rooms`, `/join`, `/bet`, `/state`, and `/settle` through a backend outage/restart with explicit latency budgets.
- Vite migration verified `react-scripts` and `webpack-dev-server` are absent, full and production audits report zero vulnerabilities, Vite build passes, Vitest unit tests pass, isolated browser E2E passes, host/player matrix passes, and restart matrix passes.
- Route-splitting verified the production app no longer emits a large-chunk warning while browser and keyboard E2E still pass on Vite.
- Assistive-tech AX capture verified headed Chrome macOS app-region AX names and Playwright ARIA snapshots for `/join`, create-room form, `/host/:roomCode`, settle modal, `/play/:roomCode` join form, and mobile betting controls using room `N5A8`.
- Browser-load E2E verified `/join`, `/host/:roomCode`, and 10 simultaneous rendered `/play/:roomCode` mobile pages through concurrent joins, concurrent bets, host totals/activity, all-player settlement broadcasts, and durable snapshot reconciliation using room `VF08`.
- Cold production profile verified production `dist` serving, `/join`, `/host/:roomCode`, `/play/:roomCode`, player betting, host sync, settlement broadcast, and local snapshot recovery using room `P4AZ`.
- Mixed-traffic E2E verified `/join`, `/host/:roomCode`, and throttled rendered `/play/:roomCode` clients while concurrent API clients joined/bet and state reads churned, ending with settlement broadcast and snapshot reconciliation using room `6PD9`.
- Live persistence readiness verified the local no-credential production database path reports degraded/skip truthfully, and disposable Postgres verified targeted room persistence plus whole-snapshot compatibility against `fairvalue_room_snapshots`.
- Expanded assistive-tech capture verified `/`, `/market/440298192`, `/join`, `/host/:roomCode`, and `/play/:roomCode` across browse, sort, property detail, create-room, host dashboard, AI degraded alert, settle modal, betting controls, and settled host/player states using room `TFKC`.
- Accessibility edge-state E2E verified `/join` create/join validation alerts with field-level invalid/described-by semantics, `/host/:roomCode` settle validation alerts, `/` map marker accessible labels, and Leaflet popup link/contrast behavior.
- Corrupt snapshot recovery verified a malformed local JSON room snapshot is renamed to `.corrupt-*`, the recovery path logs only the quarantine/source paths, fresh snapshot writes still work afterward, and the rendered backend restart harness remains green.
- Encrypted snapshot evidence verified local JSON snapshots omit host token/address plaintext when `FAIRVALUE_ROOM_SNAPSHOT_SECRET` is set, wrong/missing secrets fail closed, encrypted child-process restart restores the room, and the rendered restart harness passes with encrypted snapshots enabled.
- Local retention evidence verified an expired settled room is removed from the JSON snapshot, recent settled and old active rooms remain, rendered restart recovery still works, and full verify remains green.
- Postgres retention evidence verified an expired settled row is deleted from `fairvalue_room_snapshots`, recent settled and old active rows remain, targeted expired-row loads return `null`, expired targeted saves are skipped, disposable Docker Postgres stays green, and full verify remains green.
- Backend observability evidence verified `/healthz`, `/readyz`, and `/api/ops/metrics`; the metrics snapshot tracks aggregate room lifecycle/request/dependency counters, omits host tokens, requires the configured ops token, and remains covered by full verify.
- Production readiness evidence verified the deploy-env gate rejects local defaults, does not echo secret values, accepts a synthetic durable Postgres production config, and is included in the 37-test server suite.
- Prometheus metrics evidence verified `/metrics` returns text/plain Prometheus scrape output for aggregate request/status/latency, room, WebSocket, rate-limit, database, persistence, and AI counters; it omits room host tokens and shares the configured ops-token guard.
- TypeScript verification evidence verified the Vite/React source tree and Vite config with `tsc --noEmit`, and `npm run verify` now fails if the type gate regresses.
- HTTP security header evidence verified `/healthz`, `/api/rooms` validation errors, and unknown routes all include the security baseline while omitting `X-Powered-By`.
- E2E TypeScript evidence verified Playwright specs/configs are now inside `npm run typecheck`, including WebSocket-backed load/accessibility specs and the restart recovery harness.
- Local boot smoke evidence verified the real `node server/index.js` process starts on a free local port, serves health/readiness, runs the degraded-local multiplayer room path over HTTP plus WebSocket, writes a local room snapshot, protects metrics with the ops token, and omits host tokens from public state/metrics.
- Player notification evidence verified `/play/:roomCode` invalid `$0` wager feedback through inline alert semantics, `aria-invalid` / `aria-describedby` linkage on the custom wager input, a message-specific dismissible error toast, and serious/critical axe coverage in the full isolated Chromium suite.
- Host action notification evidence verified `/host/:roomCode` fake-token AI-toggle rejection through a message-specific `Invalid host token` alert toast, unchanged `aria-pressed=false` AI control state, and server state with `ai_enabled=false`; the happy-path host flow also verifies exact AI-control button names with success toasts present.
- Settlement notification evidence verified `/host/:roomCode` fake-token settlement rejection through inline modal `#settle-error`, a message-specific `Invalid host token` alert toast, unchanged unsettled server state, and serious/critical axe coverage through the full isolated Chromium suite.
- Fake cloud-sync removal evidence verified the client source no longer contains the unused mock `api.fairvalue.io` fair-value sync hook, its local `fairvalue_cloud_data` cache key, or the stub cloud persistence listener; the real backend boot smoke still proved the degraded-local HTTP/WebSocket room path with room `CVKK`.
- Direct player join notification evidence verified `/play/:roomCode` empty nickname feedback through inline `#player-join-error`, `aria-invalid` / `aria-describedby` linkage on the nickname input, a message-specific dismissible error toast, and zero `/api/rooms/:roomCode/join` submissions before valid input.
- Market-start notification evidence verified `/market/440298192` forced `POST /api/rooms` 503 feedback through inline `#market-start-room-error`, Start a Bid `aria-describedby` linkage, a message-specific dismissible error toast, preserved market-detail URL, and serious/critical axe coverage.
- Join-page API failure evidence verified `/join` nonexistent room feedback through inline `#join-room-error` plus a message-specific `Room not found` toast, and forced create-room `POST /api/rooms` 503 feedback through inline `#create-room-error`, a message-specific toast, preserved `/join` URL, and serious/critical axe coverage.
- Player bet failure rollback evidence verified `/play/:roomCode` forced `POST /api/rooms/:roomCode/bet` plain-text 503 feedback through inline `#player-bet-error`, a message-specific `Bet failed` toast, `aria-invalid` / `aria-describedby` linkage on the custom wager input, unchanged rendered balance, no rendered positions, unchanged server trade count/player balance, and serious/critical axe coverage.
- Direct player join API failure evidence verified `/play/:roomCode` forced `POST /api/rooms/:roomCode/join` plain-text 503 feedback through inline `#player-join-error`, a message-specific `Failed to join room` toast, `aria-describedby` without incorrect nickname `aria-invalid`, preserved retry state/URL, unchanged server player list, and serious/critical axe coverage.
- Join-page room join outage evidence verified `/join` forced `POST /api/rooms/FAIL/join` plain-text 503 feedback through inline `#join-room-error`, a message-specific `Failed to join room` toast, both fields described by the alert without invalid field semantics, preserved `/join` URL, and serious/critical axe coverage.
- Join-page host auto-join outage evidence verified `/join` real room creation followed by a forced dynamic `POST /api/rooms/:roomCode/join` plain-text 503, inline `#create-room-error`, a message-specific `Failed to join room as host` toast, create fields described by the alert without invalid field semantics, preserved `/join` URL, created-room state with zero players, and serious/critical axe coverage.
- Market host auto-join outage evidence verified `/market/440298192` real room creation followed by a forced dynamic `POST /api/rooms/:roomCode/join` plain-text 503, inline `#market-start-room-error`, a message-specific `Failed to join room as host` toast, Start a Bid `aria-describedby` linkage, preserved market-detail URL, created-room state with zero players, and serious/critical axe coverage.
- Market trust evidence verified `/market/440298192` renders a desktop/mobile trust explainer for play-money credits, LMSR Over probability, market-implied fair value, `MLSListings Inc` provenance with `Checked Feb 7, 2026`, and host settlement/event replay evidence, with serious/critical axe coverage and no console/page errors in the rendered visual probe.
- Multiplayer trust evidence verified `/host/PL34` and `/play/PL34` render trust notes across host active room, direct player entry, active player room, settlement modal, host settled recap, and player settled recap, covering simulation credits, non-appraisal authority, LMSR probability, actual sale/appraisal settlement evidence, and event-history replay with serious/critical axe coverage.
- Malformed host action evidence verified `/host/0D8A` with real host token and intercepted malformed 200 responses: settlement stayed in the modal with `Settlement response was invalid`, AI toggle stayed off with `AI toggle response was invalid`, server state stayed unsettled/AI-disabled, and rendered toast/modal states had zero console/page errors.
- Missing host authority evidence verified `/host/CFHB` without the original host browser authority renders `Host controls unavailable`, keeps AI and Settle disabled with `aria-describedby="host-authority-warning"`, leaves `ai_enabled=false` and `settled=false`, and passes serious/critical axe checks with zero console/page errors.
- Identity failure evidence verified `/join` create-room identity outage shows `Identity unavailable` inline and in the toast without sending `POST /api/rooms`, while `/play/XEPD` malformed identity success shows `Identity response was invalid` inline and in the toast without sending the room join mutation; both pass serious/critical axe checks.
- Room-state load failure evidence verified `/host/I39X` forced state-store `503` renders a retryable `Room temporarily unavailable` alert with `Room state unavailable`, while `/play/XON8` malformed state JSON renders `Room state response was invalid`, hides the player join form, leaves the real room with zero players, and passes serious/critical axe checks.
- Cited local AI evidence verified `/host/RL7D` without `COGNEE_API_KEY` returns 200 from initialize/state/search, renders `Local AI analyst`, `Evidence used`, `Room market snapshot`, and `Limits`, keeps the AI conversation log keyboard-focusable, and has zero unexpected console/page issues in the rendered probe.
- Player pre-bet evidence verified `/play/FZNS` renders the local LMSR pre-bet read before wagering with one reason to believe, one reason to doubt, OVER/UNDER share/probability previews, no-provider-comps provenance, compact fixed betting controls, zero page errors, and a mobile screenshot at `/tmp/fairvalue-player-prebet-mobile.png`.
- Public recap evidence verified `/recap/Z7IM` renders a share-safe settled recap from public room state only with settlement result, public evidence, public timeline, simulation-credit/non-appraisal guardrails, no host/user token text, zero console/page issues, and a mobile screenshot at `/tmp/fairvalue-public-recap.png`.
- Room artifact UI evidence verified the extracted shared artifact component renders `/review/S9IS` on desktop and `/recap/S9IS` on mobile with settlement evidence, public recap token non-leakage, no horizontal overflow, zero console/page issues, and screenshots at `/tmp/fairvalue-artifact-review-desktop.png` and `/tmp/fairvalue-artifact-recap-mobile.png`.

## Screenshots Or Traces

- `/tmp/fairvalue-home.png`
- `/tmp/fairvalue-market.png`
- `/tmp/fairvalue-host.png`
- `/tmp/fairvalue-player-mobile.png`
- `/tmp/fairvalue-settled.png`
- `/tmp/fairvalue-host-token-settled.png`
- `/tmp/fairvalue-room-code-digit-join.png`
- `/tmp/fairvalue-market-trust-desktop.png`
- `/tmp/fairvalue-market-trust-mobile.png`
- `/tmp/fairvalue-room-trust-host.png`
- `/tmp/fairvalue-room-trust-player-entry.png`
- `/tmp/fairvalue-room-trust-player-active.png`
- `/tmp/fairvalue-room-trust-settle-modal.png`
- `/tmp/fairvalue-room-trust-host-settled.png`
- `/tmp/fairvalue-room-trust-player-settled.png`
- `/tmp/fairvalue-malformed-settlement-toast.png`
- `/tmp/fairvalue-malformed-ai-toggle-toast.png`
- `/tmp/fairvalue-host-authority-warning.png`
- `/tmp/fairvalue-identity-outage-create.png`
- `/tmp/fairvalue-malformed-identity-player.png`
- `/tmp/fairvalue-host-room-state-outage.png`
- `/tmp/fairvalue-player-malformed-room-state.png`
- `/tmp/fairvalue-ai-local-analyst-evidence.png`
- `/tmp/fairvalue-player-prebet-mobile.png`
- `/tmp/fairvalue-public-recap.png`
- `/tmp/fairvalue-artifact-review-desktop.png`
- `/tmp/fairvalue-artifact-recap-mobile.png`
- `test-results/e2e-artifacts/negative-paths-join-route--02189-en-server-rate-limit-is-hit-chromium/trace.zip`
- `test-results/e2e-artifacts/negative-paths-AI-analyst--293b5-instead-of-failing-silently-chromium/trace.zip`
- `test-results/e2e-artifacts/negative-paths-AI-analyst--6e256-en-Cognee-is-not-configured-chromium/trace.zip`
- `test-results/e2e-artifacts/multiplayer-resilience-exp-9d752-erious-accessibility-checks-chromium/trace.zip`
- Playwright E2E is configured to retain screenshots, traces, and videos on failure under `test-results/e2e-artifacts`; the passing run produced no failure screenshots/videos.
- `playwright-report/index.html` was generated locally for the passing E2E run and is ignored by git.
- `docs/accessibility-assistive-tech-notes.md` records the macOS AX and Playwright ARIA excerpts from the headed assistive-tech pass.

## Commits Made

- `7882cd2` - Add public room recap.
- `c01e84c` - Add player pre-bet intelligence.
- `1b8940e` - Add operator room review.
- `9c98d92` - Add room-aware market intelligence.
- `a60d3f4` - Add market studio draft audit.
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
- `a11a212` - Record keyboard accessibility evidence.
- `a65f3b1` - Add restart recovery browser matrix.
- `5d74cda` - Record restart matrix evidence.
- `b1e5b47` - Add restart latency profile.
- `a77289b` - Migrate frontend toolchain to Vite.
- `c186a2a` - Split heavy frontend routes.
- `4d28ed5` - Add frontend bundle budget gate.
- `52f9ee4` - Add assistive technology AX capture.
- `f188062` - Add rendered browser load profile.
- `6a78c08` - Add cold production performance profile.
- `d92de55` - Add mixed traffic resilience profile.
- `97b6235` - Add live Postgres readiness smoke.
- `4777bec` - Expand assistive technology route coverage.
- `e6c71fe` - Harden accessibility edge states.
- `31e54db` - Recover corrupt room snapshots.
- `e4a099a` - Encrypt local room snapshots.
- `ac11618` - Prune expired local room snapshots.
- `4994643` - Prune expired Postgres room snapshots.
- `5430ddc` - Add backend observability endpoints.
- `3dab2ac` - Record backend observability evidence.
- `4ffa3f1` - Add production readiness environment check.
- `cc30195` - Record production readiness evidence.
- `d27ce9b` - Add Prometheus metrics exporter.
- `f35b95c` - Record Prometheus metrics evidence.
- `6212616` - Add TypeScript gate to verification.
- `7bf3b57` - Record TypeScript verification evidence.
- `ac3002c` - Add baseline HTTP security headers.
- `81fb66b` - Record HTTP security header evidence.
- `499a324` - Expand TypeScript gate to E2E specs.
- `a29bc1a` - Record E2E TypeScript coverage evidence.
- `151538c` - Add local backend boot smoke.
- `61d853d` - Record local boot smoke evidence.
- `bff61ba` - Harden player validation notifications.
- `60994ae` - Record player notification evidence.
- `9aa0631` - Announce host AI toggle failures.
- `aab465c` - Record host action notification evidence.
- `793c0a3` - Announce settlement failures.
- `9453546` - Record settlement notification evidence.
- `9615bdf` - Remove unused cloud fair value stub.
- `0867c1d` - Record cloud stub removal evidence.
- `af87f05` - Cover direct player join validation.
- `38e9d9a` - Record direct player validation evidence.
- `b4a7b23` - Announce market room start failures.
- `5f864e4` - Record market start notification evidence.
- `55911d3` - Announce join page API failures.
- `184be29` - Record join page notification evidence.
- `d9595a7` - Cover player bet failure rollback.
- `026dda0` - Record player bet rollback evidence.
- `c9aaa1a` - Cover direct player join API failure.
- `a8cf7c3` - Record direct player join API evidence.
- `5cfecf6` - Cover join page room join outage.
- `130f057` - Record join page room join outage evidence.
- `8900e7f` - Cover join page host auto-join outage.
- `a20c5fb` - Record join page host auto-join evidence.
- `7c26265` - Cover market host auto-join outage.
- `733e346` - Record market host auto-join evidence.
- `b35d060` - Explain market trust mechanics.
- `590f571` - Record market trust evidence.
- `a12fe61` - Carry trust notes through room flow.
- `177e331` - Record multiplayer trust evidence.
- `f1829bc` - Harden malformed host action responses.
- `35cce6c` - Record malformed host action evidence.
- `9af7d26` - Explain missing host authority.
- `17e720c` - Record missing host authority evidence.
- `8014a2a` - Harden identity failure handling.
- `f150b59` - Record identity failure evidence.
- `f782c28` - Explain room state load failures.
- `86d9e4e` - Record room state load evidence.
- `6a8b81e` - Add cited local AI analyst fallback.

## Next Action Queue

1. Continue deeper branch-level coverage for the remaining validation and notification states that are not already rendered in the isolated E2E suite.
2. Run a human-listened VoiceOver rotor/audio pass and close any remaining route/modal/accessibility edge states it uncovers.
3. Run `FAIRVALUE_LIVE_POSTGRES_SMOKE=1 npm run test:persistence:live` against a real Neon/Postgres URL once credentials are available.
4. Run a live `COGNEE_API_KEY` smoke once credentials are available to verify provider-backed citation quality against the deterministic local fallback.
5. Add production-hosted or externally tunneled load evidence once an environment/URL is available.
6. Configure the real external Prometheus/log collector/dashboard in the production deployment once an environment exists.
7. Run `npm run check:production` against the actual deployment environment once production env values are available.
8. Start the next loop with `npm run verify`, then inspect the highest-risk deployment-readiness or real-service gap that is not already covered by the current matrix, restart, soak, latency, browser-load, mixed-traffic, cold-performance, and assistive-tech harnesses.
