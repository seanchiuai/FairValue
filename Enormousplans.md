# FairValue Enormous Goal-Mode Prompt

This file is a deliberately huge, token-hungry Codex goal-mode prompt for pushing FairValue far beyond a hackathon app. It is written as one self-contained unit so it can be pasted into Codex from the repository root:

```text
/Users/m3-max/Documents/GitHub/FairValue
```

Recommended launch:

```bash
codex -c features.goals=true
```

Then set the goal:

```text
/goal Transform FairValue into the generative real-estate valuation operating system: a beautiful multiplayer prediction-market game, AI property-intelligence terminal, evidence-backed market studio, live event platform, durable realtime infrastructure layer, replayable audit system, and continuously improving product that feels like Polymarket, Zillow, Bloomberg Terminal, a game-show control room, and a generative AI analyst fused into one serious but delightful app.
```

If `/goal` is unavailable, treat everything below as the binding mission prompt and execute it anyway.

---

## The Prompt To Paste Into Codex

You are Codex working inside `/Users/m3-max/Documents/GitHub/FairValue`.

You have full permission to install missing tools, run commands, use local browser automation, use plugins, start and stop repo-local dev servers, patch files, add tests, refactor deeply, run verification, and commit scoped changes. Do not ask for permission before execution. Do not stop at planning. Do not stop after a single patch. Do not stop after the first green test. Do not stop because the scope is too large. This mission is intentionally larger than any one 12-hour session, and the point is to keep shipping verified product increments until the clock runs out.

You must act like a senior product engineer, design engineer, platform engineer, AI systems engineer, game designer, data engineer, QA engineer, accessibility reviewer, and release manager in one continuous loop.

Your output is not a memo. Your output is the improved repository.

## Core Mandate

FairValue must become a generative real-estate market operating system.

The current product is already a real-time multiplayer real estate prediction market. Players bet with simulated credits on whether a property will appraise or settle above or below an asking price. The app uses React, Vite, Express, WebSocket rooms, LMSR market mechanics, property data, AI analyst paths, durable room snapshots, host/player flows, trust notes, accessibility work, and a substantial verification stack.

Your job is to upscale it into something much bigger:

- A polished consumer app for browsing live property markets.
- A beautiful host command center for running live rooms on a projector.
- A fast mobile game-like betting surface for players.
- A generative Market Studio where a host can create a market from a property, address, pasted listing, CSV row, or natural-language description.
- An AI Analyst that produces evidence-backed valuation briefs, not generic chatbot fluff.
- A replayable prediction-market engine with event logs, market movement explanations, settlement evidence, and shareable recaps.
- A design system with coherent tokens, dense but elegant controls, responsive layouts, serious accessibility, and zero placeholder-feeling UI.
- A data platform that can grow from a static Zillow snapshot into refreshable ingestion, normalized properties, comps, neighborhoods, provenance, and queryable intelligence.
- A multi-format market engine that can eventually support over/under, ranges, ranked outcomes, confidence bands, rent-yield questions, renovation scenarios, neighborhood forecasts, and tournament-style events.
- A product that compounds: every iteration adds evidence, tests, docs, and a next-step ledger.

This is supposed to feel almost absurd in ambition. Treat it as a 10-year product roadmap compressed into an autonomous 12-hour execution sprint.

## Absolute Operating Rules

1. Start by inspecting the actual repo. Do not trust this prompt as a substitute for source truth.
2. Preserve unrelated user changes. Never revert files you did not intentionally modify.
3. Favor real implementation over aspirational copy.
4. Remove fake features instead of polishing illusions.
5. If a UI control appears usable, it must either work, be disabled with a clear reason, or be removed.
6. If a generative feature is introduced, it must have deterministic local fallback behavior and tests.
7. If external credentials are unavailable, build local adapters and fixture-backed paths so the product still improves.
8. Keep secrets server-side.
9. Keep simulated-credit and non-appraisal trust language intact on any surface that could look financial or authoritative.
10. Every meaningful behavior change needs tests or a documented reason why it cannot be tested locally.
11. Every user-facing flow change needs browser verification.
12. Every design-system change needs desktop and mobile visual inspection.
13. Every long-running loop must update `FAIRVALUE_AUTONOMY_LEDGER.md`.
14. Commit finished, verified slices intentionally. Keep commits scoped.
15. Do not end with "I planned." End with shipped code, proof, and a next target.

## Repo Truth To Re-Verify At Runtime

Before changing anything, re-check the repository. Expected current shape:

- Root: `/Users/m3-max/Documents/GitHub/FairValue`.
- App: FairValue, package name still likely `mission-betting`.
- Frontend: React 19, TypeScript, Vite, React Router, mixed `.tsx` and `.jsx`.
- Backend: Node.js, Express 5, `ws`, Neon/Postgres support, JSON room snapshots.
- Routes:
  - `/` browse markets.
  - `/join` create or join room.
  - `/host/:roomCode` host dashboard.
  - `/play/:roomCode` mobile player UI.
  - `/market/:propertyId` solo market detail.
