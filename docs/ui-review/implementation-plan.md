# Implementation plan — waytowalk UI/UX review

**Purpose:** turn the 30 consolidated recommendations into a sequenced delivery
plan, highest-priority work first.
**Mode:** planning only. No product code has been changed by this document.
**Date:** 2026-11-17.
**Source of truth:** `recommended-changes.md` and the six phase reports in this
folder. This plan does not replace those documents; it schedules them.

## How to use this plan

1. Work phases in order. A phase starts only when its **dependencies** are
   merged, not when its calendar slot arrives.
2. Treat each phase's **exit gate** as the definition of done. Compiling is not
   done; the named evidence must exist.
3. Do not split a change across phases unless this plan explicitly says so.
4. Do not start low-priority polish until Gate C. Low findings are absorbed by
   the change that owns the same surface; there is no separate polish wave.
5. If a phase reveals a new Critical defect, stop and insert it at the top of
   the current gate rather than carrying it forward.

## Ordering rule

Within the plan, work is ordered by:

1. **Severity band** — P0, then P1, then P2.
2. **Dependency** — theme before contrast-dependent fixes; async states before
   skeleton fidelity; primitives before the shared data table.
3. **User impact within the band** — trust and data correctness before
   efficiency and polish.
4. **Effort as tie-break** — a one-day stop-ship fix ships before a multi-week
   stop-ship fix when neither blocks the other.

This produces three release gates:

| Gate | Phases | Band | What must be true |
|---|---|---|---|
| **A — Stop-ship** | 1–5 | P0 (plus P0–P1 accessibility/motion) | No known broken trust, incorrect data, inaccessible primary action, or theme/contrast failure on a reviewed route |
| **B — Experience baseline** | 6–8 | P1 | One token/type/component system; public, auth and realm UX findings closed; structural carryovers C-19 and C-22 scheduled |
| **C — Structural and scale** | 9–10 | P1–P2 / P2 | Responsive tables, bundle boundaries, performance budgets, agency and admin queue efficiency |

## Phase overview

| Phase | Theme | Changes | Priority | Effort | Gate |
|---|---|---|---|---|---:|---|
| 0 | Baseline and verification harness | — (enabling) | — | S | — |
| 1 | Theme ownership and accent contrast | C-09, C-11 | P0 | S + M | A |
| 2 | Public trust, legal reachability and share contract | C-01, C-02, C-20 | P0 | S + M + S | A |
| 3 | Generation lifecycle and itinerary data truth | C-03, C-04 | P0 | M + M | A |
| 4 | Account recovery and privileged-action safety | C-07, C-08 | P0 | M + M | A |
| 5 | Truthful states, accessibility and motion | C-05, C-16, C-17, C-30 | P0–P1 | S–M + M + S–M + S | A |
| 6 | Token, palette and type system | C-23, C-12, C-10 | P1 | S–M + M + M | B |
| 7 | Shared components, forms and focus mechanics | C-13, C-14, C-15, C-18 | P1 | M + S–M + S–M + M | B |
| 8 | Realm UX completion | C-28, C-24, C-06, C-25, C-21 | P1 | M + S–M + M + M + M | B |
| 9 | Responsive data, bundle boundaries and budgets | C-19, C-22, C-29 | P1–P2 | L + M–L + M | B → C |
| 10 | Agency and admin operator efficiency | C-26, C-27 | P2 | M + M | C |

**Indicative duration:** roughly 26–32 engineer-weeks for one squad, excluding
review latency and the Phase 0 harness. With two squads, Phase 1 is serial;
Phases 2–5 can split by realm; Phases 6–8 remain foundation-led; Phases 9–10
can split agency from admin. Treat these as planning ranges, not commitments.

---

## Phase 0 — Baseline and verification harness

**Priority:** enabling work · **Effort:** S (0.5–1 day) · **Gate:** none

### Objective

Make every later exit criterion verifiable. The audit's measurements are the
baseline; if they are not captured now, improvement claims become opinion.

### Scope

- Obtain test accounts for all four realms: public, traveller, agency
  owner/member, and platform admin. Without them, phases 4, 5, 8 and 10 cannot
  be visually signed off.
- Record the baseline:
  - micro-type count (measured: 884 uses of 9–11px across 107 files);
  - raw palette count (measured: 1,810 utilities across 88 files before Phase 1;
    1,773 after it);
  - contrast matrix for declared pairs in all four themes;
  - bundle sizes for `/explore`, `/shared/:id`, `/dashboard`, `/auth`;
  - 1440px and 390px screenshots of public routes in light and dark;
  - an axe baseline for the reviewed routes.
- Confirm the existing quality commands pass before changes begin:
  `npm run verify` (backend tests/build, frontend typecheck, key-backup and
  auth-policy tests, frontend build) and `npm run lint:frontend`. Add
  `npm --prefix mobile run typecheck` only if the work touches mobile surfaces.
  Do not invent a root `typecheck` or `lint` script; they do not exist.
- Recommended additive tooling, no runtime impact:
  - Playwright + `@axe-core/playwright` for route interception, keyboard checks
    and visual snapshots;
  - a plain Node contrast checker that reads the declared tokens;
  - plain Node scanners for micro-type and raw-palette counts.
  If Playwright is not approved, use a manual evidence table with the same
  cases; do not weaken the gate.

**Implementation record (2026-11-18):** The three source scanners and the
contrast matrix are implemented and recorded in
`baseline/phase-0-1-baseline.md`; `npm run verify` now runs the contrast gate.
Token contrast is complete. Screenshots, axe and bundle baselines are **not**
captured, and test-realm credentials are still missing. The manual evidence
table is the fallback until Playwright is approved.

### Exit gate

- Baseline is stored under `docs/ui-review/baseline/` or an agreed location.
- Every realm has credentials and a named verification owner.
- The contrast, palette and type scans run with one command each.

### Why first

Every P0 acceptance criterion depends on seeing a real rendered state. Starting
implementation before this turns "done" into a code review opinion.

### Existing work to reconcile

The working tree already contains an in-flight auth modernization branch
(recorded in `docs/auth-phase-1-implementation.md`), including password-policy
helpers, strength feedback, consent fields, legal pages and auth-shell changes.
That overlaps parts of **C-01**, **C-08** and **C-28**.

Before Phases 2, 4 and 8:

- diff the existing branch against each change's **done when** criteria;
- mark only verified sub-items complete;
- do not re-implement or overwrite that work;
- leave the remaining gaps in the phase scope.

The tracking table marks these three changes as **Partial — reconcile**. A
partial implementation does not close a P0 item until the full exit gate passes.

---

## Phase 1 — Theme ownership and accent contrast

**Priority:** P0 · **Effort:** S + M (~3–5 days) · **Gate:** A
**Changes:** **C-09** (P0, S), **C-11** (P0, M)
**Findings:** P1-05, P1-07, TRV-03, P4-01, P5-01, P5-06, P5-15, P6-02, P6-06

### Objective

Make all four realms render from one theme owner with legible accent roles, so
later visual fixes are validated against the final palette rather than reworked
twice.

### Why this is first

C-09 and C-11 are prerequisites for the agency, admin and public contrast fixes
(`recommended-changes.md`, sequencing rule 1). They are also the smallest
changes that clear the measured 2.65:1 coral-on-cream and 1.1:1 agency
dark-mode failures.

### Scope

**C-09 — accent fill / ink / on-fill**

- Define three roles per accent: `--accent` (fill), `--accent-ink` (text,
  ≥4.5:1 on canvas and card), and `--accent-foreground` (text on fill).
- Do the same for the agency and admin accents. Keep coral/teal/indigo for
  fills, dots, borders and illustration.
- Replace `text-accent` with `text-accent-ink`; replace
  `bg-agency-accent text-white` with
  `bg-agency-accent text-agency-accent-foreground`; replace admin `indigo-500`
  primary buttons with indigo-600 or the `--admin-accent` pair.
- Add a contrast check for every declared pair in traveller, agency, admin,
  light and dark.

