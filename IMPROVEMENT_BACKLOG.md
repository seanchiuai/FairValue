# FairValue Improvement Backlog

Repo-grounded ranked list of 100 high-impact improvements for FairValue, written for a founder/PM audience. The list is ordered by expected business leverage and risk reduction, not by subsystem.

## Repo Signals Used For Ranking

- Frontend is a Create React App app using React 19, mixed TypeScript and JavaScript, large page components, and a static property dataset in `public/data/properties.json`.
- Backend is a single Express + WebSocket process in `server/index.js` with in-memory multiplayer room state and Neon-backed trade persistence.
- AI integration is currently browser-side and `src/services/cogneeService.ts` contains a live API key in client code.
- There is a stubbed cloud sync path in `src/services/cloudPersistence.ts` and a partly speculative hook in `src/hooks/useCloudFairValue.ts`.
- Build succeeds with a warning, tests are light, and verification is concentrated in LMSR/bot unit tests plus one shallow page render test.

## Rank Legend

- `Lens`: primary domain of impact
- `Impact`: expected business or risk-reduction payoff
- `Effort`: `S`, `M`, or `L`
- `Horizon`: `Now`, `Next`, or `Later`

## Ranked 100

### 1-20: Critical Now

1. Move the Cognee integration behind a server boundary and rotate the exposed key.
   Lens: Trust/Safety | Impact: Very High | Effort: M | Horizon: Now
   Why: `src/services/cogneeService.ts` ships a live `X-Api-Key` to every browser, which creates immediate abuse, cost, and credibility risk.

2. Fix the room-code mismatch between generation and join validation.
   Lens: UX | Impact: Very High | Effort: S | Horizon: Now
   Why: `server/index.js` generates alphanumeric room codes, but `src/pages/JoinPage.tsx` only accepts four letters, so a large share of manual joins will fail.

3. Persist room lifecycle state outside server memory.
   Lens: Platform | Impact: Very High | Effort: L | Horizon: Now
   Why: rooms, players, activity, AI state, and settlement status live in process memory today, so one restart or crash kills the live multiplayer experience.

4. Add authenticated host capabilities for settlement and AI controls.
   Lens: Trust/Safety | Impact: Very High | Effort: M | Horizon: Now
   Why: `POST /api/rooms/:code/settle` and `POST /api/rooms/:code/toggle-ai` have no host auth, so anyone who knows the room code can manipulate the game.

5. Make the server the single authoritative owner of market state transitions.
   Lens: Realtime | Impact: Very High | Effort: M | Horizon: Now
   Why: the client runs optimistic trading logic while the server also owns market state, which increases drift, race conditions, and trust issues during multiplayer sessions.

6. Create a durable event log for room actions and market updates.
   Lens: Platform | Impact: Very High | Effort: M | Horizon: Now
   Why: without an append-only timeline of joins, bets, AI actions, and settlement, FairValue cannot support replay, audits, dispute resolution, or analytics reliably.

7. Build a verified settlement workflow with evidence, not just manual input.
   Lens: Market Design | Impact: Very High | Effort: L | Horizon: Now
   Why: the current host-entered `actual_price` model is easy to dispute and weakens trust in the core value proposition.

8. Replace the static property dataset with a refreshable ingestion pipeline.
   Lens: Data | Impact: Very High | Effort: L | Horizon: Now
   Why: the product currently depends on a frozen Zillow dump, which caps freshness, geography, and repeat engagement.

9. Add product analytics for the full host and player funnel.
   Lens: Growth | Impact: Very High | Effort: M | Horizon: Now
   Why: without instrumentation across browse, room creation, join, first bet, repeat play, and settlement, you cannot learn what actually drives retention.

10. Introduce durable user accounts and identity beyond `sessionStorage`.
    Lens: Growth | Impact: Very High | Effort: L | Horizon: Now
    Why: `useSession` creates anonymous temporary IDs, which blocks cross-device continuity, player history, leaderboards, and monetization.

11. Unify LMSR logic into one shared domain package with a tested API contract.
    Lens: Platform | Impact: High | Effort: M | Horizon: Now
    Why: LMSR math is duplicated between `src/lib/lmsr.ts` and `server/index.js`, which creates correctness and maintenance risk in the product’s core engine.

