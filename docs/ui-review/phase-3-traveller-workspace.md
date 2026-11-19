# Phase 3 — Traveller workspace

## Scope and evidence

**Surfaces reviewed:** `/dashboard` (trip library and trip detail), `/plan`, `/enquiries`, `/enquiry/:enquiryId` and `/conversation/:token`, `/proposals`.

**Primary files read in full or in functional part:**

- `frontend/src/pages/Dashboard.tsx`, `TripPlanner.tsx`, `Enquiries.tsx`, `ConversationPage.tsx`, `MyProposals.tsx`
- `frontend/src/components/ItineraryDisplay.tsx`
- `frontend/src/components/dashboard/MyTripsView.tsx`, `TripHeader.tsx`, `DayTimeline.tsx`, `TripMap.tsx`, `TripSkeletons.tsx`, `DiscussionDrawer.tsx`, `CommentsTab.tsx`
- `frontend/src/components/traveller/EnquiryThreadPane.tsx`, `TravellerBreadcrumbs.tsx`, `TravellerSegmented.tsx`, `TravellerPageHeader.tsx`
- `frontend/src/components/wizard/*` (all six steps, `WizardProgress`, `GenerationOverlay`)
- `frontend/src/services/api.ts` (`generateItineraryStream`), `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/src/components/ui/button.tsx`, `tabs.tsx`, `input.tsx`, `textarea.tsx`

**Method:** source inspection against the product's own tokens and against adjacent traveller pages, per `docs/ui-review/README.md`. No authenticated session was available, so **no browser was run and no screenshot was taken**. Every finding here is labelled **code-based**; contrast values are computed from the HSL tokens in `index.css`, not sampled from a rendered page. There is no analytics or user research in the repository, so severity reflects likely impact from the code path, not measured traffic.

**What is out of scope:** the agency and admin realms (Phases 4 and 5), and the public proposal/guest share page except where the traveller thread reuses it.

## Scorecard

| Area | Score (1–5) | Evidence |
| --- | --- | --- |
| Visual hierarchy and typography | 3 | The library and trip detail have a real hierarchy: display-face `h1`, quiet secondary line, one primary action. It is undermined by a 9–11px metadata layer used for status, timestamps, counters and badges (`EnquiryThreadPane.tsx` 523, 531; `MyProposals.tsx` 486, 514), and by three different `h1` scales across the four screens. |
| Layout and spacing consistency | 3 | Shared container `max-w-6xl`, `pt-24` under a 64px fixed navbar, and `gap-5/6` grids are consistent. But the same "filter" job is rendered at three different heights with two active-state idioms (shared control, an overridden shared control, and hand-rolled pills), and the two split-pane screens compute their height differently. |
| Brand distinctiveness | 4 | Cream canvas, deep moss primary, coral accent, display face on headings, and a travel-specific voice ("One thread, from first idea to final plan", "No payment is taken here") read as a deliberate product, not a template. The coral is over-used for small text, which weakens rather than removes the identity. |
| Content clarity and IA | 2 | The itinerary is the product's core artifact, yet two of its visual layers invent data: map pins are placed by radial offset when coordinates are missing (`TripMap.tsx` 493–501) and time-of-day labels cycle by array index when `activity.time` is absent (`DayTimeline.tsx` 475, 576). Around that, seven flat itinerary tabs and a library search that silently narrows to one status tab make the IA harder to hold in mind. |
| Interaction quality and feedback | 2 | Generation cannot be cancelled or left (`GenerationOverlay.tsx` 108–129; `api.ts` 2182–2250), and a failed trip-library fetch renders as a genuine empty state (`Dashboard.tsx` 124–129). Both are flows where the interface states something untrue. Elsewhere feedback is strong. |
| Responsive behavior | 3 | No hard breakage was found: grids collapse, the wizard rail scrolls inside its own strip, and the enquiry list becomes a single column with a back affordance. Weak points are the seven-tab rail at `md` widths (overflow with a hidden scrollbar) and 28px icon clusters that assume a pointer. |
| Accessibility | 2 | The coral accent reaches about 2.6:1 on the cream canvas and 2.9:1 on white while carrying 10–11px functional text; five activity controls are named only by `title`; the generation "modal" has no focus trap or initial focus. Focus rings and reduced-motion coverage for loaders are genuinely good. |
| Performance risk | 2 | Route-level `lazy()` exists, but the Dashboard chunk statically pulls Leaflet, `react-leaflet` and Recharts through `ItineraryDisplay`, and Leaflet CSS is imported globally in `main.tsx`. A second map instance mounts inside the timeline rail at `xl`, and two weather endpoints fire on every trip open before any tab is visited. |

## Prioritised findings

### [TRV-01] Critical — Itinerary generation has no cancel, no abort, and no way out of the overlay