- Core files:
  - `server/index.js`
  - `server/db.js`
  - `server/roomPersistence.js`
  - `server/roomEventLog.js`
  - `src/App.tsx`
  - `src/pages/Markets.jsx`
  - `src/pages/MarketPage.tsx`
  - `src/pages/JoinPage.tsx`
  - `src/pages/HostView.tsx`
  - `src/pages/PlayerView.tsx`
  - `src/lib/marketEngine.js`
  - `src/lib/lmsr.ts`
  - `src/services/cogneeService.ts`
  - `src/index.css`
  - `FAIRVALUE_AUTONOMY_LEDGER.md`
  - `IMPROVEMENT_BACKLOG.md`
  - `README.md`
  - `CLAUDE.md`
- Existing verification scripts may include:
  - `npm run verify`
  - `npm run typecheck`
  - `npm run test:server`
  - `npm test`
  - `npm run build`
  - `npm run smoke:boot`
  - `npm run test:e2e:isolated`
  - `npm run test:e2e:matrix`
  - `npm run test:e2e:restart`
  - `npm run test:e2e:restart:matrix`
  - `npm run test:e2e:soak`
  - `npm run test:e2e:browser-load`
  - `npm run test:e2e:mixed-traffic`
  - `npm run test:latency:restart`
  - `npm run test:performance:cold`
  - `npm run test:a11y:assistive`

Current known strategic context:

- The old backlog may mention issues that were later fixed. Re-check before acting.
- Client-shipped AI secret paths appear to have been hardened previously. Verify; do not assume.
- Room code contract appears to support `A-Z0-9`. Verify.
- Durable room snapshots, host auth, event logs, identity tokens, restart recovery, accessibility coverage, and AI degraded local fallback appear to exist. Verify.
- The UI still appears split between inline style objects, page CSS, glass tokens, and older dark-theme assumptions. This is a major opportunity.
- The product is functional, but it can become vastly more generative, more beautiful, more coherent, and more product-defining.

## The 12-Hour Execution Shape

You are not expected to finish the 10-year vision. You are expected to push the live repo as far as possible in 12 hours with decisive, verified increments.

Use this rhythm:

1. Inspect reality.
2. Pick the highest-leverage next slice.
3. Implement the slice.
4. Verify with tests and browser proof.
5. Update docs and `FAIRVALUE_AUTONOMY_LEDGER.md`.
6. Commit.
7. Re-scan and pick the next slice.

If a change takes too long, narrow it into a vertical slice that works end-to-end. A working small slice beats a giant half-finished architecture.

## First 45 Minutes Protocol

Immediately do the following:

1. Run file discovery with `rg --files`.
2. Read the repo docs: `README.md`, `CLAUDE.md`, `IMPROVEMENT_BACKLOG.md`, `HACKATHON_PROGRESS.md`, `FAIRVALUE_AUTONOMY_LEDGER.md`.
3. Read the key app surfaces: `Markets.jsx`, `MarketPage.tsx`, `JoinPage.tsx`, `HostView.tsx`, `PlayerView.tsx`, `index.css`.
4. Read the key backend/domain surfaces: `server/index.js`, `server/roomPersistence.js`, `server/roomEventLog.js`, `src/lib/marketEngine.js`, `src/lib/lmsr.ts`, `src/services/cogneeService.ts`.
5. Run a lightweight status check. If `git status` is slow, use narrower git commands and move on.
6. Run the fastest relevant tests first:
   - `npm run typecheck`
   - `npm test`
   - `npm run test:server`
7. Run `npm run build`.
8. Start the app locally if UI work is planned.
9. Open `/`, `/market/:propertyId`, `/join`, `/host/:roomCode`, and `/play/:roomCode` with browser automation where feasible.
10. Update `FAIRVALUE_AUTONOMY_LEDGER.md` with the actual baseline.

Only after that baseline should you make big edits.

## What "More Generative" Means Here

Do not interpret "generative" as sprinkling a chatbot into the app. Generative means the product can create useful market artifacts from messy real-world inputs.

Build toward these capabilities:

1. Generate a market from an address.
2. Generate a market from a pasted listing description.
3. Generate a market from a row of property data.
4. Generate a valuation thesis from property facts, comps, market state, and event history.
5. Generate questions and market formats from a property.
6. Generate scenario cards, such as "rate shock", "renovation", "rent yield", "school district", "insurance risk", "neighborhood momentum".
7. Generate a live host script for an event.
8. Generate player explanations in plain language before they bet.
9. Generate post-settlement recaps with evidence, charts, winners, and lessons.
10. Generate "why the market moved" summaries from the event log.
11. Generate ranked next-best markets for a user.
12. Generate operator alerts when a room behaves strangely.
13. Generate share cards and replay pages without leaking sensitive tokens.
14. Generate UI states from structured schemas, not hardcoded one-off markup.
15. Generate deterministic local fallback output when AI credentials are absent.

Every generative feature must have:

- A structured input contract.
- A structured output contract.
- A deterministic fixture/fallback path.
- Tests for success and degraded behavior.
- Clear limitations and provenance.
- UI that distinguishes generated analysis from verified facts.

## Massive Product North Star

Imagine FairValue in 10 years:

- A buyer can open a property and see a living market of what people think it is worth.
- A host can run a live valuation game at a dinner party, real estate event, classroom, investor meeting, or open house.
- A player can bet in 15 seconds from a phone and understand exactly what their bet means.
- A researcher can replay every market move and inspect the evidence behind it.
- A property analyst can generate a cited market memo in seconds.
- A neighborhood page can show market sentiment, comps, uncertainty, volatility, and event history.
- A room can become a shareable artifact with chart replay, leaderboard, settlement evidence, and AI recap.
- A data operator can import, normalize, validate, and refresh property feeds without editing code.
- The system can support new market templates without rewriting host/player pages.
- The UI feels unmistakably FairValue: premium, credible, fast, dense where useful, beautiful without decorative clutter, and built around real property imagery and market state.

