# Phase 5 — Platform admin console

## Scope and evidence

**Routes reviewed (11):** `/admin/login`, `/admin` (Overview), `/admin/account`,
`/admin/accounts`, `/admin/accounts?account=…` (detail sheet), `/admin/agencies`,
`/admin/agencies/:agencyId` (Overview · Plan · Directory · Members · Audit tabs),
`/admin/applications`, `/admin/reports`, `/admin/audit`, `/admin/platform-admins`.

**Source files read in full:** every file in `frontend/src/pages/admin/`
(`AdminLogin`, `AdminLayout`, `AdminApp`, `AdminOverview`, `AdminAccount`,
`AdminAccounts`, `AdminAccountDetail`, `AdminAgencies`, `AdminAgencyRecord`,
`AdminApplications`, `AdminReports`, `AdminAudit`, `AdminPlatformAdmins`,
`AdminPasswordChange`, `AdminTemporaryPassword`, `accountMeta`), all eight
`frontend/src/components/admin/*` primitives, `context/PlatformAuthContext.tsx`,
the shared primitives they lean on (`button`, `badge`, `input`, `card`, `sheet`,
`alert-dialog`, `command`, `sidebar`, `sonner`), `lib/date.ts`,
`hooks/usePlatformEnabled.ts`, `types/platform.ts`, `App.tsx` routing, and the
dark token block in `src/index.css`.

**Evidence limits.** This phase is behind credentials, so no page was rendered
or screenshotted and no browser tooling was used. Every finding is **code-based**
and labelled as such; contrast ratios are computed from the literal Tailwind
colours and HSL token values in the source, not sampled from pixels. No backend
behaviour is asserted beyond what the frontend contract and comments state. No
analytics or user-research data exists in the repo, so severity reflects likely
impact from the code paths, not measured traffic.

**Review date:** 2026-11-17.

---

## Scorecard

| Area | Score (1–5) | Evidence |
| --- | --- | --- |
| Visual hierarchy and typography | 3 | `AdminPageHeader` gives every page one `h1` + description + action row and `AdminStatTile` gives counts real prominence. Against that, the console runs on a 10–12 px micro-type layer (`text-[10px]`, `text-[11px]`) for status chips, table heads and metadata, and the accent is hand-written indigo rather than a product token, so hierarchy is consistent but visually thin. |
| Layout and spacing consistency | 4 | `space-y-5` page rhythm, one `AdminTableFrame` border/radius, shared head/body row classes, one pagination footer, one empty/loading panel. Reused across six lists with almost no drift. |
| Brand distinctiveness | 3 | The always-dark realm, shield mark, "Isolated realm" badge and `⌘K` palette give the console a clear separate identity. But it is an **indigo** ops skin inside a green/cream brand: `bg-indigo-500`, `text-indigo-300`, `ring-indigo-400` appear in nearly every component while `--primary`/`--accent` are unused here. |
| Content clarity and IA | 3 | Sidebar grouping (Monitor / Directory / Safety & access) matches the job, and copy is unusually explicit about realm boundaries. Undercut by a breadcrumb that mislabels Accounts as "Account", an Overview with no pending-applications decision tile, raw enum/action codes presented as UI copy, and overlapping "hidden / de-listed / auto-hidden / dismissed / disabled" vocabulary. |
| Interaction quality and feedback | 3 | Confirmation dialogs are well written, inline errors stay inside dialogs, busy states disable the action, and one-time-password hand-off is handled carefully. But moderation decisions are silent, transfer-of-ownership has no confirmation step, some disabled buttons only explain themselves via `title`, page changes don't reposition the viewport, and toasts render outside the dark theme. |
| Responsive behavior | 2 | Every directory is a fixed `minWidth` (860–960 px) table with the decision column last, so Approve/Reject and Disable/Reset sit off-screen on phones and small tablets with no scroll cue. Worse, the mobile navigation sheet is portalled outside the `.dark` wrapper and renders with the light theme. |
| Accessibility | 2 | Several concrete blockers: colour contrast on primary indigo buttons (≈4.46:1), a horizontally scrollable table region that is not keyboard reachable or labelled, disabled controls whose reason is only a `title`, 10 px uppercase status text, 14 px unlabelled clear buttons, and unauthenticated screens that skip from no `h1` straight to an `h3`. |
| Performance risk | 3 | Lists are server-paginated at 25 rows and use cancellation flags, so the console is light. Risks are narrower: 50 unpaginated moderation cards each embedding every report, and audit filters that issue a network request per keystroke (with no abort) for the free-text id fields. |

