# Milestone 9 — Agency Directory & Enquiries

**Status:** D1–D7 implemented (2026-10-28) — profile contract, agency-side editor, the public listing + profile pages with the public logo route, packages as snapshot cards with a builder and from-price, the public enquiry form with a tenant inbox, the D6 inbox actions + idempotent conversion into a directory client with a quote hand-off, and D7 verification, reply time, ops delisting and the launch gate. The defaults below stand as shipped unless a later decision says otherwise.
**Scope:** give onboarded agencies a public, searchable profile with services and package cards, and give travellers a single enquiry form that lands in the agency's workspace as a lead that can become a client and a quote.

**Basis:** planning read the existing agency domain (`backend/src/models/Agency.ts`, `AgencyQuote.ts`, `AgencyClient`, `services/agency/access.ts`, `plan.ts`, `routes/agency.routes.ts`), the gallery's public-surface patterns (`services/gallery/explore.ts`, `projection.ts`, `traveler.ts`) and the shared gating hook (`frontend/src/hooks/useGalleryEnabled.ts`). No market research is implied.

**Provisional decisions — confirm before build:**

| Decision | Default assumed here | Why |
|---|---|---|
| Entry point | New navbar item "Agencies", content-gated at ≥5 published profiles | Mirrors the gallery gate; a two-agency directory should never be linked |
| Who can enquire | Guests allowed with a verified email + consent checkbox; signed-in users get prefilled contact and see their own enquiry history | Account-only kills conversion on a lead-gen page; no verification invites spam |
| Package depth | Title, nights, cover, optional "from" price per person, 4–6 highlights, inclusions summary. No day-by-day itinerary | Cards are marketing; the paid proposal product stays the detailed artefact |
| Price visibility | Optional per package. When absent the card says "price on request" | Many agencies will not publish a number on a first pass |
| Listing entitlement | Every `active` agency may publish a profile; no plan gate yet | Pricing is still a proposal in `docs/market-go-and-pricing.md`; gating now would block supply |
| Verification | Manual ops approval, optional GSTIN badge | Cheap, and the main trust lever |
| Moderation | Manual ops delist only — no auto-hide threshold | Three reports is cheap for a competitor to manufacture on a public business page |

**Deliberate non-goals:** no bookings, deposits or payments on behalf of agencies; no reviews or ratings; no consumer-to-agency chat thread; no full itinerary publication; no paid placement or featured slots; no email/WhatsApp notification of enquiries in this milestone (in-app only, consistent with A7); no consumer login requirement for the enquiry form.

---

## 1. Where this sits

The product already has two public surfaces (published itinerary gallery, traveler profiles) and one B2B tenant surface (the agency workspace). This milestone introduces the first surface where **an agency is the content** rather than the author, and the first **anonymous write** outside auth and reports.

| Surface | Audience | Exists today |
|---|---|---|
| `/explore` + `/explore/:id` | consumers browsing published trips | ✅ M8 |
| `/travelers/:handle` | consumers browsing a person | ✅ M8 |
| `/proposal/:token` | one client, one quote | ✅ A5 |
| **`/agencies` + `/agencies/:slug`** | **consumers browsing businesses** | **Milestone 9** |
| Agency workspace | agency staff only | ✅ A1–A9 |

The directory is intentionally separate from the proposal pipeline: a directory page is marketing copy, a proposal is a commercial document. They must never share a payload.

## 2. Invariants (structural, tested)