**C-11 — root theme ownership and portal inheritance**

- Create one `ThemeProvider` owning `{mode, realm}` and writing `.dark` plus
  `data-theme="traveller|agency|admin"` to `<html>`.
- Define each realm's tokens once under `[data-theme]` and
  `.dark[data-theme]`.
- Remove the `AdminLayout` `.dark` wrapper strategy; make portalled sheets,
  dialogs, dropdowns and toasts inherit the root theme.
- Mount one `Toaster` inside the provider.
- Initialise the Navbar toggle's icon and label from the applied class during
  render, not in an effect.
- Keep `theme-init.js` as the pre-paint guard; do not reintroduce a flash.

**Boundary:** hard-coded brand hexes and the broader palette cleanup belong to
C-12 in Phase 6. Do not expand Phase 1 into the raw-palette sweep.

**Implementation record (2026-11-18):** Phase 1 is implemented at source level.
The accent roles are named `--accent-ink` / `--accent-foreground` and
`--agency-accent-ink` / `--agency-accent-foreground` (plus `--admin-accent*`);
the `-foreground` suffix replaces the sketch's `text-agency-on-accent` so C-12
extends one convention. `.dark` wrappers and `.agency-theme` are gone; realm
tokens live on `<html data-theme>`. Measurements and open visual checks are in
`baseline/phase-0-1-baseline.md`.

### Surfaces

`frontend/src/index.css`, `frontend/tailwind.config.ts`,
`frontend/src/App.tsx` providers, `Navbar`, `AgencyLayout`, `AdminLayout`,
shared sheet/dialog/toast components, `frontend/public/theme-init.js`.

### Dependencies

- None. This is the first product phase.
- Phase 0 screenshot baseline, especially the portal matrix.

### Exit gate

- Coral status text on cream computes ≥4.5:1.
- The agency dark primary button computes ≥4.5:1.
- Admin primary buttons compute ≥4.5:1.
- A dialog, sheet and toast render correctly in all three realms in both modes
  (12 visual checks), including admin's mobile sheet, account drawer and
  toasts.
- No light surface appears inside a dark realm.
- The theme toggle matches the applied theme on first render.
- Agency dark mode has no cream fill under white text.
- The contrast check runs in CI.

### Validation

- Run the token contrast checker; record every pair, not only failures.
- Playwright visual matrix or manual screenshots for the 12 portal cases.
- Open an admin page with the mobile navigation sheet and trigger a toast while
  in dark mode.
- Switch theme, reload, and confirm the first rendered toggle state.

### Risks

- Token renaming touches many files. Use codemods plus a lint guard; do not
  hand-edit call sites.
- Portal regressions are easy to miss. The 12-case matrix is mandatory, not
  optional.
- Do not change the brand palette concept while fixing roles.

---

## Phase 2 — Public trust, legal reachability and share contract

**Priority:** P0 · **Effort:** S + M + S (~3–5 days) · **Gate:** A
**Changes:** **C-01** (P0, S), **C-02** (P0, M), **C-20** (P0, S)
**Findings:** P1-01, P1-02, P1-03, P1-04, P1-17, P1-18, P6-17

### Objective

Close the three public trust failures: legal pages that cannot be found, a
shared-trip page whose primary action and privacy promise are untrue, and
missing metadata that makes shares and private routes behave incorrectly.

### Decision gates before coding

1. **Share contract:** are budgets private or shared? If private, strip budget
   fields from the public projection and suppress the Expenses tab. If shared,
   rewrite the copy and add an owner share-time toggle.
2. **Copy semantics:** implement "Take a copy" as a real draft clone, or relabel
   it "Start planning your own trip" and make the shared itinerary visibly
   read-only. Mixed behaviour is not allowed.

Record both decisions in the plan's decision log before C-02 starts.

**Resolved 2026-11-18 (D-A, D-B):** budgets stay **private**, and the CTA is
**relabelled**. The serializer strips budget keys, the public itinerary renders
no Expenses tab, and the button becomes "Start planning your own trip". No
clone endpoint is added. Consequences are recorded in the decision log below.

### Scope

**C-01 — legal reachability and reading**

- Add Terms and Privacy to the public footer's secondary group and the mobile
  sheet.
- Replace the legal shell's "Back to sign in" with "Back to waytowalk".
- Add a table of contents generated from the document headings: sticky rail on
  desktop, collapsible list on mobile.
- Keep existing section ids.
- Ensure the sign-up consent line links both documents.

**C-02 — shared-trip contract**

- Enforce the chosen contract in one place: the public share projection.
- If budgets are private, remove budget keys at the serializer boundary, not in
  the component, and render no Expenses tab.
- Implement the chosen CTA honestly:
  - real clone → seed a draft from the shared payload and navigate into the
    planner;
  - relabel → public itinerary is read-only and the CTA starts a blank trip.
- Add a regression test that asserts the payload contract.

**C-20 — metadata, share previews and indexability**

- Centralise metadata in one helper accepting title, description, image,
  canonical, `ogType` and `robots`.
- Add a static 1200×630 brand card as the default `og:image`/`twitter:image`;
  allow share routes to override when a cover exists.
- Default authenticated realms to `noindex`.
- Give NotFound a title, description and `noindex`.
- Ensure every route has a title and description.

**Implementation record (2026-11-18):** Phase 2 is implemented at source level
and recorded in `baseline/phase-2-baseline.md`.

- **C-01:** `Landing.tsx` bottom bar carries a `Legal` nav (Terms, Privacy,
  Guidelines) and `Navbar.tsx` repeats the three links inside the mobile sheet.
  `LegalDocument.tsx` now returns to `/` with "Back to waytowalk" and generates
  its table of contents from `sections` — a sticky rail at `lg`, a `<details>`
  list with a rotating chevron below it, and `scroll-mt-28` on every section so
  anchors clear the navbar. Section ids are unchanged. Sign-up consent already
  linked both docs.
- **C-02:** `projectPublicTrip` applies `withoutBudgetFields` before media URL
  rewriting, removing `budget_per_person` and `budget_breakdown` without
  mutating stored details. `publicProjection.test.ts` pins both behaviours.
  `ItineraryDisplay` gained `publicView`, which suppresses `TripHeader` and the
  Expenses tab/content; `SharedTrip.tsx` passes it, drops the CSS wrapper hack,
  and relabels both CTAs to "Start planning your own trip" (with a `Plus` icon).
- **C-20:** `lib/meta.ts` takes image, `imageAlt`, canonical and `robots` and
  writes the OG/Twitter/robots/canonical tags; `lib/routeMeta.ts` plus
  `components/RouteMeta.tsx` give every route a title and description and mark
  private prefixes `noindex, nofollow`. `NotFound` has its own metadata.
  `public/brand/og-default.png` is the 1200×630 default card.
  `backend/src/services/seo/shareMeta.ts` injects real head tags in the SPA
  fallback — the only path a non-JS crawler takes — resolving shared-trip covers
  through `findPublicSharedTrip` and proposal titles through the new
  `getAgencyProposalMeta` (no view tracking). `robots.txt` stops advertising
  `Allow: /` for every bot.

Remaining: the desktop legal rail and the mobile sheet at 390px, an
authenticated sign-off and a real chat-client preview, all listed as open items
in the baseline file.

### Surfaces

Public footer/mobile sheet, legal shell and legal pages, `SharedTrip.tsx`,
share payload serializer/API, route metadata helper, NotFound.

### Dependencies

- Phase 1 is not strictly required, but metadata/image work is easier after the
  theme tokens settle.
- Product and legal sign-off on the C-01 copy and C-02 contract.
- Reconcile the existing legal pages/consent branch first: keep what already
  works, then add the missing footer/mobile-sheet entry points and the table of
  contents.

### Exit gate

- From `/`, both legal documents are reachable in two links.
- From either legal document, the reader can return to the public site in one
  link and jump to any section without scrolling the full page.
- The public share payload contains no budget keys unless explicitly shared.
- No Expenses tab renders for a private budget.
- The primary shared-trip CTA does exactly what its label says.
- A shared itinerary or proposal renders an image card in WhatsApp, Slack and
  iMessage.