---

## Prioritised findings

### [P5-01] High — Mobile navigation opens a light-themed sheet inside the always-dark console
- **Location:** `frontend/src/pages/admin/AdminLayout.tsx:205`; `frontend/src/components/ui/sidebar.tsx:155-171`; `frontend/src/components/ui/sheet.tsx:56-58`
- **Evidence:** The dark scope is a wrapper `<div className="dark …">`. On mobile the sidebar swaps to `Sheet` → `SheetPortal`, which renders into `document.body`, outside that wrapper. The mobile content uses `className="… bg-sidebar p-0 text-sidebar-foreground"`, so it resolves `:root` (light) values for `--sidebar-background`/`--sidebar-foreground`, not the `.dark` block in `index.css:96-103`. The header's `Badge` (`AdminLayout.tsx:233-238`) paints `text-indigo-300` on `bg-indigo-500/10`; on the light cream sheet that is roughly 1.6:1. By contrast, the account-detail drawer deliberately re-applies `dark` to its portalled content (`AdminAccountDetail.tsx:57`), which shows the omission is accidental, not a design choice.
- **User impact:** A phone operator opens navigation and the console turns light mid-session, breaking the "you are in the platform realm" cue; the "Isolated realm" badge and the pending-applications count become effectively unreadable.
- **Recommendation:** Apply the console theme to the portal (port the sheet inside the dark provider, pass an explicit `dark` class through the sidebar's mobile `SheetContent`, or set `dark` on `<html>` while `/admin` is mounted and remove it on unmount).
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-02] High — Failed loads render as "no results", and pagination hangs on "Loading…"
- **Location:** `frontend/src/pages/admin/AdminAccounts.tsx:343-347, 382-391, 353-361`; `AdminAgencies.tsx:578-582, 618-633`; `AdminApplications.tsx:298-325`; `AdminPlatformAdmins.tsx:284-332`; `AdminAudit.tsx:341-345, 383-405`
- **Evidence:** Every list renders `AdminNotice` on error **and** falls through to the empty branch because the row array is empty. On `/admin/accounts` a failed request therefore prints "No accounts match these filters — try a different realm, status or search term", and the footer receives `total={data?.total}` = `undefined`, so `AdminPagination` permanently prints "Loading…" with both buttons disabled (`AdminPagination.tsx:29-32, 40-52`). The same shape repeats for agencies ("No agencies yet — provision the first tenant"), applications ("No applications are waiting"), admins ("No platform admins match this search") and audit ("Nothing matches these filters").
- **User impact:** The operator is told the data set is empty or the filters are too narrow when the directory is simply unreachable, and has no way to tell whether paging is stuck. In a moderation console this can be read as "no reported content", which is a materially wrong operational conclusion.
- **Recommendation:** Gate the empty branch on `!error`; render an error panel with a retry action in the table body; give `AdminPagination` an explicit error/unknown state instead of defaulting to "Loading…".
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-03] High — Wide tables hide the decision column on phones with no affordance
- **Location:** `frontend/src/components/admin/AdminTableFrame.tsx:35-39`; `AdminApplications.tsx:332` (`minWidth="960px"`), `AdminAgencies.tsx:587` (`940px`), `AdminAudit.tsx:354` (`920px`), `AdminAccounts.tsx:352` (`880px`), `AdminPlatformAdmins.tsx:291` (`860px`)
- **Evidence:** The frame renders `<div className="overflow-x-auto"><table style={{ minWidth }}>`, nothing else — no sticky column, no shadow, no "swipe" hint, no card fallback. The last column is always the decision column (`text-right` Actions / Open / Decision). On a 390 px viewport the Approve + Reject pair in `AdminApplications.tsx:398-421` is roughly 900 px to the right of the row start.
- **User impact:** The console's core jobs — approve/reject an application, disable an account, open a tenant, resolve a report — require discovering horizontal scrolling on a device where the gesture is invisible and the row identity scrolls away. This is the largest single responsive gap in the phase.
- **Recommendation:** Add a mobile presentation for decision queues (stacked card rows with the action pair at the bottom), or pin the action column (`position: sticky; right: 0`) with a left scroll shadow; add a visible horizontal-scroll indicator and keep the first column sticky.
- **Effort:** L
- **Confidence:** High
- **Basis:** code-based

