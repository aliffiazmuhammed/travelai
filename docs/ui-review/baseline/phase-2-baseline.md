# UI baseline — Phase 2

**Recorded:** 2026-11-18
**Scope:** Phase 2 (C-01 legal reachability, C-02 shared-trip contract,
C-20 metadata/share previews/indexability).
**Status:** Source-level verification passes. Browser checks and a real
chat-client preview are still open; see **Open checks**.

This file is the evidence record for the Phase 2 exit gate in
`docs/ui-review/implementation-plan.md`. Re-run the commands before touching the
share projection, the metadata helper or the legal shell.

## Decisions applied

| ID | Decision | Consequence |
|---|---|---|
| D-A | Shared-trip budgets are **private** | `projectPublicTrip` strips `budget_per_person` and `budget_breakdown`; the public itinerary renders no Expenses tab |
| D-B | "Take a copy" is **relabelled** | Both CTAs read "Start planning your own trip" and open a blank `/plan` |

## Evidence

### C-02 — public payload contract

Command:

```
npx tsx --test backend/src/services/seo/shareMeta.test.ts \
  backend/src/services/collab/publicProjection.test.ts
```

Result: **14/14 pass** (6 projection, 8 metadata). The added cases are:

| Test | Asserts |
|---|---|
| `the public projection strips every budget field from tripDetails` | `budget_per_person` and `budget_breakdown` are absent; title, duration and days survive |
| `stripping budgets does not mutate the stored trip details` | The stored document still holds its budget after a projection |
| `a shared trip contributes its title, day count and cover image` | Crawler tags use the trip title, the day count and the share-scoped cover URL, `noindex`, `article` |
| `a missing or revoked share falls back to the not-found card` | A revoked share resolves to the not-found title and the default card |

The existing allow-list test still pins the top-level key set to
`_id, title, status, tripDetails, customRoutes, createdAt`, so a new field
cannot be added without a deliberate test edit.

### C-20 — robots matrix

`backend/src/services/seo/shareMeta.test.ts`:

| Path | `robots` | Why |
|---|---|---|
| `/` | `index, follow` | Public landing |
| `/explore`, `/agencies`, `/travelers` | `index, follow` | Public discovery |
| `/auth`, `/terms`, `/privacy`, `/guidelines` | `index, follow` | Public forms and policies |
| `/dashboard`, `/plan`, `/profile` | `noindex, nofollow` | Authenticated traveller shells |
| `/admin/*`, `/agency/*` | `noindex, nofollow` | Private realms |
| `/enquiries`, `/enquiry/*`, `/proposals`, `/conversation/*`, `/invite/*` | `noindex, nofollow` | Private conversations |
| `/shared/*`, `/proposal/*` | `noindex, nofollow` | Unlisted capability links |
| unknown (e.g. `/no-such-page`) | `noindex, nofollow` | NotFound shell |

`/agencies` is public while `/agency` is private — both asserted, because the
prefix rule is the easy place to get this wrong.

`frontend/public/robots.txt` no longer lists per-bot `Allow: /` groups. Those
groups override the wildcard group for Googlebot and Bingbot, which previously
made every `Disallow` ineffective for the two crawlers that matter most.

### C-20 — head injection against the built shell

`applyMetaToHtml` was run against the real `frontend/dist/index.html` for `/`,
`/explore` and `/dashboard`. Each produced exactly one title, description,
`robots`, canonical and `og:image`, with the image resolved to an absolute URL:

```
/         robots: index, follow    og:image: https://…/brand/og-default.png
/explore  robots: index, follow    og:image: https://…/brand/og-default.png
/dashboard robots: noindex, nofollow
```

Other asserted properties:

- injecting twice never duplicates `description`, `robots` or `canonical`;
- quotes, `&`, `<` and `>` in a title or description are escaped;
- the shell's own tags (`theme-init.js` script, `theme-color`) survive;
- a trailing slash still produces a canonical URL without it.

The client helper mirrors the server: `SharedTrip` prefers the first day photo's
share-scoped URL over the generic card, so a script-running preview and a
crawler preview point at the same image. The server lookup is still the
authoritative path for chat apps.

### C-20 — route coverage

Every `Route path` in `frontend/src/App.tsx` was fed through `metaForPath` and
checked for a non-empty title and description. All 40 paths resolve, including
nested agency/admin routes and dynamic segments. Private paths carry
`noindex, nofollow`; public ones leave robots unset, which the static shell
already treats as indexable.

The unknown-path fallback is deliberately `noindex, nofollow` too, matching the
backend. A route added without a rule therefore fails closed instead of
inheriting the landing page's indexability.

Every rule also gets the default 1200×630 card, so the client helper writes an
**absolute** `og:image` and `twitter:image` on every route instead of leaving the
root-relative value from `index.html`. Shared trips, proposals and the legal
documents override it through their own `applyPageMeta` call.

### C-20 — asset

| Asset | Size | Notes |
|---|---|---|
| `frontend/public/brand/og-default.png` | 1200×630, ~45 KB | Forest ground, contour arcs, Manrope wordmark, coral accent, tagline |

Built locally with `System.Drawing` and the shipped Manrope TTFs because image
generation was unavailable. It ships to `dist/brand/og-default.png` on build.
Regenerate only if the brand assets change.

