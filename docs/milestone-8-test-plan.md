# Milestone 8 — public gallery acceptance and safety test plan

**Status:** G1–G6 shipped and verified (2026-10-28), including the launch
seed (`npm run seed:gallery`).
The automated suite and the HTTP smoke are green; the browser smoke for the
happy path and moderation surfaces has been run on the Atlas `test` database and
cleaned up.

This plan is the release gate for `docs/roadmap-milestone-8-gallery.md`. It
covers publishing, browsing, cloning, join requests, blocking and reporting on
the personal realm plus the small platform-admin moderation surface. Run the
whole plan against staging before opening the gallery to real traffic.

---

## 1. Environments and flags

| Surface | Flag | Default |
| --- | --- | --- |
| Public gallery (`/explore`, `/travelers/:handle`) | always on | `-` |
| Gallery nav entry | content threshold `total >= 5` | hidden below 5 |
| Platform admin (report queue) | `PLATFORM_ADMIN_ENABLED` | `false` |
| Agency workspace | `AGENCY_WORKSPACE_ENABLED` | `false` |

Notes:

- The gallery has no feature flag. A published trip is public the moment
  `visibility` becomes `public`; unpublishing or moderation hiding is immediate.
- `/explore` stays reachable by URL below the nav threshold so direct links and
  traveler pages keep working.
- The report queue lives inside the existing platform console. With the flag
  off, `/api/admin/*` is `404` and the console renders as unavailable; reporting
  itself keeps working and auto-hide still applies.
- `backend/.env` has no database path in `MONGODB_URI`, so the dev server uses
  the Atlas `test` database. The smoke scripts clean up after themselves; never
  point them at production.

---

## 2. Privacy invariants (structural)

- [ ] Every public payload is built by the allow-list projection module
      (`services/gallery/projection.ts`), pinned by key-set tests.
- [ ] No public response contains budget, `budget_breakdown`, expenses,
      settlements, `generationMeta`, member ids, member names, emails, chat,
      share ids or session data.
- [ ] `GET /api/explore`, `GET /api/explore/:id` and `GET /api/travelers/:handle`
      are anonymous and rate-limited (180 reads / 15 min / IP).
- [ ] A trip whose publisher has no active personal handle is dropped rather
      than rendered without a publisher.
