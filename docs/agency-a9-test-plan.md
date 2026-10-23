# Agency Workspace A9 - Hardening, Pilot and Launch Test Plan

**Milestone:** A9 - tenant-isolation review, template sandbox review, load test, ops docs, simulated pilot, rollback plan
**Status:** implemented and verified locally (2026-10-23)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` stays dark by default; production enablement remains an explicit ops step.

---

## 1. Scope

A9 hardens the A1-A8 agency workspace for launch without any real users:

- **Tenant-isolation review (A9a)** audits every service for IDOR risk, fixes findings in-pass and locks them with a 29-check cross-tenant smoke.
- **Template sandbox review (A9b)** re-verifies the A6 template pipeline against arbitrary JS, remote asset fetch and zip-bomb classes of attack, and adds regression cases for the CSS `url()` family.
- **Load test (A9c)** drives 50 concurrent export jobs at a live dev backend and asserts queue health, latency and all three limit behaviours.
- **Ops docs (A9d)** deliver the operations runbook (kill switch, onboarding, support checklist, backups/retention/deletion) and an executable simulated pilot that doubles as the acceptance checklist.
- **Rollback and kill switch** are verified end-to-end: one env flag darkens the whole workspace, and redeploying the previous commit is a complete rollback (A1-A9 shipped no destructive migrations).
- **A9e** proves the individual product is unchanged: full suite, both builds, and a flag-off regression pass against a live server.

Policy enforced in A9 (carried from A1-A8, re-verified here):

- every `/:agencyId` route carries a tenant guard; every query is scoped by `agencyId`; cross-tenant ids answer 404 (never 403, never success, never a write)
- client-facing projections never expose internal cost, markup, prepared-by, expenses or chat ciphertext
- `AGENCY_WORKSPACE_ENABLED=false` removes the entire `/api/agency` surface (404) and the frontend auto-hides every agency link via the `/api/health` probe

---

## 2. Tenant-isolation review and IDOR smoke (A9a)

### Review findings, fixed in-pass

Two service-level gaps were found and fixed before the smoke:

1. `saveQuote` (quotes.ts) allocated a quote number before validating the trip's tenancy. The trip-boundary check now runs first, so a foreign `tripId` can never mint a quote row (or burn a number) in another tenant.
2. `updateAgencyTrip` (trips.ts) now re-checks `workspace`, `agencyId` and `isDeleted` on the document it is about to mutate, so a trip document from another tenant passed by a caller is rejected with 404 before any field change.

### Cross-tenant fuzz smoke

`backend/scripts/smoke-a9-security.mts` seeds two tenants with parallel object graphs (agencies, members, trips, clients, assets, templates + versions, exports, proposal links, invites) and probes every mutation/read service with tenant A's context and tenant B's ids. After every probe it re-reads tenant B's rows and requires byte-identical state (no cross-tenant writes).

Last local run (2026-10-23): **29/29 checks passed**, covering:

- trips: update (document and id paths), archive
- assets: read row, read content, delete
- clients: update, delete
- templates: list versions, update details, archive, set default, activate version
- exports: retry, signed download, history listing
- quotes: save against a foreign trip (no row minted)
- members: change role, remove
- invites: revoke
- shares: create from a foreign export, revoke
- positive controls: same-tenant assignment and same-tenant quote save still work

Invariant verified: every cross-tenant probe answers **404** — never 403 (no id probing), never success — and the foreign tenant's rows are untouched.

---

## 3. Template sandbox review (A9b)

The A6 template pipeline was re-reviewed against the three A9 attack classes. No gaps found; the defense layers:

- **No arbitrary JS:** body-fragment-only templates; ALLOWED_TAGS/ATTRS allowlists; no `<script>`/event handlers possible; Mustache runs without triple-stash, partials or custom delimiters; render re-validates the source on every render; wrapper CSP `script-src 'none'`.
- **No remote asset fetch:** images are `data:`-only (`data:image/png|jpe?g|webp;base64` — SVG rejected); CSS bans `@import`, `url(`, `expression`, `behavior`, `-moz-binding` and script/VB/data-URI schemes plus `\` escapes; zero network calls exist anywhere in the export services; CSP `default-src 'none'`; Chrome runs with `--disable-extensions --disable-background-networking`.
- **Zip-bomb limits:** 512 KB template source cap, per-asset size caps, 32 MB cumulative snapshot cap (`AGENCY_TEMPLATE_MAX_SNAPSHOT_BYTES`), 30-day asset age cap, byte + MIME re-verification on every snapshot read, 45 s render timeout.

### Regression cases added

`services/agency/exports/templateValidation.test.ts` gained three invalid cases in the "remote or dynamic CSS is rejected" group: `url(javascript:alert(1))`, `url(vbscript:msgbox(1))` and `url(data:text/html;base64,...)` inside a style block. File passes **12/12**; full suite green.

---

## 4. Load test (A9c)

`backend/scripts/load-a9.mts` runs against `${AGENCY_LOAD_BASE_URL || 'http://localhost:5000'}` and refuses production. It seeds three agencies through the real API path (burst agency: 10 seats / 100 exports / 500 MB via the ops plan route; per-user agency: default plan; quota agency: 3 exports/month), seven members with admin rank (internal exports require admin), builtin templates, trips and JWTs signed with the dev `JWT_SECRET`. Phases: ops-gate probe → 250 ms health sampler → 50-concurrent export burst → wide- and per-user rate-limit probes → monthly-quota probe → queue settle → signed-download probe → usage/audit consistency. Residue is purged on start and on exit (SIGINT/SIGTERM included).

Last local run (2026-10-23) — **all 21 executed checks passed** (the positive ops-key probe is conditional and skipped when `AGENCY_OPS_KEY` is unset; the plan was seeded directly):

- all 50 burst requests accepted with 202 + a queued export id
- burst create latency: **min 941 ms, p50 1108 ms, p95 1324 ms, max 1394 ms** (1587 ms wall)
- health stayed 200 + database connected for the whole burst; health p95 under load < 1.5 s
- the 61st export in the hour answered **429** with the agency-wide message ("This agency has reached its hourly export limit…")
- one user's 21st export in the hour answered **429** with the per-user message ("Too many exports requested…")
- the 4th export on the 3/month agency answered **409** with the monthly quota message
- **all 83 accepted jobs drained through the 2-wide queue and rendered to `ready` in 153 s**
- a ready job downloaded over its signed URL as a real PDF (`%PDF-`)
- usage read back 60 exports / 7 seats, 20 exports and 3 exports per agency; the audit log recorded every accepted `export.requested`

---

## 5. Operations docs (A9d)

`docs/agency-operations-runbook.md` covers:

1. **Feature flag and kill switch** — `AGENCY_WORKSPACE_ENABLED=false` 404s the whole `/api/agency` surface and the frontend hides itself from the health probe (no frontend deploy needed). Rollback = redeploy the previous commit; A1-A9 added no destructive migrations.
2. **Environment configuration** — every agency env var, its default and its blast radius (`AGENCY_OPS_KEY`, `AGENCY_PLAN_TIERS`, `AGENCY_PLAN_DEFAULT`, `AGENCY_PROPOSAL_TTL_DAYS`, `AGENCY_CHROME_PATH`, `AGENCY_STORAGE_PROVIDER`, the local fallback file roots, `AGENCY_EXPORT_SIGNING_SECRET`).
3. **Onboarding runbook** — ops plan → signup → seats → branding → templates (preview before activate) → first trip → client + quote → export → share → hand-over.
4. **Support checklist** — usage first, export failures via audit, template validation errors, dead share links, storage; escalation = kill switch + re-run the A9 security smoke.
5. **Backups, retention and deletion policy** — mongodump as the source of truth; Cloudinary private raw assets (provider default) rely on the Cloudinary backup add-on or regeneration; local file roots (fallback provider) must be backed up together with the dump; exports expire after 30 days, shares after 90; audit is retained.
6. **Pilot acceptance checklist** — mirrors the simulated pilot checks in §6.

---

## 6. Simulated pilot (A9d)

`backend/scripts/smoke-a9-pilot.mts` walks the full agency lifecycle end-to-end against the real services and a throwaway database (`travelai_a9_pilot_smoke`), exactly as a pilot agency would experience it, and drops all rows afterwards, removing the files it creates through the storage layer. The ops-plan path uses the same secret gate as production (`AGENCY_OPS_KEY`).

Last local run (2026-10-23): **34/34 checks passed**, covering:

- onboarding: agency + owner created; ops provisions a 2-seat / 4-export / 8 MB plan
- branding: logo/mascot uploaded with byte-for-byte read-back through the private content path; settings stored
- invites: link invite previews, redeems, and a third seat is refused at 2/2
- trips: 3-day trip created from dates; archive hides it from the active library; unarchive restores it
- clients + quotes: quote v1 saves as draft with computed totals (11 200 INR from 2 × 5000 + 12 %), sends, and the client projection hides margin/preparer fields
- exports: client proposal and internal desk copy render to `ready` as real PDFs; the client preview hides internal costs and the internal badge; the internal preview carries both; a seeded activity cost makes both checks meaningful
- shares: token-only public page serves HTML + PDF without internal fields; the client accepts; the owner revokes; the revoked token answers 404
- limits: export 5/4 → 409, storage overrun against the 8 MB cap → 409, fourth member → 409
- audit: plan, export, share created/accepted/revoked events all recorded
- cross-tenant probes answer 404 (foreign trip edit, foreign asset read, foreign quote mint)

The pilot exit line is the A9 exit criterion: *a pilot agency completes a real trip, quote and PDF without developer help.*

---

## 7. Rollback and kill switch (verified)

Verified against a live server on 2026-10-23:

- flag **on**: `/api/health` reports `agency.enabled: true`, `/api/agency/status` → 200
- flag **off** (server started without the env var): `/api/health` reports `agency.enabled: false` + `writesEnabled: false`; `/api/agency/status` and `/api/agency/trips` → **404**
- individual product with the flag off: `POST /api/auth/signin` → 401, `GET /api/auth/me` → 401, `GET /api/auth/csrf` → 200, `GET /api/itinerary` → 401 "Please sign in" — the personal product is untouched
- the frontend hides every agency surface from the same health payload (`useAgencyEnabled`), so the kill switch needs no frontend release

---

## 8. Automated checks

Run:

```bash
cd backend && npm test
cd backend && npm run build
cd frontend && npm run typecheck
cd frontend && npm run build
```

Last local run (2026-10-23):

- backend suite: **474 tests, 474 pass, 0 fail** (includes `routes/agency.routes.test.ts` route coverage, collab security/access suites, the A9b template-validation regressions, and the `cloudStorage` provider/adapter tests)
- backend build (`tsc`): clean
- frontend typecheck: clean
- frontend production build: clean

Live smokes (throwaway databases, self-cleaning):

- `backend/scripts/smoke-a9-security.mts` — 29/29 (IDOR + cross-tenant fuzz)
- `backend/scripts/load-a9.mts` — 21/21 executed (50-concurrent exports, limits, queue drain)
- `backend/scripts/smoke-a9-pilot.mts` — 34/34 (simulated pilot lifecycle), run against both storage providers (§9)

---

## 9. Agency storage providers (Cloudinary-first)

Agency tenant bytes — brand assets, template sources/snapshots and rendered
export PDFs — follow the same Cloudinary-first contract as receipts and
avatars, but stay tenant-private:

- **Provider choice.** Cloudinary whenever credentials exist
  (`CLOUDINARY_URL`, or the `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`
  triplet); local disk otherwise. `AGENCY_STORAGE_PROVIDER=local|cloudinary`
  overrides the detection. `/api/health` reports the active choice as
  `agencyStorage.provider` (+`durable`).
- **Private bytes.** Uploads use `resource_type: 'raw'` with
  `type: 'private'`, so Cloudinary never serves them from the public CDN.
  Reads generate a short-lived signed download URL on api.cloudinary.com
  (60 s expiry, no Basic auth) that the server fetches and relays through the
  existing tenant-guarded content routes. Deletes destroy the private object.
- **Stable keys.** `storageKey` columns keep their server-generated
  `<agencyId>/<...>` strings in both providers, so switching providers never
  changes rows or client contracts.
- **Verification (2026-10-23).** The 34/34 pilot passed against the live dev
  backend in both modes — Cloudinary (real private upload/read/delete round
  trips, including byte-for-byte logo read-back and the rendered export PDF)
  and `AGENCY_STORAGE_PROVIDER=local` (temp file roots). After the Cloudinary
  run, the raw resource list confirmed zero residue (pilot cleanup destroys
  the private objects).