1. **Directory payloads are allow-lists in their own module** (`services/directory/projection.ts`), pinned by a key-set test — no reuse of the agency tenant serializer or the gallery projection.
2. **Tenant internals never leave the server**: staff names and emails, client directory, quotes, exports, plan limits, audit rows, GSTIN unless the agency explicitly opts in, and any linked `tripId` are structurally absent.
3. **Only `active` agencies with a published profile appear.** Suspension, unpublish or ops delist makes every public route 404 immediately.
4. **A package is a snapshot.** Title, cover, nights, price and highlights are copied onto the package at save time; editing, deleting or re-pricing the underlying trip cannot change or leak a public package payload.
5. **Enquiries are inert.** Submitting one creates exactly one enquiry row — no client, no quote, no membership, no notification of anyone outside the owning tenant. Conversion is an explicit agency action.
6. **Tenant isolation on every agency-realm route**: an enquiry, package or profile is reachable only through `protectAgency` + the owning `agencyId`; a member of agency A gets 404 for agency B's rows.
7. **The enquiry form is the only anonymous write.** It is rate-limited per IP and per email, CSRF-protected, consent-stamped, and never echoes submitted PII back in URLs or logs.

## 3. Data model

| Model | Change |
|---|---|
| `AgencyProfile` (new) | `agencyId` (unique), `state: 'draft' \| 'published' \| 'hidden'`, `about` (≤1200), `baseCity`, `destinations[]`, `specialties[]`, `languages[]`, `services: { id, label }[]` or enum list, `showPhone`, `showGstin`, `publishedAt`, `verifiedAt?`, `moderation: { hiddenAt?, hiddenBy?, reason? }`, timestamps |
| `AgencyPackage` (new) | `agencyId`, `tripId?` (never projected), `title`, `coverUrl`, `nights`, `fromPricePerPerson?`, `currency` (default INR), `summary` (≤280), `highlights[]` (≤6), `inclusions[]`, `state: 'draft' \| 'published'`, `order`, `publishedAt`, timestamps |
| `AgencyEnquiry` (new) | `agencyId`, `packageId?`, `userId?`, `contact { name, email, phone? }`, `party { adults, children }`, `dates { start?, end?, flexible }`, `budgetBand?`, `message` (≤1500), `source: 'profile' \| 'package'`, `status: 'new' \| 'replied' \| 'quoted' \| 'won' \| 'lost'`, `lostReason?`, `assignedTo?`, `consentAt`, `repliedAt?`, `convertedAt?`, timestamps |
| `AgencyClient` | add optional `sourceEnquiryId` so lead → client attribution survives |
| `Agency` | no schema change; profile and packages live in their own collections so the tenant document stays billing/shape-focused |

Indexes: `AgencyProfile { state: 1, publishedAt: -1, _id: -1 }`; `AgencyPackage { agencyId: 1, state: 1, order: 1 }` and `{ state: 1, publishedAt: -1 }`; `AgencyEnquiry { agencyId: 1, status: 1, createdAt: -1 }` and `{ agencyId: 1, createdAt: -1 }`; a sparse `{ userId: 1, createdAt: -1 }` for a consumer's own history (P2).

## 4. API surface

Public (anonymous, rate-limited, projection only) — new `routes/agencies.routes.ts`, mounted at `/api/agencies`:

| Route | Purpose |
|---|---|
| `GET /api/agencies` | directory listing: text query (name, city, destination, specialty), filters (destination, specialty, language, base city, price band), cursor pagination, `total` |
| `GET /api/agencies/:slug` | published profile, including published package cards (D4) |
| `GET /api/agencies/:slug/logo` | published logo bytes; 404 unless profile and agency are public |
| `GET /api/agencies/:slug/packages/:packageId/cover` | published package cover bytes (D4) |
| `GET /api/agencies/facets` | distinct destinations / specialties / languages with counts, for filter chips |
| `POST /api/agencies/:slug/enquiries` | submit an enquiry (guest or signed-in); consent required; 5/day/IP and 3/day/email |

Agency realm (`protectAgency`, mounted under `/api/agency`; D1 ships the four profile routes):

