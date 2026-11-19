# Recommended changes — waytowalk UI/UX review

**Purpose:** one actionable, deduplicated list of every change recommended by
the six phase reports.
**Mode:** audit output. No product code was changed.
**Date:** 2026-11-17.
**Sources:** `phase-1-public-discovery.md` through
`phase-6-foundations-cross-cutting.md` in this folder.

## How to use this file

1. Start with **Wave 0** — the trust, correctness and stop-ship fixes. Most are
   small and unblock the rest.
2. Treat **C-09 to C-18** as the foundation layer: fixing these once removes
   dozens of page-level findings.
3. Schedule **C-19 to C-30** as structural work, not a single sprint.
4. Use the **coverage map** at the end to confirm every phase finding is
   accounted for.
5. Each change has a **done when** test. A change is not complete because the
   code compiles; it is complete when the test passes on the named surface.

**Priority meaning**

| Priority | Meaning | Target |
|---|---|---|
| **P0** | Stop-ship: broken trust, inaccessible primary action, or incorrect data | Before next external release |
| **P1** | High: repeated task failure, credible data loss, or accessibility blocker | Next 1–2 releases |
| **P2** | Medium: meaningful friction, inconsistency, or scalability risk | Next quarter |
| **P3** | Low: polish, discoverability, or small consistency gain | Opportunistic |

**Effort:** S (≤1 day), M (2–5 days), L (1–3 weeks, multi-file).

---

## Executive verdict

The product is stronger than its defect count suggests. The visual identity is
specific, the copy is often candid and well written, route-level code splitting
is already a habit, and several local patterns are excellent: the admin list
scaffold, the agency page header, the traveller empty states, the invite consent
flow, and the destructive-action copy.

The weakness is not taste. It is **systemisation**. Five realms solved the same
problems independently: four theme strategies, four page-header patterns, four
loading treatments, four destructive-action models, and an accidental 9–11px
type scale used 882 times. That is why the same defects recur across unrelated
pages. Fixing them one by one will not hold; the foundation changes below are
the leverage.

The three genuinely urgent items are:

1. **Legal pages cannot be found from the public site** (C-01).
2. **The shared-trip page promises one thing and does another** — "Take a copy"
   does not copy, and budgets are promised private while a budget tab renders
   (C-02).
3. **Itinerary generation cannot be cancelled or left**, and the completion
   callback navigates even after the user leaves (C-03).

---

## Top 10 moves, ordered by impact and effort

| # | Change | Priority | Effort | Why now |
|---|---|---|---|---|
| 1 | **C-01** Make Terms and Privacy reachable and give the legal shell a real exit | P0 | S | Compliance and trust; one footer + one link |
| 2 | **C-09** Split accent tokens into fill / ink / on-fill and fix contrast | P0 | S | One token change fixes four realms; clears 2.65:1 and 1.1:1 failures |
| 3 | **C-05** Never render a failed load as an empty state | P0 | S–M | Prevents false "no data" conclusions in traveller and admin |
| 4 | **C-02** Make the shared-trip contract truthful (copy + budgets) | P0 | M | Highest-intent public action currently misleads |
| 5 | **C-03** Add cancel, abort and lifecycle guards to generation | P0 | M | Longest wait has no exit and can create duplicate trips |
| 6 | **C-11** Move theme ownership to one root provider | P0 | M | Fixes light admin sheet, light toasts, agency inversion at the root |
| 7 | **C-04** Stop inventing map pins and time-of-day labels | P0 | M | Confidently wrong spatial/schedule data in the core artifact |
| 8 | **C-08** Fix reset-link preflight and password policy | P0 | M | Users learn a link is dead only after two password entries |
| 9 | **C-07** Adopt one destructive-action safety model | P0 | M | Unconfirmed tenant transfer and one-click revokes |
| 10 | **C-10** Set a 12px metadata floor and a real type scale | P1 | M | 882 micro-type sites; defines perceived quality everywhere |

---

## Delivery waves

### Wave 0 — Trust, correctness, stop-ship (P0)