### [P5-04] High — Transferring ownership has no confirmation, and owner role changes are an instant select
- **Location:** `frontend/src/pages/admin/AdminAgencyRecord.tsx:1442-1500` (transfer dialog), `1094-1114` (role select), `291-301` (role mutation)
- **Evidence:** "Transfer owner" opens a plain `Dialog` whose primary button is a normal `Button` with `onClick={() => void transferOwner()}` — no `AlertDialog`, no typed confirmation, no summary of what changes beyond the description. It sits in a header row directly beside the solid rose "Suspend tenant" button (`AdminAgencyRecord.tsx:518-548`). Separately, each member row's role `<Select>` includes `owner` (`roleOptions`, line 77) and calls `changeRole` immediately on change, with no confirm and no undo; owner promotion therefore has two different flows with different safety levels.
- **User impact:** A misclick in a dense header can hand a tenant to the wrong person, demote the current owner and write an audit row with no way back from the UI. Role changes are just as easy to misfire, and the presence of `owner` in the row select makes the dedicated transfer flow look optional.
- **Recommendation:** Move transfer into an `AlertDialog` with a typed confirmation of the workspace slug (or target email) and a before/after summary; require a second confirm for any promotion to `owner`; remove `owner` from the inline role select and route it through transfer.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P5-05] High — Disabled privileged actions explain themselves only through `title`
- **Location:** `frontend/src/pages/admin/AdminPlatformAdmins.tsx:336-403`; `AdminAgencyRecord.tsx:518-528, 679-689`
- **Evidence:** The super-admin Disable button is rendered `disabled` with the reason in `title` ("You cannot disable your own account", "The last active super-admin cannot be disabled"). Disabled buttons are not focusable, and `title` is not exposed to keyboard focus, touch or most screen readers. The same pattern appears in the agency record: "Transfer owner" is disabled whenever `nonOwners.length === 0` or `busy !== null` with no adjacent explanation of which condition applies.
- **User impact:** An operator who cannot click the control gets no durable explanation; on a tablet there is no tooltip at all. The last-admin guard — a safety-critical invariant — is effectively invisible.
- **Recommendation:** Always render the reason as visible helper text under the row/button, or keep the button enabled and explain in a dialog/toast on activation; add `aria-describedby` to any disabled control left in place.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-06] Medium — Primary indigo buttons miss AA contrast and bypass the product's accent tokens
- **Location:** `frontend/src/pages/admin/AdminLogin.tsx:191`; `AdminAgencies.tsx:433, 995, 1003`; `AdminApplications.tsx:405, 483`; `AdminPasswordChange.tsx:123`; `AdminSegmented.tsx:50`; `AdminLayout.tsx:221`; `AdminTemporaryPassword.tsx:125`
- **Evidence:** Primary actions use `bg-indigo-500 (#6366F1) text-white`. Relative luminance ≈ 0.186, giving a contrast ratio of ≈ **4.46:1**, just under the 4.5:1 AA threshold for the 12–14 px labels used here; the same pair is used at `text-[10px]` in filter chips (`AdminSegmented.tsx:50`). Indigo is not a theme token: the dark palette in `index.css:66-115` defines `--primary` (cream) and `--accent` (coral), neither of which these buttons use, and the header comment in `AdminPageHeader.tsx:4-7` claims the console "reads from the same semantic tokens as the rest of the product".
- **User impact:** Low-vision operators reading dense tables lose the primary-action labels first, and the console reads as an unrelated indigo product rather than a distinct realm of the same brand.
- **Recommendation:** Use `indigo-600` (≈5.4:1) or define an `admin`/`ops` accent token with a verified ≥4.5:1 pair and replace the scattering of `indigo-*` utilities; add a contrast check to CI for the shared button/chip variants.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-07] Medium — The moderation queue stops at 50 targets silently and counts in two different units
- **Location:** `frontend/src/pages/admin/AdminReports.tsx:151, 169-170, 246-250, 272-428`
- **Evidence:** `api.listModerationQueue(status, 50)` is the only fetch; there is no page, no "load more", no total-groups value, and no truncation notice. The only summary is `groups.length` ("50 targets in this tab"). Meanwhile the Overview tile shows `result.totals.open` (`AdminOverview.tsx:62-69, 135-148`), which is a count of **reports**, while the queue page talks about **targets**; the two numbers cannot be reconciled on screen.
- **User impact:** In any busy period an operator can see "Open reports 63" and a 50-item list with no way to reach the rest, and the mismatched nouns make it look like items vanished after a decision.
- **Recommendation:** Paginate the queue (or add "load more" with an explicit "showing 50 of N targets"), return a target total alongside report totals, and align the tile/page nouns.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P5-08] Medium — Resolving a report produces no success feedback or announcement
- **Location:** `frontend/src/pages/admin/AdminReports.tsx:180-203`
- **Evidence:** `runAction` calls the API, closes the dialog and calls `reload()`; unlike every other mutation in the console it emits no `toast.success`, no `aria-live` region and no optimistic confirmation. The user only sees the card disappear after a full refetch. Errors are also rendered as a bare `<p className="text-xs text-rose-300">` inside the dialog (line 494) rather than the `AdminNotice` used elsewhere, so they are not announced as alerts.
- **User impact:** After confirming "De-list trip" the operator cannot tell whether the action applied or the list simply refreshed; there is no record of which decision was just taken, which is exactly the kind of confirmation an irreversible public action needs.
- **Recommendation:** Toast with the decision and target (`toast.success('Trip de-listed · <title>')`), add an Undo/Restore action, and use `AdminNotice tone="error"` inside the dialog.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-09] Medium — Breadcrumb mislabels the Accounts directory as "Account"
- **Location:** `frontend/src/pages/admin/AdminLayout.tsx:111-138` (specifically line 116)
- **Evidence:** `crumbTrail` checks `pathname.startsWith('/admin/account')` before resolving the nav section. `'/admin/accounts'.startsWith('/admin/account')` is `true`, so `/admin/accounts` (and any `?account=` deep link from audit) renders `Console › Account` with no link back to the Accounts directory. Only `/admin/account` should match.
- **User impact:** The trail contradicts the page title and sidebar selection on one of the most-used directories; the section link disappears, so the trail is a dead end rather than navigation.
- **Recommendation:** Compare with `pathname === '/admin/account'`, or resolve the nav item first and special-case only the exact security route.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-10] Medium — Overview surfaces reports but not the other decision queue
- **Location:** `frontend/src/pages/admin/AdminOverview.tsx:110-157, 224-255`
- **Evidence:** The four tiles are Accounts, Agencies, Open reports and Disabled accounts; `PlatformOverview` carries no application count (`types/platform.ts:101-116`) and the page only fetches the moderation queue (`AdminOverview.tsx:62-69`). Pending applications exist as a sidebar badge fed by a separate call in `AdminLayout.tsx:174-192`. The "Directory shortcuts" card lists the applications page but without a count or pending emphasis.
- **User impact:** A signup-driven queue — the only queue a visitor can add to without a session — is invisible from the landing page of the console unless the operator scans the sidebar. New applications can age while the overview reports "Nothing waiting for a decision" for reports.
- **Recommendation:** Add a "Pending applications" tile using the same `listAgencyApplications({status:'pending', limit:1})` call (or extend the overview payload) and reuse the sidebar badge count; order the two decision tiles first.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-11] Medium — Audit investigation is impeded by raw codes, truncated context and one-request-per-keystroke filters
- **Location:** `frontend/src/pages/admin/AdminAudit.tsx:78-91, 347-448, 468-493`
- **Evidence:** Rows render machine identifiers directly (`entry.action` in indigo monospace, `entry.targetType` as an uppercase badge, e.g. `platform_account`), with metadata flattened into a 60-character `summarizeMetadata` string and no detail view or copy affordance. Actor and target filters are free-text ObjectIds; a partial actor id is silently discarded by the regex guard (line 86), so the table shows **unfiltered** results with no warning. `targetId` is not debounced, so typing a 24-character id issues a request per keystroke; filters are not written to the URL (only `targetId` is read once).
- **User impact:** Investigators must map codes to meaning in their head, lose the full before/after context of a change, and can be shown a plausible but unfiltered log while believing it is scoped to an actor. Copying ids into the address bar is the only way to share an investigation.
- **Recommendation:** Humanise action/target labels with a lookup table, add an expandable row or detail drawer for full metadata (with copy), validate ids inline ("enter a 24-character id"), debounce, and persist all filters in search params.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P5-12] Medium — Changing page leaves the viewport at the footer, not the new rows
- **Location:** `frontend/src/components/admin/AdminPagination.tsx:34-57`; call sites `AdminAccounts.tsx:360`, `AdminAgencies.tsx:595`, `AdminAudit.tsx:362`, `AdminApplications.tsx:340`, `AdminPlatformAdmins.tsx:299`
- **Evidence:** `onChange` is `setPage` with no scroll or focus handling. Because `AdminPagination` is rendered inside the card footer, the operator clicks Next at the bottom of a 25-row table; the new rows render above the current scroll position and the footer text changes in place, but nothing moves focus or the viewport.
- **User impact:** It looks like nothing happened, or the operator starts reading the last row of the new page as if it were the first. Keyboard and screen-reader users receive the count via `aria-live` but remain parked at the footer.
- **Recommendation:** On page change, scroll the table (or its caption/heading) into view and move focus to the frame title with `tabIndex={-1}`; keep the `aria-live` count.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-13] Medium — The horizontally scrollable table region is unreachable by keyboard and unlabelled
- **Location:** `frontend/src/components/admin/AdminTableFrame.tsx:35-39`
- **Evidence:** The scroll container is a plain `<div className="overflow-x-auto">` with no `tabIndex`, `role="region"`, `aria-label` or visible focus style. Tables are 860–960 px wide, so on narrow viewports part of the content is only reachable by that scroller. Keyboard users can tab through cell links/buttons, but the container itself cannot receive focus to pan.
- **User impact:** A keyboard-only or switch user cannot reach columns clipped by the viewport (including the decision column) even though sighted mouse users can. This is a WCAG 2.1.1 keyboard-operability failure on every directory.
- **Recommendation:** Make the wrapper focusable and labelled (`tabIndex={0} role="region" aria-label={`${title ?? 'Directory'} table`}`), add a visible focus ring and scroll shadows.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-14] Medium — Provisioning-wizard validation is a single notice at the top of a scrollable dialog, unlinked to fields
- **Location:** `frontend/src/pages/admin/AdminAgencies.tsx:702-733, 309-346, 981-1013`
- **Evidence:** The dialog is `max-h-[88vh] overflow-y-auto`; `formError` renders as one `AdminNotice` immediately under the step bar, while the offending inputs live one to two screens below (step 2 billing block, step 3 footer). Inputs never receive `aria-invalid`, `aria-describedby` or inline messages, and no focus move occurs after `goNext()` / `submit()` sets the error. The block can also fire on a hidden field: `stepOneValid` re-runs on final submit (line 362) while the operator is looking at step 3.
- **User impact:** "Continue" appears to do nothing on a small screen; screen-reader users are not told which field is wrong or that the step did not advance, and on final submit the error is above the visible scroll area.
- **Recommendation:** Attach per-field errors with `aria-invalid`/`aria-describedby`, focus the first invalid field, and keep a summary only for cross-field problems. Validate the current step only; surface server errors next to the submit button.
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P5-15] Medium — Console toasts are styled with the light theme
- **Location:** `frontend/src/App.tsx:75`; `frontend/src/components/ui/sonner.tsx:7-20`
- **Evidence:** `<Toaster />` is mounted at the app root, outside the admin's `<div className="dark">`, and there is no `next-themes` provider anywhere in the app. `theme` therefore falls back to `"system"`, and the custom classNames use `group-[.toaster]:bg-background … text-foreground`, which resolve the `:root` (light) tokens because the toast portal is under `<body>`, not `.dark`. Every console mutation relies on `toast.success`/`toast.error` (e.g. `AdminAccounts.tsx:233-236`, `AdminAgencyRecord.tsx:273-275, 322`).
- **User impact:** The primary success/error feedback for irreversible actions appears as a light card in an otherwise dark console, reading like a different product and lowering the perceived reliability of the confirmation.
- **Recommendation:** Mount a second, admin-scoped `Toaster` with `theme="dark"`/a `.dark` wrapper inside `AdminLayout`, or add a theme provider that sets the admin route to dark and let Sonner read it.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-16] Medium — Privileged password flows: 6-character minimum, no reveal, no strength guidance, no `h1`
- **Location:** `frontend/src/pages/admin/AdminPasswordChange.tsx:38-49, 90-119, 150-201`; `AdminLogin.tsx:103-203`
- **Evidence:** The platform super-admin password accepts 6 characters (`newPassword.length < 6`), shows only "At least 6 characters", has no reveal toggle, no strength or breach feedback, and no `aria-describedby` linking the hint. The forced first-login screen and `/admin/login` both start at `CardTitle` → `h3` with no `h1` on the page, so the document outline begins at level 3. The login form also has no show-password control, no autofocus and no `role="status"` for its "Checking platform access…" state.
- **User impact:** The highest-privilege credential in the product is held to the weakest rule, users cannot verify what they typed (a common source of lockouts in a forced-change flow), and assistive-technology users get a flat heading map on the two gateway screens.
- **Recommendation:** Raise the platform-admin policy (length + blocklist/meter), add a reveal toggle with an accessible label, connect hints via `aria-describedby`, and give both screens a real `h1` (visually hidden is fine for the logo-led login).
- **Effort:** M
- **Confidence:** High
- **Basis:** code-based

