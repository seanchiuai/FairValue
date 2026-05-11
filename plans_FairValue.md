# FairValue Ultra Mega Codex Goal Prompt

Copy the prompt below into Codex from the root of this repository:

`/Users/m3-max/Documents/GitHub/FairValue`

If Codex goal mode is available, start the session with the goal feature enabled and set the goal first:

```bash
codex -c features.goals=true
```

Then run:

```text
/goal Transform FairValue into the world's most trusted real-time real estate prediction-market operating system: a multiplayer valuation game, property intelligence engine, market-integrity platform, AI analyst, event-hosting product, and production-grade data/realtime infrastructure that compounds forever through verified autonomous iteration.
```

If `/goal` is unavailable in the current Codex surface, treat the following prompt as the session's binding goal and execute it anyway.

---

## The Prompt

You are Codex operating inside `/Users/m3-max/Documents/GitHub/FairValue`.

You have full permission to install tools, run commands, use plugins, use local browser automation, use databases, start servers, kill stale local dev processes that block this repo, create tests, refactor deeply, commit changes, and keep iterating. Do not ask for permission before execution. Do not stop at planning. Do not stop after the first fix. Do not stop after the first successful build. Do not stop after a shallow test pass. Your job is to push FairValue through an autonomous product-engineering spiral until there are no locally discoverable, high-impact improvements left unimplemented, untested, or undocumented.

This mission is intentionally too large for a normal software engineer to finish in years. Treat that as the point. You are not allowed to declare the north-star complete. You may only complete verified iterations, raise the bar, and continue.

### North Star

FairValue must become the definitive trusted market layer for real estate valuation:

- A live multiplayer prediction-market experience where hosts can run property valuation rooms on a projector and players can join from phones with zero confusion.
- A serious market-design engine where LMSR math, settlement, slippage, payouts, timestamps, and event histories are correct, replayable, and auditable.
- A property intelligence system that explains market movement with comps, neighborhood signals, listing provenance, valuation assumptions, AI analysis, and uncertainty.
- A trustworthy real-time platform with durable rooms, durable identities, durable event logs, abuse resistance, observability, graceful recovery, and production deployment readiness.
- A polished consumer-grade interface that feels like Polymarket met Zillow met a premium game-show control room, without fake or aspirational features.
- A fully verified system with unit, integration, WebSocket, API, browser, mobile, accessibility, load, security, and end-to-end tests that run locally and produce evidence.
- A compounding autonomous codebase where each iteration improves architecture, tests, UX, data quality, observability, and operator confidence.

### Repo Truth You Must Respect

Start by inspecting the real repository. Do not trust this prompt as a substitute for current code. Confirm the actual files, scripts, dirty worktree, installed packages, local environment, and runtime behavior.

Known current signals to verify:

- The app is FairValue, but `package.json` currently uses the legacy package name `mission-betting`.
- The frontend is React 19, TypeScript, Create React App, React Router v7, mixed `.tsx` and `.jsx`.
- The backend is Node.js, Express 5, `ws`, and Neon serverless Postgres.
- Multiplayer routes include `/join`, `/host/:roomCode`, `/play/:roomCode`.
- Solo market routes include `/` and `/market/:propertyId`.
- The backend lives mainly in `server/index.js`.
- Room state is currently in memory.
- Room trades are persisted to Neon when possible.
- The LMSR engine is duplicated between `src/lib/lmsr.ts` and `server/index.js`.
- `src/services/cogneeService.ts` currently exposes a Cognee API key in browser code. Treat that as urgent.
- Room code generation allows `A-Z0-9`, while join validation has historically accepted only four letters. Verify and fix if still true.
- Tests currently cover LMSR, bot behavior, and a shallow page render. The real multiplayer system needs much more coverage.
- `CLAUDE.md` says to commit changes. Commit intentionally and keep commits scoped.

### Operating Contract

You are an autonomous senior product engineer, platform engineer, test engineer, designer, security reviewer, and release manager in one loop.

Follow this contract:

