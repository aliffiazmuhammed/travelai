# Milestone 8 — Public Gallery & Traveler Profiles

**Status:** G1–G6 shipped and verified (2026-10-28).
**Scope:** let a personal account publish a trip to a public, browsable gallery with a traveler profile; let visitors clone a published itinerary into their own draft or request to join it; keep everything monetary, membership- or identity-related off the public payload.

**Locked decisions (2026-10-27):**

| Decision | Choice |
|---|---|
| Public dates | Exact dates shown by default; per-trip "hide exact dates" toggle renders month + duration instead |
| Joining | Every request is queued for the owner; approval grants **commenter** only — editor is never granted by request |
| Clone | Ships in v1 |
| Moderation | Accepted as minimal (not a full queue): report endpoint + auto-hide threshold + a "Reported" filter in the existing platform admin list |
| Email | Stays deferred — join requests notify in-app only |

**Deliberate non-goals:** agency trips are never publishable (agency proposals stay token-based); no likes, follows, feeds, DMs, reviews or recommendations in this milestone; no SSR/SEO prerendering until a later milestone.

---

## 1. Where this sits

The product already has three sharing modes (Milestone 6): private, members with roles, and an unlisted public link (`/shared/:shareId`). This milestone adds a fourth, strictly separate mode:

| Mode | Audience | Discoverable | Exists today |
|---|---|---|---|
| Private | owner (+members) | no | ✅ |
| Unlisted link | anyone with the URL | no | ✅ |
| **Published** | **anyone, browsable** | **yes** | **Milestone 8** |

A trip can hold an unlisted link and a published listing at the same time, but the two payloads are different documents. Publishing never reuses the share link and never exposes `shareId`.

## 2. Invariants (structural, tested)

1. Public payloads are **allow-lists in their own module** (`services/gallery/projection.ts`), pinned by a key-set test — never a reuse of `projectPublicTrip`.
2. **Money never leaves the server**: budget, expenses, settlements, internal notes, generation metadata, member identities and co-traveler names are structurally absent from the projection because they are never selected.
3. **Only personal-realm, non-agency trips** can be published; the publish service rejects `workspace: 'agency'` and agency-owned rows.
4. **Unpublish and revoke are immediate**: public routes return 404 the moment visibility leaves `public`.
5. **Join approval creates a commenter membership only** through the existing membership service; there is no code path that turns a request into editor.
6. Every anonymous route is rate-limited; every new route is covered by the realm-coverage test.

## 3. Data model

| Model | Change |
|---|---|
| `Trip` | `visibility: 'private' \| 'unlisted' \| 'public'` (default private; migration maps existing `isPublic` → `unlisted`), `publishedAt`, `gallery: { hideExactDates, summary?, tags? }`, `moderation: { hiddenAt?, hiddenBy?, source: 'auto_report' \| 'admin' }`. Indexes for `visibility + start date`, `tags`, `publishedAt`, and a sparse `moderation.hiddenAt` |
| `User` | `profile: { handle (unique, sparse, lowercase), bio }`; avatar reuses `avatarUrl` |
| `TripJoinRequest` (new) | tripId, requesterId, message (≤280), status `pending/approved/declined/withdrawn`, decidedBy, decidedAt; one pending per trip+user (partial unique index) |
| `UserBlock` (new) | blockerId, blockedId, createdAt; unique pair |
| `TripReport` (new) | reporterId, targetType `trip/profile`, targetId, reason (`spam/harassment/scam/privacy/other`), note (≤500), status `open/hidden/dismissed`, `resolvedBy/resolvedAt`; unique per reporter+target. Auto-hide threshold: 3 distinct open reporters |

## 4. API surface

Public (anonymous, rate-limited, projections only):

| Route | Purpose |
|---|---|
| `GET /api/explore` | gallery listing: published, future-dated, not deleted; filters (destination text, duration bucket, group type, tags); cursor pagination — **G3 ✅** |
| `GET /api/explore/:tripId` | public trip page payload — **G3 ✅** |
| `GET /api/travelers/:handle` | profile + that traveler's published trips — **G2 ✅** |

Personal realm (`protectPersonal`; trip routes live under `/api/itinerary`, as
all trip CRUD does):

