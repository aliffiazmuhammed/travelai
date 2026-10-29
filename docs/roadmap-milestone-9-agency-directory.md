# Milestone 9 — Agency Directory & Enquiries

**Status:** D1–D9 implemented (2026-10-29) — profile contract, agency-side editor, the public listing + profile pages with the public logo route, packages as snapshot cards with a builder and from-price, the public enquiry form with a tenant inbox, the D6 inbox actions + idempotent conversion into a directory client with a quote hand-off, D7 verification, reply time, ops delisting and the launch gate, D8 two-way enquiry conversations and proposal comparison, D9 requiring a personal account to send an enquiry, R1–R3 of the live tier (SSE streams behind `ENABLE_ENQUIRY_SSE`, live traveller list/thread and agency inbox, 20s poll fallback), **R5** closing the loop (start a trip from any lead, quotes written back to the funnel, guarded status moves), and **R6** the polish batch (in-app accept/decline, a traveller vocabulary for the funnel, nav badges outside the inboxes). The defaults below stand as shipped unless a later decision says otherwise.
**Scope:** give onboarded agencies a public, searchable profile with services and package cards, and give travellers a single enquiry form that lands in the agency's workspace as a lead that can become a client and a quote.

**Basis:** planning read the existing agency domain (`backend/src/models/Agency.ts`, `AgencyQuote.ts`, `AgencyClient`, `services/agency/access.ts`, `plan.ts`, `routes/agency.routes.ts`), the gallery's public-surface patterns (`services/gallery/explore.ts`, `projection.ts`, `traveler.ts`) and the shared gating hook (`frontend/src/hooks/useGalleryEnabled.ts`). No market research is implied.

**Provisional decisions — confirm before build:**

| Decision | Default assumed here | Why |
|---|---|---|
| Entry point | New navbar item "Agencies", content-gated at ≥5 published profiles | Mirrors the gallery gate; a two-agency directory should never be linked |
| Who can enquire | Signed-in travellers only (D9). Browsing stays anonymous; the form prompts for sign-in and returns to the dialog | An enquiry is a conversation the traveller must be able to find again, and a free account costs less than a guest link that can be lost |
| Package depth | Title, nights, cover, optional "from" price per person, 4–6 highlights, inclusions summary. No day-by-day itinerary | Cards are marketing; the paid proposal product stays the detailed artefact |
| Price visibility | Optional per package. When absent the card says "price on request" | Many agencies will not publish a number on a first pass |
| Listing entitlement | Every `active` agency may publish a profile; no plan gate yet | Pricing is still a proposal in `docs/market-go-and-pricing.md`; gating now would block supply |
| Verification | Manual ops approval, optional GSTIN badge | Cheap, and the main trust lever |
| Moderation | Manual ops delist only — no auto-hide threshold | Three reports is cheap for a competitor to manufacture on a public business page |

**Deliberate non-goals:** no bookings, deposits or payments on behalf of agencies; no reviews or ratings; no full itinerary publication; no paid placement or featured slots; no email/WhatsApp notification of enquiries in this milestone (in-app only, consistent with A7); no merging of proposals into a trip in the traveller's comparison view; no anonymous enquiry submission (D9 requires a personal account).

---

## 1. Where this sits

The product already has two public surfaces (published itinerary gallery, traveler profiles) and one B2B tenant surface (the agency workspace). This milestone introduces the first surface where **an agency is the content** rather than the author. Reading it is anonymous; sending an enquiry is the one consumer write, and since D9 it belongs to a personal account.

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
7. **The enquiry write requires a personal session (D9).** It sits behind `protectPersonal`, is rate-limited per IP, per email and per agency, CSRF-protected, consent-stamped, attributed to the signed-in account, and never echoes submitted PII back in URLs or logs. Directory reads stay anonymous.
8. **The funnel only moves when the work moves (R5).** A share writes `quoted`, an acceptance writes `won`, and manual moves follow a transition map with `won` requiring a directory client; conversion to a client is bookkeeping and never a win. A declined proposal (R6) moves nothing: it closes that version of the share, not the lead.

## 3. Data model

