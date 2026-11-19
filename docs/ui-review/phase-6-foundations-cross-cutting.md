# Phase 6 — Foundations and cross-cutting quality

## Scope and evidence

**Not a route group.** This phase reviews the system that every route inherits:
tokens, type scale, shared primitives, theming, responsive strategy, async
states, accessibility mechanics, image and bundle delivery, and the decisions
that are documented but not yet implemented.

**Sources read:** `frontend/src/index.css` (all four token blocks),
`tailwind.config.ts`, `index.html`, `public/theme-init.js`, `src/App.tsx`,
`src/main.tsx`, `src/components/ui/*` (all 47 primitives), the shared shells
(`Navbar`, `AgencyLayout`, `AdminLayout`), the shared state components
(`WaytowalkLoader`, `TripSkeletons`, `AdminEmptyState`, `AdminNotice`,
`AdminPagination`), the image path (`components/gallery/TripCover.tsx`,
`lib/tripCover.ts`), the heavy feature boundaries (`ItineraryDisplay`,
`TripMap`, `ExpenseTracker`, `PdfDocumentViewer`), and the product decisions in
`docs/auth-phase-0-decisions.md` (D-01 to D-22).

**Measurements** are counts over `frontend/src` at the time of review, from
`Select-String` over `.tsx`/`.ts` files. They are used to separate a systemic
pattern from a local exception, not as a quality score by themselves.

**Evidence limits.** Public pages were rendered at 1440px and 390px in light
and dark. Authenticated realms were reviewed from source, as in Phases 2–5.
Contrast ratios are computed from declared HSL values. Bundle cost is inferred
from the static import graph; no production build profile was captured.

---

## The system as it actually exists

Five realms, five different answers to the same foundation questions:

| Concern | Public | Auth | Traveller | Agency | Admin |
|---|---|---|---|---|---|
| Theme switch | `.dark` on `<html>` via `theme-init.js` + Navbar effect | Same as public | Same as public | `.agency-theme` on `<html>` via effect; `.dark` also applies | `.dark` wrapper `<div>` inside `AdminLayout` |
| Accent tokens | `--primary` forest, `--accent` coral | Same | Same | `--agency-accent` teal (cream in dark) | Raw `indigo-*` utilities |
| Shell header | `Navbar` | None (photo panel) | `Navbar` | `AgencyLayout` sidebar + top bar | `AdminLayout` sidebar + top bar |
| Page title | Inline per page | `CardTitle` = `<h3>` | Inline, 3 scales; `TravellerPageHeader` unused | `AgencyPageHeader` | `AdminPageHeader` |
| Filter control | Inline buttons/links | None | `TravellerSegmented` + overrides + hand-rolled pills | `AgencySegmented` | `AdminSegmented` |
| List failure | Per-page | n/a | Banner on some, toast on Dashboard | Mixed | Empty state (bug) |
| Scrollable table | Cards | n/a | `min-w-[880px]` trip list | `min-w-[1024px]` enquiries | `min-w-[860–960px]` every list |
| Skip link | None | None | None | Yes | Yes |

This table is the core finding: the product has a strong visual identity and
several good local patterns, but it does not have a shared foundation layer.
Each realm solved the same problems independently, and each solved a different
subset well.

## Scorecard

| Area | Score (1–5) | Evidence |
|---|---|---|
| Design tokens and theming | 2 | The token vocabulary is good (`primary`, `accent`, `agency-*`, sidebar, chart), but it is redefined across four blocks in `index.css` and bypassed by 440 raw palette utilities in 80 files. Dark mode is applied three different ways. |
| Typography and legibility | 2 | The product runs on an accidental micro-type scale: 882 uses of `text-[9px]`/`text-[10px]`/`text-[11px]` across 107 files, against 21 uses of 13px and no 12px arbitrary size. Metadata, form labels and status text are the smallest text on screen. |
| Spacing, radius, elevation | 3 | Page rhythm is consistent (`space-y-5`, shared container widths, hairline borders), but radius ranges from `rounded-md` to `rounded-3xl` for equivalent cards, and `rounded-3xl` is used in 20+ places without a token. |
| Shared components and patterns | 2 | `ui/*` is a solid shadcn base, but there is no shared page header, filter bar, async-state component, data table, or destructive-action recipe. `TravellerPageHeader` is dead code; the other realms each wrote their own. |
| Responsive strategy | 2 | Clients and Team prove the team can build mobile card fallbacks. Every other high-volume table relies on fixed `min-width` and horizontal scroll, with the decision column last. |
| Accessibility mechanics | 2 | Focus rings and Radix primitives are good defaults. Against that: 15 of 107 files contain any live-region declaration, public pages have no skip link, several overlays lack focus management, and labels are inconsistently associated. |
| Async state design | 2 | Loading is four patterns; failure is sometimes rendered as empty; success feedback is missing on moderation; only a minority of screens announce state changes. |
| Performance and delivery | 2 | Route-level lazy loading is in place, but the public share route carries Leaflet, Recharts and chat/crypto; Leaflet CSS is global; images are single-width remote Unsplash URLs; PDF preview renders every page at once. |
| Brand coherence | 3 | Forest/coral/cream plus display-weight Cabin is distinctive. It is diluted by an indigo admin skin, a slate/indigo agency export panel, stray emerald/amber notices, and a documented-but-unimplemented Manrope/Newsreader direction. |

