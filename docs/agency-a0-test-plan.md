# Agency Workspace A0 test plan

**Status:** active for A0. Extend this document as each agency milestone lands.

## Purpose

A0 introduces a dark agency namespace. The test plan has two jobs:

1. Prove that no agency write path exists before the tenancy layer ships.
2. Define the tenant-isolation and individual-regression checks that every
   later agency milestone must satisfy.

## A0 surface under test

- `AGENCY_WORKSPACE_ENABLED` parses fail-closed and defaults to false.
- `GET /api/agency/status` is the only route in the namespace.
- The route is guarded by `requireAgencyWorkspace`.
- `/api/health` reports `agency.enabled` and `agency.writesEnabled: false`.
- No agency model, migration or trip-creation endpoint exists.

## Non-negotiable invariants

| ID | Invariant | Expected result |
|---|---|---|
| TEN-01 | A personal dashboard request must not return an agency trip | Agency trips absent |
| TEN-02 | An agency trip list must not return a personal trip | Personal trips absent |
| TEN-03 | A different agency's trip id must behave like a missing id | 404 |
| TEN-04 | A personal user must not reach agency management routes | 404 |
| TEN-05 | An agency trip route requires both agency membership and a trip role | 404 without access; 403 for insufficient role |
| TEN-06 | A0 has no agency mutation endpoint | Only `GET /api/agency/status` |
| TEN-07 | Disabling the flag must hide the entire namespace | 404 for every `/api/agency/*` |
| TEN-08 | Health discovery must not advertise writes | `writesEnabled: false` |
| REG-01 | Existing personal trip behavior must not change | Full backend suite green |
| REG-02 | Existing frontend must keep building | Typecheck and Vite build green |
| REG-03 | Chat, versions, trash and sharing remain unaffected | Existing tests and smoke pass |

## Test levels

### Unit (A0, automated)

`backend/src/config/features.test.ts`

- missing, empty, whitespace, `false`, `0`, `no`, `off` and arbitrary values
  parse as false;
- `true`, `TRUE`, `1`, `yes`, `on` parse as true.

`backend/src/routes/agency.routes.test.ts`

- the router exposes exactly `GET /status`;
- every route carries `requireAgencyWorkspace`.

### Integration (A1+, automated)

Add tests under `backend/src/services/agency/` or route-level tests when the
models exist:

- create agency, invite staff, accept invite, revoke invite, last-owner guard;
- create an agency trip and read it back;
- personal dashboard and agency dashboard isolation;
- cross-agency id probes for trips, clients, templates and exports;
- owner/admin/planner/viewer capability matrix;
- client collaborator access through trip invites only;
- soft-delete, restore and purge scoped to the agency.

### Export (A5+, automated)

- `ExportDocument` normalization for 1-day, 4-day and 10-day trips;
- missing dates, photos, quote fields and long text;
- client projection excludes internal cost, markup and expenses;
- no chat ciphertext in the DTO;
- PDF page count, no blank pages and visual snapshots;
- signed URL expiry and export-template version pinning.

### Manual smoke (A1+)

- individual user signs in, creates a personal trip, sees it in `/dashboard`;
- agency owner creates an agency and invites a planner;
- planner creates an agency trip and opens the existing itinerary editor;
- client accepts an invite as viewer and has no write controls;
- flag off: `/api/agency/status` and all future agency routes return 404;
- flag on: read-only status works, but no trip mutation is possible in A0.

## Test data rules

- Never run tenant-isolation tests against production or a shared Atlas
  database.
- Use disposable local databases or a dedicated CI database.
- Create two agencies with similar names to catch accidental name-based
  scoping.
- Use different users for owner, planner, viewer and client collaborator.
- Remove test data after the run.

## CI gate

Every agency increment must pass:

```text
npm run test:backend
npm run build:backend
npm run typecheck --workspace=frontend
npm run build --workspace=frontend
```

`npm run verify` runs all four. A red individual suite blocks the increment.

## Exit criteria for A0

- [x] Feature flag exists and fails closed.
- [x] Agency namespace is mounted and returns 404 when disabled.
- [x] Only a read-only status route exists.
- [x] Health reports the flag and `writesEnabled: false`.
- [x] ADR, test plan and wireframes are committed.
- [x] Existing backend suite and frontend build pass.
