# UI baseline — Phase 0 and Phase 1

**Recorded:** 2026-11-18
**Scope:** Phase 0 measurement harness plus Phase 1 (C-09 accent roles,
C-11 root theme ownership).
**Status:** Source scanners and token contrast pass. Authenticated visual
sign-off still needs test credentials; see **Evidence limits**.

This file is the regression record for the measures in
`docs/ui-review/implementation-plan.md`. Re-run the commands below before and
after later phases and add a dated column rather than editing the numbers in
place.

## Tooling

All Phase 0 tooling is dependency-free Node (18+) and lives in
`frontend/scripts/ui-baseline/`.

| Script | Command (repo root) | Purpose |
|---|---|---|
| `contrast.mjs` | `npm run ui:contrast` | Resolve every realm/mode token pair and fail below 4.5:1 |
| `scan-type.mjs` | `npm run ui:scan-type` | Count `text-[9px]`, `text-[10px]`, `text-[11px]` |
| `scan-palette.mjs` | `npm run ui:scan-palette` | Count raw Tailwind palette utilities outside the token layer |

`--check` turns each scanner into a hard gate. It is intentionally **off** for
the type and palette scans until C-12 and C-10 land; the counts are the
regression metric until then. The contrast check has no bypass and exits
non-zero on a failure or a missing declared pair. It is wired into
`npm run verify`, so any runner that uses that command gates on contrast.

`contrast.mjs` strips comments and splits selector lists before resolving a
block, so `[data-theme="agency"].dark` is never read as the global `.dark`
block. Without that, agency tokens leak into traveller and admin checks and the
matrix passes for the wrong reason.

### Why no Playwright or axe yet

Phase 0 listed a rendered screenshot matrix, axe, and bundle budgets. Adding a
browser runner is a larger dependency decision, and the authenticated surfaces
need test accounts before a screenshot is meaningful. The source scanners were
chosen because they are deterministic, run in CI today, and do not pretend to
cover visual behaviour they cannot see. The 12-case portal matrix remains an
open manual check in the Phase 1 exit gate.

## Pre-change baseline

Captured before any Phase 1 edit.

| Metric | Result |
|---|---|
| Micro-type uses (`9–11px`) | **884** across **107** files |
| Raw palette utilities | **1,810** across **88** files |
| Contrast checks | **2 failures**, plus the not-yet-built accent roles reported as missing |
| Failing pair | traveller/agency light `accent-foreground` on `accent` = **3.98:1** |

`accent-foreground` was forest at 16.9% lightness on a coral fill. The agency
light realm inherited the same pair because `.agency-theme` reused the
traveller tokens. No `accent-ink`, `agency-accent-ink`,
`agency-accent-foreground`, or `admin-accent*` roles existed, so the checker
reported the missing pairs that the planned roles would fill.

## Post-Phase 1 baseline

| Metric | Result | Delta |
|---|---|---|
| Micro-type uses (`9–11px`) | **884** across **107** files | unchanged (out of scope) |
| Raw palette utilities | **1,773** across **88** files | **−37** (admin primary buttons moved to `admin-accent`) |
| Contrast checks | **all declared pairs pass** | 0 failures, 0 missing |

The palette delta is the expected result of replacing admin `bg-indigo-500` /
`hover:bg-indigo-400` primary buttons with the `--admin-accent` roles. The
broader 1,773-utility sweep is still Phase 6 work (C-12); Phase 1 deliberately
did not expand into it.

A re-run while the in-flight auth branch was landing returned **1,777 across 89
files**. The extra file is untracked `src/components/auth/AuthPostcard.tsx`
(+4 utilities), so the drift belongs to concurrent branch work, not Phase 1.
Compare against a fixed snapshot rather than the live tree when attributing
deltas.

### Contrast results

Every pair is listed so a later palette change cannot silently pass by removing
a check.

| Realm | Pair | Ratio |
|---|---|---:|
| traveller light | `accent-ink` on `background` | 5.79:1 |
| traveller light | `accent-ink` on `card` | 6.42:1 |
| traveller light | `accent-foreground` on `accent` | 5.04:1 |
| traveller dark | `accent-ink` on `background` | 6.26:1 |
| traveller dark | `accent-ink` on `card` | 5.49:1 |
| traveller dark | `accent-foreground` on `accent` | 5.02:1 |
| agency light | `agency-accent-ink` on `agency-canvas` | 10.52:1 |
| agency light | `agency-accent-ink` on `agency-panel` | 11.65:1 |
| agency light | `agency-accent-foreground` on `agency-accent` | 10.52:1 |
| agency dark | `agency-accent-ink` on `agency-canvas` | 13.28:1 |
| agency dark | `agency-accent-ink` on `agency-panel` | 11.64:1 |
| agency dark | `agency-accent-foreground` on `agency-accent` | 10.52:1 |
| admin dark | `admin-accent-ink` on `background` | 6.35:1 |
| admin dark | `admin-accent-ink` on `card` | 5.57:1 |
| admin dark | `admin-accent-foreground` on `admin-accent` | 6.18:1 |

