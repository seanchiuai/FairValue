# FairValue — 50-Point Architectural & Integrity Audit + 10-Year Blueprint

**Target:** FairValue (real-time multiplayer LMSR real-estate prediction market). React 19 + TS frontend, Express 5 + `ws` backend, Neon/Postgres optional, event-sourced room runtime.
**Method:** Source-traced. Every finding cites `file:line`. Claims about runtime behavior were verified by running the server test suite (`node --test server/__tests__/validationAndIdempotency.test.js` → 13/13 pass) and by inspecting served payloads (`public/data/properties.json`).
**Date:** 2026-06-12.

## Honest framing (read this first)

The audit brief assumes a decaying, untested monolith. The actual codebase is the opposite in important ways: it is **event-sourced** (`server/roomEventLog.js`), has **idempotent bets** (`Idempotency-Key`), **per-scope rate limiting**, **HMAC-signed identities**, **encrypted local snapshots**, **replay-integrity verification**, and a **large passing test suite** (`server/__tests__/`, `src/**/__tests__`). That changes the nature of the real risks: they are mostly **scaling ceilings, a few genuine security/data-exposure defects, and maintainability drift** — not "no tests / no structure."

So severities below are calibrated honestly. Three findings are genuinely serious and shippable-blocker class (**D1 PII leak, D2/D3 unauthenticated room data, D6 default signing secret**). The rest range from "real scaling ceiling" to "polish." I have not inflated a hardcoded light-mode panel into an "existential threat"; doing so would make the audit less useful.

---

## Category A — Architecture, State Management & Scaling Anti-Patterns

### Issue #1: Single-process in-memory room registry is the hard scaling ceiling
* **Category:** A
* **SystemicImpact:** The entire multiplayer product cannot run on more than one Node process/instance. WebSocket fan-out, AI intervals, rate limits, and idempotency receipts all live in one heap. This caps concurrency at one box and makes any deploy a full-room outage.
* **TechnicalBreakdown:** `const rooms = {}` (`server/index.js:94`) is the authoritative live store. WebSocket sockets are pushed onto `room.connections` arrays (`server/index.js:2729`), and AI bots run as in-process `setInterval`s (`server/index.js:509`). None of this is shareable across nodes; a second instance would have a disjoint world and broadcasts would not reach clients on the other node.
* **RemediationParadigm:** Externalize live state and fan-out. Move authoritative room state behind a shared store (Redis/Postgres + a durable log you already have), and replace direct socket arrays with a pub/sub bus (Redis Streams / NATS / a managed WebSocket gateway). Make each node stateless and route by room via consistent hashing or sticky sessions.

### Issue #2: Full-snapshot write amplification on every mutation (JSON mode)
* **Category:** A
* **SystemicImpact:** Every single bet rewrites the *entire* rooms file containing *all* rooms. Cost is O(total rooms × their events) per individual action, so throughput collapses precisely as the product succeeds.
* **TechnicalBreakdown:** `persistRooms()` serializes every room (`server/index.js:351-375`) and `writeSnapshotPayload` stringifies and `fs.renameSync`s the whole file (`server/roomPersistence.js:171-177`). `appendRoomEvent` calls `persistRoom` on every event (`server/index.js:1186-1191`).
* **RemediationParadigm:** Stop snapshotting all rooms per mutation. Append-only event log is already the durable truth; persist per-room deltas (you already have `saveRoom`/`deleteRoom`) and snapshot lazily/periodically as a compaction checkpoint, not synchronously on the hot path.

### Issue #3: Full event replay on every state read
* **Category:** A
* **SystemicImpact:** Each `GET /api/rooms/:code/state` replays the room's entire event history from scratch. Clients poll this every 3–5s (reconcile + disconnected fallback), so steady-state CPU is O(clients × events) and grows for the life of every room.
* **TechnicalBreakdown:** `getRoomStatePayload` → `getRoomReplay` → `replayRoomEvents(roomEventStore.list(code))` (`server/index.js:1305-1306`, `server/roomEventLog.js:574`). `useRoom` reconciles every 5s while connected (`src/hooks/useRoom.ts:227-231`) and polls every 3s when disconnected (`:234-246`).
* **RemediationParadigm:** Maintain the materialized room object as the read model (it already exists in memory) and serve reads from it directly; use replay only for cold hydration and integrity checks. Add a replay checkpoint/snapshot so even cold replay is bounded.

### Issue #4: Dual source of truth for trades (event log + unmanaged SQL tables)
* **Category:** A
* **SystemicImpact:** Trades are written both to the event log/room snapshot *and* to Postgres `trades`/`market_state`. The two can diverge, and consumers disagree about reality (charts read SQL; room state reads events).
* **TechnicalBreakdown:** Room creation inserts into `markets`/`market_state` (`server/index.js:1123-1133`); each bet calls `persistTrade` + `updateMarketState` (`:2367-2369`) *and* appends a `bet_placed` event (`:2353`). Chart endpoints read only SQL (`:2567-2588`).
* **RemediationParadigm:** Pick one system of record (the event log). Derive SQL projections asynchronously from the event stream (CQRS read models) rather than dual-writing on the request path, so charts and room state share one lineage.

