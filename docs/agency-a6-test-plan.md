# Agency Workspace A6 - Custom Template Onboarding and Management Test Plan

**Milestone:** A6 - template contract, asset snapshots, management API and gallery UI
**Status:** implemented and verified locally (2026-10-23)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint sets it to `true` after A9 local verification. Set it to `false` for the kill switch.

---

## 1. Scope

A6 lets an agency replace the built-in brochure with its own branded proposal layout without any code change:

- validated, logic-less HTML template contract (`docs/agency-template-contract.md`): static CSS, allowlisted tokens, no scripts/remote assets/forms, `{{#days}}` required, source ≤ 512 KiB
- `AgencyTemplateVersion` rows: immutable per-version source and asset snapshots under server-generated `<agencyId>/<versionId>` private keys
- asset mapping at upload: logo, mascot, heading/body fonts, cover image and up to 30 day images, with branding fallbacks
- lifecycle: upload → draft → real-trip preview (records `previewedAt`) → activate → default/archive; archiving never rewrites pinned exports
- exports pin `(templateId, templateVersion)`; retries keep rendering the pinned version even after activation moves on or the template is archived
- one default per `(agencyId, audience)` via a partial unique index
- `/agency/templates` gallery: admin upload/preview/activate/archive/default/version management; members get a read-only active client catalogue

Policy enforced in A6:

- every management action is admin-only and tenant-scoped; cross-tenant template, version, trip and asset ids answer 404
- a template that references an unmapped asset slot (logo, mascot, cover, day images) cannot be uploaded
- activation requires a recorded preview against a real tenant trip
- non-admins only ever list active client templates; inactive or internal listings are 403
- built-in templates stay TravelAI-managed; their rows cannot be renamed, archived or re-uploaded
- the client DTO and rendered proposals never expose internal cost, markup, prepared-by, expenses or chat ciphertext

