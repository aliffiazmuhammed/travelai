# Phase 2 — Authentication and account entry

## Scope and evidence

**Routes in scope**

| Route | Page | Auth state |
|---|---|---|
| `/auth` | `frontend/src/pages/Auth.tsx` | Anonymous; redirects signed-in users |
| `/forgot-password` | `frontend/src/pages/ForgotPassword.tsx` | Anonymous |
| `/reset-password/:token` | `frontend/src/pages/ResetPassword.tsx` | Token-bearing, becomes signed in |
| `/invite/:token` | `frontend/src/pages/InviteAccept.tsx` | Redirects anonymous users through `/auth` |
| `/profile` | `frontend/src/pages/Profile.tsx` | Protected |

**Shared code read**

- `components/ProtectedRoute.tsx`, `components/Navbar.tsx`, `components/profile/ChatRecoverySettings.tsx`, `components/traveller/TravellerBreadcrumbs.tsx`
- `context/UserContext.tsx`, `lib/authConfig.ts`, `lib/avatar.ts`, `services/api.ts`
- UI primitives: `ui/button.tsx`, `ui/input.tsx`, `ui/label.tsx`, `ui/card.tsx`, `ui/checkbox.tsx`, `ui/avatar.tsx`
- Tokens and typography: `src/index.css`, `tailwind.config.ts`, `index.html`
- Intended behaviour: `docs/auth-modernization-plan.md`, `docs/auth-modernization-tickets.md`, `docs/auth-phase-0-decisions.md`
- Server contracts used only to verify UI claims: `backend/src/services/auth/passwordReset.ts`, `backend/src/schemas/auth.schema.ts`, `backend/src/schemas/profile.schema.ts`, `backend/src/services/collab/invites.ts`

**Evidence limits**

This phase was audited from source only. No browser tooling was run and no screenshots were inspected, so every finding below is labelled **code-based**. The repository contains `docs/auth-baseline/`, but those captures were not used to make visual claims. The audit covers form semantics, state logic, accessible names/descriptions, responsive classes, token flow, copy, and the server behaviour the UI promises. Contrast ratios were not measured; colour findings are limited to hard-coded palettes and token usage.

**Overall:** the personal realm has a coherent editorial auth shell, unusually candid copy, and better-than-average consent and invite preview design. The main weaknesses are in failure recovery: weak password rules, focus not following validation errors, reset links failing only after two password entries, and password-manager semantics that are not wired end to end. No Critical defect was found; the four High findings are trust and accessibility blockers rather than total outages.

---

## Scorecard