| Route | Purpose |
|---|---|
| `GET /api/agency/:agencyId/profile` | own profile in any state (draft preview) + publish readiness (any member) |
| `PUT /api/agency/:agencyId/profile` | save profile fields (owner/admin) |
| `POST /api/agency/:agencyId/profile/publish` / `/unpublish` | flip public state (owner/admin) |
| `GET /api/agency/:agencyId/packages` | own packages, all states (any member) |
| `POST /api/agency/:agencyId/packages` | create from scratch or from a trip (snapshot) (planner/admin/owner) |
| `PATCH /api/agency/:agencyId/packages/:packageId` | edit snapshot fields (planner/admin/owner) |
| `POST /api/agency/:agencyId/packages/:packageId/publish` / `/unpublish`, `DELETE /api/agency/:agencyId/packages/:packageId` | package lifecycle (admin/owner) |
| `GET /api/agency/enquiries` | inbox: status filter, cursor pagination |
| `GET /api/agency/enquiries/:id` | one enquiry, tenant-scoped |
| `PATCH /api/agency/enquiries/:id` | claim (`assignedTo`), change status, record `lostReason` |
| `POST /api/agency/enquiries/:id/convert-to-client` | create/reuse an `AgencyClient` with `sourceEnquiryId`; returns the client id |
| `GET /api/agency/directory/insights` | profile views, package views, enquiries, conversion counts (P1) |

Platform admin (`PLATFORM_ADMIN_ENABLED`):

| Route | Purpose |
|---|---|
| `POST /api/admin/agencies/:id/verify` / `/unverify` | verification badge |
| `POST /api/admin/agencies/:id/profile/hide` / `/restore` | ops delist / restore a profile |
| `POST /api/admin/agencies/:id/packages/:packageId/hide` / `/restore` | hide a single package |
| `GET /api/admin/agencies?profile=published\|hidden` | extend the existing agency list filter |

Admin routes deliberately do **not** expose enquiry contents; that is client PII owned by the agency.

## 5. Milestones

### D1 — Profile model, projection and publish service

**Status:** implemented 2026-10-28 (backend only).

**Goal:** the data and payload contract, no UI.

- `AgencyProfile` model with states, ops moderation fields and indexes.
- `services/directory/projection.ts`: explicit allow-list (`{slug, name, about, baseCity, destinations, specialties, languages, services, logoUrl, website, showPhone ? contactPhone : null, gstin when opted in, verified, publishedAt}`), key-set test. Package cards join the projection in D4.
- `services/directory/profile.ts`: `loadPublicAgencyProfile(slug)` requires `state: 'published'`, owning agency `status: 'active'` and `moderation.hiddenAt: null`; publish is gated on a readiness list (about length, base city, ≥1 destination, ≥1 service, logo).
- Publish/unpublish service writing `publishedAt` and an agency audit event (`profile.published` / `profile.unpublished`).

**Shipped:** model, taxonomy (`services/directory/taxonomy.ts`), projection, lifecycle service, validation schema, tenant routes (`GET`/`PUT /api/agency/:agencyId/profile`, `POST .../publish|unpublish`) and the public `GET /api/agencies/:slug`. Tests: taxonomy parity with `SUPPORTED_LANGUAGES`, projection key set, lifecycle/tenant scoping, realm coverage.

**Acceptance:** suspended agency 404s; unpublish 404s on the next request; draft is invisible publicly but readable through the agency route; projection contains no `agencyId`, `gstin` (unless opted in), staff, plan or trip fields.
**Tests:** projection key-set, tenant scoping, lifecycle flips, realm-coverage entry for the new routes.

### D2 — Agency-side profile editor

**Status:** implemented 2026-10-28.

- Settings card "Public directory profile": about (with live character count), base city, destinations/specialties chips, services and language checklists, show-phone/show-GSTIN switches.
- Live preview pane rendered with `components/directory/DirectoryProfilePreview`, the same component D3's public page will use; it follows unsaved edits.
- Publish is a readiness decision: the button stays disabled with the reason list (about ≥80, base city, ≥1 destination, ≥1 service, logo) and the server re-checks on publish. Publishing with unsaved edits saves first.
- Owner/admin only; planner/viewer see the saved profile read-only with a lock note. Publish/unpublish are audited server-side (D1).
- `GET /api/agency/:agencyId/profile` now also returns the `catalog` of service/language labels, so the chooser never duplicates the backend taxonomy.