12. Add backend API, WebSocket, and settlement tests.
    Lens: Ops | Impact: High | Effort: M | Horizon: Now
    Why: current tests mostly cover math and one page render, leaving the real multiplayer system largely unverified.

13. Add server-side rate limiting, abuse controls, and payload validation.
    Lens: Trust/Safety | Impact: High | Effort: M | Horizon: Now
    Why: the client has a local rate limiter, but the server trusts requests too much for bets, joins, and room operations.

14. Move bot simulation scheduling to a durable job layer.
    Lens: Platform | Impact: High | Effort: M | Horizon: Now
    Why: both room AI and solo simulations are interval-driven in one Node process, which is fragile under restarts, scaling, and deployment churn.

15. Build an internal admin console for room support, market moderation, and replay.
    Lens: Ops | Impact: High | Effort: M | Horizon: Now
    Why: once live sessions matter, you need operator visibility into failed rooms, suspicious betting, market status, and user complaints.

16. Modernize the frontend build stack off Create React App.
    Lens: Platform | Impact: High | Effort: M | Horizon: Now
    Why: CRA is dated relative to the React version in use, slows iteration, and makes future routing, SSR, and bundle work harder than necessary.

17. Replace or remove the stubbed cloud sync path.
    Lens: Platform | Impact: High | Effort: M | Horizon: Now
    Why: `cloudPersistence` and `useCloudFairValue` create product complexity without delivering a real synchronized capability.

18. Break the largest page components into focused UI and state modules.
    Lens: Platform | Impact: High | Effort: M | Horizon: Now
    Why: `HostView.tsx`, `PlayerView.tsx`, and `Markets.jsx` are large enough to slow iteration and hide bugs in the most important surfaces.

19. Create a guided market-creation flow that starts from a property import, not manual entry.
    Lens: UX | Impact: High | Effort: M | Horizon: Now
    Why: the current room creation flow on `/join` asks hosts to type address and asking price manually, which is too much friction for repeat usage.

20. Publish a trust explainer for how FairValue works and why the prices mean anything.
    Lens: Trust/Safety | Impact: High | Effort: S | Horizon: Now
    Why: LMSR, over/under probabilities, and fair-value translation are non-obvious to new users, and confusion will suppress bets and referrals.

### 21-50: Build Product Depth

21. Add a shareable room recap after settlement.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the product already generates a live social moment, but it does not turn that moment into a reusable artifact for retention and referrals.

22. Add invite, referral, and host-side sharing loops directly into the room flow.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the current QR flow is helpful, but FairValue needs explicit viral hooks if it wants growth beyond in-room novelty.

23. Expand beyond San Francisco 94110 with a geography strategy.
    Lens: Growth | Impact: High | Effort: L | Horizon: Next
    Why: the visible market inventory is geographically narrow, which constrains audience size and repeat discovery.

24. Build better public market pages with clearer theses and recent signals.
    Lens: UX | Impact: High | Effort: M | Horizon: Next
    Why: solo browse is currently mostly cards and details; it needs a stronger narrative for why any given market is worth attention.

25. Add property context panels based on comps, rent yield, tax, and neighborhood signals.
    Lens: Data | Impact: High | Effort: M | Horizon: Next
    Why: users need supporting evidence to form an opinion, not just an asking price and a crowd percentage.

26. Turn the current AI analyst into a trusted assistant with citations and clear limitations.
    Lens: AI | Impact: High | Effort: M | Horizon: Next
    Why: AI that gives ungrounded betting suggestions can feel gimmicky; evidence-backed analysis is more defensible and differentiating.

27. Add first-time player onboarding and a “how to make your first bet” walkthrough.
    Lens: UX | Impact: High | Effort: S | Horizon: Next
    Why: the player UI is functional, but a novice still has to infer the mechanics and consequences of a bet.

28. Add real-time presence indicators for who is in the room and who is actively betting.
    Lens: Realtime | Impact: High | Effort: M | Horizon: Next
    Why: part of the fun is the social pressure of live prediction, and the current UI underplays that dynamic.