| Area | Score | Evidence |
|---|---|---|
| Visual hierarchy and typography | 3 | Desktop split screen (`Auth.tsx:162-202`) gives a clear editorial/entry hierarchy. The form title is a `CardTitle` rendered as `<h3>` (`Auth.tsx:249`; `ui/card.tsx:17-21`), while the only `<h1>` is decorative copy in a panel that is `hidden` below `lg` (`Auth.tsx:164,191`). Helper and metadata text repeatedly drops to 10–12px (`Profile.tsx:710,969,1169`; `Auth.tsx:300-306`). Cabin is still the global font (`index.html:21-27`; `tailwind.config.ts:16-19`), contrary to the Manrope/Newsreader brand direction in `auth-phase-0-decisions.md:27`. |
| Layout and spacing consistency | 3 | The same 440px card, 48/52 split, logo treatment, and footer divider are reused across `/auth`, `/forgot-password`, and `/reset-password`, so the family reads as one system. But that shell is copy-pasted three times (`Auth.tsx:162-202`; `ForgotPassword.tsx:48-86`; `ResetPassword.tsx:58-96`), and `/auth` has two mode switches (`Auth.tsx:219-246,452-465`). Profile mixes many small control heights and radii (`h-8`, `h-9`, `h-10`, `h-11`, `rounded-lg/xl/2xl/full`). |
| Brand distinctiveness | 3 | The desktop photo panel, reverse wordmark, radial scrim, and travel-led copy are distinctive and on-brand (`Auth.tsx:164-199`). Below `lg` the panel disappears and the page becomes a logo above a generic white card. Invite acceptance keeps a stronger brand moment with the dotted-grid hero (`InviteAccept.tsx:200-211`). |
| Content clarity and IA | 3 | Copy is specific and human (“Pick up your trips, chats and enquiries…”), the invite role explanation is excellent (`InviteAccept.tsx:41-69,298-313`), and consent is explicit (`Auth.tsx:394-433`). Reset success has no resend or edit-email path, the duplicate mode switch competes with the tabs, and the delete-account section is inert. |
| Interaction quality and feedback | 2 | Loading labels and disabled states exist throughout, but focus never moves to the first invalid field (`Auth.tsx:120-123`), reset server errors are not live-announced (`ResetPassword.tsx:150-163`), there is no reveal toggle on sign-in/reset, and password reset offers no retry after the success state. |
| Responsive behaviour | 3 | The grid collapses cleanly, the form is capped at 440px, and long invite titles use `break-words`/`text-balance`. Mobile loses the photo/brand moment and some Profile/Invite controls fall below 44px (`Profile.tsx:704,1080,1208`; `InviteAccept.tsx:344-351`). Auth inputs are 44px (`h-11`), not the 48px target in the auth plan. |
| Accessibility | 2 | Auth fields have `aria-invalid` and `aria-describedby` (`Auth.tsx:296-298,321-322`), Profile tabs implement roving tabindex and Arrow/Home/End (`Profile.tsx:450-462,630-648`), and most links have visible focus rings. Against that: no `<h1>` on mobile auth pages, no focus management after failed submit, missing live region on reset errors, detached Profile form errors, 10px metadata, and sub-44px controls. |
| Performance risk | 2 | `/auth`, `/forgot-password`, and `/reset-password` each request the same remote 1400px Unsplash image with `loading="eager"` (`Auth.tsx:21-22,164-171`; `ForgotPassword.tsx:11-12,49-56`; `ResetPassword.tsx:11-12,59-66`). The image sits in a `hidden lg:block` aside, but browsers generally still fetch `<img>` elements in a `display:none` subtree, and there is no responsive source set or local fallback. Route-level lazy loading is otherwise good (`App.tsx:15-37`). |

---

## Prioritised findings

