# Agency identity migration and rollback

Companion to `docs/roadmap-platform-admin.md` §10 and
`docs/platform-admin-test-plan.md`. This document is the operator checklist for
moving an existing database from one global `User` email to the three account
realms (personal, agency, platform).

**Status:** implemented and rehearsed locally (2026-10-26). No production
migration has been run from this document yet.

---

## 1. What changes

| Area | Legacy | Target |
| --- | --- | --- |
| Identity | One `User` row, globally unique `email` | `accountType: 'personal' \| 'agency' \| 'platform'`; uniqueness scoped by realm/tenant |
| Agency login | Personal session at `/agency` | Separate `agency_token` at `/agency/login?workspace=<slug>` |
| Agency membership | Points at the personal user | Points at one agency account in that tenant |
| Agency slug | Optional/absent | Required, unique, immutable, 3-40 lowercase alnum + dashes |
| Agency status | Absent | `active` (or `suspended` if already set) |
| Invites | Personal acceptance | Revoked, then reissued for the target realm |
| Platform admin | Did not exist | Separate `platform_token` at `/admin/login` |
| Sessions | `token` only | `token`, `agency_token`, `platform_token`, each realm-scoped |

The `User` row is never converted. A person can hold a personal row, one agency
row per tenant, and a platform row with the same email; the password, profile
and data of each row are independent.

---

## 2. Preconditions

1. **Back up first.** Take a full `mongodump` (or a provider snapshot) and record
   the database name, timestamp and document counts. With the local agency
   storage provider, back up `AGENCY_ASSET_DIR`, `AGENCY_TEMPLATE_DIR` and
   `AGENCY_EXPORT_DIR` together with the database.
2. **Freeze agency writes.** Set `AGENCY_WORKSPACE_ENABLED=false` and restart.
   The personal product stays up. Verify `/api/agency/*` answers `404`.
3. **Keep the platform surface dark.** `PLATFORM_ADMIN_ENABLED=false` until the
   first admin is bootstrapped and the tenant is provisioned.
4. **Rehearse on a copy.** Restore the backup into a staging database and run
   this document end to end. Do not run the preserve path for the first time in
   production.
5. **Decide the cutover path:** reset/re-seed (§3) or preserve (§4). The reset
   path is preferred when there is no confirmed production agency data.

---

## 3. Path A - reset and re-seed (preferred pilot path)

Use this when existing agency rows are test/demo data.

1. Back up the database.
2. Deploy PA0-PA4 code with `AGENCY_WORKSPACE_ENABLED=false` and
   `PLATFORM_ADMIN_ENABLED=false`.
3. Run the reset migration:

   ```bash
   cd backend
   npm run migrate:account-realms -- --purge-legacy-memberships --dry-run
   npm run migrate:account-realms -- --purge-legacy-memberships
   ```

   This backfills users and agencies, revokes pending invites, removes legacy
   memberships and creates the realm/tenant indexes. It does not delete agency
   content; the tenant is re-provisioned from the admin console.
4. Bootstrap the first platform admin (see the operations runbook).
5. Set `PLATFORM_ADMIN_ENABLED=true`, restart, and provision the pilot tenant
   through `/admin/agencies`.
6. Set `AGENCY_WORKSPACE_ENABLED=true`, restart, and run the smoke checks in
   `docs/platform-admin-test-plan.md`.

The PA4 verification used the reset path for local fixtures: after the run the
database had no legacy memberships and no orphan tenant/account rows.

---

## 4. Path B - preserve legacy agency data

Use this only when the existing agency data is real and must survive.

### 4.1 Mapping

For every `AgencyMember` that references a personal account, create one agency
account keyed by `{ agencyId, email }`:

```text
(agencyId, personalUserId) -> agencyAccountId
```

The existing bcrypt hash is copied once and `mustChangePassword: true` is set,
so the person signs in with their old password and is immediately forced to
choose a new one. Nothing is deleted. Re-running is a no-op.

### 4.2 Reference matrix

The migration repoints every agency-owned identity reference:

| Collection | Fields |
| --- | --- |
| `agencies` | `createdBy`, `provisionedBy` |
| `agencyassets`, `agencyclients`, `agencytemplates` | `createdBy` |
| `agencyexports` | `requestedBy` |
| `agencyinvites`, `agencyproposallinks`, `agencyquotes` | `createdBy` |
| `agencytemplateversions` | `createdBy`, `previewedBy` |
| `agencyaudits` | `actorId` |
| `agencymembers` | `userId`, `invitedBy` |
| `trips` | `userId`, `assignedTo`, `members[].userId`, `members[].invitedBy`, `participants[].userId` |
| `tripcomments`, `tripreadstates` | `userId` |
| `tripdecisions` | `userId`, `createdBy` |
| `trippolls` | `createdBy`, `votes[].userId` |
| `tripinvites`, `tripchatkeys` | `createdBy` |

### 4.3 E2EE decision

Chat envelopes in `tripchatkeys.envelopes` are wrapped for a specific identity.
The migration deliberately **does not** rewrite them. If an agency trip holds
an envelope for the old personal id, the run prints:

```text
warning: N agency chat key row(s) hold an envelope for the personal account;
that history needs a re-key or an accepted loss (§10.3)
```

Decide before cutover: re-key through the client (full history preserved for
members who can still open the old key) or accept that the old ciphertext is
unreadable. The local rehearsal database had no chat keys on agency trips; the
injected fixture exercised the warning path.

### 4.4 Run

```bash
cd backend
export MONGODB_URI='<staging-or-production-uri>'
npm run migrate:account-realms -- --preserve-legacy-memberships --dry-run
npm run migrate:account-realms -- --preserve-legacy-memberships
```