---

## Prioritised findings

### [P6-01] High — The type scale has collapsed into 9–11px by default

**Location:** product-wide; examples in `Landing.tsx:628-635`,
`Explore.tsx:202-255`, `GalleryTrip.tsx`, `EventDetail.tsx`,
`EnquiryThreadPane.tsx:523-531`, `MyProposals.tsx:486-520`,
`AgencyEnquiries.tsx`, `AgencyExportPanel.tsx`, `AdminTableFrame.tsx:47`.

**Evidence:** There are **882** occurrences of `text-[9px]`, `text-[10px]` or
`text-[11px]` across **107** `.tsx` files. The split is 37 / 330 / 517. There
are 21 uses of `text-[13px]` and no `text-[12px]` arbitrary size, which means
the scale skips the one step most interfaces use as their metadata floor.
`text-[10px]` is used for table heads, status badges, timestamps, field labels,
footer links, proposal totals, and explanatory copy such as the acceptance
warning in `ProposalShare.tsx:226`. The base `Input` deliberately uses
`text-base md:text-sm`, but everything around it is smaller than the input.

**User impact:** The smallest text carries the meaning users need to act:
whether a proposal is accepted, how many event spots remain, which filter is
active, what an admin decision will do. At 390px, 10px Cabin is roughly 2.6mm
tall; the cap height is nearer 1.8mm. This is a readability failure that scales
with age, glare, motion and low vision — and it is repeated on every screen, so
it defines the perceived quality of the product more than any single layout.

**Recommendation:** Replace the accidental scale with a five-step system:
`12px` metadata floor, `14px` secondary/UI, `16px` body, `20–24px` section,
`28–48px` display. Reserve `11px` only for uppercase overlines that duplicate
adjacent text. Add the steps as named utilities or CSS variables rather than
arbitrary values, sweep the 882 sites mechanically, and add a lint rule that
rejects `text-[9px]`/`text-[10px]` outside a short allow-list.

**Effort:** M.
**Confidence:** High for the counts and locations; Medium for the exact
perceptual cost without a reading study.
**Basis:** code-based counts; public pages rendered.
**Maps to:** P1-06, P1-12, P2-09, TRV-16, P4-06, P5-18.

### [P6-02] High — Accent tokens are used as text colours they cannot support

**Location:** `index.css:30,86,124-136`; public `EventDetail.tsx`,
`ProposalShare.tsx`, `Guidelines.tsx`; traveller `TripHeader.tsx:73,334,368`,
`MyProposals.tsx:703`; agency `AgencyLogin.tsx:190,201`; admin
`AdminSegmented.tsx:50`, `AdminLogin.tsx:191`.

**Evidence:** Three separate contrast failures share one root cause — a single
token is asked to be both a fill and an ink.

- Coral `--accent: 13.2 76% 62.4%` (≈`#E87656`) on cream `#F7F3EA` is
  **≈2.65:1**; on white it is ≈2.93:1. It is used for 10–11px status text.
- In `.dark`, `--agency-accent` becomes cream `41.5 44.8% 94.3%`; primary
  agency buttons still use `bg-agency-accent text-white`, giving **≈1.1:1**.
- Admin primary buttons use `bg-indigo-500 (#6366F1) text-white`, **≈4.46:1**,
  just under AA for their 12–14px labels.

**User impact:** The states that tell a user an action worked — "Live",
"Saved", "Accepted", spots remaining — are the least legible text on the page.
In the agency dark theme the primary sign-in button is effectively blank, which
is an entry blocker. In admin, the primary action label is the first thing
low-vision operators lose in a dense table.

**Recommendation:** Split every accent into **fill**, **ink** and **on-fill**
roles: `--accent` (fill), `--accent-ink` (text, ≥4.5:1 on canvas/card),
`--accent-foreground` (text on fill). Add the same trio for agency and admin.
Replace `text-accent` with `text-accent-ink`; replace `bg-agency-accent
text-white` with `bg-agency-accent text-agency-on-accent`; replace admin
indigo-500 with indigo-600 or an `--admin-accent` token. Add a CI check that
computes the contrast of every declared pair.

**Effort:** S.
**Confidence:** High; arithmetic from declared HSL values.
**Basis:** code-based colour math; public pages rendered.
**Maps to:** P1-05, TRV-03, P4-01, P5-06.

### [P6-03] High — Four palettes coexist, and 440 raw colour utilities bypass the tokens

**Location:** `index.css:10-185`; `tailwind.config.ts:25-78`; examples in
`Navbar.tsx` (indigo badge), `AgencyApply.tsx` (emerald tile),
`Landing.tsx:451,511,522` (`#F7F3EA`, `#102D26`), `AgencyLayout.tsx:269,368,391,455-459`
(teal/slate), `AgencyExportPanel.tsx` (53 slate/indigo/amber matches),
`AgencyQuotePanel.tsx` (72 matches), all `components/admin/*` (indigo).

