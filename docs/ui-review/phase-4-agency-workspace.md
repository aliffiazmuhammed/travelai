# Phase 4 — Agency workspace

## Scope and evidence

**Reviewed:** the agency shell and all route-level agency screens: `AgencyLogin`, `AgencyInviteAccept`, `AgencyOnboarding`, `AgencyLayout`, `AgencyOverview`, `AgencyTrips`, `AgencyTripPlanner`, `AgencyEvents`, `AgencyClients`, `AgencyEnquiries`, `AgencyTemplates`, `AgencyTeam`, `AgencyOperations`, `AgencySettings`, `AgencyPasswordChange`, plus the agency components they compose (`AgencyPageHeader`, `AgencySegmented`, `AgencySectionTabs`, `AgencyStatTile`, `AgencyEmptyState`, `AgencyCommandMenu`, `AgencyQuotePanel`, `AgencyExportPanel`, `AgencyPackagePanel`, `DirectoryProfileEditor`, the PDF preview/mapping dialogs, `ConversationThread`, `MyTripsView`) and the shared `ui` primitives they use.

**Evidence base:** source review of the working tree at `b1ef2a6` (with pre-existing local changes left untouched), the agency tokens in `frontend/src/index.css`, `tailwind.config.ts`, and the route table in `App.tsx`. No browser session, test account, screenshot, or live measurement was used for this phase. Every finding is therefore marked **code-based**. Contrast values are calculated from the declared HSL tokens, not sampled from a rendered screen. Authenticated screens cannot be visually verified from this review environment, so claims are limited to what the source makes unavoidable.

**Severity meaning:** Critical blocks a primary task; High causes repeated task failure or credible data loss; Medium creates meaningful friction or a11y debt; Low is polish or a small discoverability gap.

## Scorecard

| Area | Score (1–5) | Evidence |
| --- | --- | --- |
| Visual hierarchy and typography | 3 | `AgencyPageHeader` gives every page the same strong title/description/action anatomy, and card titles are consistent. However, operational data is often set at 10–11px (`AgencyExportPanel`, `AgencyOperations`), and the trip breadcrumb collapses to the generic word “Trip” (`AgencyLayout.tsx:142-146`). Hierarchy is competent; small type is overused. |
| Layout and spacing consistency | 3 | Shared page padding, `max-w-6xl`, rounded cards, and section tabs create a predictable rhythm. The exception is wide work queues: the enquiries table is fixed at 1024px and the agency trip list at 880px, both inside the 6xl shell (`AgencyEnquiries.tsx:1064-1066`, `MyTripsView.tsx:1199-1200`). |
| Brand distinctiveness | 4 | The warm-paper/teal agency skin, `agency-*` tokens, split auth screen, tenant-name/slug block, and document-preview language feel like a real product rather than a recoloured admin template. The dark-mode accent bug prevents a 5. |
| Content clarity and IA | 3 | Microcopy is unusually good: blocked-reason panels explain publish/export prerequisites, role copy sets expectations, and empty states name the next action. Navigation is over-fragmented for nine destinations, and one dashboard metric undercounts upcoming trips. |
| Interaction quality and feedback | 3 | Loading, empty, error, blocked, toast, and live states are broadly present. The main gaps are the detached Settings save, missing unsaved-change guards, and one-by-one roster/lead handling. |
| Responsive behavior | 2 | Clients and Team have deliberate mobile card fallbacks; the two highest-volume queues (enquiries and agency trips in list mode) do not. The enquiry inbox is effectively a desktop-only surface at phone widths. |
| Accessibility | 2 | The shell has a skip link, labelled nav, visible focus rings, and named icon buttons. Against that, dark-mode CTAs lose their label contrast, several form labels are not associated, roster targets are 28px, and the lost-reason dialog has no programmatic label or selected state. |
| Performance risk | 3 | No code path proves a broken frame rate, but the Overview loads full trip and event libraries for three cards, the agency trip library polls the whole collection every 20 seconds, and PDF preview renders every page to a 1100px JPEG at once. Risk grows with tenant size and document length. |