| Change | Action | Effort | Phase findings |
|---|---|---|---|
| **C-01** | Legal reachability and legal shell | S | P1-01, P1-18 |
| **C-02** | Shared-trip copy and budget contract | M | P1-03, P1-04 |
| **C-03** | Generation cancel, abort and unmount guards | M | TRV-01 |
| **C-04** | Remove fabricated map pins and time slots | M | TRV-04, TRV-05 |
| **C-05** | Truthful async states (error ≠ empty) | S–M | P1-09, P1-11, TRV-02, P5-02, P5-17, P6-05 |
| **C-07** | One destructive/privileged action model | M | P4-07, P5-04, P6-08 |
| **C-08** | Password, reset and recovery flows | M | P2-01, P2-03, P2-06, P2-07, P2-12, P2-13, P2-14, P2-15, P2-16, P5-16 |
| **C-09** | Accent fill/ink/on-fill roles | S | P1-05, TRV-03, P4-01, P5-06, P6-02 |
| **C-11** | Root theme ownership and portal inheritance | M | P1-07, P4-01, P5-01, P5-15, P6-06 |
| **C-17** | Accessibility foundations | S–M | P1-08, P1-09, P2-08, P4-18, P5-05, P5-13, P6-18 |
| **C-20** | Metadata, share previews and indexability | S | P1-02, P1-17, P6-17 |
| **C-30** | Reduced-motion policy | S | P1-17, TRV-17, P6-16 |

### Wave 1 — Foundation and everyday friction (P1)

| Change | Action | Effort | Phase findings |
|---|---|---|---|
| **C-06** | Settings save boundaries and dirty guards | M | P4-02, P4-13 |
| **C-10** | Type scale and readability | M | P1-06, P1-12, P2-09, TRV-16, P4-06, P5-18, P6-01 |
| **C-12** | Semantic colour tokens and palette cleanup | M | P1-20, P5-06, P5-19, P6-03 |
| **C-13** | Shared page scaffolding primitives | M | TRV-07, TRV-08, P4-15, P6-04 |
| **C-14** | Touch-target system | S–M | P1-12, P2-09, TRV-06, P4-06, P5-18, P6-07 |
| **C-15** | Focus and overlay mechanics | S–M | TRV-01, TRV-17, P5-12, P5-13, P6-10 |
| **C-16** | Loading taxonomy and skeleton fidelity | M | P1-11, TRV-13, P5-02, P6-12 |
| **C-18** | Form semantics and validation focus | M | P2-02, P2-04, P4-11, P4-12, P5-14, P5-16, P6-09 |
| **C-21** | Image delivery and third-party dependencies | M | P1-16, P2-05, P6-14 |
| **C-23** | Decide and encode typography direction | S–M | P2 scorecard, P6-15 |
| **C-24** | Public discovery fixes | S–M | P1-10, P1-12, P1-13, P1-14, P1-17, P1-19 |
| **C-25** | Traveller workspace IA and interaction | M | TRV-06–TRV-19 |
| **C-28** | Auth/account UX completeness | M | P2-06, P2-08, P2-10–P2-16 |
| **C-29** | Request hygiene and performance budgets | M | P4-09, P4-14, P5-11, P6-12 |

### Wave 2 — Structural (P1–P2)

| Change | Action | Effort | Phase findings |
|---|---|---|---|
| **C-19** | Shared responsive data table | L | P4-03, P5-03, P5-13, P6-11 |
| **C-22** | Bundle boundaries for map, charts, chat, PDF | M–L | P1-15, TRV-14, P4-10, P6-13 |
| **C-26** | Agency queue efficiency | M | P4-04, P4-05, P4-08–P4-17 |
| **C-27** | Admin console usability | M | P5-05, P5-07–P5-11, P5-17, P5-19 |

---

## Detailed changes

### C-01 — Legal reachability and legal reading

**Priority:** P0 · **Effort:** S · **Findings:** P1-01, P1-18

Add Terms and Privacy to the public footer's secondary group and to the mobile
sheet. Replace the legal shell's "Back to sign in" with "Back to waytowalk" and
keep the existing companion-policy link. Add a visible table of contents
generated from the document's own headings, with a sticky rail on desktop and a
collapsible list on mobile. Keep the existing section ids.

**Done when:** from `/`, both documents are reachable in two links; from either
document, a reader can return to the public site in one link and jump to any
section without scrolling the whole page; the sign-up consent line links both.

### C-02 — Shared-trip copy and budget contract

**Priority:** P0 · **Effort:** M · **Findings:** P1-03, P1-04

Decide the share contract and enforce it in one place.

- If budgets are private: strip budget fields from the public projection,
  suppress the Expenses tab when no budget is present, and keep the copy.
- If budgets are shared: rewrite the copy to say what is included and add an
  owner share-time toggle.
