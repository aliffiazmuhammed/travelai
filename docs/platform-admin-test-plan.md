# Platform admin and account realms - acceptance and security test plan

**Status:** PA0-PA4 verified; PA5 hardening rehearsed locally (2026-10-26). Real
agency pilot and production cutover remain pending.

This plan is the release gate for `docs/roadmap-platform-admin.md`. It covers
the personal, agency and platform realms, the tenant lifecycle, the migration
and the admin console. Run the whole plan against a staging copy before the
pilot, then run §9 against production after cutover.

---

## 1. Environments

| Surface | Flag | Default |
| --- | --- | --- |
| Agency workspace | `AGENCY_WORKSPACE_ENABLED` | `false` |
| Platform admin | `PLATFORM_ADMIN_ENABLED` | `false` |
| Personal product | always on | - |

Expected flag-off behavior:

- `/api/agency/*` and `/api/admin/*` answer `404` (not `403`), and
  `/api/health` reports `agency.enabled: false` / `platform.enabled: false`;
- the SPA hides the agency entry points and renders `/admin` as unavailable;
- the personal product is unchanged.

---

## 2. Realm isolation

- [ ] Personal signup/signin never matches an agency or platform row with the
      same email.
- [ ] Agency signin requires the workspace slug and rejects a personal email
      with the agency password (and vice versa).
- [ ] Platform signin at `/admin/login` rejects personal and agency credentials.
- [ ] `token` cannot call `/api/admin/*` or `/api/agency/*`.
- [ ] `agency_token` cannot call `/api/admin/*` or personal `/api/*` routes.
- [ ] `platform_token` cannot call personal or agency routes.
- [ ] Cross-realm API calls return a generic `401`; there is no realm hint.
- [ ] A personal token cannot read or edit an agency trip through
      `/api/itinerary`; an agency token cannot reach a personal trip.
- [ ] The same browser can hold all three cookies without one overwriting
      another.
- [ ] No public route (invite preview, proposal view, health, CSRF) exposes
      tenant content or account metadata beyond its allow-list.

Automated coverage: `backend/src/middleware/auth.middleware.test.ts`,
`backend/src/models/accountRealms.test.ts`,
`backend/src/routes/admin.routes.test.ts`,
`backend/src/routes/adminAuth.routes.test.ts`.

---

## 3. Platform authentication

- [ ] CLI bootstrap creates the first super-admin with a one-time
      `Tv!` password and `mustChangePassword: true`.
- [ ] The temporary password works once for `/api/admin/auth/me` and blocks
      every other admin route with `403 PASSWORD_CHANGE_REQUIRED`.
- [ ] Changing the password invalidates the old `platform_token`.
- [ ] The platform signin limiter is 5 attempts / 15 min per IP; personal is
      10 / 15 min; agency is 10 / 15 min.
- [ ] A disabled platform admin cannot sign in, and disabling bumps
      `tokenVersion`.
- [ ] The last active super-admin cannot be disabled; self-disable is `400`.
- [ ] A second super-admin can be created (the role index is not unique).
- [ ] Platform admin creation/update is CSRF-protected and audited.

---

## 4. Account directory (PA2)

- [ ] Search by email returns one row per realm/tenant; the same email appears
      once per personal/agency/platform row.
- [ ] Realm and status filters, pagination and counts agree.
- [ ] Literal search cannot inject a regex; a query is capped.
- [ ] Detail shows identity, realm, tenant, status, last login and password
      state, never trips, quotes, clients or chat.
- [ ] Agency password reset returns a one-time password, forces a change and
      leaves the personal row with the same email working.
- [ ] Personal and platform accounts reject the agency-only reset.
- [ ] Every mutation writes a sanitized `PlatformAudit` row and never a
      password/token/hash.

---

## 5. Tenant provisioning (PA3)

- [ ] Provisioning an email that already has a personal account creates a new
      agency account and leaves the personal password/data untouched.
- [ ] An existing agency account for the same tenant is attached, not
      duplicated.
- [ ] Duplicate slug is `400`/`409` as documented; a generated slug is unique.
- [ ] Slug is immutable after creation.
- [ ] Temp password signin is blocked from tenant data until the password
      changes; the old token is invalid afterwards.
- [ ] Partial failure leaves no orphan tenant, agency account or membership.
- [ ] `agency.created` and `agency.owner_assigned` are audited.
- [ ] The owner can invite staff; acceptance creates an agency account in that
      tenant, never a personal account.

---

## 6. Tenant lifecycle and access (PA4)

- [ ] Directory filters by search, status, plan and pagination; invalid
      filters return `400`.
- [ ] Detail shows status, effective plan, raw overrides, usage, billing,
      owners, members, pending invites and recent platform audit only.
- [ ] Plan change uses the shared tier table; unknown tiers/fields and
      out-of-range overrides are `400`; usage reflects the effective plan.
- [ ] Invite/accept/role change/remove works; a removed session fails on its
      next request.
- [ ] Owner transfer promotes the heir and demotes the previous owner to admin;
      a non-owner source is `409`.