### [P2-01] High — Password policy is still six characters and guidance appears only after failure
- **Location:** `frontend/src/pages/Auth.tsx:105`; `frontend/src/pages/ResetPassword.tsx:31`; `frontend/src/pages/Profile.tsx:576`; `backend/src/schemas/auth.schema.ts:23,38`; `backend/src/schemas/profile.schema.ts:85`
- **Evidence:** All three client checks use `password.length < 6`; the server mirrors the same floor. The only pre-submit hint is `placeholder="••••••••"`, while the requirement is revealed as an error after submit. The agreed direction in `docs/auth-phase-0-decisions.md:15` is an 8-character minimum with passphrases allowed and common passwords blocked, and `auth-modernization-tickets.md:41-46` assigns strength/requirements feedback to the web sign-up form. No password-strength component exists in `frontend/src`.
- **User impact:** New accounts can be created with weak credentials at the exact moment users are most willing to follow guidance. Users who choose a longer passphrase get no confirmation that it is supported, and every password change repeats the same trial-and-error.
- **Recommendation:** Centralise an 8/64 policy on the server, keep sign-in at “required” so existing accounts still work, and show a persistent requirements/strength line under every new-password field. Reuse one component on sign-up, reset, and Profile. Prefer a text label (“Strong — 14 characters”) over colour alone.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P2-02] High — Validation and server errors do not move focus or reliably announce themselves
- **Location:** `frontend/src/pages/Auth.tsx:84-123,261-284`; `frontend/src/pages/ForgotPassword.tsx:27-34`; `frontend/src/pages/ResetPassword.tsx:39-42,150-163`; `frontend/src/pages/Profile.tsx:834-838,975-979`
- **Evidence:** `handleSubmit` builds a field-error map and returns (`Auth.tsx:120-123`), but focus stays on the submit button and no error summary receives focus. The auth server banner has `role="alert"` (`Auth.tsx:262`), yet `ResetPassword` uses the same visual pattern without a role or live region (`ResetPassword.tsx:150-163`). Profile collapses password and handle/bio failures into one paragraph at the bottom (`Profile.tsx:834-838,975-979`) with no `aria-invalid` or `aria-describedby` on those inputs; the `PasswordField` primitive has no error prop at all (`Profile.tsx:73-115`). This contradicts the project’s own acceptance criterion to focus the first invalid field (`docs/auth-modernization-tickets.md:48`).
- **User impact:** Keyboard and screen-reader users submit, hear nothing change, and have to hunt backwards through the form. On mobile, the relevant error can be above the current viewport. Profile users cannot tell whether the current password, new password, confirm field, handle, or bio caused the failure.
- **Recommendation:** Add a shared submit helper that focuses the first invalid control, binds `aria-invalid`/`aria-describedby` per field, and focuses the server-error summary. Add `role="alert"` to reset errors. Give `PasswordField` an error slot and use per-field error maps in Profile.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P2-03] High — An expired reset link is only discovered after the user chooses and confirms a password
- **Location:** `frontend/src/pages/ResetPassword.tsx:45-52,55,138-147`; `backend/src/services/auth/passwordReset.ts:87-97`
- **Evidence:** The page has no token validation on mount. `unusable` only checks whether the route parameter is empty (`ResetPassword.tsx:55`), which cannot happen with the registered `/reset-password/:token` route. The form renders immediately; the token is first checked when `api.resetPassword` is posted (`ResetPassword.tsx:46`), and the server resolves the token after validating the new password (`passwordReset.ts:87-97`). The error state then says “This reset link is invalid or has expired.”
- **User impact:** A user arriving from an old email types a new password twice, submits, and only then learns the link is dead. This is the highest-friction possible moment in account recovery and often sends users back to the inbox without a clear next step.
- **Recommendation:** Add a token-preview/introspection endpoint and check it on mount, rendering an explicit expired/invalid state with “Send a new link” before showing the form. At minimum, call the preview endpoint before rendering the password fields and keep the email address for a one-click re-request.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P2-04] High — Password-manager and autofill semantics are inconsistent and partly wrong
- **Location:** `frontend/src/pages/Auth.tsx:313-323,343-353,364-374`; `frontend/src/pages/ResetPassword.tsx:167-182,192-206`; `frontend/src/pages/Profile.tsx:904-912`
- **Evidence:** Email is `autoComplete="email"`, not `username`, on a form where email is the login identifier. None of the auth inputs has a `name` attribute, which weakens password-manager heuristics. The reset form contains only two `new-password` fields and no username/hidden email field, so managers cannot tell which credential to update. Conversely, Profile’s public traveler handle is marked `autoComplete="username"` (`Profile.tsx:910`), even though it is not a login identifier.
- **User impact:** Sign-in and sign-up are less reliably offered for autofill, resets are not offered as “update saved password”, and a password manager may try to fill or save a public handle as an account username. This is especially damaging on mobile, where users rely on the password manager rather than typing.
- **Recommendation:** Use `autocomplete="username"` on the email field, add stable `name` attributes, add a hidden/prefilled username field on reset when known, keep `current-password`/`new-password` on the right controls, and remove `autoComplete="username"` from the public handle.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-05] Medium — The auth shell loads a remote 1400px photo on every route, including mobile where it is never shown
- **Location:** `frontend/src/pages/Auth.tsx:21-22,164-171`; `frontend/src/pages/ForgotPassword.tsx:11-12,49-56`; `frontend/src/pages/ResetPassword.tsx:11-12,59-66`
- **Evidence:** The same hard-coded Unsplash URL (`w=1400&q=80`) is duplicated in three pages and rendered with `loading="eager"`. The `<aside>` is `hidden lg:block`; there is no conditional render, `<picture>` media query, local fallback, or width/height source set. Login is the first paint of a new session, so this is also a third-party request carrying the user’s IP and referrer.
- **User impact:** Mobile visitors pay bandwidth and connection time for an image they cannot see, competing with the form and any font/JS work. If Unsplash is slow or blocked, desktop users see an empty dark panel; no local asset exists. Privacy-conscious users make an unnecessary third-party request on an authentication page.
- **Recommendation:** Bundle a local AVIF/WebP hero with responsive `srcset` and render the photo panel only at `lg` and above (or use `<picture>` with a media query). Add a CSS fallback background. Share one auth-shell component so the asset and scrim are defined once.
- **Effort:** M
- **Confidence:** High (remote dependency and eager load); Medium (mobile download of the hidden `<img>` varies by browser)
- **Basis:** code-based