### C-01 — legal reachability

Verified by source inspection (browser checks below):

| Entry point | Links |
|---|---|
| `/` footer bottom bar | Terms, Privacy, Guidelines |
| Mobile sheet | Terms, Privacy, Guidelines |
| Legal shell | "Back to waytowalk" → `/` |
| Legal shell body | Generated TOC: sticky rail at `lg`, `<details>` below |
| Sign-up consent | Terms of Service, Privacy Policy (pre-existing) |

## Commands run

| Command | Result |
|---|---|
| `npm run typecheck --workspace=frontend` | pass |
| `npm run build --workspace=backend` | pass |
| `npm run build --workspace=frontend` | pass; `dist/brand/og-default.png` and `dist/robots.txt` present |
| `npm run ui:contrast` | pass — all declared text pairs |
| `npm run ui:scan-type` | **886** uses across **107** files (was 884) |
| `npm run ui:scan-palette` | **1,777** uses across **89** files (was 1,773) |
| `npx tsx --test backend/src/services/seo/shareMeta.test.ts backend/src/services/collab/publicProjection.test.ts` | **14 pass, 0 fail** |
| `npm test --workspace=backend` | **1116 pass, 0 fail** (~6.5 min, before the two metadata cases were added) |
| `npm run lint:frontend` | fails with 71 errors / 24 warnings — none introduced by Phase 2 |
| Targeted ESLint on changed files | no new errors; pre-existing `no-explicit-any` in `ProposalShare.tsx`/`SharedTrip.tsx` and two `exhaustive-deps` warnings in `ItineraryDisplay.tsx` |

The type and palette counts move by the two micro-labels added to the legal TOC
and the footer legal nav. Neither gate is enabled yet; C-10 and C-12 own the
sweep in Phase 6.

The repo-wide lint failure predates Phase 2: the errors are `no-explicit-any` and
`no-require-imports` in files this phase does not touch, plus the four
`no-explicit-any` sites already present in `ProposalShare.tsx` and
`SharedTrip.tsx`. A `git diff` of the changed files confirms no new `any` was
added. Do not attribute the 71 to Phase 2 and do not fix them here; C-17 and the
Phase 7 typing work own that backlog.



## Browser checks (2026-11-18)

Run against the Vite dev server at `localhost:8080` in the in-app browser. The
backend was not running, so API-backed pages reported 500s; that does not affect
the checks below, which are shell, metadata and navigation.

| Check | Result |
|---|---|
| `/terms`, `/privacy` title | `Terms of Service · waytowalk`, `Privacy Policy · waytowalk` |
| Legal description | Matches each document's own description |
| Legal TOC | 10 links, matching the 10 `section[id]` values, in document order |
| Anchor jump | `#your-account` lands the section at 112px with the heading visible below the navbar (`scroll-mt-28`) |
| Mobile/tablet TOC | `<details>` opens, chevron rotates, list is complete |
| Legal exit | "Back to waytowalk" present and links to `/` |
| Companion policy | `/privacy` links `/terms` and vice versa |
| Footer legal nav | Terms → `/terms`, Privacy → `/privacy`, Guidelines → `/guidelines`; clicking Privacy navigated and updated the title |
| `/dashboard`, `/plan`, `/agency/trips` | Titles applied; `robots: noindex, nofollow` |
| `/no-such-page` | `Page not found · waytowalk`; `robots: noindex, nofollow`; h1 rendered |
| `/shared/does-not-exist` | `Shared itinerary not found · waytowalk`; `robots: noindex, nofollow` |
| Lighthouse `/terms` | Accessibility 98, Best Practices 100, **SEO 100** |
| Lighthouse `/` | Accessibility 98, Best Practices 100, **SEO 100** |

### Notes from the browser pass

- The legal `<details>` summary had no affordance beyond the text; a chevron was
  added and rotates when open.
- Landing has no `<main>` landmark (Lighthouse `landmark-one-main`). This is
  pre-existing structure owned by C-13/C-17, not Phase 2; it is recorded here so
  the score is not mistaken for a Phase 2 regression.
- The window could not be resized past 912px, so the desktop sticky TOC rail
  (`lg` and above) is source-verified only. The `<details>` list is what renders
  at the tested width.
- The mobile navigation sheet (`md:hidden`) was not reachable at 912px either;
  its three legal links are source-verified.

## Open checks

These need a deployed URL or test credentials, not more source reading.

1. **Desktop legal rail** — at 1440px confirm the rail sticks while the document
   scrolls and every link lands with the heading clear of the navbar.
2. **Mobile sheet** — at 390px confirm all three legal links are visible and the
   sheet closes on navigation.
3. **Shared trip** — `/shared/:id` with real data: one heading, no workspace
   header, no Expenses tab, both CTAs read "Start planning your own trip".
4. **Proposal** — `/proposal/:token` with real data renders and its tab title
   matches the agency/trip.
5. **Real previews** — WhatsApp, Slack and iMessage against a deployed URL. Only
   local head-tag injection is validated; a chat client needs a public origin.
6. **Authenticated sweep** — the backend-injected HTML (not the client helper)
   for `/dashboard`, `/plan` and one agency page confirms `noindex`.

