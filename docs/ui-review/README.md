# waytowalk UI/UX review

**Scope:** All route-level web pages in `frontend/src/pages`, reviewed in six
phases.
**Mode:** Audit only. No product code was changed by this review.
**Status:** Complete — 2026-11-17.
**Reviewer:** OpenCode UI design review (rendered public pages + source review)

## Deliverables

```
docs/ui-review/
  README.md                              plan, method, results and index (this file)
  phase-1-public-discovery.md            20 findings
  phase-2-auth-account.md                16 findings
  phase-3-traveller-workspace.md         19 findings
  phase-4-agency-workspace.md            18 findings
  phase-5-platform-admin.md              19 findings
  phase-6-foundations-cross-cutting.md   18 findings
  recommended-changes.md                 deduplicated action plan (30 changes)
  implementation-plan.md                 phased delivery order, gates and tracking
  baseline/phase-0-1-baseline.md         Phase 0 scanners + Phase 1 before/after
```

Start with `recommended-changes.md` if you only read one file. Use
`implementation-plan.md` to see what ships first and what must be true before
each release. Start with the phase files if you need the evidence behind a
specific recommendation.

## Results at a glance

| Phase | Surfaces | Critical | High | Medium | Low | Strongest area | Weakest area |
|---|---|---:|---:|---:|---:|---|---|
| 1. Public discovery | 14 routes | 1 | 5 | 10 | 4 | Layout consistency (3) | Hierarchy, content, interaction, a11y, performance (2) |
| 2. Auth and account | 5 routes | 0 | 4 | 9 | 3 | Layout, brand, content, responsive (3) | Interaction, a11y, performance (2) |
| 3. Traveller workspace | 5 primary screens | 1 | 4 | 10 | 4 | Brand (4) | Content, interaction, a11y, performance (2) |
| 4. Agency workspace | 14 routes | 1 | 3 | 9 | 5 | Brand (4) | Responsive, a11y (2) |
| 5. Platform admin | 11 routes | 0 | 5 | 11 | 3 | Layout (4) | Responsive, a11y (2) |
| 6. Foundations | Cross-cutting | 0 | 8 | 7 | 3 | Spacing, brand (3) | Type, components, responsive, a11y, states, performance (2) |
| **Total** | **49 route-level screens** | **3** | **29** | **56** | **22** | | |

The counts include duplicates across realms where the same root cause surfaces
in different user contexts. `recommended-changes.md` merges those into 30
changes, ordered by impact and effort.

## Why phases

The product has 49 route-level screens across four distinct realms: public
discovery, traveller, agency workspace, and platform admin. A single review
either drowns in detail or produces generic advice. Grouping by realm keeps each
report focused on the user, the jobs, and the design language that page actually
uses.

## Method

For every phase:

1. Inventory routes and the components they depend on.
2. Inspect the rendered page where a public URL or test session is available.
   Public pages were rendered at 1440px and 390px in light and dark themes.
   Authenticated realms are reviewed from source plus shared layout components.
3. Check hierarchy, typography, spacing, colour, density, navigation, forms,
   tables, dialogs, feedback, interaction states, responsive behaviour,
   accessibility, and performance risk.
4. Compare against the product's own tokens (`src/index.css`,
   `tailwind.config.ts`) and adjacent realms.
5. Separate objective defects from subjective opportunities.
6. Score 1–5 with evidence, or mark "not assessed" and say why.
7. Record findings as Critical / High / Medium / Low with location, evidence,
   user impact, recommendation, effort, and confidence.

**Measurements.** Systemic findings use counts over `frontend/src` at the time
of review (for example, 882 uses of 9–11px type across 107 files; 440 raw
palette utilities across 80 files). Counts separate a pattern from a local
exception; they are not a quality score by themselves.

**Validation of the review itself.** Drafts were re-checked against source
before publication. Four Phase 1 claims were corrected: the hero counts remain
on mobile but the count/meta line is hidden; `theme-init.js` prevents the page
flash (the mismatch is the toggle state and hard-coded brand hexes); Terms and
Privacy do cross-link below the document, but are unreachable from the public
site; and the cover's aspect-ratio box does reserve space, so the image finding
is about late/oversized loading, not layout shift.