**Shipped:** `components/agency/DirectoryProfileEditor`, `components/directory/DirectoryProfilePreview`, directory types + API methods, catalog on the tenant read, settings mount, and a removed misleading "never listed publicly" line in the settings header.

**Acceptance:** a fresh agency cannot publish an empty profile; the preview updates before saving; only owner/admin can publish.

### D3 — Public directory and profile page

**Status:** implemented 2026-10-28 (listing + profile; package cards, enquiry and report deferred to D4/D5).

- `GET /api/agencies`, `GET /api/agencies/facets` with cursor pagination matching the gallery shape (`{agencies, nextCursor, hasMore, total}`, base64url `{p,i}` on `publishedAt`/`_id`). Search covers agency name (resolved through `Agency` first) plus about, base city, destinations and specialties; facet filters are exact and case-insensitive on city/destination/specialty and exact on language. Suspended agencies are dropped from cards and facets.
- `/agencies` page: search field (350 ms debounce), facet chips for destinations/specialties/cities/languages with counts and `aria-pressed`, active-filter chips with "Clear all", cards (logo or initial tile, name, verified shield, base city, up to three services, specialties), "Showing X of Y", Load more, loading/error/empty states. Every filter lives in the URL (`q`, `destination`, `specialty`, `city`, `language`), so a filtered page can be shared.
- `/agencies/:slug` page: back link, `<DirectoryProfilePreview headingAs="h1">` with about, services, destinations, languages, website and verified badge, plus a "Browse more agencies" exit; not-found and error states.
- Navbar "Agencies" link behind `useAgencyDirectoryEnabled` (`GET /api/agencies?limit=1`, `total ≥ 5`, module-level cache + inflight dedupe), mirroring `useGalleryEnabled`; the page itself stays reachable by URL.
- Cards and the profile header use `AgencyLogoTile`: the uploaded logo when there is one, otherwise a deterministic initial tile (name-hash colour), and the same tile if the logo request fails.
- **Public logo gap (found in D2):** solved with `GET /api/agencies/:slug/logo` — same eligibility filter as the profile read, serving only the tenant's own server-generated asset pointer (`/api/agency/:id/assets/:assetId/content`, same-tenant id check, `kind: 'logo'`), `Cache-Control: public, max-age=300`. The projection no longer emits the authenticated path.

**Deferred:** enquiry CTA and report link (D5). Package cards and the "from ₹X" price on cards shipped in D4.

**Shipped:** `services/directory/{listing,logo}.ts`, `publicProfileFilter`/`loadPublicAgencyRecord` reuse, `publicDirectoryLimiter` (180 req / 15 min / IP shared by list, facets, profile and logo), `/agencies` + `/agencies/:slug` pages, `useAgencyDirectoryEnabled`, navbar entry, `AgencyLogoTile`, realm-coverage entry for the four public routes.

**Acceptance:** a directory with 4 published profiles has no nav link but resolves by URL; with 5 it links; filters round-trip through the URL so a filtered page can be shared; page 2 of results is stable.
**Verified 2026-10-28:** 14 seeded profiles → nav link, 12 cards + Load more to 14, `?destination=Goa` → 6 cards with the chip pressed after reload, `?destination=Goa&city=Pune` → 1, name search "smoke agency 07" → 1; cursor pages 5/5/4 with no duplicates and an identical repeat of page 2; `/agencies/d3smoke-agency-02` logo `naturalWidth > 0` through the Vite proxy, agency 01 (no logo) renders the initial tile with the verified badge; unknown slug shows the not-available state; `--gate=4` removes the nav link while `/agencies` still lists 4.

### D4 — Packages as snapshot cards

**Status:** implemented 2026-10-28 (snapshot service, public join, builder and public cards; per-package enquiry preselect is still D5).

**Goal:** a package is a hand-curated public card that outlives the trip it was copied from.

