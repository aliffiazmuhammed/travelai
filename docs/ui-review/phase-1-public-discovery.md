# Phase 1 — Public discovery and marketing

## Scope and evidence

**Routes in scope** (per `docs/ui-review/README.md`): `/`, `/explore`,
`/explore/:tripId`, `/explore/events/:eventId`, `/agencies`, `/agencies/:slug`,
`/agencies/apply`, `/travelers/:handle`, `/guidelines`, `/terms`, `/privacy`,
`/shared/:shareId`, `/proposal/:token`, and `*` (NotFound). 14 route-level
pages plus the shared public `Navbar`, `Hero`, and legal shell.

**Evidence base.** This pass combined rendered inspection with source review.
The public pages were loaded against the local backend at 1440px and 390px in
both light and dark themes: Landing, Explore, GalleryTrip, Agencies,
AgencyProfile, AgencyApply, TravelerProfile, Guidelines, Terms, NotFound, the
Auth screen, and the invalid-token states of SharedTrip and ProposalShare.
Findings about link graphs, payloads, CSP, bundle boundaries, and the
valid-token share flow remain **code-based**, because they cannot be confirmed
from an anonymous local session. Contrast ratios are calculated from the
declared HSL tokens using the WCAG relative-luminance formula, not sampled from
pixels. Where a rendered check confirmed a source-level finding, the finding is
still marked code-based and the observation is stated in its evidence.

**Files inspected.** `src/index.css`, `tailwind.config.ts`, `src/App.tsx`,
`src/main.tsx`, `index.html`, `vite.config.ts`, `public/theme-init.js`,
`src/lib/meta.ts`, `backend/src/config/csp.ts`, and the pages
`Landing`, `Explore`, `GalleryTrip`, `EventDetail`, `Agencies`,
`AgencyProfile`, `AgencyApply`, `TravelerProfile`, `Guidelines`,
`LegalDocument`, `Terms`, `Privacy`, `SharedTrip`, `ProposalShare`, `NotFound`.
Shared components: `Navbar`, `Hero`, `LandingChat`, `PublicEventCard`,
`TripCover`, `JoinRequestDialog`, `ReportDialog`, `TravellerBreadcrumbs`,
`AgencyEnquiryDialog`, `AgencyLogoTile`, `TravellerCommandMenu`,
`WaytowalkLoader`, `PdfDocumentViewer`, `ui/button`, `ErrorBoundary`. Also
`ItineraryDisplay`, `ExpenseTracker`, `lib/tripCover.ts`,
`backend/src/services/collab/publicTrip.ts`.

**Comparison baseline.** The product's own design language: deep forest
green `--primary: 165 46.5% 16.9%` (≈ `#173F35`), coral
`--accent: 13.2 76% 62.4%` (≈ `#E87656`), cream page surfaces (`#F7F3EA`),
display-weight headings that use the same Cabin family as body copy, 12px
radius, hairline borders. Findings are judged against that language and against the copy the
public pages already promise, not against an external style guide.

**What this report does not claim.** No traffic, conversion, or user-research
data exists in the repository, so none is invented. Severity is an estimate of
likely user impact from the code path, not a measured outcome.

## Scorecard

