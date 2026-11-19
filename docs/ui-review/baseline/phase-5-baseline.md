# UI baseline — Phase 5

**Recorded:** 2026-11-18
**Scope:** Phase 5 (C-05 truthful async states, C-16 loading taxonomy and
skeleton fidelity, C-17 accessibility foundations, C-30 reduced-motion policy).
**Status:** Implemented and source-verified. The live browser passes (keyboard
script, axe, reduced-motion recording, simulated 500/403/timeout) have not been
run yet; see **Open checks**.

This file is the evidence record for the Phase 5 exit gate in
`docs/ui-review/implementation-plan.md`. Re-run the commands before changing the
async-state components, the skeletons or the scroll containers.

## Decisions applied

| ID | Decision | Consequence |
|---|---|---|
| C-05 | One error reading for every realm | Failure copy is derived from `ApiError.status` (401 session, 403 forbidden, 5xx server, no status / network message offline) in one place; pages render it instead of guessing. Forbidden is terminal, so it has no retry. |
| C-16 | Three loading modes, each with a matching shape | Route transition keeps the brand loader, section loads use skeletons derived from the real card/list markup, and inline actions use button spinners. |
| C-17 | Accessibility is structural, not a label pass | Headings, meters, scroll regions and privileged-action reasons are fixed in shared primitives so a new page inherits the behaviour. |
| C-30 | Reduced motion targets looping/decorative utilities only | Spinners and meaningful transitions keep running; `animate-ping/pulse/bounce`, `animate-fade-in` and `skeleton-shimmer` stop under `prefers-reduced-motion: reduce`. |

## Evidence

### C-05 — truthful async states

New shared modules:

- `frontend/src/lib/asyncError.ts` — `describeAsyncError(error, subject)` returns
  `kind` (`auth` / `forbidden` / `server` / `offline` / `unknown`), `forbidden`,
  `title` and `description`. 403 copy states that retrying will not help.
- `frontend/src/components/states/AsyncState.tsx` — `AsyncErrorPanel` (a
  persistent in-content panel with `role="alert"` and a **Try again** button, or
  **Trying again…** while pending), and `AsyncLiveStatus` (one polite
  `role="status"` announcement per list).

| Realm | Surface | Behaviour on failure |
|---|---|---|
| Traveller | `Dashboard.tsx` (list) | `loadError` renders the panel in the content area when no trips are on screen; the failure toast is gone. A quiet refresh failure keeps the last list instead of replacing it. Retry calls `loadTrips(true)`. |
| Traveller | `Explore.tsx` | Panel replaces the grid; retry bumps `reloadKey`. `result` is cleared so a stale grid is never shown behind an error. |
| Traveller | `Enquiries.tsx` | Shared panel above the list; the list branch refuses to show "no enquiries" while an error is live; load-more failures are stored as errors too. |
| Traveller | `MyProposals.tsx` | Panel replaces the list; empty copy cannot render behind an error. |
| Agency | `AgencyTrips.tsx` | `listError` replaces the grid; retry calls `loadTrips(true)`. |
| Agency | `AgencyClients.tsx` | `listError` replaces the table/list and the search-empty copy. |
| Agency | `AgencyEvents.tsx` | `listError` replaces the list; failure toast removed. |
| Agency | `AgencyTeam.tsx` | `loadError` replaces the members card and the invite card; failure toast removed. |
| Admin | `AdminAccounts.tsx` | `AdminNotice tone="error"` gains a **Try again** action; the empty row is gated on `error`. |
| Admin | `AdminAgencies.tsx`, `AdminReports.tsx`, `AdminApplications.tsx`, `AdminAudit.tsx` | Error notice with **Try again**; empty row/branch only renders when `error` is null. |
| Admin | `AdminPlatformAdmins.tsx` | Error notice with **Try again**; empty row gated on `error`. |

- Empty states are gated on `!error` everywhere above, so a failed request never
  renders "No clients yet" / "No accounts match".
- Empty copy already derives from active filters (search term, status, plan) in
  both realms; admin empty states switch between "no matches" and "nothing yet"
  from the filter state.
- `AdminPagination` prints "Loading…" only while `total === undefined`, i.e.
  before the first settled response — it never reverts to it on a later page.

### C-16 — loading taxonomy and skeleton fidelity

| Mode | Where | Shape |
|---|---|---|
| Route transition | Existing brand loader (`index.html` boot + route suspense) | Unchanged |
| Section load | `TripSkeletons.tsx`, `AgencyTrips.tsx` (detail), `AgencyClients.tsx`, `AgencyEvents.tsx`, `AgencyEnquiries.tsx`, `Explore.tsx`, admin `AdminLoadingPanel` | Skeletons that reuse the loaded layout's dimensions |
| Inline action | Buttons with `Loader2` + disabled state | Unchanged, used for save/retry/paging |

Fidelity notes:

- `TripCardSkeleton` now mirrors `TripCard`: `rounded-2xl`, `aspect-video`
  cover, `p-4` body with title/meta lines, footer `border-t` with
  `px-4 py-2.5`; the grid uses the real `gap-5 sm:grid-cols-2 lg:grid-cols-3`.
- `ExploreCardSkeleton` already matched `ExploreCard` (`rounded-3xl`,
  `aspect-[16/10]`, bordered footer) and was kept.