- Private shells and NotFound are not indexable.
- Every reviewed route has a title and description.

### Validation

- Link-graph check from `/` to both documents and back.
- API contract test for the share payload, including a fixture with budgets.
- Click the CTA and assert it either clones a draft or opens a blank planner,
  matching the label.
- Use an OG preview debugger plus one real chat client; `curl` the rendered
  head tags for `robots` and canonical.
- Check a long unknown path at 360px does not overflow (C-24 owns the visual
  fix; C-20 owns the metadata).

### Risks

- Backend and frontend must change together. Land the projection first, then the
  UI, behind the same release.
- Cached share payloads can leak old budget fields. Invalidate or version the
  share cache.
- Legal copy requires approval; do not let approval block the footer links.

---

## Phase 3 — Generation lifecycle and itinerary data truth

**Priority:** P0 · **Effort:** M + M (~1.5–2 weeks) · **Gate:** A
**Changes:** **C-03** (P0, M), **C-04** (P0, M)
**Findings:** TRV-01, TRV-04, TRV-05

### Objective

Give the longest-running action an exit, and remove confidently wrong spatial
and schedule data from the core travel artifact.

### Decision gate before coding

**Cancel semantics:** does "Stop generating" abort only the client wait, or
cancel server-side work too? Define this explicitly, because the overlay copy
must say whether work continues. Use an idempotency key per generation attempt
so cancel-then-retry cannot create two trips.

**Resolved 2026-11-18 (D-C): real cancel.** "Stop generating" aborts the
server-side provider request and saves nothing. The overlay copy states exactly
that, and every server-side check between the provider call and the write
refuses to persist once the request is aborted or the client has disconnected.
The client sends one `x-generation-attempt` key per submit→cancel→retry
session; the server replays the existing trip for that key instead of creating a
second one. Gemini's `AbortSignal` stops delivery but the provider may still
finish and bill its own request, so the UI only claims that *our* server stops
and that nothing is saved.

### Scope

**C-03 — generation cancel, abort and unmount guards**

- Thread an `AbortController` through `generateItineraryStream`.
- Add an explicit "Stop generating" action and an always-available close/back
  control while streaming.
- Abort on unmount.
- Gate `onComplete` on a `cancelled` flag; never navigate from a callback whose
  view has unmounted.
- Make the copy state whether work continues after dismissal.
- Guard against duplicate submissions and duplicate trips.

**C-04 — remove fabricated map pins and time slots**

- Never place activities or stays at radial offsets when coordinates are
  missing.
- Put unmapped items in a separate "Location not mapped" list, or use a
  distinct numbered "approx. area" marker with a legend.
- Never synthesise a stay location.
- Show Morning/Afternoon/Sunset/Night only when a real time or slot exists;
  otherwise use "Stop 1" or a category icon with no time claim.
- Ensure reordering activities cannot change a displayed time of day.

**Implementation record (2026-11-18):** Phase 3 is implemented at source level
and recorded in `baseline/phase-3-baseline.md`.

- **C-03 (server):** `services/ai/generationGuard.ts` owns the abort predicate
  (`isAbortError`), the between-chunk check (`throwIfAborted`) and the single
  save rule (`shouldPersistGeneration`). The signal is threaded through
  `generateStreamWithFallback`, Gemini and Groq, and a cancelled primary never
  starts its fallback model. The stream controller accepts an optional
  `x-generation-attempt` header (`^[A-Za-z0-9_-]{8,100}$`), aborts on
  `res.close` before `writableEnded`, guards every SSE write, skips the write
  when aborted/closed, deletes a trip that was saved after the cancel, and
  replays an existing attempt instead of erroring on the unique index.
  `Trip.generationAttemptId` plus a partial unique index
  (`{ userId, generationAttemptId }`) enforce one trip per attempt without
  touching legacy rows. Attempt lookups live in
  `services/itinerary/generationAttempts.ts` so controllers keep zero trip
  lookups.
- **C-03 (client):** `generateItineraryStream(input, callbacks, { signal,
  attemptId })` sends the attempt key, cancels the reader and swallows
  `AbortError`; a stream that closes without a terminal event reports "Nothing
  was saved". `TripPlanner` holds an `AbortController`, reuses the attempt key
  across cancel/retry, clears it only on `complete`, gates every callback on the
  live attempt, blocks duplicate submits and aborts on unmount. A pending
  post-complete navigation timer is cleared on cancel/leave. The overlay exposes
  an X and a "Stop generating" button while streaming, and says that stopping
  cancels the request on our servers and saves nothing.
- **C-04:** `lib/itineraryTruth.ts` projects `{ pins, unmapped }` from stored
  data only — no radial offsets, no base-coordinate fallback, no synthesized
  stay. `TripMap` plots real `[lat, lng]` pins and lists everything else under
  "Location not mapped", filtered by the selected day. `DayTimeline` and
  `pdfExport` show a stored time verbatim, otherwise `Stop N`, so reordering
  moves the order label but never the time.

The live check passed on 2026-11-18: generate → Stop at 15% → no trip, retry
with the same attempt key → exactly one trip, Back → `/plan` with no
auto-navigation. A lost-`complete` replay and a real no-coordinate trip are still
unexercised; they are listed in the baseline file.

### Surfaces

`frontend/src/components/wizard/GenerationOverlay.tsx`, generation client and
stream endpoint, plan/wizard route, `ItineraryDisplay`, map component, itinerary
data mapping.

### Dependencies

- None beyond Phase 0. C-03 and C-04 touch the same itinerary surface; do them
  in one phase to avoid merge churn.
- C-15 later adds focus trapping to the overlay; C-03 owns lifecycle, C-15 owns
  keyboard mechanics. Do not duplicate.

### Exit gate

- A user can leave the overlay at any time without creating a trip.
- Back, then re-entering, does not auto-navigate.
- Cancel followed by retry creates exactly one trip.
- Every map pin traces to stored coordinates or is visibly labelled
  approximate.
- Reordering activities cannot change a displayed time of day.
- A trip with no coordinates and no times renders no false location or schedule
  claims.

### Validation

- Unit-test the stream reducer/abort flag and `onComplete` gating.
- Integration-test a delayed stream: close mid-stream, retry, assert one trip.
- Fixture test: open a trip with no coordinates and no times; assert no pin is
  placed and no time label appears.
- Manual: generate, cancel, leave, return, retry.

### Risks

- Client abort may not stop server work. If it does not, say so in the UI and
  avoid claiming cancellation.
- The map may need an empty/unmapped state that did not exist before. Design it
  as a real list, not a disguised fallback pin.
- Idempotency must be enforced server-side; a client flag alone cannot guarantee
  one trip.

---

## Phase 4 — Account recovery and privileged-action safety

**Priority:** P0 · **Effort:** M + M (~2 weeks) · **Gate:** A
**Changes:** **C-07** (P0, M), **C-08** (P0, M)
**Findings:** P2-01, P2-03, P2-06, P2-07, P2-12–P2-16, P4-07, P5-04, P5-16,
P6-08

### Objective

Stop users from discovering a dead reset link after two password entries, and
stop irreversible tenant or role changes from firing on a single click.

**Status (2026-11-18):** implemented; source-level verification passes. Evidence,
inventory and the remaining browser checks live in
`docs/ui-review/baseline/phase-4-baseline.md`.

### Reconciliation note

The in-flight auth branch already implements the 8/64 policy, strength feedback,
shared password helper and some consent/reset work. Treat C-08 as **gap
closing**, not greenfield: verify each done-when item against the branch, then
implement what is missing (token preflight, delete request, invite switch, SPA
navigation, inviter name, duplicate switch removal).

### Scope

**C-08 — password, reset and recovery**

- Validate the reset token on mount; show expired/invalid with "Send a new
  link" before rendering password fields.
- Adopt the agreed 8/64 policy with persistent requirements and strength
  feedback on sign-up, reset, Profile and platform-admin change. Keep sign-in at
  "required" for existing accounts.