Deferred: the PDF-background/slot bridge for PDF-only agencies; agencies author self-contained HTML templates instead. A public client-facing proposal page remains A7.

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
```

Last local run (2026-10-23):

- backend suite: **456 tests, 456 pass, 0 fail**
- A6 focused suites (`templateValidation.test.ts`, `templateAssets.test.ts`, `customTemplate.test.ts`, `templateManagement.test.ts`, `models.test.ts`, `routes/agency.routes.test.ts`): **59 tests, 59 pass**
- frontend typecheck: clean
- frontend production build: clean

A6-specific coverage:

- `services/agency/exports/templateValidation.test.ts`
  - the documented contract example validates and renders
  - Mustache escaping, inverted sections, internal-only cost tokens
  - scripts, iframes, forms, remote URLs, event handlers, unsafe CSS and partials rejected
  - `{{#days}}` required; size/encoding/emptiness enforced; private storage keys traversal-safe
- `services/agency/exports/templateAssets.test.ts`
  - snapshot keys version-scoped and server-generated; snapshot files round-trip
  - corrupt/missing/type-confused snapshots fail loudly (409)
  - unmapped logo/mascot/cover/day-image slots block publishing
  - selections normalized and validated before any file read; branding URLs resolve only inside the tenant
- `services/agency/exports/customTemplate.test.ts`
  - custom renderer consumes the same DTO as the built-ins; internal fields stay out of client output
- `services/agency/exports/templateManagement.test.ts`
  - version projections expose lifecycle metadata but never storage keys, checksums or tokens
  - older versions are not marked active; custom templates need an activated version before export
- `services/agency/models.test.ts`
  - `AgencyTemplateVersion` uniqueness per `(agencyId, templateId, version)`
- `routes/agency.routes.test.ts`
  - the A1-A6 route table includes all template management routes
  - every `/:agencyId` route requires a tenant guard; template writes require admin rank; the feature gate runs before every agency route

---

## 3. Live service smoke

`backend/scripts/smoke-a6.mts` runs against a throwaway database (`travelai_a6_smoke`) and temporary `AGENCY_TEMPLATE_DIR`/`AGENCY_ASSET_DIR` directories with a real agency, trip, quote, uploaded assets, real PDF jobs and full template lifecycle. It drops the database and removes rendered files afterwards.

Last local run (2026-10-23), all 32 checks passed:

1. Chrome/Chromium/Edge executable found.
2. Logo and day image assets uploaded through the A3 asset service.
3. Upload without a day image mapping is refused; a mapped upload creates a draft with version 1.
4. A draft is not selectable for new exports before activation.
5. Cross-tenant refusals: foreign asset cannot be snapshotted, foreign template id in version listing and foreign trip in preview all answer 404.
6. Activation before a preview is refused (409).
7. Viewers do not see the draft and cannot ask for draft listings (403).
8. Preview renders the real trip and quote against the stored source and records `previewedAt`.
9. Activation publishes version 1; the first export pins version 1 and renders a real PDF.
10. Version 2 can be uploaded, previewed and activated; the next export pins version 2.
11. One default per audience: a draft cannot be default (409), promoting a new default clears the previous one.
12. Archiving clears status and the default flag; archived templates are not selectable for new exports (404), reject new versions (409) and default (409), and disappear from viewer listings.
13. A retry of the pinned v1 job still renders after activation moved on and the template was archived.
14. Lifecycle actions leave tenant-scoped audit rows.

Run it with the database and a Chrome installation available:

```bash
cd backend
npx tsx scripts/smoke-a6.mts
```

---

## 4. Browser smoke (local, 2026-10-23)

Environment: Vite dev server on `:8080`, backend on `:5000` with `AGENCY_WORKSPACE_ENABLED=true`.

Verified flow on a real A4/A5 smoke agency, trip and quote:

1. **Templates** page loads the gallery; non-admin view shows active client templates read-only.
2. **Upload template** accepted a self-contained HTML source with the logo and a Day 1 asset mapped; the gallery shows the new draft.
3. **Preview** against a real trip rendered 2 pages in a sandboxed iframe and recorded the preview; activation was locked until then.
4. **Activate** flipped the draft to active; **Set default** made it the client default.
5. The trip **Export** panel listed the custom template with its activated version and generated a real PDF (23 KB); an existing export stayed pinned to its old template.
6. **Manage** renamed and re-described the template; a second version was uploaded, previewed and activated.
7. **Archive** removed the template from active selection and the default slot while the existing pinned export remained downloadable.
8. **Restore** reactivated the previously active version for new exports; the manager correctly labels it "Restore version" while archived.

Limitations of this run:

- the in-app browser was hidden, so verification used accessibility snapshots and DOM inspection rather than screenshots
- `window.confirm` on archive wedged the in-app browser once; the archive was verified server-side and the restore fix was verified after reload

---

## 5. Fixes found during verification

- **Archived templates could not be restored in the UI:** activation stayed disabled because `version.active` remained true after archiving, while the banner told admins to activate a previewed version. The manager now computes liveness as `version.active && template.status !== 'archived'`, hides the Active badge while archived and offers "Restore version".
- **Archived drafts remain recoverable:** preview stays enabled for archived versions (resolution uses `requireActiveTemplate: false`), so an archived draft can be restored via Preview → Activate. Version upload stays 409 while archived, matching the contract.
- **Unreachable draft branch in the quote panel:** comparing `quote.status === 'draft'` after drafts were already handled caused a TS2367 narrowing error; the branch was removed with no behavior change.

---

## 6. Production rollout prerequisites

- A6 acceptance is complete; the production blueprint now enables the workspace. Keep the flag available as the kill switch.
- Provision `AGENCY_TEMPLATE_DIR` (and `AGENCY_ASSET_DIR`) on persistent private volumes; template sources and snapshots are never served from the public uploads tree.
- Uploads are rate-limited per member and agency (30 per hour); each file is held in memory only up to the 512 KiB contract limit.
- Verify `/api/health` reports the current milestone (`A9`) and `writesEnabled: true` when the flag is on.
- Confirm template routes remain tenant-guarded and admin-only, previews never expose another agency's assets, and archived templates stay resolvable only for pinned export retries.
- A7 must keep consuming the same DTO, projections and pinned `(templateId, templateVersion)` rather than re-rendering or re-resolving templates in the browser.