| Route | Purpose |
|---|---|
| `PATCH /api/itinerary/:id/publish` | publish / unpublish / update gallery metadata (owner only) — **G1 ✅** |
| `POST /api/itinerary/:id/clone` | copy a published trip into a new draft — **G4 ✅** |
| `POST /api/itinerary/:id/join-request` | request to join (auth, 5/day, blocked refused) — **G5 ✅** |
| `GET /api/itinerary/:id/join-request` | my latest request + membership state — **G5 ✅** |
| `DELETE /api/itinerary/:id/join-request` | requester withdraws a pending request — **G5 ✅** |
| `GET /api/itinerary/:id/join-requests` | owner queue (pending only) — **G5 ✅** |
| `POST /api/itinerary/:id/join-requests/:requestId/{approve,decline,block}` | owner decision; approval grants commenter — **G5 ✅** |
| `PATCH /api/auth/profile` | update name, handle + bio (`GET /api/auth/me` reads them) — **G1 ✅** |
| `GET /api/auth/profile/handle-available` | availability check — **G1 ✅** |
| `GET /api/blocks`, `POST/DELETE /api/blocks/:userId` | block list — **G5 ✅** |
| `POST /api/reports` | report a trip (by id) or profile (by public handle) — **G6 ✅** |

Platform admin (moderation only; `PLATFORM_ADMIN_ENABLED`):

| Route | Purpose |
|---|---|
| `GET /api/admin/reports?status=open\|hidden\|dismissed&limit=` | grouped report queue with aggregate reasons — **G6 ✅** |
| `POST /api/admin/reports/:targetType/:targetId/hide` | de-list a reported trip and close its reports — **G6 ✅** |
| `POST /api/admin/reports/:targetType/:targetId/dismiss` | close reports and restore an auto-hidden listing — **G6 ✅** |

---

## 5. Milestones

### G1 — Publish contract, projection and profile model

**Goal:** the server can describe, publish and project a gallery trip; nothing is visible in the UI yet.

- Trip visibility, `publishedAt`, `gallery` fields + indexes + migration from `isPublic`.
- `services/gallery/projection.ts`: `projectGalleryTrip` and `projectTravelerProfile` (allow-lists) + key-set tests.
- Publish/unpublish endpoints with owner-only enforcement and the agency-realm rejection.
- Profile model + handle rules (3–24 chars, `[a-z0-9_]`, reserved list) + availability endpoint.
- Realm-coverage and permission tests.

**Acceptance:** publishing an agency trip is impossible; the projected key set is pinned; unpublished trips 404; migration preserves every currently shared link.

**Shipped 2026-10-27.** Artifacts:

- `models/Trip.ts`: `visibility` (default `private`), `publishedAt`, `gallery` (`hideExactDates`/`summary`/`tags`), gallery indexes, and a `pre('validate')` refusal of `visibility: 'public'` on agency rows.
- `models/User.ts`: `profile.handle`/`profile.bio`, partial unique index `personal_profile_handle_unique`, non-personal handles rejected.
- `services/gallery/projection.ts`: `projectGalleryTrip`, `projectGalleryTripSummary`, `projectTravelerProfile`, `buildGalleryDates`. Money-bearing itinerary fields (`budget_per_person`, `budget_breakdown`, `approx_cost`, `price_per_night`) and every session/member field are dropped at the allow-list level.
- `services/gallery/publish.ts`: `setTripPublication` (owner re-check, agency rejection, handle requirement, summary/tag normalization). Unpublish returns to `unlisted` when a share link is active, otherwise `private`; the gallery metadata is retained for a later re-publish.
- `PATCH /api/itinerary/:id/publish` behind `protectSession` + `requireTripRole('owner')`; share/revoke keep `visibility` in sync (`private ↔ unlisted`).
- `PATCH /api/auth/profile` now updates name/handle/bio together; `GET /api/auth/profile/handle-available` answers `available`/`reason` (`invalid`/`reserved`/`taken`). Agency staff keep the name-only `agencyProfileSchema`.
- Handle removal is refused (409) while the account has published trips, so a gallery card never loses its publisher link.
- `scripts/migrate-trip-visibility.mts` (`npm run migrate:trip-visibility`, `--dry-run` supported): `isPublic: true` → `unlisted`, else `private`; idempotent. Ran against the dev DB: 2 shared → unlisted, 8 → private, second run a no-op. `shareId`/`isPublic` untouched, so every existing link still resolves.
- Tests: `services/gallery/projection.test.ts` (11 pins, incl. leak sweeps and hidden-date payloads), `services/gallery/publish.test.ts` (12), profile handle/schema cases, realm-coverage unchanged; 621 backend tests, typecheck and production build green.

