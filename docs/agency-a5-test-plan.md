# Agency Workspace A5 - ExportDocument, Brochure and PDF Test Plan

**Milestone:** A5 - export document, built-in brochure template and PDF export
**Status:** implemented and verified locally (2026-10-22)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` defaults to `false`; the production blueprint sets it to `true` after A9 local verification. Set it to `false` for the kill switch.

---

## 1. Scope

A5 turns a trip and its quote into a branded, downloadable proposal without leaving TravelAI:

- versioned `ExportDocument` DTO (`schemaVersion: 1`) built from `Trip`, `Agency`, brand assets and `AgencyQuote`
- normalization for activities, stays, dates, currency, list fields and optional content
- managed built-in templates seeded per agency: `brochure` (client) and `internal-summary` (internal)
- headless Chrome HTML -> PDF rendering behind an async Mongo-backed job (`queued`, `rendering`, `ready`, `failed`)
- private export storage with server-generated `<agencyId>/<exportId>.pdf` keys
- HMAC-signed, ten-minute staff download URLs; failed jobs are retryable
- per-user/agency export rate limit and append-only audit events
- trip **Export** tab: template picker, quote confirmation, real server preview, generate, download, copy staff link and history

Policy enforced in A5:

- generating requires planner rank; an internal desk copy additionally requires admin
- a client proposal requires a live quote; a cancelled quote is refused; draft and expired quotes export with a watermark
- non-admins never see internal jobs in history and cannot download an internal export (403)
- the client document contains no markup, margin, prepared-by, expenses or chat ciphertext

Deferred to A6/A7: custom template onboarding, a public client-facing proposal page/link, and email delivery.

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Last local run (2026-10-22):

- backend suite: **422 tests, 422 pass, 0 fail**
- A5 focused suites (`exports.test.ts`, `models.test.ts`, `routes/agency.routes.test.ts`): **39 tests, 39 pass**
- frontend typecheck: clean
- frontend production build: clean

A5-specific coverage:

- `services/agency/exports/exports.test.ts`
  - DTO fixtures render complete 1-day, 4-day and 10-day documents
  - missing dates, photos, quote and optional fields still render a safe draft
  - client DTO excludes margin, prepared-by, expenses and chat ciphertext
  - an expired sent quote is exported with an `EXPIRED` watermark
  - client exports need a live quote; internal exports need admin rank
  - HTML escaping and unsafe colours/fonts never reach the CSS
  - activity/stay normalizers accept both strings and model-shaped objects
  - renderer distinguishes the internal audience and hides internal costs from clients
  - signed download URLs are tenant-bound, expiring and tamper-evident
  - storage keys are server-generated and traversal-safe
  - PDF page markers are counted; history projects a signed URL only for a ready, unexpired job
  - template projections expose metadata but never storage keys; retention is explicit (30 days)
- `services/agency/models.test.ts`
  - built-in template key enum and per-audience default uniqueness
  - `(agencyId, tripId, createdAt)` export history index and non-terminal job index
  - `AgencyAudit` is append-only and tenant-indexed
- `routes/agency.routes.test.ts`
  - A1-A5 route table includes templates, export preview/create/retry and signed download
  - every `/:agencyId` route requires a tenant guard; every `:tripId` export route also requires the trip guard
  - preview/create/retry require planner rank; history and download require membership only
  - the feature gate runs before every agency route
- `services/agency/assets.test.ts`
  - A3 assets remain private while A5 template/export routes are added

---

## 3. Live service smoke

`backend/scripts/smoke-a5.mts` runs against a throwaway database (`travelai_a5_smoke`) with a real agency, trip, quote, seeded templates and real PDF jobs. It cleans rendered files and drops the database afterwards.

Last local run (2026-10-22), all checks passed:

1. Chrome/Chromium/Edge executable found.
2. Two built-in templates seeded (Signature brochure, Internal summary).
3. Client preview returns the real HTML: N+4 pages (cover, overview, one page per day, pricing, practical) with brand and quote values; no internal cost, prepared-by or markup.
4. Internal preview includes activity cost fields.
5. A client job moves `queued` -> `ready` and the output is a real PDF (`%PDF-`).
6. An internal job also renders ready.
7. Owner history shows both jobs; viewer history shows only the client job.
8. Signed viewer download of the client export returns 200 and `%PDF-`.
9. Planner download of an internal export returns 403.

Run it with the database and a Chrome installation available:

```bash
cd backend
npx tsx scripts/smoke-a5.mts
```

---

## 4. Browser smoke (local, 2026-10-22)

Environment: Vite dev server on `:8080`, backend on `:5000` with `AGENCY_WORKSPACE_ENABLED=true`; `/api/health` reported `agency.milestone: "A5"`.

Verified flow on an existing A4 smoke agency/trip:

1. Open the trip and switch to the **Export** tab (`?tab=export`).
2. The quote card selects `Q-2026-0001` v2 (Accepted) and the client template **Signature brochure**; selecting the internal template is visible to the owner and clears any preview.
3. **Preview** renders the real server HTML in a sandboxed iframe (5 pages for the 1-day fixture).
4. **Generate** opens a confirmation dialog naming the template, audience, quote, total and page count.
5. The job appears as **Ready** (about 98 KB) after polling; **Download** returns HTTP 200 with a valid PDF (100,249 bytes).

Limitations of this run:

- the in-app browser was hidden, so verification used accessibility snapshots and DOM inspection rather than screenshots
- clipboard read permission blocked asserting the copied staff link; the button focused without an error
- viewer/planner accounts were not exercised in the browser; those rules are covered by the API tests, the service smoke and the panel's role gating

The **Copy staff link** action copies the signed staff download URL. A public client link is deliberately deferred to A7; A5 copy is for internal sharing only.

---

## 5. Fixes found during verification

- **Internal job leakage:** history originally listed internal exports to every member and download did not recheck audience. History now filters internal jobs for non-admins and a non-admin download of an internal job returns 403.
- **Preview/generate race:** switching templates while a preview request was in flight could generate a different template than the one confirmed. Stale responses are now discarded, selection clears the preview, and generation pins the template/quote ids from the confirmed preview.
- **Signed URL validation:** the frontend download helper initially rejected the `?expires=...&signature=...` suffix. It now accepts the query while still requiring an agency export download path and rejecting protocol-relative URLs.

---

## 6. Production rollout prerequisites

- A5 acceptance is complete; the production blueprint now enables the workspace. Keep the flag available as the kill switch.
- Install Chrome/Chromium/Edge on every API host, or set `AGENCY_CHROME_PATH` (or `CHROME_EXECUTABLE_PATH`/`PUPPETEER_EXECUTABLE_PATH`). Without it, export generation fails with a 503 and a retryable job.
- Provision private storage via `AGENCY_EXPORT_DIR` on a persistent volume; export files are never served from the public uploads tree.
- Set `AGENCY_EXPORT_SIGNING_SECRET` explicitly in production instead of falling back to `JWT_SECRET`.
- Verify `/api/health` reports the current milestone (`A9`) and `writesEnabled: true` when the flag is on.
- Confirm export routes remain tenant/trip guarded, internal jobs remain admin-only, and the client document never contains margin, expenses or prepared-by.
- Expect up to 20 preview/create/retry requests per user per agency per hour, two concurrent renders per process, a 45-second render timeout and 30-day file retention.
- A6 must keep consuming the same DTO and client projection rather than recomputing prices or branding in the browser.