**Evidence:** A scan for `bg-/text-/ring-/border-` utilities in the default
Tailwind palette returns **440 matches in 80 files**. The product's own tokens
cover primary, accent, muted, destructive, agency and sidebar; they do not define
success, warning, info, or an ops/admin accent. As a result, each team reached
for the nearest Tailwind colour. `AgencyExportPanel.tsx` — inside the warm-paper
agency realm — is largely slate and indigo, including `bg-indigo-600` icon
tiles. The agency skip link and avatar use raw `teal`/`slate`. The public navbar
notification badge is `bg-indigo-600`. Admin is intentionally indigo, but that
choice is not tokenised, so it cannot be tuned or contrast-tested in one place.

**User impact:** The same semantic state looks different depending on the page,
and dark mode is only as reliable as each hard-coded `dark:` variant. Operators
moving between the agency and admin realms see two unrelated products; public
visitors see stray colours that belong to neither. It also makes a future theme
change a search-and-replace exercise rather than a token edit.

**Recommendation:** Define semantic `success`, `warning`, `info`, `--admin-accent`
and `--agency-on-accent` tokens with light/dark values, then ban default-palette
utilities outside the token file via lint. Give each realm one accent token and
one on-accent token; the admin indigo can remain, but as `--admin-accent`.
Replace the hard-coded public hexes with `--surface-brand`/`--surface-brand-ink`
so "brand always dark" is explicit.

**Effort:** M.
**Confidence:** High for the counts; Medium for the exact migration size.
**Basis:** code-based scan; public pages rendered.
**Maps to:** P1-20, P4-01, P5-06, P5-19.

### [P6-04] High — Page scaffolding is rebuilt per realm instead of shared

**Location:** `components/traveller/TravellerPageHeader.tsx` (unused),
`pages/agency/AgencyPageHeader.tsx`, `pages/admin/AdminPageHeader.tsx`,
inline headers in `MyTripsView.tsx:1009-1019`, `Enquiries.tsx:217-226`,
`MyProposals.tsx:172-193`, `TripHeader.tsx:240`; filter controls
`TravellerSegmented.tsx`, `AgencySegmented.tsx`, `AdminSegmented.tsx`,
hand-rolled pills in `Enquiries.tsx:324-345`.

**Evidence:** `TravellerPageHeader` documents itself as the shared traveller
header but has no imports anywhere in `src` (grep returns only its definition).
Its eyebrow/description/meta/action slots are dead code. Traveller page titles
use `text-4xl sm:text-5xl`, `text-3xl sm:text-4xl`, and
`text-[1.75rem] lg:text-[2.6rem]` on adjacent screens. `TravellerSegmented`
is overridden to `min-h-[34px]` in the library while its own default is 30px,
and Enquiries hand-rolls 28px pills with a different selected treatment.
Agency and admin each have a good header/filter pair, but neither is reusable
outside its realm.

**User impact:** The same jobs — title, description, primary action, filter —
feel different on every screen. Travellers must re-learn which pill means
"selected"; new pages copy the nearest local block, so drift compounds. Dead
shared components are worse than none: they create the appearance of a system
while the real screens bypass it.

**Recommendation:** Build one `PageHeader` (title, description, meta, actions,
breadcrumb slot), one `FilterBar`/`SegmentedControl` with a `size` prop, and one
`PageSection` primitive. Use them in all four realms; keep a realm-specific
`accent` prop rather than a fork. Delete `TravellerPageHeader` if it is not
adopted, and add a `/design` route or Storybook page so primitives are visible
and reviewed together.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based; traveller/agency/admin screens not rendered.
**Maps to:** TRV-07, TRV-08, P4-15.

### [P6-05] High — Async states are inconsistent, and failure sometimes masquerades as empty

**Location:** `Dashboard.tsx:124-129,481-492`; `AdminAccounts.tsx:343-391`,
`AdminAgencies.tsx:578-633`, `AdminApplications.tsx:298-325`,
`AdminAudit.tsx:341-405`; mixed patterns in `Agencies.tsx`,
`GalleryTrip.tsx`, `EventDetail.tsx`, `TravelerProfile.tsx`, `SharedTrip.tsx`;
`AdminEmptyState.tsx`, `AdminNotice.tsx`, `WaytowalkLoader.tsx`,
`TripSkeletons.tsx`.

**Evidence:** The traveller dashboard catches a failed `/api/trips` load, shows
a toast, and then renders "No upcoming trips yet" with a "Plan a new trip"
action. Every admin list renders `AdminNotice` **and** falls through to its
empty branch, so a 500 prints "No accounts match these filters" and the footer
stays on "Loading…". Public pages use four loading treatments (skeleton grid,
full-page spinner, branded loader, bespoke gate). Only 27 explicit live-region
declarations exist across 15 of 107 files; most list and detail states announce
nothing.

**User impact:** A user with data is told they have none. In a moderation
console, "no reports" is an operable conclusion, not a cosmetic glitch. Across
the product, users cannot tell whether a screen is still loading, genuinely
empty, or broken — the three states that determine whether they wait, act, or
retry.