### G2 — Publish UX and traveler profiles

**Goal:** an owner can publish from the trip they are looking at; a traveler can create a public identity.

- Share modal gains an owner-only "Publish to gallery" section: preview of exactly what becomes public, hide-exact-dates toggle, summary and tags, unpublish.
- Account settings gains handle + bio with availability feedback.
- Public profile page `/travelers/:handle` (name, avatar, bio, published trips; no email, no member list).
- Hidden dates render as "Nov 2026 · 6 days".

**Acceptance:** publish/unpublish round-trips; profile page shows only published future trips; hidden dates never appear in the network payload.

**Shipped 2026-10-27.** Artifacts:

- Share modal "Publish to gallery" section with a preview of the public card, hide-exact-dates, summary, tags and unpublish (`components/dashboard/ShareExportModal.tsx`).
- Handle + bio editing with availability feedback (`pages/Profile.tsx`, `PATCH /api/auth/profile`, `GET /api/auth/profile/handle-available`).
- `GET /api/travelers/:handle` + `services/gallery/traveler.ts` and the public `/travelers/:handle` page; trips resolve through `projectTravelerProfile`, so no email or member field is reachable.
- Handle removal is refused while published trips exist, keeping every gallery card's publisher link valid.

### G3 — Gallery and public trip page

**Goal:** a signed-out visitor can browse and read a published trip.

- `GET /api/explore` with filters, pagination and expiry filtering (past-date trips drop out automatically).
- `/explore` page with cards, filters, empty state, and content-threshold gating for the nav entry.
- `/explore/:tripId` public trip page: full itinerary from the projection, publisher card, CTA placeholders for clone and join.
- Basic per-page `<title>`/description/OG tags (not crawlability — that stays deferred).

**Acceptance:** anonymous browsing works; unpublished or expired trips vanish; the response payload contains no financial or member data (test-pinned); seeded gallery has at least 5 curated trips before the nav entry is enabled.

**Shipped 2026-10-27; verified 2026-10-28.** Artifacts:

- `services/gallery/explore.ts`: eligibility filter (published, personal, not deleted, has `publishedAt`, start date today-or-later or date-less), search across title / `trip_title` / requested destination / summary (regex escaped), duration buckets via `$expr` over `duration_days` then the day list, tag `$all`, and a stable `(publishedAt, _id)` descending cursor encoded as base64url JSON. Publisher identity is resolved from `members[]` owner + an active personal account with a handle; a row without one is dropped rather than rendered ownerless.
- `GET /api/explore` / `GET /api/explore/:tripId` (`controllers/explore.controller.ts`, `routes/explore.routes.ts`) behind a new `publicGalleryLimiter` (180 reads / 15 min / IP). `exploreQuerySchema` caps `q`, `groupType`, `cursor` and `limit` (1–24).
- Listing and trip page both return the G1 projections (`projectGalleryTripSummary` / `projectGalleryTrip`), so the payload cannot grow a money or member field. `tripSchema` gains `{ visibility, publishedAt, _id }` so the cursor sort is index-backed.
- `frontend/src/pages/Explore.tsx`: cards with publisher and tag chips, debounced search, duration buckets and tag filters kept in the URL, cursor "Load more", distinct empty/error states.
- `frontend/src/pages/GalleryTrip.tsx`: full public itinerary using the read-only `DayTimeline` (no mutation callbacks) and `TravelGuideSafety`, highlights, custom-route list, publisher card, disabled clone/join placeholders (G4/G5), and a privacy note.
- `hooks/useGalleryEnabled.ts` + `Navbar`: the Explore entry appears only when `total >= 5`; `/explore` itself is always reachable by URL.
- `lib/meta.ts`: per-page `<title>`, description and OG tags on both pages (crawlability stays deferred).
- Tests: `services/gallery/explore.test.ts` (20 pins: eligibility, expiry cutoff, search escaping, duration/tags, cursor round-trip and rejection, dropped publishers, leak sweeps for listing and trip page) plus gallery route classification in `routes/realmCoverage.test.ts`. Backend: 650 tests, typecheck green. Frontend: typecheck and production build green.
- Local/dev caveat: `travelai` has no public trips yet (G1 migration mapped every existing row to `unlisted`/`private`), so the nav gate stays closed until at least 5 curated trips are published — `npm run seed:gallery` now supplies them (see "Launch seeding" below). Group type is accepted by the API (`?groupType=`) for curated links but has no free-text control yet, because the value is free-form in generated itineraries.
- Not done here: clone (landed in G4) and reporting/moderation (G6), plus a browser smoke on a seeded database.