- [ ] The last owner cannot be removed or demoted (`409`).
- [ ] Agency password reset leaves the personal password/session intact; the
      old agency password fails; the temporary password forces a change.
- [ ] Suspension blocks agency login, context and live routes for that tenant
      only; personal accounts and other tenants continue.
- [ ] Reactivation works but does not restore invalidated sessions.
- [ ] Public proposal links return `404` while suspended and recover after
      reactivation.
- [ ] Tenant audit contains `plan.changed`, `member.invited`,
      `member.role_changed`, `member.removed`, `agency.owner_transferred` and
      `member.password_reset` (with `issuedByPlatform: true`).
- [ ] Platform audit contains the operator actions, and the admin viewer cannot
      read tenant audit rows.

---

## 7. CSRF, passwords and sessions

- [ ] Every cookie-authenticated write without `X-CSRF-Token` returns `403` for
      all three realms.
- [ ] A matching double-submit succeeds; Bearer calls are exempt.
- [ ] CSRF exemptions are exact paths (`/signin-evil` is not exempt).
- [ ] Password change requires the current password, at least 6 characters and
      a different new password.
- [ ] Password change, admin reset, disable and suspension bump
      `tokenVersion`; the next request with the old token is `401`.
- [ ] `mustChangePassword` is enforced server-side, not only by the SPA.
- [ ] Temporary passwords are random, shown once, hashed with bcrypt and never
      appear in audit, logs or API responses after the handoff.

---

## 8. Migration and load

See `docs/agency-identity-migration.md` for the full rehearsal and rollback
record.

- [ ] Staging copy restored; dry run reviewed; full preserve run exits `0`.
- [ ] One agency account per legacy membership; same email allowed across
      tenants; no membership points at a personal/platform row.
- [ ] Agency-owned creator/actor/trip-member references repointed.
- [ ] Chat-key warning reviewed; re-key or accepted-loss decision recorded.
- [ ] Pending invites revoked.
- [ ] Index list matches the migration document; `email_1` and the legacy
      membership/status/audit indexes are gone.
- [ ] A second run is a no-op (no new rows, no changed counts).
- [ ] Rollback restores the pre-migration shape and the migration can be re-run
      from it.
- [ ] Personal regression suite, personal build and agency tests still pass.

### Load results (20,000 rows per collection)

| Query | Before | After |
| --- | --- | --- |
| Agencies, default newest 25 | 20,000 docs, blocking SORT, 34 ms | 25 docs, 11 ms |
| Agencies, active newest 25 | 20,000 docs, blocking SORT, 30 ms | 25 docs, 7 ms |
| Accounts, default newest 25 | 20,000 docs, blocking SORT, 22 ms | 25 docs, 10 ms |
| Audit, default newest 25 | 20,000 docs, blocking SORT, 29 ms | 25 docs, 11 ms |
| Audit, action filter newest 25 | 20,000 docs, blocking SORT, 22 ms | 25 docs, 8 ms |

The fix is the `_id` tie-break in the pagination indexes (§5 of the migration
document). At 20k the absolute times are small; the important change is that
work no longer grows with the collection.

---

## 9. End-to-end scenarios

Run against a live server with both flags on.

### 9.1 Personal product unchanged

1. Sign up, sign in, create a trip, edit a day, add a collaborator, comment,
   refresh, share a link.
2. Confirm the personal session never sees agency or admin navigation.
3. Confirm the personal account with the pilot owner's email still works after
   the agency is provisioned.

### 9.2 Agency onboarding and access

1. Platform admin provisions a tenant; copy the workspace URL, email and
   one-time password.
2. Owner signs in at `/agency/login?workspace=<slug>`, replaces the password,
   reaches the tenant and invites a planner.
3. Planner accepts, signs in, sees the tenant; remove the planner and confirm
   the session dies.
4. Change the plan, read usage, transfer ownership, confirm roles.

### 9.3 Platform console

1. Search the same email across realms; open the tenant detail.
2. Suspend the tenant; confirm agency login/context/routes and public proposal
   links fail while personal and other tenants work.
3. Reactivate; confirm fresh login works and old tokens do not.
4. Reset an agency password; confirm the personal password still works.
5. Review the audit console by action, target, date and search; confirm no
   temporary password or tenant content appears.

### 9.4 Pilot acceptance (real agency)

- [ ] The real owner is onboarded from the console with no database edits.
- [ ] The owner signs in at the workspace URL, changes the password and invites
      staff.
- [ ] The tenant completes one real quote/export/share with branding.
- [ ] Support can find the tenant, read usage and audit, suspend/reactivate and
      reset a password without touching the database.
- [ ] Personal-product regression passes on the same deployment.

---

## 10. Release gate

Ship only when:

- the full backend suite, backend typecheck, frontend typecheck and production
  build pass;
- §2-§7 are green on staging;
- the migration rehearsal and rollback are recorded;
- the pilot in §9.4 is complete or explicitly deferred with a signed-off
  rollback window;
- the backup and rollback owner are named for the cutover.