This is not just "Zillow with bets." It is an interactive market layer for real estate belief.

## Visual Design Mandate

The UI must improve dramatically.

Do not create a marketing landing page. Build the usable product.

The first screen should be the actual product: market browse, map, featured market, live probability, filters, search, and clear entry to room hosting. Avoid generic hero copy.

Design principles:

- Real estate imagery is the visual anchor.
- Market movement is the emotional hook.
- Trust and provenance are always visible but not heavy-handed.
- Host surfaces should feel like a live command center.
- Player surfaces should feel like a mobile game controller.
- Analyst surfaces should feel like a compact research terminal.
- Browse surfaces should feel like Zillow plus Polymarket, not a generic SaaS dashboard.
- Cards should be tight, useful, and scannable.
- Charts should explain themselves.
- The map should feel like a market canvas, not an afterthought.
- Avoid one-note color palettes.
- Avoid huge rounded card soup.
- Avoid nested cards.
- Avoid fake metrics.
- Avoid visible explanatory text about how the UI works.
- Use icons for controls where appropriate, especially with `lucide-react`.
- Use real buttons, segmented controls, sliders, toggles, tabs, menus, and form controls.
- Make desktop dense and productive.
- Make mobile thumb-friendly and focused.
- Text must not overflow controls or overlap in mobile viewports.

### Design System Direction

Create or evolve a real FairValue design system:

- Tokens for color, typography, spacing, radius, border, shadow, z-index, motion.
- Component primitives for app shell, button, icon button, input, select, segmented control, tabs, panel, row, status pill, empty state, chart frame, data badge, trust note, drawer, modal, toast.
- A clear split between:
  - Product chrome.
  - Market data.
  - Property media.
  - AI/generated content.
  - Trust/provenance content.
  - Game/action controls.
- Fewer one-off inline styles in route files.
- More reusable, focused components.
- Strong responsive constraints.
- A11y states for errors, loading, disabled, focus, and announcements.

### Visual Identity Ideas

You may choose the final direction after inspecting the actual UI, but it should probably land somewhere near:

- Background: crisp, quiet, high-contrast light or neutral base, not a gloomy all-dark interface.
- Accents: market blue, appraisal green, risk red, settlement gold, map/neighborhood teal, without becoming a rainbow.
- Typography: system font is acceptable, but hierarchy must be sharper.
- Surfaces: thin borders, restrained shadows, purposeful translucent/glass only where it supports depth.
- Property media: larger, better cropped, real imagery first.
- Charts: use color with labels and contextual interpretation.
- Motion: subtle live market pulses, chart updates, bet confirmation, replay scrubber, reduced-motion support.

If the current `index.css` claims "iOS 26 Liquid Glass", either make that system real and coherent across surfaces or simplify it into a better FairValue-specific system.

## Major UI Surfaces To Reimagine

### 1. Market Browse `/`

Goal: the browse page should feel like a live market floor for properties.

Must support:

- Search by address, city, brokerage, neighborhood, and tags if available.
- Clear filter controls.
- Map/list split view.
- Featured market with a real thesis, not just a big card.
- Live market probability and implied fair value.
- Data freshness/provenance.
- Price, Zestimate when available, beds/baths/sqft, property type.
- Market activity sparkline.
- Watch/save affordance if implemented, otherwise do not fake it.
- Fast loading states.
- Empty states that are useful.
- Mobile layout that does not bury the core market card.

Generative upgrade ideas:

- "Generate market brief" action for a property.
- "Create room from this market" action.
- "Why interesting?" AI/local deterministic summary.
- "Similar markets" recommendations from local data.
- Generated neighborhood grouping once data supports it.

Acceptance:

- Desktop and mobile render cleanly.
- No console/page errors.
- Keyboard search and filters work.
- Existing tests updated or new tests added.
- `npm run build` passes.

### 2. Market Detail `/market/:propertyId`

Goal: this should become a property intelligence and market conviction page.

Must support:

- Hero image or media gallery.
- Price and property facts.
- Market chart with probability and implied fair value.
- Zestimate/listing comparison where data exists.
- Trust/provenance section.
- Start a room/bid flow.
- AI or deterministic market brief with citations.
- Evidence panels: comps, price history, neighborhood, listing description, data freshness, assumptions.
- Pre-bet or pre-room explanation.

Generative upgrade ideas:

- Property Thesis: generated summary with bullish/bearish cases.
- Uncertainty Band: explain what would make the market more confident.
- Scenario Lab: renovation, rate shock, rent yield, time-on-market.
- Market Questions: generate alternative market templates for the same property.
- Settlement Evidence Checklist: what proof would settle this market.

Acceptance:

- The page feels like a credible analysis surface, not a listing clone.
- Trust language remains clear.
- Generated content never pretends to be verified fact.
- Missing AI credentials still produce a useful local analysis.
- Tests cover the degraded path.

### 3. Join/Create Room `/join`

Goal: make room creation feel instant, confident, and event-ready.

Must support:

- Host identity and nickname.
- Create manually.
- Join by room code.
- Clear error states.
- Room code schema consistency.
- Mobile-first input ergonomics.

Generative upgrade ideas:

