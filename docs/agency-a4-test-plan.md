# Agency Workspace A4 - Quote and Commercial Layer Test Plan

**Milestone:** A4 - quote and commercial layer
**Status:** implemented and verified locally (2026-10-22)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` stays dark by default; production enablement remains an explicit ops step.

---

## 1. Scope

A4 lets an agency turn an itinerary into a priced, client-ready quote without leaving TravelAI:

- agency client directory (`AgencyClient`) scoped by `agencyId`
- `AgencyQuote` with embedded client snapshot, line items, markup, tax, discount, validity and terms
- server-computed totals in integer minor units, including per-person pricing
- quote numbers (`Q-YYYY-NNNN`), draft-in-place saves, append-only versions once sent
- status transitions: `draft` -> `sent` -> `accepted`, plus `cancelled` and lazy `expired`
- agency default inclusions/exclusions/terms prefilled into new quotes
- internal preview for planners and a client projection that never exposes markup, margin or the preparing agent
- `/agency/clients` directory page and a Quote tab on each agency trip

Deferred: branded exports and brochure templates (A5/A6), client portal (A7).

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Last local run (2026-10-22):

- backend suite: **405 tests, 405 pass, 0 fail**
- frontend typecheck: clean
- frontend production build: clean

A4-specific structural coverage:

- `services/agency/quotes.test.ts`
  - markup, discount and tax ordering; minor-unit rounding and per-person split
  - currency mismatch and invalid commercial inputs rejected
  - quote number allocation and uniqueness
  - draft saves update in place; saving after a sent/accepted version creates the next version
  - sent quotes are immutable; expired quotes cannot be sent or accepted again
  - lazy expiry maps a past `validUntil` to `expired`
  - client projection strips markup/margin and prepared-by; internal projection keeps them
- `services/agency/models.test.ts`
  - unique `(agencyId, tripId, version)` and `(agencyId, number, version)` indexes
  - tenant indexes on the client directory
- `routes/agency.routes.test.ts`
  - every `/:agencyId` client/quote route requires a tenant member guard
  - client/quote writes require planner rank; client directory delete is admin-only
  - client-supplied totals are rejected by the strict schema
  - cross-tenant client and quote ids answer 404
  - viewer requests never receive internal cost fields
- `services/agency/assets.test.ts`
  - A3 assets remain private while A4 quote/client routes are added

---

## 3. Browser smoke (local, 2026-10-22)

Environment: Vite dev server on `:8080`, backend on `:5000` with `AGENCY_WORKSPACE_ENABLED=true`; `/api/health` reported `agency.milestone: "A4"`.

Verified flow:

1. Owner registers, creates an agency and opens `/agency/clients`.
2. Adds client "Priya Sharma" with company, email and phone; the list and toast confirm the save.
3. Creates a blank agency trip and opens the new **Quote** tab via `?tab=quote`.
4. Selecting the directory client auto-fills name, email and phone; directory edits remain a snapshot.
5. Line item `7 x 8,500`, markup `12.5%`, tax `5%`, discount `3,000` gives:
   - subtotal `59,500.00`, markup `7,437.50`, tax `3,196.88`
   - total `67,134.38`, per person `33,567.19`
6. **Client** preview hides markup and prepared-by and shows package price `66,937.50`; the computed total and per-person price match the internal view.
7. **Save draft** creates `Q-2026-0001` v1 with status Draft; reloading the page returns the same quote and version history entry.
8. **Save & send** locks v1 as Sent, replaces the editor with read-only details and exposes Mark accepted, Cancel quote and New version.
9. **New version** pre-fills the sent values; changing the unit price to `9,000` shows total `71,268.75` and creates v2 while v1 stays at `67,134.38` in history.
10. Selecting v1 in history shows the old totals and a "latest is v2" label; accept/cancel actions are hidden while viewing an older version.
11. **Mark accepted** sets v2 to Accepted, records the acceptance date and removes accept/cancel actions.
12. Settings quote defaults (inclusions, exclusions, terms) save and survive a reload; **Reset to defaults** on a new version repopulates all three lists and the preview.
13. Draft edits were discarded, so no unintended v3 was written.

Viewer read-only behavior was not exercised with a second browser account in this smoke. It is covered by the API projection tests and by the panel gating `canPlan` (no editor, client preview only, no margin toggle).

---

## 4. Fix found during verification

The deep-link loader could get stuck on "Loading trip..." after a hard reload:

- the trip detail was fetched immediately from the route param
- the agency list then resolved and toggled `canManage`
- the library-reset effect re-ran and cleared the already-loaded `selectedTrip`
- the detail effect did not re-run, leaving an empty detail forever

Fix: the agency-change effect now clears only the library lists; the route-owned detail effect is the single owner of `selectedTrip`. A full reload of the trip deep link now renders the quote panel reliably.

---

## 5. Production rollout prerequisites

- Keep `AGENCY_WORKSPACE_ENABLED` off until A4 acceptance.
- Confirm `/api/health` reports `agency.milestone: "A4"` and `writesEnabled: true` when the flag is on.
- Confirm quote/client routes remain tenant-guarded and that client-facing projections never include markup, margin, expenses or prepared-by.
- Treat quote numbers as permanent once issued; do not renumber or reuse them across environments.
- A5 exports must consume the same server totals and client projection rather than recomputing prices in the browser.