| Area | Score | Evidence |
| --- | --- | --- |
| Visual hierarchy and typography | 2 | The single-family display/body treatment and cream/forest/coral palette are genuinely distinctive, but public copy is set at `text-[9px]`–`text-[11px]` in footers (`Landing.tsx`), card facts (`Explore.tsx`, `GalleryTrip.tsx`), and form notes (`EventDetail.tsx`, `AgencyApply.tsx`). Heading levels skip (`h3` used for standalone loading/empty states without an `h2`), so hierarchy is carried by size alone rather than structure. |
| Layout and spacing consistency | 3 | Page shells, container widths, breadcrumb placement, and card radii are consistent across Explore/Agencies/Gallery. The inconsistency is inside the palette: several surfaces hard-code `#F7F3EA`, `#173F35`, `#102D26` while the rest of the app is token-driven, so spacing is coherent but colour is not. |
| Brand distinctiveness | 3 | Forest green + coral + cream + display-weight Cabin is a recognisable, non-generic identity, and the logo lockup is used consistently. It is diluted by stock Unsplash trip covers (`lib/tripCover.ts`), a hard-coded `bg-indigo-600` notification badge in `Navbar.tsx`, and an emerald agency-apply tile that belong to a different palette. |
| Content clarity and IA | 2 | Terms and Privacy are unreachable from any public page (only linked from `Auth.tsx`). A shared-trip CTA is mislabelled "Take a copy" but opens the planner, and the same page promises budgets stay private while rendering a budget tab. Legal pages have no in-page navigation and only a "Back to sign in" exit. |
| Interaction quality and feedback | 2 | Loading, empty, and error states use four different patterns across six pages. A two-step irreversible-looking proposal acceptance offers no cancel. Cards lift on hover across their whole surface but only the image and title are links. The ⌘K command menu contains navigation jumps only — no trip or agency search. |
| Responsive behavior | 3 | The mobile `Navbar` sheet, breadcrumb overlay, and `-mt-16` header overlap are sound. But discovery counts are hidden below `md` (`Hero.tsx`), the discovery rail's dot controls are 32px, and the smallest labels stay at 9–11px on phones where they are hardest to read. |
| Accessibility | 2 | No skip link on any public page (only the agency and admin layouts have one). Coral on cream accent text computes to ≈2.65:1, below AA for the sizes used. Decorative motion (infinite compass spin) ignores `prefers-reduced-motion`, and async results are never announced. |
| Performance risk | 2 | `/shared/:shareId` is a public marketing-adjacent page that statically pulls in the Leaflet trip map, Recharts expense tracker, and the crypto/chat workspace tree. Hero imagery is loaded `lazy` above the fold, from a third-party host, with no `srcset`, `width`/`height`, or `fetchpriority`. |

## Prioritised findings

### [P1-01] Critical — Terms and Privacy are unreachable from the public site

**Location:** `src/App.tsx` (routes `/terms`, `/privacy`), `src/components/legal/LegalDocument.tsx`, `src/pages/Landing.tsx` (footer), `src/components/Navbar.tsx`, `src/pages/Auth.tsx` ~398–412.

**Evidence:** A repository-wide search for `/terms` and `/privacy` returns only
`Terms.tsx`, `Privacy.tsx`, `App.tsx`, the legal content, and the auth config
that renders the consent links inside `Auth.tsx`. The public `Navbar` has no
legal links, the mobile sheet has none, and the `Landing.tsx` footer lists
product and company links but omits both documents. The legal pages themselves
open with a single "Back to sign in" link and only cross-link each other in a
card below the entire document, so a signed-out visitor who lands there is
pushed toward an account wall rather than back to the site.

**User impact:** A visitor evaluating a marketplace that collects trip
preferences, enquiries, and payment-adjacent proposals cannot find the terms
they are agreeing to before creating an account, which is both a trust problem
and a compliance problem. Discoverability of the privacy policy is also a
prerequisite for most consent copy.