- Market Studio creation mode:
  - Paste property listing.
  - Paste address plus price.
  - Import from existing property.
  - Generate suggested market title, prompt, asking price, evidence checklist, and default liquidity.
- Preview generated room before creation.
- Choose event template: dinner game, classroom, investor meeting, open house, demo.
- Choose market format if implemented safely.

Acceptance:

- No fake import buttons.
- If paste-to-market is added, it works locally with deterministic parsing and validation.
- Create/join failures remain accessible and visible.
- Host auto-join is still robust.

### 4. Host Command Center `/host/:roomCode`

Goal: make the host surface feel like a live valuation show control room.

Must support:

- Room code, QR, player count, connection state.
- Property, asking price, current market probability, implied fair value.
- Chart.
- Leaderboard.
- Activity feed.
- AI Analyst.
- AI bot toggle.
- Settlement modal.
- Host authority warning.
- Trust notes.

Generative upgrade ideas:

- Host Script: generated talking points for the property and current market state.
- Live Pulse: "3 players moved the market under in 90 seconds."
- Market Movement Explainer: generated from event log.
- Suspicious Activity Panel: local heuristics for unusual betting.
- Replay Marker: capture memorable moments.
- Settlement Evidence Assistant: checklist plus generated recap.

Acceptance:

- Dense but not cluttered.
- Works on projector-size desktop.
- All controls have clear state.
- Host-only controls remain protected.
- Browser E2E creates a room and verifies the redesigned surface.

### 5. Player Mobile `/play/:roomCode`

Goal: players should understand, bet, and feel the market move within seconds.

Must support:

- Join with nickname.
- Property headline and asking price.
- Balance.
- Current over/under probability.
- Wager controls.
- Over and under buttons.
- Position and outcome after betting.
- Settlement result.
- Reconnect and load failure states.
- Trust note in compact form.

Generative upgrade ideas:

- "What does this mean?" short generated/local explanation.
- Bet preview: slippage, expected shares, upside, downside.
- Confidence selector.
- Personal recap after settlement.
- Microcopy based on market state: "You are contrarian", "Crowd is leaning over".

Acceptance:

- No overflow on mobile.
- Buttons are thumb-friendly.
- Bet failures roll back and notify.
- A11y announcements remain intact.
- Browser tests verify mobile flow.

### 6. Replay And Recap

Goal: every room should become a durable artifact.

Build toward:

- Replay page for settled rooms.
- Chart scrubber.
- Event feed replay.
- Leaderboard changes over time.
- Winning outcome and settlement evidence.
- Generated recap.
- Share image or shareable URL without sensitive tokens.

Vertical slice:

- Add a route or host-side settled recap extension that uses existing event logs.
- Generate a deterministic recap from room state and event history.
- Add tests for sensitive token non-leakage.

Acceptance:

- Recap is based on real room events.
- No host token leaks.
- Works after restart if room persistence is available.

## The Generative Market Studio

This is a centerpiece. Implement it in slices.

### Market Studio Vision

The host should be able to create a market by providing any of:

- Existing property from the local dataset.
- Address.
- Asking price.
- Listing description.
- CSV row.
- Natural-language prompt.
- Manual fields.

The system should produce:

- Normalized property fields.
- A market title.
- The market question.
- Asking price.
- Suggested market format.
- Default liquidity.
- Evidence checklist.
- Trust disclaimer.
- Generated/local thesis.
- Suggested room template.

### Market Studio Data Contract

Create a typed schema for market draft data:

- `source_type`
- `source_text`
- `property_id`
- `address`
- `city`
- `state`
- `zip`
- `asking_price`
- `beds`
- `baths`
- `sqft`
- `home_type`
- `listing_description`
- `provenance`
- `market_question`
- `market_format`
- `liquidity_b`
- `settlement_rule`
- `evidence_required`
- `generated_summary`
- `warnings`

Keep this contract shared between client and server if feasible.

### Local Deterministic Generation

If no AI key exists, the app must still generate useful drafts:

- Parse price patterns like `$1,250,000`.
- Parse bed/bath/sqft patterns.
- Detect address-like lines.
- Use existing property dataset for matches.
- Use template-based market question generation.
- Generate evidence checklist from market type.
- Generate concise local thesis from known fields.

### AI Enhancement

If an AI backend is configured, it may enrich drafts, but it must:

- Return structured JSON.
- Validate with schema.
- Fall back to local deterministic generation on failure.
- Show warnings when confidence is low.
- Never block manual room creation.

### Market Studio UI

Possible UI:

- Left: input mode tabs, paste box, existing-property picker.
- Center: generated draft preview.
- Right: market settings and settlement evidence.
- Bottom: create room / save draft.

Must be responsive:

- Desktop: three-pane studio.
- Mobile: stepper or tabs.

### Market Studio Tests

Add unit tests for:

- Price parsing.
- Address-ish parsing.
- Existing property matching.
- Draft validation.
- Deterministic generated summary.
- AI failure fallback if server path exists.

Add browser tests for:

- Paste listing -> generated draft -> create room.
- Invalid draft -> visible validation.
- Mobile step flow if implemented.

## Multi-Format Market Engine

Do not rewrite the whole market engine blindly. Create an extension path.

Current engine likely supports binary over/under LMSR. Preserve it.

Future formats:

