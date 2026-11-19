# UI baseline — Phase 6

**Recorded:** 2026-11-18
**Scope:** Phase 6 (C-23 typography direction, C-12 semantic colour tokens and
palette cleanup, C-10 type scale).
**Status:** Implemented and source-verified. The five-screen screenshot baseline
at 390px and 1440px in both themes has not been captured; see **Open checks**.

This file is the evidence record for the Phase 6 exit gate in
`docs/ui-review/implementation-plan.md`. Re-run the commands before changing
`src/styles/typography.css`, `src/index.css`, `tailwind.config.ts` or the
scanners.

## Decisions applied

| ID | Decision | Consequence |
|---|---|---|
| D-D (D-13) | **Manrope + Newsreader**, self-hosted variable fonts (Brand + Design) | UI and body use Manrope, display headings use Newsreader. `src/styles/typography.css` is the only file that names a family; `tailwind.config.ts` exposes `font-sans` / `font-display` / `font-mono` as variables. The fonts ship from `@fontsource-variable`, so the CSP drops the Google Fonts origins. The "Cabin only" direction is retired. |
| C-12 | One semantic palette, four themes | Raw utilities collapse into tokens that already resolve per theme (`foreground`, `muted`, `card`, `border`, `success`, `warning`, `info`, `destructive`, `agency-accent*`, `admin-accent*`, `surface-brand*`). Status text therefore needs no `dark:` guard: 385 duplicate `dark:` utilities were removed. |
| C-10 | Five type steps, 12px floor | 12 metadata (`text-xs`), 14 UI (`text-sm`), 16 body (`text-base`), 20–24 section (`text-xl` / `text-2xl`), 28–48 display (`text-3xl`–`text-5xl`). 18px is retired. 11px survives only as `.text-overline` (uppercase, letter-spaced). |

## Evidence

### C-23 — typography direction

- `frontend/src/styles/typography.css` defines `--font-sans`, `--font-display`
  and `--font-mono`; `src/main.tsx` imports
  `@fontsource-variable/manrope` and `@fontsource-variable/newsreader/opsz.css`.
- `tailwind.config.ts` maps `fontFamily` to those variables only.
- `frontend/index.html` no longer preconnects to or loads Google Fonts.
- `backend/src/config/csp.ts` drops the Google origins: `styleSrc` is
  `'self' 'unsafe-inline'`, `fontSrc` is `'self' data:`, and
  `CSP_STYLE_ORIGINS` is empty; `csp.test.ts` pins this.
- Build emits 9 `@font-face` blocks (Manrope + Newsreader optical-size axis,
  per-subset `unicode-range`) and 8 woff2 files (~332 KB in `dist`, of which the
  browser downloads only the matching Latin subsets).
- No page sets a family locally: `design-tokens/no-local-font` flags a literal
  `fontFamily` in a component; tenant-brand fonts and API payloads pass through
  as expressions.

### C-12 — semantic colour