**Location**
`frontend/src/pages/TripPlanner.tsx` 286–293, 342–384, 590–603; `frontend/src/components/wizard/GenerationOverlay.tsx` 108–129, 253–274; `frontend/src/services/api.ts` 2182–2250.

**Evidence**
`handleCancelOverlay` only calls `setIsOverlayOpen(false)` and `setLoading(false)`; it never touches the request. The overlay's close button and "Back to the wizard" action are both rendered inside `{error && …}` (lines 120 and 254), so while a stream is in progress the only visible controls are informational. `generateItineraryStream` calls `fetch` with no `AbortController` and no `signal`, then reads the body to completion. When the stream ends, `onComplete` runs `setTimeout(() => navigate("/dashboard"), 800)` regardless of what the user did in the meantime.

**User impact**
The overlay covers the app with no escape hatch for the length of an AI generation, which is the longest wait in the product. A user who hits browser Back is still navigated to `/dashboard` 800ms after completion. A user who assumes it failed and retries can create two itineraries and incur two generations for one intent.

**Recommendation**
Thread an `AbortController` through `generateItineraryStream`, abort on unmount and on an explicit "Stop generating" action, and gate `onComplete` on a `cancelled` flag. Make the overlay dismissible while streaming, with copy that states whether the work continues in the background. Never call `navigate` from a callback whose owning view has unmounted.

**Effort** M — client-side plumbing plus one button and copy; no backend contract change if the server tolerates a dropped connection.
**Confidence** High — the absence of a signal and the render conditions are both explicit in source.
**Basis** Code-based. Not observed in a live session.

---

### [TRV-02] High — A failed trip-library load is rendered as an empty library

**Location**
`frontend/src/pages/Dashboard.tsx` 124–129, 481–492; `frontend/src/components/dashboard/MyTripsView.tsx` 1170–1181, 877–880.

**Evidence**
`loadTrips` catches the error, logs it, and shows `toast.error("Failed to load your trips. Please check your connection.")` only when `showSpinner` is true. There is no error state, no retry control, and no banner. On the initial load `trips` stays `[]`, so `MyTripsView` reaches the `ownedTrips.length === 0 && sharedTrips.length === 0` branch and renders `"No upcoming trips yet"` with a "Plan a new trip" action. `loadDeletedTrips` fails silently by design (line 137).

**User impact**
A traveller with a full library who hits a flaky network, an expired session or a 5xx is told, in the page's own voice, that they have no trips. The only contradicting signal is a toast that disappears. They may re-plan a trip they already own or conclude their data was lost. This is the one traveller screen without the error pattern the product already uses: `Enquiries.tsx` 268–281 and `MyProposals.tsx` 245–259 both show a persistent destructive banner with a "Try again" button.

**Recommendation**
Add an `error` state to `Dashboard`, render the same banner-and-retry pattern used on Enquiries and MyProposals, and suppress the empty state while `error` is set. Keep the toast as a secondary cue for the quiet refresh only.

**Effort** S — one state, one banner, one guard.
**Confidence** High — the empty branch is unconditional on load failure.
**Basis** Code-based.

---

### [TRV-03] High — The coral accent fails contrast while carrying small functional text

**Location**
`frontend/src/index.css` 11, 30; `frontend/src/components/dashboard/TripHeader.tsx` 73, 334, 368; `frontend/src/pages/Enquiries.tsx` 231; `frontend/src/pages/MyProposals.tsx` 390, 534, 543, 703; `frontend/src/pages/ConversationPage.tsx` 429; `frontend/src/components/wizard/GenerationOverlay.tsx` 138.

**Evidence**
`--accent: 13.2 76% 62.4%` resolves to about `#E87656`; `--background: 41.5 44.8% 94.3%` resolves to about `#F7F3EA`. Relative luminance gives roughly **2.65:1** on the canvas and **2.93:1** on white. The token is used as foreground for the "Live" pill (10px), the "Saved" state and "N here now" live count (11px), the accepted-proposal badge (10px), "No payment is taken here" (11px) and the generation success tick. Of these, the "Live" pill also sits on `bg-accent/10`, lowering the ratio further.

**User impact**
Low-vision users and anyone on a dim or glossy screen cannot reliably read live status, save confirmation and proposal state — precisely the states that tell them whether their action worked. WCAG 2.2 AA requires 4.5:1 for text below 18.66px bold / 24px regular; this fails at every size it is used.

**Recommendation**
Keep the coral for fills, dots, borders and illustration, where 3:1 non-text contrast is the bar. For text, introduce an `--accent-ink` token at least four steps darker (roughly `13 65% 34%`) and use it for all `text-accent` occurrences. Alternatively, wrap small status text in a dark-ink chip with a coral dot.

**Effort** S — one token and a mechanical replacement.
**Confidence** High — computed from the shipped HSL tokens using the WCAG relative-luminance formula.
**Basis** Code-based (colour math, not screenshot sampling).