Base pairs (`foreground`, `muted-foreground`, `primary-foreground`) also pass in
every realm and are printed by the script.

## What Phase 1 changed

### C-09 — accent fill / ink / on-fill

- Travel, agency, and admin accents now expose three roles: fill (`--accent`),
  readable ink on canvas/card (`--accent-ink`), and text on the fill
  (`--accent-foreground`).
- The coral and teal fills, dots, borders, and illustration were preserved. Only
  the text roles changed.
- `text-accent` → `text-accent-ink` and `text-agency-accent` →
  `text-agency-accent-ink` across call sites. Tinted backgrounds
  (`bg-accent/10`, `bg-agency-accent-soft`) keep the ink role.
- Solid agency fills now use `text-agency-accent-foreground`, including the
  login aside, badges, logo tiles, and progress bar labels.
- Admin primary buttons use `bg-admin-accent text-admin-accent-foreground`
  (indigo-600 fill, white text, 6.18:1) instead of raw `indigo-500`.
- **Naming deviation:** the plan sketch used `text-agency-on-accent`. The
  implementation uses `--agency-accent-foreground` to match Tailwind/shadcn's
  existing `*-foreground` convention. C-12 must extend this name, not rename it.

### C-11 — root theme ownership and portal inheritance

- `frontend/src/context/ThemeContext.tsx` owns `{ mode, realm }`. It writes
  `.dark`, `data-theme="traveller|agency|admin"`, and `color-scheme` to
  `<html>` in a layout effect.
- Realm comes from the route (`/agency/*`, `/admin/*`, else traveller) and is
  applied before first paint by `frontend/public/theme-init.js`, so there is no
  flash and no duplicate toggle state.
- Agency tokens moved from `.agency-theme` on a nested element to
  `[data-theme="agency"]` / `[data-theme="agency"].dark` on `<html>`. Portalled
  sheets, dialogs, dropdowns, and toasts inherit the workspace skin.
- Admin is always dark for its realm, but the provider does **not** persist dark
  over a saved light preference. Leaving `/admin` restores the saved traveller
  or agency mode.
- Removed the `.dark` wrapper strategy from `AdminLayout`, `AdminApp`,
  `AdminLogin`, `AdminPasswordChange`, and admin dialogs/sheets/command menu.
- `Navbar` reads `useTheme()` instead of duplicating `localStorage` and
  `documentElement` logic; its first render matches the applied theme.
- `TripMap` treats the applied `.dark` class as the single source of truth.
- One `Toaster` lives inside `ThemeProvider` and follows `effectiveMode`.

### Theme state machine

| Route | Saved mode | Applied mode | Applied realm |
|---|---|---|---|
| traveller / public | light or dark | saved, else system | `traveller` |
| `/agency/*` | light or dark | saved, else system | `agency` |
| `/admin/*` | any | **dark** | `admin` |
| leave `/admin` | light | light | destination realm |

## Verification run

| Check | Result |
|---|---|
| `npm run ui:contrast` | pass — all declared pairs |
| `npm run ui:scan-type` | 884 uses / 107 files (baseline held) |
| `npm run ui:scan-palette` | 1,773 uses / 88 files (baseline −37) |
| `npm run typecheck --workspace=frontend` | pass |
| `npm run build --workspace=frontend` | pass |
| `npm run lint:frontend` | fails on pre-existing `no-explicit-any` and related errors; no new errors from these changes |

The lint failure is not introduced by Phase 1. The remaining errors are in
`CommentsTab`, `Dashboard`, `api.ts`, `UserContext`, and similar files that
this phase did not change. Phase 1 adds no lint errors; the new
`ThemeContext.tsx` adds two `react-refresh/only-export-components` warnings,
the same warning class already emitted by the other context and UI modules.

## Evidence limits

- No authenticated screenshots were captured. Traveller, agency, and admin
  need test credentials, and the visual matrix in the Phase 1 exit gate is
  still **open**.
- No axe run and no bundle-budget measurement. The scanners cover declared
  tokens and source patterns, not rendered pixels, focus order, or chunk
  weight.
- Contrast values come from the declared HSL tokens using the WCAG
  relative-luminance formula. They are not sampled from a screenshot and do not
  account for gradients, images, or opacity stacking.
- The type and palette scans are counts, not quality scores. Their `--check`
  gate stays off until C-10 and C-12.

## Open Phase 1 exit-gate items

- [x] Coral status text on cream ≥4.5:1.
- [x] Agency dark primary button ≥4.5:1.
- [x] Admin primary buttons ≥4.5:1.
- [x] Theme toggle matches the applied theme on first render.
- [x] Agency dark mode has no cream fill under white text in the audited
      agency call sites.
- [x] Contrast check runs in the verification path (`npm run verify`).
- [ ] Dialog, sheet, and toast render correctly in all three realms in both
      modes (12 visual checks).
- [ ] An admin page with the mobile navigation sheet and a toast in dark mode.
- [ ] Switch theme, reload, and confirm the first rendered toggle state in a
      browser.