## Prioritised findings

### [P4-01] Critical — Dark mode turns the agency accent into a cream fill under white text

**Location:** `frontend/src/index.css:128-136`; `frontend/src/pages/agency/AgencyLogin.tsx:190,201,370`; `frontend/src/pages/agency/AgencyInviteAccept.tsx:152,185,286`; `frontend/src/pages/agency/AgencyPasswordChange.tsx:128`; `frontend/src/pages/agency/AgencyOnboarding.tsx:83`

**Evidence:** In `.dark`, `--agency-accent` is set to `41.5 44.8% 94.3%` — a cream close to `#f7f3ea`. Multiple primary actions still use the light-mode pairing `bg-agency-accent text-white`: the login and invite-submit buttons, the “Back to my trips” button, the forced password form, and the onboarding return button. The login marketing aside also uses `bg-agency-accent p-10 text-white` (`AgencyLogin.tsx:201`). White on that cream is approximately **1.1:1**, far below 4.5:1 for text. In dark mode the sign-in panel becomes a pale slab with near-invisible white copy.

**User impact:** A dark-mode agency user cannot read the primary sign-in, invitation, or password-reset action. This is an entry blocker, not cosmetic drift. The same token inversion affects any `text-agency-accent` placed on a dark surface, though those cases are less severe.

**Recommendation:** Split fill and ink roles. Keep a saturated teal for `--agency-accent` in both themes (or add `--agency-accent-fill` / `--agency-on-accent`), and use `bg-agency-accent text-agency-on-accent` or the existing `bg-primary text-primary-foreground` pair for buttons. Reserve the cream value for `--agency-ink`/text on dark. Add a token-level contrast test for every accent/white and accent/ink pair.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-02] High — Settings has a global Save that writes invisible fields

**Location:** `frontend/src/pages/agency/AgencySettings.tsx:353-418,467-519`; `frontend/src/components/agency/DirectoryProfileEditor.tsx:648-717`

**Evidence:** The page header renders a “Save changes” button whenever `canManage`, independent of the active section. Its handler always posts `name`, `gstin`, all `branding` fields, and `defaultTerms`. The Public profile tab actually renders `DirectoryProfileEditor`, which has its own “Save changes” button and dirty state; the Account tab has a third save path inside its own form. Those panels stay mounted but hidden (`hidden` at lines 517–521), so the header save can flush brand/quote edits the operator cannot see while leaving the visible profile edits unsaved. There is no dirty snapshot for brand or quote fields and no navigation guard.

**User impact:** An owner on “Public profile” clicks the prominent header Save believing the profile is saved; instead the request changes agency name/branding/quote defaults, and the profile remains unsaved. Switching tabs can hide edits and route changes discard them silently. This is a credible data-loss and trust failure in the most sensitive settings surface.

**Recommendation:** Make saving contextual: a sticky footer inside Brand and Quote defaults, and the editor’s own save on Public profile/Account. If a single save is retained, show one form with an explicit dirty state, disable the header action on tabs it does not save, and add a route/`beforeunload` guard with Save/Discard/Cancel. Never present a save action whose effect is off-screen.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-03] High — The enquiry inbox and agency trip list have no mobile layout

**Location:** `frontend/src/pages/agency/AgencyEnquiries.tsx:1062-1066`; `frontend/src/components/dashboard/MyTripsView.tsx:1196-1200`; contrast with `frontend/src/pages/agency/AgencyClients.tsx:344-345`

**Evidence:** Enquiries renders one unconditional table with `className="min-w-[1024px] table-fixed"`. There is no `hidden md:block` wrapper and no card fallback. The agency trip list renders `<table className="w-full min-w-[880px]">` inside `overflow-x-auto`. Clients already uses the correct pattern: desktop table hidden below `md`, then a card list for smaller screens. The workspace content column is capped at `max-w-6xl`, so these tables exceed the available width well before tablet size.