- `AgencyPackage` model: `agencyId`, provenance `tripId` (partial unique index — one package per trip, never projected), `title`, `summary`, `nights`, optional `fromPricePerPerson` (INR; null means "price on request"), `coverAssetId`, `highlights` (max 6), `inclusions` (max 12), `state` (`draft`/`published`), `publishedAt` and an `order` for curation.
- Create "from a trip" copies the title, nights (`duration − 1`, day trip = 0) and highlights. Money is never copied. From then on the service never reads the Trip: re-saving, renaming, re-pricing or deleting the source trip leaves the package untouched, and a published package stays live after the trip is deleted.
- Trips carry no cover image (the gallery uses deterministic tiles), so the snapshot cannot copy one. The cover is picked from the agency's existing image assets; upload goes through the same Cloudinary/local asset pipeline as logos and exports — there is no new upload path.
- Planners (and admins/owners) may create and edit drafts; publishing, unpublishing and deleting change the public directory under the agency's name, so they are admin/owner only. Publish readiness is a non-empty title plus summary, re-checked server-side.
- Public projection (`projectDirectoryPackage`) emits exactly `{id, title, summary, nights, pricePerPerson, currency, coverUrl, highlights, inclusions}`; `tripId`, asset ids and agency ids never leave the server, and a key-set test pins the shape. Unpriced packages read "price on request".
- `GET /api/agencies/:slug` joins the published packages (newest first, capped); `GET /api/agencies` adds the lowest published `fromPricePerPerson` per agency to each card without changing pagination; facets ignore prices.
- Covers are served at `GET /api/agencies/:slug/packages/:packageId/cover` only while the package is published and the agency is public (`Cache-Control: public, max-age=300`), reusing the slug-addressed bytes pattern from the logo route.
- Builder UI: a **Package** tab in the agency trip view — create-from-trip empty state, title/summary/nights/price fields, highlight and inclusion chip editors, cover upload from the asset library, a live card preview, and Save / Publish / Unpublish / Delete with readiness reasons. An archived trip can keep its package but cannot create one.
- Public cards: `AgencyPackageCard` on `/agencies/:slug` ("Trips this agency plans") and a "From ₹X per person" / "Prices on request" footer on `/agencies` listing cards.

**Shipped:** `models/AgencyPackage.ts`, `services/directory/packages.ts`, `services/directory/packageCover.ts`, public projection + listing price join, tenant routes and validation schemas, `components/agency/AgencyPackagePanel`, `components/directory/AgencyPackageCard`, directory/card types and API methods, Package tab, profile section, listing price footer, tests (`packages.test.ts`, projection/listing/profile contract tests, route and realm coverage).

**Verified 2026-10-28:** service smoke on a throwaway DB (25 checks) covering snapshot isolation after trip edits, publish readiness, foreign-cover rejection, public profile/card/cover, listing from-price, unpublish removing the card and the price, deleting the trip leaving the package live, republish after trip deletion, and delete removing card + cover. Browser smoke on a synthetic agency: create from trip → summary/price/inclusions → Save → Publish → `/agencies/:slug` shows the card with "From ₹42,000 per person" → `/agencies` shows the same price → Unpublish flips it back to "Prices on request" and hides the profile section. Fixtures and temporary scripts removed.

**Acceptance:** editing the source trip's price, title or day count leaves the package card unchanged; deleting the trip leaves the package card live; unpublishing a package removes it from the profile and from the directory's "from" price maths.

**Deferred:** preselecting a package in the enquiry form (D5); per-package views/analytics (D7); ops hide/restore of a single package (D7).

### D5 — Enquiry submission

**Status:** implemented 2026-10-28 (intake, tenant inbox reads, personal history and the manual `agency_profile` report target; inbox actions and conversion stay in D6).

- `AgencyEnquiry` model, validation (email format, party size caps, message limits, future-or-flexible dates), consent timestamp, and rate limiters (per IP + per email, plus a per-agency daily cap).
- Enquiry form on the profile and on each package card (package preselected), with success copy that states what happens next and when to expect a reply.
- Signed-in users get prefilled name/email and can see their submitted enquiries (read-only list, P2 surface).
- Report target type `agency_profile` added to the existing reports endpoint and rate limits, without an auto-hide threshold.

