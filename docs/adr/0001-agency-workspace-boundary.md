# ADR 0001: Agency Workspace boundary and tenancy

- **Status:** Accepted
- **Date:** 2026-10-22
- **Milestone:** Agency A0
- **Related:** `docs/roadmap-agency-workspace.md`

## Context

TravelAI currently serves individual travelers. The individual product owns
personal trips, collaboration roles, chat, polls, decisions, expenses, maps,
versions, trash and client-side PDF export.

Agencies need more than a personal trip with a different PDF: they need a
tenant, staff roles, client records, commercial quotes, branded templates,
export history and a separate front door. Retrofitting those concepts into the
personal dashboard would expose team concepts to individual users and risk
regressions in the existing trip, chat and sharing flows.

The agency reference is a designed A4 brochure with a cover, recommendation
page, per-day pages, inclusions/exclusions, a packing list, cancellation policy
and fixed footer. It is not a fillable form and its text layer is broken. The
export pipeline therefore cannot be based on editing that PDF in place.

## Decision

### 1. Separate product surface, shared core

- The agency product lives at `/agency` and `/api/agency`.
- The individual product remains at `/`, `/dashboard`, `/planner`,
  `/trip/:id`, `/shared/:shareId` and `/profile`.
- AI generation, itinerary editing, collaboration, chat, polls, decisions,
  expenses, maps, versions and trash are shared services. They are not forked
  for agencies.
- A user may belong to both products, but navigation, lists and authorization
  stay separated.

### 2. Same database, explicit tenant boundary

- Add `agencyId` and `workspace: 'personal' | 'agency'` to `Trip`.
- Existing trips are personal. Missing `workspace` is treated as personal
  during rollout.
- Every agency query includes `agencyId`; every personal query excludes agency
  trips. Cross-tenant ids answer 404, not 403.
- A separate database was rejected for the first release because it would
  duplicate the trip/chat/expense services and make shared features expensive
  to maintain. Revisit only for an enterprise data-residency requirement.

### 3. Agency roles and trip access

- Agency staff roles: `owner`, `admin`, `planner`, `viewer`.
- Owners and admins manage the agency, team, templates, billing and all agency
  trips.
- Planners create and edit agency trips.
- Viewers read agency trips and exports.
- Clients are trip collaborators through the existing invite/share model, not
  `AgencyMember`.
- Agency owners/admins may access every agency trip. Assigned-only visibility
  can be added later without changing ownership.

### 4. Export engine

- HTML/CSS rendered to PDF through a dedicated Gotenberg or Chromium worker is
  the primary engine. It supports the designed brochure, variable day counts,
  agency assets and page breaks.
- DOCX is a later adapter for Word-native agencies.
- PDF-background plus mapped content slots is a migration bridge for agencies
  that only have a fixed PDF. It is not the primary engine.
- Filling arbitrary PDFs, or automatically converting Canva/Figma/InDesign
  files, is rejected for v1.
- The renderer consumes a versioned `ExportDocument` DTO, never a raw Mongoose
  document.

### 5. Template onboarding

- Start with built-in templates and managed onboarding: the TravelAI team turns
  an agency source design into a validated HTML template.
- Add a self-serve theme editor later.
- Template versions are immutable; an export records the template id and
  version it used.

### 6. Private documents

- Agency logos, fonts, photos, source templates and generated PDFs use private
  storage with short-lived signed URLs.
- Existing receipt/avatar public URL behavior is not reused for client
  documents.
- Fonts are stored only with a license note; fallbacks are used otherwise.

### 7. E2EE boundary

- Trip chat remains end-to-end encrypted and cannot be exported server-side.
- Agency exports contain itinerary and quote content only.
- If agencies need internal notes in an export, add a plaintext trip-notes
  field. Never promise chat export.

### 8. Billing

- The pilot uses manual plan assignment and seat/export/storage limits.
- Subscription billing is a separate milestone and must not block A1-A5.

## Guardrails

- `AGENCY_WORKSPACE_ENABLED` defaults to false.
- While the flag is false, `/api/agency` answers 404 for every request.
- A0 exposes only `GET /api/agency/status` when the flag is true. There is no
  agency write route until A1 adds the tenancy models and authorization guards.
- `/api/health` publishes the flag and `writesEnabled: false` for feature
  discovery and operations.
- The existing individual test suite must stay green after every agency
  increment.

## Consequences

### Positive

- The individual product can ship independently and remains unchanged for
  existing users.
- The agency product reuses the most expensive core features instead of
  maintaining a second itinerary/chat/expense stack.
- Tenant scoping is a single explicit rule that can be tested and audited.
- The export pipeline can match a real design rather than approximating it in
  hardcoded client-side PDF code.

### Negative

- `Trip` gains optional agency fields, so every trip query must be explicit
  about workspace.
- A dedicated PDF renderer adds infrastructure and operational cost.
- Managed template onboarding is service work, not just software.
- Agency data, client PII and template assets raise the security and retention
  bar.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Rename the personal app to an agency app | Forces team concepts and agency navigation on individual users |
| Separate database per agency | Duplicates shared services; hard to reuse chat, maps and expenses |
| Separate `AgencyTrip` collection | Duplicates trip, chat, expense and version models |
| DOCX-first export | Cannot reproduce the designed brochure reliably |
| Fill the supplied PDF | No form fields, broken text layer, brittle layout |
| Self-serve HTML templates first | Security and support burden before product fit is proven |

## Follow-ups

- A1 implements `Agency`, `AgencyMember`, `AgencyInvite` and the first write
  routes.
- A2 adds `workspace` filters and cross-product regression tests.
- A5 adds `ExportDocument`, the HTML renderer and private export storage.
- A9 runs the tenant-isolation and template-sandbox security review.