### Issue #5: Host is a centralized trusted oracle for settlement
* **Category:** A
* **SystemicImpact:** A single human unilaterally decides the settling value that pays out every player. There is no second-party check on the request path, so the market's integrity reduces to "trust the host." This is fine for a party game, fatal for anything with stakes.
* **TechnicalBreakdown:** `POST /api/rooms/:code/settle` accepts `actual_price`/evidence and immediately pays out (`server/index.js:2401-2474`). Public verification signing is *optional* (`FAIRVALUE_PUBLIC_VERIFICATION_SECRET`, `.env.example:91-93`); unset → unsigned digests.
* **RemediationParadigm:** Separate "propose settlement" from "finalize." Require signed evidence and either an independent oracle/data-feed or an N-of-M operator approval before payout. Make the verification artifact mandatory and signed.

### Issue #6: Two divergent LMSR implementations (client vs server)
* **Category:** A
* **SystemicImpact:** The pricing math exists twice. Client optimistic pricing and server authoritative pricing can silently drift on edits, producing user-visible "the price jumped after I bet" defects and eroding trust in the market.
* **TechnicalBreakdown:** `src/lib/lmsr.ts` (client optimistic, used in `useRoom.placeBet`, `:304-307`) and `src/lib/marketEngine.js` (server authoritative, imported `server/index.js:63-68`) define `costFunction`/`priceOver`/`executeBuy`/`buyWithBudget` independently and identically — i.e., copy-paste with no shared source.
* **RemediationParadigm:** One implementation, compiled to both targets. Make `marketEngine` the single module (or generate the client build from it) and import it on both sides; delete the duplicate. Add a cross-implementation property test if duplication is unavoidable.

### Issue #7: Unbounded per-market simulation intervals at boot
* **Category:** A
* **SystemicImpact:** On startup the server creates one recurring timer per *open* market, each writing to the DB every 15s, in a single process. With thousands of seeded markets this is thousands of timers and a constant DB write storm — a self-inflicted load generator that scales with catalog size, not user demand.
* **TechnicalBreakdown:** `startSimulations` loops all open markets and schedules `setInterval(..., 15000)` per market (`server/index.js:2619-2657`), each calling `runSimTrade` → `persistTrade`/`updateMarketState`.
* **RemediationParadigm:** Replace per-market timers with a single scheduler/work queue with a global rate budget, or move simulation to an opt-in, demand-driven job. Cap concurrent simulated markets and batch DB writes.

### Issue #8: Global serialized persistence queue causes cross-room head-of-line blocking
* **Category:** A
* **SystemicImpact:** All Postgres room saves funnel through one promise chain, so a slow write in room A delays durability acknowledgement for unrelated room B. Under load this serializes the whole product behind the slowest write.
* **TechnicalBreakdown:** `roomPersistenceWriteQueue = roomPersistenceWriteQueue.catch().then(write)` (`server/index.js:362-370`); a single module-level chain (`:125`).
* **RemediationParadigm:** Per-room (or per-shard) write queues keyed by room code, or a proper async write-behind buffer with batching. Never globally serialize independent aggregates.

### Issue #9: 2,810-line god module concentrates every concern
* **Category:** A
* **SystemicImpact:** Routing, auth, market math, AI, WebSocket, persistence orchestration, and the Cognee proxy all live in one file. Change-coupling is maximal; this is the single biggest barrier to the "autonomous-agent-maintainable" goal because any change touches a high-blast-radius file.
* **TechnicalBreakdown:** `server/index.js` is 2,810 lines spanning HTTP routes (`:1409-2613`), WS (`:2701-2745`), AI engine (`:433-518`, `:2659-2678`), and persistence wiring (`:117-713`).
* **RemediationParadigm:** Decompose into modules with explicit interfaces: `http/` (routers), `realtime/` (WS gateway), `market/` (already partly in `roomMarketRuntime`), `persistence/`, `ai/`, `integrations/`. Keep `index.js` as composition root only.