Token additions in `src/index.css` (light + `.dark`), consumed through
`tailwind.config.ts`:

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--success`, `-ink`, `-foreground` | forest green | mint | accepted, active, in-budget |
| `--warning`, `-ink`, `-foreground` | amber | pale amber | pending, expiring, attention |
| `--info`, `-ink`, `-foreground` | blue | pale blue | informational, awaiting you |
| `--destructive-ink` | deep rose | pale rose | destructive text on tinted surfaces |
| `--surface-brand`, `-ink` | deep green / cream | deep green / cream | brand surfaces and the focus offset over the hero |

- `--agency-accent*` and `--admin-accent*` now have global defaults as well as
  their realm overrides, so a stray `agency-*`/`admin-*` utility outside its
  realm still resolves instead of rendering unstyled.
- Every status utility used in `src` compiles: a check over 91 distinct
  `success|warning|info|destructive|surface-brand` utilities found 0 that Tailwind
  failed to emit.

Mapping rules applied by the sweep:

| Raw family | Token | Rule |
|---|---|---|
| `slate/gray/zinc/neutral/stone` | `foreground`, `muted-foreground`, `border`, `muted`, `background` | shade ≥ 800 → strong text, else muted; 900+ background becomes `background` |
| `emerald/green` | `success` | `bg-*/10`, `border-*/30`, `text-*-ink` |
| `amber/orange/yellow` | `warning` | same |
| `sky/blue/cyan` | `info` | same |
| `rose/red` | `destructive` | same |
| `teal` | `agency-accent*` | agency brand |
| `indigo` | `admin-accent*` | admin brand (public navbar badge included) |
| `violet/purple/fuchsia/pink` | `accent-ink` / `accent` | coral accent |

Manual corrections after the mechanical pass:

- Selected/inverted pills that read `bg-slate-900 text-white` now use
  `bg-foreground text-background` (AgencyQuotePanel internal/client switch) —
  the mechanical `bg-background` would have rendered white-on-white in light.
- `AdminNotice` warning/success and the agency directory warnings use
  `text-*-ink`, not `-foreground`: they sit on 10% tints, where `-foreground`
  is the on-solid colour.
- `text-*-foreground` in dark mode was dropped where the base already used the
  theme-aware `-ink`.
- Dark status tints were softened from `/40`–`/60` to `/20` so a 950-shade
  wash does not become a saturated block.
- The four reverse-logo focus rings over the auth imagery use
  `ring-offset-surface-brand` instead of `ring-offset-slate-950`.
- `hover:bg-*` on statuses that collapsed to a no-op now step to `/90`
  (15 sites).

### C-10 — type scale

- Every `text-[Npx]` / `text-[Nrem]` in `src` was converted to a named step,
  including the variant-prefixed ones (`sm:text-[45px]` → `sm:text-5xl`) that a
  first pass missed.
- `text-lg` (18px) is gone: 61 heading uses moved to `text-xl` (20px), the two
  expense amounts to `text-xl`, the large button size to `text-base`, and the
  icon tiles to `text-xl`.
- `.text-overline` (11px, uppercase, 0.06em) is the only sub-12px step: 114
  uses, each a label that duplicates adjacent text. `uppercase` and `tracking-*`
  were removed from those literals because the utility owns both.
- Two non-overline exceptions were resolved by hand: the hero claim row and the
  hero sticker sat at 11/10px on small screens and now use `text-xs`.
- Marketing display tops out at `text-5xl` (48px). The hero `h1` keeps
  `text-6xl sm:text-7xl` (60/72px) as the one intentional brand exception.

Final step usage: `text-xs` 1737, `text-sm` 495, `text-base` 73, `text-xl` 110,
`text-2xl` 65, `text-3xl` 32, `text-4xl` 32, `text-5xl` 26, `text-6xl` 1,
`text-7xl` 1, `text-overline` 114.

## Sweep counts

| Scan | Before | After |
|---|---|---|
| Raw palette utilities | 1,773 across 88 files (Phase 1 baseline) | **0 across 0 files** |
| Micro-type (`text-[9–11px]`) | 884 across 107 files (pre-Phase 1) | **0 across 0 files** |

## Guards

- `frontend/eslint.config.js` adds a local `design-tokens` plugin:
  `no-raw-palette`, `no-micro-type`, `no-off-scale-type` (`text-lg`),
  `no-local-font` (literal `fontFamily`). Status: 0 findings; the 72 remaining
  repo-wide ESLint errors are pre-existing (`no-explicit-any`, `require`,
  fast-refresh warnings) and unrelated.
- `npm run ui:check` runs `scan-palette --check` then `scan-type --check` and is
  wired into `.github/workflows/ci.yml` as **Design token scan**. The scanners
  are the CI gate because the full ESLint run still carries those pre-existing
  errors.

## Spot-checked conversions

Semantic correctness was read in: `EnquiryThreadPane` (status pills),
`AgencyQuotePanel` (inverted pills, margin switch), `AgencyPackageCard`
(fallback tone gradients), `AgencyExportPanel`, `AdminStatTile`,
`AgencyStatTile`, `AdminNotice`, `AdminAgencyRecord` (status buttons),
`AdminTemporaryPassword`, `DirectoryProfileEditor` (warning blocks),
`TravelGuideSafety`, `Navbar` (admin badge, theme toggle), `Hero`, `Landing`,
`ExpenseTracker`.

## Commands run

| Command | Result |
|---|---|
| `npm run ui:scan-palette` / `ui:scan-type` | 0 / 0 |
| `npm run ui:check` | pass |
| `npm run ui:contrast` | pass — all token pairs, now including the status inks and `surface-brand-ink` on `surface-brand` |
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | pass |
| `npx eslint .` (frontend) | 0 design-token findings; 72 pre-existing errors unchanged |
| `npm run test:auth-policy` | pass (fail 0) |
| `npm run build` (frontend) | pass (31 s); 9 `@font-face` blocks, 8 woff2 (~332 KB) |
| Backend `npx tsc --noEmit` + `npm test` | pass — 1,134 tests (CSP change) |

## Exit gate mapping

| Gate | Evidence |
|---|---|
| Palette scan returns zero default-palette utilities outside the token layer | 0 / 0 |
| Every status colour maps to a named semantic token | success/warning/info/destructive + agency/admin accents; 91 used utilities all emit CSS |
| No functional text renders below 12px at 390px | 0 arbitrary 9–11px; overline is the only 11px step and is uppercase |
| Table metadata ≥12px, form labels ≥12px | Admin table header/cell metadata is `text-xs`+; `Table` default is `text-sm`; labels are `text-sm` |
| A lint rule prevents regression | `design-tokens/*` rules; `ui:check` in CI |
| Decision log and implementation agree; no page chooses a font family locally | D-D row added; `no-local-font` clean |
| Visual-regression baseline covers the five highest-traffic screens | **Not captured** — see Open checks |

## Open checks

1. **Screenshot baseline** — capture Landing, Explore, Dashboard/trip detail,
   Agency workspace and Admin console at 390px and 1440px in both themes, and
   store them under `docs/ui-review/baseline/phase-6/`. Font metrics changed, so
   this must be a fresh baseline, not a diff against pre-migration pixels.
2. **Contrast in the browser** — the script checks declared pairs; confirm the
   status pills and the inverted segmented control on the real screens
   (especially agency dark and admin dark).
3. **Agency font uploads** — confirm tenant-brand PDF fonts still render after
   the local `fontFamily` rule tightened (the files preview relies on them).
4. **Bundle** — confirm the Latin-only font subsets are the ones fetched in the
   network panel; the build emits 8 woff2 files but only 2–3 should be requested.
