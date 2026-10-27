# Milestone 8 — Public Gallery & Traveler Profiles

**Status:** G1 and G2 shipped (2026-10-27); G3 implemented and awaiting review; G4–G6 approved and not started.
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
| `Trip` | `visibility: 'private' \| 'unlisted' \| 'public'` (default private; migration maps existing `isPublic` → `unlisted`), `publishedAt`, `gallery: { hideExactDates, summary?, tags? }`. Indexes for `visibility + start date`, `tags`, `publishedAt` |
| `User` | `profile: { handle (unique, sparse, lowercase), bio }`; avatar reuses `avatarUrl` |
| `TripJoinRequest` (new) | tripId, requesterId, message (≤280), status `pending/approved/declined/withdrawn`, decidedBy, decidedAt; one pending per trip+user |
| `UserBlock` (new) | blockerId, blockedId, createdAt; unique pair |
| `TripReport` (new) | reporterId, targetType `trip/profile`, targetId, reason, note?, status `open/hidden/dismissed`; one per reporter+target |

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
| `POST /api/itinerary/:id/clone` | copy a published trip into a new draft |
| `POST /api/itinerary/:id/join-requests` | request to join (auth, rate-limited, blocked users rejected) |
| `GET /api/itinerary/:id/join-requests` | owner queue |
| `PATCH /api/itinerary/:id/join-requests/:requestId` | approve / decline |
| `DELETE /api/itinerary/:id/join-requests/:requestId` | requester withdraws |
| `PATCH /api/auth/profile` | update name, handle + bio (`GET /api/auth/me` reads them) — **G1 ✅** |
| `GET /api/auth/profile/handle-available` | availability check — **G1 ✅** |
| `POST/DELETE /api/blocks/:userId`, `GET /api/blocks` | block list |
| `POST /api/reports` | report a trip or profile |

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

**Implemented 2026-10-27 (awaiting review).** Artifacts:

- `services/gallery/explore.ts`: eligibility filter (published, personal, not deleted, has `publishedAt`, start date today-or-later or date-less), search across title / `trip_title` / requested destination / summary (regex escaped), duration buckets via `$expr` over `duration_days` then the day list, tag `$all`, and a stable `(publishedAt, _id)` descending cursor encoded as base64url JSON. Publisher identity is resolved from `members[]` owner + an active personal account with a handle; a row without one is dropped rather than rendered ownerless.
- `GET /api/explore` / `GET /api/explore/:tripId` (`controllers/explore.controller.ts`, `routes/explore.routes.ts`) behind a new `publicGalleryLimiter` (180 reads / 15 min / IP). `exploreQuerySchema` caps `q`, `groupType`, `cursor` and `limit` (1–24).
- Listing and trip page both return the G1 projections (`projectGalleryTripSummary` / `projectGalleryTrip`), so the payload cannot grow a money or member field. `tripSchema` gains `{ visibility, publishedAt, _id }` so the cursor sort is index-backed.
- `frontend/src/pages/Explore.tsx`: cards with publisher and tag chips, debounced search, duration buckets and tag filters kept in the URL, cursor "Load more", distinct empty/error states.
- `frontend/src/pages/GalleryTrip.tsx`: full public itinerary using the read-only `DayTimeline` (no mutation callbacks) and `TravelGuideSafety`, highlights, custom-route list, publisher card, disabled clone/join placeholders (G4/G5), and a privacy note.
- `hooks/useGalleryEnabled.ts` + `Navbar`: the Explore entry appears only when `total >= 5`; `/explore` itself is always reachable by URL.
- `lib/meta.ts`: per-page `<title>`, description and OG tags on both pages (crawlability stays deferred).
- Tests: `services/gallery/explore.test.ts` (20 pins: eligibility, expiry cutoff, search escaping, duration/tags, cursor round-trip and rejection, dropped publishers, leak sweeps for listing and trip page) plus gallery route classification in `routes/realmCoverage.test.ts`. Backend: 650 tests, typecheck green. Frontend: typecheck and production build green.
- Local/dev caveat: `travelai` has no public trips yet (G1 migration mapped every existing row to `unlisted`/`private`), so the nav gate stays closed until at least 5 curated trips are published. Group type is accepted by the API (`?groupType=`) for curated links but has no free-text control yet, because the value is free-form in generated itineraries.
- Not done here: a persistent `clonedFrom`/reporting surface (G4/G6), and a browser smoke on a seeded database.

### G4 — Clone a published trip

**Goal:** browsing converts into a draft.

- `POST /api/trips/:id/clone`: builds a fresh private draft owned by the cloner from the projection, records `clonedFrom { tripId, ownerHandle }`, rate-limited (10/day/user).
- Public page CTA "Clone & customize" → creates the draft → lands in the planner.
- Tests: ownership, no money/members copied, rate limit, unpublished target rejected.

**Acceptance:** a cloned trip is fully editable and shows attribution to the original owner; the original is untouched.

### G5 — Join requests and blocking

**Goal:** "who wants in?" works with owner control.

- `TripJoinRequest` model, endpoints and rate limits (5 requests/day/user; one pending per trip).
- Approval creates a **commenter** membership via the existing membership service; decline is silent; requester can withdraw.
- Owner queue card on the trip page with a pending badge; request dialog carries the requester's name/avatar, a short message and a safety note.
- `UserBlock` + endpoints; blocked users cannot request; owner can block from a request.
- In-app notifications only (badge + queue); email stays deferred.

**Acceptance:** approval never grants editor; duplicate pending requests are rejected; blocked users are refused server-side; only the owner can list or decide; requests on unpublished trips are rejected.

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
| Cold start | Curated seed trips; nav entry gated until ≥5 published |
| Physical safety (exact dates + strangers) | Hide-dates toggle; requester identity shown before approval; block list; safety copy; owner approval required |
| SEO expectations | Deferred by design: gallery is SPA-rendered in M8; prerendering is a later milestone |
| Privacy of co-travelers | Member identities and names never enter the projection |
| Notification conversion | In-app only; email deferred with A7 |
| Product dilution | "Explore" is a secondary nav entry, never a home-screen takeover |

## 9. Metrics to watch

Publish rate per active account; explore → trip-page click-through; clone conversion; request approval rate; approved joins → completed trips; reports per 1k gallery views; 7-day return rate of requesters.

## 10. Deferred (future milestone)

Email notifications, likes/saves, follows/feed, DMs, reviews/ratings, recommendations, SSR/SEO prerendering, destination landing pages, saved searches, full moderation queue with appeals, public agency trips.
