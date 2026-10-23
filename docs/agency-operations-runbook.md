# Agency Workspace — Operations runbook and launch policies

Companion to `agency-a9-test-plan.md`. This is the operating manual for the
Agency Workspace (A1-A9): onboarding, support, backups/retention/deletion,
rollback and the feature-flag kill switch.

---

## 1. Feature flag and kill switch

The whole workspace sits behind one flag: `AGENCY_WORKSPACE_ENABLED`.

- **false (default)** — every route under `/api/agency` answers `404 Not
  Found`, exactly like an unknown path. The workspace is not advertised and
  cannot be probed. The frontend probes the public `/api/health` payload and
  hides every agency entry point automatically; no frontend deploy is needed
  to hide the product.
- **true** — the workspace is live: `/api/agency/status` reports
  `{ workspace: 'agency', milestone, writesEnabled }`.

**Kill-switch procedure (dark launch / emergency):**

1. Set `AGENCY_WORKSPACE_ENABLED=false` and restart the backend.
2. Verify `GET /api/agency/status` and any `/api/agency/...` route answer 404,
   and `GET /api/health` reports `agency.enabled: false`.
3. The frontend hides the agency surface on next load without a deploy.

**Turning it back on** restores the exact same data: no rows are deleted by
the gate. Re-enable, restart, then run the smoke pair
(`scripts/smoke-a9-security.mts` and `scripts/smoke-a8.mts`) before
announcing.

**Rollback plan (deploy-level):** redeploy the previous commit. There is no
schema-destructive migration in A1-A9 (all new collections, no rewrites of
individual-product data), so a rollback restores the pre-launch state without
data repair. If a rollback is needed while the flag was on, flip the flag off
first so a half-rolled-back deploy never serves a mixed surface.

---

## 2. Environment configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENCY_WORKSPACE_ENABLED` | `false` | Master feature gate (§1). |
| `AGENCY_OPS_KEY` | *(unset)* | Secret that authorises `PATCH /api/agency/:id/plan`. TravelAI ops only; agencies can never change their own plan. Unset means nobody can change plans over HTTP. |
| `AGENCY_PLAN_TIERS` | starter {seats 3, monthlyExports 10, storageMb 100} | JSON map of plan tiers. Used by quota and seat checks. |
| `AGENCY_PLAN_DEFAULT` | `starter` | Tier applied to agencies without an override. |
| `AGENCY_PROPOSAL_TTL_DAYS` | `30` (max 90) | Default lifetime of a public proposal share link. |
| `AGENCY_CHROME_PATH` | auto-detect | Chrome/Edge binary for HTML→PDF. Without a browser, export jobs fail retryably (503) and the UI offers Retry. |
| `AGENCY_ASSET_DIR` | `backend/agency-assets` | Private store for brand assets (A3). |
| `AGENCY_TEMPLATE_DIR` | `backend/agency-templates` | Private store for uploaded template sources/snapshots (A6). |
| `AGENCY_EXPORT_DIR` | `backend/agency-exports` | Private store for rendered proposal PDFs (A5). |
| `AGENCY_EXPORT_SIGNING_SECRET` | falls back to `JWT_SECRET` | HMAC secret for signed export download URLs. |

Never serve the three private file roots from a public path; they are
authorised per-request by the tenant guard and signed URLs, never by URL
guessability.

---

## 3. Agency onboarding runbook

Prereqs: the flag is on (§1), `AGENCY_OPS_KEY` is set for ops, a renderer
binary is installed, and the ops team has a plan tier decided.

1. **Provision the plan.** From ops tooling (not the app UI):
   `PATCH /api/agency/:agencyId/plan` with header `x-travelai-ops: <key>` and
   body `{ "tierId": "<tier>", "seats": N, "monthlyExports": N, "storageMb": N }`.
   Overrides are optional per field; unresolved fields come from the tier.
   Verify with `GET /api/agency/:agencyId/usage` (admin/owner token).
2. **Agency signup.** The agency owner signs up, creates the agency and lands
   in the workspace. The owner is the first member with `owner` rank.
3. **Seats.** The owner/admin invites staff from Members/Settings. Seat
   capacity is enforced on invite; plan upgrades come from ops (§3.1).
4. **Branding (A3).** Settings → Brand & Assets: agency name, contact,
   colours, logo/mascot uploads, fonts. Assets are private and tenant-scoped;
   a wrong file type/size is rejected at upload.
5. **Templates (A6).** Either keep the built-in brochure/internal templates
   or upload an HTML template (Settings → Templates), choose brand assets,
   and **preview against a real trip before activating a version** — the
   activation guard refuses unpinned versions.
6. **First trip (A2).** Create a trip in the workspace; every member sees it,
   planners and above can edit, admins archive/restore.
7. **Client + quote (A4).** Add the client to the trip, save the quote
   (drafts are internal; publishing to the client needs an approval flow the
   owner defines).
8. **Export (A5).** Generate the client proposal from the trip; the job
   queues, renders (2 at a time), and appears in Export history. Download
   uses a signed, short-lived URL.
