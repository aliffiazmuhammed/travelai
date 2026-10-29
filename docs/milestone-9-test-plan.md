# Milestone 9 — Agency directory & enquiries acceptance test plan

**Status:** D1–D8 shipped (2026-10-29). This plan is the release gate for
`docs/roadmap-milestone-9-agency-directory.md`; run it whole against staging
before announcing the directory.

It covers the public directory and profile, packages, the two-sided enquiry
flow, verification/delisting, the launch gate and the D8 conversation and
proposal-comparison surfaces. Companion documents:
`docs/agency-operations-runbook.md` (operating procedures) and
`docs/agency-a9-test-plan.md` (workspace baseline).

---

## 1. Environments and flags

| Surface | Flag / gate | Default |
| --- | --- | --- |
| Public directory (`/agencies`, `/agencies/:slug`) | content threshold `total >= 5` for the nav entry | nav hidden below 5 |
| Public logo and package covers | same directory eligibility as the profile | - |
| Agency workspace (profile/package/enquiry management) | `AGENCY_WORKSPACE_ENABLED` | `false` |
| Platform admin (verification + delisting) | `PLATFORM_ADMIN_ENABLED` | `false` |
| M9 launch gate | `npx tsx scripts/launch-gate-m9.mts` | exits `1` until met |

Notes:

- The directory has no feature flag of its own. A published profile is public
  immediately; unpublishing or an ops hide is effective on the next read.
- `/agencies` and `/agencies/:slug` stay reachable by URL below the nav
  threshold so direct links work during recruitment.
- With the platform flag off, every `/api/admin/*` path is `404`; no verification
  or delisting action can be performed.
- Public reads are rate-limited by `publicDirectoryLimiter` (180 requests /
  15 min / IP) across listing, facets, profile and logo.

---

## 2. Privacy invariants (structural)

- [ ] Public profiles are built only by `services/directory/projection.ts`; the
      key set is pinned by `DIRECTORY_PROFILE_KEYS` and its package/card peers.
- [ ] A public profile never contains the agency id, `createdBy`, plan, billing,
      contact email, staff, quotes, clients, `tripId`, asset ids or moderation
      fields.
- [ ] Contact phone and GSTIN appear only with `showPhone` / `showGstin`; the
      default payload carries `null` for both.
- [ ] The logo is served from `/api/agencies/:slug/logo`, never from the
      authenticated `/api/agency/:agencyId/assets/...` route.
- [ ] Package covers are bytes behind `/api/agencies/:slug/packages/:id/cover`;
      the asset URL never reaches a stranger.
- [ ] An enquiry acknowledgement echoes an id, status and timestamp only; no
      contact data, agency internals or email is returned.
- [ ] Ops cannot read enquiry bodies or tenant content through the directory
      actions; the platform detail exposes state, readiness, reply time and
      package metadata only.

Automated coverage: `services/directory/projection.test.ts`,
`services/directory/profile.test.ts`, `services/directory/packages.test.ts`,
`services/directory/enquiries.test.ts`.

---

## 3. D1 — profile contract and lifecycle

- [ ] Readiness requires an about of at least 80 characters, a base city, one
      destination, one service and a logo.
- [ ] `PUT /api/agency/:agencyId/profile` normalises lists and never stores an
      unknown service or language id.
- [ ] Publish is refused (`400`) with every missing requirement named; the row is
      not saved.
- [ ] Publishing stamps `publishedAt` once; republishing keeps the original
      date; unpublishing clears it and returns to `draft`.
- [ ] The tenant view shows `state`, `verified` and `underReview`; the public
      view shows none of them except the derived `verified` badge.
- [ ] A profile under review cannot be republished by the agency (`409`).

Automated coverage: `services/directory/profile.test.ts`,
`services/directory/taxonomy.test.ts`, `routes/realmCoverage.test.ts`.

---

## 4. D2 — agency-side editor

- [ ] Settings → Public profile loads the current draft, catalog, readiness and
      preview; the preview matches the public page layout.
- [ ] Save persists exactly the presented fields; a save with no change is
      refused with a readable message.
- [ ] Publish is disabled until readiness passes; the missing list is visible.
- [ ] Unpublish returns the profile to draft without deleting it.
- [ ] A hidden profile shows the review notice and blocks republishing.

Automated coverage: projector/profile suites above; the editor is exercised by
the browser pass in §11.

---

## 5. D3 — public listing and profile

- [ ] `/agencies` lists published profiles on active agencies, newest first,
      with a stable cursor, `limit + 1` `hasMore` and a filtered `total`.
- [ ] Search matches agency name, about, base city, destinations and
      specialties; `?city=`, `?destination=`, `?specialty=` and `?language=`
      narrow the list and survive reload.
- [ ] Facets are counted over eligible profiles only; a suspended agency or a
      hidden/draft profile contributes no card, facet count or price.
- [ ] `/agencies/:slug` answers `404`/not-available for unknown, suspended,
      draft, hidden or ops-hidden rows.
- [ ] The logo route applies the same eligibility and serves only the tenant's
      image asset.