- Add a shared password reveal control.
- Make the name optional; remove confirm-password once reveal exists; remove the
  duplicate mode switch.
- After reset, update auth context and use SPA navigation instead of a full
  reload.
- Forgot-password success keeps the email, offers "Send again" with cooldown,
  "Use a different email" and a spam hint.
- Replace the inert delete-account button with a working request path.
- Invite mismatch offers "Sign out and continue with {invitedEmail}" while
  preserving the token.
- Return the inviter's display name, not the email local-part.
- Honour `consentRequired` or remove it from the contract.

**C-07 — one destructive/privileged action model**

- Standardise on one `ConfirmDestructive` recipe built on `AlertDialog`: name
  the object, state the consequence, use a specific verb, keep Cancel neutral.
- Require typed confirmation (workspace slug or target email) for tenant
  ownership transfer, plus a second confirm for any promotion to `owner`.
- Remove `owner` from inline role selects and route it through the guarded flow.
- Replace `window.confirm` for destructive actions with the styled dialog;
  reserve native confirm for unsaved-change guards.
- Add undo toasts for reversible actions.

### Surfaces

`Auth.tsx`, `ForgotPassword`, `ResetPassword`, `Invite`, `Profile.tsx`, auth
context and auth API, platform-admin account pages, agency team and transfer
flows, shared dialog/alert-dialog components.

### Dependencies

- Phase 2's decision log for consent/legal copy.
- Security review before merging reset, deletion and ownership-transfer changes.
- C-18 later adds the shared `Field` primitive; do not block C-08 on it. Use
  existing labels now and migrate in Phase 7.

### Exit gate

- An expired reset link is rejected before the form.
- Password managers save, fill and update correctly on every password surface.
- Reset lands on `/dashboard` authenticated without a document reload.
- The same 8/64 requirements and strength feedback appear on all five surfaces.
- A wrong-account invite has a one-click recovery that preserves the token.
- The delete-request path is reachable and does something real.
- Transfer owner cannot complete on a single click.
- No destructive action fires from one stray click without a recovery path.
- Every destructive dialog names the target and consequence.
- The same destructive component is used in all realms.

### Validation

- `npm run test:auth-policy`; add tests for reset-token preflight and invite
  mismatch.
- Manual password-manager matrix: Chrome, 1Password or Bitwarden, save → fill →
  update.
- Staging destructive-flow script: transfer owner, promote owner, revoke member,
  delete package, de-list agency; verify typed confirmation and undo where
  applicable.
- Security review sign-off on token handling, deletion and transfer.

### Risks

- Auth changes are security-sensitive. Do not ship behind a visual-only test.
- Tenant transfer is irreversible in practice; test with seeded tenants, never
  production data.
- A delete request may need a support queue rather than immediate deletion.
  Decide before building the UI.

---

## Phase 5 — Truthful states, accessibility and motion

**Priority:** P0–P1 · **Effort:** S–M + M + S–M + S (~2.5 weeks) · **Gate:** A
**Changes:** **C-05** (P0, S–M), **C-16** (P1, M), **C-17** (P0–P1, S–M),
**C-30** (P0–P1, S)
**Findings:** P1-08, P1-09, P1-11, P1-17, P2-08, P4-18, P5-02, P5-05, P5-13,
P5-17, P6-05, P6-12, P6-16, P6-18, TRV-02, TRV-13, TRV-17

### Objective

Make failure visible and distinct from emptiness, make loading honest, and make
the first keyboard, screen-reader and reduced-motion experience usable.

**Status (2026-11-18):** implemented; source-level verification passes. Evidence,
the per-surface inventory and the remaining browser checks live in
`docs/ui-review/baseline/phase-5-baseline.md`.

### Why C-05 and C-16 stay together

They share one state model. Split them and every page will keep inventing a
fourth loading/empty/error combination (`recommended-changes.md`, sequencing
rule 2).

### Scope

**C-05 — truthful async states**

- Adopt one `AsyncState` contract with explicit `loading`, `empty`, `error` and
  `forbidden` branches.
- Gate empty states on `!error`.
- Render a persistent error panel with retry in the content area, not only a
  toast.
- Do not let pagination default to "Loading…" after a settled request.
- Announce state changes with `role="status"`/`aria-live`; use `role="alert"`
  for terminal errors.
- Derive empty copy from all active filters and from `total === 0` versus
  filtered zero.

**C-16 — loading taxonomy and skeleton fidelity**

- Define three modes: route transition (brand loader), section load (skeleton
  matching the real shell), inline action (button spinner).
- Derive skeletons from the real card/header components.
- For discovery, render the page shell and skeleton grid if data takes more than
  ~2s instead of blocking on the brand loader; show retry after a bounded wait.
- Align skeleton radius, aspect ratio, gaps and header height with the loaded
  layout.

**C-17 — accessibility foundations**

- Add one public skip link targeting `#main-content`; reuse the app-shell
  implementation.
- Give every auth, admin-login and forced-password screen one real `h1`; demote
  decorative photo-panel headlines.
- Add `role="meter"` with `aria-valuenow/min/max` and a text equivalent to plan
  usage bars.
- Render disabled privileged-action reasons as visible helper text or
  `aria-describedby`, not `title` alone.
- Make scrollable table regions keyboard reachable and labelled.
- Announce async state changes once.

**C-30 — reduced-motion policy**

- Add a global reduced-motion rule for non-essential animation utilities and a
  `useReducedMotion` hook for component decisions.
- Disable `animate-ping`/`animate-pulse`/`animate-fade-in` in the generation
  overlay and live indicators.
- Replace the 404 compass's infinite spin with a one-shot reveal or static mark.

### Surfaces

Traveller, agency and admin list pages; discovery; auth screens; generation
overlay; live indicators; NotFound; app shells; `index.css`; skeleton
components; shared async-state components.

### Dependencies

- Phase 1 tokens for contrast in state panels.
- Phase 3 for the generation overlay's motion and lifecycle.
- Phase 4 for auth `h1` placement, so the heading change does not conflict with
  the reset/account shuffle.

### Exit gate

- Stubbing a 500, 403 and timeout for every list endpoint produces an error panel
  with retry on traveller, agency and admin lists.
- No failed request renders "No trips yet" or "No accounts match".
- The state change is announced once.
- Library, trip detail and public discovery skeletons match the loaded layout.
- No first paint blocks for 20–40 seconds.
- First Tab on every public page reveals a visible skip link.
- Every page has exactly one `h1`.
- Axe reports no heading-order, label or contrast violations on the reviewed
  routes.
- With `prefers-reduced-motion: reduce`, generation, live status, skeletons and
  NotFound show no looping motion.

### Validation

- Playwright route interception for 500/403/timeout per list endpoint; or a
  dev-only failure switch if Playwright is not adopted.
- Axe run on the reviewed route set in light and dark.
- Keyboard script: Tab from page load, skip link, modal, table scroller.
- OS reduced-motion setting plus a visual recording of the generation overlay.
- Slow-network run on discovery: confirm the shell appears before 2s and retry
  appears after the bound.

### Risks

- Endpoint error shapes differ. Normalise at the API client boundary; do not
  let each page interpret a 403 as empty.
- A global reduced-motion rule can accidentally kill useful transitions. Limit
  it to non-essential, looping or decorative motion.
- Axe passing is a floor, not proof of usability. Keep the keyboard script.

---

## Phase 6 — Token, palette and type system

**Priority:** P1 · **Effort:** S–M + M + M (~3 weeks) · **Gate:** B
**Changes:** **C-23** (P1, S–M), **C-12** (P1, M), **C-10** (P1, M)
**Findings:** P1-06, P1-12, P1-20, P2-09, P4-06, P5-06, P5-18, P5-19, P6-01,
P6-03, P6-15, TRV-16, plus the Phase 2 typography scorecard

**Status (2026-11-18):** implemented; both scanners return zero and
`npm run ui:check` is in CI. Evidence and the open screenshot baseline live in
`docs/ui-review/baseline/phase-6-baseline.md`.

