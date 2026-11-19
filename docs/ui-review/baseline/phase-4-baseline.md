# UI baseline — Phase 4

**Recorded:** 2026-11-18
**Scope:** Phase 4 (C-07 one destructive/privileged action model, C-08 password,
reset and recovery).
**Status:** Source-level verification passes and the phase is implemented. The
live browser pass (dialogs in light/dark, password-manager behaviour, a real
delete-request round trip) has not been run yet; see **Open checks**.

This file is the evidence record for the Phase 4 exit gate in
`docs/ui-review/implementation-plan.md`. Re-run the commands before changing the
confirm primitive, the auth surfaces or the platform-admin dialogs.

## Decisions applied

| ID | Decision | Consequence |
|---|---|---|
| D-E | 8/64 password policy with strength feedback, optional name, no confirm-password | The same policy is enforced on the server and mirrored in the web and mobile clients; sign-in stays "required" so existing shorter passwords still work. |
| D-F | Delete account is a support-queue request, not self-serve deletion | Nothing is removed on click. One open request per account, an audit row for operators, and the owner keeps full access until a human confirms. |

## Evidence

### C-08 — password, reset and recovery

| Done-when item | Where | Behaviour |
|---|---|---|
| Dead reset link rejected before the form | `frontend/src/pages/ResetPassword.tsx`, `backend/src/routes/auth.routes.ts` | The page calls `POST /api/auth/reset-password/validate` on mount. `resetLinkFailureState` maps 400/410 to **invalid** (with "Send a new link") and anything else to **retry**; password fields render only after a valid preflight. The route is anonymous by design — the token is the credential — and never claims the token. |
| One password policy on every surface | `backend/src/services/auth/passwordPolicy.ts`, `frontend/src/lib/passwordPolicy.ts`, mobile mirror | 8–64 characters; `PasswordStrength` gives a text label plus the requirement list, not colour alone. |
| Shared reveal control | `PasswordInput` | Eye toggle with `aria-pressed` and an accessible name; used on sign-up, sign-in, reset, Profile and platform-admin dialogs. |
| Optional name, no confirm-password, no duplicate mode switch | `frontend/src/pages/Auth.tsx` | Name is optional; one password field with reveal replaces the two-field confirm; sign-in/sign-up is a single labelled flow. |
| Reset lands authenticated via SPA navigation | `frontend/src/pages/ResetPassword.tsx`, auth context | The reset response updates the auth context, then `navigate('/dashboard')` — no document reload. |
| Forgot-password recovery | `frontend/src/pages/ForgotPassword.tsx` | Keeps the email, offers **Send again** with a cooldown, **Use a different email**, and a spam-folder hint. |
| Working delete-account path | `backend/src/models/AccountDeletionRequest.ts`, `services/auth/deletionRequests.ts`, `controllers/accountDeletion.controller.ts`, `frontend/src/pages/Profile.tsx` | `GET/POST /api/auth/account-deletion-request`. POST queues once (partial unique index on pending rows), snapshots the address, writes `account.deletion_requested` to the platform audit, and answers 202/200. Profile shows "Request pending" with the date instead of a disabled button, and the confirm names the account plus a typed email phrase. |
| Wrong-account invite recovery | `frontend/src/pages/InviteAccept.tsx` | "Sign out and continue with {invitedEmail}" signs out, keeps the token in `sessionStorage`, and returns to `/invite/:token` with the invited address prefilled. |
| Inviter's display name | `GET /api/invites/:token` projection + `InviteAccept` | The preview carries `invitedBy` (a display name), not the email local-part. |
| `consentRequired` is honoured | `/api/auth/config`, `Auth.tsx` | The sign-up form reads the config document and only shows the consent row when the server asks for it. |

Files added this phase: `frontend/src/components/ui/confirm-destructive.tsx`,
`backend/src/models/AccountDeletionRequest.ts`,
`backend/src/services/auth/deletionRequests.ts`,
`backend/src/controllers/accountDeletion.controller.ts`,
`backend/src/services/auth/deletionRequests.test.ts`.

### C-07 — one destructive/privileged action model

`ConfirmDestructive` is the only confirmation recipe. Contract:

| Prop | Rule |
|---|---|
| `title` | Names the object ("Remove this member?", "Delete “Goa…”?") — never "Are you sure?" |
| `description` | States the consequence in plain language. |
| `detail` | Optional target chip: email, role, quote number, slug, amount. |
| `confirmLabel` | A specific verb ("Revoke invite", "Issue temporary password"). |
| `cancelLabel` | Neutral; never "No". |
| `tone` | `destructive` (rose) or `warning` (amber) — legacy destructive styling mapped onto tokens. |
| `typedConfirmation` | Trimmed, case-insensitive phrase match; the confirm button stays disabled until it matches. |
| `busy` / `error` | The dialog cannot be dismissed mid-request and errors render in place. |
| `children` | Extra controls, e.g. the optional deletion reason. |

Adopted in every realm:

| Realm | Surfaces migrated |
|---|---|
| Traveller | Trip soft delete and permanent purge (`MyTripsView`), leave/transfer/remove/revoke/block (`TripMembers`), activity delete (`DayTimeline`), expense delete (`ExpenseTracker`), stay/food removal (`StayAndCuisine`), message removal and chat reset (`CommentsTab`), version restore (`TripVersions`), stop sharing / unpublish (`ShareExportModal`), wizard reset (`TripPlanner`), account deletion request (`Profile`) |
| Agency | Remove member, promote to owner, revoke invite (`AgencyTeam`), remove client (`AgencyClients`), cancel quote (`AgencyQuotePanel`), remove asset/font (`AgencySettings`), archive template version (`TemplateManagerDialog`), delete event (`AgencyEvents`), delete package (`AgencyPackagePanel`), unpublish directory profile (`DirectoryProfileEditor`) |
| Platform admin | Suspend/reactivate tenant, remove member, reset workspace password, transfer ownership (`AdminAgencyRecord`), disable/enable account, reset password (`AdminAccounts`), disable/enable platform admin (`AdminPlatformAdmins`), de-list/restore/dismiss reports (`AdminReports`), approve application (`AdminApplications`) |

Ownership changes:

- `owner` was removed from every inline role select. Promotion to owner runs
  through a warning dialog with a typed confirmation; transfer requires the new
  owner's email typed into the field.
- Tenant transfer in the platform console requires the target email typed before
  **Transfer owner** enables.
- Removing the last owner stays disabled server- and client-side.

`window.confirm` remains in exactly one place:
`TemplateSourceEditorDialog.tsx` discards unsaved HTML changes, which the plan
explicitly reserves for native confirm (an unsaved-change guard, not a data
destructive action).

Undo paths added:

- Soft-deleting a trip shows "Trip moved to Recently deleted." with an **Undo**
  action that restores it (`Dashboard.tsx`).
- Changing an agency member's role shows an **Undo** action that applies the
  previous role (`AgencyTeam.tsx`).

## Commands run

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | pass |
| `npm run test:auth-policy` (frontend) | **11 pass** |
| `npm run ui:contrast` | pass — every declared text pair in traveller/agency light+dark and admin dark |
| `npm run build` (frontend) | pass |
| `npx eslint` on every touched file | only pre-existing `no-explicit-any` errors in untouched `catch` blocks; new/shared files clean |
| `npx tsc --noEmit` (backend) | pass |
| `npm test` (backend) | **1134 pass, 0 fail** (~2.5 min) |
| `npx tsx --test src/services/auth/deletionRequests.test.ts` (backend) | **7 pass** |

`deletionRequests.test.ts` pins: first request snapshots the account and writes
one audit row; reasons are trimmed and capped at 500 characters; a second
request reuses the open row with no duplicate audit; a duplicate-key race
returns the winner; only an active personal account can request; the projection
exposes status/date/reason only; no open request answers `null`.

`realmCoverage.test.ts` needed one allowlist update: the reset preflight
(`/reset-password/validate`) is intentionally anonymous, like `/reset-password`,
because the token in the body is the credential. The guard-coverage test now
enumerates all three anonymous reset routes.

## Exit gate mapping

| Gate | Evidence |
|---|---|
| Expired reset link rejected before the form | Preflight on mount; invalid vs retry states; no password fields until valid |
| Password managers save, fill and update correctly | One labelled password input with `autoComplete` hints (`new-password` / `current-password`) on every surface; **not yet browser-verified** |
| Reset lands on `/dashboard` authenticated without reload | Auth context update + `navigate`, no `window.location` reload |
| Same 8/64 policy and strength feedback on all five surfaces | Shared server policy; mirrored client modules; `PasswordStrength` on sign-up, reset, Profile, platform-admin change |
| Wrong-account invite has one-click recovery preserving the token | `handleSwitchAccount` keeps the token in `sessionStorage` and returns to the invite |
| Delete-request path is reachable and does something real | Profile POST queues a real request, shows pending status, and writes an audit row |
| Transfer owner cannot complete on a single click | Typed target email in agency team, trip members and platform admin transfer |
| No destructive action from one stray click without recovery | Every confirmation names the object and consequence; reversible actions carry Undo |
| Every destructive dialog names target and consequence | Inventory table above; `detail` carries the target chip |
| Same destructive component in all realms | `AlertDialog` is now imported only by `confirm-destructive.tsx`; 23 files use the primitive |

## Open checks

These need a browser session or a controlled failure, not more source reading.

1. **Live dialog pass** — open each realm (traveller trip, agency workspace,
   platform console) and confirm focus lands in the dialog, Escape and Cancel
   close it, busy state blocks dismissal, and light/dark contrast holds.
2. **Password-manager round trip** — save, autofill and update on sign-up,
   reset, Profile and the platform-admin temporary-password dialog.
3. **Delete-request smoke** — submit once, reload Profile, confirm "Request
   pending" and that a second POST does not create a second row; then clean the
   dev row.
4. **Typed confirmation on mobile widths** — the input and hint must not overflow
   the dialog at 390px (the primitive uses `break-all` for the phrase).
