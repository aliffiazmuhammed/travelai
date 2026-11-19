# Phase 8 baseline — Realm UX completion

Date: 2026-11-19. Changes: C-28, C-24, C-06, C-25, C-21.

This file records source-level evidence for the phase. Browser captures that
need a running app (route sweep, network waterfall, dirty-editor script) remain
open and are listed at the end.

## What landed

| Change | Implementation | Primary files |
| --- | --- | --- |
| C-28 | Account split into Profile / Sign-in & password / Advanced: chat backup; reveal control on password fields; confirm-before-replace recovery code; auth `h1`, reset/invite/deletion paths reconciled. | `pages/Profile.tsx`, `components/profile/ChatRecoverySettings.tsx`, `components/auth/PasswordInput.tsx`, `pages/Auth.tsx`, `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`, `pages/InviteAccept.tsx` |
| C-24 | Stretched title anchors on discovery cards; hero tiles gated by capability flags with visible mobile counts; proposal confirmation "Not yet" exit; CSP `frame-src 'self'` plus blob-based non-iframe fallback; NotFound single real link, truncated path, reduced motion, meta. | `pages/Explore.tsx`, `pages/Agencies.tsx`, `pages/ProposalShare.tsx`, `backend/src/config/csp.ts`, `pages/NotFound.tsx` |
| C-06 | Contextual saves (only the visible section) in agency settings; route, popstate and `beforeunload` guard with Save / Discard / Stay; package, quote and directory editors track dirty baselines; quote editor supports save-and-leave. | `hooks/useUnsavedChangesGuard.ts`, `components/ui/unsaved-changes-dialog.tsx`, `pages/agency/AgencySettings.tsx`, `components/agency/AgencyPackagePanel.tsx`, `components/agency/AgencyQuotePanel.tsx`, `components/agency/DirectoryProfileEditor.tsx` |
| C-25 | Library `All` scope with global search and a separate Trash shelf; server per-filter enquiry counts with local fallback; shared `proposalAnswerState` / `ProposalAnswer` / `useProposalAnswer`; itinerary primary tabs plus a More menu and scroll cue; restored-draft notice; future-date validation; disabled-step explanations; aligned conversation split heights; one keyboard-reachable target per trip card; activity buttons labelled, enlarged and separated; realistic trip skeletons. | `components/dashboard/MyTripsView.tsx`, `pages/Enquiries.tsx`, `backend/src/services/directory/enquiries.ts`, `lib/proposalAnswer.ts`, `hooks/useProposalAnswer.ts`, `components/proposals/ProposalAnswer.tsx`, `components/ItineraryDisplay.tsx`, `pages/TripPlanner.tsx`, `components/dashboard/DayTimeline.tsx`, `components/dashboard/TripSkeletons.tsx` |
| C-21 | `AppImage` with `srcset`/`sizes`, `priority`, intrinsic dimensions, local fallback and blur slot; same-origin `/api/images/cover` proxy with an allow-listed Unsplash id/width contract and in-memory cache; auth photograph bundled locally and requested only at `lg`; CSP no longer allows the photo host. | `components/ui/app-image.tsx`, `lib/tripCover.ts`, `backend/src/services/images/cover.ts`, `backend/src/routes/images.routes.ts`, `components/auth/authPhoto.ts`, `hooks/useMediaQuery.ts` |

## Automated verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (frontend) | pass |
| `npx tsc --noEmit` / `npm run build --workspace=backend` | pass |
| `npm test --workspace=backend` | 1138 tests, 0 failures |
| `npm run test:key-backup --workspace=frontend` | 19 tests, 0 failures |
| Targeted ESLint on changed files | 0 errors (2 pre-existing hook-dependency warnings in `ItineraryDisplay.tsx`) |
| Cover proxy unit tests | parse allow-list, upstream URL, TTL/LRU cache |

Chat-backup wire format is untouched: `WTK1-` codes, PBKDF2-HMAC-SHA256
600,000 iterations, AES-256-GCM, AAD `['waytowalk.trip-key-backup', 1, …]`,
canonical unpadded base64url, 32-byte keys, 16-byte generation/salt, 12-byte IV,
48-byte ciphertext.

## Acceptance mapping

- Account is scannable in three sections; recovery-code replacement asks first.
- Discovery cards open from one stretched target; mobile keeps real counts.
- Proposal confirm has a visible exit and renders under `frame-src 'self'`.
- NotFound keeps one link and a truncated path at 360px.
- Saving Public profile cannot write brand/terms fields; every dirty editor
  prompts on route change and refresh.
- Library search spans every tab; enquiry pills use server counts.
- One proposal decision contract across thread, conversation and board.
- All itinerary tabs are reachable at 768px through the primary row or More.
- Restored drafts and past dates cannot generate a trip without correction.
- Trip cards and activity controls are keyboard reachable and labelled.
- Covers request width-appropriate candidates from the app origin; the auth
  photo is local and not requested below `lg`; public pages no longer fetch
  Unsplash.

## Open browser evidence

Run against a production build with seeded data:

1. Route sweep at 390/768/1440 in light/dark: `/auth`, `/forgot-password`,
   `/reset-password/:token`, `/account`, `/dashboard`, a trip, `/explore`,
   `/explore/events/:id`, an agency profile, `/proposal/:token`, a 404 path.
2. Network waterfall at 390px on `/` and `/explore`: confirm no
   `images.unsplash.com` request and that cards pick 480–800px candidates.
3. Auth page at 390px: no photo request; at 1440px: one local photo request.
4. Dirty-editor script on Settings, a package, a quote and the directory
   profile: edit → navigate → Save/Discard/Stay, then refresh.
5. Proposal second step: visible exit, body renders, non-iframe fallback opens.
6. Screenshot baseline for the five highest-traffic screens.
