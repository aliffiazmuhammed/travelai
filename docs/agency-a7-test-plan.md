# Agency Workspace A7 - Client-Facing Delivery and Acceptance Test Plan

**Milestone:** A7 - public proposal page, client acceptance and share link management
**Status:** implemented and verified locally (2026-10-23)
**Feature flag:** `AGENCY_WORKSPACE_ENABLED` stays dark by default; production enablement remains an explicit ops step.

---

## 1. Scope

A7 lets a client open a branded proposal and accept a quote without an account:

- a share link is minted only from a **ready client export** and pins `(quoteId, exportId)`; later quote versions, template activations or archives never change what an existing link renders or accepts
- the raw token exists only at creation (the staff dialog shows the full URL once); `AgencyProposalLink` rows store a sha256 hash under a TTL index, and unknown, expired and revoked tokens all answer the same generic 404
- public views re-render the pinned document **server-side** (`renderPinnedAgencyExport`) — no browser export job ever runs inside a public request — and the client quote projection strips markup, markup amount and prepared-by
- acceptance is an atomic `sent → accepted` transition, idempotent on retry, and audited as `share.accepted` + `quote.accepted (via: share)` with no actor (token-authenticated event)
- the public PDF streams the stored export bytes (`readAgencyExportFile`), so only the client-template document can ever leave through the public route
- staff manage links in the trip Export panel: create (with a one-time full-URL dialog), list with view/accept activity, and revoke; revoked links are dead immediately and idempotently

Policy enforced in A7:

- the three public routes (`/proposals/:token`, `/proposals/:token/accept`, `/proposals/:token/pdf`) carry no session or tenant guard — the token is the only capability — and are the only agency paths without one
- internal-template exports (audience `internal`) cannot be shared; only `ready` exports with stored bytes can
- every management route stays tenant-guarded and role-checked (create/revoke: planner; list: viewer)
- a revoked, expired or unknown token answers 404 on all three public routes, and an accepted quote is final (no un-accept)

Deferred: email delivery of links; copy-link is sufficient for v1.

---

## 2. Automated checks

Run:

```bash
cd backend && npm test
cd backend && npm run build
cd frontend && npm run typecheck
cd frontend && npm run build
```

Last local run (2026-10-23):

- backend suite: **461 tests, 461 pass, 0 fail**
- backend build: clean
- frontend typecheck: clean
- frontend production build: clean

A7-specific coverage:

- `services/agency/proposals.test.ts`
  - `proposalLinkIsViewable`: unset, revoked and expired links are not viewable; expiry is exclusive
  - `resolveProposalTtlDays`: clamps to 1–90, defaults to `AGENCY_PROPOSAL_TTL_DAYS`, rejects garbage
  - the projection never exposes `tokenHash` or the raw token, and applies sparse defaults
  - `agencyProposalLinkFor` lands on `/proposal/<token>` for any origin hints
- `routes/agency.routes.test.ts`
  - the A1-A7 route table includes the three public proposal routes and the three management routes
  - exactly the three proposal paths are public besides `/status`; every other agency route requires auth
  - `/shares GET` is viewer-readable; `share POST` and `shares/:shareId DELETE` require planner rank; the feature gate runs before every agency route

---

## 3. Live service smoke

`backend/scripts/smoke-a7.mts` runs against a throwaway database (`travelai_a7_smoke`) and temporary `AGENCY_TEMPLATE_DIR`/`AGENCY_ASSET_DIR` directories with a real agency, trip, quote, rendered client export and real PDF jobs. It drops the database and removes rendered files afterwards.

Last local run (2026-10-23), all 38 checks passed, covering:

1. A Chrome executable is found before anything renders.
2. An internal-audience export cannot be shared (400); a queued (not ready) export cannot be shared (409).
3. A ready client export mints a link whose projection shows only the 6-character token hint — never the hash or raw token — and lands on `/proposal/<token>`.
4. Cross-tenant create, list and revoke all answer 404.
5. The TTL clamps (500 days → ≤ 91) and the expiry check is exclusive.
6. The public view re-renders the pinned document server-side with real agency, trip and quote strings; the quote projection and the rendered HTML both exclude markup (₹2,160) and the prepared-by name.
7. A sent quote shows `canAccept`; the PDF route streams `%PDF-` bytes with the quoted filename.
8. Acceptance is idempotent (repeat accept returns the same accepted state) and flips the quote row; audits record `share.viewed`, `share.accepted` and `quote.accepted (via: share)` with no actor.
9. Revoked, expired and unknown tokens answer 404 on all three public routes; revocation is idempotent.
10. An archived template still renders for an existing link (pinned export retry path).
11. The share list is tenant-scoped and newest-first.

Run it with the database and a Chrome installation available:

```bash
cd backend
npx tsx scripts/smoke-a7.mts
```

---

## 4. Browser smoke (local, 2026-10-23)

Environment: Vite dev server on `:8080`, backend on `:5000` with `AGENCY_WORKSPACE_ENABLED=true`.

### 4.1 Public proposal page

Verified with a real seeded share link on the "A4 Smoke Travel" Kerala trip:

1. **View (sent quote):** the page shows the agency name, trip title, quote number/version, template name, the expiry date and the full branded document in a sandboxed iframe; a "Awaiting your acceptance" banner offers the two-step accept (Accept proposal → Confirm acceptance).
2. **Accept:** the confirm step flips the banner to "Accepted" with the accepted date; server state shows the quote row accepted, the link `acceptedAt` set, and the actorless `share.accepted` + `quote.accepted` audits.
3. **PDF:** the Download link streams the PDF through the dev backend.
4. **Revoked link:** the same route shows the generic "Proposal Not Available" state — no distinction between revoked and expired, and no internal data.

### 4.2 Staff export panel (share management)

Verified in the Export tab of the same trip as the owner:

1. Every ready client export row shows **Share with client**; creating a link opens the "Client link created" dialog with the full one-time URL, a Copy button and the "shown only once" warning.
2. The **Client share links** card lists links newest-first with the token hint (`…rk1KQu`), quote number · version, template name, created/valid-until dates, view count and last-viewed/accepted timestamps, plus Accepted / Revoked / Active badges.
3. An unviewed link shows "0 views · not viewed yet"; a revoked link shows no Revoke button.
4. **Revoke** is a one-click action (no `window.confirm`): a toast confirms, the badge flips to Revoked in place, and the public URL immediately answers 404.

Limitations of this run:

- the in-app browser was hidden, so verification used accessibility snapshots and DOM inspection rather than screenshots
- clipboard reads are denied while the document is unfocused, so Copy was verified by code path (write → success toast, catch → manual-copy guidance) rather than by reading the clipboard

---

## 5. Fixes found during verification

- **Route-table order:** the router stack declares the staff `exports/:exportId/download` route before the share routes; the A1-A7 route table expectation was reordered to match, not the other way around.
- **Stale dev storage on the first public PDF check:** an A5/A6-era seeded export's PDF file was no longer on the dev backend's storage dir, so the public PDF answered 404 — a dev-data staleness issue, not an A7 code bug; a freshly seeded export streamed correctly.
- **Seed script pinned the wrong quote:** the ready export's pinned `quoteId` must be used for the share, not the latest sent quote.

---

## 6. Production rollout prerequisites

- Keep `AGENCY_WORKSPACE_ENABLED` off until A7 acceptance (and decide whether A8 must land first).
- Provision `AGENCY_TEMPLATE_DIR`, `AGENCY_ASSET_DIR` and the export output storage on persistent private volumes; the public PDF route reads the same stored bytes the staff download uses.
- Set `AGENCY_PROPOSAL_TTL_DAYS` (default 30, max 90) before enabling; the TTL index on `expiresAt` must exist for expiry cleanup.
- Verify `/api/health` reports `agency.milestone: "A7"` and `writesEnabled: true` when the flag is on.
- Confirm the three public proposal routes are the only unauthenticated agency paths, and that the public DTO and rendered documents never expose markup, markup amount, prepared-by, expenses or chat ciphertext.