## Phase groups

### Phase 1 — Public discovery and marketing
Routes: `/`, `/explore`, `/explore/:tripId`, `/explore/events/:eventId`,
`/agencies`, `/agencies/:slug`, `/agencies/apply`, `/travelers/:handle`,
`/guidelines`, `/terms`, `/privacy`, `/shared/:shareId`,
`/proposal/:token`, `*` (NotFound).
Pages: 14. Includes the shared `Navbar`, `Hero`, and legal shell.
Focus: first impression, trust, discovery, conversion, anonymous reading,
mobile browsing, empty states, content gating.

### Phase 2 — Authentication and account entry
Routes: `/auth`, `/forgot-password`, `/reset-password/:token`,
`/invite/:token`, `/profile`.
Pages: 5. Includes the `Auth` photo panel and password-reset shell.
Focus: form clarity, validation, error recovery, consent, keyboard flow,
password-manager support, account settings density.

### Phase 3 — Traveller workspace
Routes: `/dashboard`, `/plan`, `/dashboard` trip detail, `/enquiries`,
`/enquiry/:enquiryId`, `/proposals`.
Pages: 5 primary screens plus embedded itinerary, map, budget, chat.
Focus: trip library, planner, itinerary readability, enquiry inbox,
conversation thread, proposal comparison, empty and loading states.

### Phase 4 — Agency workspace
Routes: `/agency/login`, `/agency/invite/:token`, `/agency`,
`/agency/onboarding`, `/agency/trips`, `/agency/trips/new`,
`/agency/trips/:tripId`, `/agency/events`, `/agency/clients`,
`/agency/enquiries`, `/agency/templates`, `/agency/team`,
`/agency/operations`, `/agency/settings`.
Pages: 14 plus the shell and password-change form.
Focus: operator efficiency, table density, bulk actions, enquiry triage,
tenant identity, permissions, settings length, destructive-action safety.

### Phase 5 — Platform admin console
Routes: `/admin/login`, `/admin`, `/admin/account`, `/admin/accounts`,
`/admin/accounts/:accountId`, `/admin/agencies`, `/admin/agencies/:agencyId`,
`/admin/applications`, `/admin/reports`, `/admin/audit`,
`/admin/platform-admins`.
Pages: 11 plus the always-dark shell and temporary-password panel.
Focus: scanning, auditability, decision queues, irreversible actions,
data-table usability, status semantics, dark-only contrast.

### Phase 6 — Foundations and cross-cutting quality
Not a route group. Covers:
- design tokens, type scale, spacing, radius, elevation;
- shared components (`Navbar`, `Button`, `Card`, `Dialog`, `Table`, shell);
- responsive behaviour and touch targets;
- accessibility (semantics, focus, labels, contrast, reduced motion);
- dark mode coverage and hard-coded palettes;
- loading, empty, error, and success states;
- performance risks (images, maps, charts, large client bundles).

## Evidence limits

- Public pages were rendered against the running app and backend on the review
  machine. Findings that depend on source-only facts (payloads, link graphs,
  CSP, bundle boundaries, authenticated screens) are labelled **code-based**.
- Traveller, agency, and admin pages need credentials. They are reviewed from
  source and shared layout components; visual findings for those pages are
  labelled **code-based** rather than claimed as screenshots.
- No analytics, user research, or benchmark data exists in the repository, so
  none is invented. Severity reflects likely user impact from the code and the
  rendered UI, not measured traffic.
- Contrast ratios are computed from the declared HSL tokens using the WCAG
  relative-luminance formula, not sampled from pixels.

## Scorecard key

1 = broken or actively harmful
2 = weak, causes friction
3 = competent, conventional
4 = strong, coherent
5 = exemplary, distinctive and robust

"Not assessed" is used when the evidence cannot support a score.

## Relationship to the consolidated file

Each phase file answers "what is true on these screens, and why does it matter?"
`recommended-changes.md` answers "what do we change, and how do we know it
worked?". Its coverage map accounts for every finding in all six phases,
including findings that were merged because they share a root cause.
`implementation-plan.md` answers "what ships first, what depends on what, and
what evidence closes each phase?" — it schedules all 30 changes across ten
delivery phases and three release gates.