**User impact:** At 375–768px, an agent sees only the left portion of the inbox. Status, owner, proposal, and last-activity columns sit off-screen; changing a status or owner requires horizontal scrolling inside a table while the page itself is also scrolling. The primary triage task becomes slow and error-prone on a phone. The trip list has the same hidden-column problem in list view.

**Recommendation:** Add a below-`md` card row for enquiries (traveller + package + status badge + owner + unread + timestamp, tap to open the existing sheet, with status/assignee edits inside the sheet). For trips, provide compact mobile rows or default to the existing grid at narrow widths. Keep the desktop table unchanged.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-04] Medium — Enquiry triage has status filtering but no search, ownership filter, or bulk actions

**Location:** `frontend/src/pages/agency/AgencyEnquiries.tsx:1009-1024,1081-1289`

**Evidence:** The only list control is `AgencySegmented` over statuses. There is no name/email/package search, no “unassigned” or “assigned to me” filter, no sort selector, and no row selection. Every claim, assign, status move, and conversion is a per-row interaction; rows already include two inline selects plus an open button.

**User impact:** Once the inbox exceeds one page, an agent cannot find a traveller by name or isolate the unclaimed queue. High-volume triage becomes repeated scanning and clicking; a team cannot clear a morning inbox as a batch.

**Recommendation:** Add a search field (name, email, package, client), quick filters for unassigned/mine/needs reply, and a last-activity/date sort. Add row selection with bulk claim, assign, and status actions, using a confirmation summary and an undo toast for reversible moves. Preserve filters in the URL so links are shareable.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-05] Medium — Event rosters only support one decision at a time

**Location:** `frontend/src/pages/agency/AgencyEvents.tsx:1385-1503`

**Evidence:** The roster maps each interest to independent Confirm and Decline buttons. There are no checkboxes, select-all, or bulk apply, and the only filter is status. Capacity-aware confirmation is calculated globally, but the operator must still process every waiting traveller individually.

**User impact:** A popular event with 20–50 waiting travellers requires 20–50 separate clicks, with no way to confirm a block of people up to the remaining capacity. That is slow and increases the chance of confirming the wrong person next to a Decline action.

**Recommendation:** Add selection, “select all waiting”, and a bulk action bar: Confirm selected (blocked at remaining capacity, with an explicit over-capacity explanation) and Decline selected with an optional shared reason. Keep the single-row actions for exceptions.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-06] Medium — Many frequent controls are below a comfortable touch target

**Location:** `frontend/src/pages/agency/AgencyEvents.tsx:1459-1493`; `frontend/src/components/agency/AgencySegmented.tsx:49`; `frontend/src/pages/agency/AgencyEnquiries.tsx:1166-1172,1206-1209`; `frontend/src/pages/agency/AgencyLayout.tsx:418,449-461`

**Evidence:** Roster Confirm/Decline buttons are `h-7` (28px). Segmented filters use `px-3 py-1.5` with `text-xs`, yielding roughly a 30px row. Enquiry status and owner selects are `h-8` (32px), and the shell trigger/search buttons are `h-9` (36px). These are all below the 44px touch guidance; the 28px Decline sits immediately beside Confirm.

**User impact:** On touch devices, especially in the roster and segmented filters, agents will miss targets or hit the adjacent destructive action. This is a recurring friction rather than a single-page defect.

**Recommendation:** Raise interactive targets to at least 40px on coarse pointers (44px where possible), increase spacing around destructive neighbours, and keep the visual density by using padding rather than shrinking the hit area. Add a mobile target audit to the shared `AgencySegmented` and button sizes.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-07] Medium — Destructive actions are inconsistent, and some have no confirmation

**Location:** `frontend/src/pages/agency/AgencyClients.tsx:238-246`; `frontend/src/pages/agency/AgencySettings.tsx:306-310`; `frontend/src/pages/agency/AgencyTeam.tsx:549-557`; `frontend/src/components/agency/AgencyExportPanel.tsx:804-819`