---

### [TRV-04] High — The map fabricates coordinates and presents them as real places

**Location**
`frontend/src/components/dashboard/TripMap.tsx` 478–540; consumers at `frontend/src/components/ItineraryDisplay.tsx` 942–1014.

**Evidence**
When an activity has no valid `coordinates`, the code computes `angle = (dayIdx * 2.2 + actIdx * 1.3) % 2π`, a radius that grows with the activity index, and places the pin at `baseCoord + radius * (sin, cos)`. Stays get the same treatment with a smaller radius. The resulting pin carries the real activity title, day number and category and participates in the same popups, filters and saved routes as a geocoded pin. There is no "approximate" flag, different marker style or legend entry anywhere in the file.

**User impact**
A traveller opening the map to orient themselves sees "Lunch at X" pinned to a residential block three kilometres from the actual restaurant, and "Hotel Y" pinned to a different wrong block. This is confidently wrong spatial information in a planning product, and it is silently mixed with accurate pins so the user has no way to tell which is which. On a shared or exported itinerary it can send someone to the wrong area.

**Recommendation**
Render unpinned activities in a clearly separate "Location not mapped" list or drawer, not on the map. If a fallback is needed, use a distinct numbered outline marker with an explicit "approx. area" popup, and never do it for stays. Prefer geocoding at generation time so fewer items need a fallback.

**Effort** M — marker variant, list treatment, copy.
**Confidence** High — the offset maths and shared popup path are explicit.
**Basis** Code-based.

---

### [TRV-05] High — The timeline invents Morning / Afternoon / Sunset / Night labels

**Location**
`frontend/src/components/dashboard/DayTimeline.tsx` 85–90, 471–476, 558–577.

**Evidence**
`TIME_OF_DAY` is a fixed four-item array. For every activity the component computes `timeSlot = TIME_OF_DAY[actIdx % TIME_OF_DAY.length]` and renders `actTime || timeSlot.label` with a matching sun, compass, sunset or moon icon. A five-activity day therefore starts again at "Morning" for its fifth item. `actTime` comes from user or AI metadata and is often absent.

**User impact**
The label reads as scheduling information ("this is your morning activity") but is an artefact of list position. A traveller planning around opening hours, heat or transit will build the day on invented sequencing. Reordering an activity silently changes its stated time of day, which makes the drag interaction look like it edits schedule semantics it does not touch.

**Recommendation**
Show the time slot only when a real time or slot exists. Otherwise use a neutral sequence marker ("Stop 1") or a category icon with no time claim. If the AI can emit a slot, persist it as data and display it; do not derive it from index.

**Effort** S — conditional render plus one fallback label.
**Confidence** High — index-modulo derivation is unambiguous.
**Basis** Code-based.

---

### [TRV-06] Medium — Activity rows expose five 28px icon-only controls named by `title`

**Location**
`frontend/src/components/dashboard/DayTimeline.tsx` 387–415, 639–704.

**Evidence**
Each editable activity renders reorder-up, reorder-down, edit, rename and delete as `size="icon"` ghost buttons at `h-8 w-8` on mobile and `h-7 w-7` from `sm` up, with `gap-1` between them. Their only accessible name is `title="Reorder up"`, `title="Edit details"`, `title="Delete activity"` and so on; the icons are not `aria-hidden`. The day reorder pair above uses the same pattern. Delete sits immediately beside rename in the same 4px-gap cluster and is the only destructive action in the row.

**User impact**
On a phone the destructive control is a 28px target next to four others, which invites mis-taps during one-handed use. For screen-reader users the name depends on browser handling of `title`, which is inconsistent and suppressed on some touch assistive tech, so five adjacent buttons can be announced as "button" repeatedly.

**Recommendation**
Use `aria-label` on every icon button, hide the icon with `aria-hidden`, raise touch targets to 40–44px on coarse pointers, and separate delete from the reorder/edit cluster (or move it into the existing overflow menu). Consider collapsing rename and edit, which both change the title.

**Effort** S — attributes and spacing.
**Confidence** High — markup is explicit; the accessibility impact is inferred from named-control rules.
**Basis** Code-based.

---

### [TRV-07] Medium — Traveller page titles use three scales while the shared header sits unused

**Location**
`frontend/src/pages/Dashboard.tsx` via `MyTripsView.tsx` 1009–1019; `Enquiries.tsx` 217–226; `MyProposals.tsx` 172–193; `frontend/src/components/traveller/TravellerPageHeader.tsx` 29–71.

**Evidence**
The library `h1` is `text-4xl … sm:text-5xl`; Enquiries and Proposals are `text-3xl … sm:text-4xl`; the trip detail uses `text-[1.75rem] … lg:text-[2.6rem]` in `TripHeader.tsx` 240; the conversation title is `text-lg` inside a card. `TravellerPageHeader` — documented as the shared header and specifying `text-2xl` — has no import or usage anywhere in `src` (grep returns only its own definition). Its eyebrow, description, meta and action slots are therefore dead code.

