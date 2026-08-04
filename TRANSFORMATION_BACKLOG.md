# FairValue Product Transformation

This is the implementation backlog for the August 4, 2026 product pass. It records connected user value and verification boundaries rather than treating a route or fixture as shipped proof.

## Shipped In This Pass

- [x] Public product surface: property browse now opens with a precise FairValue promise, real property imagery, live snapshot count, primary host/join actions, product principles, how-it-works steps, use cases, trust language, FAQ, footer, terms, and privacy routes.
- [x] Comparison workspace: select up to four properties from browse or detail, persist the selection locally, share it as a URL, compare reference fields in a table, and launch a prefilled host flow.
- [x] Room library: signed browser identities can retrieve their own live and settled rooms, search/filter them, reopen live rooms, open recaps/review, and download settled CSV summaries.
- [x] Public recap export: settled rooms expose a public-safe JSON/CSV export; unfinished rooms return an explicit 409 and private tokens/session IDs are excluded.
- [x] Persistence boundary: room creation timestamps and user membership survive the existing JSON/Postgres room snapshot path and room event replay.
- [x] Regression coverage: comparison unit tests, room library/export server tests, and a browser workflow covering browse through profile return.

## Existing Core Reused

- Multiplayer LMSR room state, WebSocket updates, phase controls, idempotent bets, settlement evidence, replay verification, reputation, watchlist/alerts, Market Studio, and operator incidents remain the existing core paths.
- The signed browser identity is intentionally anonymous and browser-scoped. This pass does not invent an email/password account system or claim external identity-provider authentication.

## Operator-Dependent Gates

- [ ] Configure production `DATABASE_URL` and validate the live Postgres room event/persistence path.
- [ ] Configure a dedicated `FAIRVALUE_PUBLIC_VERIFICATION_SECRET` for signed public verification artifacts.
- [ ] Configure and validate any external intelligence, neighborhood evidence, Cognee, or alert webhook provider before presenting those adapters as provider-backed.
- [ ] Run the deployment-specific migration, DNS, TLS, cookie, reverse-proxy, and browser callback checks in the target environment.
- [ ] Resolve the remaining production dependency audit finding for the installed React Router range, or document the BrowserRouter-only risk acceptance with the release owner.

## Honest Classification

The local product workflow is implemented and browser-verified. The repository is not classified as production-ready until the operator-dependent database, signing secret, deployment, and dependency gates above are rechecked in the target environment.
