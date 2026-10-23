# Agency Workspace A8 - Operations, Limits and Audit: Design

**Milestone:** A8 - assignment filters, trip archive, plan limits, per-agency rate limits, usage counters, audit log viewer
**Status:** Implemented and verified (2026-10-23)
**Depends on:** A2, A5 (both verified)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint was enabled after A9 local verification.

Decisions locked with the user (2026-10-23):

1. **Trip archive** is a distinct read-only state (`archivedAt` on Trip) — not the A2 trash. Archived trips leave the active list, stay out of the trash, block editing, are restorable, and **never break already-pinned exports, shares or quote views**.
2. **Plan management** is env-configured tiers plus a per-agency override on the Agency row, changeable only by TravelAI ops via a secret-guarded endpoint. No self-serve upgrade UI for the pilot.
3. **Audit log and usage live on one owner/admin "Operations" page** (`/agency/operations`).
4. **One pass**, like A6/A7: backend → frontend → tests → smoke → docs.

---

## 1. What already exists (verified 2026-10-23)

- Tenant guard sets `req.agency`, `req.agencyMember`, `req.agencyRole` on every `/:agencyId` route (agencyAccess.middleware.ts), so limiters and rank checks have the tenant in hand.
- `AgencyAudit` rows are append-only with `(agencyId, action, createdAt)` index and actorless support (A7 share events). `recordAgencyAudit` is already called for `export.requested/completed/failed`, `template.*`, `share.*`, `quote.accepted` and more. There is **no read endpoint and no viewer UI**.
- Export history already shows Failed jobs with the error text and a Retry button for planners (A5) — the "failure and retry visible" test is mostly satisfied; A8 adds the audit tie-in.
- Trip detail has an assignee select (PATCH); the trips list has search + status filters only (no assignee filter, no chips).
- "Duplicate as draft" exists; trash/restore/purge exists (A2, owner-only).
- Rate limiters are keyed per user/IP (`userOrIpKey`); no per-agency buckets exist.
- Storage-size fields exist: `AgencyAsset.bytes`, `AgencyExport.bytes`, `AgencyTemplateVersion.sourceBytes`.

## 2. Plan model and limits (backend)

### Tiers
- `env.ts`: `AGENCY_PLAN_TIERS` (Zod-parsed JSON object) and `AGENCY_PLAN_DEFAULT` (tier id).
- Pilot tiers: `starter` (3 seats, 10 exports/month, 100 MB storage), `pro` (15 seats, 100 exports/month, 1 GB storage).
- `Agency.plan`: optional `{ tierId, seats?, monthlyExports?, storageMb? }`; missing fields fall back to the tier defaults. Default tier applies when `plan` is absent.

### Service `services/agency/plan.ts`
- `planLimitsFor(agency)` — resolves tier + overrides to `{ seats, monthlyExports, storageMb }`.
- `agencyUsage(agencyId)` — live-computed: seats = active member count; exportsThisMonth = `AgencyExport` rows created or touched since the 1st of the current month (a retry updates `updatedAt` rather than inserting, so each row counts once; a retry consumes quota only when the row was not already counted this month); storageBytes = sum of live asset bytes + template version `sourceBytes` + export `bytes` where `expiresAt > now`.
- Assertions used at enforcement points; every violation is a 409 with the numbers in the message:
  - `assertSeatAvailable(agency)` — in `createAgencyInvite` **and** `redeemAgencyInvite` (an invite sent while seats were free must not redeem after seats filled).
  - `assertExportQuota(agency)` — in `createAgencyExport` and `retryAgencyExport`.
  - `assertStorageQuota(agency, additionalBytes)` — in `uploadAgencyAsset`, `createAgencyTemplate`, `addAgencyTemplateVersion`.
- Warnings: usage endpoint reports per-metric `ok | warning (≥80%) | over (≥100%)`.

### Routes
- `GET /:agencyId/usage` — owner/admin. `{ plan, used, warnings }`; never exposes other tenants.
- `GET /:agencyId/plan` — owner/admin (tier id + resolved limits; ops-only fields excluded).
- `PATCH /:agencyId/plan` — **ops only**: requires `X-TravelAI-Ops` header matching `AGENCY_OPS_KEY` (constant-time compare). Changes tier/overrides, writes `plan.changed` audit with the ops actor label. Planners/admins/owners get 403 — satisfies "planner cannot change plan" and keeps pilot plan changes out of the DB.