- Agency events loading rows use the same `divide-y divide-agency-line` rows as
  the loaded list; client rows use the same `rounded-xl` bordered row height;
  the agency inbox uses `h-20 rounded-xl` rows matching enquiry cards.
- Agency trip detail shows `ItinerarySkeleton`; the page header renders during
  the load instead of being replaced by a centred spinner.
- Discovery renders its real shell and skeleton grid immediately, announces
  "Gathering trips people shared" once, and after a 10 s bound shows a slow-load
  hint with **Try again** instead of blocking on the brand loader.

### C-17 — accessibility foundations

- **Skip link.** `frontend/src/components/a11y/SkipLink.tsx` renders a
  focus-visible pill targeting `#main-content`; `Navbar` renders it, so every
  public page that uses the shared nav inherits it. The admin console already
  had `#admin-content` and the agency workspace `#agency-content` skip links;
  both were left in place.
- **One `h1`.** `Auth`, `ForgotPassword`, `ResetPassword`, `AdminLogin` and
  `AgencyLogin` demote their decorative panel headline to a `<p>` and promote
  the form title to the single `h1`. `AdminPasswordChange` uses an `h1` for the
  forced flow and an `h2` for the settings card under `AdminAccount`'s own `h1`.
  Branches are mutually exclusive, so each rendered screen has exactly one.
- **Meters.** `AgencyOperations` usage bars are `role="meter"` with
  `aria-valuemin/max/now` and an `aria-valuetext` of
  "N of M used (X%)"; a zero cap is clamped to 1 so the meter stays valid.
- **Privileged actions.** `AdminPlatformAdmins` renders the disable reason as
  `sr-only` helper text wired with `aria-describedby` (the `title` is kept for
  pointers). Icon-only row actions in `AgencyTeam` (promote/remove, both the
  table and card layouts) carry `aria-label`; admin account row actions already
  had them.
- **Scrollable tables.** `Table` accepts `scrollLabel`; when set, its scroll
  container becomes a focusable `role="region"` with a focus ring
  (`AgencyClients`, `AgencyEnquiries`). `AdminTableFrame`'s horizontal scroller
  is always focusable and labelled from `title` (or an explicit `scrollLabel`,
  used on `AdminPlatformAdmins`).
- **Announce once.** Skeletons are `aria-hidden`; one `AsyncLiveStatus` per list
  announces loading; `AsyncErrorPanel` is the only `role="alert"`; admin loading
  panels are `role="status"` + `aria-busy`.

### C-30 — reduced-motion policy

- `frontend/src/index.css` has a `@media (prefers-reduced-motion: reduce)` block
  that stops `.animate-ping`, `.animate-pulse`, `.animate-bounce`,
  `.animate-fade-in` and `.skeleton-shimmer`; progress spinners and transitions
  keep working.
- `useReducedMotion` exists for component decisions; `GenerationOverlay` and
  `NotFound` use a one-shot reveal instead of an infinite spin.

## Commands run

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | pass |
| `npx eslint` on every Phase 5 touched file | clean; `Dashboard.tsx` retains its pre-existing `no-explicit-any` errors in untouched `catch` blocks (same 9 as `HEAD`) |
| `npm run ui:contrast` | pass — every declared text pair in traveller/agency light+dark and admin dark |
| `npm run test:auth-policy` | **11 pass** |
| `npm run build` (frontend) | pass (43 s) |
| Backend `tsc` / tests | not re-run — no backend file changed in this phase |

## Exit gate mapping

| Gate | Evidence |
|---|---|
| 500 / 403 / timeout produce an error panel with retry on traveller, agency and admin lists | `AsyncErrorPanel` on all traveller/agency lists; admin notices carry **Try again**; 403 renders as terminal with no retry |
| No failed request renders "No trips yet" / "No accounts match" | Empty branches gated on `!error` in every list above |
| The state change is announced once | `aria-hidden` skeletons + one `AsyncLiveStatus`; only the error panel is `role="alert"` |
| Library, trip detail and discovery skeletons match the loaded layout | `TripCardSkeleton` rewritten against `TripCard`; `ItinerarySkeleton` for trip detail; discovery shell renders before data |
| No first paint blocks for 20–40 seconds | Discovery shell and skeleton render immediately; slow hint at 10 s |
| First Tab on every public page reveals a skip link | `Navbar` renders `SkipLink`; admin/agency shells keep their own |
| Every page has exactly one `h1` | Auth, admin-login, forced-password and agency-login audited; branches mutually exclusive |
| Axe reports no heading-order, label or contrast violations | **Not yet run** — see Open checks |
| Reduced motion shows no looping motion | Global rule plus `useReducedMotion` on the overlay and 404 |

## Open checks

These need a browser session or a controlled failure, not more source reading.

1. **Failure simulation** — force 500, 403 and a timeout on each list endpoint
   and confirm the panel, the retry and the absence of empty copy (Playwright
   route interception or the dev failure switch if one exists).
2. **Axe pass** — run on the reviewed route set in light and dark; heading order
   on auth/admin/forced-password screens.
3. **Keyboard script** — Tab from load to the skip link, through a dialog, and
   into the clients/enquiries table scroller (arrow keys must scroll it).
4. **Slow network on discovery** — confirm shell before 2 s and the retry hint
   after the 10 s bound.
5. **Reduced motion recording** — OS setting on, record generation overlay,
   live status and 404; no looping motion.