**User impact**
Moving between Library → Enquiries → Proposals feels like moving between three products: the page title jumps by 8–12px and the surrounding rhythm changes. The unused header means each new traveller screen will keep re-inventing the same block, so the drift compounds.

**Recommendation**
Adopt one scale: `text-3xl sm:text-4xl` for page titles, with the library free to go one step larger only if it is treated as the workspace home. Either wire `TravellerPageHeader` into all four screens (and delete the duplicated markup) or delete the component and codify the scale in a small `PageTitle` primitive.

**Effort** M — touches four pages and one shared component.
**Confidence** High.
**Basis** Code-based; no rendered comparison.

---

### [TRV-08] Medium — The "one filter control for traveller pages" is bypassed, so filters diverge in look and behaviour

**Location**
`frontend/src/components/traveller/TravellerSegmented.tsx` 19–48; `frontend/src/pages/Enquiries.tsx` 324–345; `frontend/src/components/dashboard/MyTripsView.tsx` 1113–1124; `frontend/src/pages/MyProposals.tsx` 227–237.

**Evidence**
`TravellerSegmented`'s own docstring says it is "the one filter control for traveller pages". MyProposals uses it at the default `min-h-[30px]` with a filled `bg-primary text-primary-foreground` active state. MyTripsView uses the same component but overrides the trigger to `min-h-[34px]` and `px-4`, so the library's tab row is taller than the proposal row. Enquiries bypasses the component entirely and hand-rolls pills at `min-h-[28px]` with a different active idiom (`bg-primary/10 text-primary ring-1 ring-inset ring-primary/25`) plus a `text-[10px]` count.

**User impact**
The same job — narrowing a list — appears at 28, 30 and 34px with two definitions of "selected": a filled pill on the shared control, a tinted ring on Enquiries. Travellers have to re-read the filter bar on each page to see which option is active, and the smaller Enquiries pills are the least legible of the three.

**Recommendation**
Make `TravellerSegmented` the only filter control and add a `density` (or `size`) prop instead of per-page class overrides. Migrate the Enquiries pills so counts and heights come from the shared component, and standardise one active-state treatment across the four screens.

**Effort** M — one component change plus three call sites.
**Confidence** High.
**Basis** Code-based.

---

### [TRV-09] Medium — The personal library has no "All" scope, so search silently narrows to one status tab

**Location**
`frontend/src/components/dashboard/MyTripsView.tsx` 201–210, 500–556, 843–847, 1113–1124.

**Evidence**
The personal view offers exactly four tabs: `upcoming | drafts | past | trash`, where `upcoming` means `planned || ongoing` and `past` means `completed`. There is no `All`. Search is applied after the tab filter (`filteredTrips` is `searchedTrips.filter(matchesPersonalTab)`), so with the default `upcoming` tab a search for a completed trip returns "No matching trips found" even though the trip is one tab away. The empty copy does hint "or another tab" (line 846), but the search field gives no scope hint, and `trash` — a place, not a status — sits in the same row as three time-based categories.

**User impact**
The most common library question — "where is my trip to X?" — can fail while the trip is present. Users must learn that search is tab-scoped by trial and error, and they cannot scan their whole history in one place. A traveller looking for a finished trip may conclude it was deleted.

**Recommendation**
Add an `All` scope (or make search global and show results grouped by Upcoming / Drafts / Past). Move Trash out of the status row and into the existing "Recently deleted" shelf or a secondary action. State the active scope in the search placeholder if search stays local.

**Effort** M — filtering model and empty-state copy.
**Confidence** High — `matchesPersonalTab` and the memo order are explicit.
**Basis** Code-based.

---

### [TRV-10] Medium — Enquiry filter counts are computed from loaded pages, so pills under-report

**Location**
`frontend/src/pages/Enquiries.tsx` 28, 103–107, 131–138, 172–183, 324–345.

**Evidence**
The inbox fetches `PAGE_SIZE = 20` with a cursor, appends pages on "Load more", and computes `replied`, `quote` and `open` with `enquiries.filter(...).length`. Only `all` uses `total` from the server. The code comment acknowledges that "counts read the rows on screen", but the pills render these tallies next to the labels with no indication that they are partial.

**User impact**
With 45 enquiries, the header may read "All 45 · Waiting on you 3" when 9 are waiting, because six are on page three. A traveller can reasonably conclude there is nothing left to answer. The "All" number and the other three visibly do not reconcile (3 + 0 + 1 ≠ 45), which reads as a bug.

**Recommendation**
Return per-filter counts from the enquiries endpoint (one aggregate query) and render those. If that is too costly, show counts only for `All` and drop them from the sub-filters until the full set is loaded, or mark them with a `+` and a tooltip.