**Shipped:** `models/AgencyEnquiry.ts` (allow-listed fields, status/budget enums, `AGENCY_ENQUIRY_LIMITS`, inbox + own-history indexes), `schemas/agencyEnquiry.schema.ts` (strict body: email, party 1–20 adults / ≤30 total, message 20–1500, calendar dates, consent true, unknown keys rejected), `services/directory/enquiries.ts` (agency/profile/package public checks, normalisation, consent timestamp, inbox page and detail, own history with agency + package joined in two scoped queries), `controllers/enquiries.controller.ts`, `routes/enquiries.routes.ts` (`GET /api/enquiries`, personal realm), `POST /api/agencies/:slug/enquiries` (IP 5/day, email 3/day, agency 50/day + `attachPersonalIfPresent`), `GET /api/agency/enquiries[/:enquiryId]` (workspace-addressed, `requireAgencyMember`), `agency_profile` in `TripReport`/`gallery.schema`/`services/gallery/reports.ts` (slug → Agency id, never auto-hides), moderation queue summary + dismiss-only action, `AgencyEnquiryDialog`, `AgencyPackageCard` "Ask about this trip", profile CTA + report link, `pages/agency/AgencyEnquiries` + nav, `/profile` "Enquiries you've sent", admin queue rendering, shared enquiry labels. Tests: `services/directory/enquiries.test.ts`, plus `gallery/reports.test.ts`, `platform/moderation.test.ts`, `routes/realmCoverage.test.ts` and `routes/agency.routes.test.ts` extended.

**Verified 2026-10-28:** backend `tsc --noEmit` clean; targeted suites 55/55 (12 enquiry, extended reports/moderation, realm coverage and agency route table) and the full backend suite 806/806; frontend `typecheck` and production `build` clean. Acceptance is pinned by tests rather than a browser smoke: guest submission succeeds only with consent, consent is stored as `consentAt`, the 6th IP submission / 4th email / 51st agency submission in a day is refused (limiter copy), suspended or unpublished agencies and foreign packages 404, the inbox is scoped by `agencyId` and shows the lead immediately after submission, no email transport is touched, and an `agency_profile` report resolves the slug to the Agency id without hiding the page.

**Deferred:** inbox actions — claim/assign, status transitions, lost reason, reply and conversion (D6); notification badge/unread count (D6); browser smoke of the two-sided flow (D6/D7).

**Acceptance:** guest submission succeeds with consent and fails without it; the sixth submission from one IP in a day is refused with a friendly message; a suspended agency's form returns 404; the agency sees the enquiry in its inbox immediately; no email is sent.

### D6 — Agency enquiry inbox and conversion

**Status:** implemented 2026-10-28 (inbox actions, idempotent conversion, dashboard counters and the quote hand-off; listing analytics stay in D7).

- "Enquiries" section in the agency workspace: list with status chips, unread count badge, detail drawer, claim/assign, status transitions (`new → replied → quoted → won/lost`), lost reason picker.
- "Convert to client" creates or reuses an `AgencyClient` tagged `sourceEnquiryId`, then links to the existing quote flow with the enquiry's party size prefilled.
- Dashboard counters: new enquiries, replied this week, conversion rate; listing analytics (profile views, package views) are deferred to D7.

**Shipped:** `AgencyClient.sourceEnquiryId` with a unique partial index `{ agencyId, sourceEnquiryId }`; `AgencyEnquiry.clientId` with a partial lookup index; `services/directory/enquiries.ts` adds `updateAgencyEnquiry` (atomic claim on `assignedTo: null`, admin-only reassignment, planner self-release, status/lost-reason rules), idempotent `convertAgencyEnquiry` (enquiry → client link, email reuse, duplicate-key race recovery), `getAgencyEnquirySummary` (rolling 7-day window, open = new + replied + quoted, won ÷ total to 3dp), and tenant-only package `tripId` / client / assignee joins; `consumer` projection suppresses `client`, `assignee`, `assignedTo` and `lostReason`; `schemas/agencyEnquiry.schema.ts` adds the strict update schema; `controllers/enquiries.controller.ts`; `GET /api/agency/enquiries/summary`, `PATCH /api/agency/enquiries/:enquiryId` and `POST /api/agency/enquiries/:enquiryId/convert` (summary registered before `:enquiryId`; reads by any member, actions by planner+). Frontend: inbox cards + detail sheet with claim/release, assignee picker, status select, lost-reason dialog, conversion result and "Quote this trip" deep link; nav unread badge; overview counters; `AgencyQuotePanel` prefill (`?tab=quote&client=&adults=&children=`) applied once to a blank draft and never over an existing quote. Tests: `services/directory/enquiries.test.ts` extended and `routes/agency.routes.test.ts` route table/role coverage.

