# UI baseline — Phase 7

**Recorded:** 2026-11-18
**Scope:** Phase 7 (C-13 shared page scaffolding, C-14 touch targets, C-15
focus/overlay mechanics, C-18 form semantics).
**Status:** Implemented and source-verified. `/design` was exercised in a
headless browser against the production build; the per-realm touch-emulation
measurement and the password-manager fill matrix have not been run. See **Open
checks**.

This file is the evidence record for the Phase 7 exit gate in
`docs/ui-review/implementation-plan.md`.

## Primitives added

| File | What it owns |
|---|---|
| `frontend/src/components/ui/page-header.tsx` | `PageHeader` — eyebrow, title ladder (`sm`/`md`/`lg`/`xl`), description, meta, actions, icon, breadcrumb slot, realm ink (`public`/`traveller`/`agency`/`admin`), plain vs hero tone, optional heading `id` + `tabIndex` for focus moves |
| `frontend/src/components/ui/segmented-control.tsx` | `SegmentedControl<T>` — one pill treatment, `size="sm" \| "md"`, realm accent, `aria-pressed`, `role="group"`, coarse-pointer height |
| `frontend/src/components/ui/filter-bar.tsx` | `FilterBar` — labelled filter cluster with an actions slot |
| `frontend/src/components/ui/page-section.tsx` | `PageSection` — `aria-labelledby` section with an optional description and actions |
| `frontend/src/components/ui/field.tsx` | `Field` (label/`htmlFor`/hint/error/`aria-describedby`/`aria-invalid`/required marker), `FormErrorSummary` (`role="alert"`), `focusFirstInvalid` / `focusFirstInvalidAfterRender` |

The three realm headers and segmenteds stay as thin adapters so all existing
consumers inherit the shared behaviour without per-page edits:

- `components/traveller/TravellerPageHeader.tsx`, `TravellerSegmented.tsx`
- `components/agency/AgencyPageHeader.tsx`, `AgencySegmented.tsx`
- `components/admin/AdminPageHeader.tsx`, `AdminSegmented.tsx`

`TravellerPageHeader` is adopted (Dashboard/MyTrips, Enquiries, MyProposals,
Profile), so it was kept as the adapter rather than deleted.

## Evidence

### C-13 — page scaffolding

- 29 files reference `PageHeader` (directly or through an adapter). Public
  editorial pages (`Agencies`, `Guidelines`) adopt it directly at `xl`;
  traveller workspace screens at `lg`; agency/admin keep `md`/`sm` for console
  density. The title scale is defined once in `titleSize`:
  `sm` 24px, `md` 30px, `lg` 30–36px, `xl` 36–48px.
- Header replacements in this phase: `MyTripsView`, `Enquiries`, `MyProposals`,
  `Profile`, `Agencies`, `Guidelines`.
- Hand-rolled filter pills replaced with segments in `MyTripsView` (archived
  toggle, status pills) and `Enquiries` (enquiry filters); `MyProposals` wraps
  its filter row in `FilterBar`.
- `/design` (`frontend/src/pages/DesignSystem.tsx`, lazy route in `App.tsx`)
  renders every primitive: PageHeader at two sizes, realm accents (agency light
  and dark, admin), SegmentedControl at both sizes, FilterBar, Field with hint
  and error, FormErrorSummary, buttons, pagination. Verified in a headless
  browser: title, 7 sections and 32 buttons render; the dark preview toggle and
  the segmented `aria-pressed` state change on click. No page-level console
  errors beyond the expected `/api/*` 500s from serving `dist` without the
  backend.

### C-14 — touch targets

- Tailwind `coarse` variant added in `tailwind.config.ts`
  (`@media (pointer: coarse)`).
- `Button` default `coarse:h-11`; `sm` `coarse:h-11`; `icon`
  `coarse:h-11 coarse:w-11`. `Input` and `SelectTrigger` `coarse:h-11`.
  `SegmentedControl` `coarse:min-h-11 coarse:px-4`. `DialogClose`
  `coarse:h-11 coarse:w-11`.
- Global rule in `src/index.css` raises icon-only buttons and links to
  `2.75rem` on coarse pointers (`:has(> svg:only-child)`), covering ad-hoc icon
  actions that do not use `Button`.
- Ad-hoc pills converted: wizard `StepStyle`, `StepWhen`, `StepWhere`, `Navbar`
  links, `Agencies` filter trigger, `Guidelines` anchor pills, `Profile`
  section tabs, lost-reason presets.
- Destructive separation: a 44px spacer sits between Accept and Decline in
  `EnquiryThreadPane`; the agency event Decline button carries `sm:ml-11` next
  to Publish. Fine-pointer heights (36–40px) are unchanged, so desktop density
  is preserved.

### C-15 — overlays and pagination focus

- `GenerationOverlay` is now a Radix `Dialog` (trap, restore, Escape → cancel
  path, interact-outside blocked, title in `DialogPrimitive.Title`, no early
  return so the exit animation still runs).
- The Dashboard "opening itinerary" scrim is a Radix `Dialog` with an `sr-only`
  title and `aria-busy`; it keeps its skeleton and blocks Escape/interact-outside
  because the state has no cancel.
- Audit: no `role="dialog"` / `aria-modal` remains outside
  `components/ui` (`AdminPagination` matches only because it scopes to the
  nearest `[role="dialog"]`).
- Table scroll regions were already focusable and labelled:
  `ui/table.tsx` sets `role="region"`, `aria-label={scrollLabel}`, `tabIndex=0`
  when a label is supplied; `AdminTableFrame` always does.