## 3. Audit log viewer

- `GET /:agencyId/audit?page=1&limit=50&action=` — owner/admin, tenant-scoped, newest first; optional action prefix filter (e.g. `export.`). Response maps `actorId` to a resolved actor label (bulk-fetch users; fallback "Removed member"; public token events show "Client (link)").
- Append-only: no update/delete endpoints exist or get added.
- Frontend: see Operations page.

## 4. Trip archive and assignment filters

- `Trip.archivedAt?: Date` + index.
- `POST /:agencyId/trips/:tripId/archive` and `/unarchive` — owner/admin (matches A2 trash rank). The restore route is named `unarchive`, not `/restore`, because `POST .../restore` is already the A2 trash restore; the two states stay distinct. Archived trips: excluded from `listAgencyTrips` by default (`archived=true` param to view), block itinerary edits and new exports (409), and stay resolvable for pinned export retries, share links and quote views — covered by an explicit test that a proposal link still opens after archive.
- `listAgencyTrips` gains `assignedTo` filter (`userId` or `unassigned`); the trips page gets an assignee filter dropdown and assignee chips on cards. Assignment itself already exists on the detail page.

## 5. Per-agency rate limits

- New key generators in `rateLimiter.middleware.ts`: `agencyKey` (`req.agency?._id`, shared bucket per tenant) and `userAgencyKey` (`userId + agencyId`). Both require the limiter to run after the tenant guard — route chains already order it that way.
- New limiters: `agencyWideExportLimiter` (60/hr per agency, stacked on the existing per-user export limiter), `agencyInviteCreateLimiter` (30/hr per agency), `agencyAssetUploadAgencyLimiter` (120/hr per agency, stacked on the per-user one). Public share routes stay IP-keyed as-is.

## 6. Operations page (frontend)

- New route `/agency/operations` with a nav entry visible to owner/admin only.
- **Usage card:** tier name, seats used/total, exports used/total this month, storage used/total (progress bars, warning styling at ≥80%, red at ≥100%).
- **Audit log:** table of time, actor, action label, target, metadata snippet; action filter chips; load-more pagination; empty state.
- No other page changes beyond the trips-list filters/archive actions.

## 7. Tests, smoke and docs

- Unit: plan resolution (tier + overrides), each 409 enforcement point, usage computation, audit listing (tenant scope, rank, filter, pagination, actor labels), archive/restore semantics incl. pinned-share invariance, `assignedTo` filter.
- Route coverage: A1-A8 table gains the new routes; auth matrix — usage/audit/archive owner+admin, planner 403; plan PATCH ops-only.
- `scripts/smoke-a8.mts`: throwaway DB, tiny per-agency override (e.g. 1 seat / 2 exports / 1 MB) to force each 409, usage numbers match rows, export lifecycle appears in audit, archive → list excludes → pinned share still 200 → restore, ops PATCH with/without secret, planner cannot change plan.
- Browser smoke: Operations page (usage + audit), trips archive/restore, assignee filter (using the A6/A7 hidden-browser technique — accessibility snapshots, no `window.confirm`, no clipboard reads).
- Docs: `docs/agency-a8-test-plan.md`; roadmap A8 status updated at the end.

## 8. File map

Backend: `src/config/env.ts`, `src/models/Agency.ts`, `src/models/Trip.ts`, `src/services/agency/plan.ts` (new), `src/services/agency/audit.ts`, `trips.ts`, `invites.ts`, `exports/exports.ts`, `assets.ts`, `exports/templateManagement.ts`, `src/controllers/agency.controller.ts`, `src/schemas/agency.schema.ts`, `src/routes/agency.routes.ts`, `src/middleware/rateLimiter.middleware.ts`, `src/index.ts` (health milestone, now `A9`), tests (`plan.test.ts`, `audit.test.ts` new; trips/routes updated), `scripts/smoke-a8.mts`.

Frontend: `src/pages/agency/AgencyOperations.tsx` (new), `src/pages/agency/AgencyTrips.tsx`, `src/pages/agency/AgencyApp.tsx`, `src/pages/agency/AgencyLayout.tsx`, `src/services/api.ts`, `src/types/agency.ts`.

## 9. Exit criteria mapping

- "The pilot can be operated without direct database access" — archive/restore, ops plan override, usage and audit all live in API/UI.
- "The agency admin can see who exported what and how much is used" — Operations page shows usage per limit and an audit log of `export.requested/completed/failed` with actors.