- [ ] An unverified but published profile renders without the badge.

Automated coverage: `services/directory/listing.test.ts`,
`services/directory/logo.test.ts`, `profile.test.ts`, `projection.test.ts`.

---

## 6. D4 — packages as snapshot cards

- [ ] A package is created from a trip as a copy (title, nights, highlights) and
      never reads the trip again; money never comes from the trip.
- [ ] One source trip can produce one package; a second attempt is `409`.
- [ ] Publish requires a title and a one-line summary; readiness is enforced.
- [ ] A cover must be an image from the same agency; a foreign or non-image
      asset is refused.
- [ ] Public profile and listing show only published, dated, non-hidden
      packages; the listing "from" price is the lowest published number.
- [ ] An unpriced package renders "on request"; deleting the source trip leaves
      the package live.

Automated coverage: `services/directory/packages.test.ts`,
`services/directory/projection.test.ts`, `profile.test.ts`.

---

## 7. D5 — enquiry intake

- [ ] Submission requires a personal session: a guest request gets `401`
      before any validation, and the dialog shows a sign-in prompt, not the form.
- [ ] A signed-in submission requires consent, a 20–1500 character message,
      1–20 adults, at most 30 people and valid calendar dates.
- [ ] Unknown fields are rejected; a missing or foreign package is `404`.
- [ ] A suspended, unpublished or ops-hidden agency answers the same `404` as
      its page.
- [ ] The acknowledgement contains no contact echo and no agency internals.
- [ ] Limits: IP 5/day, email 3/day, agency 50/day.
- [ ] The enquiry is attributed to the caller's personal session `userId`; an
      agency or platform session cannot submit one and no guest token is minted.
- [ ] The tenant inbox is scoped by `agencyId` and shows the lead immediately;
      a personal history read returns only the caller's rows.

Automated coverage: `services/directory/enquiries.test.ts`,
`routes/realmCoverage.test.ts`.

---

## 8. D6 — inbox actions and conversion

- [ ] Claim is a conditional update: two planners racing cannot both win; the
      loser receives `409`.
- [ ] Reassignment is admin-only and must target a tenant member; a planner may
      release their own claim.
- [ ] `lost` requires a reason, and reopening clears it; `won` stamps
      `convertedAt` once.
- [ ] Conversion is idempotent: a retry, or a duplicate-key race, returns the
      same tagged client; an existing client with the same email is reused and
      tagged once.
- [ ] The conversion hand-off prefills a blank quote with the client and party
      size and never overwrites an existing draft.
- [ ] The consumer projection hides `client`, `assignee`, `assignedTo`,
      `lostReason` and package `tripId`.

Automated coverage: `services/directory/enquiries.test.ts`,
`routes/agency.routes.test.ts`.

---

## 9. D7 — verification, reply time, ops delisting and launch gate

### Verification

- [ ] Ops can verify and unverify a profile from the agency detail drawer; the
      badge appears/disappears on the listing card and profile page.
- [ ] Verification does not change publication; unverifying leaves the profile
      listed and its packages visible.
- [ ] Both actions are audited on the platform trail and in the tenant log.

### Reply time

- [ ] "Usually replies in ~X h" is computed from the median of the last 20
      replied enquiries.
- [ ] The line is hidden until at least 5 replied enquiries exist.
- [ ] A read failure degrades to hidden (`null`), never a `500`.
- [ ] The value is a rounded whole number of hours with a floor of 1.

### Ops hide / restore

- [ ] Hiding a profile removes it from the listing, facets, direct URL, logo,
      package covers and enquiry entry points immediately.
- [ ] The profile keeps `publishedAt`; restoring returns it to `published`, while
      a never-published profile returns to `draft`.
- [ ] Hiding a package removes it from the profile and listing price without
      rewriting the agency's `draft`/`published` state; restoring returns it
      where it was.
- [ ] Publishing a hidden package is refused (`409`).
- [ ] Repeated verify/hide/restore calls are idempotent (`changed: false`) and
      write no duplicate audit rows.
- [ ] Every operation is rate-limited, platform-admin-only and audited.

### Launch gate

- [ ] `npx tsx scripts/launch-gate-m9.mts` reports at least 5 published +
      verified active profiles.
- [ ] Every eligible profile has at least one published, non-hidden package
      with a price.
- [ ] At least one lead has been replied/quoted/won (the test enquiry answered
      end-to-end).
- [ ] The script exits non-zero while any check fails and never writes.

Automated coverage: `services/directory/insights.test.ts`,
`services/platform/directoryAdmin.test.ts`, `routes/admin.routes.test.ts`,
`services/platform/agencies.test.ts`.

---

## 9A. D8 — conversations and proposal comparison

### Evidence link and the sign-in gate (D9)

- [ ] A signed-out traveller sees "Sign in to send this enquiry" instead of the
      form; the link goes to `/auth` and returns to `/agencies/:slug`, reopening
      the dialog with the package preselected.
- [ ] A successful submission shows "Open conversation" (`/enquiry/:id`) and
      "All enquiries" (`/enquiries`) and no URL to copy.
