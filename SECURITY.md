# Security Notes

## React Router Dependency Review

Reviewed 2026-08-04: `npm audit --omit=dev` reports `GHSA-qwww-vcr4-c8h2` against the installed React Router 7 range. The advisory describes a CSRF path in React Router's RSC mode; it is not a claim that the package is universally exploitable in every router integration.

FairValue is a Vite client-rendered SPA. The application uses `BrowserRouter`, `Routes`, `Route`, links, and client-side hooks. It does not use React Router's RSC framework, server actions, route actions, or an RSC request handler. The Express server does not delegate requests to an RSC runtime. The lockfile currently resolves `react-router` and `react-router-dom` to `7.18.2`.

This architecture assessment does not remove the audit finding. The release owner must either accept the BrowserRouter-only exposure for the current deployment or approve a dependency/runtime change before production sign-off. Re-evaluate this decision if React Router RSC, server actions, route actions, or a framework adapter is introduced, and whenever the router dependency or deployment architecture changes.

The npm audit fix suggestion was not applied automatically because it proposes a runtime downgrade to `7.11.0`; any downgrade or upgrade must be tested against the current application and full verification suite.
