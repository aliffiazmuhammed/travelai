# Platform Admin and Account Realms - implementation milestone plan

**Status:** planning (2026-10-23); revised 2026-10-26 after a code review added
the shared trip-surface, CSRF, and realm-scoped email-lookup rules. No PA
milestone implemented yet.

**Supersedes:** the account and onboarding assumptions in
`docs/roadmap-agency-workspace.md`. A0-A9 remain the running agency baseline
until PA0 ships.

**Goal:** add a platform-admin panel that can see registered accounts, onboard
agency tenants, and grant tenant access without mixing personal, agency, and
platform identities.

**Scope:** account-realm separation, tenant-scoped agency login, platform-admin
authentication, account directory, tenant provisioning, forced first-login
password change, tenant lifecycle, and a platform audit trail.

---

## 1. Product boundary

Three account realms are deliberately separate:

```text
Personal account  -> personal password -> /dashboard, personal trips, personal collaboration
Agency account    -> agency password   -> one tenant only, /agency
Platform account  -> platform password -> /admin
```

The agency is the SaaS tenant and the paying customer. TravelAI onboards the
tenant from the platform admin panel. Agency staff do not self-create tenants.

**Non-negotiable rules:**

- A personal account is never converted into, attached to, or reused as an
  agency account.
- An agency account belongs to exactly one tenant.
- A platform account cannot access personal or agency workspaces.
- A personal or agency account cannot access the platform admin panel.
- No workspace shares a session with another realm.
- The individual product stays usable with no agency account and no new
  required fields.

The same email may exist in more than one realm, and in more than one tenant:

```text
alice@example.com  personal account
alice@example.com  agency account for tenant "acme"
alice@example.com  agency account for tenant "blue-sky"
alice@example.com  platform account
```

Those are four separate account records with four separate passwords, statuses,
sessions, and login histories. The admin panel must show them as separate rows,
never merge them.

---

## 2. Locked architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Account storage | One `User` collection with `accountType: 'personal' \| 'agency' \| 'platform'` | Gives separate account records and passwords without rewriting every agency user reference |
| Personal identity | `accountType: 'personal'`, existing `/auth` login | Preserves the individual product |
| Agency identity | `accountType: 'agency'`, `agencyId` required | One agency account per tenant; tenant is part of the identity |
| Platform identity | `accountType: 'platform'`, `platformRole: 'super_admin'` | Hard isolation for internal staff and admin-panel access |
| Email uniqueness | Per realm and per tenant, not global | Same email can legitimately exist as personal, platform, and multiple agency accounts |
| Agency login | Workspace slug + email + password | The slug disambiguates the tenant and prevents cross-tenant login |
| Agency switcher | Removed | An agency account is scoped to one tenant; multiple tenants require separate logins |
| Sessions | Separate cookies and JWTs per realm | Logging into agency must not replace or authorize a personal session, and vice versa |
| Agency creation | Platform admin only | TravelAI onboards paying agencies; no public self-service tenant creation |
| Owner provisioning | Temporary password + forced password change | Matches the requested first-login flow; the personal password is never touched |
| Agency invites | Create or use an agency account for that tenant | Invites never attach a personal account |
| Platform roles | `super_admin` only in v1 | Keep the first release small; add read-only/support roles later |
| Shared trip surface | `/api/itinerary/*` trip-scoped routes and generation accept either realm via `protectSession`; collection endpoints stay personal-only | Agency trips already run on the shared `Trip` model and the M7 chat/collab routes; forking the API would fork tenant authorization |
| CSRF | One double-submit cookie; every realm session cookie is a CSRF target | A realm-only exemption would silently drop CSRF from agency and admin writes |
| E2EE chat | Agency accounts publish their own chat keys; personal keys are never reused | Agency trips already use the M7 end-to-end chat, so keys are part of the realm split |
| Ops plan changes | Keep `X-TravelAI-Ops`/`AGENCY_OPS_KEY` as break-glass; the admin panel reuses the same plan service | One already-tested credential path stays available; PA5 decides whether to retire the ops key |
| Admin visibility | Account and tenant metadata only | No personal trips, chats, receipts, or tenant content in the admin panel |
| Billing | Plan/status/billing metadata only | No payment gateway in this release |
| Pilot migration | Reset/re-seed agency test data | A9 is locally verified with a simulated pilot; this avoids an unsafe E2EE key migration |
| Production migration | Mapped identity migration, rehearsed in staging | Required only if real agency data must be preserved |

**Explicitly out of scope for v1:** impersonation, self-service agency signup,
self-service plan upgrades, payment processing, hard deletion of accounts or
tenants, and cross-tenant agency switching.

---

## 3. Account realms and authentication

### 3.1 Realm matrix

| Realm | `accountType` | Login | Cookie | API namespace | Authorization |
|---|---|---|---|---|---|
| Personal | `personal` | `/auth` | `token` | `/api/auth`, personal trip collection APIs | Personal account only |
| Agency | `agency` | `/agency/login?workspace=<slug>` | `agency_token` | `/api/agency/auth`, `/api/agency` | Agency account + tenant membership |
| Platform | `platform` | `/admin/login` | `platform_token` | `/api/admin/auth`, `/api/admin` | Platform account + `platformRole: 'super_admin'` |
| Shared | `personal` or `agency` | either login | `token` or `agency_token` | `/api/itinerary` (trip-scoped) | Personal trip access or tenant membership, per trip |