### [P5-17] Low — Empty-state copy does not account for every active filter
- **Location:** `frontend/src/pages/admin/AdminAgencies.tsx:623-632`; `AdminApplications.tsx:312-323`; `AdminAccounts.tsx:385-389`
- **Evidence:** The agencies empty state tests `search || statusFilter !== 'all' || planFilter !== 'all'` but omits `profileFilter`, even though it is part of the query (line 202). Filtering to "Hidden by ops" with no matches therefore says "No agencies yet — provision the first tenant to get started." Applications prefers "No applications are waiting." whenever the tab is `pending`, even when a search term is what produced zero rows. Accounts always blames the filters ("Try a different realm, status or search term") even when the directory is genuinely empty.
- **User impact:** The operator is given the wrong next action — provisioning a duplicate tenant instead of clearing a filter, or waiting for applications that the search hid.
- **Recommendation:** Derive the empty-state title/description from all active filters (and from `total === 0` vs filtered zero) in one shared helper.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

### [P5-18] Low — Micro-type and sub-minimum hit areas in dense rows
- **Location:** `frontend/src/components/admin/AdminTableFrame.tsx:47`; `accountMeta.tsx:32, 42, 58, 72`; `AdminLayout.tsx:228, 297, 374`; `AdminAudit.tsx:266-273, 293-301`; `AdminAccounts.tsx:446-480`
- **Evidence:** Table heads, status badges, realm badges and timestamps are `text-[10px]`/`text-[11px]`, many with `uppercase tracking-wide`; row meta in the audit table is 10 px. Clear-filter "X" buttons in audit are 14 px icons with no padding (`className="absolute right-2 … rounded text-muted-foreground"`), and row action icons in Accounts/Agency members are 32×32. The audit `X` buttons fall below the 24×24 WCAG 2.5.8 minimum; the 32 px icon buttons are below the 44 px touch recommendation used elsewhere (`h-11` on login inputs).
- **User impact:** The console is hard to scan on a 1366×768 laptop and mis-tappable on a tablet; the tiniest text carries status meaning, so legibility loss is semantic loss.
- **Recommendation:** Set a 12 px floor for table metadata (11 px for uppercase labels), increase audit clear targets to ≥24 px with padding, and consider 36–40 px row actions.
- **Effort:** S
- **Confidence:** Medium
- **Basis:** code-based

