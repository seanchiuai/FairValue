# Security Notes

## React Router Dependency Review

Reviewed 2026-08-04: `npm audit --omit=dev` reports `GHSA-qwww-vcr4-c8h2` against the installed React Router 7 range. The advisory describes a CSRF path in React Router's RSC mode; it is not a claim that the package is universally exploitable in every router integration.

FairValue is a Vite client-rendered SPA. The application uses `BrowserRouter`, `Routes`, `Route`, links, and client-side hooks. It does not use React Router's RSC framework, server actions, route actions, or an RSC request handler. The Express server does not delegate requests to an RSC runtime. The dependency range is constrained to `^7.18.2`, and the lockfile resolves both `react-router` and `react-router-dom` to `7.18.2` so installs cannot fall back to earlier 7.x releases with additional advisories.

This architecture assessment does not remove the audit finding. The release owner must either accept the BrowserRouter-only exposure for the current deployment or approve a dependency/runtime change before production sign-off. Re-evaluate this decision if React Router RSC, server actions, route actions, or a framework adapter is introduced, and whenever the router dependency or deployment architecture changes.

The npm audit fix suggestion was not applied because it proposes a runtime downgrade to `7.11.0`. A live registry check shows that `7.11.0` carries additional high and moderate advisories that are absent from the current `7.18.2` report, so that downgrade would increase risk. The remaining audit result is the RSC-only advisory above; keep the BrowserRouter boundary explicit and re-evaluate when a non-RSC-compatible patched release or an approved router replacement is available.