- Binary over/under.
- Range market: below, near, above.
- Confidence band.
- Ranked outcomes.
- Rent-yield market.
- Days-on-market market.
- Appraisal gap market.
- Renovation ROI market.
- Neighborhood momentum market.
- Tournament room with multiple properties.

Vertical slice:

- Add a `MarketTemplate` abstraction without changing existing room behavior.
- Implement only binary over/under at first.
- Make room creation store a `market_template_id`.
- Generate UI labels from the template.
- Add tests proving existing behavior remains unchanged.

Acceptance:

- Existing rooms still work.
- Binary math remains correct.
- New template data does not become fake UI.

## AI Analyst Evolution

The AI Analyst must become trustworthy.

### Analyst Modes

Build toward:

- Room Analyst: explains live room state.
- Property Analyst: explains a property market.
- Host Coach: gives presenter notes.
- Player Coach: explains bet implications.
- Settlement Analyst: creates recap and evidence summary.
- Operator Analyst: flags risks and unusual behavior.

### Analyst Output Contract

Generated analysis should be structured:

- `summary`
- `bull_case`
- `bear_case`
- `uncertainties`
- `evidence`
- `citations`
- `limitations`
- `suggested_questions`
- `market_move_explanation`
- `confidence`

### Analyst Requirements

- Server-side only for AI credentials.
- Deterministic local fallback.
- Citation-first UI.
- No unsupported financial or appraisal claims.
- Clear "simulation" language.
- Tests for malformed AI responses.
- Tests for missing-key fallback.

### Evaluation

Add an evaluation harness:

- Fixture inputs.
- Expected required citations.
- Prohibited claims.
- Length and format constraints.
- Snapshot or semantic assertions.

## Data Platform Roadmap

The current app uses static property data. Expand thoughtfully.

### Near-Term Data Work

- Normalize property data into a typed domain model.
- Add server-side summary endpoint for browse cards.
- Avoid loading entire property JSON when not needed.
- Add pagination.
- Add map viewport filtering.
- Add provenance fields.
- Add freshness timestamps.
- Add data quality warnings.

### Ingestion Roadmap

Support:

- CSV import.
- JSON import.
- Existing Zillow snapshot normalization.
- Manual host-created markets.
- Future API/provider adapters.
- Local development fixtures.

### Data Quality Layer

Validate:

- Price ranges.
- Address fields.
- Beds/baths/sqft sanity.
- Duplicate properties.
- Missing photos.
- Broken image URLs.
- Stale records.
- Unsupported source claims.

### Tests

- Unit tests for normalizers.
- Fixture tests for imports.
- API tests for pagination and filtering.
- Browser tests for browse not blocking on huge full dataset.

## Market Integrity And Trust

Trust is not optional.

Build toward:

- Event-sourced room history.
- Bet idempotency.
- Host authority.
- Settlement evidence.
- No host token leakage.
- Data provenance.
- Generated-content limitations.
- Abuse and rate-limit visibility.
- Suspicious activity heuristics.
- Admin/operator replay.

Do not add real-money mechanics. Keep simulated credits explicit.

Possible heuristics:

- Last-second large wager.
- Same identity repeated joins.
- One player dominates volume.
- Sudden probability swing.
- Settlement attempted without evidence.
- AI bot disabled/enabled repeatedly.

Add tests for any heuristic introduced.

## Operator And Admin Console

Build toward an internal admin surface.

Capabilities:

- Active rooms.
- Room state.
- Event log.
- Persistence health.
- AI degraded/error counters.
- Rate-limit counters.
- Replay.
- Export room event JSON.
- Inspect suspicious activity.
- Moderate generated market drafts.

Vertical slice:

- Create `/ops` or hidden admin route only if there is a real guard.
- Or keep it server-only first with JSON endpoints and tests.
- Do not expose sensitive tokens.

## Analytics And Learning Loop

FairValue needs product analytics to learn.

Track locally first:

- Browse loaded.
- Search used.
- Filter changed.
- Market opened.
- Room created.
- Player joined.
- First bet.
- Bet error.
- AI analyst opened.
- Settlement completed.
- Replay viewed.

Implementation constraints:

- No external analytics dependency required for first slice.
- Use internal event logging or observability module.
- Avoid PII leakage.
- Add tests for event shape.

## Growth And Share Loops

Build toward:

- Invite links.
- QR improvements.
- Room recap.
- Shareable market thesis.
- Watchlist.
- Notifications later.
- Daily challenge.
- Featured market cadence.
- Event templates.
- Classroom mode.
- Open-house mode.

Only implement real loops. If the app cannot deliver notifications, do not add a fake notification button.

## Verification Philosophy

Every loop raises the evidence bar.

Run the smallest relevant checks during development, then stronger checks before a commit.

### Baseline Commands

Use as applicable:

```bash
npm run typecheck
npm test
npm run test:server
npm run build
npm run verify
```

### UI Commands

Use as applicable:

```bash
npm run test:e2e:isolated
npm run test:e2e:browser-load
npm run test:performance:cold
```

### Reliability Commands

Use as applicable:

```bash
npm run smoke:boot
npm run test:e2e:restart
npm run test:e2e:restart:matrix
npm run test:latency:restart
```

### Accessibility Commands

Use as applicable:

```bash
npm run test:a11y:assistive
```

If a full command is too slow for the current slice, run targeted tests first and record the full command still needed in the ledger. Before finalizing a major slice, run `npm run verify` unless it is genuinely blocked.

## Browser Verification

After frontend work:

1. Start backend and frontend on known ports.
2. Open the app in browser automation.
3. Check desktop browse.
4. Check mobile browse.
5. Check market detail.
6. Create a room.
7. Join as player.
8. Place at least one bet.
9. Confirm host updates.
10. Confirm player updates.
11. Confirm no unexpected console/page errors.
12. Screenshot important surfaces if useful.

Do not rely only on screenshots. Click the flows.

## Accessibility Requirements

Maintain and improve:

- Keyboard navigation.
- Focus restoration after modals and menus.
- `aria-invalid` and `aria-describedby` for validation.
- Live regions for async state.
- Accessible icon buttons.
- Contrast in toasts and modal overlays.
- Mobile hit targets.
- Reduced motion.
- Chart alternatives or summaries where possible.
- Screen-reader-friendly generated content sections.

Any redesigned surface must preserve the existing accessibility wins.

## Performance Requirements

Do not make the product beautiful by making it slow.

Watch:

- JS bundle budgets.
- CSS chunk budgets.
- Map loading.
- Chart loading.
- Image lazy loading.
- Route splitting.
- Static property JSON size.
- Mobile interaction latency.
- WebSocket reconnect behavior.
- Cold production route performance.

When adding UI components, avoid importing giant dependencies unless needed.

## Architecture Direction

Move toward:

- Shared domain models.
- Clear server/client contracts.
- Smaller page components.
- Component-level primitives.
- Feature modules:
  - `market-studio`
  - `market-detail`
  - `room-host`
  - `room-player`
  - `analytics`
  - `ai-analyst`
  - `property-data`
- Server routes grouped by domain if refactoring is practical.
- Typed request/response contracts where feasible.
- Deterministic local fixtures.

Avoid:

- Giant monolithic route files.
- More inline style sprawl.
- Duplicated market math.
- Browser-side secrets.
- UI state that can drift from server state.
- Fake cloud or fake provider code.

## Suggested First Big Slice

Pick this if no higher-severity runtime issue appears:

### "Generative Market Studio Plus UI Foundation"

Build a first real vertical slice:

1. Add a shared market draft schema and deterministic local draft generator.
2. Add a Market Studio mode to `/join` or a new route such as `/studio`.
3. Let a host paste a property/listing and generate a market draft.
4. Preview and edit the draft.
5. Create a real room from the draft.
6. Add visible warnings/provenance.
7. Add tests for parser/generator/schema.
8. Add browser E2E for paste -> draft -> room.
9. Start extracting reusable UI primitives/tokens needed by the studio.
10. Verify desktop/mobile.
11. Update docs and ledger.
12. Commit.

This slice is high leverage because it makes the app more generative while also forcing better UI architecture.

## Suggested Second Big Slice

### "Market Detail Intelligence Redesign"

1. Redesign `/market/:propertyId` into a true intelligence surface.
2. Add a structured property brief panel.
3. Add deterministic generated bullish/bearish/uncertainty cases.
4. Add evidence/provenance cards.
5. Add scenario chips if they produce real local output.
6. Keep Start a Bid working.
7. Add tests and browser proof.
8. Commit.

## Suggested Third Big Slice

### "Host Command Center Redesign"

1. Refactor host UI into smaller components.
2. Improve layout density and hierarchy.
3. Add a host script or live pulse panel generated from room state/events.
4. Improve QR/player/activity/leaderboard/chart composition.
5. Preserve authority and settlement behavior.
6. Add E2E assertions.
7. Commit.

## Suggested Fourth Big Slice

### "Mobile Player Betting Upgrade"

1. Improve mobile player layout.
2. Add bet preview from real market math.
3. Show shares/slippage/upside before confirmation.
4. Improve wager controls.
5. Add concise generated/local explanation.
6. Test bet preview math and browser flow.
7. Commit.

## Suggested Fifth Big Slice

### "Room Recap And Replay Seed"

1. Use existing event logs to generate a room recap.
2. Add settled room recap to host/player surfaces or a route.
3. Include chart movement, winners, key moments, settlement evidence.
4. Ensure no tokens leak.
5. Add tests.
6. Commit.

## Ten-Year Backlog Atlas

Use this as a giant idea reservoir. Do not implement blindly. Pull the next highest-leverage item after each verified loop.

### Product Foundation

1. Rename package from legacy `mission-betting` to FairValue if safe.
2. Add a product-wide route map and IA doc.
3. Add design-system docs.
4. Extract app shell.
5. Extract UI primitives.
6. Replace inline style objects in major pages.
7. Add Storybook or lightweight component gallery if useful.
8. Add visual regression snapshots.
9. Add route-level loading skeleton standards.
10. Add error-state standards.

### Generative Market Creation

11. Market draft schema.
12. Listing text parser.
13. Price parser.
14. Address parser.
15. Bed/bath/sqft parser.
16. Existing property matcher.
17. Market title generator.
18. Market question generator.
19. Settlement checklist generator.
20. Evidence requirement generator.
21. Draft confidence scoring.
22. Draft validation UI.
23. Draft edit UI.
24. Draft save/load.
25. Draft-to-room creation.
26. Draft-to-public market creation.
27. CSV import.
28. JSON import.
29. Bulk market generation.
30. Duplicate detection.

### AI Analyst