29. Add room countdowns, lock times, and host-controlled phases.
    Lens: Market Design | Impact: High | Effort: M | Horizon: Next
    Why: live sessions feel better when the host can move between join, betting, reveal, and settle states intentionally.

30. Introduce persistent leaderboards, streaks, and season mechanics.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: a prediction game becomes stickier once users have an identity and status that outlive one room.

31. Add personal portfolio and P&L history for repeat players.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: users who feel ownership over their betting track record are more likely to return and bring friends.

32. Let hosts create private, public, or invite-only rooms.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the product can serve parties, classrooms, recruiting events, and open communities, but it needs room-level audience controls.

33. Add better pre-bet trade previews, including slippage and upside.
    Lens: Market Design | Impact: High | Effort: S | Horizon: Next
    Why: the current UX shows the outcome after a trade more clearly than the economic tradeoff before a trade.

34. Add a market integrity layer for suspicious trading patterns.
    Lens: Trust/Safety | Impact: High | Effort: M | Horizon: Next
    Why: once stakes rise, concentrated last-minute betting or coordinated manipulation will become a real product problem.

35. Create a clearer go-to-market wedge for FairValue.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the repo suggests both multiplayer entertainment and solo browsing; a sharper primary use case will improve product and growth choices.

36. Package FairValue for hosted events, classrooms, and demos.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the room-based architecture is well suited to high-engagement live formats that can drive early adoption and case studies.

37. Add notifications for room invites, price moves, and settlement results.
    Lens: Growth | Impact: High | Effort: M | Horizon: Next
    Why: the product currently ends when the tab closes, which hurts repeat engagement.

38. Build a room replay mode that replays the probability chart and bet feed.
    Lens: UX | Impact: High | Effort: M | Horizon: Next
    Why: replay turns a one-time live event into reusable content for sharing, coaching, and growth.

39. Add better empty, loading, and degraded-state UX across the app.
    Lens: UX | Impact: High | Effort: S | Horizon: Next
    Why: many surfaces fall back to terse loading text or console warnings, which lowers perceived polish and trust.

40. Build accessibility into the main gameplay surfaces.
    Lens: UX | Impact: High | Effort: M | Horizon: Next
    Why: mobile betting, charts, dialogs, and game-state changes need stronger keyboard, screen-reader, and contrast support to feel production-ready.

41. Introduce a real design system and remove most inline styling from major pages.
    Lens: Platform | Impact: Medium-High | Effort: M | Horizon: Next
    Why: the current UI has strong direction but is hard to evolve consistently because layout and styling are embedded directly in page components.

42. Complete the mixed JS-to-TS migration.
    Lens: Platform | Impact: Medium-High | Effort: M | Horizon: Next
    Why: mixed file conventions increase type holes, review friction, and inconsistent engineering standards.

43. Add component-level story coverage or visual regression checks.
    Lens: Ops | Impact: Medium-High | Effort: M | Horizon: Next
    Why: FairValue is UI-heavy, and visual regressions can materially damage the product experience even when logic tests pass.

44. Add bundle budgets and performance monitoring for key user paths.
    Lens: Ops | Impact: Medium-High | Effort: S | Horizon: Next
    Why: the app is already shipping non-trivial JS bundles and uses maps, charts, and imagery on mobile-heavy flows.

45. Optimize property loading so the full dataset is not a blocking client fetch.
    Lens: Data | Impact: Medium-High | Effort: M | Horizon: Next
    Why: `useProperties` loads the entire property JSON into the browser, which does not scale well with more markets or regions.

46. Add server-side market summaries and pagination for the browse experience.
    Lens: Platform | Impact: Medium-High | Effort: M | Horizon: Next
    Why: the public market catalog should eventually come from a queryable backend, not a static browser-side dataset.

47. Improve map performance with clustering, viewport filtering, and lazy details.
    Lens: UX | Impact: Medium-High | Effort: M | Horizon: Next
    Why: map-heavy browsing becomes fragile as the market count expands beyond the current demo scale.

48. Add data freshness and provenance badges to each property.
    Lens: Trust/Safety | Impact: Medium-High | Effort: S | Horizon: Next
    Why: if users do not know when the data was updated or where it came from, they will trust the market less.

