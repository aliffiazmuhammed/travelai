# Agency Workspace A6 - Custom Template Onboarding and Management Test Plan

**Milestone:** A6 - template contract, asset snapshots, management API and gallery UI
**Status:** implemented and verified locally (2026-10-23); uploaded PDF designs added as A6f (2026-10-27)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint sets it to `true` after A9 local verification. Set it to `false` for the kill switch.

---

## 1. Scope

A6 lets an agency replace the built-in brochure with its own branded proposal layout without any code change:

- validated, logic-less HTML template contract (`docs/agency-template-contract.md`): static CSS, allowlisted tokens, no scripts/remote assets/forms, `{{#days}}` required, source ≤ 512 KiB
- A6f: uploaded PDF designs (`engine: "pdf-background"`): sanitised vector background, visual slot mapper, one repeat page per itinerary day, text/image slots, versioned layout edits and in-process pdf-lib rendering (no Chrome)
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

Deferred: automatic conversion of arbitrary PDF/Canva/Figma files into templates, arbitrary per-client PDF filling (a design must be mapped once), and a visual theme editor for HTML. A public client-facing proposal page remains A7.

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
```

Last local run (2026-10-27, includes A6e and A6f):

- backend suite: **590 tests, 590 pass, 0 fail**
- A6 focused suites (`templateValidation.test.ts`, `templateAssets.test.ts`, `customTemplate.test.ts`, `templateManagement.test.ts`, `pdfTemplateContract.test.ts`, `models.test.ts`, `routes/agency.routes.test.ts`): all pass
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
  - A6e: edited versions carry snapshots byte-for-byte into version-scoped keys; a missing snapshot (409) or a newly unmapped slot (400) leaves no partial files behind
- `services/agency/exports/customTemplate.test.ts`
  - custom renderer consumes the same DTO as the built-ins; internal fields stay out of client output
- `services/agency/exports/templateManagement.test.ts`
  - version projections expose lifecycle metadata but never storage keys, checksums or tokens
  - older versions are not marked active; custom templates (HTML and PDF designs) need an activated version before export
- `services/agency/exports/pdfTemplateContract.test.ts` (A6f)
  - unknown/audience-inappropriate tokens, day tokens outside the repeat page, second repeat pages, duplicate ids, out-of-page and sub-4pt slots rejected
  - oversized page counts/slot counts, unsupported schema versions and default materialisation
  - slot-map checksum stable across key order; coverage tokens map image slots to HTML asset tokens
  - sanitizer rebuilds the design, drops annotations/scripts, rejects encrypted, rotated, cropped and >20-page files
  - renderer expands the repeat page with independent content, adds the quote watermark, never renders internal-only tokens into a client document
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

### A6f uploaded PDF designs (2026-10-27)

`backend/scripts/smoke-a6f.mts` needs no browser. It uses the throwaway
`travelai_a6f_smoke` database and temporary template/asset/export roots, builds a
three-page design with pdf-lib, and runs the whole vector path. Last local run:
**42 checks, all passed.**

1. Layout validation answers before anything is stored: a day token off the
   repeat page, a slot past the page edge, an unknown token, a page that is not
   in the PDF, an internal-only token in a client layout and a WebP snapshot for
   a mapped image slot are all refused (400).
2. A valid upload creates a draft `pdf-background` template and version 1 (3
   design pages); the draft is not selectable and activation before preview is
   refused (409).
3. Tenant and role scoping: foreign template id and foreign preview trip are
   404; layout and background reads are admin-only (403).
4. The stored layout and checksum read back; the private background streams as
   a PDF of the sanitised byte length.
5. Preview renders a four-page PDF: cover data, one page per itinerary day from
   the repeat page, and quote/contact data on the closing page. Client previews
   never contain activity costs; an internal template renders them.
6. Activation publishes version 1; the export pins it and renders entirely in
   process (no Chrome/Gotenberg), with the merged text in the output file.
7. Moving a slot saves version 2 with the same background checksum, page count
   and asset snapshots while version 1 stays active; the moved coordinates
   read back. An unchanged layout is refused (400) and saving is admin-only
   (403). Preview + activation move to v2 and the next export pins it.
8. A background file altered on disk fails the checksum guard (409) and is
   restored.
9. The public proposal reports `documentMode: "pdf"`, returns no HTML, and the
   token-only PDF route serves the pinned four-page export.
10. Archiving blocks layout saves (409) and new exports (404) but keeps pinned
    exports; cross-tenant archive is 404. Lifecycle actions leave audit rows.

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

### A6e in-app HTML editing (2026-10-27)

`smoke-a6.mts` now also verifies the editing lifecycle: the editor reads the
approved source (admin-only; planners get 403), saving a modified source creates
an un-previewed next version with the base snapshots carried forward, unchanged
source is refused (400), archived templates refuse edits (409), a tampered
storage file fails the checksum guard (409), and the edited version previews
with the carried assets.

Browser smoke on a synthetic agency + custom template:

1. **Manage → Edit HTML** loads the stored source into the monospace editor with
   live line and byte counts.
2. Editing enables **Discard changes** / **Save as new version**; saving showed
   the draft toast and the manager listed **v2** (4 pages, not previewed) while
   v1 stayed unchanged.
3. Re-opening v2 and inserting `<script>` surfaced the server error inline
   ("The <script> element is not allowed in templates.") and created no version.
4. **Discard changes** restored the baseline and **Cancel** closed the editor.

### A6f uploaded PDF designs (2026-10-27)

Browser smoke on a scratch agency (`travelai_a6f_browser`, synthetic owner,
two-day trip, quote) with a three-page A4 design PDF:

1. **Upload PDF design** accepted the file, name and audience; the asset step
   mapped a Day 1 image from the agency library.
2. **Map data slots** rendered the sanitised design into the canvas (the teal
   header painted at the expected pixels) and reported `Page 1 of 3 ·
   595 × 842 pt`.
3. Slots were placed as expected: a text slot on page 1 defaulted to a global
   field (re-bound to **Trip title**), the repeat page was enabled with
   **Repeat per day**, and its text/image slots defaulted to **Day number ·
   day page** and **Day image · day page**. The counter read `3 slots on 2
   pages`.
4. **Save template** created the draft `PDF design` template and version 1; the
   manager opened automatically with **Preview** / **Activate** locked behind a
   real preview.
5. **Preview** against the two-day trip rendered **4 pages** (the repeat page
   expanded once per day) and unlocked activation; **Activate** flipped the
   card to Active and offered **Make default**.

Also verified the guard rails: a layout that uses a Day image slot without any
mapped day image is refused at save with "This template uses day images. Choose
at least one day image before uploading.", and the mapper stays open so the
slot can be removed or the upload redone.

---

## 5. Fixes found during verification

- **Archived templates could not be restored in the UI:** activation stayed disabled because `version.active` remained true after archiving, while the banner told admins to activate a previewed version. The manager now computes liveness as `version.active && template.status !== 'archived'`, hides the Active badge while archived and offers "Restore version".
- **Archived drafts remain recoverable:** preview stays enabled for archived versions (resolution uses `requireActiveTemplate: false`), so an archived draft can be restored via Preview → Activate. Version upload stays 409 while archived, matching the contract.
- **Unreachable draft branch in the quote panel:** comparing `quote.status === 'draft'` after drafts were already handled caused a TS2367 narrowing error; the branch was removed with no behavior change.
- **Activated PDF designs could not be exported:** `assertRenderableTemplate` only accepted `engine: "html"`, so `createAgencyExport` answered "That template is not ready for export" for every PDF design. It now accepts `pdf-background` too, with unit coverage in `templateManagement.test.ts`. Found by `smoke-a6f.mts`.
- **Blank design in the PDF layout mapper:** the `ResizeObserver` attached to the page wrapper once, but the loading state replaces that element, so the observer kept measuring the detached node and the render effect saw a zero width — the canvas stayed at its default 300×150 with no error. The observer now re-attaches when loading finishes. Found by the A6f browser smoke.

---

## 6. Production rollout prerequisites

- A6 acceptance is complete; the production blueprint now enables the workspace. Keep the flag available as the kill switch.
- Provision `AGENCY_TEMPLATE_DIR` (and `AGENCY_ASSET_DIR`) on persistent private volumes; template sources, PDF backgrounds and snapshots are never served from the public uploads tree.
- Uploads are rate-limited per member and agency (30 per hour); each HTML file is held in memory only up to the 512 KiB contract limit and each PDF design up to 10 MiB / 20 pages.
- PDF designs need no Chrome or Gotenberg for export (pdf-lib merges in process), but their backgrounds and snapshots use the same private store/quota. Mapped image slots must be PNG/JPEG; WebP is rejected before storage.
- In-app editing adds admin-only routes (`GET .../versions/:version/source|layout|background`, `POST .../from-source|from-layout`). All of them verify stored bytes/checksums, the save routes are rate-limited with the upload limiter, and archived templates always answer 409.
- Verify `/api/health` reports the current milestone (`A9`) and `writesEnabled: true` when the flag is on.
- Confirm template routes remain tenant-guarded and admin-only, previews never expose another agency's assets, and archived templates stay resolvable only for pinned export retries.
- A7 must keep consuming the same DTO, projections and pinned `(templateId, templateVersion)` rather than re-rendering or re-resolving templates in the browser.