- Either implement "Take a copy" as a real draft clone seeded from the shared
  payload, or relabel it to "Start planning your own trip" and make the shared
  itinerary visibly read-only.

**Done when:** the public payload contains no budget keys unless explicitly
shared; the rendered page shows no Expenses tab for a private budget; the
primary CTA does exactly what its label says; a regression test asserts the
payload contract.

### C-03 — Generation cancel, abort and unmount guards

**Priority:** P0 · **Effort:** M · **Findings:** TRV-01

Thread an `AbortController` through `generateItineraryStream`. Add an explicit
"Stop generating" action and an always-available close/back control while
streaming. Abort on unmount. Gate `onComplete` on a `cancelled` flag and never
navigate from a callback whose view has unmounted. State whether work continues
if the overlay is dismissed.

**Done when:** a user can leave the overlay at any time without creating a trip;
Back then re-entering does not auto-navigate; cancel followed by retry creates
exactly one trip.

### C-04 — Remove fabricated map pins and time slots

**Priority:** P0 · **Effort:** M · **Findings:** TRV-04, TRV-05

Do not place activities or stays at radial offsets when coordinates are
missing. Put unmapped items in a separate "Location not mapped" list or use a
distinct numbered "approx. area" marker with an explicit legend. Never
synthesise a stay location. Show Morning/Afternoon/Sunset/Night only when a
real time or slot exists; otherwise use "Stop 1" or a category icon with no
time claim.

**Done when:** every pin can be traced to stored coordinates or is visibly
labelled as approximate; reordering activities cannot change a displayed time
of day; a data-truth test opens a trip with no coordinates and no times and
finds no false location or schedule claims.

### C-05 — Truthful async states (error ≠ empty)

**Priority:** P0 · **Effort:** S–M · **Findings:** P1-09, P1-11, TRV-02,
P5-02, P5-17, P6-05

Adopt one `AsyncState` contract with explicit `loading`, `empty`, `error`, and
`forbidden` branches.

- Gate empty states on `!error`.
- Render a persistent error panel with retry in the content area, not only a
  toast.
- Do not let pagination default to "Loading…" after a settled request.
- Announce state changes with `role="status"`/`aria-live`; use `role="alert"`
  for terminal errors.
- Derive empty copy from all active filters and from `total === 0` vs filtered
  zero.

**Done when:** stubbing a 500/403/timeout for every list endpoint produces an
error panel with retry on traveller, agency and admin lists; no failed request
can render "No trips yet" or "No accounts match"; the state change is announced
once.

### C-06 — Settings save boundaries and dirty guards

**Priority:** P1 · **Effort:** M · **Findings:** P4-02, P4-13

Make saving contextual. The agency Settings header Save must not write fields
from hidden tabs. Put the save action inside the visible section, or show one
form with an explicit dirty state and disable the header action on tabs it does
not save. Add a route blocker plus `beforeunload` whenever a package, quote or
directory editor is dirty, with Save / Discard / Stay and a session draft where
practical.

**Done when:** saving on "Public profile" cannot change branding or default
terms; navigating away from any dirty editor prompts; a refresh preserves or
warns about unsaved work.

### C-07 — One destructive/privileged action model

**Priority:** P0 · **Effort:** M · **Findings:** P4-07, P5-04, P6-08

Standardise on one `ConfirmDestructive` recipe built on `AlertDialog`: name the
object, state the consequence, use a specific verb, keep Cancel neutral. Require
typed confirmation (workspace slug or target email) for tenant ownership
transfer and a second confirm for any promotion to `owner`. Remove `owner` from
inline role selects and route it through the guarded flow. Replace
`window.confirm` for destructive actions with the styled dialog; reserve native
confirm for unsaved-change guards. Add undo toasts for reversible actions.

**Done when:** transfer owner cannot complete on a single click; no destructive
action fires from one stray click without a recovery path; every destructive
dialog names the target and consequence; the same component is used in all
realms.

### C-08 — Password, reset and recovery flows

**Priority:** P0 · **Effort:** M · **Findings:** P2-01, P2-03, P2-06, P2-07,
P2-12, P2-13, P2-14, P2-15, P2-16, P5-16

- Validate the reset token on mount and show an expired/invalid state with
  "Send a new link" before rendering password fields.
- Adopt the agreed 8/64 policy with persistent requirements and strength
  feedback on sign-up, reset, Profile and platform-admin change; keep sign-in at
  "required" for existing accounts.