49. Add human moderation tools for AI output and public market content.
    Lens: Trust/Safety | Impact: Medium-High | Effort: M | Horizon: Next
    Why: once AI and user-generated content matter more, moderation and override paths become table stakes.

50. Create a clear pricing and monetization strategy for hosts.
    Lens: Monetization | Impact: Medium-High | Effort: M | Horizon: Next
    Why: FairValue already has natural premium surfaces such as hosted events, replay exports, analytics, and branded rooms.

### 51-75: Scale Reliability and Product Breadth

51. Add proper input validation and schema enforcement for every API route.
    Lens: Platform | Impact: Medium-High | Effort: S | Horizon: Next
    Why: today the server accepts request bodies with only light manual checks, which makes evolution and security harder.

52. Version the WebSocket protocol and add acknowledgements for important events.
    Lens: Realtime | Impact: Medium-High | Effort: M | Horizon: Next
    Why: the current message handling is permissive and loosely typed, which will become painful as more real-time behaviors are added.

53. Add idempotency keys for bets and joins.
    Lens: Trust/Safety | Impact: Medium-High | Effort: M | Horizon: Next
    Why: retries and flaky mobile connections can otherwise create duplicate side effects in the most sensitive flows.

54. Fix optimistic UI conflicts and rollback edge cases in `useRoom`.
    Lens: Realtime | Impact: Medium-High | Effort: M | Horizon: Next
    Why: the current optimistic approach can drift from server truth during concurrent betting and intermittent connectivity.

55. Use real timestamps in chart rendering instead of synthetic tick counters.
    Lens: UX | Impact: Medium-High | Effort: S | Horizon: Next
    Why: `useMarketChart` currently simulates time progression locally, which weakens replay fidelity and real-time interpretation.

56. Deduplicate chart history and live updates so sessions do not visibly overcount.
    Lens: UX | Impact: Medium-High | Effort: S | Horizon: Next
    Why: history loading plus periodic local ticks plus live events can make charts look active without representing true underlying change.

57. Add structured logging and request correlation IDs.
    Lens: Ops | Impact: Medium-High | Effort: S | Horizon: Next
    Why: console-only logging is insufficient once real rooms, AI spend, and live user issues need diagnosis.

58. Add metrics, alerts, and dashboards for the core game loop.
    Lens: Ops | Impact: Medium-High | Effort: M | Horizon: Next
    Why: you need visibility into room creation, join failures, bet latency, AI failures, and settlement errors before scaling.

59. Add environment validation and example env files.
    Lens: Ops | Impact: Medium-High | Effort: S | Horizon: Next
    Why: the app assumes `DATABASE_URL` and remote AI dependencies without a clean startup contract for contributors or deployment.

60. Replace destructive seeding with safer dev data tooling.
    Lens: Ops | Impact: Medium-High | Effort: S | Horizon: Next
    Why: `server/seed.js` wipes tables entirely, which is risky and not sustainable for shared environments.

61. Introduce formal database migrations and schema versioning.
    Lens: Platform | Impact: Medium-High | Effort: M | Horizon: Next
    Why: persistent room and analytics work will need a repeatable migration discipline, not ad hoc scripts.

62. Split dev, demo, and production data domains.
    Lens: Ops | Impact: Medium-High | Effort: M | Horizon: Next
    Why: the current architecture invites accidental mixing of demo data, experiments, and future production usage.

63. Add better offline and bad-network handling for players.
    Lens: UX | Impact: Medium-High | Effort: M | Horizon: Next
    Why: room play often happens on phones in noisy Wi‑Fi conditions, and FairValue should degrade gracefully there.

64. Add QR and join-link hardening with deep-link testing.
    Lens: UX | Impact: Medium-High | Effort: S | Horizon: Next
    Why: join flow is the single most important conversion step in multiplayer, and it needs to work cleanly across devices and browsers.

65. Let hosts pause betting or freeze the market temporarily.
    Lens: Market Design | Impact: Medium-High | Effort: S | Horizon: Next
    Why: live games need moderation tools when discussion, explanation, or disputes happen mid-session.

66. Add configurable room presets for event size and tempo.
    Lens: Market Design | Impact: Medium-High | Effort: S | Horizon: Next
    Why: a small dinner game and a 100-person demo need different defaults for time limits, bankroll, and AI activity.

