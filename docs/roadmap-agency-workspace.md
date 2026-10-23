# Agency Workspace - implementation milestone plan

**Status:** A0 accepted (2026-10-22); A1 implemented and verified (2026-10-22); A2 implemented and verified (2026-10-22); A3 implemented (2026-10-22); A4 implemented and verified (2026-10-22); A5 implemented and verified (2026-10-22); A6 implemented and verified (2026-10-23); A7 implemented and verified (2026-10-23).

**A0 artifacts:** `docs/adr/0001-agency-workspace-boundary.md`, `docs/agency-a0-test-plan.md`, `docs/agency-a0-wireframes.md`, feature flag `AGENCY_WORKSPACE_ENABLED` (default false) and read-only `GET /api/agency/status`.

**A1 artifacts:** tenant models (`Agency`, `AgencyMember`, `AgencyInvite`), hashed agency invites, tenant guards, `/api/agency` onboarding/team endpoints and the `/agency` shell with onboarding, switcher, team and settings. See `docs/agency-a1-test-plan.md`.

**A2 artifacts:** agency trip fields and indexes, tenant trip list/create/assignment/trash routes, agency-aware trip guard, agency wizard mode, `/agency/trips` library and client-invite listing. See `docs/agency-a2-test-plan.md`.

**A3 artifacts:** agency branding fields (mascot, typography, GSTIN), `AgencyAsset` model, private tenant storage with an authenticated content route, admin-only upload/delete plus the settings brand library and preview. Tests live in `backend/src/services/agency/assets.test.ts`.

**A4 artifacts:** `AgencyClient` directory model/service/routes and `/agency/clients`, `AgencyQuote` versioned model with server-side minor-unit pricing, client/internal projections, quote number allocation, agency default inclusions/exclusions/terms, the trip Quote tab with internal vs client preview, and status/version actions (`send`, `accept`, `cancel`, new version). Tests live in `backend/src/services/agency/quotes.test.ts`, `models.test.ts`, `routes/agency.routes.test.ts` and `assets.test.ts`; see `docs/agency-a4-test-plan.md`.

**A5 artifacts:** versioned `ExportDocument` builder, `AgencyTemplate`/`AgencyExport`/`AgencyAudit` models, built-in `brochure` and `internal-summary` HTML renderers, headless-Chrome PDF jobs with retry, private export storage, ten-minute signed staff downloads, export rate limiting and audit events, and the trip Export tab (template picker, quote confirmation, real preview, generate/download, history). Tests live in `backend/src/services/agency/exports/exports.test.ts`, `models.test.ts`, `routes/agency.routes.test.ts` and `assets.test.ts`; see `docs/agency-a5-test-plan.md`.

**A6 artifacts:** `AgencyTemplateVersion` model with immutable version rows and private source storage, the validated HTML template contract (`docs/agency-template-contract.md`), asset snapshotting (logo, mascot, fonts, cover, day images), preview-before-activation with real-trip rendering, version pinning on export jobs, one default per audience, archive/restore, and the `/agency/templates` gallery with upload, preview, manage and read-only member views. Tests live in `backend/src/services/agency/exports/templateValidation.test.ts`, `templateAssets.test.ts`, `customTemplate.test.ts`, `templateManagement.test.ts` and `scripts/smoke-a6.mts`; see `docs/agency-a6-test-plan.md`.

**A7 artifacts:** `AgencyProposalLink` capability-token share rows (hashed at rest, TTL-indexed, revocable), public `GET/POST /api/agency/proposals/:token[/accept|/pdf]` routes that re-render the pinned client export server-side, staff create/list/revoke share routes, the public `/proposal/:token` page (sandboxed document iframe, client-only quote summary, accept and PDF download) and share management in the export panel. Tests live in `backend/src/services/agency/proposals.test.ts`, `routes/agency.routes.test.ts` and `scripts/smoke-a7.mts`; see `docs/agency-a7-test-plan.md`.

**Goal:** add a separate B2B product for travel agencies without changing the individual traveler experience.
**Scope:** agency accounts, team roles, client records, quotes, branded/custom PDF exports, and all existing trip features under an agency-owned workspace.

---

## 1. Product boundary

The individual product stays exactly where it is:

- `/` landing page, `/dashboard`, `/planner`, `/trip/:id`
- personal trips owned by a user
- existing collaboration roles: owner, editor, commenter, viewer
- existing PDF, JSON and text exports in `ShareExportModal`
- existing chat, polls, decisions, maps, weather, expenses, versions and trash