### Objective

Replace four independent palettes and an accidental 9–11px type scale with one
named system, before broad component and realm work bakes the old values in
further.

### Sequence and decision gate

1. **C-23 decision first.** Decide D-13 explicitly:
   - migrate to Manrope + Newsreader with self-hosted variable fonts and a
     visual-regression baseline; or
   - keep Cabin and update the brand decision, removing the stale direction.
   Do not start the type sweep while this is unresolved.
2. **C-12 semantic tokens.** Extend the Phase 1 accent roles with `success`,
   `warning`, `info`, `--surface-brand` and `--surface-brand-ink`, each with
   light/dark values. Reuse the shipped `--admin-accent*` and
   `--agency-accent-foreground` names; do not rename them.
3. **C-10 type scale.** Convert the 884 arbitrary sizes to five named steps.

### Scope

**C-23 — typography direction**

- Record the decision in the decision log and encode it in `tailwind.config.ts`
  and one typography token file.
- If migrating: self-host the variable fonts, remove Cabin, and capture a
  visual-regression baseline for the five highest-traffic screens.
- No page may choose a font family locally.

**C-12 — semantic colour and palette cleanup**

- Ban default Tailwind palette utilities outside the token file.
- Replace the 1,773 raw palette matches in 88 files, starting with
  `AgencyExportPanel`, `AgencyQuotePanel`, the admin indigo scatter, the public
  navbar badge and the agency skip link.
- Define dark-mode variants once per token, not per call site.

**C-10 — type scale and readability**

- Five steps: 12px metadata floor, 14px secondary/UI, 16px body, 20–24px
  section, 28–48px display.
- Reserve 11px only for uppercase overlines that duplicate adjacent text.
- Convert 37×9px, 330×10px and 517×11px uses to named utilities.
- Add a lint allow-list for any remaining micro-type.
- Form labels and table metadata are never below 12px; 11px is allowed only for
  uppercase labels.

### Surfaces

`frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/index.html`,
typography tokens, 107 files with micro-type, 80 files with raw palette
utilities, `AgencyExportPanel`, `AgencyQuotePanel`, admin theme surfaces,
public navbar badge, agency skip link.

### Dependencies

- Phase 1 accent roles (C-09/C-11) must be merged. C-12 extends them; it must
  not rename them again.
- C-23 decision before C-10.
- Do not start C-19 until C-12 and C-10 are merged, so the shared table does not
  inherit the old palette/type.

### Exit gate

- A palette scan returns zero default-palette utilities outside the token layer.
- Every status colour maps to a named semantic token.
- No functional text renders below 12px at 390px.
- Table metadata is ≥12px (11px only for uppercase labels); form labels are
  ≥12px.
- A lint rule prevents regression.
- The decision log and implementation agree; no page chooses a font family
  locally.
- A visual-regression baseline covers the five highest-traffic screens.

### Validation

- Run the palette scan and micro-type scan before/after; store counts in the
  baseline.
- Run `npm run build` and compare bundle output if fonts change.
- Screenshot the five key screens at 390px and 1440px in both themes.
- Spot-check 10 converted files for semantic correctness, not just utility
  replacement.

### Risks

- This is a very large diff. Split PRs by token layer, type scale, then realm;
  never mix a palette codemod with behavioural changes.
- Codemods can rewrite illustration/brand values. Exclude artwork and the
  wordmark explicitly.
- Font migration changes metrics; re-baseline screenshots rather than comparing
  against pre-migration pixels.

---

## Phase 7 — Shared components, forms and focus mechanics

**Priority:** P1 · **Effort:** M + S–M + S–M + M (~3–4 weeks) · **Gate:** B
**Changes:** **C-13** (P1, M), **C-14** (P1, S–M), **C-15** (P1, S–M),
**C-18** (P1, M)
**Findings:** P2-02, P2-04, P2-09, P4-11, P4-12, P4-15, P5-12, P5-13, P5-14,
P5-16, P6-04, P6-07, P6-09, P6-10, TRV-01, TRV-06, TRV-07, TRV-08, TRV-17

**Status (2026-11-18):** implemented; primitives adopted through thin realm
adapters, both non-Radix scrims converted to `Dialog`, label/`id` audit clean.
Evidence and the open touch-measurement and password-manager checks live in
`docs/ui-review/baseline/phase-7-baseline.md`.

### Objective

Create the primitives that stop every page from re-implementing a header,
filter, field and dialog, and make keyboard/touch behaviour correct once.

### Scope

**C-13 — shared page scaffolding**

- Build one `PageHeader` (title, description, meta, actions, breadcrumb slot),
  one `FilterBar`/`SegmentedControl` with a `size` prop, and one
  `PageSection`.
- Adopt them across public, traveller, agency and admin with a realm accent
  prop, not a fork.
- Delete `TravellerPageHeader` if it is not adopted.
- Add a `/design` route or Storybook so primitives are reviewed together.

**C-14 — touch-target system**

- Set a 44px minimum for coarse pointers across `Button`, `Input`, `Select`,
  segmented filters and icon actions, using padding to preserve visual density.
- Keep 36–40px for fine-pointer desktop where justified.
- Separate destructive actions from neighbours by at least one target width, or
  move them into an overflow menu.

**C-15 — focus and overlay mechanics**

- Route every modal through Radix `Dialog`/`AlertDialog`.
- Move initial focus into the dialog, trap it, restore it on close, and map
  Escape to the cancel path.
- Make horizontally scrollable table regions focusable and labelled.
- On pagination change, scroll the table heading into view and move focus to it
  with `tabIndex={-1}`; keep the `aria-live` count.

**C-18 — form semantics and validation focus**

- Build one `Field` primitive wiring `id`, `htmlFor`, `aria-describedby`,
  `aria-invalid`, required marker and error slot.
- Add a submit helper that focuses the first invalid control and announces a
  summary.
- Use `autocomplete="username"` for login email, stable `name` attributes and
  hidden username fields on reset.
- Remove `username` from the public traveller handle.
- Migrate auth, Profile, agency quote/team/client search and admin wizard forms.

### Surfaces

`frontend/src/components/ui/*`, page headers, filter bars, all modal/dialog
consumers, auth and profile forms, agency quote/team/client search, admin
wizard, public and realm shells, `/design` route.

### Dependencies

- Phase 1 theme tokens and Phase 6 type/palette tokens.
- Phase 5 async state for list scaffolds.
- C-18 must be merged before C-19 and before the C-26/C-27 form-heavy work.
- C-13, C-14 and C-18 before C-19 (`recommended-changes.md`, sequencing rule 3).

### Exit gate

- Adjacent traveller screens use one title scale.
- The same filter job has one selected treatment and one height per density.
- No page re-implements a header or filter block.
- At 390px with touch emulation, every interactive control on the five
  most-used screens per realm measures ≥44×44px or has an equivalent padded hit
  area.
- Confirm and Decline are not adjacent 28px targets.
- No keyboard user can tab behind a scrim.
- Escape closes every modal that has a cancel path.
- Paging moves focus to the new rows; a table scroller is reachable and
  labelled.
- Every visible label is programmatically associated.
- Submitting an invalid form moves focus to the first error and announces it.
- The "Mark lost" dialog exposes selected state and a labelled required
  textarea.

### Validation

- `/design` review with design and engineering in both themes and at 390px.
- Keyboard matrix per realm: open modal, Tab cycle, Escape, restore focus, page.
- Touch-emulation measurement script or manual ruler at 390px.
- Axe forms run; password-manager fill test on login/reset.
- Check one migrated page per realm for label/error wiring.

### Risks

- Primitive adoption can become a rewrite. Migrate one page per realm first,
  keep aliases until consumers move, then delete.
- Radix focus behaviour is good by default; do not hand-roll a second trap.
- 44px targets can loosen desktop density. Use padding, not taller visual
  boxes, and keep fine-pointer sizes.

---

## Phase 8 — Realm UX completion