**Recommendation:** Ship one `AsyncState` contract with explicit `loading`,
`empty`, `error`, and `forbidden` branches. Never render `empty` while `error`
is set; give `error` a persistent retry; give `empty` a next action; announce
state changes with `role="status"`/`aria-live`. Make skeletons derive from the
real component shells, and reserve the branded loader for route transitions.
Add a test that stubs a 500 for every list endpoint and asserts an error panel.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based; public loading states rendered.
**Maps to:** P1-09, P1-11, TRV-02, P5-02, P5-17.

### [P6-06] High — Theme ownership is fragmented, so portals and tokens escape the realm

**Location:** `index.css:10-185` (four token blocks);
`public/theme-init.js`; `Navbar.tsx:59-71`; `AgencyLayout.tsx:219-220`;
`AdminLayout.tsx:205`; `components/ui/sidebar.tsx:155-171` +
`components/ui/sheet.tsx:56-58`; `App.tsx:75` + `components/ui/sonner.tsx:7-20`.

**Evidence:** Public, auth and traveller themes are applied to `<html>` by
`theme-init.js`/`Navbar`. Agency adds `.agency-theme` to `<html>` in an effect.
Admin wraps its tree in `<div className="dark">`. Radix portals render into
`document.body`, outside the admin wrapper: the mobile sidebar sheet opens light
in an always-dark console, and the root `Toaster` resolves light tokens because
no `next-themes` provider exists. `index.css` defines the same semantic names
four times (`:root`, `.dark`, `:root` for agency, `.dark` for agency) plus two
`.agency-theme` combinations, so a token can mean different things depending on
which class landed on which element.

**User impact:** A phone operator opens navigation and the console turns light
mid-session. A dark-mode agency user cannot read the primary sign-in button
(P6-02). Success toasts for irreversible admin actions appear as light cards.
These are not separate bugs; they are the predictable result of three theme
owners and portal boundaries.

**Recommendation:** One `ThemeProvider` owns `{mode, realm}` and writes
`data-theme="traveller|agency|admin"` plus `.dark` to `<html>`. Define each
realm's tokens once under `[data-theme="…"]` and `.dark[data-theme="…"]`.
Portalled content inherits because the theme is on the root. Remove the admin
wrapper strategy, mount one Toaster inside the provider, and add a visual
regression test for a dialog, a sheet, and a toast in each realm.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based; public and agency login dark checked.
**Maps to:** P4-01, P5-01, P5-15, P1-07.

### [P6-07] High — Touch targets shrink below 44px as a system behaviour

**Location:** `components/ui/button.tsx:21-27` (`default` 40px, `sm` 36px,
`icon` 40px); `components/ui/input.tsx:11` (40px); overrides such as
`AgencyEvents.tsx:1459-1493` (`h-7`), `DayTimeline.tsx:639-704`
(`h-7`/`h-8`), `AgencyEnquiries.tsx:1166-1209` (`h-8`), `AdminLayout.tsx:418`
(`h-9`), `Profile.tsx:704` (`px-1.5 py-0.5`), `Landing.tsx:193` (32px rail
dots).

**Evidence:** The base button and input stop at 40px, below the 44px guidance
the product itself cites. Realm code then shrinks further: 28px roster
decisions, 28–32px icon clusters, 30px segmented filters, 32px enquiry selects,
14px admin clear buttons. The same visual size is used for reversible and
destructive neighbours (Confirm/Decline, rename/delete).

**User impact:** On phones and tablets, the most frequent and most destructive
actions are the smallest targets. A missed Confirm is a retry; a missed Decline
next to it is a wrong decision. Low-dexterity users and anyone using the app
one-handed pay this on every row.

**Recommendation:** Set a 44px minimum for coarse pointers in the shared
`Button`, `Input`, `Select`, and icon variants, using padding to preserve visual
density. Keep 36–40px for fine-pointer desktop if needed, but never rely on the
visual box as the hit area. Separate destructive actions by at least one target
width or move them into an overflow menu. Add a touch-target audit at 390px to
the definition of done.

**Effort:** S–M.
**Confidence:** High.
**Basis:** code-based; public controls measured in rendered build.
**Maps to:** P2-09, TRV-06, P4-06, P5-18, P1-12.

### [P6-08] High — Destructive actions have four different safety models

**Location:** `AgencyClients.tsx:238-246`, `AgencySettings.tsx:306-310`
(`window.confirm`); `AgencyTeam.tsx:549-557` and `AgencyExportPanel.tsx:804-819`
(immediate revoke); `AgencyPackagePanel.tsx:824-858`,
`DirectoryProfileEditor.tsx:664-690`, `AgencyTeam.tsx:703-727` (styled
`AlertDialog`); `AdminAgencyRecord.tsx:1442-1500` (transfer owner, no typed
confirmation); `AdminAgencyRecord.tsx:1094-1114` (owner role select, instant).

**Evidence:** There are five native `window.confirm` calls, several one-click
revocations with no confirmation, two strong `AlertDialog` families, and two
privileged flows that bypass confirmation entirely. Some irreversible actions
have no undo; some reversible ones have no undo toast. Labels vary between
"Remove", "Revoke", "Delete", "De-list" and "Suspend" without a consistent
consequence sentence.