### [P5-19] Low — Raw enum casing and overlapping status vocabulary leak into the UI
- **Location:** `frontend/src/pages/admin/AdminAgencyRecord.tsx:1095-1126`; `accountMeta.tsx:52-66`; `AdminAccount.tsx:14`; `AdminReports.tsx:294-302, 435-439`
- **Evidence:** Agency status renders `{status}` lowercase ("active"), member status renders `{member.status}` and roles render raw enum values ("owner", "planner"), while the same page also uses a capitalised `AgencyStatusBadge` — so two spellings of the same state appear in one record. Moderation uses "Hidden" / "De-listed" / "Auto-hidden" for closely related states, "dismissed" as both an action and a status, and `AdminAccount.tsx` is the only admin page using `text-slate-400` instead of `text-muted-foreground`.
- **User impact:** Small inconsistencies that slow scanning and make it harder to tell whether "hidden" and "de-listed" are the same condition, especially for new operators.
- **Recommendation:** Centralise status/role labels (capitalised, sentence case, one term per state) in `accountMeta.tsx` and use them everywhere; replace `text-slate-400` with a token.
- **Effort:** S
- **Confidence:** High
- **Basis:** code-based

---

## What to keep

1. **One list scaffold, reused without drift.** `AdminPageHeader` + `AdminTableFrame` + `AdminPagination` + `AdminEmptyState`/`AdminLoadingPanel` give six directories identical borders, radii, head-row treatment, paging sentence and empty-state shape. The shared `adminTableHeadClass`/`adminTableRowClass` mean a new column cannot invent its own case, and the pagination footer is the only place the "N accounts · page X of Y" grammar lives. This is the strongest part of the phase and should be the template for any future console list.
2. **Confirmation copy that names the blast radius.** The dialogs do real work: disabling an account says only that realm/tenant is affected (`AdminAccounts.tsx:502-510`), reset says the personal account is untouched, suspension explains that agency logins, staff routes and public proposal links fail closed (`AdminAgencyRecord.tsx:1329-1333`), removing a member states that the last owner can never be removed, and de-list explains every surface that loses the trip. This is unusually good safety copy for an internal tool and prevents the most likely cross-realm mistake (acting on the wrong email row).
3. **Deliberate data minimisation, stated in the UI.** The account drawer, agency record, audit table and reports queue all avoid tenant content by design, and the copy says so ("Tenant content is out of scope here by design", "No tenant content or credential is ever stored here"). The related-accounts list in the drawer (`AdminAccountDetail.tsx:169-213`) is a genuinely useful support affordance: it lets an operator jump between the personal/agency/platform rows for one email without losing context.
4. **Record pages that respect the operator's place.** `AdminSectionTabs` implements a real `tablist` (roving `tabIndex`, Arrow/Home/End keys, `aria-selected`, `aria-controls`), persists the tab in `?tab=`, sticks under the app bar, and the agency record keeps status, usage, plan, members and audit in one URL-addressable page. The deep links from audit (`targetHref`) and the `?account=` sheet round-trip show the console is built for sharing an investigation, not just clicking around.