- `AdminPagination` rewrote `goToPage`: after `onChange`, `rAF` resolves a scope
  (nearest dialog → nearest `main` → body), targets `focusTargetId` when given
  else the scope's `h1, h2`, adds `tabindex=-1` if missing, scrolls it into view
  and focuses it. The `aria-live` count is unchanged. 13 pages use the
  component; all fall back to the header inside their own container, including
  pagination inside `AgencyEvents`' dialog, where scoping to the dialog keeps
  focus from escaping to the page heading behind it.

### C-18 — form semantics

- Every `Label` in `src` now has `htmlFor` pointing at an existing control `id`,
  or the visible label became a `<span>` on a `role="group"` that owns the
  group (multi-control clusters such as map coordinates, day pickers, colour
  swatches, contact switches, photo pickers). A script that cross-checks static
  `htmlFor` values against `id` values in the same file reports 0 orphans; a
  second scan reports no `<Input>`/`<Textarea>`/native control without an
  `id`, `aria-label` or wrapping `<label>`.
- Newly wired in this phase: agency team invite dialog (role/type/uses/expiry/
  link), agency quote panel (currency + per-line quantity/unit price; line total
  became a `<span>` because it is computed, not a control), admin ownership
  transfer selects, admin invite role/kind, dashboard activity/expense/route/
  stay editors, invite dialog, chat composer, share link, copyable invite link,
  proposal reply composers, agency settings colour hex fields, hidden file
  inputs, template/PDF asset pickers and both cover-picker labels.
- Search fields without a visible label carry `aria-label` (agency clients now
  included; admin directories already did). The traveller enquiries search was
  already labelled.
- Login semantics: admin and agency login use `autoComplete="username"` for the
  email and stable `name` attributes on every input; `AdminLogin` already used
  `username`. `ForgotPassword` remembers the address in `sessionStorage`;
  `ResetPassword` renders a hidden, read-only `name="username"`
  `autoComplete="username"` input so password managers update the right entry,
  then clears the stored address on success.
- Stable `name` attributes added to agency invite, admin password change and
  agency password change fields.
- The traveller handle keeps `name="handle"` with `autoComplete="off"`; no
  `username` hint remains on the public handle.
- Validation focus: `Profile` now routes its three forms through
  `focusFirstInvalidAfterRender` — password, name and public-identity forms mark
  the offending control with `aria-invalid`, and the identity error gained an id
  used by both handle and bio descriptions.
- "Mark lost" (agency enquiries): shows the selected enquiry's contact and
  package, keeps the preset reason pills, and the textarea is now a `Field` with
  a required marker, hint and `name="lostReason"`; the action stays disabled
  until a trimmed reason exists.

## Commands run

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | pass |
| `npx eslint` on every touched file | no new findings; remaining errors are the pre-existing `no-explicit-any` set |
| `npm run ui:check` | pass — raw palette 0, micro-type 0 |
| `npm run ui:contrast` | pass — all declared pairs |
| `npm run build` (frontend) | pass (48 s) |
| `npx tsc --noEmit` (backend) | pass — no backend change in this phase |
| Headless `/design` check | page renders, 7 sections, toggle and segments respond |

## Exit gate mapping

| Gate | Evidence |
|---|---|
| Adjacent traveller screens use one title scale | MyTrips/Enquiries/MyProposals/Profile render `PageHeader` at `lg`; public editorial pages use `xl` only |
| One selected treatment and height per density for filters | All pills are `SegmentedControl` (`sm`), same active fill per realm, `coarse:min-h-11` |
| No page re-implements a header or filter block | 29 `PageHeader` consumers; traveller filter rows moved to `SegmentedControl`/`FilterBar` |
| Every control ≥44×44px at 390px touch emulation | Rules applied centrally (coarse variant + icon-only global rule); **not measured on device** — see Open checks |
| Confirm and Decline are not adjacent 28px targets | 44px spacer in `EnquiryThreadPane`; `sm:ml-11` on agency event Decline |
| No keyboard user can tab behind a scrim | Both non-Radix scrims converted to `Dialog`; no `aria-modal` outside `components/ui` |
| Escape closes every modal with a cancel path | Radix `onOpenChange` maps close → cancel; the non-cancellable itinerary scrim blocks Escape intentionally |
| Paging moves focus; scroller reachable and labelled | `AdminPagination` focuses the scoped heading after `onChange`; table scrollers are labelled `role="region"` with `tabIndex=0` |
| Every visible label is programmatically associated | Static `htmlFor`↔`id` audit: 0 orphans; control audit: 0 unlabelled inputs/textareas/selects |
| Invalid submit focuses first error and announces it | `Profile` forms focus the first `aria-invalid` control and keep `role="alert"` inline copy; `FormErrorSummary` is the shared announcement slot |
| "Mark lost" exposes selected state and a labelled required textarea | Contact + package summary added above a `Field`-wrapped required `lostReason` textarea |

## Open checks

1. **Touch measurement at 390px** — run the emulated-touch ruler over the five
   most-used screens per realm and record any control still under 44px. The
   coarse rules were reasoned from classes, not measured.
2. **Password-manager matrix** — Chrome + 1Password/Bitwarden on admin login,
   agency login, personal login, forgot/reset and both password-change forms:
   save, fill, and update. The hidden username on reset is wired but unverified
   against a real extension.
3. **Keyboard pass per realm** — open each modal, Tab cycle, Escape, confirm
   focus restores to the trigger, then page a table and confirm the heading
   receives focus and is announced with the count.
4. **Axe forms run** — confirm the newly wired selects (per-row role/status)
   are not announced twice and that the group spans have not orphaned the
   switch/checkbox labels.
5. **/design sign-off** — design and engineering review in both themes at 390px
   before Phase 8 starts.