**User impact:** Users cannot predict which actions are guarded, so they either
click hesitantly everywhere or trust a guard that is not there. The highest-
impact cases — revoking a client link, transferring a tenant, promoting an
owner — are the least protected. This is a trust and data-loss risk, not a
dialog-style preference.

**Recommendation:** Adopt one `ConfirmDestructive` recipe built on `AlertDialog`:
name the object, state the consequence, use a specific verb, keep Cancel
neutral, and require typed confirmation (slug or email) for ownership and
tenant-level actions. Use an undo toast for reversible actions and reserve
`window.confirm` for unsaved-change guards. Remove `owner` from inline role
selects and route promotion through the guarded flow.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based.
**Maps to:** P4-07, P5-04, TRV-01 (cancel semantics), P1-13.

### [P6-09] Medium — Form semantics are local, so labels and errors vary by page

**Location:** `AgencyQuotePanel.tsx:1430-1445,1559-1583`,
`AgencyTeam.tsx:610-640`, `AgencyClients.tsx:292-300`,
`AgencyEnquiries.tsx:1359-1382`; `Auth.tsx:84-123,261-284`;
`ResetPassword.tsx:150-163`; `Profile.tsx:834-838,975-979`;
`AdminAgencies.tsx:702-733`.

**Evidence:** Several visible `<Label>` elements have no `htmlFor` and their
Select/number triggers have no `id` or `aria-label` (quote currency, quantity,
unit price, team role/type). Client search relies on a placeholder. The
"Mark lost" textarea has no label or description. Auth binds
`aria-invalid`/`aria-describedby` per field but never moves focus to the first
invalid control. Reset errors have no live role. Profile collapses several
field failures into one paragraph. The admin provisioning wizard puts one
notice at the top of a scrollable dialog and links it to no field.

**User impact:** Screen-reader users hear unnamed comboboxes and spin buttons;
keyboard users submit and are left at the button with no indication of where
the error is; voice-control users cannot target a field by its visible label.
The patterns differ enough that each fix is a one-off.

**Recommendation:** Introduce a shared `Field` primitive that wires
`id`, `htmlFor`, `aria-describedby`, `aria-invalid`, the error slot and the
required marker in one place. Add a submit helper that focuses the first invalid
control and announces a summary. Migrate the auth, agency quote/team, profile
and admin wizard forms to it. Enable `jsx-a11y` label-association rules in lint.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based.
**Maps to:** P2-02, P2-04, P4-11, P4-12, P5-14, P5-16.

### [P6-10] Medium — Modal and navigation focus management is incomplete

**Location:** `GenerationOverlay.tsx:108-129` (custom dialog, no trap/Escape);
`components/ui/sidebar.tsx:155-171` (portalled sheet); `AdminPagination.tsx:34-57`
(no focus/scroll on page change); `AdminTableFrame.tsx:35-39` (scroll region
unreachable by keyboard).

**Evidence:** The generation overlay declares `role="dialog"` and
`aria-modal="true"` but does not move focus in, trap it, restore it, or handle
Escape; its close controls render only after an error. The admin table wrapper
is a plain `overflow-x-auto` div with no `tabIndex`, role or label. Pagination
changes rows above the viewport without moving focus. The shared Radix
`Dialog`/`Sheet` primitives do handle focus correctly when used, so the gaps
are in hand-rolled surfaces.

**User impact:** Keyboard users can tab behind a full-screen scrim, cannot pan a
wide table to reach the decision column, and can page through results while
remaining parked at the footer. For screen-reader users, the visual change has
no corresponding focus or announcement.

**Recommendation:** Route every modal through Radix `Dialog`/`AlertDialog`
rather than a styled `div`. Add `Escape` mapped to the cancel path, initial
focus on the heading or primary action, and focus restoration. Make scrollable
table regions focusable and labelled. On page change, scroll the table heading
into view and move focus to it with `tabIndex={-1}`.

**Effort:** S–M.
**Confidence:** High.
**Basis:** code-based.
**Maps to:** TRV-01, TRV-17, P5-12, P5-13.

### [P6-11] Medium — Responsive data tables are solved per page, not as a primitive

**Location:** `AgencyEnquiries.tsx:1064-1066` (`min-w-[1024px]`),
`MyTripsView.tsx:1196-1200` (`min-w-[880px]`), `AdminTableFrame.tsx:35-39`
with `minWidth` 860–960px at call sites; positive examples in
`AgencyClients.tsx:344-345` and the agency team list.

**Evidence:** Nine `overflow-x-auto` wrappers exist, but only Clients and Team
provide a below-`md` card fallback. The two highest-volume agency queues and
every admin directory keep a fixed-width table, with the decision/action column
last. There is no shared `DataTable`, no sticky action column, no scroll cue,
and no card-row contract. At 390px the Approve/Reject pair is roughly 900px to
the right of the row start.