9. **Share (A7).** On a ready client export with a quote, create a share
   link; the client sees a public proposal page with only client-safe data.
10. **Hand-over.** Confirm the owner can complete steps 4-9 alone; log the
    agency in the support sheet (§4).

### 3.1 Plan/seat changes

- Plan changes are **ops-only** via the secret-gated route above; each change
  is audited (`plan.changed`) without an actor.
- Seat exhaustion → invite fails with the current plan; ops raises `seats`.
- Monthly export exhaustion → new exports answer 409 until the 1st of the
  month; ops raises `monthlyExports` if the agency is healthy.

---

## 4. Support checklist

Run this when an agency reports trouble, in order.

1. **Scope.** `GET /api/agency/:id/usage` (admin token) — seats, exports this
   month, storage. Compare against the plan; most "it stopped working" cases
   are a limit (409 monthly export quota, 409 seat limit, 409 storage quota,
   429 hourly rate limits).
2. **Exports failing.** `GET /api/agency/:id/audit?action=export` — every job
   leaves `export.requested` / `export.completed` / `export.failed` with a
   stored error. Common causes:
   - 503 renderer not configured → install Chrome or set `AGENCY_CHROME_PATH`.
   - 409 template/version no longer available → regenerate the export.
   - 409 snapshot unreadable → upload a new template version.
3. **Template upload rejected.** The validator output names the problem:
   disallowed tag/attribute, remote image source, `url()`/`@import`/`expression`
   in CSS, unknown Mustache token, >512KB source, >32MB asset snapshot.
   Point the agency at the template contract in `agency-a6-design.md`.
4. **Share link dead.** Links expire (`AGENCY_PROPOSAL_TTL_DAYS`); the share
   panel revokes instantly. A revoked/expired link is 404/410 by design.
5. **Storage.** `GET /api/agency/:id/usage` `storageBytes` covers brand
   assets, template snapshots and unexpired exports. Deleting assets/templates
   frees space immediately (files are removed with the row).
6. **Escalation.** If a cross-tenant symptom is ever reported, treat as
   incident: kill-switch (§1) and run `scripts/smoke-a9-security.mts`.

---

## 5. Backups, retention and deletion policy

**Where data lives**

- MongoDB collections (all `agencyId`-scoped): `agencies`, `agencymembers`,
  `agencyassets`, `agencytemplates` (+versions), `agencyexports`,
  `agencyquotes`, `agencyclients`, `agencyinvites`, `agencyproposallinks`,
  `agencyaudits`, plus agency-workspace `trips`.
- Private file roots (§2): brand assets, template sources/snapshots, export
  PDFs. Files are redundant copies of what the rows reference; the rows are
  the source of truth.

**Backups**

- Take `mongodump` of the database and a file backup of the three private
  roots **together** (rows reference files by server-generated key). A restore
  needs both.
- Suggested cadence: daily database dump with 30-day retention; file roots
  follow the same schedule since files can be regenerated (assets re-uploaded,
  exports re-rendered) but the dump alone cannot rebuild them.

**Retention**

- Export PDFs expire **30 days** after creation (`EXPORT_RETENTION_DAYS`);
  expired rows stop counting toward storage and their signed URLs stop
  working. Physical file deletion for expired exports is a maintenance job.
- Public proposal share links live up to **90 days** (default 30,
  `AGENCY_PROPOSAL_TTL_DAYS`); expired links are gone from client view.
- Audit rows currently have no automatic expiry — retain them; they are the
  compliance trail for plan changes, shares and exports.

**Deletion**

- Owner/admin "Recently deleted" (A2) soft-deletes trips; purge is permanent
  and owner-only.
- Asset/template deletion removes the row **and** its private file. Export
  deletion removes the row and file; a deleted export's signed URL 404s.
- Agency deletion (product roadmap): deletes members, scoped rows and the
  three private file subtrees keyed by the agency id.

---

## 6. Pilot acceptance checklist (simulated pilot)

Used by the simulated pilot script (`scripts/smoke-a9-pilot.mts`); run it
verbatim for the real pilot with 2-3 pilot agencies.

- [ ] Agency created and owner onboarded without developer help.
- [ ] Plan provisioned via the ops-secret route; usage reads back correctly.
- [ ] Second member invited/joined within the seat limit; a third invite
      beyond seats is refused with an actionable message.
- [ ] Branding configured; logo/mascot/font assets uploaded and shown in
      preview.
- [ ] A trip is planned, edited and assigned; archive/restore works.
- [ ] Client added; quote saved as draft, then finalised.
- [ ] Client export renders a PDF with the agency brand and no internal
      cost/markup/prepared-by fields.
- [ ] Share link opens the public proposal; the page shows client-safe data
      only; revocation kills the link.
- [ ] Export quota, seat limit, storage quota and hourly rate limits all
      answer their documented 4xx with actionable messages.
- [ ] Audit trail contains the lifecycle (plan, export, share) entries.
- [ ] A cross-tenant probe (foreign trip/asset/export/share ids) answers 404.