### Issue #10: Rate-limit and idempotency state are process-local and ephemeral
* **Category:** A
* **SystemicImpact:** Both correctness guarantees (no duplicate bets) and abuse controls (rate limits) silently weaken on restart and are absent across instances — directly undercutting the same multi-node future the project wants.
* **TechnicalBreakdown:** `rateLimitBuckets = new Map()` (`server/index.js:116`) and per-room `betReceipts` Map (`:1105`, written `:2373`) are in-heap. A restart drops all idempotency receipts (a retried bet would re-execute) and resets limits.
* **RemediationParadigm:** Back idempotency receipts with the durable store (they're already in the snapshot — make them authoritative and load them on hydrate) and move rate limiting to a shared store (Redis token bucket) once multi-node.

---

## Category B — Cognitive Friction, Interaction Flow & Next-Gen UX Debt

### Issue #11: Optimistic feedback exists only for binary markets
* **Category:** B
* **SystemicImpact:** Range, rent-yield, time-on-market, renovation-budget, and neighborhood-momentum rooms feel laggy on every bet (full round-trip before any UI change), while binary rooms feel instant — an inconsistent, second-class experience for the newer market types.
* **TechnicalBreakdown:** `placeBet` only predicts when `marketFormat === BINARY_MARKET_FORMAT` (`src/hooks/useRoom.ts:294-322`); all other formats wait for the server response.
* **RemediationParadigm:** Generalize optimistic pricing through the shared market engine for every LMSR format (and the multi-outcome engine), or show an explicit pending state so latency is legible rather than mysterious.

### Issue #12: Chart history is silently empty in the default (JSON) deployment
* **Category:** B
* **SystemicImpact:** The probability/fair-value chart — a core trust surface — loses all history on reload unless Postgres is configured, because history comes only from the SQL `trades` table. Most local/hackathon deployments run JSON mode and see a chart that resets.
* **TechnicalBreakdown:** Both views fetch `/api/markets/by-property/room-:code/chart` (`src/pages/HostView.tsx:103-121`, `src/pages/PlayerView.tsx:82-100`), which returns `[]` when `sql.isConfigured === false` (`server/index.js:2567-2568`).
* **RemediationParadigm:** Derive chart history from the event log (the same source as room state) so it works in every persistence mode; treat SQL as an optional accelerator, not the only source.

### Issue #13: Stale localStorage cache renders as live state with no indicator
* **Category:** B
* **SystemicImpact:** On load, a 5-minute-old cached snapshot (including a possibly-settled market or wrong balances) is shown as if current, with no "reconnecting/stale" affordance until the network fetch resolves.
* **TechnicalBreakdown:** `useRoom` hydrates from `localStorage` within a 5-min TTL and sets full state immediately (`src/hooks/useRoom.ts:60-81`) before the live fetch returns.
* **RemediationParadigm:** Mark cached state visually (dimmed/"last seen") until the first live response confirms it, and never show settlement outcomes from cache without confirmation.

### Issue #14: Host authority is bound to one browser's storage with weak recovery
* **Category:** B
* **SystemicImpact:** A host who clears storage, switches devices, or hits a private window silently loses the ability to lock betting, toggle AI, or settle — mid-event — with only a generic "host authority missing" notice and no re-claim flow.
* **TechnicalBreakdown:** Host token persisted to `sessionStorage`+`localStorage` (`src/lib/fairValueAuth.ts:24-33`); `hasHostAuthority` derives from that or identity match (`src/pages/HostView.tsx:83-88`). No server-side host recovery/transfer flow.
* **RemediationParadigm:** Tie host authority to the durable signed user identity (already supported via `hostUserId`) and provide an explicit "resume hosting on this device" re-auth, plus a host-transfer path.

### Issue #15: Hardcoded light-mode bet panel breaks the dark design system
* **Category:** B
* **SystemicImpact:** The single most-used control on mobile (the sticky bet panel) is a white slab on an otherwise dark, token-driven theme — visually jarring and a sign the token system isn't enforced.
* **TechnicalBreakdown:** `betPanel.background: '#fff'` literal (`src/pages/PlayerView.tsx:786`) instead of `var(--bg-*)`; surrounding components use CSS custom properties.
* **RemediationParadigm:** Route all colors through design tokens; add a lint rule forbidding raw hex in component style objects.

### Issue #16: Reconnect/reconcile can visibly rewind fresh local state
* **Category:** B
* **SystemicImpact:** The 5s reconcile and on-reconnect refetch overwrite local state wholesale, so a just-placed bet or balance can flicker/rewind if the reconcile races the broadcast — undermining confidence in the live feed.
* **TechnicalBreakdown:** `fetchRoomState` calls `applyFreshRoomState` which `setMarket/setPlayers(...)` from the server snapshot unconditionally (`src/hooks/useRoom.ts:127-156`, interval `:227-231`).
* **RemediationParadigm:** Reconcile by event sequence (you already track `event_sequence`): only apply server state if its `last_sequence` ≥ the client's, and merge rather than replace.

### Issue #17: Dropped/malformed realtime updates are invisible to users
* **Category:** B
* **SystemicImpact:** When a WS message fails to parse or a type isn't handled, the client silently drops it (console only). Players can sit on stale prices with no cue to refresh.
* **TechnicalBreakdown:** `onmessage` swallows parse errors with `console.warn` (`src/hooks/useWebSocket.ts:126-128`); unknown `data.type` falls through the switch with no default.
* **RemediationParadigm:** Surface a lightweight "updates delayed" indicator on parse/handler gaps and trigger a sequence-checked reconcile; count drops in telemetry.

### Issue #18: Silent wager clamping creates input confusion
* **Category:** B
* **SystemicImpact:** Typing an amount above balance silently snaps to the max with no message; presets and the custom field can disagree, so users don't understand why their input changed.
* **TechnicalBreakdown:** `onChange` clamps to `[0, balance]` with no feedback (`src/pages/PlayerView.tsx:479-483`).
* **RemediationParadigm:** Show an inline "max $X (your balance)" hint when clamping, and keep preset/custom selection visually in sync.

### Issue #19: Free-text bet reasons are broadcast to a room projector with no safety handling
* **Category:** B
* **SystemicImpact:** Up to 280 chars of arbitrary player text is shown on the host's big-screen activity feed in front of a room, with only tag-stripping — a social-safety and moderation gap for any public/classroom setting.
* **TechnicalBreakdown:** Reason is sanitized only via tag strip (`sanitizeText`, `server/index.js:715-719`), stored on the bet, and emitted in the `bet` broadcast/activity (`:2384-2395`), rendered in `ActivityFeed`.
* **RemediationParadigm:** Add opt-in moderation (profanity/abuse filter, host mute/remove, per-room "reasons off" toggle) before reasons hit a shared display.

### Issue #20: Tiny 4-char codes + per-browser identity make cross-device rejoin fragile
* **Category:** B
* **SystemicImpact:** Codes are easily mistyped and identity is per-browser localStorage, so a player switching phones becomes a brand-new participant (fresh 1,000 balance), fragmenting leaderboards and confusing users.
* **TechnicalBreakdown:** Identity minted/stored per browser (`src/hooks/useSession.ts:37-45`); room codes are 4 chars (`server/index.js:100-101`). No shareable rejoin link carrying identity.
* **RemediationParadigm:** Offer a "rejoin" magic link/QR that carries a signed identity, and consider 6-char codes or word codes to reduce mistyping while keeping codes human-friendly.

---

## Category C — Boundary Conditions, Edge Cases & Data-Corruption Faults

### Issue #21: Optimistic update uses wager as cost, diverging from true LMSR cost
* **Category:** C
* **SystemicImpact:** The optimistic UI deducts the raw `wager` and adds `wager` to `total_wagered`, but LMSR `cost` is solved by budget search and is not exactly the wager; users briefly see a wrong balance/volume until reconciliation.
* **TechnicalBreakdown:** Optimistic branch sets `total_wagered: market.total_wagered + wager` and `balance - wager` (`src/hooks/useRoom.ts:312-321`), while the server records `trade.wager = roundMoney(cost)` (`src/lib/marketEngine.js:181`).
* **RemediationParadigm:** Compute optimistic cost via the same `executeBuy` cost delta you already call (`result.cost`) instead of using `wager`, so optimistic and authoritative agree to the cent.

### Issue #22: Floating-point money with per-op rounding accumulates drift
* **Category:** C
* **SystemicImpact:** Balances, wagers, and payouts are JS doubles rounded at each step; long-lived rooms accumulate rounding error, and settlement payout sums of rounded shares can disagree with the implied ledger.
* **TechnicalBreakdown:** `roundMoney`/`roundShares` round to 2 dp per operation (`src/lib/marketEngine.js:35-41`); settlement sums `bet.shares` then rounds (`settlePlayers`, `:210-236`). No integer-cents invariant.
* **RemediationParadigm:** Represent money as integer cents (or a decimal type) end-to-end; round only at display. Add an invariant test that total payouts reconcile against total cost.

### Issue #23: WebSocket half-open connections are never reaped
* **Category:** C
* **SystemicImpact:** Dead/zombie sockets linger in `room.connections` until a future broadcast happens to filter them; broadcast recipient counts and connection metrics are inflated, and memory grows on flaky mobile networks.
* **TechnicalBreakdown:** The WS server only handles `close` (`server/index.js:2736-2744`); there is no server `ping`/`pong`/`isAlive` heartbeat (confirmed: no `ws.on('message')` handler), so half-open TCP connections aren't detected.
* **RemediationParadigm:** Implement the standard `ws` heartbeat: server-side `ping` on an interval, terminate sockets that miss a `pong`, and prune on the timer rather than lazily during broadcast.

### Issue #24: Player liveness is keyed to socket close, not session
* **Category:** C
* **SystemicImpact:** Closing one of several tabs emits a `player_left` event with only a connection count, and replay marks the player `connected:false` even if they're still present elsewhere — corrupting presence/leaderboard semantics.
* **TechnicalBreakdown:** WS close appends `PLAYER_LEFT` with `source:'websocket'` and no session (`server/index.js:2740-2744`); replay flips `connected:false` for any `payload.session_id` (`server/roomEventLog.js:604-611`), and join/leave aren't reference-counted per session.
* **RemediationParadigm:** Track connections per `session_id` with a reference count; emit presence transitions only when the count crosses 0/1, and bind WS connections to an authenticated session.

### Issue #25: Snapshot-vs-event-log reconciliation can load stale state
* **Category:** C
* **SystemicImpact:** On hydrate, the code picks durable events over the snapshot only when `events.length >= snapshotEvents.length`; off-by-one or partial writes can select a stale market while discarding newer snapshot-only fields.
* **TechnicalBreakdown:** `hydratePersistedRoomsFromEvents` chooses `durableEvents.length >= snapshotEvents.length ? durableEvents : snapshotEvents` and only replays when strictly greater (`server/index.js:538-541`).
* **RemediationParadigm:** Reconcile by max sequence, not array length; always replay from the authoritative log up to the highest known sequence and treat the snapshot purely as a replay checkpoint.

### Issue #26: Idempotency receipts have no TTL and replay indefinitely
* **Category:** C
* **SystemicImpact:** A reused idempotency key returns the original cached response forever (no expiry), and receipts accumulate in memory; a client that reuses keys across logically different attempts can get misleading replays.
* **TechnicalBreakdown:** Receipts are stored with `createdAt` but never expired or pruned (`server/index.js:2373-2377`); replay returns `cloneJson(receipt.response)` unconditionally on fingerprint match (`:2314-2316`).
* **RemediationParadigm:** Add a TTL and size bound to receipts, persist them durably, and document idempotency-key lifetime to clients.

### Issue #27: Settlement date parsing trusts `Date.parse`, which can flip outcomes
* **Category:** C
* **SystemicImpact:** Time-on-market settlement derives days from free-form date strings via `Date.parse`; ambiguous formats or timezone boundaries can change the computed day count and therefore the winning side and payouts.
* **TechnicalBreakdown:** `daysBetweenDates` uses `new Date(value)` (`server/index.js:772-780`) on `listed_at`/`contract_at` from the request (`validateSettlePayload`, `:995-1007`) with no strict format/timezone enforcement.
* **RemediationParadigm:** Require ISO-8601 dates, validate strictly, compute in UTC, and reject ambiguous inputs; surface the derived day count back to the host for confirmation before payout.

### Issue #28: Room codes use `Math.random` and collision-check only against live memory
* **Category:** C
* **SystemicImpact:** A regenerated code can collide with a persisted-but-not-yet-loaded room or a room on another node, and codes are not cryptographically unpredictable — enabling both accidental collisions and enumeration.
* **TechnicalBreakdown:** `generateRoomCode` loops on `Math.random()` and checks only `rooms[code]` (`server/index.js:272-279`), not the persistence layer or other instances.
* **RemediationParadigm:** Use a CSPRNG, check uniqueness against the durable store, and reserve the code transactionally on creation.

### Issue #29: Settlement flips `settled=true` before format-specific math that can throw
* **Category:** C
* **SystemicImpact:** For non-binary formats, settlement marks the room settled and locks it *before* computing the winning outcome; a bad config or input throws after the room is already in a settled-but-unpaid state, leaving it stuck.
* **TechnicalBreakdown:** `settle` sets `room.settled = true` and phase=settled (`server/index.js:2414-2419`) before `winningOutcomeForRoom`, which throws on invalid config/inputs for yield/time/renovation/momentum/range formats (`server/roomMarketRuntime.js:342-398`).
* **RemediationParadigm:** Compute and validate the winning outcome and metrics first; only mutate room state (settled/phase/payouts) inside a single all-or-nothing step after validation succeeds.

### Issue #30: Naive tag-stripping sanitizer leaks on non-React render paths
* **Category:** C
* **SystemicImpact:** `sanitizeText` strips only `<...>` patterns; malformed/unclosed payloads survive. React escaping saves the in-app UI, but any export, webhook, PDF, or projector path that renders raw text is exposed to injection.
* **TechnicalBreakdown:** `sanitizeText` does `value.trim().replace(/<[^>]*>/g, '')` (`server/index.js:715-719`); reasons/nicknames flow into broadcasts, activity, and outbound alert webhooks.
* **RemediationParadigm:** Treat stored text as untrusted data, not pre-sanitized HTML. Escape/encode at each output boundary (HTML, JSON, webhook) and use a real sanitizer if HTML is ever rendered.

---

## Category D — Security Posture, Data Leakage & Zero-Trust Violations

### Issue #31: Agent/broker PII and precise geolocation shipped to every client
* **Category:** D
* **SystemicImpact:** This is a real privacy/compliance defect, not a hypothetical. Every browser downloads named agents' phone numbers, license numbers, buyer-agent identities, and exact lat/long for 50 properties. Scraped third-party PII redistributed at scale invites takedowns and regulatory exposure.
* **TechnicalBreakdown:** `public/data/properties.json` is byte-identical to the raw scrape `dataset_zillow-detail-scraper_2026-02-07_22-23-08-493.json` (both 7,871,542 bytes). Verified contents: `attributionInfo.agentName: "Grant Villeneuve"`, `agentPhoneNumber: "650-906-0192"`, `agentLicenseNumber`, `buyerAgentName`, plus `latitude/longitude` and 166 keys/object. Served statically and read by `server/propertySnapshot.js`.
* **RemediationParadigm:** Build a minimal projection (address, price, beds/baths/sqft, coarse geo, your own derived fields) at ingest; never ship the raw scrape. Remove the raw dataset from git history, and confirm licensing/ToS for any retained third-party data.

### Issue #32: Unauthenticated full room state read (BOLA / info disclosure)
* **Category:** D
* **SystemicImpact:** Anyone who knows a 4-char code reads every participant's nickname, balance, full bet history, and free-text reasons — with no auth and no rate limit. Codes are enumerable, so this is mass-surveillable.
* **TechnicalBreakdown:** `GET /api/rooms/:code/state` has no auth middleware and no `limitRequests` (`server/index.js:2173-2178`) and returns `players` with `bets`/`reason` via `getRoomStatePayload` (`:1305-1327`). `/leaderboard` is likewise open (`:2517-2523`).
* **RemediationParadigm:** Gate state reads behind room membership (the signed identity you already issue) or return a redacted public projection (aggregate market only) to non-members; rate-limit the endpoint.

### Issue #33: WebSocket stream has no authentication
* **Category:** D
* **SystemicImpact:** The realtime feed (all bets, joins, settlements, reasons) is readable by anyone who connects with a known room code — same disclosure as #32, but live and continuous.
* **TechnicalBreakdown:** `wss` connection handler only validates that the room exists (`server/index.js:2715-2727`); no token is checked on upgrade.
* **RemediationParadigm:** Authenticate the WS upgrade (signed identity in a subprotocol/cookie/query), bind the socket to a session, and broadcast member-appropriate payloads.

### Issue #34: No Content-Security-Policy and no HSTS
* **Category:** D
* **SystemicImpact:** XSS defense rests entirely on React escaping plus a naive sanitizer (#30); a single injection sink becomes fully exploitable, and there's no transport-security pin. This is the difference between "bug" and "account/host takeover."
* **TechnicalBreakdown:** `SECURITY_HEADERS` sets only `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (`server/index.js:71-84`). Confirmed: no `Content-Security-Policy`, no `Strict-Transport-Security`.
* **RemediationParadigm:** Add a strict CSP (nonce-based, no inline where possible — note current code uses inline `<style>` and inline style objects, so plan a nonce/hash strategy), HSTS, and `frame-ancestors`. Wire via `helmet`.

### Issue #35: No CSRF/Origin enforcement on unauthenticated state-changing routes
* **Category:** D
* **SystemicImpact:** Bet/join/phase endpoints accept POSTs without verifying request origin; an attacker page can drive actions for the unauthenticated paths, and there's no SameSite/Origin gate.
* **TechnicalBreakdown:** Routes parse JSON bodies and act without Origin/Referer checks (`server/index.js:2096`, `:2287`, `:2239`); auth is only enforced when a user token is *present* (`requireMatchingUserIdentity` returns true when no token, `:1218`). No CORS/Origin handling (confirmed).
* **RemediationParadigm:** Require the signed identity on all mutations (close the "no token ⇒ allowed" gap), validate `Origin` for browser requests, and set cookies (if any) `SameSite=strict`.

### Issue #36: Default identity HMAC secret makes tokens forgeable if unset
* **Category:** D
* **SystemicImpact:** If `FAIRVALUE_IDENTITY_SECRET` is not set in production, all user/host identity tokens are signed with a hardcoded constant — anyone can forge any user/host identity and seize host control or impersonate players.
* **TechnicalBreakdown:** `DEFAULT_IDENTITY_SECRET = 'fairvalue-local-dev-identity-secret'` (`server/index.js:99`); `getIdentitySecret` falls back to it (`:726-728`); tokens are `HMAC-SHA256` over this (`signUserId`, `:734-739`).
* **RemediationParadigm:** Fail closed: refuse to start in production without a strong configured secret. Add a readiness check that asserts the secret is non-default.

### Issue #37: Host authority is a bearer token in localStorage (XSS-hijackable)
* **Category:** D
* **SystemicImpact:** The host token grants settle/lock/AI control. Stored in `localStorage`, it's readable by any XSS and persists on shared devices — turning any script injection (see #30/#34) into full room control.
* **TechnicalBreakdown:** `saveHostToken` writes the raw token to `sessionStorage` and `localStorage` (`src/lib/fairValueAuth.ts:24-33`); it's read and sent as a header (`readHostToken`, `buildHostAuthHeaders`).
* **RemediationParadigm:** Prefer the signed identity path (`hostUserId`) over a long-lived bearer token; if a token is needed, scope it tightly, rotate it, and keep it out of `localStorage` (memory or httpOnly cookie).

### Issue #38: Room codes are guessable and enumeration is unthrottled
* **Category:** D
* **SystemicImpact:** 36^4 ≈ 1.68M codes generated with `Math.random` and no rate limit on `/state` means active rooms can be discovered by scanning, then surveilled via #32/#33.
* **TechnicalBreakdown:** Code alphabet/length (`server/index.js:100-101`), `Math.random` generation (`:276`), and an unauthenticated, unthrottled `/state` (`:2173`).
* **RemediationParadigm:** CSPRNG codes, membership-gated reads, and per-IP throttling on lookups; consider longer codes or a join token separate from the display code.

### Issue #39: Settlement evidence/verification is optional by default
* **Category:** D
* **SystemicImpact:** The "provably fair" story degrades to unsigned local digests unless an operator sets a secret, so the public verification artifact can't actually be trusted to detect tampering by default.
* **TechnicalBreakdown:** Public verification signing depends on `FAIRVALUE_PUBLIC_VERIFICATION_SECRET`; unset → deterministic *unsigned* digests (`.env.example:91-93`, consumed in `server/publicVerification.js`). Settlement accepts host-provided values directly (`server/index.js:2421-2442`).
* **RemediationParadigm:** Make signed verification mandatory (fail closed without a secret), and require evidence that an independent party can re-check.

### Issue #40: Outbound integration surface invites SSRF / data exfiltration
* **Category:** D
* **SystemicImpact:** Several env-configured URLs are fetched server-side, and the Cognee proxy forwards a client-supplied `output_path` into the upstream path; loose validation here can become SSRF or leak room data to attacker-controlled endpoints.
* **TechnicalBreakdown:** `/api/ai/cognee/visualize` interpolates `req.query.output_path` into the upstream path (`server/index.js:2056-2064`); alert webhook only enforces https "outside localhost" (`.env.example:54-58`); intelligence/evidence provider URLs are fetched server-to-server (`:248-262`).
* **RemediationParadigm:** Allowlist outbound hosts, validate/encode all forwarded path/query params, enforce https everywhere, block private IP ranges, and add timeouts/size caps on outbound fetches.

---

## Category E — Observability, Maintainability & Technical Decay

### Issue #41: No database schema migrations for core tables
* **Category:** E
* **SystemicImpact:** `markets`, `market_state`, and `trades` are written by the app but never created by it (only `fairvalue_room_*` self-create). Fresh deploys break unless someone manually provisions schema out-of-band — the exact thing an autonomous operator can't do.
* **TechnicalBreakdown:** Confirmed: no `CREATE TABLE` for `markets`/`market_state`/`trades` anywhere in `server/`. They're inserted in `seed.js` and `server/index.js:1123-1133`, `:2334`, but only `fairvalue_room_snapshots`/`fairvalue_room_events` have `ensureSchema` (`roomPersistence.js:300`, `roomEventLog.js:308`).
* **RemediationParadigm:** Adopt a migration tool (node-pg-migrate / Drizzle / Prisma) with versioned, checked-in migrations run on deploy; remove implicit schema assumptions.

### Issue #42: Event log has no snapshotting/compaction
* **Category:** E
* **SystemicImpact:** Events grow unbounded per room with no checkpoint, so replay cost and memory rise forever (compounding #2/#3). Eventually long-running rooms become slow to read and expensive to store.
* **TechnicalBreakdown:** `replayRoomEvents` folds the full list every time (`server/roomEventLog.js:574-651`); there is no periodic materialized checkpoint event or log truncation.
* **RemediationParadigm:** Periodically emit a compacted "state checkpoint" event and replay only events after the latest checkpoint; archive old segments.

### Issue #43: In-memory leaks: idempotency receipts and rate-limit buckets
* **Category:** E
* **SystemicImpact:** Memory grows with traffic and never fully reclaims, risking slow OOM in long-lived processes — and silently weakening guarantees on restart.
* **TechnicalBreakdown:** `betReceipts` is never pruned (confirmed — no delete/TTL anywhere in `server/`); `rateLimitBuckets` is pruned only when `size >= 5000` and only removes already-expired entries (`server/index.js:897-902`).
* **RemediationParadigm:** TTL + max-size eviction (LRU) on both; better, externalize to a store with native expiry (Redis).

### Issue #44: Metrics are process-local counters, not exportable time series
* **Category:** E
* **SystemicImpact:** All observability resets on restart and represents only one instance; latency is count/total/max (no percentiles), so you cannot see p95/p99 or aggregate across nodes — blind exactly when scaling.
* **TechnicalBreakdown:** `observability` holds an in-memory `DEFAULT_STATE` (`server/observability.js:1-60`) reset by `state = DEFAULT_STATE()`. A `/metrics` Prometheus text endpoint exists (`server/index.js:1658-1663`) but data is still per-process and unhistogrammed.
* **RemediationParadigm:** Emit to a real metrics backend with histograms (Prometheus client with summaries/histograms, or OTel), and scrape per-instance so aggregation is the backend's job.

### Issue #45: One 2,810-line module blocks safe automated maintenance
* **Category:** E
* **SystemicImpact:** The decade goal is autonomous-agent maintainability; a single high-coupling file is the prime obstacle, since safe automated edits require small, well-bounded units with local tests.
* **TechnicalBreakdown:** `server/index.js` (2,810 lines) — see #9.
* **RemediationParadigm:** Modularize (see #9) and add module-level unit tests so an agent can change one concern with a bounded blast radius and fast feedback.

### Issue #46: Duplicated/parallel math modules and hand-synced type contracts
* **Category:** E
* **SystemicImpact:** `lmsr.ts`, `marketEngine.js`, and `multiOutcomeMarketEngine.js` plus manually maintained `src/types` mean the client/server contract is enforced by discipline, not types — a classic drift source.
* **TechnicalBreakdown:** Mixed `.ts/.jsx/.js` (per `CLAUDE.md`); duplicate LMSR (#6); server imports the `.js` engine while client imports the `.ts` one; WS message shapes typed only on the client (`src/types/index.ts`).
* **RemediationParadigm:** Single shared, typed core for market math and message schemas (e.g., zod schemas shared by client and server); generate types from one source.

### Issue #47: Legacy identity and shipped dead/prototype code
* **Category:** E
* **SystemicImpact:** Confusing provenance and dead paths slow every future contributor (human or agent) and inflate the bundle/repo.
* **TechnicalBreakdown:** Package name is `mission-betting` (`package.json:2`); the client `src/lib/botEngine.ts` duplicates AI logic now owned by the server (`server/index.js:433-518`); the Python prototype `sean/` and a `docs-html/` mirror are committed.
* **RemediationParadigm:** Rename the package, delete superseded client bot code (or clearly mark it a local-only demo), and move prototype/docs mirrors out of the app repo or behind a clearly separated folder excluded from builds.

### Issue #48: Large data blobs duplicated in git and the shipped bundle
* **Category:** E
* **SystemicImpact:** Two identical ~7.87 MB JSON files live in the repo and one is shipped to clients; clones are bloated and there's no data pipeline/versioning, so data updates are manual file swaps.
* **TechnicalBreakdown:** `dataset_zillow-...json` and `public/data/properties.json` are byte-identical (verified, 7,871,542 bytes each). No ingest/transform pipeline.
* **RemediationParadigm:** Keep raw data out of git (object storage + checksum manifest — note a `property-data-manifest` script already exists), generate a slim shipped projection (ties to #31), and version the dataset.

### Issue #49: No distributed tracing or log aggregation
* **Category:** E
* **SystemicImpact:** Requests carry a `request_id` to stdout JSON lines, but it isn't propagated into WS/AI/persistence work and there's no aggregation/trace view — so diagnosing a cross-component incident means grepping one box's console.
* **TechnicalBreakdown:** Request logging is `console.info/error` of a JSON line (`server/index.js:1352-1373`); errors elsewhere go to `console.error` (e.g., `:1337`, `:2535`). No trace context propagation.
* **RemediationParadigm:** Adopt OpenTelemetry: propagate trace/span context across HTTP→WS→AI→DB, ship to a collector, and correlate logs by trace id.

### Issue #50: Shallow readiness lets a degraded server serve while dropping durability
* **Category:** E
* **SystemicImpact:** With no `DATABASE_URL`, the app boots in "degraded mode" and serves traffic while silently failing to persist SQL trades/charts; the only signal is a counter, so data loss can run unnoticed.
* **TechnicalBreakdown:** `db.js` returns a stub that throws on use and warns once (`server/db.js:4-16`); SQL routes catch and log (`server/index.js:1331-1340`, `:2533-2537`); `durability_failures` is a counter with no alert (`:399`, `:418`).
* **RemediationParadigm:** Make degraded mode explicit and loud: reflect it in `/readyz` severity, alert on `durability_failures`/`persistence.failures`, and let operators choose fail-closed for persistence-critical deployments.

---

# Phase 2 — 10-Year Strategic Blueprint

The brief's epoch names are kept; the content is translated into engineering an operator would actually fund. The honest throughline: **the durable event log is the project's best asset — lean on it. Most "scale to the edge" value comes from making that log the single source of truth and removing the in-process bottlenecks (#1–#3) and the genuine security/data defects (#31–#39) first.**

## Years 1–2: Foundation Remediation & Decoupling

**Quarter 1 — stop the bleeding (the 3 real blockers + cheap wins):**
- Ship a slim property projection; purge raw PII scrape from bundle and git history (**#31, #48**).
- Gate room reads + WS on the signed identity; fail-closed on the default identity secret (**#32, #33, #36**).
- Add `helmet` (CSP nonce strategy, HSTS), Origin checks, close the "no token ⇒ allowed" gap (**#34, #35**).

**Quarters 2–4 — decouple state from process:**
- Make the event log the single system of record; derive SQL/chart projections asynchronously (**#4, #12**). Add migrations (**#41**).
- Serve room reads from the materialized read model, not per-request replay; add replay checkpoints/compaction (**#3, #42**).
- Per-room (not global) write queues; per-room snapshot deltas instead of whole-file rewrites (**#2, #8**).

**Year 2 — make a node stateless:**
- Externalize live room state + pub/sub fan-out (Redis/NATS or a managed WS gateway); externalize rate limits + idempotency (**#1, #10, #43**).
- Modularize `server/index.js` into bounded services with unit tests (**#9, #45**); unify market math + message schemas into one typed core (**#6, #46**).
- Integer-cents money; outcome-validate-before-mutate settlement (**#22, #29**).
- Outcome: horizontally scalable, no single-process ceiling, durable-by-default, and the high-severity security gaps closed.

## Years 3–5: Cognitive Automation & Edge Migration

- **Read-path to the edge:** push the public read model (aggregate market state, projections) to edge caches/CDN with event-driven invalidation; keep writes in regional cores. "Edge-native" applies to reads and static projections, not to authoritative LMSR mutations (which need a consistent writer per market).
- **Per-market consistency:** model each market as a single-writer aggregate (actor/partition) so trades serialize per market while markets scale out horizontally — the principled version of today's accidental single-process serialization.
- **Observability maturity:** OpenTelemetry tracing across HTTP→WS→AI→DB, histogram metrics with p95/p99, log aggregation, and alerting on durability/persistence failures (**#44, #49, #50**).
- **Trust & settlement:** mandatory signed verification artifacts and independent settlement evidence (oracle/data-feed or N-of-M operator approval) (**#5, #39**); strict, allowlisted, SSRF-hardened integrations (**#40**).
- **Predictive caching** only where it pays: prefetch property projections and likely-joined rooms; this is a read-model optimization, not a rewrite.

## Years 6–10: The Sovereign Autonomous Era

Framed soberly: "self-healing" here means **strong invariants + automated guardrails**, not literally autonomous code rewrites of financial logic.
- **Invariant-guarded self-healing:** continuous replay-integrity checks (the mechanism already exists, `replayIntegrity.js`) gate automated recovery — rehydrate/repair a room only when the event log proves consistency; quarantine and alert otherwise.
- **Automated load-shedding:** per-market backpressure and graceful degradation (shed simulation/AI first, then non-member reads) driven by the histogram SLOs from the prior epoch.
- **Agent-maintainable surface:** the modular services + shared typed schemas + dense tests from Years 1–2 are what make safe automated changes possible; expand contract tests and property-based tests around the market core so an agent's change is provably non-regressive before merge.
- **Zero-downtime structural migration:** because the event log is the source of truth and projections are derived, schema/format changes become "add a new projection + replay," not destructive migrations.

**Bottom line:** the fastest path to the ambitious end-state is unglamorous — externalize state, make the event log authoritative, fix the three real security/data defects, and add real observability. Everything labeled "sovereign/edge/autonomous" is reachable only on that foundation, and most of its value is captured in Years 1–2.