The cookies are `httpOnly`, `secure` in production, `sameSite` as the existing
session cookie, and use the same CSRF header/cookie. Separate cookies mean a
person can be signed into personal and agency at the same time without one
session overwriting the other.

**Shared trip surface.** `/api/itinerary/*` is not a personal-only namespace:
agency trips are created through `POST /generate|/generate-stream` with
`agencyId`, and every trip-scoped route below it (`/:id`, itinerary content,
versions, live, comments, polls, chat) serves both products on the same `Trip`
model. Those routes accept `token` or `agency_token` through `protectSession`
and keep their existing trip guard; `platform_token` is never accepted.
Collection endpoints (`GET /`, `/trash`, `/insights`) stay personal-only.

### 3.2 JWT claims

```ts
// personal
{ userId, realm: 'personal', ver: <tokenVersion> }

// agency
{ userId, realm: 'agency', agencyId, ver: <tokenVersion> }

// platform
{ userId, realm: 'platform', role: 'super_admin', ver: <tokenVersion> }
```

The `realm` claim is mandatory; shared trip routes accept `personal` or
`agency`, and the claim decides which account model the guards apply.

The database account is the source of truth. On every protected request the
matching guard loads the account and checks:

- `accountType` matches the realm.
- `status === 'active'`.
- `tokenVersion` matches the claim.
- For agency accounts, `agencyId` matches the requested tenant.
- For platform accounts, `platformRole === 'super_admin'`.

A mismatch returns `401`, except cross-tenant resource access which returns
`404` like a missing resource.

### 3.3 Middleware

- `protectPersonal` - existing personal guard, scoped to `accountType: 'personal'`.
- `protectAgency` - verifies the agency session and sets `req.userId` and
  `req.agencyId`.
- `protectSession` - shared-trip guard: accepts the personal or agency cookie,
  sets the realm alongside `req.userId`/`req.agencyId`, and never accepts
  `platform_token`. Replaces `protect` on `/api/itinerary/*`; the trip guard
  still enforces personal trip access or tenant membership per trip.
- `protectPlatform` - verifies the platform session and super-admin role.
- `requireAgencyMember` / `requireAgencyRole` - unchanged tenant-role rules,
  but they now run only after `protectAgency`.
- `requirePasswordChanged` - or equivalent logic inside the guards, allowing
  only that realm's `me`, `password`, `logout` and `csrf` endpoints until the
  temporary password is replaced.

The existing agency route coverage test must be updated from `protect` to
`protectAgency`. New coverage tests must prove every personal route uses
`protectPersonal`, every agency route uses `protectAgency`, every shared trip
route uses `protectSession` (the collab router coverage test keeps its
trip-guard assertion), and every admin route uses `protectPlatform`.

### 3.4 Login, logout, and password change

- Personal signup creates only `accountType: 'personal'`.
- Agency accounts are created by platform-admin provisioning or by accepting an
  agency invite for that tenant. There is no public agency signup.
- Platform accounts are created by the bootstrap CLI or by an existing super
  admin. There is no public platform signup.
- Each realm has its own `me`, `logout`, and `password` endpoint.
- Password changes increment only that account's `tokenVersion` and reissue only
  that realm's cookie.
- `mustChangePassword` forces a password change after signin. The account can
  read `me`, change password, or log out; all other protected routes return
  `403 PASSWORD_CHANGE_REQUIRED`.
- `lastLoginAt` is updated on successful signin, not on every request.
- Login rate limiting is applied separately to personal, agency, and platform
  signin.
- `verifyCsrf` treats `token`, `agency_token`, and `platform_token` as session
  cookies that must prove possession. Each realm's signin, logout, and csrf
  bootstrap paths are exempt; a realm left out of the session set would be
  silently CSRF-exempt.

### 3.5 Social login

Google/social login remains personal-only in v1. If it is later added to agency
or platform accounts, it must be scoped by realm and tenant, with separate
identity records.

---

## 4. Tenant-scoped agency accounts

### 4.1 One account per tenant

An agency account has exactly one `agencyId`. Its uniqueness is:

```text
{ agencyId, email } unique for accountType = 'agency'
```

Consequences:

- One person can have agency accounts in several tenants, but each account is
  separate and uses that tenant's workspace slug at login.
- Agency accounts cannot switch tenants. To use another tenant, sign out and
  sign in at that tenant's workspace URL.
- The current agency switcher and `activeAgencyId` localStorage state are
  removed.
- `AgencyMember` remains the role record (`owner`, `admin`, `planner`, `viewer`)
  but must reference an agency account with the same `agencyId`. A service
  invariant and, after migration, a unique membership per agency account
  enforce this.

### 4.2 Workspace slug

Add `Agency.slug`:

- Required, lowercase, URL-safe, 3-40 characters.
- Unique across agencies.
- Immutable after creation.
- Generated from the agency name, with a numeric suffix on collision.
- Used in agency login links and the public login-context lookup.

Example:

```text
/agency/login?workspace=acme
```

The login page resolves the tenant by slug, then authenticates
`{ accountType: 'agency', agencyId, email }`. A wrong slug, suspended tenant, or
missing account returns the same generic credential error.

### 4.3 Invites

Agency invitations remain tenant-scoped and role-scoped. Acceptance must:

1. Resolve the tenant from the invite token.
2. If an agency account already exists for that tenant and email, sign it in or
   use its session.
3. If no agency account exists for that tenant, create one under the invite's
   authorization, with the invitee's chosen password and the tenant's
   `agencyId`.
4. Never attach or convert a personal account, even when the email matches.
5. Never reuse an agency account from another tenant.
6. `GET /api/agency/invites/:token` becomes public: it returns only the tenant
   name/logo, the invited role and the expiry. Unknown, expired, revoked and
   suspended-tenant tokens all return the same generic 404.

Existing pending agency invites are invalidated and reissued during the PA0
cutover because their acceptance semantics change.

### 4.4 Suspension

`Agency.status` is `active` or `suspended` in v1. A suspended tenant:

- Blocks all agency signin, `/api/agency` routes, and shared `/api/itinerary`
  trip routes for that tenant. Both guards check tenant status per request, so
  existing agency cookies stop working immediately.
- Leaves personal accounts and other tenants untouched.
- Fails closed for public proposal links, with a neutral unavailable response.
- Is reversible from the platform admin panel.

---

## 5. Data model changes

### 5.1 User

```ts
type AccountType = 'personal' | 'agency' | 'platform';
type AccountStatus = 'active' | 'disabled';
type PlatformRole = 'super_admin';

User {
  email: string;
  password: string;                 // separate hash per account
  accountType: AccountType;         // immutable after creation
  agencyId?: ObjectId;              // required for agency accounts only
  platformRole?: PlatformRole;      // platform accounts only
  status: AccountStatus;
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  tokenVersion: number;
  name?: string;
  avatarUrl?: string;
  chatPubKey?: string;
  chatPubKeys?: string[];
  createdBy?: ObjectId;             // provisioning platform account or agency owner
  createdAt: Date;
  updatedAt: Date;
}
```

Remove `unique: true` from `email`. Use partial unique indexes:

```text
{ email: 1 } unique, accountType = 'personal'
{ email: 1 } unique, accountType = 'platform'
{ agencyId: 1, email: 1 } unique, accountType = 'agency'
{ accountType: 1, status: 1 }
{ platformRole: 1 }, partial super_admin
```

Dropping the global index is not enough on its own: the signup duplicate
check and signin lookup in `services/auth.service.ts` must filter
`accountType: 'personal'`, so a personal credential can never resolve an
agency or platform account.

Schema validation:

- Agency accounts require `agencyId`; other account types must not have one.
- `platformRole` is only valid on platform accounts.
- `accountType` cannot change after creation.
- `agencyId` cannot change after creation.

### 5.2 Agency

Add:

```ts
Agency {
  slug: string;                     // unique, immutable
  status: 'active' | 'suspended';   // default active
  provisionedBy?: ObjectId;         // platform account
  provisionedAt?: Date;
  billing?: {
    contactName?: string;
    contactEmail?: string;
    renewalDate?: Date;
    notes?: string;
  };
}
```

`createdBy` remains the agency-side creator. For admin-provisioned tenants it is
the owner agency account; `provisionedBy` records the platform admin. Existing
agencies are backfilled with a unique slug and `status: 'active'`.

### 5.3 AgencyMember

Keep the model, but tighten invariants:

- `userId` must reference an agency account.
- `user.agencyId` must equal `AgencyMember.agencyId`.
- `{ agencyId, userId }` unique.
- After migration, add a unique index on `{ userId: 1 }` so one agency account
  can hold only one tenant membership. This makes the one-account-per-tenant
  rule structural, not just a service convention. The current non-unique
  `{ userId: 1, createdAt: 1 }` switcher index is dropped in the same
  migration because the switcher is removed.

### 5.4 PlatformAudit

New append-only platform audit model:

```ts
PlatformAudit {
  actorId: ObjectId;                // platform account
  action: string;
  targetType: 'agency' | 'agency_account' | 'personal_account' | 'platform_account' | 'system';
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

Never store passwords, temporary passwords, JWTs, CSRF tokens, or other
secrets in audit metadata. Tenant-visible changes such as plan or suspension
also write the existing `AgencyAudit` row.

---

## 6. Platform admin panel

### 6.1 Authentication

- Separate `/admin/login` page.
- Separate `/api/admin/auth/*` endpoints and `platform_token` cookie.
- Bootstrap the first platform account with a CLI script; never via public
  signup.
- First platform login forces a password change.
- `PLATFORM_ADMIN_ENABLED` is the kill switch; when off, every `/api/admin/*`
  route returns `404` and the frontend hides the admin entry point from
  `/api/health`. `/admin/login` stays reachable but renders an unavailable
  state, matching the agency dark-launch behavior.

### 6.2 Dashboard

- Personal account count.
- Agency tenant count, active/suspended.
- Agency account count.
- Platform account count.
- Recent platform audit events.
- Quick links to onboard an agency and search an account.

### 6.3 Accounts directory

Three separate views or tabs:

- **Personal accounts** - email, name, status, created, last login, related
  agency/platform accounts with the same email.
- **Agency accounts** - email, tenant, role, status, created, last login.
- **Platform accounts** - email, role, status, last login.

Search by email across all realms. The same email can return multiple rows; the
UI must show realm and tenant badges, not merge records.

Actions:

- Disable/enable a personal or agency account.
- Reset an agency account password (temporary password + forced change).
- Reset a personal account password only as an explicit support action, if
  enabled.
- Create/disable another platform super admin, with a last-admin guard.
- View account memberships and recent audit events.

Not shown: personal trips, chats, receipts, agency clients, quotes, exports, or
other tenant content.

### 6.4 Agency provisioning

Create-tenant wizard:

1. Tenant details: name, slug, plan, billing contact, optional notes.
2. Owner access: owner email and display name.
3. Review and create.

Owner behavior:

- Look up an agency account for `{ agencyId, email }` first.
- If none exists, create a separate agency account with the same email, a strong
  temporary password, and `mustChangePassword: true`.
- If a personal account or platform account uses the same email, display a
  warning and leave it untouched.
- If an agency account already exists for this tenant, attach it as owner; do
  not create a duplicate.
- Create the tenant, owner account, and owner membership with compensating
  cleanup if any step fails.

Credential handoff:

- Show the agency login URL with the workspace slug, the email, and the
  temporary password once.
- Explicitly state that the personal login is separate and unchanged.
- Never email or log the password in v1; no mail provider is configured.
- Audit `agency.created` and `agency.owner_assigned` without secrets.

Remove the self-service agency route and UI. `/agency/onboarding` redirects to
the agency login or shows a contact-admin message. The existing
`POST /api/agency` creation path is removed or returns `404/410`; only the
platform admin endpoint creates tenants.

### 6.5 Agency lifecycle

- Agency list: name, slug, status, plan, owner, member count, created date,
  last activity.
- Agency detail: overview, people, plan/usage, billing metadata, audit.
- Actions:
  - Add/invite an agency account to the tenant.
  - Change roles.
  - Transfer/assign owner.
  - Change plan through the admin endpoint, reusing the existing plan service
    and writing `plan.changed`. The `X-TravelAI-Ops` secret route remains as a
    break-glass path in v1; PA5 reviews retiring it.
  - Suspend/reactivate the tenant.
  - Reset an agency account password.
  - Archive (deferred unless needed for v1).
- Suspension blocks agency access and public proposal links; personal accounts
  are unaffected.
- No billing gateway, invoices, or self-service upgrades in v1.

### 6.6 Audit console

- Filter by actor, action, target type, target id, and date.
- Show platform actions and link to the affected tenant/account.
- Keep tenant audit and platform audit separate, but write both for
  tenant-visible operational changes.

---

## 7. API surface

### Personal

```text
POST   /api/auth/signup
POST   /api/auth/signin
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/password
...
```

Personal endpoints reject non-personal accounts.

### Agency

```text
GET    /api/agency/status                          public feature/milestone probe
GET    /api/agency/auth/context?workspace=<slug>   public login context
POST   /api/agency/auth/signin                     workspace + email + password
POST   /api/agency/auth/logout
GET    /api/agency/auth/me
POST   /api/agency/auth/password
PATCH  /api/agency/auth/profile
PUT    /api/agency/auth/chat-key                   agency account's M7 chat keys

GET    /api/agency/invites/:token                  public preview (generic 404s)
POST   /api/agency/invites/:token/accept           agency session/activation
...
```

All `/api/agency/*` staff routes use `requireAgencyWorkspace`,
`protectAgency`, and the tenant role guard. Public proposal routes remain
token-authenticated and must also check tenant status.

### Shared trip surface (both realms)

```text
POST   /api/itinerary/generate|generate-stream     personal or agency session
GET    /api/itinerary/:id ... chat/collab          personal or agency session
GET    /api/itinerary, /trash, /insights           personal session only
GET    /api/itinerary/shared/:shareId              public
```

Trip-scoped routes use `protectSession` plus the existing trip guard. Agency
semantics (workspace/tenant fields, tenant-role mapping, chat-key roster) stay
in the service layer; there is no duplicated agency route table.

### Platform

```text
POST   /api/admin/auth/signin
POST   /api/admin/auth/logout
GET    /api/admin/auth/me
POST   /api/admin/auth/password

GET    /api/admin/overview
GET    /api/admin/accounts
GET    /api/admin/accounts/:id
PATCH  /api/admin/accounts/:id/status
POST   /api/admin/accounts/:id/reset-password
GET    /api/admin/platform-accounts
POST   /api/admin/platform-accounts
PATCH  /api/admin/platform-accounts/:id
GET    /api/admin/agencies
POST   /api/admin/agencies
GET    /api/admin/agencies/:id
PATCH  /api/admin/agencies/:id
POST   /api/admin/agencies/:id/members
PATCH  /api/admin/agencies/:id/members/:accountId
DELETE /api/admin/agencies/:id/members/:accountId
POST   /api/admin/agencies/:id/suspend
POST   /api/admin/agencies/:id/reactivate
POST   /api/admin/agencies/:id/reset-password/:accountId
GET    /api/admin/audit
```

Final route shapes can change during implementation, but the namespace and
realm guards are fixed.

---

## 8. Frontend surface

### Personal

- Existing `/auth`, `/dashboard`, `/planner`, `/trip/:id`, `/profile`.
- `UserContext` remains personal-only.
- No admin link and no agency creation link in the personal shell.

### Agency

- New `/agency/login?workspace=<slug>`.
- New `AgencyAuthContext` backed by `/api/agency/auth/me`.
- `AgencyApp` requires an agency session, never a personal session.
- `AgencyContext` becomes single-tenant: one agency from the session, no
  switcher, no `travelai.agencyId`.
- `AgencyLayout` shows tenant name/slug and the agency account; remove
  "Create another agency" and the agency dropdown.
- `AgencyOnboarding` is removed; `/agency/onboarding` redirects to login or a
  contact-admin message.
- `AgencyInviteAccept` uses the agency activation flow.
- Agency profile/password changes call agency auth endpoints only.

### Platform

- New `/admin/login`.
- New `PlatformAuthContext` backed by `/api/admin/auth/me`.
- New `/admin` shell with Dashboard, Accounts, Agencies, Audit, and Platform
  admins.
- No personal or agency navigation inside `/admin`.
- Admin panel is a separate front door; it does not appear in the personal or
  agency navigation.

### Session behavior

- Personal, agency, and platform cookies are independent.
- Signing into agency does not sign out personal, and vice versa.
- Signing into another tenant requires the other tenant's workspace slug and
  credentials.
- A personal session cannot be used on `/api/agency/*` or `/api/admin/*`.
- An agency session cannot be used on `/api/auth/*` or `/api/admin/*`.
- A platform session cannot be used on `/api/auth/*` or `/api/agency/*`.
- Shared trip routes (`/api/itinerary/*`) accept a personal or agency session
  only; a platform session is rejected there too.

---

## 9. Milestones

| Milestone | Deliverable | Depends on |
|---|---|---|
| **PA0** | Account-realm split and tenant-scoped agency login | - |
| **PA1** | Platform account realm, admin login, admin shell, audit foundation | PA0 |
| **PA2** | Account directory and platform account management | PA1 |
| **PA3** | Agency tenant provisioning and forced first-login password | PA0, PA2 |
| **PA4** | Agency lifecycle, access operations, and audit console | PA3 |
| **PA5** | Migration rehearsal, hardening, pilot, and rollout | PA0-PA4 |

### PA0 - Account-realm split and tenant-scoped agency login

**Goal:** make personal, agency, and platform identities separate and make
agency accounts tenant-scoped.

**Scope:**

- User fields, validators, and partial unique indexes.
- Agency `slug` and `status`; public login-context lookup.
- Personal auth scoped to `accountType: 'personal'`.
- Agency auth service/routes: signin by workspace slug, me, logout, password,
  profile, and chat-key (agency trips already use the M7 E2EE chat, so agency
  accounts need their own keys).
- Platform account schema fields and shared password/token helpers; platform
  login itself lands in PA1.
- `protectPersonal`, `protectAgency`; account status, `tokenVersion`, and
  `mustChangePassword` enforcement.
- Agency routes switch from `protect` to `protectAgency`.
- Shared trip surface: `/api/itinerary/*` trip-scoped routes and generation
  move from `protect` to `protectSession`; collection routes stay
  `protectPersonal`.
- Realm-scoped email lookups in `services/auth.service.ts` (signup duplicate
  check and signin) - a personal signin must never resolve an agency account.
- CSRF: `verifyCsrf` treats every realm session cookie as a target and the
  exempt list gains the agency auth paths (platform paths in PA1).
- `AgencyMember` invariant: agency account only, same `agencyId`.
- Agency invites create/use tenant-scoped agency accounts, never personal
  accounts.
- Remove self-service agency creation from the API and UI. Until PA3, no new
  tenants can be created.
- Frontend `AgencyAuthContext`, `/agency/login`, agency route guard, no
  switcher.
- Migration script and fixture tests.

**Artifacts:**

- `backend/src/models/User.ts`, `backend/src/models/Agency.ts`,
  `backend/src/models/AgencyMember.ts`, `backend/src/models/AgencyInvite.ts`
- `backend/src/services/agency/auth.ts`, `backend/src/services/user/profile.ts`,
  `backend/src/services/auth.service.ts`
- `backend/src/middleware/auth.middleware.ts`,
  `backend/src/middleware/agencyAccess.middleware.ts`,
  `backend/src/middleware/csrf.middleware.ts`
- `backend/src/routes/auth.routes.ts`, `backend/src/routes/agency.routes.ts`,
  `backend/src/routes/itinerary.routes.ts`
- `backend/src/services/collab/routerCoverage.test.ts`
- `frontend/src/context/AgencyAuthContext.tsx`,
  `frontend/src/pages/agency/AgencyLogin.tsx`,
  `frontend/src/pages/agency/AgencyApp.tsx`,
  `frontend/src/pages/agency/AgencyInviteAccept.tsx`
- `scripts/migrate-account-realms.mts`

**Tests / exit criteria:**

- Same email can hold a personal account and one agency account per tenant.
- Duplicate personal, duplicate platform, and duplicate agency-within-tenant
  are rejected; same email in another tenant is accepted.
- Personal token cannot access `/api/agency/*`.
- Agency token cannot access `/api/auth/*`.
- Both personal and agency tokens reach `/api/itinerary/*` for trips they can
  access; a personal token still cannot reach an agency trip and vice versa.
- A cookie-authenticated agency mutation without the CSRF header is rejected.
- Wrong workspace slug or wrong tenant credentials fail with a generic error.
- Agency A cannot access Agency B by editing the URL.
- Disabling one account does not disable the other realm/tenant.
- Existing personal tests pass; agency route coverage tests use
  `protectAgency`.
- Migration fixture passes: no personal account remains referenced by an
  agency membership.

### PA1 - Platform account realm, admin login, and audit foundation

**Goal:** create the isolated internal admin realm and shell.

**Scope:**

- Platform accounts: `accountType: 'platform'`, `platformRole: 'super_admin'`.
- `/api/admin/auth/signin|logout|me|password`.
- `platform_token` cookie and `protectPlatform`.
- CSRF: add the `/api/admin/auth/*` signin/logout/csrf exemptions and confirm
  `platform_token` is in the verifier's session-cookie set.
- `/admin/login` and `PlatformAuthContext`.
- `/admin` shell with navigation and placeholder overview.
- Bootstrap CLI creates the first platform account with a temporary password
  and `mustChangePassword: true`.
- `PLATFORM_ADMIN_ENABLED` flag and health reporting.
- `PlatformAudit` model and best-effort writer.

**Tests / exit criteria:**

- Platform login works only for platform super-admins.
- Personal and agency credentials fail at `/admin/login`.
- Platform token fails on personal, agency, and shared trip routes.
- Personal and agency tokens are rejected by every `/api/admin/*` route.
- First login forces a password change.
- Flag off makes `/api/admin` and `/admin` unavailable.
- A cookie-authenticated admin mutation without the CSRF header is rejected.
- A platform account cannot be created through public signup.

### PA2 - Account directory and platform account management

**Goal:** let the platform admin see and manage personal, agency, and platform
accounts without mixing them.

**Scope:**

- Server-side list/search/filter/pagination for accounts.
- Personal tab, agency tab, platform tab; same email can return multiple rows.
- Account detail: realm, tenant, status, created, last login, memberships,
  recent audit.
- Disable/enable personal and agency accounts.
- Reset agency password (temp + forced change).
- Create/disable platform super-admins; last-admin guard.
- Audit every mutation.
- No tenant content or personal trip data.

**Tests / exit criteria:**

- Searching an email with personal and agency accounts returns both, with the
  correct realm/tenant labels.
- Disabling an agency account leaves the personal account usable.
- Disabling a personal account leaves the agency account usable.
- Last super-admin cannot be removed or demoted.
- Non-platform accounts receive 404 from `/api/admin/*`.

### PA3 - Agency provisioning and forced first-login password

**Goal:** onboard a paying agency tenant and give its owner a separate agency
login without touching any personal account.

**Scope:**

- Create-tenant wizard and API.
- Slug validation, uniqueness, and immutability.
- Plan, billing metadata, and tenant status.
- Owner agency-account lookup by `{ agencyId, email }`; create with temp
  password when absent.
- Existing personal/platform email warning; no conversion or attachment.
- Owner membership creation with compensating cleanup.
- Credential handoff dialog: workspace login URL, email, temp password, shown
  once.
- Forced first-login password page and backend gate.
- Remove `/agency/onboarding` and self-service creation.
- Audit `agency.created`, `agency.owner_assigned`, and credential reset.

**Tests / exit criteria:**

- Onboarding with an email that already has a personal account creates a new
  agency account and leaves the personal password and data untouched.
- Onboarding with an existing agency account for the same tenant attaches it
  instead of duplicating.
- Duplicate slug returns 409.
- Temp password signin is blocked from agency data until the password changes.
- After the change, the old agency token is invalid and the new session works.
- Partial failure does not leave an orphan tenant/account/membership.
- The owner can invite staff, and invite acceptance creates an agency account
  for the tenant, not a personal account.

### PA4 - Agency lifecycle, access operations, and audit console

**Goal:** operate a tenant end-to-end from the admin panel.

**Scope:**

- Agency list/detail: status, plan, usage, billing metadata, owner, members.
- Add/invite members, change roles, transfer owner, remove members.
- Change plan using the existing plan service.
- Suspend/reactivate tenant; enforce staff and public proposal behavior.
- Reset an agency account password.
- Audit viewer with filters.
- Platform + tenant audit writes for tenant-visible changes.
- Explicitly no billing gateway or tenant-content viewer.

**Tests / exit criteria:**

- Suspending a tenant blocks its agency logins and routes; personal accounts and
  other tenants continue to work.
- Public proposal links fail closed while suspended.
- Plan changes are reflected in usage and audited.
- The last owner cannot be removed.
- Admin can reset an agency password without changing the personal password.

### PA5 - Migration rehearsal, hardening, pilot, and rollout

**Goal:** ship safely to the first real agency.

**Scope:**

- Restore a staging copy; run the migration; verify counts and references;
  rehearse rollback.
- Audit E2EE chat keys and agency trip collaboration references.
- Security review: three login rate limits, CSRF, password policy, token-version
  invalidation, audit redaction, no secrets in logs.
- End-to-end tests for personal, agency, and platform realms.
- Load/pagination/index checks for the admin directory.
- Operations runbook: bootstrap platform admin, onboard tenant, hand off
  credentials, suspend/reactivate, reset password, kill switches, rollback.
- Pilot with one real agency.
- Update the agency operations runbook and A9 documentation.

**Exit criteria:**

- A real agency is onboarded without an engineer touching the database.
- No personal/agency/platform cross-realm access is possible.
- No cross-tenant agency access is possible.
- The personal product passes its existing regression suite.
- Migration and rollback are documented and rehearsed.
- The pilot owner can sign in, change the agency password, and invite staff.

---

## 10. Migration plan

### 10.1 Current state

Today there is one `User` collection with a globally unique email. Agency
memberships reference those personal users. Agency routes use the personal
session. Agency creation is self-service.

PA0 changes all three assumptions.

### 10.2 Preferred pilot migration: reset and re-seed

A9 is locally verified with a simulated pilot and no confirmed production
agency data. The lowest-risk cutover is:

1. Announce an agency-only maintenance window; personal product stays up.
2. Set `AGENCY_WORKSPACE_ENABLED=false`.
3. Back up the database.
4. Deploy PA0-PA3 schema and code with both flags off (PA0 removes
   self-service creation, so provisioning must arrive in the same cutover).
5. Backfill the schema and reset/re-seed agency test data.
6. Create the first platform admin via the bootstrap CLI.
7. Enable `PLATFORM_ADMIN_ENABLED`.
8. Onboard the pilot tenant through the admin panel.
9. Enable `AGENCY_WORKSPACE_ENABLED` and run smoke checks.

This avoids remapping E2EE chat keys and old agency ownership references.

### 10.3 Production-preserving migration

If agency data must be retained:

- Build a mapping keyed by `{ agencyId, personalUserId } -> agencyAccountId`.
- Create one agency account per tenant membership, with the same email and a
  separate password. For continuity, the existing bcrypt hash may be copied
  once and `mustChangePassword` set; otherwise generate a temporary password.
- Repoint `AgencyMember.userId`, `Agency.createdBy`, and all agency-owned
  `createdBy`/actor references.
- Remap agency trip members and collaboration records: comments, decisions,
  polls, read states, invites, expenses, and chat-key rows.
- Invalidate existing agency invites and reissue them.
- Audit E2EE chat: existing keys belong to the personal account. If private
  keys are only in browsers, old encrypted chat may not be readable by the new
  agency account. Reset/re-key or accept the loss explicitly.
- Validate that no agency-owned row references a personal account.
- Run the whole migration against a staging fixture and compare row counts and
  references before touching production.

The membership part is implemented as an explicit, non-destructive mode:

```bash
npm run migrate:account-realms -- --preserve-legacy-memberships --dry-run
npm run migrate:account-realms -- --preserve-legacy-memberships
```

It creates one separate agency account per `{ agency, personal user }`, copies
the existing bcrypt hash once with `mustChangePassword`, and repoints the
membership plus every agency-owned `createdBy`/actor/trip-member reference. No
rows are deleted, and re-running is a no-op. E2EE chat envelopes are deliberately
left untouched (see the note above), and the run warns when one exists.

**Do not ship a production-preserving migration without a staging rehearsal.**

### 10.4 Index migration

- Backfill `accountType`, `status`, `mustChangePassword`, and `tokenVersion` on
  existing users.
- Drop the old unique `email_1` index.
- Create the partial unique indexes for personal, platform, and agency.
- Backfill `Agency.slug` uniquely and `Agency.status='active'`.
- Add account/tenant indexes used by the admin directory.
- After memberships are repointed, drop the old `{ userId, createdAt }`
  switcher index and add the unique `AgencyMember.userId` index.
- Verify index creation succeeded before enabling the new login paths.

### 10.5 Session and invite cutover

- Personal `token` sessions remain valid; missing `ver` is treated as `0`.
- Agency users must sign in at the tenant workspace URL to receive
  `agency_token`.
- Invalidate old agency invites and reissue after migration.
- No platform sessions exist before PA1.

---

## 11. Security and audit

- Account type and tenant are immutable after creation.
- Every protected route is realm-scoped; no route accepts a token from another
  realm.
- Every agency query filters by `agencyId`; cross-tenant IDs return `404`.
- Platform admin is a separate realm and separate cookie; no personal or agency
  session can reach `/api/admin`.
- Platform admin visibility is metadata-only. No impersonation.
- Temporary passwords are random, hashed with bcrypt, shown once, never logged,
  and never stored in audit metadata.
- `mustChangePassword` is enforced server-side, not only in the UI.
- `tokenVersion` invalidates existing sessions on password change, disable, or
  admin reset.
- Login and invite-activation routes are rate-limited separately.
- CSRF protection applies to all cookie-authenticated mutations: the verifier
  treats `token`, `agency_token`, and `platform_token` as session cookies, so
  no realm can inherit a silent exemption.
- The last platform super-admin cannot be removed or demoted.
- Platform audit rows are append-only. Tenant audit rows remain tenant-scoped.
- Suspended tenants fail closed, including public proposal links.
- Admin panel actions are audited with actor, action, target, and non-secret
  metadata.

---

## 12. Testing strategy

### Unit

- Account schema: realm requirements, agencyId rules, immutable fields,
  platformRole rules.
- Partial unique indexes: same email allowed across realms/tenants; duplicates
  rejected within a realm/tenant.
- Realm-scoped email lookups: personal signin/signup never match an agency or
  platform account.
- Password and token-version flows per realm.
- Slug generation/uniqueness.
- Agency status and suspension rules.
- Platform role and last-admin guard.
- Migration mapping and reference cleanup.

### Route coverage

- Every personal route uses `protectPersonal`.
- Every agency route uses `protectAgency` and the workspace gate.
- Every shared trip route uses `protectSession` (the collab router coverage
  test keeps its trip-guard assertion).
- Every admin route uses `protectPlatform`.
- Public invite/proposal routes are explicitly allowlisted and tenant-checked.

### Integration

- Same email personal + agency + platform records.
- Wrong realm credentials rejected.
- Wrong workspace slug rejected.
- Agency A token cannot access Agency B.
- Agency token can read and edit an agency trip through `/api/itinerary`;
  personal tokens cannot reach that trip, and vice versa.
- A cookie-authenticated agency or platform mutation without the CSRF header
  is rejected with `403`.
- Disabled account and stale token rejected.
- Forced first-login password change.
- Agency invite creates an agency account for the invite's tenant, never a
  personal account.
- Admin onboarding with existing personal email leaves personal data/password
  untouched.
- Suspension blocks agency staff and public proposal links.

### End-to-end

- Personal signup, login, trip creation, collaboration, refresh.
- Agency login with workspace slug, tenant workspace, invite, password change.
- Platform login, onboarding, credential handoff, suspension, audit.
- Personal and agency sessions coexisting in one browser.

### Regression

- Existing personal backend tests.
- Existing agency A0-A9 behavior under the new auth.
- Frontend typecheck and production build.
- Migration fixture and staging rehearsal.

---

## 13. Rollout and operations

### Flags

- `AGENCY_WORKSPACE_ENABLED` - existing agency kill switch. Set false during
  the PA0 cutover.
- `PLATFORM_ADMIN_ENABLED` - new admin-panel kill switch, default false.
- `/api/health` reports both flags.

### Order

1. Freeze agency writes and set the agency flag false.
2. Back up the database.
3. Deploy PA0-PA3 with both flags off. Never stop between PA0 and PA3:
   PA0 removes self-service creation, so tenant provisioning is unavailable
   until PA3 lands.
4. Run the migration/backfill and index checks.
5. Create the first platform admin.
6. Enable the platform admin flag; onboard one pilot tenant.
7. Enable the agency flag; verify agency login and invites.
8. Monitor logs, audit events, and login failures.

### Rollback

- Disable both flags.
- Restore the pre-migration backup if schema/index migration is incomplete.
- Redeploy the previous release if the new auth paths fail.
- Reissue agency credentials after a rollback if accounts were created.

### Runbook additions

- Create the first platform admin.
- Create a tenant with a unique slug.
- Hand off agency login URL and temporary password.
- Force a first-login password change.
- Reset an agency password.
- Suspend/reactivate a tenant.
- Verify a personal account was not modified.
- Rotate the platform admin bootstrap credential.

---

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing agency data references personal IDs | High | Reset pilot data; otherwise use a tested mapping across all agency-owned collections |
| E2EE agency chat history tied to personal keys | High | PA0 gives agency accounts their own chat keys; pilot resets/re-keys; accept explicit loss only with sign-off |
| Agency users locked out by the new login | High | Maintenance window, credential handoff, admin reset, smoke test |
| Old unique email index blocks new accounts | High | Backfill, drop old index, create partial indexes, verify before enabling |
| Route guard missing a realm check | High | Coverage tests for every route and middleware |
| Shared trip routes accept the wrong realm | High | `protectSession` + the existing trip guard; tests prove a personal token cannot reach an agency trip and vice versa |
| A realm is missing from the CSRF verifier | High | `verifyCsrf` covers all three session cookies; agency and admin write tests assert `403` |
| Cross-tenant access through URL manipulation | High | Always filter by the account's `agencyId`; return 404 |
| Admin panel overexposes customer data | High | Metadata-only projections; no tenant content; audit |
| Slug collision or rename breaks login links | Medium | Unique generation; immutable after creation |
| Suspended tenant public links remain live | Medium | Fail closed; test proposal route |
| No email provider for credential handoff | Medium | Show-once admin dialog; document manual handoff |
| Multiple tenant accounts confuse users | Medium | Tenant-specific login URL on every handoff; explicit no-switcher UX |
| Platform admin bootstrap is mishandled | High | CLI-only creation, forced password change, last-admin guard, audit |

---

## 15. Definition of done

- PA0-PA5 are implemented and verified.
- A person can hold a personal account, an agency account in tenant A, an agency
  account in tenant B, and a platform account with the same email, all separate.
- Onboarding an agency with an existing personal email creates a separate
  agency account and leaves the personal account untouched.
- The owner signs in at the tenant workspace URL, changes the agency password,
  and reaches the tenant.
- Personal, agency, and platform sessions are isolated; cross-realm and
  cross-tenant access is denied.
- The platform admin can search accounts, onboard tenants, manage access, suspend
  a tenant, and review audit events.
- No tenant content or personal trip content is exposed in the admin panel.
- Migration and rollback are rehearsed in staging.
- The operations runbook and agency documentation are updated.
- One real pilot agency is onboarded without manual database work.

---

## 16. Follow-up documents

- `docs/platform-admin-test-plan.md` *(to be created)* - PA0-PA4 acceptance and
  security matrix.
- `docs/agency-identity-migration.md` *(to be created)* - migration mapping,
  reference checklist, E2EE decision, and rollback.
- `docs/adr/0002-account-realms.md` *(to be created)* - record the realm,
  tenant-scoped agency, shared trip surface, and platform-admin decisions.
- `docs/agency-operations-runbook.md` - updated: §3 carries the planned-change
  note; finish the replacement when PA3 ships.
- `docs/roadmap-agency-workspace.md` - updated: account-model note and the
  platform-admin onboarding decision.