### [P2-06] Medium — Sign-in and reset have no password reveal, while Profile already has one
- **Location:** `frontend/src/pages/Auth.tsx:343-353`; `frontend/src/pages/ResetPassword.tsx:167-182,192-206`; `frontend/src/pages/Profile.tsx:73-115`
- **Evidence:** Profile implements an eye/eye-off toggle with `aria-label`, `aria-pressed`, and a 32px hit area (`Profile.tsx:99-111`). Auth and Reset use plain `type="password"` inputs, and Reset adds a confirm field, doubling the chance of a masked typo.
- **User impact:** Mobile users cannot verify what they typed, especially on a new password with no confirm-free path. The inconsistency also makes the product feel assembled from different form systems.
- **Recommendation:** Extract Profile’s `PasswordField` into a shared `PasswordInput` with reveal, expose it in Auth and Reset, and keep the toggle’s accessible name changing between “Show password” and “Hide password”.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-07] Medium — Sign-up asks for more than the account policy requires and offers two competing mode switches
- **Location:** `frontend/src/pages/Auth.tsx:93-95,219-246,361-381,452-465`; `backend/src/schemas/auth.schema.ts:15-21`; `docs/auth-phase-0-decisions.md:23-25`
- **Evidence:** The form requires a name (`Auth.tsx:93-95`), although the server schema marks it optional and the decision log recommends optional everywhere. The sign-up form also requires a confirm-password field while the product decision recommends removing it in favour of a reveal toggle. The page offers top tabs (`Auth.tsx:219-246`) and a second “New to waytowalk? / Already have an account?” switch at the bottom (`Auth.tsx:452-465`).
- **User impact:** Every extra required field and duplicate decision adds friction at the highest-drop-off step, and the two switches create two paths to the same state, which can confuse keyboard and screen-reader navigation. Name-required also diverges from mobile and from what the backend actually accepts.
- **Recommendation:** Follow D-09/D-10/D-11: keep the top tabs, replace the bottom switch with trust/legal content, make the name optional with the existing agency-reply hint, and remove confirm-password once a reveal toggle is in place.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-08] Medium — Mobile auth pages have no page-level heading; the form title is an `<h3>`
- **Location:** `frontend/src/pages/Auth.tsx:164,191,249`; `frontend/src/pages/ForgotPassword.tsx:76,104`; `frontend/src/pages/ResetPassword.tsx:86,114`; `frontend/src/components/ui/card.tsx:17-21`
- **Evidence:** `CardTitle` renders `<h3>`, so “Welcome back”, “Reset your password”, and “Choose a new password” are third-level headings. The only `<h1>` on each page is the marketing headline inside the photo `<aside>`, which is `hidden lg:block`. Below `lg`, the document therefore has no `<h1>`, and on desktop the heading outline starts with decorative copy rather than the page’s task.
- **User impact:** Screen-reader users navigating by headings cannot identify the page’s purpose on mobile; on desktop they hear a marketing headline as the page title. This is a straightforward semantic accessibility defect on the most important entry flow.
- **Recommendation:** Render one visible `<h1>` for the form state (“Sign in”, “Create your account”, “Reset your password”, “Choose a new password”), and demote the photo-panel headline to a `<p>` or `<h2>`. Either let `CardTitle` accept `asChild`/`as` or place an `sr-only`/visible `h1` above the card.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-09] Medium — Account and invite controls fall below touch-target and readable-text minimums
- **Location:** `frontend/src/pages/Profile.tsx:640,690,704,710,1080,1208`; `frontend/src/pages/InviteAccept.tsx:344-351`; `frontend/src/components/traveller/TravellerBreadcrumbs.tsx:24`
- **Evidence:** Profile tab pills use `py-2 text-xs` (`Profile.tsx:640`), “Change photo” is `h-9` (36px, line 690), “Remove photo” is `px-1.5 py-0.5` (line 704), “Unblock” and “Open conversation” are `h-8` (32px, lines 1080, 1208), and several helpers/metadata use `text-[10px]`/`text-[11px]` (lines 710, 969, 1169). Invite’s “No thanks” is `py-2.5 text-xs` (`InviteAccept.tsx:344-351`). Breadcrumbs are 11px.
- **User impact:** On phones, these controls are hard to hit accurately and the smallest text is hard to read, particularly for older travellers and low-vision users. Destructive-adjacent actions (“Remove photo”, “Unblock”) are also the smallest controls on the page.
- **Recommendation:** Raise interactive controls to at least 44×44px (including the password eye toggle and invite decline), use 14px for primary helper text and 12px as the absolute floor for metadata, and increase Profile tab height. Keep destructive actions visually secondary but not physically tiny.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P2-10] Medium — The Account tab overloads identity, password, and a stateful chat-recovery console
- **Location:** `frontend/src/pages/Profile.tsx:797-857`; `frontend/src/components/profile/ChatRecoverySettings.tsx:301-351,384-405,407-478`
- **Evidence:** The Account tab contains account details, photo upload, name/email, password change, and then the full `ChatRecoverySettings` card inside the same scrolling column. That card exposes different action sets per status (“Set up chat backup”, “Unlock chat backup”, “Use recovery code”, “Replace recovery code”, “Check again”, “Back up readable history”, “Pause”, “Retry backup check”) with security-sensitive copy. “Replace recovery code” calls `prepare(false)` immediately, with no confirmation (`ChatRecoverySettings.tsx:387-395`).
- **User impact:** Users looking for a simple setting must parse encryption terminology and eight state-dependent buttons. The absence of confirmation around replacing a recovery code can leave users without a code they had saved, and the density hides the password form most people came for.
- **Recommendation:** Split the Account tab into “Profile”, “Sign-in & password”, and “Advanced: chat backup”. Put chat recovery behind a disclosure or a separate settings subpage, summarise its current status in one line, confirm “Replace recovery code” with an explicit warning, and keep the recovery code copy/download action prominent.
- **Effort:** M
- **Confidence:** Medium
- **Basis:** code-based