- Add a shared password reveal control.
- Make the name optional, remove confirm-password once reveal exists, and
  remove the duplicate mode switch (D-09/D-10/D-11).
- After reset, update auth context and use SPA navigation rather than a full
  reload.
- Forgot-password success keeps the email, offers "Send again" with cooldown,
  "Use a different email", and a spam hint.
- Replace the inert delete-account button with a working request path.
- Invite mismatch offers "Sign out and continue with {invitedEmail}" while
  preserving the token.
- Return the inviter's display name, not the email local-part.
- Honour `consentRequired` or remove it from the contract.

**Done when:** an expired link is rejected before the form; password managers
save/fill/update correctly; reset lands on `/dashboard` authenticated without a
reload; a wrong-account invite has a one-click recovery; the delete request path
is reachable.

### C-09 — Accent fill / ink / on-fill roles

**Priority:** P0 · **Effort:** S · **Findings:** P1-05, TRV-03, P4-01, P5-06,
P6-02

Split every accent into three roles: fill (`--accent`), text
(`--accent-ink`, ≥4.5:1 on canvas and card), and text on fill
(`--accent-foreground`). Do the same for agency and admin. Replace
`text-accent` with `text-accent-ink`; replace `bg-agency-accent text-white` with
`bg-agency-accent text-agency-on-accent`; replace admin `indigo-500` buttons
with indigo-600 or an `--admin-accent` pair. Keep coral/teal/indigo for fills,
dots, borders and illustration.

**Done when:** coral status text on cream computes ≥4.5:1; the agency dark
primary button computes ≥4.5:1; admin primary buttons compute ≥4.5:1; a CI
contrast check covers every declared pair in all four themes.

### C-10 — Type scale and readability

**Priority:** P1 · **Effort:** M · **Findings:** P1-06, P1-12, P2-09,
TRV-16, P4-06, P5-18, P6-01

Replace the accidental 9–11px scale with five steps: 12px metadata floor, 14px
secondary/UI, 16px body, 20–24px section, 28–48px display. Reserve 11px only
for uppercase overlines that duplicate adjacent text. Convert the 882 arbitrary
sizes (37×9px, 330×10px, 517×11px) to named utilities. Add a lint allow-list
for any remaining micro-type.

**Done when:** no functional text renders below 12px at 390px; table metadata
is ≥12px (11px for uppercase labels); form labels are ≥12px; a lint rule
prevents regression.

### C-11 — Root theme ownership and portal inheritance

**Priority:** P0 · **Effort:** M · **Findings:** P1-07, P4-01, P5-01, P5-15,
P6-06

One `ThemeProvider` owns `{mode, realm}` and writes `.dark` plus
`data-theme="traveller|agency|admin"` to `<html>`. Define each realm's tokens
once under `[data-theme]` and `.dark[data-theme]`. Remove the admin wrapper
strategy. Portalled sheets, dialogs, dropdowns and toasts inherit the root
theme. Mount one Toaster inside the provider. Initialise the toggle state from
the applied class during render, not in an effect. Add a visual test for a
dialog, sheet and toast per realm.

**Done when:** admin's mobile sheet, account drawer and toasts render dark; a
light surface never appears inside a dark realm; the theme toggle's icon and
label match the applied theme on first render; agency dark mode has no cream
fill under white text.

### C-12 — Semantic colour tokens and palette cleanup

**Priority:** P1 · **Effort:** M · **Findings:** P1-20, P5-06, P5-19, P6-03

Define `success`, `warning`, `info`, `--admin-accent`, `--agency-on-accent`,
`--surface-brand`, and `--surface-brand-ink` with light/dark values. Ban default
Tailwind palette utilities outside the token file. Replace the 440 raw palette
matches in 80 files, starting with `AgencyExportPanel`, `AgencyQuotePanel`, the
admin indigo scatter, the public navbar badge and the agency skip link.

**Done when:** a palette scan returns zero default-palette utilities outside
the token layer; every status colour maps to a named semantic token; dark-mode
variants are defined once per token rather than per call site.

### C-13 — Shared page scaffolding primitives

**Priority:** P1 · **Effort:** M · **Findings:** TRV-07, TRV-08, P4-15, P6-04