### G4 — Clone a published trip

**Goal:** browsing converts into a draft.

- `POST /api/trips/:id/clone`: builds a fresh private draft owned by the cloner from the projection, records `clonedFrom { tripId, ownerHandle }`, rate-limited (10/day/user).
- Public page CTA "Clone & customize" → creates the draft → lands in the planner.
- Tests: ownership, no money/members copied, rate limit, unpublished target rejected.

**Acceptance:** a cloned trip is fully editable and shows attribution to the original owner; the original is untouched.

**Shipped 2026-10-27; verified 2026-10-28.** Artifacts:

- `services/gallery/clone.ts`: the source is re-read through `loadGalleryTrip` (the same public projection as the anonymous page), then `buildClonedTripDraft` creates a fresh `workspace: 'personal'`, `status: 'draft'`, `visibility: 'private'` trip. Money, expenses, participants, finance, members, `shareId` and `generationMeta` are structurally absent from the source payload, so they cannot be copied. Exact dates are copied only when `dates.exact`; a hidden-date source becomes "dates flexible" instead of leaking the real window. Drawn routes carry over.
- `Trip` gains `clonedFrom { tripId, ownerHandle, clonedAt }` (attribution only). The owner-facing trip payload includes it; the dashboard renders "Cloned from @handle" with a link to the traveller profile.
- `POST /api/itinerary/:id/clone` (`controllers/itinerary.controller.ts`, `routes/itinerary.routes.ts`) — codebase convention for the spec's `/api/trips/:id/clone`. It runs `protectPersonal` + new `tripCloneLimiter` (10/day/account, user-keyed) and intentionally skips `requireTripRole`: the source is a public trip the caller need not belong to. `routerCoverage.test.ts` documents that one exception; `realmCoverage.test.ts` classifies it as personal.
- `frontend/src/pages/GalleryTrip.tsx`: "Clone & customize" is live. Signed-in visitors get the draft and land in the dashboard with it opened; anonymous visitors are sent through sign-in with the clone intent and the copy is created on return. The join button stays a G5 placeholder.
- `api.cloneGalleryTrip` + `Trip.clonedFrom` type.
- Tests: `services/gallery/clone.test.ts` (9 pins: cloner ownership, attribution, no money/members/private metadata, exact dates, hidden dates, routes, original untouched, unpublished/expired/agency 404, rate-limit/guard wiring). Backend: 659 tests, typecheck green. Frontend: typecheck and production build green.
- Not done here: an in-product browser smoke on a seeded public trip (the `test` database still has zero public trips) and a bulk-copy reporting surface (G6).

### G5 — Join requests and blocking

**Goal:** "who wants in?" works with owner control.

- `TripJoinRequest` model, endpoints and rate limits (5 requests/day/user; one pending per trip).
- Approval creates a **commenter** membership via the existing membership service; decline is silent; requester can withdraw.
- Owner queue card on the trip page with a pending badge; request dialog carries the requester's name/avatar, a short message and a safety note.
- `UserBlock` + endpoints; blocked users cannot request; owner can block from a request.
- In-app notifications only (badge + queue); email stays deferred.

**Acceptance:** approval never grants editor; duplicate pending requests are rejected; blocked users are refused server-side; only the owner can list or decide; requests on unpublished trips are rejected.

**Shipped 2026-10-27; verified 2026-10-28.** Artifacts:

- `models/TripJoinRequest.ts`: `tripId`, `requesterId`, optional 280-char `message`, `status` (`pending/approved/declined/withdrawn`), `decidedBy/decidedAt`, queue/history indexes, and a **partial unique index** on `{ tripId, requesterId }` where `status: 'pending'` — one open request per person per trip, with declined/withdrawn history allowed alongside.
- `models/UserBlock.ts`: one-way `{ blockerId, blockedId }` with a unique pair index and a private optional reason. No email or identity fields.
- `services/gallery/joinRequests.ts`: all requester and owner rules. Eligibility imports `publicTripClauses()` from `explore.ts`, so **joinable == visible in the gallery** (published, personal, not deleted, has `publishedAt`, upcoming). `requestToJoin` checks owner/member, block and duplicate-pending, then re-checks the block after insert to close the block-vs-request race. `approveJoinRequest` claims the pending row atomically, re-checks block/member/cap, then pushes a **literal `role: 'commenter'`** membership under `members.userId $ne` + a `$expr` cap guard; a lost race rolls the claim back to pending. There is no role parameter anywhere in the module (test-pinned). Owner decline is silent; blocking upserts the block and declines that person's pending requests across every trip the blocker owns.
- Requester routes are `protectPersonal` + new `joinRequestLimiter` (5/day/account): `POST/GET/DELETE /api/itinerary/:id/join-request`. They intentionally skip `requireTripRole` (a stranger has no role yet); `routerCoverage.test.ts` records the exception and `realmCoverage.test.ts` classifies them personal. Owner routes (`GET /:id/join-requests`, `POST /:id/join-requests/:requestId/{approve,decline,block}`) are `protectSession` + `requireTripRole('owner')`.
- `GET/POST/DELETE /api/blocks[/:userId]` behind `protectPersonal` (`routes/blocks.routes.ts`, mounted in `index.ts`), keyed only on the caller's account — no trip id, no agency/platform session.
- `frontend/src/components/gallery/JoinRequestDialog.tsx`: owner name/photo, 280-char note with counter, and safety copy (what the owner sees, commenter-only, no payment details). `GalleryTrip` now has live join states — request, pending + withdraw, member, owner — with the same sign-in-resume pattern as clone (returning users get the dialog, never a silent request).
- `TripMembers` gains an owner **Join requests** card with a pending badge, requester avatar/name/handle, the note, and Approve / Decline / Block (block has a confirmation). `Profile` gains a Blocked travellers list with unblock, so the block list is operable without the admin panel.
- Tests: `services/gallery/joinRequests.test.ts` (22 pins: shared eligibility filter, pending/trimmed message, unpublished 404, owner/member refusal, duplicate 11000, blocked refusal, state, withdraw, commenter-only approval, cap, rollback, silent decline, block sweep, self-block/404, no-email block projection, route guards/limiter, model indexes, no-editor source pin). Full backend suite 683/683, typecheck clean; frontend typecheck and production build green.
- **Sequencing note:** §6 says "do not start G5 before G6's report endpoint exists". G5 was implemented first at explicit request, behind the existing gallery gates; the report endpoint, auto-hide threshold, block enforcement and admin de-list now ship in G6, so the safety net exists before real traffic.
- Not done here: email notifications (deferred by decision), a standalone moderation queue for blocks (list lives in Profile), and a browser smoke on a seeded database (the `test` DB still has zero public trips).

### G6 — Reporting, safety hardening, docs and verification

**Goal:** the public surface is operable and defensible.

- `TripReport` model + `POST /api/reports` (one per reporter+target, rate-limited).
- Auto-hide: at 3 distinct open reports the listing is excluded from `/api/explore` pending review; the owner sees a banner.
- Minimal admin surface: "Reported" filter on the existing platform admin list with de-list/dismiss actions (not a full moderation queue).
- Safety copy: report dialog reasons, join-request note, content guidelines page.
- Hardening pass: projection re-audit, limiter review, input validation, index review.
- `docs/milestone-8-test-plan.md`; roadmap status update.
- Verification: backend tests, typecheck, production build, browser smoke with synthetic accounts (Atlas test DB, cleaned up afterwards).

**Acceptance:** reported content leaves the gallery at threshold; admin can de-list; smoke covers publish → browse → clone → request → approve on two accounts.

**Shipped 2026-10-28.** Artifacts:

- `models/TripReport.ts`: `reporterId`, `targetType` (`trip`/`profile`), `targetId`, `reason` (`spam/harassment/scam/privacy/other`), optional 500-char `note`, `status` (`open/hidden/dismissed`), `resolvedBy/resolvedAt`; unique `{reporterId,targetType,targetId}` so one account can report a target once, plus queue indexes. `AUTO_HIDE_REPORT_THRESHOLD = 3`.
- `models/Trip.ts`: `moderation { hiddenAt, hiddenBy?, source: 'auto_report' | 'admin' }` and a sparse `moderation.hiddenAt` index. Hiding is deliberately **separate from `visibility`**: the owner keeps the trip, its data and its publication settings, while every public read drops it.
- `services/gallery/reports.ts`: report creation, self-report guard, duplicate `11000` → friendly `409`, note trimming and the threshold flip. A profile is addressed by its **public handle** — the only identifier the public page receives — and the resolved user id is what the row and the admin queue store; an id is still accepted for internal callers. Profiles are queue-only: hiding one would take down every trip its owner published, so that remains an explicit account action. Auto-hide calls `emitTripUpdated` explicitly because `Trip.updateOne` skips the post hooks.
- `services/gallery/explore.ts`: `publicTripClauses()` now also requires `{'moderation.hiddenAt': null}`, and `traveler.ts`, clone and join eligibility all reuse that one clause. A hidden trip therefore leaves the listing, the public page, the traveler page, cloning and join requests in the same query flip.
- `POST /api/reports` (`controllers/reports.controller.ts`, `routes/reports.routes.ts`, mounted at `/api/reports`) behind `protectPersonal` + new `reportCreateLimiter` (10/day/account). `createReportSchema.targetId` is a trimmed 1–40 char string rather than a 24-hex pattern, because a profile target is a handle.
- Admin moderation: `services/platform/moderation.ts` groups open/closed reports by target with aggregate reason counts and a minimal target summary (no itinerary body, budget or member list); `GET /api/admin/reports` plus `POST /api/admin/reports/:targetType/:targetId/{hide,dismiss}` (`controllers/adminModeration.controller.ts`, `routes/admin.routes.ts`) behind the existing `requirePlatformAdmin` + `protectPlatform`, CSRF and `platformWriteLimiter`. **De-list** hides the trip and closes reports as `hidden`; **dismiss** closes open *and* hidden reports as `dismissed` and clears the moderation marker, restoring an auto-hidden or de-listed listing. Both write `recordPlatformAudit` (`content.hidden` / `content.dismissed`). Hiding a profile is `400`.
- `frontend/src/components/gallery/ReportDialog.tsx`: five reasons, optional 500-char note with counter, the three-report threshold copy and a guidelines link; sign-in resumes the trip page with the dialog open. `GalleryTrip` and `TravelerProfile` gain report buttons (the profile sends its handle).
- `frontend/src/components/dashboard/ShareExportModal.tsx` + `Dashboard`: the owner sees "Hidden from the gallery since …", whether it was automatic or an admin de-list, and the review copy, without losing the trip.
- `frontend/src/pages/Guidelines.tsx` at `/guidelines` (public): what belongs, what we remove, reporting/review and account action. Linked from the report dialog and the join-request safety note, which also warns against sharing payment details or a home address.
- `frontend/src/pages/admin/AdminReports.tsx` at `/admin/reports` with Open / De-listed / Dismissed tabs, counts, public-page links, confirm dialogs and empty states; a de-listed trip carries a **Restore** action (the same dismiss decision), so de-listing is reversible without the API. "Reported content" in `AdminLayout`. Deviation from the spec's "Reported filter on the existing account list": grouping one card per target with reason counts and notes does not fit the account table, so the queue is its own minimal page; it still exposes only reported targets and reuses the platform shell, guards and audit.
- Tests: `services/gallery/reports.test.ts` (9 pins: eligibility, self-report, duplicate, note/reason shape, threshold behaviour, handle resolution, route guard/limiter) and `services/platform/moderation.test.ts` (6 pins: grouping/projection, de-list, dismiss/restore, hidden-report reclassification, profile rules, audit/route wiring), plus updated pins in `explore.test.ts`, `traveler.test.ts`, `joinRequests.test.ts`, `clone.test.ts`, `routes/admin.routes.test.ts` and `routes/realmCoverage.test.ts`. Full backend suite **699/699**, typecheck clean; frontend typecheck and production build green.
- `scripts/smoke-m8-g6.mts`: HTTP acceptance smoke over seeded synthetic accounts — publish → browse → traveler → clone → request → approve → three reports/auto-hide → hidden page/listing/traveler → owner banner payload → profile report by handle → admin queue/dismiss/restore/profile-hide-400/trip de-list → restore → public again — ending with `PASS` and `cleanup: users=0 trips=0 reports=0 audits=0`.
- Browser smoke on the Vite dev server: signed-out report → sign-in resume with the dialog open; submit shows the thank-you toast; traveler profile reports by handle; `/guidelines` renders; the owner banner appears on the moderated trip; `/admin/reports` dismisses to the Dismissed tab and de-lists to the De-listed tab with the public page then `404`. Fixtures were removed afterwards (`cleanup: users=0 trips=0`).
- Release gate and smoke instructions: `docs/milestone-8-test-plan.md`.
- Not done here: a full moderation queue with appeals (out of scope by decision), reporter blocking from the admin queue, and email notifications.