**Priority:** P1 · **Effort:** M + S–M + M + M + M (~4–5 weeks) · **Gate:** B
**Changes:** **C-28** (P1, M), **C-24** (P1, S–M), **C-06** (P1, M),
**C-25** (P1, M), **C-21** (P1, M)
**Findings:** P1-10, P1-12–P1-14, P1-16, P1-17, P1-19, P2-05, P2-06,
P2-08, P2-10–P2-16, P4-02, P4-13, TRV-06–TRV-19

### Objective

Close the remaining everyday user-facing findings now that the tokens,
primitives and recovery flows exist.

**Status (2026-11-19):** implemented at source level; backend tests, backend
build, frontend typecheck and key-backup tests pass. Evidence, route inventory
and the remaining browser checks live in
`docs/ui-review/baseline/phase-8-baseline.md`.

### Sequence within the phase

1. **C-28 — auth/account completeness** (depends on C-08 and C-17).
2. **C-24 — public discovery fixes** (depends on C-01 and C-20).
3. **C-06 — settings save boundaries and dirty guards** (depends on C-07).
4. **C-25 — traveller workspace IA and interaction** (depends on C-13, C-14,
   C-16).
5. **C-21 — image delivery and third-party dependencies** (depends on C-20 for
   the share image).

### Scope

**C-28 — auth/account UX**

- Split Account into Profile, Sign-in & password, and Advanced: chat backup.
- Confirm "Replace recovery code"; keep the code copy/download prominent.
- Add an `h1` to every auth screen (C-17).
- Add reveal and password-manager semantics (C-08/C-18).
- Add invite account-switch, reset resend/edit-email and a working deletion
  request path (C-08).
- Return the inviter's display name (C-08).
- Render the session loader while auth state resolves; accept the reset user
  into context and use SPA navigation.

**C-24 — public discovery**

- Make the whole public card one link via a stretched title anchor, or confine
  hover to linked regions.
- Keep the actual count visible on mobile discovery tiles.
- Add a "Not yet / Go back" exit to the proposal confirmation and label the
  confirm action with its consequence.
- Verify the production CSP against the proposal `srcDoc` iframe; if blocked,
  relax `frame-src` to `'self'` or serve a same-origin document, and add a
  non-iframe fallback.
- Fix NotFound: respect reduced motion, use one link (not Link wrapping Button),
  truncate the attempted path, add meta.
- Drive hero discovery tiles from the same capability flags as the navbar.

**C-06 — settings save boundaries and dirty guards**

- Make saving contextual. The agency Settings header Save must not write fields
  from hidden tabs.
- Put the save action inside the visible section, or show one form with an
  explicit dirty state and disable the header action on tabs it does not save.
- Add a route blocker plus `beforeunload` whenever a package, quote or directory
  editor is dirty, with Save / Discard / Stay and a session draft where
  practical.

**C-25 — traveller workspace IA and interaction**

- Adopt one page-title scale and one filter control (C-13); add a density prop
  instead of per-page overrides.
- Add an "All" library scope or make search global; move Trash out of the status
  row.
- Return per-filter enquiry counts from the server; stop tallying loaded pages.
- Extract one `useProposalAnswer` hook and one `ProposalAnswer` component; use
  one freshness contract across thread, conversation and proposals board.
- Group the seven itinerary tabs or add a "More" menu; add a scroll cue.
- Show a "We restored your draft from…" notice; validate future dates; explain
  disabled wizard steps.
- Align the two split-pane height models.
- Make trip cards keyboard reachable with one real link.
- Give every activity icon button an `aria-label`; raise targets; separate
  delete from rename.
- Fix skeleton shape via C-16.

**C-21 — image delivery and third-party dependencies**

- Build one `AppImage` with `srcset`/`sizes`, `priority`, intrinsic dimensions,
  a local fallback and an optional blur placeholder.
- Use `priority` for the first above-the-fold hero; lazy-load the rest.
- Render the auth photo only at `lg` and above; bundle a local image instead of
  a remote 1400px Unsplash URL.
- Serve covers through the app or a configured image CDN rather than raw
  Unsplash.

### Surfaces

Auth, Profile, Account tabs, invite/reset pages, public discovery cards, hero
tiles, proposal confirmation, NotFound, `AgencySettings.tsx`, agency package/
quote/directory editors, traveller dashboard/library/plan/enquiries/proposals,
image component, auth photo panel, cover rendering.

### Dependencies

- Gate A closed: C-08, C-17, C-18, C-13, C-14, C-16 and C-07 must be merged.
- C-20 for the default share image used by C-21.
- Product decision on the proposal iframe fallback and the auth image source.
- Reconcile the existing auth/account branch before C-28; keep completed
  sections, then add the missing Account split and session-loader work.

### Exit gate

- The Account tab is scannable in three sections.
- No auth page starts at `h3`.
- An email-bound invite has a one-click recovery.
- Reset success does not reload the document.
- Clicking anywhere on a discovery card opens it.
- Mobile shows the count.
- The proposal second step has a visible exit.
- The proposal body renders under the production CSP.
- A long unknown path does not overflow at 360px.
- Saving on "Public profile" cannot change branding or default terms.
- Navigating away from any dirty editor prompts; a refresh preserves or warns
  about unsaved work.
- Search finds a trip in any tab; enquiry pill counts reconcile with "All".
- The same proposal decision looks and behaves the same everywhere.
- All itinerary tabs are discoverable at 768px.
- A restored draft cannot generate a past trip.
- Mobile downloads a width-appropriate image.
- No above-the-fold hero is lazy; the auth image is not requested below `lg`.
- No public page depends on Unsplash availability.

### Validation

- Route sweep at 390/768/1440 in light/dark for the public and traveller
  surfaces.
- CSP test in a production build, not only dev.
- Network waterfall at 390px for the auth image and hero; verify no remote
  Unsplash request on public pages.
- Dirty-editor script: edit, navigate, refresh, choose each branch.
- Search and count reconciliation with seeded data spanning multiple tabs and
  pages.

### Risks

- C-25 is broad. Keep to the listed items; do not absorb unrelated traveller
  ideas.
- C-06 changes save semantics; add a regression test that saving one section
  leaves another section's values untouched.
- Image CDN work may be infrastructure-dependent. Ship `AppImage` with local
  fallbacks first, then swap the source.

---

## Phase 9 — Responsive data, bundle boundaries and budgets

**Priority:** P1–P2 · **Effort:** L + M–L + M (~4–6 weeks) · **Gate:** B → C
**Changes:** **C-19** (P1–P2, L), **C-22** (P1–P2, M–L), **C-29** (P2, M)
**Findings:** P1-15, P4-03, P4-09, P4-10, P4-14, P5-03, P5-11, P5-13, P6-11,
P6-12, P6-13, TRV-14

### Objective

Make dense operational data usable at 390px, remove heavy libraries from routes
that do not need them, and measure performance against budgets instead of
anecdote.

**Status (2026-11-19):** implemented at source level; frontend typecheck,
production build and the new bundle-budget check pass. Table checks at
390/768px, the hidden-tab network log and the LCP/CLS mobile profile remain
browser evidence, recorded in `docs/ui-review/baseline/phase-9-baseline.md`.

### Sequence within the phase

1. **C-19 — shared responsive data table** (depends on C-13, C-14, C-18, C-12,
   C-10).
2. **C-22 — bundle boundaries** (independent of C-19; can run in parallel once
   Phase 7 is merged).
3. **C-29 — request hygiene and budgets** last, because C-22 changes the numbers
   the budgets measure.

### Scope

**C-19 — shared responsive data table**

- Build one `DataTable` with a mobile card renderer, sticky first column, sticky
  action column, labelled focusable scroll region and a scroll cue.
- Migrate the agency enquiry and trip lists and all admin directories.
- Keep the desktop table visually unchanged.
- Use the existing Clients/Team card pattern as the reference.

**C-22 — bundle boundaries for map, charts, chat and PDF**

- Split `ItineraryDisplay` into `PublicItinerary` and `WorkspaceItinerary`.
- Lazy-load Map and Expenses bodies on first activation or intersection; keep
  chat/crypto out of the public graph.