**Recommendation:** Add `Terms` and `Privacy` to the public footer (and to the
mobile sheet's secondary group), replace the legal shell's "Back to sign in"
with "Back to waytowalk" while keeping the existing companion link, and add a
consent line under the sign-up submit that links both. Keep the routes
unauthenticated.

**Effort:** S (one footer component, one shell link, one consent line).
**Confidence:** High — the link graph was enumerated exhaustively.
**Basis:** code-based.

### [P1-02] High — Shared links have no preview image, so every share renders as a blank card

**Location:** `frontend/index.html`, `src/lib/meta.ts`, `src/pages/SharedTrip.tsx`, `src/pages/GalleryTrip.tsx`, `src/pages/ProposalShare.tsx`.

**Evidence:** `index.html` declares `og:title`, `og:description`, and
`twitter:card` but no `og:image` or `twitter:image`. `lib/meta.ts` sets
per-route title/description only. There is a `public/brand/` directory with
usable logo SVGs, but no Open Graph raster asset is referenced anywhere in the
frontend.

**User impact:** The primary distribution loop for this product is a traveller
pasting a shared itinerary or proposal into WhatsApp, Slack, or iMessage. All
three clients fall back to a text-only or grey placeholder card, which
suppresses click-through precisely at the moment of highest intent.

**Recommendation:** Ship a static 1200×630 brand card for the default case and
set `og:image`/`twitter:image` in `index.html`. Where a share has a cover
image, prefer it via per-route meta; otherwise keep the static card. Add
`og:image:width/height` and `twitter:card=summary_large_image`.

**Effort:** S.
**Confidence:** High — absence is directly observable in the document head.
**Basis:** code-based.

### [P1-03] High — "Take a copy" opens the planner instead of copying the trip

**Location:** `src/pages/SharedTrip.tsx` (primary CTA), `src/App.tsx` (`PLAN_PATH`).

**Evidence:** The shared-trip page's primary action is labelled as taking a
copy of the itinerary, but its handler calls `navigate(PLAN_PATH)` — it routes
to the empty planner rather than duplicating the shared trip's days, stops, or
notes. No copy mutation, no prefill payload, and no confirmation state exist on
that path.

**User impact:** This is the highest-intent action on the page. A visitor who
clicks it expects the itinerary they just read to appear in their workspace;
instead they get a blank planner and must rebuild it by hand. That reads as a
broken product at the exact conversion step.

**Recommendation:** Either implement the copy (create a draft plan seeded from
the shared payload, then land in the planner with a success toast) or relabel
the button to what it actually does ("Start planning your own trip") and make
the shared itinerary visibly read-only. Do not ship a label that promises a
mutation the handler does not perform.

**Effort:** M if implemented, S if relabelled.
**Confidence:** High — the handler and label are both explicit.
**Basis:** code-based.

### [P1-04] High — The share page promises private budgets while rendering a budget tab

**Location:** `src/pages/SharedTrip.tsx` (privacy copy), `src/components/ItineraryDisplay.tsx` (Expenses tab), `backend/src/services/collab/publicTrip.ts`.

**Evidence:** The public share page's copy tells the recipient that budgets
stay private. The same page mounts `ItineraryDisplay`, which renders an
"Expenses" tab fed by `plannedBudget={safeData.budget_breakdown}`, and the
backend's public payload includes the full `tripDetails` object including the
budget fields. The privacy statement and the rendered UI therefore contradict
each other on the same screen.

**User impact:** Either the traveller's cost data is exposed to anyone holding
the link despite an explicit promise, or the recipient sees a tab that looks
broken. The first is a data-handling defect with real consequences for a
traveller sharing a trip with a group; the second undermines trust in every
other privacy claim on the site.

**Recommendation:** Decide the contract and enforce it in one place. If budgets
are private, strip budget fields from the public payload at the serializer,
hide the Expenses tab when `plannedBudget` is absent, and keep the copy. If
budgets are intentionally shared, rewrite the copy to say what is included and
give the owner a share-time toggle. Add a test asserting the public response
contains no budget keys.

**Effort:** M.
**Confidence:** High for the contradiction; Medium for which side is intended.
**Basis:** code-based.

### [P1-05] High — Coral accent text fails AA contrast at the sizes it is used

**Location:** `src/index.css` (`--accent`), `src/pages/EventDetail.tsx` (spots pill), `src/pages/ProposalShare.tsx` ("Accepted" badge), `src/pages/Guidelines.tsx` (warning icon).

**Evidence:** `--accent` is `13.2 76% 62.4%`, roughly `#E87656`. Against the
cream background (`#F7F3EA`-equivalent) that is ≈2.65:1. The token is applied
as `text-accent` for small status text (spots remaining, "Accepted", the
warning glyph) rather than as a fill with white or forest text on top.

**User impact:** The most time-sensitive information on an event page — how
many spots are left — is the least legible text on the page for low-vision
users and on phone screens in daylight. Status colour also disappears for
colour-blind users because the state is carried by hue alone.

**Recommendation:** Keep coral for fills and illustrations; for text use a
darker accent step (roughly 35–40% lightness) that clears 4.5:1 on cream, or
render status as a coral-tinted chip with forest text. Pair colour with a word
or icon so status is never colour-only.

**Effort:** S (one token plus three call sites).
**Confidence:** High — the ratio is arithmetic from the declared HSL values.
**Basis:** code-based.

### [P1-06] Medium — Public body copy is set at 9–11px, below a comfortable reading floor

**Location:** `src/pages/Landing.tsx` (footer), `src/pages/Explore.tsx` (card meta), `src/pages/GalleryTrip.tsx` (fact rows), `src/pages/EventDetail.tsx` (form notes), `src/pages/AgencyApply.tsx` (field labels, 11px).

**Evidence:** Dozens of `text-[9px]`, `text-[10px]`, and `text-[11px]`
utilities are used for footer links, card metadata, itinerary facts, and form
helper text. `--muted-foreground` itself passes contrast (≈5.5:1 on the cream
background), so the failure is scale, not colour. There is no `text-xs` floor
enforced anywhere in the public pages.

**User impact:** The information a visitor needs to judge a trip or complete an
application — duration, group size, price basis, what a field expects — is the
smallest text on the page. On a 390px viewport this is genuinely hard to read,
and it is the single most common reason a polished-looking page feels
amateurish.

**Recommendation:** Set a 12px minimum for public UI text and 14px for anything
that is read rather than glanced at; reserve 11px for uppercase eyebrows only.
Replace ad-hoc pixel sizes with `text-xs`/`text-sm` from the Tailwind scale so
the fix is one sweep rather than a per-page audit.

**Effort:** M (many call sites, mechanical).
**Confidence:** High.
**Basis:** code-based.

### [P1-07] Medium — Theme state and brand surfaces bypass the theme system

**Location:** `public/theme-init.js`, `src/components/Navbar.tsx` (theme state), `src/components/Hero.tsx`, `src/pages/Landing.tsx` (hard-coded `#F7F3EA`, `#173F35`, `#102D26`).

**Evidence:** `theme-init.js` correctly sets `.dark` before first paint, so the
page itself does not flash. The mismatch is one level up: `Navbar` initialises
`useState(false)` for dark mode and only reads the stored preference in an
effect (`Navbar.tsx:47,59-71`). On the first render the toggle therefore
announces "Switch to dark theme" and shows the wrong icon even though the page
is already dark; it corrects after hydration. Separately, `Hero` and `Landing`
hard-code the cream/forest hex values instead of using the token variables, so
those sections keep their light-mode palette when the rest of the page is dark.

**User impact:** A dark-mode visitor sees a control that contradicts the current
theme for the first frame and can activate the wrong direction if they click
immediately. Hard-coded brand hexes produce a mixed light/dark composite on the
same page — token-driven chrome switches, brand sections do not — which reads as
an incomplete theme rather than a deliberate "always dark" band.

**Recommendation:** Initialise the client theme state from the value
`theme-init.js` already applied (read `document.documentElement.classList` or a
data attribute during the initial `useState`, not in an effect), and give the
brand surfaces semantic tokens (`--surface-brand`, `--surface-brand-ink`) with
light/dark values so sections can opt into "brand always dark" deliberately
rather than by omission.

**Effort:** S–M.
**Confidence:** High for the state ordering and hard-coded hexes; Medium for how
often a visitor interacts before hydration.
**Basis:** code-based; the dark preference was rendered locally.

### [P1-08] Medium — No skip link or landmark bypass on any public page

**Location:** `src/components/Navbar.tsx` (shared public header), `src/App.tsx` (public route shells); contrast with `AgencyLayout.tsx:271` and `AdminLayout.tsx:211`.

**Evidence:** Both authenticated shells implement a skip link. No public page
does. The public `Navbar` renders a full desktop link set plus theme toggle and
account actions, and the mobile sheet duplicates it, with no way to jump past
it to `main`.

**User impact:** Keyboard and screen-reader users re-traverse the same header
on every public route — Explore, each trip, each event, each agency — which is
the exact cost the authenticated shells already decided was worth avoiding.

**Recommendation:** Add one shared skip link as the first focusable element in
the public shell ("Skip to content"), targeting the `main` landmark, styled with
the existing focus ring. Reuse the agency layout's implementation rather than
writing a second one.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

### [P1-09] Medium — Async page states skip heading levels and are never announced

**Location:** `src/pages/GalleryTrip.tsx`, `src/pages/EventDetail.tsx`, `src/pages/TravelerProfile.tsx` (loading and empty states).

**Evidence:** These pages render spinner-plus-`h3` blocks ("Loading trip…",
"Trip not found") without an `h2` at that level in the document, so the outline
jumps from `h1` to `h3`. The containers have no `role="status"`,
`aria-live`, or `aria-busy`, so a screen-reader user gets no indication that
content is arriving or that it failed. Explore, by contrast, does use a
`role="status"` skeleton region.

**User impact:** A screen-reader user who activates a trip link hears nothing
change and may assume the link did nothing; on failure, the error message is
present in the DOM but not announced. The heading skip also breaks navigation
by heading, which is the primary way many users scan these pages.

**Recommendation:** Use `h2` for page-level states, wrap loading and error
regions in `role="status"` (or `role="alert"` for terminal errors), and mirror
the Explore skeleton pattern so the three pages share one loading component.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

### [P1-10] Medium — Cards lift on hover across the whole surface but only two small regions are clickable

**Location:** `src/pages/Explore.tsx`, `src/pages/Agencies.tsx` (trip/agency cards), `src/components/PublicEventCard.tsx`.

**Evidence:** The `<article>` carries the hover elevation and a `group-hover`
title colour change, but the anchor wraps only the cover image and the title.
The card body — dates, price basis, location, agency name — is inert. There is
no single wrapping link or stretched-link overlay.

**User impact:** The visual affordance says "the card is the target"; the hit
test says "two small regions are". Clicks on the body do nothing, which users
read as a dead card rather than a miss, and the mismatch is worse on touch where
there is no cursor to reveal the boundary.

**Recommendation:** Make the whole card one link using a stretched pseudo-element
overlay on the title anchor (so text selection and any nested secondary action
still work), or remove the card-wide hover and confine it to the linked regions.
Keep exactly one accessible name per card.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

### [P1-11] Medium — Four different loading treatments across six adjacent public pages

**Location:** `src/pages/Explore.tsx` (shimmer skeletons, `role="status"`), `src/pages/Agencies.tsx` (full-page spinner), `src/pages/GalleryTrip.tsx` / `EventDetail.tsx` / `TravelerProfile.tsx` (`WaytowalkLoader` + `h3`), `src/pages/SharedTrip.tsx` (own gate).

**Evidence:** Explore reserves layout with shimmering card skeletons sized to
the final grid. Agencies replaces the entire page with a centred spinner, so
the header, breadcrumb, and filter chrome disappear and then reappear. The
detail pages show a centred brand loader. SharedTrip gates on its own
condition. Nothing shares a component or a layout contract. In the local build
the Landing and Explore branded loader could sit for 20–40 seconds while
discovery data resolved, so this is not a brief interstitial: it is the first
impression for that whole interval.

**User impact:** Navigating between these pages feels like moving between
products: one preserves context, one blanks the screen, one shows a logo. The
blank-screen variants also cause layout shift and lose the user's scroll
position and orientation.

**Recommendation:** Standardise on one pattern — skeleton blocks that preserve
the page silhouette for list and detail content, with the branded loader
reserved for full-route transitions. Extract a `PageSkeleton` primitive and
delete the per-page gates.

**Effort:** M.
**Confidence:** High.
**Basis:** code-based.

### [P1-12] Medium — Mobile hides discovery counts and keeps sub-44px targets

**Location:** `src/components/Hero.tsx` (discovery meta hidden below `md`), `src/pages/Landing.tsx` (DiscoveryRail dot controls), `src/pages/AgencyApply.tsx` (11px labels).

**Evidence:** The hero's three discovery tiles stay visible on mobile, but the
line that carries the actual count — "12 trips shared", "4 events open" — is
`hidden … md:block` (`Hero.tsx:150`). On a phone the tiles therefore read only
"Trips / Events / Agencies", so the mobile first impression carries the
categories without the social proof. The discovery rail uses 32px-high dot
controls (`Landing.tsx:185-199`), and agency-apply field labels are 11px.

**User impact:** Mobile visitors get a weaker value proposition than desktop
visitors on the same URL: they can see that discovery exists but not that anyone
uses it. The small rail controls are the ones most likely to be missed by a
thumb. The apply flow is the highest-commitment public form and it is set at the
least legible size.

**Recommendation:** Keep a compact one-line count visible in each mobile tile
(the number plus a short noun, no long meta sentence), raise rail controls to
44px touch targets with the visual dot remaining small inside the hit area, and
lift apply-form labels to at least 12px with visible association to their
inputs.

**Effort:** S–M.
**Confidence:** High.
**Basis:** code-based.

### [P1-13] Medium — Two-step proposal acceptance has no exit

**Location:** `src/pages/ProposalShare.tsx` (accept flow).

**Evidence:** Accepting a proposal advances to a second confirmation step, and
that step offers only the confirming action — no cancel, no back, no dismiss.
The only way out is a browser back or a full reload.

**User impact:** A user who opens the confirmation to re-read the terms, or who
changes their mind, is trapped in a modal-like state with no visible escape.
That is the classic pattern that produces accidental acceptances, which is a
commercial and support problem, not a cosmetic one.

**Recommendation:** Add an explicit "Not yet" / "Go back" control on the second
step that returns to the review state without side effects, and keep the review
step reachable by keyboard. Make the confirm button's label state the
consequence ("Accept and confirm booking") rather than a generic confirm.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

### [P1-14] Medium — Proposal HTML renders in an iframe that production CSP may block

**Location:** `src/pages/ProposalShare.tsx` (`<iframe srcDoc={proposal.html} sandbox="">`), `backend/src/config/csp.ts` (`frameSrc: ["'none'"]`).

**Evidence:** The proposal page renders agency-authored HTML through an
`srcDoc` iframe with an empty `sandbox` allow-list. The backend's CSP sets
`frame-src 'none'`. `srcDoc` content is governed by the parent's `frame-src`,
so in a unified deploy the frame is expected to be blocked and the proposal
body to render as an empty box. This was not verified in a browser.

**User impact:** If the policy applies as written, the core content of the
proposal — the itinerary and quote the recipient is being asked to accept —
does not render, while the accept controls still do. That is a broken
conversion path presented as a working one.

**Recommendation:** Verify in a production-equivalent environment first. If
confirmed, relax `frame-src` to `'self'` for this surface (or serve proposals
from a same-origin endpoint and drop `srcDoc`), keep `sandbox` restrictive, and
add a non-iframe fallback that renders a plain-text or server-sanitised version
so the quote is always readable.

**Effort:** S to verify, M to fix properly.
**Confidence:** Medium — the policy and the frame are both explicit, but the
effective behaviour depends on deployment topology.
**Basis:** code-based.

### [P1-15] High — The public share page loads the full workspace bundle

**Location:** `src/pages/SharedTrip.tsx` → `src/components/ItineraryDisplay.tsx` (static imports of `TripMap`/Leaflet, `ExpenseTracker`/Recharts, chat and crypto modules).

**Evidence:** `ItineraryDisplay` statically imports the map, the chart-based
expense tracker, and the collaboration/chat modules at module scope. Public
`SharedTrip` mounts `ItineraryDisplay` directly, so an anonymous visitor
downloads Leaflet, Recharts, and the crypto/chat dependency graph before the
itinerary is readable, even though none of the collaboration surfaces are
interactive for a signed-out recipient.

**User impact:** The single most-shared public URL — the one opened on a phone,
often on mobile data, often from a chat app's in-app browser — carries the
heaviest client payload in the product. Slow first render here directly costs
the share loop that P1-02 is also trying to protect.

**Recommendation:** Split `ItineraryDisplay` into read-only and workspace
variants, lazy-load the map and expense chart behind user intent
(`React.lazy` + intersection), and keep crypto/chat out of the public graph
entirely by gating those imports behind an authenticated branch. Confirm with a
bundle analysis of the share route.

**Effort:** M–L.
**Confidence:** High for the import graph; the measured cost was not captured.
**Basis:** code-based.

### [P1-16] Medium — Above-the-fold hero images are lazy, remote, and unsized

**Location:** `src/components/TripCover.tsx`, `src/lib/tripCover.ts`, `src/pages/GalleryTrip.tsx`, `src/pages/SharedTrip.tsx`.

**Evidence:** `TripCover` hard-codes `loading="lazy"` for every instance,
including the Gallery and Shared hero images that are above the fold. There is
no `fetchpriority="high"` and no `srcset`/`sizes`. Cover URLs are Unsplash remote
URLs with a single fixed `w` query parameter, so one asset is downloaded for
every viewport. The `aspect-[16/10]` wrapper does reserve space, so layout shift
is not the main risk here.

**User impact:** The largest visual element on the page starts loading late and
arrives at a single oversized resolution on mobile. On the pages that carry
shared traffic, that delays the first meaningful paint and spends the
recipient's data on pixels they cannot resolve. It also makes every public page
depend on a third-party image host.

**Recommendation:** Make `loading` a prop and default the first cover to
`eager` with `fetchpriority="high"`; emit `srcset` with 640/1024/1600 widths
from Unsplash's resize params and keep the existing aspect-ratio box. Consider
proxying covers through the app so the public pages depend on one origin.

**Effort:** S–M.
**Confidence:** High.
**Basis:** code-based.

### [P1-17] Low — NotFound animates forever, nests interactive elements, and can overflow

**Location:** `src/pages/NotFound.tsx`.

**Evidence:** The compass illustration spins infinitely and is not guarded by
`prefers-reduced-motion` (global reduced-motion handling covers only
`skeleton-shimmer` and `ww-loader`). The primary action is a `Link` wrapping a
`Button`, so an anchor contains a button. The attempted path is printed in a
`<code>` element with no wrap or truncation, so a long path forces horizontal
overflow. The page sets no meta.

**User impact:** Motion-sensitive users get an unavoidable perpetual animation
on an error screen; the nested control is invalid and produces inconsistent
focus and activation behaviour; a long mistyped URL breaks the layout at 360px.

**Recommendation:** Gate the rotation on `prefers-reduced-motion` (or make it a
one-shot reveal), render the action as a single styled `Link` rather than
nesting a button, and truncate the path with `break-all` plus a length cap.
Give the page a title and noindex meta.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

### [P1-18] Low — Legal pages have no navigation and the wrong exit

**Location:** `src/components/legal/LegalDocument.tsx`, `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`.

**Evidence:** The legal shell renders the document body only: no visible table
of contents and no section navigation. Section ids exist for deep links
(`LegalDocument.tsx:74-78`), but nothing on the page exposes them. There is a
"Last updated / Version" line, and a companion-policy link sits in a card after
the final section, below the whole document. The only exit at the top is "Back
to sign in".

**User impact:** A reader who wants "cancellation" or "data retention" has to
scroll the entire document to discover the clause, and the cross-link to the
other policy is only found by reaching the end. A signed-out visitor is told to
go to a sign-in screen they did not come from. Both make the documents feel like
an afterthought, which undercuts the trust work P1-01 is trying to fix.

**Recommendation:** Generate an on-page TOC from the document's own headings
with a sticky rail on desktop and a collapsible list on mobile, keep the
existing section ids, add a "Back to waytowalk" exit beside the current
companion link, and surface the "Last updated" line more prominently.

**Effort:** S–M.
**Confidence:** High.
**Basis:** code-based.

### [P1-19] Low — Hero advertises Agencies while the nav gates it

**Location:** `src/components/Hero.tsx` (Agencies tile), `src/components/Navbar.tsx` (gated Explore/Agencies links).

**Evidence:** The hero always renders the Agencies discovery tile, but the
navbar renders Explore and Agencies links conditionally on the same feature
flags. When discovery is off, the hero sends visitors into a gated area while
the header implies it does not exist.

**User impact:** The two primary navigation surfaces disagree about what the
product currently offers. A visitor who follows the hero tile hits a gate or an
empty state they were not warned about, which reads as a broken launch rather
than a deliberate limit.

**Recommendation:** Drive the hero tiles from the same capability flags as the
navbar so both surfaces agree; if a flag is off, replace the tile and its count
with a non-discovery value proposition rather than removing the slot.

**Effort:** S.
**Confidence:** High for the divergence; Medium for how often flags are off in
production.
**Basis:** code-based.

### [P1-20] Low — Hard-coded indigo, emerald, and amber leak into a forest/coral palette

**Location:** `src/components/Navbar.tsx` (`bg-indigo-600` badge), `src/pages/AgencyApply.tsx` (emerald tile), `src/pages/Landing.tsx` / `EventDetail.tsx` (amber notices).

**Evidence:** The product defines `--primary`, `--accent`, and semantic
foreground/background pairs, but several public surfaces use raw Tailwind
palette colours that exist nowhere in `index.css` or `tailwind.config.ts`. Their
dark-mode behaviour is whatever Tailwind's default is, not the product's.

**User impact:** Small but constant: an indigo notification dot and an emerald
apply tile read as components borrowed from another app, and they are the only
elements on their screens that are not part of the brand system. They also
won't adjust with the theme like the surrounding tokens do.

**Recommendation:** Add semantic tokens for success/warning/info (and a
notification/accent-strong token for the badge) with light and dark values, and
replace the raw palette classes. This is Phase 6 groundwork, noted here because
the public pages are where it is most visible.

**Effort:** S.
**Confidence:** High.
**Basis:** code-based.

## What to keep

- **The skeleton-preserving Explore grid.** `Explore.tsx` is the only public
  page that reserves final layout while loading, sizes its skeletons to the real
  cards, and exposes the state through `role="status"`. It is the pattern the
  other five pages in P1-11 should adopt, not a page that needs redesigning.
- **The Gallery header/breadcrumb composition.** `GalleryTrip.tsx` pairs a
  full-bleed cover with a breadcrumb overlay and `-mt-16` content card. It
  gives the page a strong identity, keeps orientation visible on a long scroll,
  and is the most confident layout in the phase.
- **The Guidelines reading shell.** `Guidelines.tsx` uses a sticky table of
  contents beside sectioned cards with clear scan targets. It is exactly the
  structure the legal pages are missing (P1-18), and it proves the team can
  build long-form reading well.
- **The proposal review table and two-step copy.** `ProposalShare.tsx` presents
  the quote as a scannable line-item table and states the consequence of
  acceptance in plain language before the confirming step. The flow needs the
  exit from P1-13, but the information design is right.
- **The brand system itself.** Forest green, coral, and cream, with display-weight
  headings against a calmer body voice, is a specific, memorable identity that
  does not look like a template. Most of this phase's visual problems are
  execution (scale, contrast, stray palettes), not direction — which makes them
  cheap to fix and worth fixing.

## Validation plan

1. **Fix verification by finding.** After P1-01, enumerate every reachable
   public route from `/` by following links only, and confirm Terms and Privacy
   are reachable in two hops from the footer on both desktop and the mobile
   sheet. For P1-03 and P1-04, walk the share flow and assert what the button
   does and which budget keys appear in the public response payload.
2. **Automated accessibility pass.** Run axe-core on all 14 routes at 390px and
   1440px: expect colour-contrast violations on `text-accent` (P1-05), heading
   order violations on the three detail pages (P1-09), and no skip-link
   violation once P1-08 lands (axe flags the absence as a best-practice item, so
   add a manual assertion too).
3. **Keyboard-only pass.** Tab through `/`, `/explore`, `/explore/:tripId`,
   `/agencies/apply`, `/proposal/:token`, and `*`. Success criteria: first Tab
   reveals a visible skip link, every card is reachable as one stop, focus is
   never lost on load-state swaps, and the proposal confirmation offers a
   forward and a backward exit.
4. **Mobile viewport sweep.** 360×640, 390×844, and 768×1024. Check that hero
   counts are present (P1-12), no horizontal scroll appears on `*` with a long
   path, rail controls measure ≥44px, and no text renders below 12px.
5. **Share-surface reality check.** Load `/shared/:shareId` on a throttled
   "Slow 4G" profile with cache disabled, and record LCP, CLS, and transferred
   JS before and after P1-15/P1-16. Paste the same URL into a link-preview
   debugger for the two or three clients the product actually distributes
   through, and confirm an image card renders after P1-02.
6. **CSP verification for P1-14.** Deploy the production CSP to a staging
   environment, open `/proposal/:token`, and check the console for a
   `frame-src` violation and whether the proposal body is visible. Do not treat
   this as confirmed until that check runs.
7. **Regression guards.** Add a test asserting the public trip payload contains
   no budget keys, and a link-integrity test asserting `/terms` and `/privacy`
   are present in the public footer. Both failures are silent in normal QA.
