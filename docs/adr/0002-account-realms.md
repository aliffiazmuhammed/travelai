# ADR 0002: Account realms, tenant-scoped agency accounts, and platform admin

- **Status:** Accepted
- **Date:** 2026-10-26
- **Milestones:** PA0-PA4
- **Related:** `docs/roadmap-platform-admin.md`, `docs/agency-identity-migration.md`, `docs/adr/0001-agency-workspace-boundary.md`

## Context

The personal product, the agency workspace and the platform console have
different trust boundaries:

- a personal account owns personal trips and collaboration;
- an agency account belongs to exactly one paying tenant and must never reach
  another tenant;
- a platform admin operates tenants and accounts but must not read tenant
  content or impersonate users.

The legacy model used one global email and one session cookie, with agency
memberships pointing at personal users. That made the three roles inseparable:
the same credentials could reach both products, an agency invite could attach a
personal identity, and there was no operator surface that was not also a user.

## Decision

### 1. One collection, explicit realm

`User` keeps a single collection and gains:

```ts
accountType: 'personal' | 'agency' | 'platform';
agencyId?: ObjectId;          // agency accounts only, immutable
platformRole?: 'super_admin'; // platform accounts only
status: 'active' | 'disabled';
tokenVersion: number;
mustChangePassword: boolean;
```

`accountType` and `agencyId` are immutable. A pre-validate hook rejects a
missing tenant on an agency row, a tenant on any other realm, and a platform
role outside the platform realm.

### 2. Realm-scoped uniqueness

The global unique `email` index is removed. Uniqueness is enforced by partial
indexes:

- `personal_email_unique` on `{ email }` where `accountType: 'personal'`;
- `platform_email_unique` on `{ email }` where `accountType: 'platform'`;
- `agency_email_unique` on `{ agencyId, email }` where `accountType: 'agency'`.

The same email can therefore hold a personal row, one agency row per tenant and
a platform row, all with independent passwords and data.

### 3. Three sessions, three guards

| Realm | Cookie | Guard | Entry point |
| --- | --- | --- | --- |
| Personal | `token` | `protectPersonal` | `/login` |
| Agency | `agency_token` | `protectAgency` | `/agency/login?workspace=<slug>` |
| Platform | `platform_token` | `protectPlatform` | `/admin/login` |

Every protected route accepts exactly one realm. A cross-realm token is a
generic `401`, not a redirect or a hint. Shared trip routes use
`protectSession` and the existing trip guard, so a personal token cannot reach
an agency trip and vice versa.

CSRF is a double-submit token shared by all three realms: the verifier treats
`token`, `agency_token` and `platform_token` as session cookies, and exemptions
are exact paths only. Bearer callers are exempt because CSRF is not transferable
to that channel.

### 4. Agency identity is tenant-scoped

- An agency account has exactly one `agencyId`.
- Login requires both the workspace slug and the email/password; the slug is
  resolved to an active tenant before credentials are checked.
- There is no cross-agency switcher. A person with access to two tenants has two
  agency accounts and two sign-ins.
- Agency invites create an agency account in the invite's tenant, never a
  personal account. An existing personal account with the same email is left
  untouched.
- The platform console provisions tenants and their first owner; agency
  self-service creation is removed.

### 5. Platform admin is a separate realm

- The first platform admin is created by a CLI bootstrap with a random
  temporary password and `mustChangePassword`.
- `/api/admin/*` is gated by `PLATFORM_ADMIN_ENABLED`, `protectPlatform` and a
  platform-role check.
- Admin visibility is metadata only: accounts, tenants, plans, usage, billing
  contacts, memberships and platform audit. There is no tenant-content viewer
  and no impersonation.
- The last active super-admin cannot be disabled. A platform admin cannot
  disable their own account.
- Platform actions write `PlatformAudit`; tenant-visible changes additionally
  write the tenant `AgencyAudit` with `issuedByPlatform: true`. The admin audit
  viewer never reads tenant audit, so it cannot become a content back door.

### 6. Suspension fails closed

`Agency.status: 'active' | 'suspended'` is checked at every agency entry point.
Suspension also bumps `tokenVersion` for every agency account in the tenant, so
live sessions die on the next request. Reactivation deliberately does not
restore invalidated tokens. Public proposal links resolve the tenant's status
and return the same generic `404` while suspended; personal accounts and other
tenants are unaffected.

### 7. One shared plan and member policy

Plan validation/application and member/owner rules live in services
(`services/agency/plan.ts`, `access.ts`, `members.ts`, `invites.ts`). The
platform console invokes them with `actorRole: 'owner'` rather than creating a
fake membership. This keeps the console and the tenant UI on the same rules:
the last owner cannot be removed or demoted, roles cannot grant ownership, and
owner transfer promotes first and demotes second with compensating rollback.

## Consequences

- A person can hold all three identities with the same email; support must ask
  which realm and tenant a user means.
- Existing agency memberships need a migration; the preserve path creates one
  agency account per membership and repoints agency-owned references. E2EE chat
  envelopes cannot be re-wrapped server-side and need an explicit re-key or an
  accepted loss.
- Personal sessions remain valid across the cutover; agency users must sign in
  again. Existing agency invites are revoked and reissued.
- Admin directory queries never join tenant content. The cost is that support
  cannot inspect a quote, trip or client from the console; that is intentional.
- The directory/audit sorts carry `_id` in their indexes so pagination stays
  index-only as the platform grows.
- The real-agency pilot, production migration and rollback rehearsal remain
  operational tasks tracked by PA5; this ADR records the design, not the
  production execution.