- Read the repo before changing it.
- Preserve unrelated user changes.
- Prefer existing local patterns when they are good enough.
- Remove fake or unsupported features instead of polishing illusions.
- Treat exposed secrets, unauthenticated privileged actions, state divergence, data loss, and untested multiplayer behavior as critical.
- Make code changes directly.
- Run the app locally whenever the change affects runtime behavior.
- Use browser automation for user-facing flows.
- Add tests around every behavioral improvement.
- Update docs when architecture, setup, commands, or product behavior changes.
- Commit verified changes in meaningful slices.
- Keep a durable iteration ledger so a future session can resume without rediscovery.
- If blocked by missing credentials or external services, build deterministic local fakes, adapters, or test seams and continue improving everything not blocked.

### The Infinite Improvement Spiral

You must run this loop continuously:

1. Inspect
2. Prioritize
3. Implement
4. Verify
5. Harden
6. Document
7. Commit
8. Re-scan
9. Raise the bar
10. Repeat

Do not exit the loop merely because one task is done. The next loop begins immediately after the previous loop's evidence is captured.

You may only pause after recording:

- What was completed.
- What evidence proves it.
- What remains.
- The next highest-leverage target.
- The exact command a future Codex session should run to resume.

When the backlog is empty, generate a harsher backlog from runtime evidence, code smells, missing tests, UX gaps, accessibility gaps, performance traces, product strategy gaps, security review, observability gaps, and deployment gaps. Then continue.

When tests pass, add harder tests.

When the app boots, test deeper flows.

When flows pass once, test concurrency, reconnects, mobile viewports, failed network calls, malicious payloads, slow database responses, and restart recovery.

When the UI looks acceptable, make it faster, clearer, more accessible, more responsive, and more trustworthy.

When the architecture is cleaner, remove more duplication, create sharper boundaries, and prove the boundaries with contracts.

When a feature works locally, add evidence that it will survive production-like conditions.

This is not a brainstorming loop. Every loop must ship code, tests, docs, or measured runtime proof.

### Required Iteration Ledger

Create and maintain:

```text
FAIRVALUE_AUTONOMY_LEDGER.md
```

The ledger must include:

- Current north-star goal.
- Current runtime status.
- Current test status.
- Current known risks.
- Current backlog ranked by impact.
- Iteration history with timestamps.
- Commands run and results.
- Screens/routes verified.
- Screenshots or trace paths when generated.
- Commits made.
- Next action queue.

Update the ledger at the end of every loop. If context is running low, update the ledger before doing anything else.

### First Hour Protocol

Do this immediately:

1. Read `README.md`, `CLAUDE.md`, `IMPROVEMENT_BACKLOG.md`, `HACKATHON_PROGRESS.md`, `package.json`, `server/index.js`, `server/db.js`, `src/App.tsx`, `src/hooks/useRoom.ts`, `src/hooks/useWebSocket.ts`, `src/lib/lmsr.ts`, `src/services/cogneeService.ts`, and the existing tests.
2. Run `git status --short --branch`.
3. Run dependency and script discovery.
4. Run the fastest available tests in non-watch mode.
5. Run a production build.
6. Start backend and frontend locally.
7. Verify with HTTP checks that frontend and backend respond.
8. Use browser automation to open `/`, `/join`, `/host/:roomCode`, `/play/:roomCode`, and `/market/:propertyId` where possible.
9. Create a two-player room locally through the real API and browser surfaces.
10. Place bets from two simulated players.
11. Verify chart, leaderboard, activity feed, balances, and settlement.
12. Record every failure in `FAIRVALUE_AUTONOMY_LEDGER.md`.
13. Fix the highest-severity failure first.

### Critical Fixes That Must Be Attacked Early

Do not spend days polishing while these are still broken.

#### 1. Secret Boundary

Move Cognee and any other secret-bearing integration behind the server.

Requirements:

- No API key in browser-shipped code.
- Server reads secrets from environment variables.
- Client calls local API routes.
- Missing secret produces a graceful degraded AI state.
- Add `.env.example`.
- Add tests proving no secret literal remains in `src`.
- Add docs for configuring AI locally.
- If a real key was committed, add a prominent rotation note in the ledger and docs. Do not print the full secret in logs.

#### 2. Room Code Contract

Make room code generation, display, join validation, API behavior, and tests agree.

Requirements:

- Decide either `A-Z` only or `A-Z0-9`.
- Enforce the same schema everywhere.
- Make the UI copy match reality.
- Add tests for generated code, lowercase input normalization, invalid input, nonexistent rooms, and successful join.
- Verify through browser flow.

#### 3. Server Authority

Make the server authoritative for multiplayer market state.

Requirements:

- Remove unsafe client-side assumptions in betting.
- Optimistic UI may exist only with exact rollback and server reconciliation.
- Add idempotency keys for bets.
- Add payload validation.
- Add server-side rate limits for join, bet, settle, toggle AI, and AI endpoints.
- Add correlation IDs for request logs.
- Add tests for concurrent bets and duplicate submissions.

#### 4. Host Authority

Protect host-only actions.

Requirements:

- Create a host token or equivalent room capability on room creation.
- Require it for settlement, AI toggles, phase controls, and future admin actions.
- Store it safely client-side for the host.
- Do not expose it to players.
- Add tests proving a player cannot settle or toggle AI.
- Verify manually through browser/API.

#### 5. Durable Room Event Log

Create an append-only event model.

Requirements:

- Joins, leaves, bets, AI trades, phase changes, settlement, reconnects, and errors should be representable as events.
- Use the event log as the basis for replay, recovery, audit, and support.
- If Neon is unavailable locally, provide a deterministic local adapter or in-memory test implementation.
- Add tests for event ordering, replay state, and settlement reconstruction.

#### 6. Unified Market Engine

Unify LMSR and market-domain logic.

Requirements:

- One shared implementation for LMSR math.
- One canonical market state shape.
- Tests for numerical stability, extreme values, invalid inputs, budget buys, slippage, payout math, and settlement.
- Server and frontend import through an intentional boundary instead of copying formulas.
- Remove duplicated math once the shared path is proven.

#### 7. Full E2E Harness

Add real end-to-end tests.

Requirements:

- Install Playwright if missing.
- Add deterministic seed data.
- Start backend and frontend inside test setup or document a one-command test runner.
- Cover host creates room.
- Cover player joins by room code.
- Cover second player joins.
- Cover both players place bets.
- Cover leaderboard updates.
- Cover activity feed updates.
- Cover AI toggle if enabled.
- Cover settlement.
- Cover reconnect or refresh.
- Cover mobile viewport for player.
- Cover desktop viewport for host.
- Capture traces/screenshots/videos on failure.
- Make `npm run test:e2e` or equivalent work.

### Product Expansion Mandate

After critical risks are under control, build toward the years-long vision.

#### Host Command Center

Turn `/host/:roomCode` into a real operator cockpit:

- Room phase controls: setup, open betting, locked, reveal, settled.
- Live player roster with presence and connection status.
- QR and short-link sharing with clear network mode.
- Market probability chart with true event timestamps.
- Recent trade tape with confidence-building details.
- Leaderboard, P&L, and settlement preview.
- AI bot controls with clear state and safeguards.
- Support/debug panel for host-only diagnostics.
- Replay export after settlement.

#### Player Experience

Turn `/play/:roomCode` into a mobile-first betting experience:

- Fast nickname join.
- Clear balance and position.
- Over/under choice with pre-bet preview.
- Slippage, probability movement, and potential payout before submit.
- Confirmation state and rollback on failure.
- Reconnect recovery.
- Settled result with personal outcome.
- Haptics-safe, thumb-friendly layout.
- Accessibility labels and keyboard support.

#### Solo Markets

Make `/` and `/market/:propertyId` worth returning to:

- Queryable and paginated markets.
- Geography filters.
- Status filters.
- Property cards with asking price, implied fair value, probability, trend, data freshness, and provenance.
- Market detail pages with comps, charts, history, AI analysis, and risk notes.
- No blocking full-dataset load for future scale.
- Map performance improvements with clustering and viewport filtering.

#### Property Intelligence

Build a property data layer worthy of trust:

- Canonical property schema.
- Data provenance.
- Data freshness.
- Comps.
- Neighborhood signals.
- Rent yield estimates.
- Tax and ownership context where available.
- Image provenance.
- Manual override and moderation path.
- Import pipeline with validation.
- Replayable seed fixtures.

#### AI Analyst

Make AI useful and bounded:

- Server-side AI calls only.
- Citations for claims.
- Clear uncertainty and limitations.
- Market movement explanation.
- Property comp summaries.
- Host moderation controls.
- Per-market memory that does not leak secrets.
- Deterministic test doubles.
- Cost controls and logging.

#### Accounts and Growth

Build retention mechanics:

- Durable user identity.
- Player history.
- Host history.
- Shareable settlement recaps.
- Persistent leaderboards.
- Streaks and seasons.
- Invite/referral loops.
- Notifications for room invites and settlement.
- Public/private/invite-only rooms.

#### Admin and Operations

Build the internal surface:

- Admin room search.
- Event replay.
- Suspicious behavior detection.
- AI output moderation.
- Failed integration diagnostics.
- Market status management.
- Property moderation.
- Support timeline export.

#### Observability

Make failures visible:

- Structured logs.
- Request IDs.
- WebSocket connection metrics.
- Room lifecycle metrics.
- Bet latency.
- Settlement latency.
- AI call latency and cost.
- Database error rates.
- Client error reporting.
- Local observability dashboard or documented metrics sink.

#### Security and Abuse Resistance

Harden the product:

- Input schemas for every API route.
- Auth/capability checks.
- Rate limiting.
- Idempotency.
- Anti-spam room joins.
- Bet abuse protections.
- Secret scanning.
- Dependency audit.
- No sensitive data in client bundles.
- No accidental real-money claims if the product is demo/simulation only.
- Clear trust and risk language in product copy.

#### Performance and Quality

Make it feel instant:

- Bundle budget.
- Route-level code splitting where appropriate.
- Lazy charts/maps/images.
- Efficient property data loading.
- Stable chart rendering.
- Reduced unnecessary re-renders.
- Mobile performance checks.
- Lighthouse or equivalent checks where useful.
- Accessibility checks.

### Testing Mandate

Every loop must expand or preserve automated proof.

Required test layers:

- Pure LMSR unit tests.
- Domain model tests.
- Validation tests.
- API route tests.
- WebSocket protocol tests.
- Concurrent betting tests.
- Idempotency tests.
- Host authorization tests.
- AI adapter tests with fake provider.
- Persistence adapter tests.
- React component tests for critical states.
- Browser E2E tests.
- Mobile E2E tests.
- Accessibility assertions.
- Build verification.
- Secret scanning.
- Dependency audit when practical.

Do not mark a feature complete unless there is proof.

Preferred command shape to create:

```bash
npm run verify
```

It should eventually run:

- Type checking.
- Linting.
- Unit tests.
- Integration tests.
- E2E tests.
- Build.
- Secret scan.
- Smoke boot.

If the current stack cannot support that immediately, build toward it. Add scripts as they become real.

### Browser Verification Mandate

After meaningful frontend or full-stack changes:

1. Start backend.
2. Start frontend.
3. Open the app in browser automation.
4. Verify the actual user path.
5. Check console errors.
6. Check network failures.
7. Check desktop and mobile viewport.
8. Capture screenshots or traces when useful.
9. Record proof in the ledger.

Minimum flows:

- `/` market browse.
- `/join` create room.
- Host room dashboard.
- Player join.
- Player bet.
- Two-player leaderboard.
- Settlement.
- Reconnect or refresh.
- Solo market detail.

### Commit Protocol

Commit all completed verified work.

Rules:

- Run `git status --short --branch` before staging.
- Do not stage unrelated user changes.
- Stage only files you intentionally changed.
- Use focused commits.
- Include test evidence in commit messages when useful.
- If a loop produces multiple independent changes, commit in multiple slices.
- Never use destructive git commands to wipe user work.
- After each commit, update the ledger with the commit hash.

### Refactor Protocol

Refactor aggressively only when it advances verification or product truth.

Good refactors:

- Extract shared LMSR/domain package.
- Split oversized route pages into state hooks and presentational components.
- Replace duplicated server/client market math.
- Create typed API contracts.
- Replace magic strings with schemas.
- Create persistence adapters.
- Create AI adapters.
- Isolate WebSocket protocol handling.
- Add test seams.

Bad refactors:

- Moving files without behavioral gain.
- Creating abstractions before tests.
- Re-skinning UI while secrets/auth/state are unsafe.
- Rewriting the stack just to rewrite the stack.

### Design Bar

FairValue should feel premium, trustworthy, and fast.

Design constraints:

- Keep the real product visible immediately. No empty landing page detours.
- Dark, market-native, real-estate-aware interface is acceptable, but avoid one-note color monotony.
- Use icons for clear tools and actions.
- Do not put explanatory marketing copy where functional controls should be.
- Mobile player flow must be thumb-friendly and uncluttered.
- Host dashboard should be dense but readable from a distance.
- Charts must be legible and tied to real data.
- Loading, empty, error, offline, reconnecting, and settled states must feel intentional.
- Text must not overflow or overlap.
- Accessibility is not optional.

### Data and Market Integrity Bar

FairValue cannot be trusted unless users understand what the numbers mean.

Build:

- A clear explanation of LMSR probability.
- A clear explanation of implied fair value.
- Visible data freshness.
- Visible market status.
- Visible settlement source.
- Replayable event history.
- Suspicious trading flags.
- Host settlement confirmation.
- Post-settlement recap.

### Production Readiness Bar

Eventually the app must be deployable.

Build toward:

- Environment validation.
- `.env.example`.
- Seed fixtures.
- Database migrations or documented schema setup.
- Health checks.
- Graceful shutdown.
- No crash on missing optional integrations.
- Durable rooms.
- Durable users.
- Durable events.
- Observability.
- Deployment docs.

### Anti-Stopping Conditions

You are not done if any of these are true:

- A route cannot be opened locally.
- The backend cannot boot.
- The frontend cannot build.
- A test is failing.
- There is no E2E coverage for the main multiplayer loop.
- A secret is present in browser code.
- Host-only actions are unauthenticated.
- Room state disappears on server restart without an intentional recovery story.
- Client and server can disagree about market truth.
- Room codes have inconsistent rules.
- Settlement can be manipulated by a player.
- AI output is uncited or secret-bearing.
- The app has fake features that imply unsupported capability.
- The ledger is stale.
- The next highest-impact task is obvious.

If any anti-stopping condition is true, continue the loop.

### Escalation Without Stopping

If you encounter an external blocker:

- Missing real API key.
- Missing database URL.
- Provider outage.
- Paid account required.
- Legal/business decision required.
- Deployment account unavailable.

Do not stop the whole mission. Record the blocker, build a local test double or adapter, add graceful degradation, write docs, and continue with the next unblocked high-impact task.

### The First Backlog To Burn Down

Start with this ordering unless repo inspection proves a different severity:

1. Secret boundary for Cognee and all client-exposed keys.
2. Room code schema consistency.
3. Server-side validation and rate limiting.
4. Host capability token.
5. API and WebSocket tests for room lifecycle.
6. Shared LMSR/domain engine.
7. E2E test harness for host/player/bet/settle.
8. Event log and replay model.
9. Idempotent betting.
10. Reconnect correctness.
11. Durable room persistence.
12. Better settlement workflow.
13. Browser-verified host command center improvements.
14. Browser-verified mobile player improvements.
15. AI analyst server adapter with citations and deterministic fake.
16. Property schema and seed validation.
17. Market browse scalability and filters.
18. Admin/replay support surface.
19. Observability and health checks.
20. One-command `npm run verify`.

After these are complete, generate the next 100-item backlog from evidence and continue.

### Output Discipline

During work:

- Keep user updates concise.
- Say what you are verifying, what failed, and what you are fixing.
- Do not over-explain routine commands.
- Do not claim success without command or browser evidence.

Final response is only allowed when a meaningful verified iteration is complete and committed. It must include:

- What changed.
- What tests passed.
- What browser/runtime paths were verified.
- What commit hash was created.
- What remains next.

But after final response, the mission is still not complete. The ledger must make the next loop obvious.

### Begin Now

Start by reading the repo and creating `FAIRVALUE_AUTONOMY_LEDGER.md`.

Then run the first verification pass.

Then fix the highest-severity issue.

Then test it end to end.

Then commit it.

Then update the ledger.

Then immediately start the next loop.

Do not wait for permission.

Do not stop at a plan.

Do not stop after one success.

Keep going.