- [ ] A legacy guest link minted before D9 still opens `/conversation/:token` with the opening enquiry, the agency
      name and every reply; opening it marks the agency's replies read.
- [ ] A guest reply appears in the agency inbox with an unread badge.
- [ ] The link stops working after `conversationTokenExpiresAt`; an unknown,
      expired or suspended-agency token shows the same not-available state.
- [ ] The raw token never appears in the agency inbox, logs or audit metadata.

### Signed-in traveller

- [ ] `/enquiries` (and the signed-in-only "Enquiries" nav item) lists every
      enquiry sent while signed in: agency, package, dates and party, status,
      unread replies, last message, live-proposal count, "Open conversation" and
      a link to `/proposals`.
- [ ] The list counts a proposal only while its link is live: a revoked or
      expired link drops the count, and the number agrees with `/proposals`.
- [ ] `/profile` shows the three newest enquiries with "View all N enquiries"
      into `/enquiries`; `/enquiry/:id` carries an "All enquiries" back link.
- [ ] Legacy guest rows never appear in the list; a signed-out visit to
      `/enquiries` redirects to `/auth`, and the nav item is absent.
- [ ] Another account, an agency session and a platform session all get 404/403
      for that thread.
- [ ] Sending a reply marks the agency's earlier messages read and shows the
      traveller's own message as sent/read.

### Agency inbox

- [ ] The inbox card shows an unread count for new traveller messages.
- [ ] Opening the detail sheet loads the thread and clears the unread badge.
- [ ] A planner can reply; a viewer sees the thread read-only with no composer.
- [ ] The first reply stamps `Replied <date>`, moves `new → replied` and writes
      one `enquiry.replied` audit row.

### Proposal comparison

- [ ] `/proposals` lists every live proposal answering the traveller's own
      enquiries, side by side (agency, trip, total, per-person, validity,
      inclusions/exclusions).
- [ ] "View document" opens the exact pinned document (HTML or PDF) and the PDF
      downloads with the same bytes as the agency's share link.
- [ ] "Ask about this" sends a message on the thread the proposal answers; a
      proposal with no resolvable conversation shows no message action.
- [ ] Nothing is merged or created; the page has no booking, acceptance or trip
      action.
- [ ] An expired or revoked proposal link disappears; a foreign link id is 404
      for a signed-in traveller and for a guest whose enquiry it does not answer.

Automated coverage: `services/directory/conversations.test.ts`,
`services/directory/enquiries.test.ts`, `services/agency/proposals.test.ts`,
`routes/realmCoverage.test.ts`, `routes/agency.routes.test.ts`.

---

## 10. Limits, validation and indexes

- [ ] Every tenant mutation sits behind `protectAgency` + CSRF; every ops
      directory mutation uses `platformWriteLimiter`.
- [ ] Public reads use `publicDirectoryLimiter`; enquiry writes keep the IP,
      email and agency caps.
- [ ] Schemas reject unknown fields and cap every free-text value (about 1200,
      summary 280, message 1500, hide reason 500).
- [ ] Indexes exist: one profile per tenant, listing
      `{state, publishedAt, _id}`, package library/public reads,
      one package per source trip, enquiry inbox/history/conversion, and the
      partial reply-time `{agencyId, repliedAt}` index.
- [ ] The admin route table contains no tenant-content path; the route test
      rejects `trips?|itinerar|clients?|quotes?|exports?|templates?`.

---

## 11. Automated and manual verification

```bash
# backend
cd backend
npx tsc --noEmit
npm test
npx tsx scripts/launch-gate-m9.mts   # against staging

# frontend
cd ../frontend
npm run typecheck
npm run build
```

Latest local run (2026-10-29): backend **851/851**, backend typecheck clean,
frontend typecheck and production build clean; targeted D8 suites 16/16 and
the D9 enquiry + realm suites 36/36.

Browser pass (synthetic agency, all rows deleted afterwards):

1. Ops verifies the agency → badge appears on `/agencies` and the profile.
2. Post ≥5 replies to synthetic enquiries → the reply-time line appears; with 4
   it stays hidden.
3. Ops hides the profile → it disappears from `/agencies`, every facet chip,
   `/agencies/:slug`, the logo and the enquiry form; restore brings it back.
4. Ops hides one package → it leaves the profile and the listing "from" price;
   restore returns it in the same state.
5. Run the launch gate against the seeded staging database and confirm PASS on
   all three checks.
6. Signed out, open the profile and package cards: the dialog shows the sign-in
   prompt, and a direct guest `POST` returns `401`. Sign in from the prompt,
   land back on the profile with the dialog reopened (package preselected), send
   the enquiry, and confirm "Open conversation" reaches the thread; then sign in
   as the agency and confirm the unread badge and thread.
7. Send a proposal from the agency, open `/proposals` as the traveller, compare
   two proposals and ask a question from a card; confirm it lands on the right
   thread.
8. Open `/enquiries` as that traveller: the enquiry, unread badge and proposal
   count match the inbox and `/proposals`; "Open conversation" lands on the
   thread and "View all" from the profile preview reaches the same list.