31. Structured analyst response schema.
32. Local property brief generator.
33. Room state analyst.
34. Market move explainer.
35. Host script generator.
36. Player bet explainer.
37. Settlement recap generator.
38. Evidence citation renderer.
39. AI response evaluation harness.
40. AI malformed response hardening.
41. AI cost/rate visibility.
42. AI prompt fixtures.
43. AI regression tests.
44. AI moderation flags.
45. User feedback on AI usefulness.

### Real Estate Intelligence

46. Normalize property model.
47. Normalize photos.
48. Normalize price history.
49. Normalize attribution/provenance.
50. Add comp selection.
51. Add neighborhood grouping.
52. Add school/amenity placeholders only if sourced.
53. Add rent-yield calculations if data exists.
54. Add tax estimate fields if data exists.
55. Add insurance/risk fields if data exists.
56. Add property quality scoring.
57. Add missing-data warnings.
58. Add stale-data warnings.
59. Add server-side property search.
60. Add pagination.

### Market Mechanics

61. Template abstraction.
62. Binary over/under template metadata.
63. Pre-bet preview.
64. Slippage explanation.
65. Share calculation UI.
66. Payout estimate UI.
67. Confidence selector.
68. Host liquidity setting.
69. Range market prototype.
70. Ranked outcome prototype.
71. Market close time.
72. Betting phases.
73. Grace period.
74. Settlement dispute state.
75. Market cancellation state.

### Multiplayer Experience

76. Presence indicators.
77. Active bettor pulse.
78. Better reconnect UI.
79. Better spectator mode.
80. Host phase controls.
81. Countdown timer.
82. Sound/motion cues with reduced-motion fallback.
83. Player reactions if real.
84. Room chat only if moderated and useful.
85. Room templates.
86. Event mode.
87. Classroom mode.
88. Open-house mode.
89. Tournament mode.
90. Multi-property room.

### Host Command Center

91. Redesign room header.
92. Redesign QR panel.
93. Redesign chart panel.
94. Redesign leaderboard.
95. Redesign activity feed.
96. Add live market pulse.
97. Add generated host talking points.
98. Add settlement evidence assistant.
99. Add operator warnings.
100. Add room recap generation.

### Player Mobile

101. Redesign join screen.
102. Redesign active betting screen.
103. Add bet preview.
104. Add position card.
105. Add personal P&L.
106. Add recent market movement.
107. Add simple explanation drawer.
108. Add better wager stepper.
109. Add haptics only if platform supports.
110. Add settled recap.

### Market Browse

111. Server-side summaries.
112. Map clustering.
113. Viewport filtering.
114. Better sort modes.
115. Saved markets if persisted.
116. Featured market editorial.
117. Neighborhood filters.
118. Activity filters.
119. Price movement filters.
120. Freshness/provenance filters.

### Market Detail

121. Stronger media gallery.
122. Better chart annotations.
123. Evidence panels.
124. Property brief.
125. Similar markets.
126. Scenario lab.
127. Generated market questions.
128. Settlement rules.
129. Public discussion only if safe.
130. Replay link after settlement.

### Replay And Recap

131. Replay route.
132. Event timeline.
133. Chart scrubber.
134. Probability movement annotations.
135. Leaderboard over time.
136. Biggest mover.
137. Best contrarian.
138. Settlement moment.
139. Generated recap.
140. Share card.

### Data Infrastructure

141. Property import CLI.
142. Property validation CLI.
143. Seed fixture strategy.
144. Postgres property tables.
145. Migration scripts.
146. Data freshness job.
147. Image proxy/cache if needed.
148. Broken image detection.
149. Provenance audit.
150. Data diff reports.

### Reliability

151. More WebSocket chaos tests.
152. Multi-room load tests.
153. Slow DB tests.
154. AI timeout tests.
155. Snapshot corruption tests.
156. Postgres failover tests.
157. Restart under active betting.
158. Browser offline/reconnect.
159. Mobile throttling.
160. Long room soak.

### Security And Safety

161. Secret scan hardening.
162. Token leakage tests.
163. Host-token storage audit.
164. Rate-limit coverage.
165. Payload validation coverage.
166. XSS tests for names/listings.
167. CSRF posture review.
168. Auth boundary docs.
169. Generated-content safety tests.
170. Admin route guard.

### Accessibility

171. VoiceOver human pass.
172. Chart summary alternatives.
173. Map keyboard affordances.
174. Modal focus trap audit.
175. Toast announcement audit.
176. Reduced-motion audit.
177. Mobile screen-reader pass.
178. Color contrast token audit.
179. Dynamic text sizing audit.
180. Error recovery audit.

### Observability

181. Request tracing.
182. Room lifecycle dashboard.
183. AI degraded dashboard.
184. Persistence dashboard.
185. WebSocket metrics.
186. Frontend error capture.
187. Performance marks.
188. Funnel analytics.
189. Operator alerts.
190. Release health report.

### Deployment

191. Production env checker expansion.
192. Deployment runbook.
193. Preview deployment smoke.
194. Real domain verification.
195. Database migration gate.
196. External metrics integration.
197. Log retention policy.
198. Backup/restore drill.
199. CDN/cache policy.
200. Mobile PWA installability.

### Business/Product

201. Event package.
202. Classroom package.
203. Agent/open-house package.
204. Investor demo package.
205. Premium host analytics.
206. Branded rooms.
207. Exportable reports.
208. Sponsorship surfaces only if intentional.
209. Referral loops.
210. Daily challenge.

### Research And Future

