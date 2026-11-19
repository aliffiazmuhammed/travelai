# Phase 9 baseline — Responsive data, bundle boundaries and budgets

Date: 2026-11-19. Changes: C-19, C-22, C-29.

This file records source-level evidence and the measured bundle budget for the
phase. Browser captures that need seeded production data (390/768 table sweep,
hidden-tab network log, PDF memory profile, LCP/CLS) remain open and are listed
at the end.

## What landed

| Change | Implementation | Primary files |
| --- | --- | --- |
| C-19 | One `DataTable` renders a desktop table and a phone card list from the same column config: labelled focusable scroll region, edge fades plus a visible sideways-scroll cue, sticky action columns that mirror row hover, and an "Open" affordance for clickable rows without an action column. `AdminTableFrame` is now a card/header/footer shell only. Migrated: accounts, agencies, applications, audit, platform admins, agency record (packages + members), agency enquiries, agency operations audit. | `components/ui/data-table.tsx`, `components/admin/AdminTableFrame.tsx`, `pages/admin/*`, `pages/agency/AgencyEnquiries.tsx`, `pages/agency/AgencyOperations.tsx` |
| C-22 | The share route renders `PublicItinerary` (timeline, stays, guide) instead of the workspace itinerary, so chat/crypto, expenses and the roster never enter its static graph. Map and expenses are `React.lazy` in the workspace itinerary, mounted on tab activation or when the desktop rail intersects the viewport. Leaflet CSS moved from `main.tsx` into `TripMap`. The PDF viewer parses once and rasterises three pages per batch on demand with object URLs that are revoked on replace/unmount. | `components/itinerary/PublicItinerary.tsx`, `pages/SharedTrip.tsx`, `components/ItineraryDisplay.tsx`, `components/dashboard/TripMap.tsx`, `main.tsx`, `components/agency/PdfDocumentViewer.tsx` |
| C-29 | Hidden tabs skip recurring list reads (agency library, trip-key healing) and resume on focus/visibility; Explore aborts the superseded `/api/explore` request instead of only ignoring it; admin and discovery free-text filters stay debounced at 300–350 ms; `scripts/ui-baseline/bundle-budget.mjs` measures the Vite manifest in `npm run verify`. | `pages/agency/AgencyTrips.tsx`, `hooks/useTripChatCrypto.ts`, `pages/Explore.tsx`, `services/api.ts`, `scripts/ui-baseline/bundle-budget.mjs`, `vite.config.ts`, `package.json` |

## Bundle budget (raw bytes, Vite manifest)

Measured on the production build of 2026-11-19:

| Surface | Current | Ceiling |
| --- | --- | --- |
| Initial JS (`/`) | 480.2 KiB | 540 KiB |
| `/shared/:id` static graph | 642.7 KiB | 700 KiB |
| `/explore` | 570.7 KiB | 640 KiB |
| `/dashboard` | 889.4 KiB | 960 KiB |
| `/auth` | 513.9 KiB | 560 KiB |
| Images in `dist/assets` | 2102.6 KiB | 2300 KiB |

Static checks in the same script:

- The `/shared/:id` closure contains none of `vendor-map`, `vendor-charts`,
  `PdfDocumentViewer`, `pdfExport`, `html2canvas`, `chatCrypto`,
  `useTripChatCrypto`, `CommentsTab`, `DiscussionDrawer` or `ItineraryDisplay`.
- The initial stylesheet does not contain `.leaflet-pane`; real Leaflet CSS is
  emitted only as `TripMap-*.css`, loaded with the map chunk.
- `/shared/:id` declares `src/components/dashboard/TripMap.tsx` as a dynamic
  import, not a static one.

Run: `npm run ui:budget --workspace=frontend` after `npm run build`. It is the
last step of `npm run verify`.

## Request hygiene

- `getExplore` and `getPublicEvents` accept an `AbortSignal`; a caller-aborted
  read rethrows the abort instead of being reported as a connection failure.
- Explore aborts the in-flight page read whenever a filter changes, so a fast
  typist leaves one request rather than a queue of stale ones. Its search input
  already debounces at 350 ms; admin directories debounce at 300 ms.
- AgencyTrips' 20 s refresh, the trip-key healing poll (6 s locked / 15 s ready)
  and the existing enquiry/comment polls all return early while
  `document.visibilityState === 'hidden'`; focus or visibility resumes them.
- Enquiry and comment polls additionally debounce live frames at 1 s and keep a
  single in-flight read.

Agency overview still makes one bounded, projected read of its trip and event
libraries (server-capped at 200 lean rows) for three cards and a setup checklist.
A dedicated overview endpoint would remove those two reads entirely; it is left
for the Phase 10 operator-efficiency work rather than expanding C-29's scope
here.

## Acceptance mapping

- 390px: every migrated directory and the agency inbox render a card list; row
  identity and the decision/open action are in the card header, with no
  horizontal scroll.
- 768px: the desktop table appears with the scroll cue whenever columns overflow.
- Keyboard: the scroll region is labelled and focusable; clickable rows respond
  to Enter/Space; interactive cells stop row activation.
- `/shared/:id` initial graph excludes Leaflet, Recharts, PDF and chat/crypto.
- The workspace rail mounts one map only at `xl` and only when visible; the map
  tab shares the same chunk.
- A PDF preview parses once, shows the first three pages promptly, and offers
  the next batch on demand; object URLs are revoked.
- No idle background tab issues recurring list reads.
- CI fails on a budget regression or a forbidden chunk in the share route.

## Open browser evidence

Run against a production build with seeded data:

1. Route sweep at 390/768/1440 in light/dark for `/admin/accounts`,
   `/admin/agencies`, an agency record, `/admin/applications`, `/admin/audit`,
   `/admin/platform-admins`, the agency inbox and operations audit. Check long
   names/emails and that the action is visible at 390 without sideways scroll.
2. Network log: leave an agency library tab hidden for two minutes and confirm
   no 20 s list requests; type a 24-character id into an admin filter and count
   one request after the pause.
3. `/shared/:id` network waterfall: confirm `vendor-map`, `vendor-charts`,
   `PdfDocumentViewer` and chat/crypto chunks are absent until the map tab or
   rails are used.
4. Open a 20-page proposal PDF, page through it in the viewer, and watch the
   browser task manager: memory should grow in three-page steps and return after
   closing the dialog.
5. Lighthouse or WebPageTest throttled mobile profile on `/explore`,
   `/shared/:id`, `/dashboard` and `/auth`; store LCP and CLS next to the byte
   budgets above.
