# Agency Workspace A2 - Agency Trips and Tenancy Test Plan

**Milestone:** A2 - agency trip workspace and feature parity
**Status:** implemented and verified locally (2026-10-22)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint sets it to `true` after A9 local verification. Set it to `false` for the kill switch.

---

## 1. Scope

A2 adds a tenant-owned trip library without changing the individual traveller product:

- `Trip.workspace` (`personal` | `agency`), `agencyId`, `assignedTo`, `clientId`
- agency trip list/create/assignment/trash routes under `/api/agency/:agencyId`
- agency-aware trip access resolution in the existing `requireTripRole` choke point
- agency mode for the existing AI wizard
- agency trip header, assignment, trip list and trash in the `/agency` shell
- client collaborators continue to use existing trip invites and keep their trip role

Deferred: the client directory and `AgencyClient` model (A4), quotes/templates/exports (A5+).

---

## 2. Automated checks

Run:

```bash
npm run verify
```

Expected:

- backend tests pass, including the agency access matrix, route guard coverage, trip membership seeding and agency model indexes
- backend TypeScript build passes
- frontend typecheck passes
- frontend production build passes

A2-specific structural tests:

- agency owner/admin -> trip owner, planner -> editor, viewer -> viewer
- a new agency trip does not seed its creator into `members[]`
- `workspace: 'agency'` requires `agencyId`; personal is the default
- agency library/trash/assignment indexes exist
- every `/api/agency/:agencyId/trips/:tripId` route carries `requireAgencyTripRole`
- create and assignment require planner rank; trash requires admin rank

---

## 3. Real HTTP + Mongo smoke

A disposable `mongodb://localhost:27017/travelai_a2_smoke` database was used with a local server started with:

```bash
AGENCY_WORKSPACE_ENABLED=true PORT=5100 \
MONGODB_URI=mongodb://localhost:27017/travelai_a2_smoke \
npm run start --workspace=backend
```

The smoke used real signup, agency invites, Bearer sessions and HTTP routes. It passed 35 assertions and dropped the disposable database afterwards.

Verified:

1. An agency owner creates a trip with `workspace: 'agency'`, its `agencyId`, and itself as `assignedTo`.
2. The creator is **not** added to `trip.members`; agency access comes from `AgencyMember`.
3. The agency library lists the tenant trip and excludes a directly inserted personal trip.
4. The personal library lists the personal trip and excludes agency staff trips.
5. A user from another agency gets 404 for the library, a cross-agency `PATCH` and a direct trip read.
6. Planner `GET /api/itinerary/:id` returns `role: "editor"` plus `agencyRole: "planner"`.
7. Viewer `GET /api/itinerary/:id` returns `role: "viewer"` plus `agencyRole: "viewer"`.
8. Planner can save itinerary content through `PUT /api/itinerary/:id/itinerary`.
9. Viewer cannot save itinerary content (403).
10. Viewer cannot create an agency trip, list trash or start agency AI generation (403).
11. A personal user targeting another agency for generation gets 404 before any paid AI call.
12. Planner can assign a trip to another agency member.
13. Assignment to a user outside the agency is rejected (400); viewer assignment is rejected (403).
14. Agency ownership transfer is rejected even for an agency admin.
15. Admin creates a client trip invite; the client accepts and reads the trip with `role: "commenter"` and no `agencyRole`.
16. The client cannot use the agency trip library (404), but the invited trip appears on the client's personal dashboard through membership.
17. A client cannot duplicate an agency trip (403).
18. Admin can soft-delete the trip; it disappears for the client and appears in the agency trash.
19. Admin restores it; the client sees it again.
20. Planner cannot delete the trip (403); admin maps to owner and can.
21. At A2 acceptance, `/api/health` reported `agency.milestone: "A2"` (current builds report `A9`).

---

## 4. Browser checks still recommended

These are UI-only checks and do not change the server guarantees above:

- `/agency/trips` empty state and "Plan with AI" CTA on a fresh agency.
- Agency wizard completes and hands off to the exact generated trip.
- Assignment picker lists agency members and survives a refresh.
- Agency trip header shows the caller's role and "Client access via the People tab".
- Planner sees Save/edit but no delete; viewer is read-only; owner/admin sees trash actions.
- The People tab hides ownership transfer on an agency trip and hides "Leave trip" for agency staff.
- The client's personal dashboard shows the invited agency trip under shared trips and hides duplicate for it.
- Personal dashboard, planner and exports remain visually unchanged.

---

## 5. Production rollout prerequisites

- A2 acceptance is complete; the production blueprint now enables the workspace after A9. Keep the flag available as the kill switch.
- Confirm `/api/health` reports `database: connected`, durable storage and the current milestone (`A9`).
- Run the existing membership backfill/audit separately; A2 does not require a workspace backfill because legacy documents behave as personal through `$ne: 'agency'`.
- Do not expose the agency client directory or quote fields until A4/A5 projections hide internal commercial data from client viewers.