**Evidence:** Deleting a client and removing a brand asset use native `window.confirm`. Revoking an invitation and revoking a client share link execute immediately on click. Meanwhile package deletion, profile unpublish, and member removal use styled `AlertDialog`s with explicit consequences (`AgencyPackagePanel.tsx:824-858`, `DirectoryProfileEditor.tsx:664-690`, `AgencyTeam.tsx:703-727`). The workspace therefore teaches three different safety models.

**User impact:** Native confirm dialogs break the visual language, cannot present structured context, and behave differently for keyboard/screen-reader users. Immediate revocation can invalidate a client link with one stray click, and the inconsistency makes operators unsure which actions are reversible.

**Recommendation:** Standardise on the styled `AlertDialog` for destructive actions, naming the object and consequence in the description. Reserve native confirm only for browser-level unsaved-change guards. Use an undo toast for reversible actions (invite revoke, share revoke) and a clear destructive action label for irreversible ones.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-08] Medium — The Overview says “trips coming up” but counts at most three

**Location:** `frontend/src/pages/agency/AgencyOverview.tsx:121-127,249-258`

**Evidence:** `upcomingTrips` filters and sorts the trip list, then calls `.slice(0, 3)`. The stat tile uses `value={upcomingTrips.length}` and the label “trip(s) coming up”. If a tenant has eight future trips, the headline number is 3. The adjacent card is correctly titled “Coming up” and does show the next three, but the KPI inherits the slice.

**User impact:** An owner reads an understated workload and may miss trips that need attention. This is a quiet data-accuracy defect in the first screen of the workspace.

**Recommendation:** Compute an uncapped `upcomingCount` for the KPI and keep `upcomingPreview = upcomingCount.slice(0, 3)` for the card. If the intent is a preview, label the KPI “Next 3 trips” rather than a total.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-09] Medium — Summary surfaces fetch complete trip and event libraries

**Location:** `frontend/src/pages/agency/AgencyOverview.tsx:103-107`; `frontend/src/components/agency/TemplatePreviewDialog.tsx:77-88`; `frontend/src/services/api.ts:1186-1188,1455-1472`

**Evidence:** Overview calls `getAgencyTrips(activeAgencyId)` and `listAgencyEvents(activeAgencyId)` with no limit, only to derive three upcoming trips and three live events. The API wrapper exposes search/status/assignee/archived filters for trips but no limit or field projection; the events list has no parameters at all. `TemplatePreviewDialog` also loads the entire trip library to populate a preview select. There is no abort controller on the Overview requests beyond the `cancelled` flag.

**User impact:** Large tenants pay the payload, parse, and render cost of their whole library on the home screen every time it mounts. The template preview inherits the same cost. On slower devices this delays the “morning glance” and can make the preview dialog feel unresponsive.

**Recommendation:** Add server-side summary endpoints (or `limit`, `sort`, and field projection) for “next 3 upcoming” and “next 3 live events”. Replace the template trip `<Select>` with a paginated/searchable picker. Abort requests on unmount and cancel stale reads.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-10] Medium — PDF preview converts every page to a full-width JPEG at once

**Location:** `frontend/src/components/agency/PdfDocumentViewer.tsx:43-56`; `frontend/src/components/agency/AgencyExportPanel.tsx:1143-1150`; `frontend/src/components/agency/TemplatePreviewDialog.tsx:244-248`

**Evidence:** The viewer loops over `doc.numPages`, renders each page at `RENDER_WIDTH = 1100`, converts the canvas with `canvas.toDataURL('image/jpeg', 0.85)`, and stores every resulting data URL in state. There is no page cap, lazy loading, virtualization, or explicit canvas release. The same component is used in the export workspace and the template version dialog, both inside 560px/60vh containers.

**User impact:** A long proposal or itinerary can allocate tens of megabytes of uncompressed canvas plus JPEG data, block the main thread between pages, and make the dialog appear frozen. The preview is often opened casually, so the cost is paid even when the agent only checks page one.

**Recommendation:** Render the current page or a small thumbnail strip on demand; move rendering to a worker where practical; size the render to the container/DPR rather than a fixed 1100px; release canvas backing stores and avoid retaining full-resolution data URLs for every page.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-11] Medium — Visible labels are not programmatically associated in several forms