Build one `PageHeader` (title, description, meta, actions, breadcrumb slot), one
`FilterBar`/`SegmentedControl` with a `size` prop, and one `PageSection`
primitive. Adopt them across public, traveller, agency and admin, with a realm
accent prop rather than a fork. Delete `TravellerPageHeader` if it is not
adopted. Add a `/design` route or Storybook so primitives are reviewed together.

**Done when:** adjacent traveller screens use one title scale; the same filter
job has one selected treatment and one height per density; no page re-implements
a header/filter block.

### C-14 — Touch-target system

**Priority:** P1 · **Effort:** S–M · **Findings:** P1-12, P2-09, TRV-06,
P4-06, P5-18, P6-07

Set a 44px minimum for coarse pointers across `Button`, `Input`, `Select`,
segmented filters and icon actions, using padding to preserve visual density.
Keep 36–40px for fine-pointer desktop where justified. Separate destructive
actions from their neighbours by at least one target width or move them into an
overflow menu.

**Done when:** at 390px with touch emulation, every interactive control in the
five most-used screens per realm measures ≥44×44px or has an equivalent padded
hit area; Confirm and Decline are not adjacent 28px targets.

### C-15 — Focus and overlay mechanics

**Priority:** P1 · **Effort:** S–M · **Findings:** TRV-01, TRV-17, P5-12,
P5-13, P6-10

Route every modal through Radix `Dialog`/`AlertDialog`. Move initial focus into
the dialog, trap it, restore it on close, and map Escape to the cancel path.
Make horizontally scrollable table regions focusable and labelled. On pagination
change, scroll the table heading into view and move focus to it with
`tabIndex={-1}`. Keep the `aria-live` count.

**Done when:** no keyboard user can tab behind a scrim; Escape closes every
modal that has a cancel path; paging moves focus to the new rows; a table
scroller is reachable and labelled.

### C-16 — Loading taxonomy and skeleton fidelity

**Priority:** P1 · **Effort:** M · **Findings:** P1-11, TRV-13, P5-02, P6-12

Define three loading modes: route transition (brand loader), section load
(skeleton matching the real shell), inline action (button spinner). Derive
skeletons from the real card/header components. For discovery, render the page
shell and skeleton grid if data takes more than ~2s instead of blocking on the
brand loader; show a retry after a bounded wait.

**Done when:** Library, trip detail and public discovery skeletons match the
loaded layout's radius, aspect ratio, gaps and header height; no first paint
blocks for 20–40 seconds; loading state is announced.

### C-17 — Accessibility foundations

**Priority:** P0–P1 · **Effort:** S–M · **Findings:** P1-08, P1-09, P2-08,
P4-18, P5-05, P5-13, P6-18

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

**Done when:** first Tab on every public page reveals a visible skip link; every
page has exactly one `h1`; axe reports no heading-order, label or contrast
violations on the reviewed routes.

### C-18 — Form semantics and validation focus

**Priority:** P1 · **Effort:** M · **Findings:** P2-02, P2-04, P4-11, P4-12,
P5-14, P5-16, P6-09

Introduce a shared `Field` primitive that wires `id`, `htmlFor`,
`aria-describedby`, `aria-invalid`, required marker and error slot in one place.
Add a submit helper that focuses the first invalid control and announces a
summary. Use `autocomplete="username"` for login email, stable `name`
attributes, and hidden username fields on reset. Remove `username` from the
public traveller handle. Migrate auth, Profile, agency quote/team/client search
and admin wizard forms.

**Done when:** every visible label is programmatically associated; submitting an
invalid form moves focus to the first error and announces it; password managers
save/fill/update correctly; the "Mark lost" dialog exposes selected state and a
labelled required textarea.

### C-19 — Shared responsive data table

**Priority:** P1–P2 · **Effort:** L · **Findings:** P4-03, P5-03, P5-13, P6-11

Build one `DataTable` with a `mobile` card renderer, sticky first column, sticky
action column, labelled focusable scroll region and a scroll cue. Migrate the
agency enquiry and trip lists and all admin directories. Keep the desktop table
visually unchanged. Use the existing Clients/Team card pattern as the reference.

**Done when:** at 390px the row identity and the decision/action are visible
without horizontal scrolling; at 768px no decision column is off-screen without
a cue; keyboard users can pan the table and reach the action.

### C-20 — Metadata, share previews and indexability

**Priority:** P0 · **Effort:** S · **Findings:** P1-02, P1-17, P6-17