**Effort** S — API field plus prop wiring, or a UI removal.
**Confidence** High.
**Basis** Code-based.

---

### [TRV-11] Medium — Proposal answering is duplicated across three surfaces with two freshness contracts

**Location**
`frontend/src/components/traveller/EnquiryThreadPane.tsx` 264–320, 746–764; `frontend/src/pages/ConversationPage.tsx` 150–170; `frontend/src/pages/MyProposals.tsx` 108–140, 358–446, 597–621.

**Evidence**
Two card components render their own Accept/Decline two-step UI: `ProposalAttachment` in `EnquiryThreadPane` and `ProposalCard` in `MyProposals`. The copy is identical, but the chrome is not — `h-8 rounded-full px-3 text-[11px]` in the thread versus `text-xs` in the proposal card footer. The state-update strategy also differs: `ConversationPage.acceptProposal` (152–160) and `EnquiryThreadPane.acceptProposal` (746–754) are near-verbatim copies that call the API, `await load(true)`, fire the badge event and toast; `MyProposals.accept` (108–129) instead patches local rows from `result.acceptance.acceptedAt` and marks sibling versions settled without refetching.

**User impact**
The same decision carries different visual weight depending on where the traveller meets it, and the three paths do not share a source of truth. A change to what the server returns, or a missed badge/reload, can leave one surface correct and another stale — for example, the proposals board and the inbox can disagree about whether a trip is settled. `ConversationPage` also re-implements `hasLiveProposal`, `datesLabel` and duration formatting that the pane already derives.