**Location:** `frontend/src/components/agency/AgencyQuotePanel.tsx:1430-1445,1559-1583`; `frontend/src/pages/agency/AgencyTeam.tsx:610-640`; `frontend/src/pages/agency/AgencyClients.tsx:292-300`

**Evidence:** The quote Currency `<Label>` has no `htmlFor`, and its `SelectTrigger` has no `id` or `aria-label`. Quote line Quantity and Unit price have the same pattern around their number inputs. The team invite Role and Type labels are also unassociated with their Select triggers. Client search relies only on a placeholder. These controls look labelled but have no accessible name.

**User impact:** A screen-reader user hears an unnamed combobox or spin button and cannot reliably tell Currency from Tax or Role from Type. Voice-control users cannot target the field by its visible label.

**Recommendation:** Pair every `Label` with a matching `htmlFor`/`id`, or add an explicit `aria-label` where the visual structure makes a hidden label preferable. Add `aria-label="Search clients"` to the client search input. Audit all `Label` usages without `htmlFor` across agency forms.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-12] Medium — The “Mark lost” dialog hides its selected state and field label

**Location:** `frontend/src/pages/agency/AgencyEnquiries.tsx:1359-1382`

**Evidence:** Preset reason chips are plain buttons with conditional styling but no `aria-pressed`, radio role, or group label. The required `<Textarea>` has only a placeholder, no `id`, no `<Label>`, and no `aria-describedby`. The submit button is disabled until the reason is non-empty, but the field itself does not communicate that it is required.

**User impact:** A screen-reader user cannot tell which preset is selected or what the text area is for, and may not understand why “Mark lost” is disabled. The visually obvious red chip styling carries all the state.

**Recommendation:** Model presets as a labelled radio group or toggle buttons with `aria-pressed`; give the textarea a visible label (or `aria-label`), `required`, and a description; keep the disabled reason tied to a visible validation message.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-13] High — Dirty editors have no navigation guard

**Location:** `frontend/src/components/agency/AgencyPackagePanel.tsx:296-301`; `frontend/src/components/agency/AgencyQuotePanel.tsx:1239-1244`; `frontend/src/components/agency/DirectoryProfileEditor.tsx:270,706-716`

**Evidence:** Each editor computes a dirty state and surfaces it visually, but none installs a router blocker or `beforeunload` handler. The quote only warns when switching between versions; the package only disables its own Save button; the directory editor shows “Unsaved changes” next to Save. Sidebar, breadcrumb, command-menu, and browser navigation are all unguarded.

**User impact:** A long package summary, a reworked quote with line items, or a directory profile edit can disappear with one navigation click or refresh. The UI knows the work is unsaved but does not protect it.

**Recommendation:** Use a route blocker plus `beforeunload` whenever the editor is dirty. Present Save / Discard / Stay, and preserve the draft in session storage where practical. For short fields, autosave a draft and make the explicit save/publish step separate.

**Effort:** M

**Confidence:** High

**Basis:** code-based

### [P4-14] Low — The trip library polls its full list every 20 seconds while idle

**Location:** `frontend/src/pages/agency/AgencyTrips.tsx:273-290`

**Evidence:** An interval calls `loadTrips(false)` every 20 seconds, and the same refresh also runs on window focus and visibility change. The interval is not gated on `document.visibilityState`, and there is no abort/request-id or conditional-request mechanism shown. The list endpoint returns the whole library.

**User impact:** An idle workspace in a background tab keeps issuing library reads, consuming battery/data and server capacity. Overlapping focus/visibility/interval reads can race and briefly show older data.

**Recommendation:** Pause polling while hidden, use a longer interval or SSE for library changes, abort stale requests with a request id, and add cache validators. The inbox already uses a stream with polling fallback; reuse that pattern instead of a blind interval.

**Effort:** S

**Confidence:** Medium

**Basis:** code-based

### [P4-15] Low — Navigation is split into four groups for nine items, including two one-item groups