**User impact:** Phone and small-tablet operators can see row identity or the
decision, not both. The core jobs — triage an enquiry, approve an application,
disable an account — become horizontal-scroll puzzles with an invisible
gesture. This is the largest responsive gap in the product, and it repeats
across three realms.

**Recommendation:** Build one `DataTable` with a `mobile` card renderer, a
sticky first column, a sticky action column, and a labelled focusable scroll
region. Migrate the agency enquiry/trip lists and all admin directories.
Keep the desktop table visually unchanged. Test every list at 390px with the
action reachable without horizontal scroll.

**Effort:** L.
**Confidence:** High.
**Basis:** code-based; public tables/cards rendered.
**Maps to:** P4-03, P5-03, P5-13.

### [P6-12] Medium — Loading has no shared taxonomy, and skeletons describe old layouts

**Location:** `WaytowalkLoader.tsx`, `TripSkeletons.tsx:5-71`,
`MyTripsView.tsx:366-432`, `Dashboard.tsx:381-407`,
`Explore.tsx:264-269`, `Agencies.tsx`, `AdminLoadingPanel`,
`AdminPagination.tsx:29-32`.

**Evidence:** Public pages use four treatments; traveller skeletons use
`rounded-3xl`, `h-44`, `gap-6` while the real card is `rounded-2xl`,
`aspect-video`, `gap-5`; the itinerary skeleton opens with a 288px banner
(`sm:h-88`, not in the spacing scale) while the real header is 56–64px. In the
local build, Landing and Explore could sit on the branded loader for 20–40
seconds while discovery data resolved.

**User impact:** Loading is the first impression for the most-trafficked pages.
When the placeholder shape differs from the result, the page visibly jumps and
feels slower than it is. When a full-screen loader lasts tens of seconds, users
cannot tell whether the app is working or stuck, and the brand moment becomes a
barrier.

**Recommendation:** Define three loading modes: route transition (brand loader),
section load (skeleton matching the real shell), and inline action (button
spinner). Derive skeletons from the real card/header components, not from
memory. Set a perceived-performance budget for discovery: if data takes more
than ~2s, render the page shell and a skeleton grid instead of a blocking
loader, and show a retry after a bounded wait.

**Effort:** M.
**Confidence:** High for the shape mismatches; Medium for the 20–40s observation
being environment-specific.
**Basis:** code-based; public loader observed locally.
**Maps to:** P1-11, TRV-13, P5-02.

### [P6-13] Medium — Bundle boundaries ignore the public/authenticated split

**Location:** `components/ItineraryDisplay.tsx:24-42` (static Leaflet,
Recharts, crypto/chat imports); `main.tsx:4` (global Leaflet CSS);
`pages/SharedTrip.tsx:288-292`; `components/agency/PdfDocumentViewer.tsx:43-56`;
`pages/Dashboard.tsx:38-51`.

**Evidence:** Route-level `lazy()` is used for every page, which is a strong
start. But `ItineraryDisplay` statically imports `TripMap`, `ExpenseTracker`,
`NearbyExplorer`, `TripMembers`, `TripVersions`, `DiscussionDrawer`,
`useTripComments` and `useTripChatCrypto`. `SharedTrip` mounts it for anonymous
visitors, so the most-shared public URL downloads the map, chart and chat/crypto
graph. Leaflet CSS is imported globally in `main.tsx`, so every route pays for
map styling. The PDF viewer renders every page to a 1100px JPEG at once.

**User impact:** A recipient opening a shared itinerary on mobile data waits for
a workspace bundle they cannot use. The authenticated dashboard — the landing
page after login and generation — pays the same cost before the user opens Map
or Expenses. Long PDFs can block the main thread and consume tens of megabytes.

**Recommendation:** Split `ItineraryDisplay` into `PublicItinerary` and
`WorkspaceItinerary`. Lazy-load Map/Expenses tab bodies on first activation or
intersection; keep chat/crypto out of the public graph. Move Leaflet CSS into
the map chunk. Render PDF pages on demand and size to the container/DPR. Verify
with a bundle analyzer and a throttled mobile profile.

**Effort:** M–L.
**Confidence:** High for the import graph; Medium for measured cost.
**Basis:** code-based.
**Maps to:** P1-15, TRV-14, P4-10.

### [P6-14] Medium — Image delivery is unmanaged and repeats remote dependencies

**Location:** `components/gallery/TripCover.tsx:45-52`,
`lib/tripCover.ts:75-91`, `Auth.tsx:21-22,164-171`,
`ForgotPassword.tsx:11-12,49-56`, `ResetPassword.tsx:11-12,59-66`,
`index.html` (no `og:image`), `lib/meta.ts`.

**Evidence:** `TripCover` hard-codes `loading="lazy"` for every instance,
including above-the-fold Gallery/Shared heroes, and never emits `srcset`.
Covers are single-width Unsplash URLs (`w=800` default, `w=1200` in Shared).
The auth shell duplicates the same 1400px Unsplash URL across three pages and
renders it eagerly inside a `hidden lg:block` aside. There is no `og:image`
anywhere, so shares render as text-only cards. The destination-to-photo map
falls back to one of a few stock images for distinct places.

