# Agency Workspace A8 - Operations, Limits and Audit Test Plan

**Milestone:** A8 - plan limits, usage counters, append-only audit and trip archive
**Status:** implemented and verified locally (2026-10-23)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint sets it to `true` after A9 local verification. Set it to `false` for the kill switch.

---

## 1. Scope

A8 makes the agency workspace operable without direct database access:

- **Plan limits** resolve from env-defined tiers (`AGENCY_PLAN_TIERS`, default `starter`/`pro`) over a per-agency override on the `Agency` row; only TravelAI ops can change the override, via `PATCH /:agencyId/plan` guarded by the `X-TravelAI-Ops` header against `AGENCY_OPS_KEY` (timing-safe). There is no self-serve plan UI.
- **Enforcement** happens inside the mutation services (invites → seats, export create/retry → monthly export quota, asset/template/export writes → storage bytes), never in middleware, so every 409 carries the exact numbers exceeded. The export counter counts rows created *or touched* this month once; retries update the same row.
- **Usage** is computed live from the collections (member count, export count in the month window, byte sums across assets, template versions and unexpired export PDFs) — no counters to drift. The Operations page renders per-metric levels (ok / warning ≥80% / over ≥100%).
- **Audit** rows are append-only, tenant-scoped, newest-first, with resolved actor labels (name, email prefix, "Client (link)" for share events, "TravelAI ops" for actorless plan changes, "Removed member" for unknown ids).
- **Trip archive** is a read-only state (`archivedAt`) distinct from the A2 trash: archived trips stay out of the active list, block edits and new exports, and keep pinned exports and client links working. Unarchive takes `/unarchive` because `/restore` already belongs to trash restore.
- **Rate limits** stack per-agency hourly buckets (exports 60/h, invites 30/h, asset uploads 120/h) after the tenant guard, keyed by `req.agency._id`.

Policy enforced in A8:

- every `/:agencyId` route carries the tenant guard except token-identified invites and the ops-only `/plan` route (ops is not a member; the service checks the secret first and 403s before any DB call)
- usage and audit endpoints require admin rank; planners can neither read them nor change the plan
- the audit projection never exposes internal cost, markup, prepared-by, expenses or chat ciphertext