**Verified 2026-10-28:** backend `tsc --noEmit` clean; targeted suites 32/32 (`enquiries.test.ts` 20 + `agency.routes.test.ts` 12); full backend suite 814/814; frontend `typecheck` and production `build` clean. Acceptance is pinned by tests: a second planner claiming a claimed lead gets a 409 (and the compare-and-set means only one concurrent update wins), assigning a colleague is admin-only and must be a tenant member, `lost` requires a reason that is cleared on reopening, `won` stamps `convertedAt` exactly once, conversion creates one tagged client and a retry (or a duplicate-key race) returns it, an existing client with the same email is reused and tagged once, the summary counts match the seeded rows with a rolling week, and `tripId` plus internal fields appear only in the tenant inbox.

**Deferred:** sending replies by email (the inbox is in-app by design — M9 default); travel dates in the quote (the quote has no date field, so dates stay on the lead); listing analytics (D7 if D3 instrumentation is added); browser smoke of the two-sided flow (D7).

**Acceptance:** two members claiming at once does not produce a lost update; conversion is idempotent (second click returns the same client); a lost enquiry keeps its reason; the funnel counts match the rows.

### D7 — Verification, response time, ops tooling, launch gate

**Status:** implemented 2026-10-28 (backend ops service + routes, reply-time signal, admin console section, docs and the read-only launch gate).

- Verification badge with ops verify/unverify; GSTIN shown only with the agency's opt-in.
- "Usually replies in ~X h" computed from the median first response over the last 20 enquiries; hidden until ≥5 data points.
- Ops hide/restore for profiles and packages, surfaced in the existing agency admin detail; every action audited.
- Docs: test plan (`docs/milestone-9-test-plan.md`), operations runbook section for delisting and verification, README feature list.
- Launch gate: ≥5 published and verified profiles, at least one package with a price on each, and an agency that has answered a test enquiry end-to-end.

**Shipped:** `services/directory/insights.ts` (`medianReplyHours`, `agencyReplyTimeHours`, `REPLY_TIME_MIN_SAMPLES = 5`, `REPLY_TIME_WINDOW = 20`) with the partial `AgencyEnquiry` index `{agencyId, repliedAt}` and `replyTimeHours` in `DirectoryProfileView` / `DIRECTORY_PROFILE_KEYS` (loaded in parallel with packages on the public profile); `models/AgencyPackage.ts` gains a `moderation` subdocument (`hiddenAt`, `hiddenBy`, `reason`) instead of a third state, so a takedown never erases the agency's `draft`/`published` choice; every public package read (profile join, listing from-price, cover bytes) excludes `moderation.hiddenAt`, the tenant's own package view reports `hidden/hiddenAt/hiddenReason`, and publishing a hidden package is a `409`; `services/platform/directoryAdmin.ts` adds `loadDirectoryAdminView`, `setProfileVerification`, `setProfileHidden` and `setPackageHidden` (idempotent `changed: false`, platform + tenant audit on every real change); `PlatformAgencyDetail.directory`, the `?profile=all|published|hidden` list filter and the `directoryHideSchema`; six `POST /api/admin/agencies/:id/directory/...` routes behind `platformWriteLimiter`; `scripts/launch-gate-m9.mts` (read-only, three checks, exits non-zero while unmet). Frontend: "Public directory" section in the agency detail drawer (state, readiness, reply time, verify/remove badge, hide/restore with a reason dialog) and a directory-state filter on the agency list; reply-time line in `DirectoryProfilePreview` and the public profile. Docs: `docs/milestone-9-test-plan.md`, runbook §3A.6 and the README feature list.