---

## Validation plan

1. **Mobile shell:** open `/admin` at 390 px in a light OS preference, open the nav sheet, and confirm the sheet, nav items, "Isolated realm" badge and applications count all render on the dark palette with ≥4.5:1 text; repeat with the account-detail sheet.
2. **Failure states:** block `GET /api/admin/accounts`, `/agencies`, `/applications`, `/platform-admins` and `/admin/audit` (DevTools request blocking or a 500 stub) and confirm each list shows an error panel with retry — never an empty-state sentence and never a footer reading "Loading…" after the request settles.
3. **Decision access on a phone:** at 390 px and 768 px, verify Approve/Reject, Disable/Enable, Reset and "Open tenant" are reachable without horizontal scrolling, or that the action column is pinned and the table announces itself as a labelled scroll region; tab to the table and confirm arrow-key panning.
4. **Contrast and theme:** run axe or a contrast checker on the primary indigo button, active filter chip, disabled button and toast in both `/admin/login` and a list page; confirm the computed ratio is ≥4.5:1 and that toasts are dark in the console.
5. **Destructive paths:** attempt "Transfer owner" with one click and confirm a typed-confirmation gate appears and blocks an accidental submit; attempt to promote a member to `owner` from the row select and confirm it now routes through the gated flow; disable the last super-admin and confirm the reason is visible and announced without relying on `title`.
6. **Audit filters:** type 5 characters into Target id and count network requests (expect 1 per pause, not 5); enter a partial actor id and confirm an inline validation message rather than unfiltered rows; reload the page and confirm all filters survive in the URL.
7. **Keyboard/screen reader:** on `/admin/login` and the forced password screen, confirm an `h1` exists and the heading order is sane; page through `/admin/audit`, `/admin/accounts` and `/admin/applications` with the keyboard; confirm page changes move focus/scroll to the table start and that the disabled-control reasons are announced.
