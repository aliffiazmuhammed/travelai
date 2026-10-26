# Agency Workspace and Platform Admin — Operations runbook and launch policies

Companion to `agency-a9-test-plan.md`. This is the operating manual for the
Agency Workspace (A1-A9) plus the platform admin console (PA0-PA5): onboarding,
support, backups/retention/deletion, rollback and the feature-flag kill
switches. Realm and migration details live in
`docs/roadmap-platform-admin.md`, `docs/agency-identity-migration.md` and
`docs/platform-admin-test-plan.md`.

---

## 1. Feature flag and kill switch

The whole workspace sits behind one flag: `AGENCY_WORKSPACE_ENABLED`. It defaults to `false`; the production blueprint sets it to `true` after A9 local verification (commit `158fbcf`).

- **false (environment default and kill switch)** — every route under `/api/agency` answers `404 Not
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

The platform admin console has its own flag, `PLATFORM_ADMIN_ENABLED`
(default `false`). When false, `/api/admin/*` answers `404` and the SPA renders
`/admin` as unavailable; `/api/health` reports `platform.enabled: false`.

**Platform kill switch:** set `PLATFORM_ADMIN_ENABLED=false` and restart. This
cuts off platform sign-in and every admin route without touching personal or
agency data. The last platform session is inert while the flag is off. Re-enable
and verify `GET /api/admin/overview` with a fresh platform sign-in before
announcing.

**Rollback plan (deploy-level):** redeploy the previous commit. A1-A9 shipped no
schema-destructive migration, so agency rollback alone needs no data repair. For
PA0-PA4, the realm split *does* change identity rows; roll back the flags first
and restore the pre-migration backup as described in
`docs/agency-identity-migration.md` §7. Never run a half-rolled-back deploy with
`AGENCY_WORKSPACE_ENABLED` on.

---

## 2. Environment configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENCY_WORKSPACE_ENABLED` | `false` | Master feature gate (§1). The production blueprint sets `true`; use `false` as the kill switch. |
| `PLATFORM_ADMIN_ENABLED` | `false` | Platform console gate (§1). Keep `false` until the first super-admin is bootstrapped; `false` is also the emergency kill switch. |
| `AGENCY_OPS_KEY` | *(unset)* | Break-glass secret for `PATCH /api/agency/:id/plan`. The admin console is now the normal path; keep the key unset unless an operator needs the legacy route during an incident. |
| `AGENCY_PLAN_TIERS` | starter {seats 3, monthlyExports 10, storageMb 100} | JSON map of plan tiers. Used by quota and seat checks. |
| `AGENCY_PLAN_DEFAULT` | `starter` | Tier applied to agencies without an override. |
| `AGENCY_PROPOSAL_TTL_DAYS` | `30` (max 90) | Default lifetime of a public proposal share link. |
| `AGENCY_CHROME_PATH` | auto-detect | Chrome/Edge binary for HTML→PDF. Without a browser, export jobs fail retryably (503) and the UI offers Retry. |
| `AGENCY_STORAGE_PROVIDER` | auto (Cloudinary when Cloudinary credentials exist, else local) | Where agency tenant bytes (brand assets, template sources/snapshots, export PDFs) live. `local` forces the file roots below even when Cloudinary is configured; `cloudinary` forces Cloudinary even without credentials (writes then fail loudly). |
| `AGENCY_ASSET_DIR` | `backend/agency-assets` | Local fallback store for brand assets (A3). |
| `AGENCY_TEMPLATE_DIR` | `backend/agency-templates` | Local fallback store for uploaded template sources/snapshots (A6). |
| `AGENCY_EXPORT_DIR` | `backend/agency-exports` | Local fallback store for rendered proposal PDFs (A5). |
| `AGENCY_EXPORT_SIGNING_SECRET` | falls back to `JWT_SECRET` | HMAC secret for signed export download URLs. |

Tenant bytes are Cloudinary-first: private raw uploads (`type: private`) that
are read back only through short-lived signed download URLs on
api.cloudinary.com — never the public CDN, never Basic auth. When the provider
is `local`, the three private file roots must never be served from a public
path; they are authorised per-request by the tenant guard and signed URLs,
never by URL guessability. `/api/health` reports the active choice as
`agencyStorage.provider`.

---

## 3. Agency onboarding runbook

Prereqs: `AGENCY_WORKSPACE_ENABLED=true`, `PLATFORM_ADMIN_ENABLED=true`, a
renderer binary is installed, a plan tier is decided, and at least one platform
super-admin exists (§3A.1). Provisioning creates three separate rows in one
transaction-like flow: the `Agency`, the owner's **agency** account, and the
owner membership. It never converts or attaches a personal account.

1. **Provision the tenant.** Sign in at `/admin/login`, open **Agencies**, and
   use **Provision agency**. Enter the tenant name, slug (or leave it to
   generate), plan tier, optional billing contacts, owner email and owner name.
   The wizard warns if a personal or platform account already uses that email;
   the warning is informational - the new agency account is separate.
2. **Hand off credentials.** The success dialog shows the workspace URL,
   `ownerEmail` and a one-time `Tv!` temporary password. Copy them into the
   handoff channel and close the dialog; the password is not retrievable later.
   The owner signs in at `/agency/login?workspace=<slug>`, is forced to choose a
   new password, and lands in the tenant. The old temporary session is
   invalidated.
3. **Seats.** The owner/admin invites staff from Members/Settings. Seat
   capacity is enforced on invite; the platform admin can raise it from the
   tenant drawer (plan/override) or the owner can request an upgrade.
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

- The normal path is the platform console: **Agencies → tenant → Plan**. It
  reuses the same tier table as the tenant service; blank override fields
  inherit the tier. Changes are audited as `agency.plan_changed` plus the
  tenant `plan.changed`.
- The secret-gated `PATCH /api/agency/:id/plan` (`x-travelai-ops`) remains a
  break-glass route only. Keep `AGENCY_OPS_KEY` unset unless an incident needs
  it.
- Seat exhaustion → invite fails with the current plan; raise `seats`.
- Monthly export exhaustion → new exports answer 409 until the 1st of the
  month; raise `monthlyExports` if the agency is healthy.

---

## 3A. Platform admin console operations

The console is a third realm at `/admin/login`. It never shares a cookie with the
personal or agency product, and it never reads tenant content (no trips, quotes,
clients or chat).

### 3A.1 Bootstrap the first super-admin

Run once from the backend host with database access:

```bash
cd backend
npm run bootstrap:platform-admin -- --email ops@example.com --name "Ops"
```

The command prints a `Tv!...` temporary password once. Store it in the
password manager, sign in at `/admin/login`, and replace it immediately. The
temporary session can only reach `/api/admin/auth/me`, `/password`, `/logout`
and `/csrf` until the change. Treat terminal output as a secret.

The command refuses to overwrite an existing platform account for that email.
Create additional super-admins from **Platform admins** in the console.

### 3A.2 Account recovery

- A platform admin who forgot a password uses another super-admin: **Platform
  admins → Reset password**. The reset returns a one-time password and forces a
  change.
- If every super-admin is locked out, bootstrap a new email with the CLI
  (existing rows are never overwritten), sign in, and disable the locked rows.
- If the last active super-admin would be disabled, the API returns `409`.
  Self-disable returns `400`. Create/promote another admin first.

### 3A.3 Tenant lifecycle

- **Suspend:** **Agencies → tenant → Suspend**. It immediately invalidates every
  agency session in that tenant, blocks login/context/tenant routes, and makes
  public proposal links fail closed (`404`). Personal accounts and other
  tenants are unaffected. The action is audited (`agency.suspended` plus the
  tenant `agency.suspended`).
- **Reactivate:** **Agencies → tenant → Reactivate**. Staff must sign in again;
  old tokens stay invalid by design.
- **Reset an agency password:** **Agencies → tenant → member → Reset password**.
  It returns a one-time `Tv!` password and forces a change. A personal account
  with the same email is untouched.
- **Plan/override:** **Agencies → tenant → Plan**. Blank fields inherit the
  tier; unknown tiers/fields and out-of-range overrides are `400`. Usage reads
  the effective plan immediately.
- **Members:** invite, change role, transfer owner, remove. The last owner
  cannot be removed or demoted (`409`). Owner transfer promotes the heir and
  demotes the previous owner to admin.
- **Tenant content is support-visible only to the tenant.** The console shows
  metadata, usage and platform audit; it cannot open a quote, trip or client.
  Escalate a content question to the tenant owner.

### 3A.4 Audit

`/admin/audit` filters platform events by action, target type/id, date and
literal search, with pagination and facets. Rows never contain passwords,
tokens, hashes or raw headers. Tenant-visible platform changes also appear in
the tenant's own audit (`plan.changed`, `member.*`, owner transfer, password
reset with `issuedByPlatform: true`). The admin viewer deliberately does not
expose tenant audit rows.

### 3A.5 Cutover and rollback

Use `docs/agency-identity-migration.md` for the full checklist. In short:

1. Back up; disable both flags; rehearse on a copy.
2. Run the migration (`--indexes-only` repairs indexes).
3. Bootstrap the first platform admin; enable `PLATFORM_ADMIN_ENABLED`.
4. Provision the pilot tenant; enable `AGENCY_WORKSPACE_ENABLED`.
5. Roll back by disabling both flags, redeploying the previous build and
   restoring the pre-migration backup. Do not attempt an in-place down-migration.

---

## 4. Support checklist

Run this when an agency reports trouble, in order.

1. **Scope.** `GET /api/agency/:id/usage` (agency owner/admin token) — seats,
   exports this month, storage. The platform console shows the same usage on
   **Agencies → tenant**. Compare against the plan; most "it stopped working"
   cases are a limit (409 monthly export quota, 409 seat limit, 409 storage
   quota, 429 hourly rate limits).
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
- Tenant bytes (brand assets, template sources/snapshots, export PDFs): with
  the Cloudinary provider these are private raw assets under
  `<CLOUDINARY_FOLDER>/agency/`; with the local provider they are the three
  private file roots (§2). Files are redundant copies of what the rows
  reference; the rows are the source of truth.

**Backups**

- Take `mongodump` of the database. With the local provider, also take a file
  backup of the three private roots **together** (rows reference files by
  server-generated key; a restore needs both). With the Cloudinary provider,
  enable the Cloudinary backup add-on for off-site retention — otherwise
  tenant bytes can only be regenerated (assets re-uploaded, exports
  re-rendered) since the rows alone cannot rebuild them.
- Suggested cadence: daily database dump with 30-day retention; local file
  roots follow the same schedule.

**Retention**

- Export PDFs expire **30 days** after creation (`EXPORT_RETENTION_DAYS`);
  expired rows stop counting toward storage and their signed URLs stop
  working. Physical deletion for expired exports (Cloudinary destroy or local
  file removal, per provider) is a maintenance job.
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

## 6. Pilot acceptance checklist

Used by the simulated pilot script (`scripts/smoke-a9-pilot.mts`); run it
verbatim for the real pilot with 2-3 pilot agencies. For the platform-admin
path, §9.4 of `docs/platform-admin-test-plan.md` is the authoritative pilot
gate.

- [ ] Agency provisioned from `/admin/agencies` and owner onboarded without
      developer help or database edits.
- [ ] Plan set from the tenant drawer (or inherited from the tier); usage reads
      back correctly.
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
