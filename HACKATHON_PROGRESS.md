# Hackathon Progress Tracker

## Git Snapshot
- Updated: 2026-02-07
- Sources: `git log --all`, `git branch -vv`, `git status`
- Current branch: `scaper` (inactive for hackathon delivery)

## Branch Status
| Branch | Remote Sync | Head Commit | Notes |
| --- | --- | --- | --- |
| `main` | ahead 4 vs `origin/main` | `8b0a572` | Active branch: multiplayer + player join/chart fixes are local and not pushed |
| `multiplayer` | ahead 1 vs `origin/multiplayer` | `8b0a572` | Active branch: player join flow/chart initialization fix |
| `scaper` | ahead 1 vs `origin/scaper` | `d60e1e0` | Inactive: scraper workstream is abandoned |
| `Frontend` | behind 5 vs `origin/Frontend` | `56c7005` | Inactive for current delivery scope |

## Delivery Scope Update
- Scraper pipeline is abandoned for this hackathon.
- Property/market data will be input manually.
- Active development branches are only: `main` and `multiplayer`.

## Team Updates (Current Plan)

### Rishabh — Data Ingestion
- Scraper workstream is paused/abandoned for this hackathon.
- New role: support manual dataset preparation/validation for demo inputs.
- Status: shifted from ingestion engineering to manual data operations.

### Sean — Real-Time Betting UX
- `0e6650d`: Added multiplayer mode and wiring updates.
- `415449f`: Restored Markets landing page; added "Host a Bid" flow entry.
- `8b0a572`: Fixed player join flow and chart initialization.
- `56c7005`: Added LMSR backend and algorithm documentation (`sean/`).
- Status: active on `main`/`multiplayer`; focus is realtime betting flow + leaderboard stability.

### Abhi — Fair Value + Integration Layer
- `origin/main` commits (author: `WolfOf7570`) include relevant integration work:
  - `d95bf7b`: Market page styling + service updates including Cognee service file.
  - `12167e9`: Chart label cleanup for price visualization.
  - `127ae7b`, `11e2c39`, `b8aaafd`: UX fixes around cards/uploads.
- Status: active integration target with Sean’s multiplayer work and manual input data.

## Integration Contract (Must Align Before Demo)

### Canonical IDs + Time
- `propertyId` (stable across manual inputs, bets, and charting)
- `tradeId`/`betId`
- `userId` or session key
- ISO-8601 UTC timestamps everywhere

### Producer -> Consumer Hand-offs
- `Rishabh -> Abhi/Sean`: Manual property/market records with canonical property fields.
- `Sean -> Abhi`: Realtime bet events from host/player flow.
- `Abhi -> Sean`: Fair value outputs + leaderboard/rank updates.

### Storage Responsibilities
- Manual input source: seeded JSON/CSV or admin form entry for market setup.
- Cognee: trade/bet memory graph and queryable history.
- Frontend realtime layer: live leaderboard/chart updates.

## Compatibility Checklist (Git-Backed)
- [x] Scraper path explicitly removed from delivery scope.
- [ ] Manual input format is finalized (fields + validation rules).
- [x] Multiplayer host/join flow commits exist.
- [x] Fair-value algorithm doc/backend scaffolding exists (LMSR).
- [x] Cognee service integration scaffold exists on `origin/main`.
- [ ] QR sharing flow is validated end-to-end with live betting.
- [ ] Shared JSON schema is frozen across manual input/events/fair-value.
- [ ] Cross-branch merge plan is executed (`main` + `multiplayer` only).
- [ ] End-to-end test confirms leaderboard + chart + fair-value consistency.

## Current Risks
- Branch divergence is high across active workstreams (`main`, `multiplayer`, and remote `origin/main`).
- Manual data entry can introduce schema inconsistency if validation is not enforced.
- No enforced single schema contract found in repo yet.
- Potential secret-management issue: API keys in service code should move to env vars before demo.

## Next Milestones
- [ ] Manual input spec finalized (required fields, allowed ranges, timestamps).
- [ ] Merge/sync strategy finalized for active branches (`main` and `multiplayer`).
- [ ] Schema freeze for manual-input/bet/fair-value payloads.
- [ ] One staging E2E run with concurrent bettors and replayable test data.
- [ ] Demo hardening: logging, failure handling, and fallback data snapshot.

## Decisions Log
- `2026-02-07 — Tracker — Updated from git snapshot with commit-backed status.`
- `2026-02-07 — Team — Scraper abandoned; switched to manual data input for hackathon scope.`
- `2026-02-07 — Team — Active development branches restricted to main and multiplayer.`