- Move Leaflet CSS into the map chunk.
- Render PDF pages on demand, size to container/DPR, and avoid retaining
  full-resolution data URLs for every page.

**C-29 — request hygiene and performance budgets**

- Pause polling when the tab is hidden; abort stale reads; debounce free-text
  filters.
- Replace whole-library summary fetches with server-side summaries.
- Set budgets for LCP, CLS, transferred JS and image bytes on `/explore`,
  `/shared/:id`, `/dashboard` and `/auth`; track them in CI.

### Surfaces

`AdminTableFrame.tsx`, agency enquiry/trip lists, admin directories,
`ItineraryDisplay`, map component, expenses/charts, chat, PDF viewer,
`main.tsx` (Leaflet CSS import), data-fetching hooks, CI performance job.

### Dependencies

- Gate B foundation merged: C-10, C-12, C-13, C-14, C-18.
- C-22 before C-29 sign-off.
- Decide the mobile table pattern (cards vs pan) before building C-19.

### Exit gate

- At 390px the row identity and the decision/action are visible without
  horizontal scrolling.
- At 768px no decision column is off-screen without a cue.
- Keyboard users can pan the table and reach the action.
- The shared-trip route does not include Leaflet, Recharts or crypto/chat in its
  initial chunk.
- The dashboard does not mount a second live map in the rail.
- A 20-page PDF shows page one promptly and keeps memory bounded while paging.
- No idle background tab issues recurring list reads.
- Typing a 24-character id issues one request after pause, not 24.
- The four key routes meet the agreed budgets on a throttled mobile profile.

### Validation

- 390px and 768px table checks with long names, long emails and a wide action
  column.
- Bundle analyzer before/after; assert the shared-trip initial chunk contents,
  not just total size.
- Lighthouse or WebPageTest on the four routes with a throttled mobile profile;
  store results in the baseline.
- Network log for a hidden tab and for typing into an id search.
- 20-page PDF memory check with the browser task manager.

### Risks

- C-19 is the largest single change. Migrate agency first, then admin, and keep
  a desktop screenshot baseline.
- Splitting `ItineraryDisplay` can break shared state. Use a component flag and
  move one body at a time.
- Budgets without a stable CI runner will flake. Pin the profile and compare
  against a rolling baseline, not a single run.

---

## Phase 10 — Agency and admin operator efficiency

**Priority:** P2 · **Effort:** M + M (~3–4 weeks) · **Gate:** C
**Changes:** **C-26** (P2, M), **C-27** (P2, M)
**Findings:** P4-04, P4-05, P4-08–P4-17, P5-05, P5-07–P5-11, P5-17, P5-19

### Objective

Make high-volume agency and platform-admin work efficient without changing the
trust and safety model established in Gate A.

### Sequence

**C-26 first**, because it exercises the C-19 table and the C-29 request rules
under the heaviest queue. **C-27 second**, reusing the same table, field,
confirm and empty-state primitives.

### Scope

**C-26 — agency queue efficiency**

- Add enquiry search (name/email/package/client), unassigned/mine filters,
  last-activity sort, row selection and bulk claim/assign/status with undo.
- Add event roster selection, select-all-waiting and capacity-aware bulk
  confirm/decline.
- Compute an uncapped upcoming-trip KPI or label it "Next 3 trips".
- Add summary endpoints for the Overview instead of fetching whole libraries;
  swap the template trip select for a paginated picker.
- Pause trip-list polling while hidden, abort stale requests, and reuse the
  inbox stream/polling pattern.
- Collapse navigation to two or three groups; show a platform-aware shortcut
  hint; put the trip title in the breadcrumb.
- Associate quote/team/client-search labels via C-18.

**C-27 — admin console usability**

- Add a "Pending applications" tile to the Overview; order decision tiles first.
- Paginate the moderation queue or show "showing 50 of N targets"; align report
  vs target nouns.
- Toast each moderation decision with the target and offer Undo/Restore; use
  `AdminNotice` for in-dialog errors.
- Fix the `/admin/account` prefix match so `/admin/accounts` keeps its section
  link.
- Humanise audit action/target labels; add an expandable detail drawer with
  copy; validate partial ids inline; debounce free-text filters; persist all
  filters in the URL.
- Surface disabled-action reasons visibly.
- Unify empty-state copy across all filters (C-05).
- Centralise status/role labels; remove `text-slate-400`.

### Surfaces

Agency overview, enquiries, events, trips, templates, team, navigation shell;
admin overview, applications, reports, audit, accounts, platform-admins,
`AdminTableFrame`, `AdminPagination`, navigation.

### Dependencies

- C-19 for agency enquiry/trip lists and admin directories.
- C-18 for search/label semantics.
- C-05 for empty/error copy.
- C-29 for polling and debounce behaviour.
- C-07 for bulk destructive actions and undo patterns.

### Exit gate

- An agent can clear a morning inbox without opening every row.
- A 50-person roster can be confirmed in one capacity-aware action.
- The Overview KPI matches the real count.
- An idle background tab stops polling.
- An operator can see every pending decision from the Overview.
- The queue never silently truncates.
- A decision produces a named confirmation and undo.
- Audit filters are shareable and typed input is debounced.
- No raw `slate-400` or unlabelled status remains in the audited admin views.

### Validation

- Seeded queue script: mixed assignees, statuses and last-activity dates; bulk
  claim 20 rows, undo, verify state.
- Seed a 50-person roster; bulk confirm and decline with capacity limits.
- Compare the KPI to a direct database count.
- Hide the tab for 10 minutes; assert no polling requests.
- Create 60+ pending applications/reports; verify pagination or an explicit
  "showing 50 of N".
- Audit URL round-trip: set filters, copy URL, open in a new session.
- Type a partial id; assert one debounced request and inline validation.

### Risks

- Bulk actions multiply destructive risk. Reuse C-07's model; no one-click bulk
  delete.
- Large seeded fixtures are required; build them as scripts, not manual data.
- Admin queue truncation can hide a real decision. Prefer pagination over a
  larger silent cap.

---

## Dependency graph

```
Phase 0 (baseline)
   |
Phase 1 (C-09, C-11: theme + accent)
   |
   +--> Phase 2 (C-01, C-02, C-20: public trust)
   |
   +--> Phase 3 (C-03, C-04: generation + data truth)
   |
   +--> Phase 4 (C-07, C-08: safety + recovery)
   |
   +--> Phase 5 (C-05, C-16, C-17, C-30: states, a11y, motion)
             |
Phase 6 (C-23 decision -> C-12 tokens -> C-10 type)
             |
Phase 7 (C-13, C-14, C-15, C-18: primitives, touch, focus, forms)
             |
             +--> Phase 8 (C-28, C-24, C-06, C-25, C-21: realm UX)
             |
             +--> Phase 9 (C-19 -> C-22 -> C-29: table, bundles, budgets)
                        |
Phase 10 (C-26, C-27: operator efficiency)
```

**Hard rules**

- C-23 decision before C-10.
- C-09/C-11 before any contrast-dependent page fix; otherwise the fix will be
  redone.
- C-05 and C-16 in the same phase.
- C-13, C-14 and C-18 before C-19.
- C-19 before C-26/C-27 table migrations.
- C-22 before C-29 budget sign-off.
- C-07 before C-06 and before C-26 bulk actions.

## Decision log required by this plan

| ID | Decision | Blocks | Owner |
|---|---|---|---|
| D-A | Are shared-trip budgets private or shared? | C-02 | Product + Privacy |
| D-B | Does "Take a copy" clone a draft or is it relabelled? | C-02 | Product + Design |
| D-C | Does "Stop generating" cancel client wait only or server work too? | C-03 | Engineering + Product |
| D-D | D-13 typography: Manrope + Newsreader, or Cabin only? | C-23, C-10 | Brand + Design |
| D-E | Confirm the 8/64 password policy and optional name across all surfaces | C-08 | Product + Security |
| D-F | Delete account: self-serve request, support queue, or immediate deletion? | C-08, C-28 | Product + Legal |
| D-G | Mobile table pattern: cards, pan, or hybrid? | C-19 | Design + Engineering |
| D-H | Numeric performance budgets and test profile for the four key routes | C-29 | Engineering + Product |
| D-I | Proposal iframe: relax CSP to `'self'`, or serve a same-origin document? | C-24 | Engineering + Security |