### [P2-11] Medium — Email-bound invite mismatches are a dead end with no account-switch action
- **Location:** `frontend/src/pages/InviteAccept.tsx:274-281,315-325,344-351`
- **Evidence:** When `preview.emailBoundTo` differs from `user.email`, the Accept button is removed entirely and replaced by a paragraph instructing the user to “Sign in with the invited email” (`InviteAccept.tsx:315-325`). There is no “Sign out and switch account”, no link to `/auth`, and no explanation of whether the current session will be preserved. The only exit is the general Navbar logout (`Navbar.tsx:301-310,452-461`). “No thanks” is a 12px text button (`InviteAccept.tsx:344-351`) and the error state’s critical message is also 12px (`InviteAccept.tsx:230`).
- **User impact:** A traveller who opens the invite on a shared or previously used device reads the instruction but has no clear next action on the card. They may abandon the invite, or log out without knowing the token is remembered, and the person who invited them sees nothing happen.
- **Recommendation:** Add an inline primary action such as “Sign out and continue with {invitedEmail}”, preserving the token through `sessionStorage`/`state.from`; alternatively offer “Use a different account”. Keep the email-mismatch explanation but make the recovery path one click. Raise the decline target to 44px and the error text to at least 14px.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-12] Medium — Forgot-password success has no resend, edit-email, or deliverability help
- **Location:** `frontend/src/pages/ForgotPassword.tsx:105-127,178-193`
- **Evidence:** After a successful request the form is replaced by “Check your inbox”, the server message, and a single “Back to sign in” button. The copy says “If it expires, you can ask for another” (`ForgotPassword.tsx:109`), but there is no “Send again” control and no reminder to check spam. The only path to another request is back to `/auth` and then through “Forgot password?” again, with the email lost.
- **User impact:** A typo in the address, a delayed email, or a spam-filtered message leaves the user at a terminal screen with no direct recovery. They must reconstruct the flow and retype the address, which is exactly when users give up.
- **Recommendation:** Keep the submitted email in state, add “Send again” with a cooldown and a status message, add “Use a different email” to return to the form prefilled, and include a short “Check spam or promotions” line. Consider showing the masked address that received the link.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-13] Medium — Delete account is an inert disabled button with no alternative request path
- **Location:** `frontend/src/pages/Profile.tsx:1262-1290`
- **Evidence:** The section honestly says deletion “isn't self-serve yet, so the button stays off for now” and renders a permanently disabled “Delete account” button (`Profile.tsx:1281-1288`). No support link, privacy-request route, email address, or retention explanation is offered.
- **User impact:** A user who wants their data removed has no actionable route in the product. The disabled control advertises a capability that does not exist, which erodes trust at the point where trust matters most. It also creates a likely GDPR/consumer-rights gap.
- **Recommendation:** Until self-serve deletion ships, replace the disabled button with a working “Request account deletion” link to support/privacy contact and state the expected response time and what will be removed. When the flow ships, use a typed confirmation and re-authentication rather than a single click.
- **Effort:** S (interim) / L (full deletion flow)
- **Confidence:** High
- **Basis:** code-based