The agency product is a separate front door:

- `/agency` - agency dashboard, trips, clients, quotes, templates, settings
- `/api/agency` - agency-only API namespace
- agency-owned trips and agency-level roles
- agency branding, commercial quote fields, custom PDF templates and export history

A user who belongs to an agency can use both products, but the two workspaces do not mix lists, navigation or authorization.

**Non-negotiable:** the individual product must remain usable with no agency account, no extra required fields and no new team concepts.

---

## 2. Architecture decisions to lock before coding

| Decision | Recommended choice | Why |
|---|---|---|
| Tenancy model | Same database, `agencyId` on agency-owned records | Reuses AI, maps, chat, expenses, versions and invites; separate database would duplicate too much |
| Trip model | Reuse `Trip` with optional `agencyId` and `workspace` | Avoid a second itinerary/chat/expense implementation |
| Individual isolation | Individual queries only accept `workspace: 'personal'` or `agencyId` absent | Prevents agency trips appearing in personal dashboards |
| Agency isolation | Every agency query filters by `agencyId` | One missed filter is a data leak; make it structural |
| Agency roles | `owner`, `admin`, `planner`, `viewer` | Enough for a small agency; add `agent` only if real demand appears |
| Trip visibility | Agency-wide by default; optional assigned-only later | Small agencies expect shared visibility; assignment can be added without changing ownership |
| Client access | Existing trip invites/share links, not `AgencyMember` | Clients are collaborators, not staff |
| Renderer | HTML/CSS -> PDF via Gotenberg or Chromium worker | The attached brochure is a designed document, not a Word template |
| Document formats | HTML first, DOCX later, PDF background as a bridge | HTML preserves layout and supports variable day counts |
| Template onboarding | Managed templates first, self-serve theme editor later | Agencies can supply a design but cannot reliably author a safe template |
| Agency domain | `/agency` path first, subdomain later | Faster to ship; same-origin CSP and cookies already work |
| Agency onboarding | Invite-only pilot, then self-serve | Limits support load and template onboarding cost |

**Explicitly rejected for v1:** filling arbitrary PDFs, automatic conversion of any PDF/Canva/Figma file into a template, and AI-generated legal or cancellation text.

---

## 3. Tenancy and authorization

### 3.1 Data ownership

```text
Agency
  ├── AgencyMember (staff)
  ├── AgencyClient (customer record)
  ├── AgencyTemplate
  ├── AgencyAsset
  ├── AgencyQuote
  ├── AgencyExport
  └── Trip (agencyId set, workspace = 'agency')
        ├── existing members[] (staff + client collaborators)
        ├── existing chat/comments/polls/decisions/expenses/versions
        └── existing trip content
```

### 3.2 Guards

Add one agency authorization layer:

- `requireAgencyMember` - the caller belongs to the agency.
- `requireAgencyRole('admin' | 'planner' | 'viewer')` - staff capability.
- `requireAgencyTripRole('owner' | 'editor' | 'commenter' | 'viewer')` - agency membership plus the existing trip-role guard.
- `loadAgencyTrip` - always filters `{ _id, agencyId }`.

Rules:

- An agency owner/admin can manage the agency, templates, team, billing and all agency trips.
- A planner can create and edit agency trips.
- A viewer can read agency trips and exports but cannot edit.
- Client collaborators keep the existing trip roles and never receive agency management capabilities.
- Every agency query includes `agencyId`; never trust an id from the URL alone.
- A personal user cannot open an agency route, and an agency member cannot see agency trips in the personal dashboard.

### 3.3 Individual-product protection

The existing personal queries must add an explicit personal filter. This is the only change to individual code paths:

```ts
{ 'members.userId': me, agencyId: { $exists: false } }
```

or, if `workspace` is added:

```ts
{ 'members.userId': me, workspace: 'personal' }
```

Missing `workspace` is treated as personal during rollout. Add tests that prove:

- a personal dashboard never returns an agency trip;
- an agency route never returns a personal trip;
- a cross-agency id returns 404, not 403;
- the existing 336 backend tests still pass unchanged.

---

## 4. Data model

### 4.1 Agency

```ts
Agency {
  _id
  name
  slug
  logoUrl?
  mascotUrl?
  brand: {
    primaryColor
    accentColor
    fontHeading?
    fontBody?
  }
  contact: { phone?, email?, website?, instagram? }
  address?
  gstin?
  defaultCurrency
  defaultTerms: {
    inclusions: string[]
    exclusions: string[]
    thingsToCarry: string[]
    cancellationPolicy: string[]
    paymentTerms: string[]
  }
  plan: {
    code: 'pilot' | 'starter' | 'pro'
    seats: number
    monthlyExports: number
    storageMb: number
  }
  status: 'active' | 'suspended'
  createdAt
  updatedAt
}
```