| ID | Resolved | Consequence |
|---|---|---|
| D-A | 2026-11-18 — **private** (Product + Privacy) | `projectPublicTrip` strips `budget_per_person` and `budget_breakdown`; the public itinerary renders no Expenses tab. The "budgets stay private" copy is now true. Revisiting this needs a projection change and a re-run of `publicProjection.test.ts`. |
| D-B | 2026-11-18 — **relabel** (Product + Design) | Both shared-trip CTAs say "Start planning your own trip" and open a blank `/plan`; the itinerary is labelled read-only. No clone endpoint exists, so the label is the contract. A future clone feature must rename the CTA again. |
| D-C | 2026-11-18 — **real server-side cancel** (Engineering + Product) | "Stop generating" aborts the provider stream and saves nothing; the overlay says so. A per-attempt `x-generation-attempt` key plus a partial unique index makes cancel-then-retry yield one trip. The provider may still bill an accepted request, so the copy never claims the provider stopped. |
| D-D (D-13) | 2026-11-18 — **Manrope + Newsreader** (Brand + Design) | The direction already in the working tree wins: Manrope carries UI/body, Newsreader carries display headings. Both move to self-hosted variable fonts, so the CSP drops the Google Fonts origins and no component sets its own family; `src/styles/typography.css` is the only place the families are named. The stale "Cabin only" direction is retired. |

Record each decision with date, owner and consequence in the plan's working
copy or the existing decision log (`docs/auth-phase-0-decisions.md` for D-D/D-E/
D-F). A phase cannot exit with an open decision that changes its acceptance
criteria.

## Release gates

### Gate A — Stop-ship (end of Phase 5)

Ship only when:

- All P0 changes are merged and verified on the named surfaces.
- The contrast matrix passes in all four themes.
- Admin portals and agency dark mode render correctly.
- Legal pages are reachable; the shared-trip contract is truthful.
- Generation can be cancelled and left without creating a trip.
- No map pin or time label is fabricated.
- Reset preflight and destructive-action guards work.
- A 500/403/timeout cannot render as an empty state.
- First Tab reveals a skip link; every reviewed page has one `h1`.
- Reduced-motion mode shows no looping motion.

If any item fails, the release is blocked. There is no "known issue" exception
for C-01, C-02, C-03, C-04, C-05 or C-08.

### Gate B — Experience baseline (end of Phase 8)

Ship only when:

- One typography and palette system is in use; scans pass.
- Headers, filters, fields, dialogs and touch targets are shared.
- Public, auth, agency-settings and traveller findings are closed.
- Images are width-appropriate and no public page depends on Unsplash.
- C-19 and C-22 are either merged or explicitly scheduled into Gate C with a
  named owner and date.

### Gate C — Structural and scale (end of Phase 10)

Ship only when:

- Agency and admin tables work at 390px and by keyboard.
- The shared-trip route excludes map, charts and chat/crypto from its initial
  chunk.
- The four key routes meet the agreed budgets on the test profile.
- Agency and admin queues support search, selection, pagination and undo.
- A follow-up audit re-runs the baseline measurements and reports deltas.

## Work tracking

| Change | Phase | Priority | Effort | Owner | Status |
|---|---|---:|---|---|---|
| C-09 Accent roles | 1 | P0 | S | | Implemented — visual sign-off pending |
| C-11 Root theme | 1 | P0 | M | | Implemented — visual sign-off pending |
| C-01 Legal reachability | 2 | P0 | S | | Implemented — visual sign-off pending |
| C-02 Shared-trip contract | 2 | P0 | M | | Implemented — visual sign-off pending |
| C-20 Metadata/indexability | 2 | P0 | S | | Implemented — chat-client preview pending |
| C-03 Generation lifecycle | 3 | P0 | M | | Implemented — live check passed |
| C-04 Map/time truth | 3 | P0 | M | | Implemented — live data lacked unmapped cases |
| C-07 Destructive model | 4 | P0 | M | | Implemented — live dialog pass pending |
| C-08 Password/recovery | 4 | P0 | M | | Implemented — browser/password-manager check pending |
| C-05 Async states | 5 | P0 | S–M | | Implemented — failure simulation pending |
| C-16 Loading taxonomy | 5 | P1 | M | | Implemented — slow-network check pending |
| C-17 Accessibility | 5 | P0–P1 | S–M | | Implemented — axe/keyboard pass pending |
| C-30 Reduced motion | 5 | P0–P1 | S | | Implemented — reduced-motion recording pending |
| C-23 Typography decision | 6 | P1 | S–M | | Implemented — Manrope + Newsreader self-hosted; screenshot baseline pending |
| C-12 Semantic colour | 6 | P1 | M | | Implemented — palette scan 0; browser contrast check pending |
| C-10 Type scale | 6 | P1 | M | | Implemented — micro-type scan 0; lint rules in CI |
| C-13 Page scaffolding | 7 | P1 | M | | Implemented — 29 PageHeader consumers; `/design` route added |
| C-14 Touch targets | 7 | P1 | S–M | | Implemented — coarse rules central; measurement pending |
| C-15 Focus/overlays | 7 | P1 | S–M | | Implemented — Radix everywhere; keyboard pass pending |
| C-18 Form semantics | 7 | P1 | M | | Implemented — label audit 0; password-manager check pending |
| C-28 Auth/account UX | 8 | P1 | M | | Implemented — three-section Account, replace-code confirm; invite/reset browser pass pending |
| C-24 Public discovery | 8 | P1 | S–M | | Implemented — stretched links, gated tiles, CSP `frame-src 'self'` + fallback |
| C-06 Settings save guards | 8 | P1 | M | | Implemented — scoped saves + route/refresh guard; dirty-editor browser script pending |
| C-25 Traveller IA | 8 | P1 | M | | Implemented — All scope, server counts, shared proposal answer, tab More menu |
| C-21 Images | 8 | P1 | M | | Implemented — `AppImage`, same-origin cover proxy, local auth photo; waterfall check pending |
| C-19 Responsive table | 9 | P1–P2 | L | | Implemented — one `DataTable`; agency inbox + 7 admin tables migrated; 390/768 checks pending |
| C-22 Bundle boundaries | 9 | P1–P2 | M–L | | Implemented — `PublicItinerary`, lazy map/expenses, Leaflet CSS in map chunk, paged PDF |
| C-29 Request/perf budgets | 9 | P2 | M | | Implemented — hidden-tab polling, abortable Explore, debounced filters, CI bundle budget; LCP/CLS baseline pending |
| C-26 Agency queues | 10 | P2 | M | | Not started |
| C-27 Admin console | 10 | P2 | M | | Not started |

## Low-priority findings

The 22 Low findings do not have standalone consolidated changes. Each is already
owned by the change that touches the same surface:

- public polish → C-24;
- auth/account polish → C-28;
- traveller polish → C-25;
- agency polish → C-26;
- admin polish → C-27;
- cross-cutting polish → C-10, C-12 and C-13.

**Rule:** fix a Low item only while already changing that file for its owning
change, or when it directly affects trust or task completion. Do not open a
separate low-priority wave before Gate C. This prevents the plan from turning
into an unbounded polish backlog.

## Definition of done for this plan

1. Every change C-01–C-30 has a phase, owner and status.
2. Every P0 change is verified on the surface named in
   `recommended-changes.md`, not only in a unit test.
3. Every phase exits with its named evidence stored in the baseline folder.
4. Every decision in the decision log is closed or explicitly deferred with a
   consequence.
5. The follow-up audit re-runs the same measurements: micro-type count, raw
   palette count, contrast matrix, 390px table access, failure-state tests,
   bundle contents and the four route budgets.