**Verified 2026-10-28:** backend `tsc --noEmit` clean; full backend suite **831/831**; targeted D7 suites **83/83** (`insights`, `projection`, `profile`, `packages`, `directoryAdmin`, `platform/agencies`, `admin.routes`). Frontend `typecheck` and production `build` clean. Acceptance is pinned by tests: an unverified published profile projects `verified: false` and renders without the badge, unverify leaves `state: 'published'` and the packages intact, the reply line is `null` at 4 replies and a positive rounded median at 5+, a read failure degrades to `null` instead of a 500, a hidden profile is excluded by `publicProfileFilter()` (listing, facets, direct URL, logo) and a hidden package by every public package query, restore returns a published profile to `published` and a never-published one to `draft`, a package keeps its own state through hide/restore, a repeated action returns `changed: false` without a second audit row, and each route is in the admin route table with `platformWriteLimiter`.

**Deferred:** listing analytics (profile/package views) — no instrumentation was added; reporter-facing enquiry notifications; email replies (in-app only by M9 default); browser smoke of the ops console (covered by the plan in §11 of the test plan, run before launch).

**Acceptance:** unverified but published profiles render without the badge; reply time is hidden below the threshold; an ops delist removes the profile from listing, facets and direct URL.

## 6. Build order and dependencies

| Order | Milestone | Depends on |
|---|---|---|
| 1 | D1 profile model + projection | — |
| 2 | D2 agency editor | D1 |
| 3 | D3 directory + profile page | D1, D2 |
| 4 | D4 packages | D1, D2 |
| 5 | D5 enquiry intake | D1, D3 |
| 6 | D6 inbox + conversion | D5 |
| 7 | D7 verification, ops, launch | D3–D6 |

D4 can run in parallel with D5 if split across sessions; nothing else parallelises cleanly because the projection contract is shared.

## 7. Testing and verification norms

- Register every new test file in `backend/package.json` (the test script is an explicit list).
- Add the new routes to `src/routes/realmCoverage.test.ts` (public vs agency vs admin).
- Projection tests assert the exact key set, not just the absence of known secrets.
- Browser smoke uses a synthetic agency (provisioned through the platform admin flow), a synthetic personal account and a synthetic enquiry; all rows are deleted afterwards.
- Frontend verification: `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, and a browser pass over listing → profile → package → enquiry → agency inbox → convert.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Empty directory | Consumers land on 3 agencies and leave | Nav threshold of 5; ops recruits design partners before launch |
| Unanswered enquiries | The directory damages agency reputation and the platform's | Reply-time display, inbox badge, weekly ops report; suspension after repeated silence |
| Published prices undercut agencies | Agencies refuse to publish prices | Price optional; "from" framing; card never shows quote line items |
| Spam / competitor reports | Delisting or noise | Enquiry rate limits; manual moderation only; reports require an account |
| Scope creep into booking/payments | Regulatory and delivery risk | Explicit non-goal; enquiry → client → quote only |
| Tenant data leak | Worst-case outcome | Separate projection module, key-set tests, `tripId` projected only inside the tenant inbox, no enquiry access for ops |
| Abuse of the enquiry endpoint as a free CRM | Infrastructure cost | Per-agency daily cap; suspicious patterns reviewed in ops |

## 9. Open decisions

1. Entry point label and placement — "Agencies" beside "Explore" (default) vs a section inside Explore.
2. Guest enquiries vs signed-in only (default: guest allowed with consent).
3. Whether the "from" price is mandatory on a published package (default: optional).
4. Whether listing is bundled into every active agency (default) or becomes a paid entitlement once pricing is approved.
5. Whether consumers get an in-app enquiry thread in this milestone (default: no, P2).