- [ ] Hidden exact dates never appear in the network payload ("Nov 2026 · 6
      days" instead).
- [ ] Clone responses carry the sanitized draft only; the source is re-read
      through the public projection.
- [ ] Report rows and the admin queue never include a reporter's email; the
      owner is never told who reported them.

Automated coverage: `services/gallery/projection.test.ts`,
`services/gallery/explore.test.ts`, `services/gallery/traveler.test.ts`,
`services/gallery/clone.test.ts`, `services/platform/moderation.test.ts`.

---

## 3. Publishing and traveler identity (G1–G2)

- [ ] An owner can publish, unpublish and edit gallery metadata from Share &
      Export; unpublish returns to `unlisted` when a share link exists, else
      `private`.
- [ ] Publishing requires a handle; the form previews exactly what becomes
      public.
- [ ] An agency trip or agency-owned row is refused on publish, and a
      `visibility: 'public'` agency row is rejected at validation.
- [ ] A handle is 3–24 chars, `[a-z0-9_]`, lowercased, reserved words refused,
      and unique across personal accounts.
- [ ] Removing a handle is refused (`409`) while published trips exist.
- [ ] The traveler page shows name, avatar, bio and only published, upcoming
      trips.
- [ ] Hidden-date trips render month + duration on the card and the page.
- [ ] A date-less published trip reads as "dates flexible" instead of
      disappearing.

Automated coverage: `services/gallery/publish.test.ts`,
`services/user/profile.test.ts` (or the profile suite), `traveler.test.ts`.

---

## 4. Browsing and the public trip page (G3)

- [ ] `/explore` lists only public, personal, non-deleted rows with a
      `publishedAt` and a start date today-or-later (or no start date).
- [ ] Past-dated trips drop out automatically; unpublishing 404s immediately.
- [ ] Search is literal (regex escaped), capped; duration buckets, group type
      and tags filter correctly.
- [ ] Cursor pagination is stable on `(publishedAt, _id)` and rejects a
      malformed cursor.
- [ ] The public trip page renders the full itinerary read-only with no
      mutation controls.
- [ ] Per-page `<title>`, description and OG tags are present; crawlability is
      out of scope.
- [ ] The Explore nav entry appears only at `total >= 5`; `/explore` still
      works by direct URL below the threshold.
- [ ] `npm run seed:gallery -- --dry-run` reports 6 trips and 4 curator
      accounts; running it for real lists 6 public trips and prints
      `Explore nav gate: unlocked`, and a second run replaces exactly 6 trips
      without creating duplicate accounts.
- [ ] `npm run seed:gallery -- --cleanup` removes the seeded trips and curator
      accounts, and refuses to delete a curator that owns non-seed trips.
- [ ] Seeded trips keep their season copy (`Winter` in January, `Spring` in
      April, `Autumn` in November, `Dry season` in June) and start at least 30
      days out, so none drops out of the gallery right after a run.

Automated coverage: `services/gallery/explore.test.ts`,
`services/gallery/seedContent.test.ts`, `routes/realmCoverage.test.ts`.

---

## 5. Clone (G4)

- [ ] A signed-in visitor can clone a published trip; anonymous visitors are
      sent through sign-in and resume the clone.
- [ ] The clone is a fresh `workspace: 'personal'`, `status: 'draft'`,
      `visibility: 'private'` trip owned by the cloner.
- [ ] Money, expenses, participants, finance, members, `shareId` and
      `generationMeta` are absent.
- [ ] Exact dates copy only when the source shows them; otherwise the clone is
      "dates flexible".
- [ ] `clonedFrom { tripId, ownerHandle, clonedAt }` is recorded and rendered
      with a link to the traveler profile.
- [ ] The original is untouched; unpublished/expired/agency sources 404.
- [ ] The limiter is 10 clones / day / account.

Automated coverage: `services/gallery/clone.test.ts`.

---

## 6. Join requests and blocking (G5)

- [ ] A stranger can request to join a visible public trip; the note is optional
      and capped at 280 chars.
- [ ] The second pending request is `409`; one pending row per user per trip.
- [ ] Owner and existing members cannot request to join.
- [ ] A blocked user is refused server-side, including the block-vs-request
      race.
- [ ] Only the owner can list the queue or approve/decline/block.
- [ ] Approval grants a **commenter** seat only, never editor; there is no role
      parameter in the module.
- [ ] Approval is atomic; a lost race returns the request to `pending`.
- [ ] Decline is silent and the requester can withdraw a pending request.
- [ ] Blocking from a request upserts the block and declines that person's
      pending requests across every trip the blocker owns.
- [ ] The owner queue shows a pending badge, requester name/avatar/handle, note
      and a safety note; the requester sees pending/approved/withdrawn/member
      state.
- [ ] The limiter is 5 requests / day / account; requests on unpublished or
      hidden trips are refused.
- [ ] Notifications are in-app only (badge + queue); no email is sent.

Automated coverage: `services/gallery/joinRequests.test.ts`,
`routes/realmCoverage.test.ts`, `services/collab/routerCoverage.test.ts`.

---

## 7. Reporting, auto-hide and the owner banner (G6)

- [ ] A signed-in visitor can report a public trip or a traveler profile.
- [ ] Reasons are `spam`, `harassment`, `scam`, `privacy`, `other`; the note is
      optional, trimmed and capped at 500 chars.
- [ ] Reporting your own trip or profile is `400`; the same reporter + target is
      `409` (unique index), and the limiter is 10 reports / day / account.
- [ ] Only public, non-agency trips and active personal profiles are reportable;
      a profile is addressed by its public handle and the resolved user id is
      what the queue stores.
- [ ] Two distinct open reports do not hide anything.
- [ ] The **third** distinct open report sets `moderation.hiddenAt` and the trip
      leaves the listing, the public page, the traveler page, cloning and join
      requests together — all through `publicTripClauses()`.
- [ ] The owner keeps the trip, its data and its publication settings, and Share
      & Export shows "Hidden from the gallery since …" with the review copy and
      a guidelines link.
- [ ] Profiles are queue-only (no auto-hide).
- [ ] Reporting is refused for signed-out users (sign-in resumes the dialog) and
      for agency/platform sessions.

Automated coverage: `services/gallery/reports.test.ts`,
`services/gallery/explore.test.ts`, `traveler.test.ts`,
`joinRequests.test.ts`, `clone.test.ts`.

---

## 8. Admin moderation (G6)

- [ ] `GET /api/admin/reports?status=open|hidden|dismissed&limit=` returns
      grouped targets with aggregate reason counts, report count, last reported
      time and a minimal target summary.
- [ ] The queue never returns itinerary bodies, budgets or member lists; the
      reporter label is name/handle, never email.
- [ ] **De-list** (`POST /api/admin/reports/:targetType/:targetId/hide`) hides
      the trip, closes open reports as `hidden`, and writes
      `content.hidden` to the platform audit.
- [ ] **Dismiss** (`POST …/dismiss`) closes open *and* previously hidden reports
      as `dismissed`, clears the moderation marker (restoring an auto-hidden or
      de-listed listing) and writes `content.dismissed`.
- [ ] A de-listed trip can be restored from the De-listed tab; its reports move
      to Dismissed and the public page returns without re-publishing.
- [ ] Hiding a profile returns `400`; dismissing a profile report is allowed.
- [ ] Both mutations are platform-admin-only, CSRF-protected and use the
      platform write limiter.
- [ ] `/admin/reports` renders Open / De-listed / Dismissed tabs with counts,
      confirm dialogs, public-page links and empty states; a de-listed trip has a
      Restore action.
- [ ] `/guidelines` is public and linked from the report dialog and the join
      request dialog.

Automated coverage: `services/platform/moderation.test.ts`,
`routes/admin.routes.test.ts`, `routes/realmCoverage.test.ts`.

---

## 9. Limits, validation and indexes

- [ ] Every new write is behind `protectPersonal` (or `protectPlatform` for the
      admin mutations) and CSRF.
- [ ] Limiters: reports 10/day/account, join requests 5/day/account, clones
      10/day/account, public gallery reads 180/15 min/IP, auth 10/15 min/IP.
- [ ] Schemas reject unknown fields and cap every free-text field
      (`targetId` ≤ 40, note ≤ 500, join message ≤ 280, summary ≤ 280, tags ≤ 6).
- [ ] Indexes exist: `TripReport {reporterId,targetType,targetId}` unique,
      open-report lookup, `Trip.moderation.hiddenAt` sparse,
      `TripJoinRequest` pending unique, `UserBlock` pair unique.
- [ ] No admin route accepts a tenant trip/agency path (the admin route test
      rejects `trips?|itinerar|clients?|quotes?|exports?|templates?`).

---

## 10. Automated verification

```bash
# backend
cd backend
npm test            # full suite: 709 tests / 0 failures
npx tsc --noEmit

# frontend
cd ../frontend
npm run typecheck
npm run build
```

Latest local run (2026-10-28): backend **709/709**, backend typecheck clean,
frontend typecheck and production build clean.

---

## 11. HTTP smoke (publish → browse → clone → request → approve → report → admin)

Start the API with the platform console enabled, then run the script. It seeds
synthetic accounts directly (the auth limiter is 10 attempts / 15 min / IP),
so it can be re-run without burning sign-in attempts, and it removes every
account, trip, report, join request and block it created.

```bash
cd backend
$env:PLATFORM_ADMIN_ENABLED='true'; npx tsx src/index.ts
# in a second terminal
npx tsx scripts/smoke-m8-g6.mts            # uses :5000
# or: $env:SMOKE_PORT='5000'; npx tsx scripts/smoke-m8-g6.mts
```

The run must end with `PASS` and
`cleanup: users=0 trips=0 reports=0 audits=0`. It covers:

1. owner publishes two trips;
2. anonymous listing + trip page + traveler page, with leak sweeps;
3. cloner gets a private draft with attribution and no money/members;
4. requester asks, duplicate is `409`, owner approves, seat is `commenter`;
5. three distinct reports hide the trip; page/listing/traveler drop it; the
   owner payload carries `moderation.hiddenAt`;
6. profile report by `@handle` resolves to the user id and never auto-hides;
7. admin queue groups the reports, dismiss restores the listing, profile hide is
   `400`, de-listing the sibling trip makes it `404`, and restore puts it back;
8. cleanup reports zero leftover users, trips, reports **and audit rows**.

When the flag is off the admin stage is skipped with `SKIP admin routes`.

---

## 12. Browser smoke (two accounts)

Seed the UI fixture, then walk the browser at `http://localhost:8080` (the Vite
dev server proxies `/api` to `:5000`; use `localhost`, not `127.0.0.1`, because
CORS only allows the `localhost` origin):

```bash
cd backend
npx tsx scripts/smoke-m8-g6-ui.mts
# prints owner + visitor credentials and trip ids, writes the fixture file
npx tsx scripts/smoke-m8-g6-ui.mts --cleanup   # when finished
```

Checklist:

- [ ] `/explore/:id` renders the full itinerary, publisher card and "Report this
      trip".
- [ ] Signed-out report click → `/auth`; after sign-in the trip page reopens
      with the report dialog.
- [ ] The dialog shows five reasons, a 500-char counter, the threshold copy and
      the guidelines link; submitting shows the thank-you toast.
- [ ] `/travelers/:handle` lists only the visible trip and "Report profile"
      opens the profile variant of the dialog.
- [ ] `/guidelines` renders all four sections.
- [ ] Owner signs in, opens the moderated trip and Share & Export shows the
      hidden-listing banner with the review copy.
- [ ] With `PLATFORM_ADMIN_ENABLED=true` and a temporary super-admin,
      `/admin/reports` shows the report, Dismiss moves it to **Dismissed**, and
      De-list moves it to **De-listed** with the badge; the public page 404s and
      Restore returns it to the gallery.
- [ ] Cleanup removes the fixture: `cleanup: users=0 trips=0`.

The scratch helpers used for the admin step are deleted after the run; only the
two `scripts/smoke-m8-g6*.mts` scripts are kept.

---

## 13. Release gate

Ship only when:

- the full backend suite, backend typecheck, frontend typecheck and production
  build pass;
- §2–§9 are green on staging;
- the HTTP smoke passes with zero cleanup leftovers;
- the browser smoke covers publish → browse → clone → request → approve on two
  accounts, plus report → auto-hide → admin dismiss/de-list;
- the gallery has at least five curated published trips before the nav entry is
  enabled — run `npm run seed:gallery` on the target database (use
  `--dry-run` first and `--cleanup` to back it out);
- an owner for report triage is named (who watches `/admin/reports`) and the
  response-time expectation is documented for support.