**Location:** `frontend/src/pages/agency/AgencyLayout.tsx:77-103`

**Evidence:** Relationships contains only Clients and Studio contains only Templates, while Work contains four items and Workspace contains Team, Operations, and Settings. The group labels consume vertical space and add a scan layer without adding much semantic separation; in the collapsed icon rail the labels disappear entirely.

**User impact:** New users must scan four headings to find a familiar destination, and one-item groups read as arbitrary taxonomy. The cost is small but repeated on every navigation.

**Recommendation:** Collapse to two or three groups (for example Work: Overview/Enquiries/Trips/Events/Clients; Studio: Templates; Workspace: Team/Operations/Settings), or use dividers rather than labelled groups for single items. Keep the command menu as the fast path.

**Effort:** S

**Confidence:** Medium

**Basis:** code-based

### [P4-16] Low — The command-menu hint shows only the macOS shortcut

**Location:** `frontend/src/pages/agency/AgencyLayout.tsx:449-461`; `frontend/src/components/agency/AgencyCommandMenu.tsx:49-57`

**Evidence:** The button’s `aria-label` correctly says “Control or Command K” and the key handler accepts both `metaKey` and `ctrlKey`, but the visible `<kbd>` always renders `⌘K`. Windows and Linux users see no indication that Ctrl+K works.

**User impact:** Non-Mac users may not discover the fastest navigation affordance, especially once the sidebar is collapsed.

**Recommendation:** Render a platform-aware hint (`Ctrl K` on Windows/Linux, `⌘K` on Apple) or show `Ctrl/⌘ K`. Keep the accessible label aligned with the visible hint.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-17] Low — Trip detail breadcrumbs lose the trip identity

**Location:** `frontend/src/pages/agency/AgencyLayout.tsx:142-146`

**Evidence:** Any path under `/agency/trips/` appends either “New trip” or the literal “Trip”. There is no route-aware title insertion, so `/agency/trips/<id>` always reads “Workspace / Trips / Trip”, even when the page below shows a specific client and destination.

**User impact:** With multiple trips open in tabs or a shared link, the shell header gives no confirmation of which trip is active. The breadcrumb becomes decoration rather than orientation.

**Recommendation:** Let the trip page publish its title to a layout context or render a page-level breadcrumb leaf using the loaded trip title, with a neutral “Untitled trip” fallback. Keep “New trip” for the create route.

**Effort:** S

**Confidence:** High

**Basis:** code-based

### [P4-18] Low — Plan-usage bars have no meter semantics

**Location:** `frontend/src/pages/agency/AgencyOperations.tsx:100-127`