The dry run writes nothing. The full run logs each created/reused agency
account, each repointed tenant and the chat-key warning. Exit code is non-zero
if any membership still violates the tenant invariant; in that case the unique
`AgencyMember.userId` index is not created and the cutover must stop.

---

## 5. Index migration

`ensureIndex` reconciles by name, key, unique flag and partial filter. Running
the migration again repairs drifted indexes without touching data
(`--indexes-only` does only this).

| Collection | Index | Notes |
| --- | --- | --- |
| `users` | `email_1` | **Dropped** (legacy global unique) |
| `users` | `personal_email_unique` | partial on `accountType: 'personal'` |
| `users` | `platform_email_unique` | partial on `accountType: 'platform'` |
| `users` | `agency_email_unique` | `{ agencyId, email }`, partial on `accountType: 'agency'` |
| `users` | `account_type_status` | directory counts |
| `users` | `createdAt_-1__id_-1` | stable newest-first account pagination |
| `users` | `platform_super_admin` | **not unique**; role lookup only |
| `agencies` | `slug_1` | unique |
| `agencies` | `status_1_createdAt_-1` | **dropped**; replaced below |
| `agencies` | `createdAt_-1__id_-1` | default directory pagination |
| `agencies` | `status_1_createdAt_-1__id_-1` | status-filtered pagination |
| `agencymembers` | `{ userId, createdAt }` | **dropped** (legacy switcher index) |
| `agencymembers` | `userId_1` | unique: one agency account, one tenant |
| `platformaudits` | `createdAt_-1`, `action_1_createdAt_-1`, `targetType_1_targetId_1_createdAt_-1`, `actorId_1` | **dropped**; replaced below |
| `platformaudits` | `createdAt_-1__id_-1`, `action_1_createdAt_-1__id_-1`, `targetType_1_targetId_1_createdAt_-1__id_-1`, `actorId_1_createdAt_-1__id_-1` | stable audit pagination |

For a live index-only repair:

```bash
npm run migrate:account-realms -- --indexes-only --dry-run
npm run migrate:account-realms -- --indexes-only
```

---

## 6. Rehearsal record (2026-10-26)

Environment: local MongoDB `travelai` copied to `travelai_pa5_stage`; 20
collections copied with indexes. Legacy fixtures injected into the copy:

- 1 user with no realm fields, global `email_1` unique index restored;
- 2 agencies with no/invalid slug and no status, one with a colliding slug;
- 2 memberships for the same personal user in two tenants;
- 1 pending invite;
- 1 legacy agency trip with owner/member references;
- 1 `tripchatkeys` row whose envelope is wrapped for the personal id;
- 1 trip comment, 1 client and 1 audit row owned by the personal id.

Results:

- dry run reported the exact planned writes and made none;
- full run created 2 agency accounts (same email, different tenants), copied
  the hash once, forced a password change, repointed 8 + 2 agency references,
  revoked the invite, and printed the chat-key warning;
- all target indexes were created; `email_1`,
  `status_1_createdAt_-1`, the legacy membership index and the old audit
  indexes were dropped;
- a second full run reported 0 backfills, 0 revokes, 0 new accounts and no
  document-count changes (users 10, agencies 4, memberships 4, invites 1,
  trips 5, chat keys 12, comments 9, clients 2, audits 30);
- rollback: a logical snapshot of the pre-migration copy was restored over the
  migrated copy. The legacy user had no `accountType`, the agency had no slug
  and the membership/trip pointed at the personal id again. Re-running the
  migration from that restored state recreated the same target shape.

---

## 7. Rollback

There is no down-migration for a realm split: restoring identity rows in place
is riskier than restoring the backup.

1. Set `AGENCY_WORKSPACE_ENABLED=false` and `PLATFORM_ADMIN_ENABLED=false`;
   restart. This stops both new surfaces before any code rollback.
2. Redeploy the previous commit (the one before PA0).
3. Restore the pre-migration database dump (and the three local agency file
   roots if the local storage provider is active).
4. Start the previous build and verify personal sign-in, personal trips and the
   existing agency surface.
5. Do not run the PA0 migration against the restored database until the cause
   is understood.

The logical restore rehearsal in §6 confirmed that a backup taken before the
migration restores the exact legacy shape, and that the migration can be
re-run from that restored state without manual repair.

---

## 8. Cutover checklist

- [ ] Backup verified (database + private agency files).
- [ ] Staging rehearsal passed, including a second (idempotent) run.
- [ ] E2EE decision recorded for every agency trip with chat keys.
- [ ] `AGENCY_WORKSPACE_ENABLED=false` and `PLATFORM_ADMIN_ENABLED=false`.
- [ ] Migration dry run reviewed.
- [ ] Migration full run exits `0`; no membership violations remain.
- [ ] Index list matches §5.
- [ ] First platform admin bootstrapped; temp password stored once and rotated.
- [ ] `PLATFORM_ADMIN_ENABLED=true`; admin sign-in and tenant provisioning work.
- [ ] Pilot tenant provisioned through the console; handoff credentials work.
- [ ] `AGENCY_WORKSPACE_ENABLED=true`; smoke checks pass.
- [ ] Personal sign-in/trip regression passes (unchanged surface).
- [ ] Rollback window agreed; backup retained until the pilot is stable.

---

## 9. Known limitations

- Search in the admin directories is a case-insensitive regex over name/slug/
  billing (agencies) and email/name (accounts). It is intentionally literal and
  bounded, but it cannot use a leading-wildcard index; at very large scale,
  replace it with a dedicated search index.
- The preserve path audits chat keys but cannot re-wrap ciphertext. That is a
  client re-key decision, not a server migration.
- Existing agency sessions are invalid after cutover by design. Staff sign in
  again at the tenant workspace URL.