### 4.2 Agency members and invites

```ts
AgencyMember {
  agencyId
  userId
  role: 'owner' | 'admin' | 'planner' | 'viewer'
  status: 'active' | 'invited' | 'disabled'
  invitedBy?
  joinedAt
}

AgencyInvite {
  agencyId
  email
  role
  tokenHash
  expiresAt
  acceptedAt?
  revokedAt?
  createdBy
}
```

Unique index: `{ agencyId, userId }`.  
Protect the last owner: removing/demoting the last owner returns 409.

### 4.3 Trip additions

```ts
Trip {
  ...existing fields
  agencyId?: ObjectId
  workspace: 'personal' | 'agency'
  assignedTo?: ObjectId
  clientId?: ObjectId
}
```

No required migration for existing rows: treat missing `workspace` as personal. If the field is backfilled, use an idempotent script.

Indexes:

```text
{ agencyId: 1, workspace: 1, isDeleted: 1, updatedAt: -1 }
{ agencyId: 1, assignedTo: 1, updatedAt: -1 }
```

### 4.4 Agency client

```ts
AgencyClient {
  agencyId
  name
  email?
  phone?
  company?
  notes?
  createdBy
  createdAt
  updatedAt
}
```

A client is a reusable address book entry; trip collaborators remain the access mechanism.

### 4.5 Agency quote

Keep commercial data out of `tripDetails`. The AI itinerary remains content; the quote is a separate versioned document.

```ts
AgencyQuote {
  agencyId
  tripId
  number
  version
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'cancelled'
  client: {
    name
    email?
    phone?
    adults
    children
    rooms?
  }
  currency
  exchangeRate?
  lineItems: Array<{
    label
    description?
    quantity
    unitPrice
    total
  }>
  subtotal
  markupPct
  taxPct
  discount
  total
  perPerson
  validUntil
  inclusions: string[]
  exclusions: string[]
  terms: string[]
  preparedBy?
  sentAt?
  acceptedAt?
  createdAt
  updatedAt
}
```

Rules:

- Quote number unique per agency.
- Totals are computed server-side; the client never sends the final total.
- Currency is explicit; do not silently mix INR and another currency.
- Quote history is append-only when a quote is sent; editing a sent quote creates a new version.
- Client-facing projections never include internal cost, markup or expenses.

### 4.6 Agency template

```ts
AgencyTemplate {
  agencyId
  name
  engine: 'html' | 'docx' | 'pdf-background'
  status: 'draft' | 'active' | 'archived'
  version: number
  schemaVersion: 1
  audience: 'client' | 'internal'
  isDefault: boolean
  storageKey
  previewKey?
  createdBy
  createdAt
  updatedAt
}
```

Unique default per `{ agencyId, audience, isDefault: true }` enforced in service logic and tested.

### 4.7 Agency assets

```ts
AgencyAsset {
  agencyId
  kind: 'logo' | 'mascot' | 'font' | 'image'
  storageKey
  mime
  bytes
  originalName?
  fontFamily?
  licenseNote?
  createdAt
}
```

Store fonts only when the agency confirms it has the right to embed them. Keep an explicit license note.

### 4.8 Export job

```ts
AgencyExport {
  agencyId
  tripId
  quoteId?
  templateId
  templateVersion
  format: 'pdf' | 'docx' | 'xlsx'
  status: 'queued' | 'rendering' | 'ready' | 'failed'
  outputKey?
  error?
  requestedBy
  expiresAt
  createdAt
  completedAt?
}
```

### 4.9 Audit log

```ts
AgencyAudit {
  agencyId
  actorId
  action: string
  targetType: string
  targetId?
  metadata?
  createdAt
}
```

Minimum events: member invited/removed, template activated, quote sent/accepted, export generated, trip deleted/restored/purged.

---

## 5. API surface

All agency routes live under `/api/agency` and use the agency guards.

### 5.1 Agency and team

```text
POST   /api/agency/onboarding
GET    /api/agency
PATCH  /api/agency
GET    /api/agency/members
POST   /api/agency/invites
POST   /api/agency/invites/accept
DELETE /api/agency/invites/:id
PATCH  /api/agency/members/:userId
DELETE /api/agency/members/:userId
```