Centralise metadata in one helper that accepts title, description, image,
canonical, `ogType` and `robots`. Add a static 1200×630 brand card as the
default `og:image`/`twitter:image`; allow share routes to override when a cover
exists. Default to `noindex` for authenticated realms. Give NotFound a title and
`noindex`.

**Done when:** a shared itinerary or proposal renders an image card in WhatsApp,
Slack and iMessage; private shells are not indexable; every route has a title
and description.

### C-21 — Image delivery and third-party dependencies

**Priority:** P1 · **Effort:** M · **Findings:** P1-16, P2-05, P6-14

Build one `AppImage` with `srcset`/`sizes`, `priority`, intrinsic dimensions, a
local fallback and an optional blur placeholder. Use `priority` for the first
above-the-fold hero; lazy-load the rest. Render the auth photo only at `lg` and
above and bundle a local image instead of a remote 1400px Unsplash URL. Serve
covers through the app or a configured image CDN rather than raw Unsplash.

**Done when:** mobile downloads a width-appropriate image; no above-the-fold
hero is lazy; the auth image is not requested below `lg`; no public page depends
on Unsplash availability.

### C-22 — Bundle boundaries for map, charts, chat and PDF

**Priority:** P1–P2 · **Effort:** M–L · **Findings:** P1-15, TRV-14, P4-10,
P6-13

Split `ItineraryDisplay` into `PublicItinerary` and `WorkspaceItinerary`.
Lazy-load Map and Expenses bodies on first activation or intersection; keep
chat/crypto out of the public graph. Move Leaflet CSS into the map chunk.
Render PDF pages on demand, size to container/DPR, and avoid retaining
full-resolution data URLs for every page.

**Done when:** the shared-trip route does not include Leaflet, Recharts or
crypto/chat in its initial chunk; the dashboard does not mount a second live map
in the rail; a 20-page PDF shows page one promptly and keeps memory bounded
while paging.

### C-23 — Decide and encode typography direction

**Priority:** P1 · **Effort:** S–M · **Findings:** P2 scorecard, P6-15

Decide D-13 explicitly: migrate to Manrope + Newsreader with self-hosted
variable fonts and a visual-regression baseline, or update the brand decision
to "Cabin only" and remove the stale direction. Encode the winner in
`tailwind.config.ts` and one typography token file.

**Done when:** the decision log and the implementation agree; no page chooses a
font family locally; a visual-regression baseline covers the five
highest-traffic screens.

### C-24 — Public discovery fixes

**Priority:** P1 · **Effort:** S–M · **Findings:** P1-10, P1-12, P1-13,
P1-14, P1-17, P1-19

- Make the whole public card one link via a stretched title anchor, or confine
  the hover to the linked regions.
- Keep the actual count visible on mobile discovery tiles.
- Add a "Not yet / Go back" exit to the proposal confirmation and label the
  confirm action with its consequence.
- Verify the production CSP against the proposal `srcDoc` iframe; if blocked,
  relax `frame-src` to `'self'` or serve a same-origin document, and add a
  non-iframe fallback.
- Fix NotFound: respect reduced motion, use one link (not Link wrapping Button),
  truncate the attempted path, add meta.
- Drive hero discovery tiles from the same capability flags as the navbar.

**Done when:** clicking anywhere on a discovery card opens it; mobile shows the
count; the proposal second step has a visible exit; the proposal body renders
under the production CSP; a long unknown path does not overflow at 360px.

### C-25 — Traveller workspace IA and interaction

**Priority:** P1 · **Effort:** M · **Findings:** TRV-06–TRV-19

- Adopt one page-title scale and one filter control (C-13); add a density prop
  instead of per-page overrides.
- Add an "All" library scope or make search global; move Trash out of the status
  row.
- Return per-filter enquiry counts from the server; stop tallying loaded pages.
- Extract one `useProposalAnswer` hook and one `ProposalAnswer` component; use
  one freshness contract across thread, conversation and proposals board.
- Group the seven itinerary tabs or add a "More" menu; add a scroll cue.
- Show a "We restored your draft from…" notice; validate dates in the future;
  explain disabled wizard steps.
- Align the two split-pane height models.
- Make trip cards keyboard reachable with one real link.
- Give every activity icon button an `aria-label`; raise targets; separate
  delete from rename.
- Fix skeleton shape via C-16.

**Done when:** search finds a trip in any tab; enquiry pill counts reconcile with
"All"; the same proposal decision looks and behaves the same everywhere; all
itinerary tabs are discoverable at 768px; a restored draft cannot generate a
past trip.