67. Support more market formats than simple over/under.
    Lens: Market Design | Impact: Medium-High | Effort: L | Horizon: Later
    Why: range markets, confidence bands, and ranked outcomes can expand gameplay depth once the foundation is stable.

68. Let hosts tune liquidity parameters or choose market templates.
    Lens: Market Design | Impact: Medium-High | Effort: M | Horizon: Later
    Why: some rooms may benefit from different price sensitivity than the hardcoded `b = 100`.

69. Add deadlines, grace periods, and resolution states to market objects.
    Lens: Market Design | Impact: Medium-High | Effort: M | Horizon: Next
    Why: every serious market product needs explicit time semantics once more public or asynchronous play is introduced.

70. Add public profiles, badges, and reputation markers for credible players.
    Lens: Growth | Impact: Medium-High | Effort: M | Horizon: Later
    Why: recognizable high-signal users can improve trust, community quality, and repeat engagement.

71. Create a daily challenge or featured-market cadence.
    Lens: Growth | Impact: Medium-High | Effort: M | Horizon: Next
    Why: recurring reasons to come back are necessary if solo browsing is meant to be more than a demo mode.

72. Add watchlists and saved properties.
    Lens: Growth | Impact: Medium-High | Effort: M | Horizon: Next
    Why: users who save markets or properties create a natural re-engagement loop.

73. Add personalized notifications when watched markets move meaningfully.
    Lens: Growth | Impact: Medium-High | Effort: M | Horizon: Next
    Why: movement-based alerts give users a reason to re-open the app when something interesting actually happens.

74. Build a recommendation engine for markets and properties.
    Lens: Growth | Impact: Medium-High | Effort: L | Horizon: Later
    Why: as inventory grows, surfacing the right next market becomes critical to session depth and repeat use.

75. Add public social proof on market pages.
    Lens: Growth | Impact: Medium-High | Effort: S | Horizon: Next
    Why: showing recent activity, top predictors, and why people are participating can make solo markets feel alive.

### 76-100: Differentiate and Prepare To Scale

76. Add explainable “why the market moved” summaries.
    Lens: AI | Impact: Medium | Effort: M | Horizon: Later
    Why: users care about the narrative behind price changes, not only the final number.

77. Add evidence-backed market memos or property briefs.
    Lens: AI | Impact: Medium | Effort: M | Horizon: Later
    Why: short, well-structured briefs can make FairValue feel closer to a trusted analysis product than a novelty game.

78. Move AI retrieval onto internal normalized property and market data.
    Lens: AI | Impact: Medium | Effort: M | Horizon: Later
    Why: long-term differentiation will come from proprietary structured context, not from direct third-party API calls from the browser.

79. Add evaluation and quality scoring for AI output.
    Lens: AI | Impact: Medium | Effort: M | Horizon: Later
    Why: once AI advice influences bets, you need a way to measure hallucination rate, usefulness, and failure cases.

80. Add a fallback path when AI is unavailable.
    Lens: AI | Impact: Medium | Effort: S | Horizon: Next
    Why: the product should keep functioning cleanly even when the AI layer errors or rate-limits.

81. Add community comments or notes with moderation controls.
    Lens: Growth | Impact: Medium | Effort: M | Horizon: Later
    Why: discussion can deepen engagement, but only if it is curated well enough not to damage trust.

82. Add exportable data and recap artifacts for hosts.
    Lens: Monetization | Impact: Medium | Effort: S | Horizon: Later
    Why: event hosts, educators, and enterprise users value takeaways they can reuse outside the app.

83. Create a partnership-ready mode for brokerages, classrooms, and meetups.
    Lens: Monetization | Impact: Medium | Effort: M | Horizon: Later
    Why: the multiplayer format has clear B2B2C potential if it can be branded and managed cleanly.

84. Add CRM hooks or contact capture for high-intent hosts.
    Lens: Monetization | Impact: Medium | Effort: S | Horizon: Later
    Why: hosts who create rooms are likely the first monetizable segment and should not disappear anonymously after the session.