**Recommendation**
Extract one `useProposalAnswer` hook and one `ProposalAnswer` component used by both cards. Choose one freshness contract (refetch the thread, or apply the server's projection precisely) and use it on all three paths. Move the shared thread derivation (`hasLiveProposal`, date/duration labels) into the pane module that already owns the timeline.

**Effort** M — refactor across three files, no backend change.
**Confidence** High — duplicate bodies are textually similar.
**Basis** Code-based.

---

### [TRV-12] Medium — The itinerary's seven flat tabs hide their overflow on mid-size screens

**Location**
`frontend/src/components/ItineraryDisplay.tsx` 147–154, 913–955.

**Evidence**
`TabsList` is a single row of seven triggers — Day Timeline, Interactive Map, Stays & Dining, Guide & Safety, Expenses, History, People — with `text-xs` labels, 14px icons, `overflow-x-auto` and `scrollbar-none`. At `lg` each trigger is `flex-1`, so seven labels share about 900px; below `lg` they keep intrinsic width and the row scrolls with no scrollbar, fade or edge cue. The strip is `sticky top-16`, directly under a `fixed` 64px navbar.

**User impact**
Below roughly 900px the last tabs ("Expenses", "History", "People") sit off-screen behind an invisible scroll region, so features that only exist there are effectively undiscoverable on tablets. On a phone, only the first two or three tabs are visible with no cue that more exist. The 12px label and 14px icon combination also makes the primary navigation of the trip feel like a toolbar of chips rather than a section switcher.

**Recommendation**
Group or demote: keep Day Timeline, Map, Stays, Guide as primary; move Expenses, History and People into a "More" menu or into the trip header. If the row stays scrollable, add a right-edge gradient and make the active tab auto-scroll into view.

**Effort** M — IA decision plus tab markup.
**Confidence** High for the markup; medium for the exact breakpoint where overflow begins.
**Basis** Code-based.

---

### [TRV-13] Medium — Skeletons describe a layout the app no longer uses

**Location**
`frontend/src/components/dashboard/TripSkeletons.tsx` 5–42, 44–71; `frontend/src/components/dashboard/MyTripsView.tsx` 366–432; `frontend/src/pages/Dashboard.tsx` 381–407.

**Evidence**
`TripCardSkeleton` is `rounded-3xl`, with a fixed `h-44` cover, `p-5`, three title/meta bars and a three-control footer. The real `TripCard` is `rounded-2xl`, uses `aspect-video`, `p-4`, a two-line title, a member stack and a footer with one link and one menu. `TripsGridSkeleton` uses `gap-6`; the real grid uses `gap-5`. `ItinerarySkeleton` opens with a 288px banner (`sm:h-88`, which is not in the default spacing scale and has no extension in `tailwind.config.ts`), four stat tiles and a centred `max-w-xl` tab bar; the actual detail view is a 56–64px thumbnail header, a four-cell hairline stat strip and a full-width left-aligned tab strip. The page-level inline skeleton in `Dashboard.tsx` 390–406 does match the header, which makes the mismatch inside the shared skeleton file more visible.

**User impact**
Opening a trip swaps a tall hero-and-stats placeholder for a short header and a different body, so the page visibly jumps after data arrives. The library grid shifts radius, cover height and gaps. A skeleton is a promise about the shape of what is coming; breaking it makes loading feel slower even when it is not.

**Recommendation**
Derive the skeletons from the real components' outer shells (same radius, aspect ratio, padding and grid gaps), or reuse the card with `aria-hidden` placeholder blocks. Fix or drop `sm:h-88`, and re-shoot the itinerary skeleton against `TripHeader` + the real tab strip.

**Effort** S — class alignment.
**Confidence** High for the class mismatches; `sm:h-88` is likely dropped by Tailwind (no spacing extension present).
**Basis** Code-based.

---

### [TRV-14] Medium — The library route eagerly carries the map and chart stack, and mounts a second map in the rail

**Location**
`frontend/src/components/ItineraryDisplay.tsx` 24–37, 1002–1014; `frontend/src/main.tsx` 3–4; `frontend/src/pages/Dashboard.tsx` 38–51; `frontend/src/components/ItineraryDisplay.tsx` 542–568, 581–608.

**Evidence**
`ItineraryDisplay` statically imports `TripMap` (Leaflet), `ExpenseTracker` (Recharts), `NearbyExplorer`, `TripMembers`, `TripVersions` and the dialog stack. `Dashboard` imports `ItineraryDisplay`, so all of it lands in the `/dashboard` chunk, which is also the landing page after login and after generation. `main.tsx` imports `leaflet/dist/leaflet.css` globally, so map styling ships on every route. Inside the detail view, the rail renders a second `TripMap` instance at `xl` (gated by `useRailMapVisible`) in addition to the Map tab, styled by descendant selectors in `MAP_PREVIEW_CLASS`. On mount, `ItineraryDisplay` fires `getWeather` and `getWeatherRouting` before the user opens any tab. `Dashboard` polls the trip list and trash every 20s and also listens for focus/visibility changes.

**User impact**
The screen a traveller sees most often pays the parse and execution cost of a mapping library and a charting library they may never open, on mobile data as well as desktop. The rail map creates a second tile session and a second Leaflet instance per open trip, and the weather calls add two round-trips to every open even for a trip the user only wants to read.

**Recommendation**
Split the itinerary detail into a lazily loaded chunk (`React.lazy` at the `selectedTrip` boundary), and lazy-load the Map and Expenses tab bodies behind `IntersectionObserver` or first activation. Replace the rail's live map with a static thumbnail until tapped. Load weather after the timeline paints, or only when the weather card enters the viewport. Move Leaflet CSS into the map chunk.

**Effort** M — bundling boundaries plus one static preview.
**Confidence** High for the import graph; medium for the real-world cost, which depends on bundle size and device.
**Basis** Code-based.

---

### [TRV-15] Medium — The planner silently restores a stale draft, including dates the picker would reject

**Location**
`frontend/src/pages/TripPlanner.tsx` 114–149, 186–223; `frontend/src/components/wizard/WizardProgress.tsx` 48–57.

**Evidence**
On mount the planner reads `travelai_trip_wizard_draft_v1` and writes every field into state with no banner, badge or "restored" notice; it also seeds group size, budget and style from the last trip's preferences. There is no date-in-the-future check in `isStepValid(2)` — only `end >= start` — while the When step's calendar disables past days (lines 149, 195–196). A draft saved months ago therefore reopens with last season's dates, passes validation, and can generate a trip in the past. The step rail also disables any step whose predecessors are invalid (`canNavigateToStep`) without a tooltip explaining which field is blocking it.

**User impact**
A returning traveller can submit an itinerary for dates that have already passed, or overwrite a new plan with old preferences they did not consciously choose. Because nothing announces the restore, they may believe they are looking at defaults.

**Recommendation**
Show a small inline notice at the top of step 1: "We restored your draft from <date>" with "Start fresh" and "Keep it". Add a future-date rule to `isStepValid(2)` and clear past dates on restore. Give disabled rail steps an `aria-describedby`/tooltip that names the missing field.

**Effort** S/M — copy, one validation rule, one tooltip.
**Confidence** High.
**Basis** Code-based.

---

### [TRV-16] Low — The metadata layer is set at 9–11px across status, time and counts

**Location**
`frontend/src/components/traveller/EnquiryThreadPane.tsx` 523, 531, 635; `frontend/src/pages/MyProposals.tsx` 486, 514; `frontend/src/pages/Enquiries.tsx` 231, 340, 455–485; `frontend/src/components/dashboard/MyTripsView.tsx` 379, 389; `frontend/src/components/ItineraryDisplay.tsx` 986, 1050.

**Evidence**
Message metadata is `text-[10px]` with a `text-[9px]` label chip; proposal badges and "Total" labels are 10px; enquiry timestamps, counts and snippets are 10–11px; card status chips are 10px; map captions are 11px. The hierarchy is real but compressed into a two-step scale (9–11px vs 12–14px) for most secondary information.

**User impact**
On a 390px phone, 10px type is about 2.6mm tall (cap height nearer 1.8mm); timestamps, "Seen/Sent" and badge labels become effortful for anyone over 40 or in motion. Because these are also the elements that carry state, the compression costs comprehension, not just aesthetics.

**Recommendation**
Set a floor of 12px for metadata and 12–13px for badges, and recover density with line-height, spacing and weight rather than size. Reserve 10–11px for decorative overlines that duplicate nearby text.

**Effort** S — token/scale pass.
**Confidence** High for the values; medium for the exact perceptual cost.
**Basis** Code-based.

---

### [TRV-17] Low — Reduced-motion coverage is partial and the generation dialog has no focus management

**Location**
`frontend/src/index.css` 422–444; `frontend/src/components/wizard/GenerationOverlay.tsx` 112–150, 176.

**Evidence**
The `prefers-reduced-motion` block disables `.skeleton-shimmer` and the `.ww-loader` / `.ww-dots` brand loader, which is good. It does not cover `animate-ping`, `animate-pulse` or `animate-fade-in`, all of which are used in `GenerationOverlay` (the outer ring pings, the compass pulses, the scrim fades) and in the "Live" indicators. The overlay declares `role="dialog"`, `aria-modal="true"` and `aria-labelledby`, and it does announce progress via `aria-live="polite"`, but nothing moves focus into it, traps focus, or restores focus on close, and there is no Escape handler.

**User impact**
Vestibular-sensitive users still get a pulsing, pinging full-screen surface for the longest wait in the product. Keyboard users who trigger generation leave focus on the now-hidden Continue button, so Tab can move through the page behind the scrim; screen-reader users may hear the progress region but not be placed in the dialog.

**Recommendation**
Add the overlay's animation classes to the reduced-motion block, or switch them off inside the component with a `useReducedMotion` hook. Use a focus-trap primitive (Radix `Dialog` is already a dependency) with initial focus on the heading or the primary action, `Escape` mapped to the cancel path, and focus restoration to the Generate button.

**Effort** S/M — mostly composition of existing primitives.
**Confidence** High.
**Basis** Code-based.

---

### [TRV-18] Low — The two split-pane screens compute their height differently and can collapse on short viewports

**Location**
`frontend/src/pages/Enquiries.tsx` 209–215, 283–293; `frontend/src/pages/ConversationPage.tsx` 402–405.

**Evidence**
Enquiries makes `main` itself `lg:h-[100dvh]` with `pt-24` and `pb-6`, then relies on `lg:flex-1` / `lg:min-h-0` to fit the list and thread. ConversationPage gives only the thread card `lg:h-[calc(100dvh-13rem)]` with `lg:max-h-[46rem]`. The first approach includes the header and any error banner inside the viewport budget, so an error banner or a wrapped title steals height from the conversation; the second hard-codes an estimate of the chrome above it, which drifts whenever the header or breadcrumb height changes.

**User impact**
On a 720–800px-tall laptop, the error banner and a wrapped title can reduce the thread to a 250–350px strip with two or three visible message lines, because Enquiries treats the whole chrome as part of a fixed `100dvh` budget. ConversationPage instead lets the thread grow to `46rem`, so the same conversation has a different usable height depending on the route the traveller arrived from.

**Recommendation**
Pick one model: a full-height shell that subtracts the real header/banner via flex (`min-h-0` down the tree), or a `dvh`-based card with a CSS variable for the chrome height. Do not mix `100dvh` on the page with a hand-computed remainder on a child.

**Effort** S — layout refactor in two files.
**Confidence** High for the divergence; medium for how often it visibly clips.
**Basis** Code-based.

---

### [TRV-19] Low — Trip cards and rows are clickable `<article>` elements without keyboard semantics

**Location**
`frontend/src/components/dashboard/MyTripsView.tsx` 366–432, 911–961.

**Evidence**
Both the grid card and the list row put `onClick={onOpen}` on an `<article>` with `cursor-pointer` and a hover lift, but no `role`, `tabIndex`, `onKeyDown` or focus style. Opening is still possible through the nested "Open trip" button, so this is not a trap, but the card itself is invisible to keyboard and switch users, and the clickable surface advertises affordance it does not honour for them. The nested buttons also rely on `stopPropagation` to avoid firing the card action.

**User impact**
Keyboard users tab past a large card that looks like the obvious target and must find the small "Open trip" control. Screen-reader users hear the card as a group of text and an unrelated button, so the relationship between title and action is weaker than it looks.

**Recommendation**
Prefer one real link covering the card (stretched-link pattern) with the menu button layered above it, so the title is the accessible name and the whole card is keyboard reachable. If the card must stay a container, give it `tabIndex={0}`, `role="link"`, an Enter/Space handler and a shared focus ring.

**Effort** S — markup change in two components.
**Confidence** High.
**Basis** Code-based.

## What to keep

- **Destructive actions are handled properly.** `MyTripsView` separates "Move to Recently deleted?" from "Delete this trip forever?", states what each removes (share links, invites, chat, expenses, receipts), and the permanent-delete dialog names the safe action "Keep it" rather than "Cancel". Restore lives beside the shelf, so recovery is discoverable (`MyTripsView.tsx` 1448–1517).
- **Empty states are written, not generic.** Each tab has its own copy and next action ("Drafts are trips still taking shape", "Set a trip to completed when you are back"), and `MyProposals` distinguishes "No proposals yet" from "Nothing waiting in this view" with a different action for each (`MyTripsView.tsx` 843–880; `MyProposals.tsx` 269–303).
- **Error and loading states exist on three of the four list screens** with a persistent banner and a "Try again" button (`Enquiries.tsx` 268–281; `MyProposals.tsx` 245–268). Fixing TRV-02 is a matter of extending an established pattern, not inventing one.
- **The generation hand-off passes the exact document id**, with a comment explaining why the previous title match could open the wrong trip (`TripPlanner.tsx` 369–378; `Dashboard.tsx` 61–122). That is the right level of care for a destructive-ish navigation.
- **Consent copy is explicit.** "Accepting confirms this quote and tells the agency. No payment is taken here." appears at the point of decision, and decline states that the conversation stays open (`EnquiryThreadPane.tsx` 304–310; `MyProposals.tsx` 601).
- **Keyboard and focus fundamentals in the wizard are sound.** `WizardProgress` is a labelled `<nav>` with an ordered list, `aria-current="step"`, disabled unreachable steps and a visible focus ring (`WizardProgress.tsx` 32–57); the shared `Button` has a consistent `focus-visible` ring and active scale (`ui/button.tsx` 8).
- **The inbox keeps its state in the URL** (`?open=`, `?filter=`) with `replace: true`, so a selected thread and filter survive a refresh and are shareable (`Enquiries.tsx` 160–170).
- **Honest copy about limits and expiry.** Guest links say they may have expired and name the expiry date; the disabled attachment control carries an explicit reason in its label and tooltip; the "Live" indicator has a title describing what it means (`ConversationPage.tsx` 246, 486; `EnquiryThreadPane.tsx` 596–598).
- **Reduced motion is already a considered concern** for skeletons and the branded loader (`index.css` 422–444), so TRV-17 is an extension of an existing decision.

## Validation plan

1. **Abort behaviour (TRV-01).** Start a generation, press browser Back, then re-enter `/plan`. Confirm whether the completion still navigates and whether a second trip appears. Then implement abort and assert that exactly one trip is created across cancel/retry.
2. **Failure-state audit (TRV-02).** With DevTools, block or 500 `/api/trips` and `/api/trips/deleted`, reload `/dashboard`, and check whether any persistent recovery exists. Repeat with an expired session.
3. **Contrast pass (TRV-03).** Run axe or a contrast checker on the library, trip detail, Enquiries, Proposals and the generation overlay at 375px and 1440px. Verify the replacement `accent-ink` token at 12px and 11px on both canvas and white.
4. **Data-truth check (TRV-04, TRV-05).** Open a generated trip whose activities have no coordinates and no times. Compare every pin and time label against the stored itinerary JSON. Accept only if unverified items are visibly labelled or excluded.
5. **Keyboard and screen-reader sweep (TRV-06, TRV-17, TRV-19).** Navigate library → detail → activity editing → generation overlay with Tab only; record whether focus moves behind the scrim and whether `Escape` has a defined result. After the fix, assert that focus enters the dialog, stays inside it and returns to Generate on close, and that every icon button announces a unique name in NVDA or VoiceOver.
6. **Responsive pass at 375 / 768 / 1024 / 1440 (TRV-12, TRV-18).** For each width, record whether all seven itinerary tabs are discoverable, whether the "Load more" and composer remain reachable in Enquiries and the conversation, and whether the rail map appears.
7. **Loading-shape regression (TRV-13).** Throttle to Slow 3G and capture the library and trip-detail skeleton against the loaded frame; diff cover height, radius, grid gap and tab position.
8. **Bundle check (TRV-14).** Build with `rollup-plugin-visualizer` (or `vite build --report`) and confirm whether Leaflet and Recharts are in the `/dashboard` chunk. Then measure first interaction on a throttled mobile profile before and after lazy-loading the Map and Expenses tabs.
9. **Count reconciliation (TRV-10).** Seed more than 20 enquiries with known per-filter totals; compare the pill counts before and after "Load more" against the server's counts, and verify they add up with `All`.
10. **Copy and IA review (TRV-07, TRV-08, TRV-09).** With the team, name the one status vocabulary and the one filter control, then walk the four screens and check that every title and filter uses it.