| Model | Change |
|---|---|
| `AgencyProfile` (new) | `agencyId` (unique), `state: 'draft' \| 'published' \| 'hidden'`, `about` (≤1200), `baseCity`, `destinations[]`, `specialties[]`, `languages[]`, `services: { id, label }[]` or enum list, `showPhone`, `showGstin`, `publishedAt`, `verifiedAt?`, `moderation: { hiddenAt?, hiddenBy?, reason? }`, timestamps |
| `AgencyPackage` (new) | `agencyId`, `tripId?` (never projected), `title`, `coverUrl`, `nights`, `fromPricePerPerson?`, `currency` (default INR), `summary` (≤280), `highlights[]` (≤6), `inclusions[]`, `state: 'draft' \| 'published'`, `order`, `publishedAt`, timestamps |
| `AgencyEnquiry` (new) | `agencyId`, `packageId?`, `userId?`, `contact { name, email, phone? }`, `party { adults, children }`, `dates { start?, end?, flexible }`, `budgetBand?`, `message` (≤1500), `source: 'profile' \| 'package'`, `status: 'new' \| 'replied' \| 'quoted' \| 'won' \| 'lost'`, `lostReason?`, `assignedTo?`, `consentAt`, `repliedAt?`, `convertedAt?`, **R5:** `tripId?` (tenant-only, the trip started from this lead), timestamps; **D8:** `messages[]` (author, authorId?, authorName, body ≤2000, timestamps, per-side read receipts, cap 500), `lastMessageAt?`, `lastMessageBy?`, `conversationTokenHash?` (partial unique), `conversationTokenHint?`, `conversationTokenExpiresAt?` |
| `AgencyClient` | add optional `sourceEnquiryId` so lead → client attribution survives |
| `AgencyProposalLink` | **D8:** optional `enquiryId` (resolved through the quote's client) so a proposal can be grouped with the conversation it answers |
| `Agency` | no schema change; profile and packages live in their own collections so the tenant document stays billing/shape-focused |

Indexes: `AgencyProfile { state: 1, publishedAt: -1, _id: -1 }`; `AgencyPackage { agencyId: 1, state: 1, order: 1 }` and `{ state: 1, publishedAt: -1 }`; `AgencyEnquiry { agencyId: 1, status: 1, createdAt: -1 }` and `{ agencyId: 1, createdAt: -1 }`; a sparse `{ userId: 1, createdAt: -1 }` for a consumer's own history (P2).

## 4. API surface

Public reads (anonymous, rate-limited, projection only) — new `routes/agencies.routes.ts`, mounted at `/api/agencies`. The enquiry write lives in the same router but is personal-realm (D9):

| Route | Purpose |
|---|---|
| `GET /api/agencies` | directory listing: text query (name, city, destination, specialty), filters (destination, specialty, language, base city, price band), cursor pagination, `total` |
| `GET /api/agencies/:slug` | published profile, including published package cards (D4) |
| `GET /api/agencies/:slug/logo` | published logo bytes; 404 unless profile and agency are public |
| `GET /api/agencies/:slug/packages/:packageId/cover` | published package cover bytes (D4) |
| `GET /api/agencies/facets` | distinct destinations / specialties / languages with counts, for filter chips |
| `POST /api/agencies/:slug/enquiries` | submit an enquiry (personal session required since D9); consent required; 5/day/IP, 3/day/email, 50/day/agency |

Legacy guest conversation (D8) — `routes/conversations.routes.ts`, mounted at `/api/conversations`. No session: the private 256-bit token is the only capability, and every route resolves exactly one enquiry from its sha256 hash. Since D9 no new token is minted; links already sent keep working until they expire:

| Route | Purpose |
|---|---|
| `GET /api/conversations/:token` | read the thread; marks the agency's replies read |
| `POST /api/conversations/:token/messages` | guest reply (15/min/IP read, 30/15 min/IP write) |
| `GET /api/conversations/:token/proposals` | live proposals answering this enquiry |
| `GET /api/conversations/:token/proposals/:linkId` / `/pdf` | the pinned document and its PDF, only while the link belongs to this enquiry |

Personal realm (D8) — `routes/enquiries.routes.ts` and `routes/proposals.routes.ts`:

| Route | Purpose |
|---|---|
| `GET /api/enquiries` | the traveller's own list, cursor paginated, with `proposals: { count, lastAt }` per row |
| `GET /api/enquiries/summary` | unread, live proposal count and last message time, for badges (R1) |
| `GET /api/enquiries/events` | SSE stream of this account's enquiry frames; 404 while the live tier is off (R1) |
| `POST /api/enquiries/:id/read` | explicit read receipt (the thread GET stamps it too) |
| `GET /api/enquiries/:id` | a signed-in traveller's own thread; marks the agency's replies read |
| `POST /api/enquiries/:id/messages` | signed-in reply |
| `GET /api/proposals` | every live proposal answering this account's own enquiries |
| `GET /api/proposals/:linkId` / `/pdf` | the full pinned document / PDF, owner-only (resolved by id; the proposal token never leaves the agency's link) |
| `POST /api/proposals/:linkId/accept` | **R6:** accept in-app; same quote CAS, audits (`via: in-app`) and lead-won write as the token page |
| `POST /api/proposals/:linkId/decline` | **R6:** decline this version only — `declinedAt` on the link, quote and lead untouched; idempotent |

`GET /api/enquiries` (the traveller's own list) also carries `proposals: { count, lastAt }`
per row — live links only, resolved by the stamped `enquiryId` or, for older
links, through the quote's client.

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
| `GET /api/agency/enquiries/summary` | counters for the inbox cards and the nav badge |
| `GET /api/agency/enquiries/events` | SSE stream of this tenant's enquiry frames; 404 while the live tier is off (R1) |
| `GET /api/agency/enquiries/:id` | one enquiry, tenant-scoped |
| `POST /api/agency/enquiries/:id/read` | explicit read receipt for the agency side |
| `PATCH /api/agency/enquiries/:id` | claim (`assignedTo`), change status through the R5 transition map, record `lostReason` |
| `POST /api/agency/enquiries/:enquiryId/messages` | **D8:** reply in the thread (planner+); stamps `repliedAt` and moves `new → replied` |
| `POST /api/agency/enquiries/:id/convert` | create/reuse an `AgencyClient` with `sourceEnquiryId`; returns the client id. **R5:** bookkeeping only — the status is left alone |
| `POST /api/agency/enquiries/:id/trip` | **R5:** convert if needed, open a blank trip with the lead's dates and client, stamp `tripId`; idempotent under a double click |
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

**Status:** implemented 2026-10-28 (intake, tenant inbox reads, personal history and the manual `agency_profile` report target; inbox actions and conversion stay in D6). **Superseded by D9:** the guest-token and `attachPersonalIfPresent` details below describe the original intake; the write now requires a personal session.

- `AgencyEnquiry` model, validation (email format, party size caps, message limits, future-or-flexible dates), consent timestamp, and rate limiters (per IP + per email, plus a per-agency daily cap).
- Enquiry form on the profile and on each package card (package preselected), with success copy that states what happens next and when to expect a reply.
- Signed-in users get prefilled name/email and can see their submitted enquiries (read-only list, P2 surface).
- Report target type `agency_profile` added to the existing reports endpoint and rate limits, without an auto-hide threshold.

**Shipped:** `models/AgencyEnquiry.ts` (allow-listed fields, status/budget enums, `AGENCY_ENQUIRY_LIMITS`, inbox + own-history indexes), `schemas/agencyEnquiry.schema.ts` (strict body: email, party 1–20 adults / ≤30 total, message 20–1500, calendar dates, consent true, unknown keys rejected), `services/directory/enquiries.ts` (agency/profile/package public checks, normalisation, consent timestamp, inbox page and detail, own history with agency + package joined in two scoped queries), `controllers/enquiries.controller.ts`, `routes/enquiries.routes.ts` (`GET /api/enquiries`, personal realm), `POST /api/agencies/:slug/enquiries` (IP 5/day, email 3/day, agency 50/day + `attachPersonalIfPresent`), `GET /api/agency/enquiries[/:enquiryId]` (workspace-addressed, `requireAgencyMember`), `agency_profile` in `TripReport`/`gallery.schema`/`services/gallery/reports.ts` (slug → Agency id, never auto-hides), moderation queue summary + dismiss-only action, `AgencyEnquiryDialog`, `AgencyPackageCard` "Ask about this trip", profile CTA + report link, `pages/agency/AgencyEnquiries` + nav, `/profile` "Enquiries you've sent", admin queue rendering, shared enquiry labels. Tests: `services/directory/enquiries.test.ts`, plus `gallery/reports.test.ts`, `platform/moderation.test.ts`, `routes/realmCoverage.test.ts` and `routes/agency.routes.test.ts` extended.

**Verified 2026-10-28:** backend `tsc --noEmit` clean; targeted suites 55/55 (12 enquiry, extended reports/moderation, realm coverage and agency route table) and the full backend suite 806/806; frontend `typecheck` and production `build` clean. Acceptance is pinned by tests rather than a browser smoke: guest submission succeeds only with consent, consent is stored as `consentAt`, the 6th IP submission / 4th email / 51st agency submission in a day is refused (limiter copy), suspended or unpublished agencies and foreign packages 404, the inbox is scoped by `agencyId` and shows the lead immediately after submission, no email transport is touched, and an `agency_profile` report resolves the slug to the Agency id without hiding the page.

**Deferred:** inbox actions — claim/assign, status transitions, lost reason, reply and conversion (D6); notification badge/unread count (D6); browser smoke of the two-sided flow (D6/D7).

**Acceptance (D5 as shipped; D9 later added the session requirement):** guest submission succeeds with consent and fails without it; the sixth submission from one IP in a day is refused with a friendly message; a suspended agency's form returns 404; the agency sees the enquiry in its inbox immediately; no email is sent.

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

### D8 — Two-way enquiry conversations and proposal comparison

**Status:** implemented 2026-10-29 (backend thread service + routes, traveller `/proposals` page, guest `/conversation/:token` page, agency inbox thread and the profile history links). Since D9 the guest link is legacy-only: new enquiries are signed-in and open at `/enquiry/:id`.

**Goal:** the agency's reply reaches the traveller in-app, a traveller can come back to the thread (through their account, or a legacy guest link), and a traveller with proposals from several agencies can compare them without the product merging anything behind their back.

- **One thread, one enquiry.** Messages are subdocuments on `AgencyEnquiry`, so a read is always tenant-scoped by `agencyId` and a reply can never attach to a lead the caller cannot see. The thread is returned with its enquiry and never queried across tenants.
- **Two capabilities.** A signed-in traveller replies through their own account (`userId` on the row). Legacy guest rows keep the private link that was minted at submit before D9; the raw token exists only in that URL, while the row stores a sha256 hash, a six-character hint and `conversationTokenExpiresAt` (default 90 days, capped at 365). New enquiries mint no token. Expired links, unknown tokens and a suspended agency all answer the same generic 404.
- **Reads are receipts.** The side that did not write a message fills in its read timestamp; unread counts for the inbox, the profile history and the thread are derived from the same array, never a second counter. Opening the agency detail or the traveller page marks the other side's messages read, and replying is an acknowledgement.
- **Replying is answering.** The first agency message stamps `repliedAt` and moves a `new` lead to `replied`, so the public reply-time badge measures a reply that actually reached the traveller. Every agency reply is audited (`enquiry.replied`).
- **Proposals answer a conversation.** `AgencyProposalLink.enquiryId` is stamped from the quote's client when a share is minted; older links resolve through the quote client ids. A guest sees only the live links belonging to their own enquiry; a signed-in traveller sees every live link answering one of their own enquiries and can open the exact pinned document or PDF by id.
- **Comparison is read-only.** `/proposals` shows cards side by side (agency, trip, total, per-person, inclusions, exclusions, validity) with two actions: open the pinned document, or message the agency on the thread that proposal answers. There is no merge and no trip creation.
- **Success screen.** Submitting an enquiry confirms where the reply will arrive and links "Open conversation" (`/enquiry/:id`) and "All enquiries" (`/enquiries`). Since D9 there is no URL to copy; the D8 copy button survives only in the legacy guest page.
- **The list has a door.** Replies and proposals only reached the traveller through buried links (a profile card and `/proposals`). `/enquiries` is now the signed-in traveller's own list — agency, package, dates and party, status, unread replies, last message, a live-proposal badge, "Open conversation" and a header link to `/proposals` — with a "Enquiries" nav item (desktop and mobile sheet, signed-in only) and the profile card reduced to a three-row preview with "View all". Since D9 every new enquiry belongs to a personal account, so this list is the traveller's complete history; only legacy guest rows stay reachable through their link alone.

**Shipped:** `models/AgencyEnquiry.ts` (thread limits, message schema, token hash/hint/expiry, partial unique index), `services/directory/conversations.ts` (token mint/validate/url, message projection/meta/unread, guest + personal + agency append, receipts, conversation views), `services/directory/enquiries.ts` (views carry `messages`, `unread`, reply meta; agency detail marks the thread read; D9 removed the token mint from submit), `services/agency/proposals.ts` (`enquiryId` stamping, consumer ownership/list summaries, guest/personal document + PDF), `controllers/conversations.controller.ts`, `routes/conversations.routes.ts`, `routes/proposals.routes.ts`, extended enquiries/agency routes and realm coverage, `AgencyEnquiryDialog` success screen, `ConversationThread`, `ProposalPreviewDialog`, `ProposalComparison`, `pages/ConversationPage`, `pages/MyProposals`, `pages/Enquiries`, `Navbar` (signed-in "Enquiries" entry), agency inbox thread, profile enquiry preview and the `/proposals` entry. Tests: `services/directory/conversations.test.ts` (16) plus the extended enquiry, proposal, route and realm suites.

**Verified 2026-10-29:** backend `tsc --noEmit` clean; full backend suite **851/851**; frontend typecheck (`tsconfig.app.json`) and production build clean. Acceptance is pinned by tests: an unknown, expired or suspended-agency token all 404; the raw token is never stored; a guest read stamps the traveller receipt and a reply stamps the agency receipt; an empty or oversized body writes nothing; another account gets 404 for someone else's thread; the first agency reply sets `repliedAt` once and a viewer role is refused; opening a lead stamps only unread traveller messages; a package enquiry still resolves a same-tenant title.

**Browser smoke 2026-10-29 (legacy guest link, before D9; links already sent still work this way):** submitted a guest enquiry from the Hills & Horizons profile, opened the private link in a clean tab and replied; the agency inbox showed `1 new`, opening the lead cleared it, and the reply moved `new → replied`; the guest reload showed the reply and "Read" on the guest's own message. Then a signed-in account (`d8.traveller@example.com`) submitted an enquiry with the form prefilled, opened `/enquiry/:id`, and replied from `/proposals` via "Ask about this"; the agency inbox showed the unread message, replied, and the profile card showed `1 new reply` while the thread showed `Read` on the traveller message. `/proposals` rendered a pinned proposal document (11-page brochure with the PDF action) in the comparison card, and "Ask about this" posted to the right thread; the smoke link was removed afterwards. A foreign link id returned 404 for both the guest token and the signed-in account, and the guest's proposal list stayed scoped to its own agency. No merge or trip action exists on any of these surfaces.

**Browser smoke 2026-10-29 (traveller's `/enquiries`):** as a synthetic account, `/enquiries` listed the one enquiry with the agency, "Flexible dates", "2 adults · 1 child", one live proposal badge, "View proposals" and "Open conversation" → `/enquiry/:id` (thread rendered with an "All enquiries" back link); `/profile` showed the three-row preview with "View all 1 enquiry" and the proposal chip; `/proposals` kept its `/enquiries` back link; the navbar carried "Enquiries" while signed in and dropped it after logout, where `/enquiries` redirected to `/auth`. The API returned `proposals: { count: 0, lastAt: null }` before the fixture link and `{ count: 1 }` after it, with a revoked link excluded; every fixture row and the temp script were removed afterwards.

**Deferred:** email/WhatsApp notifications (in-app only by M9 default); merging a chosen proposal into a trip (explicit non-goal); a multi-epoch thread archive (messages are capped at 500 per enquiry).

**Acceptance:** a legacy guest link can be read and replied through until expiry; a signed-in traveller's thread is invisible to other accounts and to agency/platform sessions; the agency inbox shows unread counts and marks them read on open; a first reply moves `new → replied`; `/proposals` compares live proposals and every message action lands on the correct enquiry.

### D9 — Enquiries require a personal account

**Status:** implemented 2026-10-29 (product decision: features belong to signed-in users; directory browsing stays anonymous).

**Goal:** an enquiry is a conversation the traveller must be able to find again, so the write belongs to a personal account rather than a guest token.

- `POST /api/agencies/:slug/enquiries` sits behind `protectPersonal`; the rate limiters still run in front of the guard so a scripted attacker burns its own buckets. Directory reads, the profile and package cards stay anonymous.
- `submitAgencyEnquiry` requires a `userId`, stamps it on the row and mints no conversation token. Legacy rows keep their hashed token, so links already sent keep working until expiry; the acknowledgement shrinks to `{ id, status, createdAt }`.
- The dialog shows "Sign in to send this enquiry" instead of the form for guests, with a link to `/auth` that carries the profile as the return path and the pending package; the profile reopens the dialog with that package selected on return.
- The success panel offers "Open conversation" (`/enquiry/:id`) and "All enquiries" (`/enquiries`) and shows no URL to copy. Every new enquiry lands in the traveller's list.

**Shipped:** `protectPersonal` on the enquiry write, required `userId` and removed token minting in `services/directory/enquiries.ts`, simplified `AgencyEnquiryAcknowledgement`, `realmCoverage.test.ts` expectation (only `/:slug/enquiries personal` is guarded inside the public directory router), updated enquiry service tests, `AgencyEnquiryDialog` sign-in branch and success actions, `AgencyProfile` return-path effect.

**Verified 2026-10-29:** backend `tsc --noEmit` clean; full backend suite **851/851**; targeted `enquiries` + realm coverage **36/36**; frontend typecheck (`tsconfig.app.json`) and production build clean. Browser smoke with a synthetic personal account: signed out, the profile dialog showed the prompt with no form; a cookie-less `POST` was refused by CSRF (`403`) and the same POST with a CSRF token reached the guard (`401`, "Your session has expired or is invalid"); "Sign in or create an account" returned to `/agencies/m9-hills-horizons` after login with the dialog reopened and "Package: dgdg" preselected; submitting showed "Open conversation" and "All enquiries", no link to copy; `/enquiries` listed the enquiry and the thread rendered it; the stored row had `conversationTokenHash: null`. The synthetic user and enquiry were deleted afterwards.

**Acceptance:** a guest sees the sign-in prompt and no form, and a guest `POST` is refused; a signed-in submission lands in the agency inbox and in `/enquiries`; the `/auth` round-trip reopens the dialog with the package preselected; a new enquiry never stores a conversation token.

### R1–R3 — Live enquiry updates

**Status:** implemented and verified 2026-10-29 in three phases — R1 backend streams, R2 traveller list and thread, R3 agency inbox. R4 (this documentation pass, the blueprint flag and the polling audit) closes the batch.

**Goal:** replies, new leads and read receipts appear without a refresh, without turning delivery into an authorization path.

- **Transport is SSE, not Socket.IO.** `services/realtime/enquiryEvents.ts` keeps an in-process bus keyed `user:<id>` / `agency:<id>`, with frames `enquiry:new|message|updated|read` and `proposal:new`. Frames are hints: the client answers each burst with a quiet GET, so a missed frame, a reconnect or a deploy degrades to "the next read is right". Live delivery never authorizes anything — every read and write stays scoped by the personal or agency session.
- **Dark by default.** `ENABLE_ENQUIRY_SSE` gates both stream routes (they answer the standard JSON 404 when off) and is advertised as `enquiries.sse` on `GET /api/health`; `render.yaml` turns it on, mirroring `ENABLE_TRIP_SSE`. `ENQUIRY_SSE_MAX_STREAMS` caps concurrent streams per channel, closing the oldest first.
- **Single-instance fan-out.** The bus lives in process memory; a multi-instance deployment would need a shared transport. The free blueprint runs one service, so this is deferred rather than hidden.
- **Client behaviour** (`frontend/src/hooks/useEnquiryEvents.ts`): opens the account's stream, coalesces a burst into one refresh (1s debounce), deliberately drops frames while the tab is hidden and does one catch-up read on return, and falls back to a 20s visible-tab poll when the tier is off or the stream errors. `/enquiries`, `/enquiry/:id`, `/agency/enquiries` and its open sheet all use it; the private guest link keeps plain reads because it has no account channel.
- **Read receipts stay meaningful.** Opening a thread (either side) still marks that side read. With the agency sheet open, a frame re-reads the thread before the list, so the list cannot restore an unread badge the read just cleared.
- **Deferred:** email/WhatsApp notification, a live nav badge outside the inbox, cross-instance fan-out, and a multi-epoch thread archive.

**Verified 2026-10-29:** backend suite 884/884; frontend typecheck, lint and production build clean. Browser smokes with `ENABLE_ENQUIRY_SSE=true`: the traveller list flipped to "Replied · N new" in place, an open thread appended a reply without navigating, the agency inbox gained a lead at the top with counters moving, an agency reply flipped sheet and card to Replied, and a `Won` filter correctly withheld a new lead. With the flag off, R2 proved the 20s poll path (stale at ~10s, updated after the tick). Synthetic accounts, enquiries and audit rows were deleted afterwards.

### R5 — Close the loop: quote hand-off, status truth and the funnel guard

**Status:** implemented and verified 2026-10-29, the four "close the loop" gaps from the process audit. The polish gaps (in-app accept/decline, traveller-facing status labels, counts outside the inboxes) shipped afterwards as R6.

**Goal:** every step of lead → client → trip → quote → acceptance leaves a trace the other screens can see, and the funnel cannot claim work that did not happen.

- **A profile lead can start a trip.** `POST /api/agency/enquiries/:id/trip` converts the lead to a client (reusing the directory's create-or-reuse rules), opens a blank trip titled "Trip for <name>" with the dates the traveller asked for, and stamps `AgencyEnquiry.tripId` — tenant-only, absent from the traveller's view. The trip id is generated first and claimed with a compare-and-set, so a double click cannot leave two blank trips; the loser reads the winner's link, and a link to a trip deleted by hand is replaced rather than kept. The inbox footer offers "Quote this trip" when the lead has a package trip or a started trip; both land on `/agency/trips/:tripId?tab=quote&client=…&adults=…&children=…`, so a profile lead is no longer a dead end.
- **The funnel follows the work.** Sharing a proposal moves a `new`/`replied` lead to `quoted` (stamping `repliedAt` when it was empty) *before* the traveller's `proposal:new` frame, so both screens resync to one status. Accepting a proposal — through the public link, or an agency marking the quote accepted for a phone booking — sets the lead to `won` and `convertedAt`, clears a parked `lostReason`, and fans `enquiry:updated` to both channels. A won or lost lead keeps the status its agency chose if another proposal goes out.
- **Conversion is bookkeeping, not a win.** `POST …/convert` writes `clientId`/`convertedAt` and leaves the status where it was; `won` now arrives only from an acceptance or a manual move.
- **Manual moves are guarded.** Allowed: `new → replied|quoted|won|lost`, `replied → quoted|won|lost`, `quoted → replied|won|lost`, `won → quoted|replied|lost`, `lost → new|replied|quoted`. Everything else is a `409`; a lost lead must be reopened before it can be won, and a manual `won` requires a client ("Convert this lead to a client before marking it won."). Automation writes its own transitions and is not limited by the map.
- **Deferred with reasons:** a system message in the thread on acceptance — `AGENCY_ENQUIRY_MESSAGE_AUTHORS` is `traveller|agency`, so a system bubble needs a thread-contract change. (The traveller-facing label map and in-app answers are closed by R6.)

**Verified 2026-10-29:** backend suite **894/894** (52 in the touched suites), backend `tsc --noEmit`, frontend typecheck and production build clean. Browser smoke on `m9-hills-horizons` with a synthetic traveller: the profile enquiry appeared in the inbox; a manual `PATCH { status: "won" }` was refused `409` "Convert this lead to a client before marking it won."; "Start a trip" navigated to `/agency/trips/<id>?tab=quote&client=<id>&adults=2&children=1` with the quote form prefilled (client name/email, 2 adults, 1 child) and the trip titled "Trip for R5 Smoke Traveller"; the lead stayed `New` with a client chip, its timeline read "Converted", and "Quote this trip" returned to the same trip. The synthetic user, enquiry, client, trip and audit rows were deleted afterwards.

### R6 — The polish batch: answer in-app, speak traveller, count outside the inbox

**Status:** implemented and verified 2026-10-29. The three gaps R5 left open.

**Goal:** the traveller can finish the deal where they read the proposal, the screens speak their language rather than the agency's funnel, and nothing important waits for them to open an inbox to be noticed.

- **Accept and decline in place (gap 4).** `POST /api/proposals/:linkId/accept` and `/decline` sit on the personal router. Accept reuses the token page's acceptance core (`acceptLink`), so the quote CAS, the two audit rows and the lead-won write are identical; only `via` changes to `in-app`. Decline stamps `declinedAt` on the link — the quote stays `sent`, the lead keeps its funnel status, and no audit row claims work that did not happen beyond `share.declined`. A declined version cannot then be accepted ("You declined this proposal. Ask the agency for an updated one."), on either surface; the agency answers with a new proposal. Both actions are two-step in the card, idempotent on retry, and owner-scoped by the same `enquiry → client → quote` proof as the rest of `/proposals`. The agency's share list shows a rose `Declined` badge and the date.
- **Traveller vocabulary (gap 5).** `TRAVELLER_ENQUIRY_STATUS_LABELS` maps the funnel to `Sent / Replied / Proposal ready / Accepted / Closed`, with its own badge classes, on `/enquiries`, the thread header and the profile preview. `Accepted` is deliberate: accepting confirms the quote, it does not take a payment. The agency inbox keeps the internal words. Proposal cards also stopped showing raw quote states (`sent`, `cancelled`) and now read `Awaiting you / Accepted / Declined / Expired / Withdrawn`.
- **Counts outside the inboxes (gap 6).** The personal navbar reads `GET /api/enquiries/summary` on each route change and shows a badge on Enquiries: unread agency replies win the pill, and with an empty inbox a live proposal shows an indigo proposal count instead. The summary counts **unanswered** proposals only — a proposal the traveller accepted or declined is still live in the thread, but it is no longer work waiting for them (the smoke caught the badge nagging after an answer). The per-row count on `/enquiries` stays a history count of the thread's proposals. It is a read per navigation, not a second SSE stream, because the navbar is mounted on every page. The agency sidebar badge, which R4 left as refetch-on-navigation, now also listens to `agency:<id>` via `useEnquiryLiveRefresh` while the team is anywhere but the inbox; the inbox page keeps its own stream so only one connection is open.
- **Deferred:** decline from the public token page (the link keeps accept only), an optional decline note or system thread message (still blocked on the thread-author contract), and a live traveller nav badge (would need the SSE connection the navbar deliberately avoids).

**Verified 2026-10-29:** backend suite **903/903** (46 in the touched suites: `enquiries`, `proposals`, `proposalActions`), backend `tsc --noEmit`, frontend typecheck and production build clean; lint on the twelve touched files reports only the repo's pre-existing `no-explicit-any` hits on untouched lines. Browser smoke on a seeded `r6-smoke-agency` tenant with one synthetic traveller and two sent proposals: the navbar showed `1 unread replies` on the dashboard; `/enquiries` read `Proposal ready` (never `Quoted`) with `1 new`; `/proposals` showed both cards `Awaiting you`; "Not this one" → "Confirm decline" stamped only the link (`declinedAt` set, quote stayed `sent`) and the card switched to `Declined` with the "stays in this conversation" note; "Accept proposal" → "Confirm acceptance" flipped the other quote to `accepted`, its link to `acceptedAt`, the lead to `won`, and wrote `share.accepted` + `quote.accepted` (`via: in-app`); the audit trail held exactly one `share.declined` (the unit suite pins the 409 when a declined version is answered again); the thread read `Accepted` with both cards showing their answer and no buttons, and the nav badge cleared once the reply was read and nothing was left unanswered. On the agency side the sidebar showed no badge on `/agency/trips` (the only lead was `won`), then a lead submitted through the public API from outside the browser raised it to `1` in place — no reload — proving the `agency:<id>` stream. All synthetic rows were deleted and both sessions logged out afterwards.

### R7 — Six answers from the R6 audit

**Status:** implemented and verified 2026-10-29. Six gaps left after R6, plus one refinement the smoke forced.

**Goal:** the badges, the comparison page and the agency's inbox agree with the quote lifecycle, and the two surfaces that can answer a proposal cannot disagree about it.

- **The badge counts what can still be answered.** `liveProposalsByEnquiry(rows, { unansweredOnly })` no longer trusts "live link and no answer". It reads each link's pinned quote and keeps it only when `effectiveQuoteStatus` is still `sent`; accepting one version also settles its trip, so a sibling version that is technically still `sent` stops counting the moment the trip has an accepted quote — that sibling is refused at acceptance (below), so it is not work waiting for the traveller. The quote-status filter is why an agency-side acceptance (which writes the quote, not the link) clears the pill.
- **A trip accepts once.** `acceptLink` refuses a second accepted quote for the same trip (`409`, "You already accepted another version of this proposal…") before the CAS, so a traveller holding two versions of one trip cannot accept both. The guard reads only siblings (`_id: { $ne: quote._id }`), so re-hitting the same link still takes the idempotent path.
- **`/proposals` is live.** `MyProposals` now uses `useEnquiryLiveRefresh` with the same quiet-reload and request-sequence guard as `/enquiries`, shows the usual `Live` pill, and keeps the spinner for the first load only. A frame during a refresh cannot paint an older list over a newer one.
- **The agency hears a decline.** `declineAgencyProposalForUser` emits `proposal:declined` on `agency:<id>` with `enquiryId`, `linkId` and `declinedAt` after the audit row lands. The traveller's own channel is deliberately not fanned: they performed the write, so the frame would only echo. An ad-hoc link with no enquiry still emits, with `enquiryId: ''`.
- **The navbar badge catches up with a read.** A small `window` event (`travelai:enquiry-badge-changed`, `lib/enquiryBadge.ts`) is dispatched by the thread after its read receipt lands and after accepting or declining from either surface; `Navbar` re-reads the summary on it. The thread also fires once on its first read (`null` → known), because the navbar may have counted before that request's receipt was written.
- **"Price held until", not "link until".** The traveller card drops the internal expiry wording; it shows the quote's own validity date, or "No expiry given". The link expiry stays a backend rule.

**Verified 2026-10-29:** backend suite **907/907** (34 `enquiries`, 25 `proposalActions` + `enquiryEvents`, 16 `proposalActions` + `proposalEvents` in the touched runs), backend `tsc --noEmit`, frontend typecheck, production build and lint on the touched files clean. Browser smoke on a synthetic `r7-smoke-travel` tenant with one traveller thread and six proposals: the thread's badge cleared on read while the proposals pill read `4`; `/proposals` rendered six cards with the `Live` pill, no "link until", and "Price held until …" on each; the two-step accept on `Q-2026-9004` persisted (`accepted`, link stamped) and the card flipped to `Accepted`, with the summary dropping to `2` — the sibling version on the same trip was excluded as designed; `POST …/accept` for the sibling answered the new `409`; declining `Q-2026-9006` flipped the card to `Declined`, raised the "conversation stays open" toast and left the summary at `1`; an agency session with `/api/agency/enquiries/events` open received exactly one `proposal:declined` frame carrying the same `enquiryId`, `linkId` and `declinedAt`. All synthetic rows were deleted and the temporary script removed.

### R7 follow-up — the sibling card tells the truth, and the price line follows the quote

**Status:** implemented and verified 2026-10-29, the two logic gaps left after R7 (the third, a concurrent double-accept race, stays deferred).

**Goal:** a card never advertises work the server will refuse, and the card's price line stops implying a hold that no longer exists.

- **The server projects the settled trip.** `summarizeLinks` loads the accepted quotes for every pinned trip in one query and exposes `settledByAcceptedTrip` on `AgencyProposalSummary`: true when *another* version of the same trip is already accepted. The card stays readable; it is the buttons that are withheld. Projecting it server-side (rather than inferring from sibling cards on the client) keeps the rule in one place and works on a filtered or paginated list.
- **The refused workflow is no longer offered.** `ProposalComparison` treats a settled sibling like an answered card: the badge reads `Another version accepted` in muted tones instead of `Awaiting you`, and neither Accept nor Decline renders, because the `409` guard would refuse them. Accepting in place also patches the row's other versions in `MyProposals` optimistically, so the screen matches what the next read from the server will project.
- **"Price held until" only on open quotes.** The line renders just when the card is answerable (`sent`, not answered, not settled); accepted, declined, expired, cancelled and withdrawn cards drop it, matching the earlier removal of internal expiry wording.
- **Still deferred:** concurrent double-accept is protected by the quote CAS and the sibling read, but a true same-instant race between two requests on two versions of one trip is not closed by a unique index yet.

**Verified 2026-10-29:** backend suite **909/909** with `src/services/agency/proposalSummary.test.ts` (registered in the explicit test list) pinning the sibling/own/open projection and the exact key sets; backend `tsc --noEmit`, frontend typecheck, production build and lint clean. The test stub mimics Mongoose field selection, and that caught a real defect in this pass: the summary's quote query did not `select('tripId')`, so the settled rule would have been silently dead in production while the permissive stub passed. The projection is fixed and the test now fails if `tripId` drops out of the select again. The browser pass was not repeated for this refinement: the card logic is the one already smoked in R7, with `settled` fed by the new field.

### R8 — The sent quote becomes a guided hand-off

**Status:** implemented and verified 2026-10-29, after a real report ("in my enquiry tab enquiries are listed but i cannot see the proposal or itinerary sent by the agency").

**Goal:** sending a quote and delivering a proposal are two different actions, so the UI must connect them instead of letting the traveller wait on a promise nobody kept.

- **The report was accurate, not a display bug.** A read-only pass over the reported enquiry found a `sent` quote on the lead's trip but **zero client exports and zero proposal links**. "Send quote" only locks the quote version; the traveller sees a proposal only when a share link (pinned to a ready client export) exists, which is created in the trip's Export tab. The thread's "No proposal has been sent for this enquiry yet" was the truth.
- **Sending writes the funnel back.** `sendQuote` now stamps `quoted` on the lead behind the quote's client (`AgencyClient.sourceEnquiryId` → `markEnquiryQuotedByProposal`), the same transition the share path already performs. A `won`/`lost` lead keeps its status, a client without an enquiry is a no-op, and re-sending is idempotent.
- **"Proposal ready" is gated on an actual proposal.** `travellerEnquiryStatusLabel(status, hasLiveProposal)` reads `In progress` when a `quoted` lead has no live link and keeps `Proposal ready` only when one exists; the badge class matches (`travellerEnquiryStatusBadgeClass(status, hasLiveProposal)`). Wired into `/enquiries`, the signed-in thread and the profile preview, all of which already know the live proposal count.
- **The agency gets the hand-off.** The sent quote panel shows "Send proposal to traveller", which opens the existing Export tab through the page's own `switchTab` (URL keeps `?tab=export`, so a reload lands in the right place). The send toast now says the quote is locked and that sharing delivers it, instead of implying delivery.
- **Still deferred:** automatically minting an export and share link from send. Template choice and PDF generation stay an explicit agency step; R8 only removes the dead end between the two.

**Verified 2026-10-29:** backend suite **914/914**, with `src/services/agency/sendQuote.test.ts` (registered in the explicit test list) pinning the fresh-lead transition, the untouched `won` lead, the client-without-enquiry no-op, idempotent re-send and the viewer role refusal; backend `tsc --noEmit`, frontend typecheck, production build and lint clean (only the repo's pre-existing `no-explicit-any` hits). Browser smoke on synthetic fixtures in the test database: a `quoted` lead with no proposal read `In progress` on `/enquiries`; after a live proposal link was attached it read `Proposal ready` with `1 proposal`; the agency trip's quote tab rendered `Q-2026-9001 v2 Sent` with "Send proposal to traveller", and clicking it moved to `?tab=export` with the Proposal exports panel. All synthetic users, membership, enquiry, quote and link were deleted and the temporary script removed.

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
| 8 | D8 conversations + proposal comparison | D5, D6, A7 |
| 9 | D9 sign-in gate on the enquiry write | D5, D8 |
| 10 | R1–R3 live enquiry tier | D5, D8 |
| 11 | R5 close the loop (trip hand-off, funnel write-back, guards) | D6, D8, A7 |
| 12 | R6 polish batch (in-app answers, traveller vocabulary, nav badges) | D8, R5 |
| 13 | R7 audit fixes (badge truth, one-acceptance rule, live comparison, decline frame) | R6 |
| 14 | R7 follow-up (settled-trip projection, price line only on open quotes) | R7 |
| 15 | R8 guided hand-off (send writes `quoted`, label gated on a live proposal, Export CTA) | R5, R7 follow-up, A7 |

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
2. Guest enquiries vs signed-in only — **resolved in D9: signed-in only**; browsing stays anonymous and legacy guest links keep working until expiry.
3. Whether the "from" price is mandatory on a published package (default: optional).
4. Whether listing is bundled into every active agency (default) or becomes a paid entitlement once pricing is approved.
5. Whether consumers get an in-app enquiry thread in this milestone — **resolved in D8: yes**, with a read-only proposal comparison; D9 replaced the private guest link for new enquiries with the signed-in thread.