**User impact:** Mobile users download oversized images they cannot resolve;
above-the-fold heroes start late; every public page depends on a third-party
host. The share loop — the product's main distribution mechanism — has no
preview image. Distinct destinations can look identical, which weakens trust in
the itinerary's specificity.

**Recommendation:** Build one `AppImage` with `srcset`/`sizes`, `priority`,
intrinsic dimensions, a local fallback, and an optional blur placeholder. Use
`priority` for the first hero, lazy for the rest. Serve covers through the app
or a configured image CDN rather than raw Unsplash. Add `og:image` (static brand
card plus per-share cover where available) and `twitter:image`.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based; public pages rendered.
**Maps to:** P1-02, P1-16, P2-05.

### [P6-15] Medium — The documented typography direction is not implemented

**Location:** `tailwind.config.ts:16-19` (Cabin for sans and display);
`index.html:21-27`; `docs/auth-phase-0-decisions.md` D-13/D-14
(Manrope for UI, Newsreader for display).

**Evidence:** Both `fontFamily.sans` and `fontFamily.display` resolve to Cabin,
loaded from Google Fonts. Every `font-display` heading therefore uses the same
family as body copy, differentiated only by weight and size. The decision log
says the brand guide specifies Manrope and Newsreader, with migration scheduled
for Phase 4, but no font token, `@font-face`, or package references either
family. Phase 2 independently flags this drift.

**User impact:** The interface has a coherent but single-voice type system:
display headings do not have the editorial contrast the brand direction calls
for. More importantly, two sources of truth now disagree, so every new screen
is built on an unresolved decision. A late global font change will create
visual-regression noise across all 49 routes.

**Recommendation:** Decide D-13 explicitly: either migrate to Manrope +
Newsreader with self-hosted variable fonts and a visual-regression baseline, or
update the brand decision to "Cabin only" and remove the stale direction.
Whichever wins, encode it in `tailwind.config.ts` and one typography tokens
file so no page chooses a family locally.

**Effort:** S to decide, M to migrate.
**Confidence:** High for the mismatch.
**Basis:** code-based.
**Maps to:** P2 scorecard, P1 baseline.

### [P6-16] Low — Reduced-motion coverage stops at the loader and skeleton

**Location:** `index.css:422-447`; `GenerationOverlay.tsx` (`animate-ping`,
`animate-pulse`, `animate-fade-in`); live indicators using `animate-pulse`;
`NotFound.tsx:27` (infinite compass spin).

**Evidence:** The reduced-motion block disables `.skeleton-shimmer` and the
`.ww-loader`/`.ww-dots` animations. It does not cover Tailwind's `animate-ping`,
`animate-pulse`, or `animate-fade-in`, which are used on the longest wait in the
product (generation), on live status dots, and on the 404 compass. There is no
shared `useReducedMotion` hook or global rule.

**User impact:** Vestibular-sensitive users still get a pulsing, pinging
full-screen surface during generation and perpetual motion on error pages. The
product's partial support is worse than none because it signals a policy that is
not actually enforced.

**Recommendation:** Add a global `@media (prefers-reduced-motion: reduce)` rule
that disables non-essential animation utilities, plus a `useReducedMotion` hook
for component-level decisions. Replace infinite decorative spins with a
one-shot reveal or a static mark. Add reduced-motion to the visual test matrix.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.
**Maps to:** P1-17, TRV-17.

### [P6-17] Low — Metadata and indexability are per-page, not a foundation

**Location:** `index.html:12-19`; `lib/meta.ts`; `LegalDocument.tsx:35-41`;
`NotFound.tsx`; private routes under `/dashboard`, `/agency`, `/admin`.

**Evidence:** The base document declares title, description, `og:title`,
`og:description`, `og:type`, and `twitter:card`, but no `og:image`,
`twitter:image`, canonical URL, or robots directive. `applyPageMeta` sets only
title/description/og title and type. Private and admin routes do not set
`noindex`; the 404 page sets no meta at all. Shared and proposal pages cannot
provide a per-share preview image because the payloads carry no cover field
(`SharedTrip` comments note this).

**User impact:** Shared links render without an image (P1-02), search engines
can index private shells, and social/link-preview clients receive inconsistent
metadata. The public distribution loop is the product's main growth path, so
this is a product-level gap rather than an SEO nicety.

**Recommendation:** Centralise metadata in one helper that accepts title,
description, image, canonical, `ogType`, and `robots`. Default to `noindex` for
authenticated realms, set a static 1200×630 brand image as the fallback, and
allow share routes to override it when a cover exists. Add a link-preview check
for the two or three clients the product actually distributes through.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.
**Maps to:** P1-02, P1-17.

### [P6-18] Low — The public shell lacks the skip-link and landmark parity the app shells already have

**Location:** `components/Navbar.tsx`; compare `AgencyLayout.tsx:269` and
`AdminLayout.tsx:211`.

**Evidence:** Both authenticated shells render "Skip to content" as the first
focusable element. No public page does, even though the public Navbar contains a
full link set, theme toggle, account actions and a mobile sheet. `main` exists on
the pages but has no matching skip target id.