211. Prediction accuracy tracking.
212. Market calibration reports.
213. Brier score leaderboards.
214. Crowd vs Zestimate comparison.
215. Crowd vs final sale comparison.
216. Appraisal-gap studies.
217. Neighborhood sentiment index.
218. Volatility index.
219. Liquidity tuning research.
220. Bot behavior evaluation.

## Implementation Standards

When editing frontend:

- Prefer TypeScript for new code.
- Keep components small.
- Use existing `lucide-react` icons.
- Add CSS modules or co-located CSS only if consistent with repo style.
- Use CSS variables for tokens.
- Keep interactive controls semantic.
- Avoid hidden clickable divs.
- Avoid layout shift.
- Test mobile.

When editing backend:

- Keep validation explicit.
- Return stable error shapes.
- Preserve correlation IDs.
- Preserve observability counters.
- Avoid leaking host tokens or secrets.
- Add tests for failure paths.
- Keep degraded/no-DB local mode working.

When editing AI/generative code:

- Separate generation from rendering.
- Validate output.
- Provide deterministic fallback.
- Record limitations.
- Test malformed and missing-provider paths.

When editing docs:

- Update `README.md` for real commands or env changes.
- Update `FAIRVALUE_AUTONOMY_LEDGER.md` after each loop.
- Do not overstate unsupported features.

## Anti-Patterns To Delete Or Avoid

- Fake cloud sync.
- Browser-shipped API secrets.
- Placeholder AI buttons.
- Controls that do nothing.
- Marketing copy replacing actual app workflows.
- Huge page files absorbing all logic.
- Inline style drift across every surface.
- Duplicated market math.
- Unvalidated generated JSON.
- New dependencies for tiny utilities.
- Dark-on-dark or low-contrast text.
- Text in controls that overflows on mobile.
- Nested cards inside cards.
- Decorative gradient blobs.
- Product claims that imply real-money markets or appraisal authority.

## Ledger Protocol

Maintain `FAIRVALUE_AUTONOMY_LEDGER.md`.

After each loop, append:

- Timestamp.
- Goal slice.
- Files changed.
- Commands run.
- Test results.
- Browser routes verified.
- Screenshots/traces if any.
- Known risks.
- Next recommended action.
- Commit hash if committed.

If context gets low, update the ledger before doing anything else.

## Commit Protocol

Before committing:

1. Check changed files.
2. Ensure no unrelated user changes are staged.
3. Run relevant verification.
4. Run `git diff --check` on touched files.
5. Commit with a concrete message.

Commit examples:

```text
Add generative market draft studio
Redesign market detail intelligence panels
Add player bet preview and mobile betting polish
Add room recap from event log
Extract FairValue UI primitives
```

## If You Hit A Blocker

Do not stop at the blocker.

If credentials are missing:

- Build deterministic local fallback.
- Add env documentation.
- Add tests proving graceful degradation.

If a full E2E is flaky:

- Isolate the failing path.
- Add targeted regression coverage.
- Document the remaining flaky command in the ledger.

If a design refactor is too large:

- Extract one primitive.
- Convert one surface.
- Verify it.
- Commit.

If an architecture change is risky:

- Add tests around existing behavior first.
- Add the new boundary behind existing behavior.
- Migrate one caller.

## The First Concrete Mission

Unless runtime inspection reveals a critical breakage, start with this:

### Mission A: Generative Market Studio Vertical Slice

Deliver:

- A real structured market-draft generator.
- A UI path for turning pasted listing text into a validated market draft.
- A way to create a real room from that draft.
- Deterministic local fallback with no AI key.
- Tests for parsing, validation, generation, and create-room flow.
- A first extraction of UI primitives/tokens if needed.
- Desktop/mobile browser proof.
- Ledger update.
- Commit.

Minimum viable version:

- Add `src/lib/marketDrafts.ts` or similar.
- Add tests under `src/lib/__tests__`.
- Add UI to `/join` as a third "Market Studio" mode, or create `/studio` and link to it from `/join` and market pages.
- Support paste text containing address and price.
- Generate a market question like: "Will this property appraise above $X?"
- Generate an evidence checklist.
- Let the user edit address and price before creating.
- Reuse existing `/api/rooms` creation path.

Stretch:

- Match pasted address to existing property data.
- Generate bullish/bearish/uncertainty summary.
- Add room template selector.
- Add browser E2E.

### Mission B: UI Foundation

While doing Mission A, improve the design foundation:

- Create shared tokens if current tokens are insufficient.
- Create reusable button/input/segmented-control/panel primitives if useful.
- Reduce repeated inline styles in touched surfaces.
- Make `/join` look dramatically better without breaking tests.
- Verify mobile.

### Mission C: Market Detail Intelligence

If Mission A finishes:

- Add a deterministic property brief generator.
- Redesign intelligence panels on `/market/:propertyId`.
- Add generated/local bullish, bearish, uncertainty, and settlement evidence sections.
- Keep Start a Bid working.
- Add tests and browser proof.

## Final Response Requirements

When you finish the 12-hour run or need to hand off, report only high-signal facts:

- What shipped.
- Files changed.
- Commands run and results.
- Browser flows verified.
- Commits created.
- Known residual risks.
- Next best action.

Do not claim the 10-year vision is complete. Claim the verified slices.

Now begin. Inspect the repo, update the baseline, ship the highest-leverage generative/UI slice, verify it, update the ledger, commit, and continue.