### 5.2 Clients

```text
GET    /api/agency/clients
POST   /api/agency/clients
PATCH  /api/agency/clients/:id
DELETE /api/agency/clients/:id
```

### 5.3 Trips

```text
GET    /api/agency/trips
POST   /api/agency/trips
GET    /api/agency/trips/:id
PATCH  /api/agency/trips/:id
DELETE /api/agency/trips/:id
POST   /api/agency/trips/:id/restore
DELETE /api/agency/trips/:id/purge
```

Trip content, chat, polls, decisions, versions, expenses, weather and maps reuse the existing services through an agency-aware adapter. Do not fork the business logic.

### 5.4 Quotes

```text
GET    /api/agency/trips/:id/quote
PUT    /api/agency/trips/:id/quote
POST   /api/agency/trips/:id/quote/send
POST   /api/agency/trips/:id/quote/accept
GET    /api/agency/trips/:id/quote/versions
```

### 5.5 Templates and assets

```text
GET    /api/agency/templates
POST   /api/agency/templates
GET    /api/agency/templates/:id
PATCH  /api/agency/templates/:id
POST   /api/agency/templates/:id/activate
POST   /api/agency/templates/:id/archive
POST   /api/agency/templates/:id/preview
POST   /api/agency/assets
DELETE /api/agency/assets/:id
```

### 5.6 Exports

```text
POST   /api/agency/trips/:id/exports
GET    /api/agency/exports/:id
GET    /api/agency/exports/:id/download
GET    /api/agency/exports
```

`POST` returns `202` with an export id when rendering is asynchronous. The download endpoint returns a short-lived signed URL, not a public object URL.

### 5.7 Public/client routes

```text
GET    /api/public/agency/:shareId
POST   /api/public/agency/:shareId/accept
GET    /api/public/agency/:shareId/export
```

Reuse the existing share-token verification and rate limiting. Public projections must use an allow-list, never a raw `Trip` document.

---

## 6. Frontend surface

### 6.1 Agency shell

- `/agency` dashboard: active trips, quotes expiring, recent exports, team activity.
- `/agency/trips` list: search, status, destination, assigned staff, client.
- `/agency/trips/new` and `/agency/trips/:id`: reuse the existing planner and itinerary display inside an agency shell.
- `/agency/clients`: reusable client records.
- `/agency/templates`: template gallery, preview, default, audience, version.
- `/agency/settings`: brand, contact, terms, team, plan/usage.

### 6.2 Individual shell

Unchanged. Only add a small "Agency workspace" link for users who are active agency members.

### 6.3 Trip header

Agency trip header adds:

- client name
- quote status
- assigned planner
- **Export proposal** action
- **Share with client** action

The existing tabs (Itinerary, Budget, Expenses, Map, History, People, Chat) remain available.

### 6.4 Export flow

1. Open **Export proposal**.
2. Choose a client or internal template.
3. Confirm or edit quote details.
4. Preview.
5. Generate PDF.
6. Download or copy the client link.

The preview must show the actual template, not a generic layout.

### 6.5 Template management

For the pilot:

- Template gallery with 1-3 built-in designs.
- Agency branding: logo, mascot, colors, fonts, photos.
- Managed custom template: the team builds it from the agency's source design.
- Preview against a real trip before activation.
- Version history; old exports remain tied to their template version.

Self-serve HTML editing is deliberately deferred. It is a security and support burden.

---

## 7. Export and template subsystem

### 7.1 Canonical export model

The renderer never reads a Mongoose document directly. Build a versioned DTO:

```ts
ExportDocument {
  schemaVersion: 1
  generatedAt
  agency: {
    name, logoUrl, mascotUrl, address, phone, email, website,
    instagram, gstin, colors
  }
  trip: {
    id, title, destination, startDate, endDate, durationDays, nights,
    groupType, season
  }
  client: { name, email, phone, adults, children, rooms }
  quote: {
    number, date, validUntil, currency,
    total, perPerson, inclusions, exclusions, terms
  }
  days: Array<{
    day, date, title, summary,
    activities: Array<{ time, title, description, location, cost }>,
    stay, food, transport, tips, permitRequired,
    imageUrl?
  }>
  recommendations: string[]
  thingsToCarry: string[]
  cancellationPolicy: string[]
  contact: { phone, email, website, instagram }
}
```

Normalize the current unions:

- `activities: (string | ActivityItem)[]` -> always structured objects.
- `stay_recommendations: (string | StayItem)[]` -> always structured objects.
- Missing dates -> `null`, never an invalid date string.
- Currency -> explicit code plus formatted string.
- `day.imageUrl` -> agency upload, curated destination image or branded fallback.

Add unit tests for every normalization and for missing/optional data.

### 7.2 HTML template engine

- Templates are HTML/CSS pages with a small, logic-light template syntax (loops and conditionals only).
- No arbitrary JavaScript, no server-side code execution, no remote asset fetch from the template.
- Assets are resolved through an allow-list and inlined or served from a signed render URL.
- Use A4 page CSS and explicit page breaks.
- Repeat the day page for every itinerary day.
- Auto-fit long text or create a continuation page.
- Keep the cover and section pages fixed.

Renderer options:

1. **Gotenberg sidecar** - HTML/DOCX -> PDF, isolated service, no browser dependency in the main app.
2. **Playwright/Chromium worker** - more control, but a heavy dependency and memory footprint.
3. **CloudConvert** - fastest to start, but sends client PII to a third party.

Recommended: Gotenberg sidecar or a dedicated render worker. Keep the Express app out of the PDF rendering business.

### 7.3 The attached brochure

The attached `TEMPLATE.pdf` is a designed 11-page A4 brochure:

- cover with logo, photo, mascot and contact icons
- recommendations page
- day pages with photography
- inclusions/exclusions
- things to carry
- cancellation policy
- fixed footer with day/page markers
- custom fonts: Archivo Black, Brittany Signature, Agrandir Bold, Poppins, Bebas Neue

It has no form fields and its text layer is broken. Do not build against the broken file. Request the source design (Canva/Figma/InDesign/Word), font files, logo, mascot and photos.

Build a **built-in HTML brochure template** that mirrors this structure. Agencies customize brand assets and content; exact one-off designs are a managed onboarding service.

### 7.4 Optional PDF-background bridge

For an agency that only has a fixed PDF:

1. Convert each page to a high-resolution background image.
2. Define text/image slots per page type.
3. Render an HTML page with the background and absolutely positioned slots.
4. Print to PDF.

This preserves the exact visual but has limits: fixed layout, manual slot mapping, text overflow, static photos and fixed page counts. Treat it as a migration bridge, not the primary engine.

### 7.5 DOCX and XLSX

- DOCX: `docx-templates` or `docxtemplater` for agencies with Word-native proposals.
- XLSX: `exceljs` for costing/back-office handoff.
- CSV/XLSX formula injection: prefix values starting with `=`, `+`, `-`, `@`.

Do not force the designed brochure into DOCX.

---

## 8. Feature parity matrix

| Individual feature | Agency workspace |
|---|---|
| AI itinerary generation | Reuse, agency context |
| Planner and itinerary editing | Reuse inside `/agency` |
| Maps, routes, nearby, weather | Reuse |
| Budget and expenses | Reuse; internal only |
| Chat, polls, decisions | Reuse; same E2EE rules |
| Version history and restore | Reuse |
| Trash, restore, purge | Reuse; agency owner/admin only |
| Viewer/commenter/editor roles | Reuse for trip collaborators |
| Profile, password, avatar | Reuse; plus agency profile |
| Public share link | Reuse, branded by agency |
| PDF/JSON/text export | New agency export pipeline |
| Team and roles | New |
| Clients | New |
| Quotes | New |
| Custom templates | New |
| Audit and usage | New |

**E2EE boundary:** the server cannot read trip chat. Agency exports contain itinerary and quote content only. If agencies need notes, add a plaintext `trip.notes` field; never promise chat export from the server.

---

## 9. Milestones

### A0 - Architecture lock and guardrails

**Size:** S  
**Depends on:** none

Deliverables:

- ADR recording tenancy, roles, renderer, template onboarding and billing decisions.
- Feature flag: `AGENCY_WORKSPACE_ENABLED`.
- Test plan for tenant isolation and individual regression.
- Wireframe for `/agency` shell and export flow.

Exit criteria:

- Decisions signed off.
- No code path can create an agency trip before A1.
- Existing individual suite remains green.

---

### A1 - Agency tenancy, onboarding and team

**Size:** L  
**Depends on:** A0  
**Status:** Implemented (2026-10-22). Automated and local tenant smoke tests pass; production enablement is a separate ops step.

Backend:

- `Agency`, `AgencyMember`, `AgencyInvite` models and indexes.
- Create agency, get/update agency, member list, invite/accept/revoke, role change, remove member.
- Last-owner protection.
- `requireAgencyMember` and `requireAgencyRole`.
- Invite links are copyable; email delivery is not required for v1.

Frontend:

- `/agency` shell with its own nav and layout.
- Onboarding wizard: agency name, branding basics, first invite.
- Agency switcher for users in multiple agencies.
- Team settings with pending invites.

Tests:

- Two agencies cannot see each other's members.
- A personal user gets 404 on agency routes.
- Last owner cannot be removed or demoted.
- Invite token is hashed; accepted once; expired/revoked rejected.
- Individual dashboard and auth tests unchanged.

Exit criteria:

- A pilot agency can be created and staffed without developer intervention.
- No agency data appears in the individual dashboard.

---

### A2 - Agency trip workspace and feature parity

**Size:** XL  
**Depends on:** A1

**Status:** Implemented and verified (2026-10-22). See `docs/agency-a2-test-plan.md`.

Backend:

- Add `agencyId`, `workspace`, `assignedTo`, `clientId` to `Trip`.
- Agency trip CRUD and list.
- `requireAgencyTripRole` wraps the existing trip-role guard.
- Individual trip queries filter personal only.
- Reuse AI generation, itinerary editing, versions, maps, weather, expenses, chat, polls, decisions and trash.
- Agency owner/admin can access all agency trips; planner can create/edit; viewer read-only. Client collaborators keep trip roles.

Frontend:

- Agency dashboard and trip list.
- Reuse planner/editor inside the agency shell.
- Agency trip header, assignment, client link.
- Existing tabs remain available.
- Empty states for new agencies.

Tests:

- Cross-agency trip id -> 404.
- Personal dashboard excludes agency staff trips; an invited client still sees their trip through membership.
- Agency dashboard excludes personal trips.
- Editor/commenter/viewer parity in an agency trip.
- Trash is owner/admin-only and still restores correctly.
- Existing backend tests still pass.

Exit criteria:

- An agency can generate, edit, collaborate on and share a trip end to end.
- No individual behavior changes.

---

### A3 - Agency brand and assets

**Size:** M  
**Depends on:** A1  
**Status:** Implemented (2026-10-22).

Backend:

- Brand fields on `Agency`.
- `AgencyAsset` model and private storage adapter.
- Logo, mascot, font and image upload with MIME sniffing and size limits.
- Tenant-scoped storage keys.
- Font license note.

Frontend:

- Settings: brand name, logo, mascot, colors, contact, address, GSTIN.
- Upload/replace/remove assets.
- Brand preview card.

Tests:

- MIME sniffing rejects renamed files.
- Oversized files rejected.
- Assets are private and scoped by agency.
- Deleting an asset does not break an active template preview. A3 has no template previews yet, so deletion clears live logo/mascot/typography pointers; A5/A6 snapshot an asset before a template references it.

Exit criteria:

- Agency branding is reusable across exports and client pages.

---

### A4 - Quote and commercial layer

**Size:** L  
**Depends on:** A2
**Status:** Implemented and verified (2026-10-22). See `docs/agency-a4-test-plan.md`.

Backend:

- `AgencyQuote` model and number sequence.
- Server-side totals: line items, markup, tax, discount, total, per-person.
- Quote status transitions and versioning.
- Agency default inclusions/exclusions/terms; trip overrides.
- Client-facing projection hides internal cost, markup and expenses.

Frontend:

- Quote tab/form on an agency trip.
- Client selector or inline client fields.
- Line items, markup, tax, discount, validity.
- Internal vs client preview.

Tests:

- Rounding and currency behaviour.
- Server rejects client-supplied totals.
- Quote number uniqueness.
- Sent quote cannot be silently edited.
- Viewer cannot see internal cost fields.

Exit criteria:

- An agent can produce a client-ready price without leaving TravelAI.

---

### A5 - ExportDocument, built-in brochure template and PDF export

**Size:** XL  
**Depends on:** A2, A3, A4
**Status:** Implemented and verified (2026-10-22). See `docs/agency-a5-test-plan.md`.

Backend:

- `ExportDocument` builder and schema version.
- Normalize activities, stays, dates, currency and optional fields.
- `AgencyTemplate` model and versioning.
- `AgencyExport` model with queued/rendering/ready/failed.
- HTML template renderer and PDF conversion.
- Private output storage and signed download URLs.
- Export rate limit per agency/user.
- Export audit event.

Frontend:

- Export proposal flow: template picker, quote confirmation, preview, generate.
- Download PDF and copy client link.
- Export history.