### C-26 — Agency queue efficiency

**Priority:** P2 · **Effort:** M · **Findings:** P4-04, P4-05, P4-08–P4-17

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

**Done when:** an agent can clear a morning inbox without opening every row; a
50-person roster can be confirmed in one capacity-aware action; the Overview
KPI matches the real count; an idle background tab stops polling.

### C-27 — Admin console usability

**Priority:** P2 · **Effort:** M · **Findings:** P5-05, P5-07–P5-11, P5-17,
P5-19

- Add a "Pending applications" tile to the Overview and order decision tiles
  first.
- Paginate the moderation queue or show "showing 50 of N targets"; align report
  vs target nouns.
- Toast each moderation decision with the target and offer Undo/Restore; use
  `AdminNotice` for in-dialog errors.
- Fix the `/admin/account` prefix match so `/admin/accounts` keeps its section
  link.
- Humanise audit action/target labels, add an expandable detail drawer with
  copy, validate partial ids inline, debounce free-text filters, persist all
  filters in the URL.
- Surface disabled-action reasons visibly.
- Unify empty-state copy across all filters (C-05).
- Centralise status/role labels; remove `text-slate-400`.

**Done when:** an operator can see every pending decision from the Overview;
the queue never silently truncates; a decision produces a named confirmation and
undo; audit filters are shareable and typed input is debounced.

### C-28 — Auth/account UX completeness

**Priority:** P1 · **Effort:** M · **Findings:** P2-06, P2-08, P2-10–P2-16

- Split Account into Profile, Sign-in & password, and Advanced: chat backup;
  confirm "Replace recovery code" and keep the code copy/download prominent.
- Add an `h1` to every auth screen (C-17).
- Add reveal and password-manager semantics (C-08/C-18).
- Add invite account-switch, reset resend/edit-email, and a working deletion
  request path (C-08).
- Return the inviter's display name (C-08).
- Render the session loader while auth state resolves; accept the reset user
  into context and use SPA navigation.

**Done when:** the Account tab is scannable in three sections; no auth page
starts at `h3`; an email-bound invite has a one-click recovery; reset success
does not reload the document.

### C-29 — Request hygiene and performance budgets

**Priority:** P2 · **Effort:** M · **Findings:** P4-09, P4-14, P5-11, P6-12

Pause polling when the tab is hidden, abort stale reads, debounce free-text
filters, and replace whole-library summary fetches with server-side summaries.
Set budgets for LCP, CLS, transferred JS and image bytes on `/explore`,
`/shared/:id`, `/dashboard` and `/auth`; track them in CI.

**Done when:** no idle background tab issues recurring list reads; typing a
24-character id issues one request after pause, not 24; the four key routes meet
the agreed budgets on a throttled mobile profile.

### C-30 — Reduced-motion policy

**Priority:** P0–P1 · **Effort:** S · **Findings:** P1-17, TRV-17, P6-16

Add a global reduced-motion rule for non-essential animation utilities and a
`useReducedMotion` hook for component-level decisions. Disable
`animate-ping`/`animate-pulse`/`animate-fade-in` in the generation overlay and
live indicators, and replace the 404 compass's infinite spin with a one-shot
reveal or static mark.

**Done when:** with `prefers-reduced-motion: reduce`, generation, live status,
skeletons and NotFound show no looping motion.

---

## Sequencing and dependencies

1. **C-09, C-11 and C-12 first.** Theme and accent roles are prerequisites for
   the agency, admin and public contrast fixes; doing them per page will be
   rework.
2. **C-05 and C-16 together.** The async contract and loading taxonomy share the
   same state model; split them and pages will keep inventing states.
3. **C-13, C-14 and C-18 before C-19.** The data table should consume the shared
   header, touch and field primitives, not create a fourth fork.
4. **C-22 before performance sign-off.** Bundle work changes the numbers that
   C-29's budgets measure.
5. **C-23 before any broad typography sweep.** Do not migrate 882 micro-type
   sites into a font family that is about to change.

---

## Coverage map — every phase finding

**Phase 1 — Public discovery (20)**

C-01: P1-01, P1-18 · C-02: P1-03, P1-04 · C-05: P1-09, P1-11 · C-09: P1-05 ·
C-10: P1-06 · C-11: P1-07 · C-12: P1-20 · C-14: P1-12 · C-16: P1-11 ·
C-17: P1-08, P1-09 · C-20: P1-02, P1-17 · C-21: P1-16 · C-22: P1-15 ·
C-24: P1-10, P1-12, P1-13, P1-14, P1-17, P1-19 · C-30: P1-17.

