# Agency Workspace A1 - test and verification plan

**Scope:** agency tenancy, onboarding, team roles and invites. Barriers such as
`AGENCY_WORKSPACE_ENABLED=false` and the personal product are covered by A0.

## Automated coverage

`npm run verify` runs the backend suite, backend build, frontend typecheck and
frontend production build. A1 adds these backend suites:

| Suite | What it protects |
| --- | --- |
| `backend/src/routes/agency.routes.test.ts` | Whole-namespace feature gate; expected route table; authentication on every non-status route; tenant guard on every `/:agencyId` route; admin rank for team/settings/invite management. |
| `backend/src/services/agency/access.test.ts` | Role rank, 404-vs-403 behavior, owner-only promotion, last-owner protection, invite schema (never `owner`, email binding, max uses). |
| `backend/src/services/agency/models.test.ts` | Unique `(agencyId, userId)` membership index, unique token hash, TTL expiry and owner invite-role rejection. |
| `backend/src/services/agency/invites.test.ts` | 256-bit URL-safe tokens, sha256 at rest, agency invite link path, expiry/revocation/exhaustion predicate, no token/hash in projections. |

The existing individual trip, collaboration, auth, chat and security suites stay
unchanged and green.

## Local tenant smoke run

The local smoke run used a disposable MongoDB database and the real HTTP stack
with `AGENCY_WORKSPACE_ENABLED=true`. It asserted:

- agency creation makes the caller the sole owner;
- a personal user gets a 404 on a tenant route and sees no memberships;
- email-bound invites reject a different account before consuming a use;
- an invited planner can preview and accept; a single-use token cannot be
  reused;
- a planner is refused the admin-only pending-invite list;
- the last owner cannot be demoted or removed; once a second owner exists, the
  first owner can step down;
- a second agency is invisible to non-members, and its roster contains only its
  own members;
- revoked invites cannot be accepted; admins cannot demote owners; admins can
  update the agency profile.

The disposable users, agencies, memberships and invites were removed after the
run. No production data was touched.

## Manual browser checklist

1. Start with `AGENCY_WORKSPACE_ENABLED=false`: `/agency` shows the disabled
   state, no Agency link appears, and `/api/agency/status` is 404.
2. Enable the flag and sign in. The personal navbar gains an **Agency** link;
   personal trips are unchanged.
3. Open `/agency` as a new user: complete the three-step onboarding, create the
   agency, copy the first invitation, and reach the team page.
4. Sign in as a second account, open the invite link, accept, and confirm the
   agency switcher shows the correct role.
5. As owner/admin: invite a planner, revoke a pending invite, change a role and
   remove a non-owner. Confirm the last owner's role/remove controls are
   disabled and the server returns 409 if forced.
6. As planner/viewer: the team roster is visible but invite and role controls
   are hidden; direct `/api/agency/:id/invites` calls return 403.
7. Sign in as a member of two agencies and switch tenants; confirm trips,
   members and branding do not bleed between them.
8. Check the browser console for CSP/CORS errors and confirm no agency request
   is made while the flag is off.

## Known A1 boundaries

- Invite email delivery is manual: the copied link is the v1 delivery channel.
- Logo upload and full document branding are deferred to the branding/export
  milestones; A1 stores brand colours and contact basics.
- The UI does not expose self-leave or ownership transfer; the API permits
  owners to step down/remove themselves only when another owner remains.
- Trips, clients, quotes and PDF exports are deliberate A2+ surfaces.