Deferred: email delivery of usage warnings; in-app billing pages.

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd backend && npm run build
cd frontend && npm run typecheck
cd frontend && npm run build
```

Last local run (2026-10-23):

- backend suite: **468 tests, 468 pass, 0 fail** (incl. `routes/agency.routes.test.ts` route coverage 11/11)
- backend build: clean
- frontend typecheck: clean
- frontend production build: clean

A8-specific coverage:

- `services/agency/plan.test.ts`
  - default tier table values (`starter` 3/10/100 MB, `pro` 15/100/1 GB)
  - unknown tier fails closed (500); unknown override tier fails closed
  - `planLimitsFor` override precedence, per-field overrides, null plan → env default
  - `usageLevel` thresholds: 0/10 and 7/10 ok, 8/10 and 9/10 warning, 10/10 and 12/10 over, 0/0 over
  - `monthStart()` is UTC first-of-month
  - `changeAgencyPlan` with a wrong ops key 403s before any database call
- `routes/agency.routes.test.ts`
  - the A1-A8 route table includes `/usage GET`, `/audit GET`, `/plan PATCH`, `/trips/:tripId/archive POST` and `/trips/:tripId/unarchive POST`
  - usage/audit are admin routes; archive/unarchive require admin rank; `/plan` is the only tenant-guard-exempt route besides token-identified invites
  - the feature gate runs before every agency route

---

## 3. Live service smoke

`backend/scripts/smoke-a8.mts` runs against a throwaway database (`travelai_a8_smoke`) with a real agency, members, trips, templates, exports and assets under a tiny ops-applied override (1 seat / 2 exports / 1 MB), forcing every 409 with real data. It drops the database afterwards.

Last local run (2026-10-23), all 40 checks passed, covering:

1. **Ops plan change:** wrong secret 403, unknown agency 404, unknown tier 500; the tiny override applies and returns resolved limits; the change is audited actorless; another tenant keeps the env default tier.
2. **Seats:** the seat gate blocks the next member at 1/1.
3. **Export quota:** two queued exports fit a monthly cap of 2, the third 409s; moving one row's timestamps into last month frees a slot (raw driver write — see §5), and the cap holds again at 2 counted rows.
4. **Storage:** a 900 KB asset plus a 200 KB push 409s past the 1 MB cap while a 50 KB push passes.
5. **Usage counters:** `agencyUsage` reads back exactly the live rows (seats 1, exports 2, storage 900 KB) and the re-read plan row resolves the override limits.
6. **Audit list:** never leaks another tenant, newest-first, prefix filter narrows to `export.*`, pagination walks the list, actor ids resolve to names, actorless plan rows stay actorless, unknown actors resolve to "Removed member".
7. **Archive lifecycle:** viewer 403, cross-tenant 404, admin archives; idempotent 409s both ways; the default list excludes and the archived shelf shows only the archived trip; edits and new exports 409 while archived; unarchive clears the flag and the trip returns to the active list and accepts edits again; both transitions are audited with the actor.
8. **Assignee filter:** member match returns only assigned trips, `unassigned` returns only the unassigned trip, an invalid id 400s.

Run it with the same secret the ops endpoint checks:

```bash
cd backend
AGENCY_OPS_KEY=smoke-ops-key npx tsx scripts/smoke-a8.mts
```

---

## 4. Browser smoke (local, 2026-10-23)

Environment: Vite dev server on `:8080`, backend on `:5000` with `AGENCY_WORKSPACE_ENABLED=true`.

### 4.1 Operations page (owner)

1. The nav shows **Operations** between Team and Settings for the owner; the page renders the usage card (Seats 1/3, Exports this month 3/10, Storage 0.1/100 MB on Starter) and the audit log with 29 newest-first entries.
2. Actor labels resolve: staff actions show the user label, link events show "Client (link)", system events show "System".
3. Filter chips work server-side: **Plan** shows the "No audit events yet" empty state (this tenant has no plan changes); **Exports** narrows to exactly the `export.*` events.

### 4.2 Trips list: archive shelf and assignee filter (owner)

1. Created a blank trip ("A8 browser smoke trip"); the list shows it with the new **Active/Archived** toggle and the **assignee** combobox.
2. **Archive** removed the trip from the active list with the toast "Trip archived. Pinned exports and client links keep working."
3. The **Archived** shelf showed only the archived trip with a "Restore to the active list" button — duplicate/delete/archive actions hidden on the shelf.
4. **Restore** returned it to the active list ("Trip restored to the active list."), and the empty shelf shows the "No archived trips" copy.
5. The assignee combobox offered All assignees / Unassigned / the member; the member filter returned the two auto-assigned trips and **Unassigned** correctly returned none.
6. The audit log then showed `trip archived` and `trip unarchived` by the acting user with the trip title in the details — the admin can see who did what.

Limitations of this run:

- the in-app browser was hidden, so verification used accessibility snapshots rather than screenshots
- the planner role was not exercised in the browser; its exclusion (no Operations nav, page redirect, 403 on usage/audit) is enforced by the adminOnly nav gate, the page redirect and the admin-rank route guards covered in §2

---

## 5. Fixes found during verification

- **Storage usage always read 0 (real service bug):** `agencyStorageBytes` built aggregation `$match` filters with a string `agencyId`; aggregation pipelines do not cast strings to ObjectIds, so the sum matched nothing. Fixed by passing `new Types.ObjectId(agencyId)` in the matches (`src/services/agency/plan.ts`).
- **Smoke-only: Mongoose `createdAt` is immutable.** With `timestamps: true`, a model `updateOne` silently drops `createdAt` from `$set` (even with `{ timestamps: false }`), so the month-window move left the row counted. The smoke now uses the raw `collection.updateOne` to re-date the row.
- **Smoke-only: ObjectId comparisons.** Direct service calls return `_id`/`assignedTo`/`actorId` as ObjectIds (no JSON serialization), so several `===` string comparisons always failed; wrapped in `String(...)`.

---

## 6. Production rollout prerequisites

- A8 acceptance is complete; the production blueprint now enables the workspace. Keep the flag available as the kill switch.
- Set `AGENCY_OPS_KEY` to a strong secret before enabling; without it every ops plan change fails closed (403).
- Review `AGENCY_PLAN_TIERS` (JSON) and `AGENCY_PLAN_DEFAULT` (`starter`) against the commercial offering before enabling.
- Verify `/api/health` reports the current milestone (`A9`) and `writesEnabled: true` when the flag is on.
- Confirm no client-facing projection (usage, audit, share DTOs, rendered documents) exposes internal cost, markup, prepared-by, expenses or chat ciphertext.