### [P2-14] Low — Invite preview identifies the inviter by email local-part only
- **Location:** `frontend/src/pages/InviteAccept.tsx:283-295`; `backend/src/services/collab/invites.ts:248-253`
- **Evidence:** The server selects only `email` for the inviter and returns `email.split('@')[0]`; the UI renders that string plus initials. A user named “Asha Rao” therefore appears as “asha”, while the same person appears by display name everywhere else in the product.
- **User impact:** The invite’s trust signal is weaker and can be ambiguous (“Which asha?”). It can also expose an internal or personal email local-part that the person did not choose to publish.
- **Recommendation:** Return the creator’s public label/name (and optional handle), falling back to the local-part only when no name exists. Reuse the same `label` convention as trip members and chat.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-15] Low — Session transitions around `/auth` and reset rely on flashes and full reloads
- **Location:** `frontend/src/pages/Auth.tsx:41-45,202,437-449`; `frontend/src/pages/ResetPassword.tsx:131-136`; `frontend/src/services/api.ts:493-499`; `frontend/src/context/UserContext.tsx:220-236`
- **Evidence:** `/auth` renders the full form while the initial `/auth/me` check is running; `loading` is only used to disable the submit button, so a signed-in visitor can see and interact with the sign-in form before the redirect effect fires. After a successful reset the server sets a session and returns the user, but `AuthProvider` has no method to accept that user; the success screen uses a raw `<a href="/dashboard">`, forcing a full reload so `ProtectedRoute` can re-check the session.
- **User impact:** Signed-in users see a momentary sign-in form (and may start typing) before being bounced. Reset success requires a full document load, which is slower and fragile if the link is ever changed to SPA navigation without updating context.
- **Recommendation:** Render the branded session loader while `loading` is true and no error is present. Add a `setSessionUser(user)` action for reset (or call `refreshUser()`), then use React Router `<Link>` for the dashboard CTA.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P2-16] Low — `consentRequired` is fetched but ignored, so the UI can drift from server policy
- **Location:** `frontend/src/lib/authConfig.ts:18-21,59-61`; `frontend/src/pages/Auth.tsx:49-57,115-118`
- **Evidence:** `fetchAuthConfig` returns both `consentRequired` and legal versions, but `Auth.tsx` stores only `config.legal` and always blocks sign-up until `acceptedLegal` is true. The public config exposes a flag (`backend/src/controllers/auth.controller.ts:31-42`) whose value has no effect on the rendered form.
- **User impact:** If the flag is turned off during rollout or for a jurisdiction, the web client still demands consent; if legal policy changes, the UI has no single place that reflects the server’s actual enforcement. This is a policy-drift risk rather than an immediate visual defect.
- **Recommendation:** Store and honor `consentRequired` (or remove it from the contract if consent is intentionally unconditional), and surface the active policy version near the checkbox. Add a test that toggling the server flag changes the form.
- **Effort:** S
- **Confidence:** Medium
- **Basis:** code-based