### Launch seeding — the five-trip gate (2026-10-28)

**Goal:** a fresh deployment reaches the G3 nav threshold (≥5 public trips) without hand-publishing through the UI.

- `services/gallery/seedContent.ts`: the single source of truth — 4 curated publisher accounts (deterministic `.invalid` emails/handles, bios that say the trip was curated by the TravelAI team) and 6 complete trips with full itineraries, budgets, safety copy and valid summaries/tags. Dates are the *next occurrence* of a month/day anchor with a 30-day minimum horizon, so a spring trip stays in spring and nothing expires out of the gallery the week after a run; two trips are deliberately date-less ("Dates flexible").
- `scripts/seed-gallery.ts` / `npm run seed:gallery`: `--dry-run`, `--cleanup`, `--base-date=YYYY-MM-DD`. Upserts curators by email (random, unrecorded bcrypt passwords — nobody can sign in), replaces only trips carrying `generationMeta.seedBatch`, and publishes through `setTripPublication` so the seeded rows obey every G1 rule. Cleanup removes the batch's trips, their join requests/reports and the curator accounts, refusing to delete a curator that owns non-seed trips.
- `services/gallery/seedContent.test.ts`: 10 pins (≥5 trips, unique curator keys/handles/emails, handle rules, summary/tag limits, duration = itinerary length, day numbering, budget sums, exact/hidden/date-less mix, month-safe anchors, deterministic next-occurrence math).
- Verified 2026-10-28 on the `test` database: seed prints `6 listed in the gallery` and `Explore nav gate: unlocked`; a re-run reuses the accounts and replaces exactly 6 trips; `/api/explore` returns 6 with no ISO dates on hidden-date rows; browser smoke of `/explore` (6 cards, correct date labels), a hidden-date trip page (no date strings, clone CTA) and `/travelers/maya_roams` (name, bio, one published trip).
- Also fixed while seeding: the traveler profile page now applies page meta (`title`, description, `og:type: profile`) like the other public pages.

---

## 6. Sequencing

| Batch | Milestones | Rationale |
|---|---|---|
| **1** | G1 → G2 → G3 → G4 | Self-contained: publish, browse and clone ship with **no stranger-to-stranger surface**. If adoption is weak, this batch still delivers value and the social half can be dropped. |
| **2** | G5 → G6 | Adds the social surface plus its safety net. Do not start G5 before G6's report endpoint exists. |

## 7. Definition of done (every milestone)

- `tsc` typecheck and production build clean; backend tests green.
- New routes covered by realm-coverage; new public payloads covered by key-set pins.
- No regression in the personal planner, shared links, agency realm or platform admin.
- Browser smoke for the milestone's happy path and one failure path.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Moderation gap (no full queue) | Report reporting exists from G6 with auto-hide at 3 reports + admin de-list + block list; content guidelines published |
| Cold start | `npm run seed:gallery` ships 6 curated trips with full itineraries; nav entry gated until ≥5 published |
| Physical safety (exact dates + strangers) | Hide-dates toggle; requester identity shown before approval; block list; safety copy; owner approval required |
| SEO expectations | Deferred by design: gallery is SPA-rendered in M8; prerendering is a later milestone |
| Privacy of co-travelers | Member identities and names never enter the projection |
| Notification conversion | In-app only; email deferred with A7 |
| Product dilution | "Explore" is a secondary nav entry, never a home-screen takeover |

## 9. Metrics to watch

Publish rate per active account; explore → trip-page click-through; clone conversion; request approval rate; approved joins → completed trips; reports per 1k gallery views; 7-day return rate of requesters.

## 10. Deferred (future milestone)

Email notifications, likes/saves, follows/feed, DMs, reviews/ratings, recommendations, SSR/SEO prerendering, destination landing pages, saved searches, full moderation queue with appeals, public agency trips.