**Evidence:** Usage is rendered as a labelled `div` with an inner fill whose width is a percentage. There is no `role="meter"`/`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, or accessible name on the bar. The numeric `used / cap` text is present, so the information is not entirely lost.

**User impact:** Screen-reader users get the numbers as plain text but cannot navigate to or query the usage level as a meter. The warning/over state is conveyed only by colour classes and a separate text class.

**Recommendation:** Give the bar `role="meter"` with an accessible label, current/min/max values, and a text equivalent that includes the level (“82% — warning”). Keep the visible numbers and add a non-colour indicator for warning/over.

**Effort:** S

**Confidence:** High

**Basis:** code-based

## What to keep

- **A real workspace shell, not a generic dashboard.** `AgencyPageHeader` establishes one title/description/action rhythm across pages, and `AgencySegmented` + `AgencySectionTabs` make filtering and section switching feel learned once and reused everywhere. This is the strongest systemic UI decision in the phase.
- **A distinctive but restrained brand system.** The warm paper canvas, teal primary, fine `agency-line` rules, `agency-soft` surfaces, and split auth screen give the agency product its own identity while remaining consistent with the public product. The tokens are the right foundation; the dark-mode accent needs a role split, not a redesign.
- **Microcopy that explains consequences.** Publish blockers in `AgencyPackagePanel`, export prerequisites in `AgencyExportPanel`, directory readiness in `DirectoryProfileEditor`, and the role-specific “who can do this” copy are concrete and unusually honest. They reduce support load and make permission boundaries legible.
- **High-trust document workflows.** Quote and template versions are pinned to exports, watermarks distinguish draft/expired quotes, share links are shown once with an explicit warning, and PDFs have a 30-day retention message. The UI communicates immutability instead of pretending edits are harmless.
- **Tenant identity and permission clarity.** The sidebar always names the agency and slug, shows the signed-in role, filters admin-only Operations, and explains that an agency account is separate from the personal account. An operator knows which workspace they are in and what they are allowed to do.
- **A genuinely shared enquiry-detail surface.** Desktop and mobile use the same `EnquiryDetail`, including the thread, claim/assign controls, quote hand-off, and lost-reason flow. The live/poll indicator, unread counts, deep links from clients, and route-level badge refresh are the right shape for an inbox.
- **Mobile card fallbacks where they exist.** Clients and Team deliberately switch from table to cards below `md`. That pattern should be copied to the queues called out above rather than replaced.
- **Accessible shell basics.** The skip link, labelled `<nav>`, breadcrumb landmarks, visible focus rings on custom buttons, named icon actions, and the keyboard command menu are a solid baseline to preserve while fixing the specific gaps.

## Validation plan

1. **Dark-mode contrast regression:** Open `/agency/login`, an invite link, `/agency/onboarding`, and the forced password screen with `dark` on `<html>`. Compute the rendered foreground/background contrast of every primary button and the login aside; require ≥4.5:1 for text and ≥3:1 for large text/UI. Then verify a fix in all four surfaces, plus `text-agency-accent` on `bg-agency-panel`, `bg-agency-canvas`, and `bg-agency-soft`.
2. **Responsive queue sweep:** At 375, 414, 768, 1024, 1440, and 1920px, load `/agency/enquiries` and `/agency/trips` in list mode with at least 15 rows. Record horizontal scroll, columns hidden off-screen, and whether status/assignee can be changed without lateral panning. Pass if the primary row action and status are visible without horizontal scrolling, or the page switches to a deliberate card layout.
3. **Keyboard and screen-reader pass:** Tab through the enquiry table including the row, status select, owner select, and open button; then the lost-reason dialog; quote client/currency/line-item fields; team invite Role/Type; client search; and the event roster. Verify each control has an accessible name, selected state, and visible focus. Measure target boxes and require ≥44px on touch emulation. Confirm the sheet returns focus to the originating row on close.
4. **Unsaved-work tests:** With dirty Brand fields, a dirty Public profile, a saved quote plus unsaved line edits, and an unsaved package summary, trigger sidebar navigation, breadcrumb navigation, browser refresh, and tab close. Pass if a Save/Discard/Stay prompt appears (or a draft is preserved), and if the Settings header button never saves fields outside the active tab.
5. **Destructive-action consistency:** Exercise client delete, brand-asset remove, invite revoke, share-link revoke, package delete, profile unpublish, and member removal. Confirm each names the target and consequence, offers Cancel, uses the same dialog component, and provides undo where the action is reversible. Confirm no action fires on a single stray click without a recovery path.
6. **Roster and inbox scale test:** Seed 30 pending event interests and 60 enquiries across statuses/owners. Verify bulk selection, capacity-aware confirm, bulk decline, enquiry search, unassigned/mine filters, and pagination/filter resets. Time a realistic morning triage and record clicks/keystrokes versus the current one-by-one path.
7. **Performance and payload check:** With 100+ trips and 50+ events, capture the Overview network panel and time-to-interactive. Confirm the page no longer downloads full libraries for three-card summaries. Render a 20-page proposal PDF and measure memory/render time in the export and template-preview dialogs; pass if the first page appears promptly and memory stays bounded while paging.
8. **Dashboard truth check:** Create 8 future trips, 5 live events, and 12 pending interests. Verify the upcoming-trip KPI reads 8 (or is explicitly labelled as a three-item preview), the event badge matches pending interests, and the setup checklist does not flash “incomplete” while its data is still loading.