---

## What to keep

- **Consent design is genuinely good.** The required acknowledgement is an explicit checkbox with linked Terms and Privacy, a separate optional marketing opt-in left unchecked, a clear inline error, and versioned consent sent to the server (`Auth.tsx:383-435,129-133`; `lib/authConfig.ts:4-28`). This is the strongest trust pattern in the phase.
- **Auth field semantics are mostly right.** Each field has a visible label, `aria-invalid`, conditional `aria-describedby`, and a human error message; the server banner uses `role="alert"`, and the duplicate-email state offers a one-click “Sign in with this email instead” recovery (`Auth.tsx:261-284,286-380`).
- **Profile tabs are accessible by construction.** Roving `tabIndex`, `aria-selected`, `aria-controls`, Arrow/Home/End handling, and mounted panels preserve half-typed forms when users switch sections (`Profile.tsx:450-462,620-651`). This is better keyboard support than most settings pages in the product.
- **Invite acceptance takes token hygiene and informed consent seriously.** The token is kept in `sessionStorage`, stripped with `history.replaceState`, and the page explains exactly what each role can do before the user accepts (`InviteAccept.tsx:23-31,41-69,82-110,298-313`). Email binding is also surfaced rather than hidden.
- **Password reset is enumeration-safe and honest about expiry.** The server returns the same generic answer for unknown addresses, the client shows the server message without probing, the one-hour copy matches the backend TTL, and a successful reset signs the user in (`ForgotPassword.tsx:36-45,105-120`; `passwordReset.ts:20-23,45-74`; `api.ts:485-499`).
- **The dark-mode foundation is token-based.** Auth surfaces use `bg-background`/`bg-card`/`border-border`, the wordmark swaps through `dark:` variants, and focus rings are defined consistently (`Auth.tsx:202-218`; `index.css:66-115`). No auth-specific light-only palette was found apart from the intentionally dark photo scrim.

---

## Validation plan

1. **Keyboard and screen reader:** On `/auth`, `/forgot-password`, `/reset-password/:token`, and `/profile`, submit each form empty and with bad credentials; confirm focus lands on the first invalid field, the field error is announced, and server errors are announced once, not twice.
2. **Expired-token path:** Open `/reset-password/<expired-or-garbage-token>` directly; the page should show an invalid/expired state immediately and offer “Send a new link” without rendering password fields.
3. **Password managers:** Test Chrome, 1Password/Bitwarden, and iOS/Android autofill on sign-up, sign-in, reset, and password change. Verify credentials save, fill, and update correctly, and that Profile’s public handle is never offered as a login username.
4. **Mobile viewports:** At 320×568, 390×844, and 430×932 in light/dark, confirm the form is visible without horizontal scroll, all controls are ≥44px, helper text is readable, and the auth hero is not downloaded below `lg` (check DevTools network).
5. **Reset and session continuity:** Complete a reset and land on `/dashboard` authenticated without a full-page reload; then visit `/auth` while signed in and confirm the loader appears before the redirect, with no editable form flash.
6. **Invite flows:** With an email-bound invite, open it while signed in as the wrong account and complete the new switch-account action; verify the token survives, the correct role is granted, the token is removed from history/`sessionStorage` after accept/decline, and the decline target is reachable by thumb and keyboard.
7. **Profile safety:** Trigger password/handle/bio errors and confirm each is attached to its field; open “Replace recovery code” and confirm a warning appears before the old code is replaced; exercise the interim account-deletion request path end to end.
8. **Performance regression:** Run Lighthouse mobile with throttling on `/auth`, `/forgot-password`, and `/reset-password`; verify no third-party Unsplash request on mobile, no CLS from the hero, and no new accessibility violations.