**Phase 2 — Auth and account (16)**

C-08: P2-01, P2-03, P2-06, P2-07, P2-12, P2-13, P2-14, P2-15, P2-16 ·
C-10: P2-09 · C-14: P2-09 · C-17: P2-08 · C-18: P2-02, P2-04 ·
C-21: P2-05 · C-28: P2-06, P2-08, P2-10, P2-11, P2-13, P2-14, P2-15, P2-16.

**Phase 3 — Traveller workspace (19)**

C-03: TRV-01 · C-04: TRV-04, TRV-05 · C-05: TRV-02 · C-09: TRV-03 ·
C-10: TRV-16 · C-13: TRV-07, TRV-08 · C-14: TRV-06 · C-15: TRV-01, TRV-17 ·
C-16: TRV-13 · C-22: TRV-14 · C-25: TRV-06, TRV-07, TRV-08, TRV-09, TRV-10, TRV-11,
TRV-12, TRV-13, TRV-15, TRV-18, TRV-19 · C-30: TRV-17.

**Phase 4 — Agency workspace (18)**

C-06: P4-02, P4-13 · C-07: P4-07 · C-09: P4-01 · C-10: P4-06 ·
C-11: P4-01 · C-13: P4-15 · C-14: P4-06 · C-17: P4-18 ·
C-18: P4-11, P4-12 · C-19: P4-03 · C-22: P4-10 ·
C-26: P4-04, P4-05, P4-08, P4-09, P4-14, P4-15, P4-16, P4-17 ·
C-29: P4-09, P4-14.

**Phase 5 — Platform admin (19)**

C-05: P5-02, P5-17 · C-07: P5-04 · C-08: P5-16 · C-09: P5-06 ·
C-10: P5-18 · C-11: P5-01, P5-15 · C-12: P5-06, P5-19 ·
C-14: P5-18 · C-15: P5-12, P5-13 ·
C-16: P5-02 · C-17: P5-05, P5-13 · C-18: P5-14, P5-16 ·
C-19: P5-03, P5-13 · C-27: P5-05, P5-07, P5-08, P5-09, P5-10,
P5-11, P5-17, P5-19 · C-29: P5-11.

**Phase 6 — Foundations (18)**

C-05: P6-05 · C-07: P6-08 · C-09: P6-02 · C-10: P6-01 ·
C-11: P6-06 · C-12: P6-03 · C-13: P6-04 · C-14: P6-07 ·
C-15: P6-10 · C-16: P6-12 · C-17: P6-18 · C-18: P6-09 ·
C-19: P6-11 · C-20: P6-17 · C-21: P6-14 · C-22: P6-13 ·
C-23: P6-15 · C-30: P6-16.

---

## What not to change

- **The brand direction.** Forest/coral/cream, display-weight Cabin, the reverse
  wordmark and the candid voice are a real identity. Fix execution, not the
  palette concept.
- **The admin list scaffold.** `AdminPageHeader` + `AdminTableFrame` +
  `AdminPagination` is the most consistent system in the product. Fix its
  theming and mobile behaviour; use it as the template for C-19.
- **The strong destructive copy.** Package, profile, member and de-list dialogs
  already name the blast radius. Extend that writing to the unguarded actions
  rather than rewriting it.
- **The invite and consent flows.** Token hygiene, explicit consent, role
  explanations and email-binding disclosure are better than most products.
  Extend them; do not simplify them away.
- **Route-level lazy loading.** It is already a habit. C-22 is about boundaries
  inside a route, not introducing splitting.
- **The gallery composition and the Guidelines reading shell.** The
  full-bleed cover + breadcrumb + overlapping card and the sticky TOC are the
  right patterns; reuse them for legal pages and shared trips.
- **The existing error banners on Enquiries and Proposals.** C-05 is about
  extending that pattern, not inventing a new one.

---

## Definition of done for the review

The review is complete when:

1. Every finding in the six phase files appears in the coverage map above.
2. Every P0 change has a named owner and a release target.
3. The four theme/accent/type/table decisions are recorded in one place.
4. The validation plan in each phase has an owner and a test environment.
5. A follow-up audit re-runs the same measurements: micro-type count, raw
   palette count, contrast matrix, 390px table access, and failure-state tests.