**User impact:** Keyboard and screen-reader users re-traverse the same header on
every public route — Explore, each trip, each event, each agency — which is
exactly the cost the authenticated shells decided was worth avoiding.

**Recommendation:** Add one shared public `SkipLink` as the first focusable
element, target a single `#main-content` id, and reuse the existing focus-ring
style. Add it to the public layout rather than each page.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based; public pages rendered.
**Maps to:** P1-08.

---

## What to keep

- **A real brand system, not a template.** Forest/coral/cream, display-weight
  Cabin, the reverse wordmark, and the travel-specific voice are distinctive
  and consistent in intent. Most foundation work is execution, not direction.
- **Route-level code splitting is already a habit.** Every page in `App.tsx` is
  `lazy()`; the remaining bundle work is about boundaries *inside* a route, not
  introducing splitting from scratch.
- **The `ui/*` primitive layer is a good base.** Radix primitives, a shared
  `Button` with a visible focus ring, a token-driven `Input`, and a real
  `AlertDialog` mean the correct behaviour is usually one import away.
- **The reduced-motion block exists.** Someone already decided that skeletons
  and the brand loader should respect the preference; extending it is cheaper
  than starting the policy.
- **Admin's list scaffold is the strongest system in the product.**
  `AdminPageHeader` + `AdminTableFrame` + `AdminPagination` produce six lists
  with almost no drift. That is the model for a shared `DataTable`, even though
  its theming and mobile behaviour need work.
- **Agency's page header and segmented control are close to reusable.**
  `AgencyPageHeader`, `AgencySegmented`, `AgencySectionTabs` and
  `AgencyEmptyState` already encode a rhythm; they need extraction and a
  neutral token layer, not a redesign.
- **Destructive copy is often excellent.** The package, profile, member and
  de-list dialogs name the blast radius and the safe action. The problem is
  coverage and consistency, not the writing.
- **Theme initialization is already flash-safe.** `theme-init.js` applies the
  stored preference before paint. The remaining theme defects are ownership and
  token roles, not a missing pre-paint script.

---

## Validation plan

1. **Scale audit (P6-01).** Add a temporary lint rule or script that reports
   every `text-[Npx]` below 12px. Set the count to zero outside the allow-list,
   then run axe and a 390px reading pass on the ten densest screens.
2. **Contrast matrix (P6-02, P6-03).** Compute every declared foreground/
   background pair used by buttons, chips, status text and badges in light,
   dark, agency and admin. Require 4.5:1 for text, 3:1 for large text and UI
   boundaries. Fix the token, not the call site, then re-run the matrix.
3. **Theme portal test (P6-06).** In each realm, open a dialog, the mobile
   sidebar sheet, a dropdown and a toast. Confirm all four inherit the realm's
   palette and that no light surface appears over a dark realm.
4. **State contract test (P6-05).** Stub 500/403/timeout responses for every
   list and detail endpoint. Confirm the UI shows a persistent error with retry,
   never an empty-state sentence, and that the state change is announced once.
5. **Keyboard and screen-reader sweep (P6-09, P6-10, P6-11, P6-18).** On each
   realm: first Tab reveals skip link; every form error is announced and
   focused; every modal traps and restores focus; every wide table is reachable
   and labelled; pagination moves focus to the new rows.
6. **Touch-target pass (P6-07).** At 390px with touch emulation, measure every
   button, select, tab, dot control and icon action in the five most-used
   screens per realm. Require ≥44×44px or an equivalent padded hit area.
7. **Loading and bundle budget (P6-12, P6-13, P6-14).** Build with a bundle
   analyzer; record the shared-trip and dashboard chunks before/after splitting
   Map, Expenses and chat. Run Lighthouse mobile on `/shared/:id`, `/explore`,
   `/dashboard` and `/auth`; set budgets for LCP, CLS, transferred JS and image
   bytes.
8. **Image and metadata check (P6-14, P6-17).** Verify `srcset` selection at
   390/768/1440, no eager hidden auth image on mobile, an image card in a link
   preview debugger, and `noindex` on authenticated shells.
9. **Decision closure (P6-15).** Record the typography decision in the decision
   log, update `tailwind.config.ts` and the brand guide in the same change, and
   add a visual-regression baseline for the five highest-traffic screens.

---

## Foundation decisions needed before implementation

| Decision | Options | Recommendation |
|---|---|---|
| Accent roles | One token for fill + text, or split `-fill`/`-ink`/`-on-fill` | Split; text and fill have different contrast requirements |
| Theme ownership | Per-realm wrappers, or one root `data-theme` + `.dark` | Root provider; portals inherit and tests cover dialogs/toasts |
| Type scale | Keep arbitrary values, or adopt a five-step token scale | Five steps with a 12px metadata floor and 16px body |
| Typography family | Cabin only, or Manrope + Newsreader per D-13 | Decide explicitly; do not leave both documented |
| Table strategy | Fixed min-width + scroll, or shared table with mobile cards | Shared `DataTable`; mobile cards for decision queues |
| Async contract | Per-page states, or shared `AsyncState` | Shared contract with explicit error/empty/forbidden branches |