Template:

- Built-in HTML brochure matching the attached design language:
  cover, recommendations, day pages, inclusions/exclusions, things to carry, cancellation policy, contact.
- Dynamic day count and long-text handling.
- Agency logo, mascot, colors, fonts and photos.

Tests:

- DTO fixtures for 1-day, 4-day and 10-day trips.
- Missing dates/photos/quote fields do not crash.
- PDF page count and no blank pages.
- Visual snapshots for cover, day and inclusion pages.
- Export without a quote is either blocked or uses a safe draft template.
- Client role cannot generate an internal export.
- No chat ciphertext appears in the DTO.
- Render failure leaves a retryable job.

Exit criteria:

- A real trip produces a branded PDF that looks like the reference design.
- A 10-day trip does not overflow or drop content.
- The individual PDF button still uses the existing client-side path.

---

### A6 - Custom template onboarding and management

**Size:** L  
**Depends on:** A5
**Status:** Implemented and verified (2026-10-23). See `docs/agency-a6-test-plan.md` and `docs/agency-template-contract.md`.

Deliverables:

- Template gallery and built-in layouts.
- Managed onboarding workflow for a custom agency design.
- Template upload/activation/archive/default.
- Template version pinning on export.
- Preview with a real trip.
- ~~Optional PDF-background/slot bridge for PDF-only agencies~~ deferred; agencies author self-contained HTML templates.
- Asset mapping: logo, mascot, fonts, cover image, day images.

Tests:

- Activating a new version does not change old exports.
- Only one default per agency/audience.
- Archived templates cannot be selected.
- A preview never exposes another agency's assets.
- Template validation rejects unknown tokens and missing assets.

Exit criteria:

- A second agency can receive a custom template without changing application code.
- The agency can preview and approve it before activation.

---

### A7 - Client-facing delivery and acceptance

**Size:** L  
**Depends on:** A5
**Status:** Implemented and verified (2026-10-23). See `docs/agency-a7-test-plan.md`.

Deliverables:

- Branded public proposal page for agency trips (`/proposal/:token`).
- Client-facing PDF download using only the client template (stored export bytes streamed from a public token route).
- Quote view and accept action without an account.
- Internal cost, markup, expenses and internal notes never appear.
- Share link revocation and expiry.
- Optional email delivery later; copy-link is sufficient for v1.

Implementation notes:

- A share link is minted only from a **ready client export**; it pins `(quoteId, exportId)`, so later quote versions, template activations or archives never change what an existing link renders or accepts.
- The raw token exists only at creation (the staff dialog shows the full URL once); rows store a sha256 hash and answer the same generic 404 for unknown, expired and revoked tokens.
- Public views re-render the pinned document server-side — no browser job runs inside a public request — and the client quote projection strips markup, markup amount and prepared-by.
- Acceptance is an atomic `sent → accepted` transition, idempotent on retry, and audited as `share.accepted` + `quote.accepted (via: share)` with no actor row (token-authenticated event).

Tests:

- Client sees only the client projection.
- Accepting a quote is idempotent and audited.
- Revoked link returns 404.
- Internal template cannot be selected from a public route.
- Client cannot access agency settings or other trips.

Exit criteria:

- A client can open a branded proposal and accept it without an account.
- Internal commercial data is not exposed.

---

### A8 - Agency operations, limits and audit

**Size:** M/L  
**Depends on:** A2, A5
**Status:** Implemented and verified (2026-10-23). See `docs/agency-a8-design.md` and `docs/agency-a8-test-plan.md`.

Deliverables:

- Assignment and filters on the trip list.
- Export history and audit log viewer.
- Plan limits: seats, exports per month, storage.
- Per-agency and per-user rate limits.
- Usage counters and warnings.
- Archive/duplicate trip actions.
- Billing integration is optional; manual plan assignment is enough for the pilot.

Tests:

- Limits enforced server-side.
- Audit entries are tenant-scoped and append-only.
- Admin can see usage; planner cannot change plan.
- Export failure and retry are visible.

Exit criteria:

- The pilot can be operated without direct database access.
- The agency admin can see who exported what and how much is used.

---

### A9 - Hardening, pilot and launch

**Size:** M  
**Depends on:** A1-A8  
**Status:** Implemented and verified (2026-10-23). See `docs/agency-a9-test-plan.md` and `docs/agency-operations-runbook.md`.

Deliverables:

- Tenant-isolation security review and IDOR tests.
- Template sandbox review: no arbitrary JS, no remote asset fetch, zip-bomb limits.
- Load test PDF rendering and export queue.
- Backups, retention and deletion policy.
- Agency onboarding runbook and support checklist.
- Pilot with 2-3 agencies on real trips.
- Rollback plan and feature-flag kill switch.

Tests:

- Full backend suite plus frontend typecheck/build.
- Cross-tenant fuzz cases.
- 50 concurrent exports without blocking the API.
- Individual regression pass.
- Pilot acceptance checklist.

Exit criteria:

- A pilot agency completes a real trip, quote and PDF without developer help.
- No cross-tenant access is possible.
- The individual product is unchanged.

---

## 10. Dependency graph

```text
A0 -> A1 -> A2 -> A4 -> A5 -> A6 -> A7 -> A9
             \-> A3 ----/
             \-> A8 ---------------/
```

- A3 can run in parallel with A2.
- A4 needs A2.
- A5 needs A2, A3 and A4.
- A6 and A7 both need A5; they can run in parallel.
- A8 can start after A2 and A5.
- A9 is last.

---

## 11. Testing strategy

### Unit

- Agency role matrix.
- Tenant-scoped query helpers.
- Quote math, rounding, currency.
- ExportDocument normalization.
- Template token validation.
- Public projection allow-list.
- Invite token hashing and expiry.

### Integration

- Agency onboarding and invite acceptance.
- Agency trip CRUD.
- Cross-tenant 404s.
- Export job lifecycle.
- Quote send/accept.
- Template activation/versioning.

### Security

- IDOR: change `agencyId`, `tripId`, `templateId`, `exportId`.
- Template injection and remote asset fetch.
- Zip bombs and oversized DOCX later.
- Formula injection in XLSX/CSV.
- Signed URL expiry.
- PII exposure in client projections.

### Visual

- Screenshot diffs for cover, day page, inclusions and cancellation page.
- 1-day, 4-day and 10-day fixtures.
- Long destination names, long activity descriptions, missing photos.
- Font fallback and image fallback.

### Regression

- Existing backend suite.
- Frontend typecheck and build.
- Individual dashboard, planner, chat, versions and trash smoke.
- CI remains green.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Agency data leaks into the personal product | Explicit `workspace` filters and cross-product tests |
| One missed `agencyId` filter exposes another agency | Central query helpers; router coverage tests; IDOR suite |
| PDF rendering is heavy on the API process | Dedicated Gotenberg/Chromium worker; async jobs; rate limits |
| Custom template onboarding becomes consulting work | Managed templates only for pilot; price it; build theme editor later |
| Fonts/images are not licensed | Require license note; fallback fonts; agency-provided assets |
| Variable-length content breaks the design | Auto-fit, continuation pages, visual fixtures |
| Agencies expect chat export | Document the E2EE boundary; offer plaintext trip notes instead |
| Quote/legal text is wrong | Agency-owned defaults; no AI-generated legal terms |
| Individual app regresses | Feature flag; personal-only queries; full regression suite |
| Agency offboarding or staff departure | Ownership transfer, disable member, transfer/archive trips |
| Billing scopes creep into v1 | Manual pilot plans; billing later |

---

## 13. Explicitly out of scope for the first agency release

- Automatic ingestion of arbitrary PDFs, Canva, Figma or InDesign files.
- Self-serve HTML template editing.
- AI-generated prices, legal terms or cancellation policies.
- Email delivery and notification center.
- Full CRM (pipelines, tasks, commissions, invoices).
- Accounting/GST invoice generation.
- Print-ready CMYK/PDF-A output.
- Chat export from the server (E2EE makes it impossible).
- Mobile app.
- Multi-currency accounting beyond a single quote currency.
- White-label custom domains.
- Billing automation beyond manual plan assignment.

---

## 14. Launch checklist

- [ ] Agency owner can create an agency and invite staff.
- [ ] Agency staff can create a trip with AI and edit it.
- [ ] Client can be invited as a viewer/commenter.
- [ ] Quote totals are server-computed and client-safe.
- [ ] Built-in brochure PDF renders for 4-day and 10-day trips.
- [ ] A custom template can be added without code changes.
- [ ] Client link is branded and hides internal cost.
- [ ] Cross-tenant tests pass.
- [ ] Existing individual suite and builds pass.
- [ ] Export history and audit are visible.
- [ ] Kill switch disables the agency workspace without affecting personal trips.
- [ ] Pilot agency completes one real proposal end to end.