85. Add SEO landing pages for public markets and neighborhood themes.
    Lens: Growth | Impact: Medium | Effort: M | Horizon: Later
    Why: if solo browsing matters, organic discovery should become a durable acquisition channel.

86. Add programmatic content around neighborhoods, home types, and valuation themes.
    Lens: Growth | Impact: Medium | Effort: M | Horizon: Later
    Why: FairValue can build search presence around questions people already ask about local real estate value.

87. Align package metadata and developer-facing naming with the product.
    Lens: Ops | Impact: Medium | Effort: S | Horizon: Next
    Why: the `package.json` name still says `mission-betting`, which creates avoidable confusion for contributors and future tooling.

88. Add ownership docs, contribution guides, and architecture notes.
    Lens: Ops | Impact: Medium | Effort: S | Horizon: Next
    Why: as the project grows, onboarding speed and consistent engineering decisions become important leverage.

89. Create explicit public API docs and event schemas for future integrations.
    Lens: Platform | Impact: Medium | Effort: M | Horizon: Later
    Why: integration-friendly surfaces can unlock partnerships, embedded experiences, and internal team velocity.

90. Introduce a formal error taxonomy and user-facing recovery patterns.
    Lens: UX | Impact: Medium | Effort: M | Horizon: Next
    Why: many failures currently collapse into generic warnings or silent degradations, which hurts trust and supportability.

91. Add privacy controls, retention rules, and account deletion workflows.
    Lens: Trust/Safety | Impact: Medium | Effort: M | Horizon: Later
    Why: durable accounts, analytics, and replay data all increase privacy obligations.

92. Plan explicitly for compliance before expanding into anything resembling real-money play.
    Lens: Trust/Safety | Impact: Medium | Effort: M | Horizon: Later
    Why: prediction-market mechanics attract regulatory attention quickly once money, prizes, or broad public participation enter the picture.

93. Add fraud and anomaly detection on betting and room behavior.
    Lens: Trust/Safety | Impact: Medium | Effort: M | Horizon: Later
    Why: coordinated or scripted behavior will matter more as public rooms and reputation systems grow.

94. Add experiment flags and A/B infrastructure.
    Lens: Growth | Impact: Medium | Effort: M | Horizon: Later
    Why: onboarding, pricing, AI, and market design changes should become measurable experiments, not opinion-driven launches.

95. Build a warehouse-ready analytics layer.
    Lens: Ops | Impact: Medium | Effort: M | Horizon: Later
    Why: event logs, cohort analysis, and monetization decisions get much easier once data is queryable beyond the product database.

96. Add a stronger default browse-home narrative and sharper positioning copy.
    Lens: Growth | Impact: Medium | Effort: S | Horizon: Next
    Why: the current UI is polished, but the product promise could be clearer to a first-time visitor deciding whether to engage.

97. Add better image strategy, including CDN hosting and graceful fallbacks.
    Lens: UX | Impact: Medium | Effort: M | Horizon: Next
    Why: property imagery is central to browse appeal, but the app currently depends on static feed assets and best-effort selection logic.

98. Add full mobile QA coverage for host, player, and browse paths.
    Lens: UX | Impact: Medium | Effort: M | Horizon: Next
    Why: the player experience is explicitly phone-oriented and deserves device-level testing as a first-class product requirement.

99. Add a demo mode optimized for judges, investors, and sales conversations.
    Lens: Growth | Impact: Medium | Effort: S | Horizon: Later
    Why: FairValue has a strong live-demo shape, and a polished demo path can materially improve fundraising and partnership outcomes.

100. Build a crisp long-term product thesis that reconciles “game,” “tool,” and “market.”
     Lens: Growth | Impact: Medium | Effort: M | Horizon: Later
     Why: the repo currently points at entertainment, education, and decision support at once; a tighter product thesis will sharpen every roadmap decision above.

## Suggested First 10 To Execute

1. Secure the AI boundary and rotate the exposed key.
2. Fix room-code join failures.
3. Persist room state and host ownership.
4. Add host auth for settle and AI actions.
5. Unify server-authoritative market logic.
6. Create a durable event log.
7. Add verified settlement with evidence.
8. Replace the static dataset with a refreshable ingest path.
9. Instrument the host/player funnel.
10. Introduce durable user accounts and history.
