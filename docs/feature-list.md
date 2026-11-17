# TravelAI — feature list

**Prepared:** 2026-10-30
**Companion to:** `docs/investor-overview.md`
**Legend:** ✅ shipped · 🟡 shipped but pilot-gated or manually operated · ⛔ deliberately not built

This is the complete inventory of what the product does today, grouped by the person using it. It describes behaviour that exists in the codebase, not a wish list. Anything marked ⛔ is listed on purpose so the boundary is explicit.

---

## 1. Traveller — AI planning

| Feature | Status | Notes |
|---|---|---|
| Dual-provider AI generation | ✅ | Gemini 2.5 Flash primary; automatic Groq failover on rate limit or failure. |
| Live streaming generation | ✅ | Multi-stage progress over server-sent events. |
| Six-step trip wizard | ✅ | Destination → dates → group → budget → vibe/pace → review. |
| Destination autocomplete and curated hotspots | ✅ | 80+ pre-mapped Indian travel hubs, with geocoding for unlisted places. |
| Group presets | ✅ | Solo, couple, family, friends; independent adult and child counts. |
| Budget allocator | ✅ | Per-person and total sliders with automatic category allocation. |
| Vibe and interest weighting | ✅ | Adventure, culture, relaxation, culinary, nature, photography, nightlife, shopping. |
| Pace and dietary preferences | ✅ | Relaxed / balanced / action-packed; dietary notes flow into recommendations. |
| Multi-language output | ✅ | Nine languages (English plus eight Indian); JSON keys stay stable across languages. |
| Seasonal adaptation | ✅ | Weather advisories, packing hints and activity picks adjust to the travel month. |
| Returning-traveller personalisation | ✅ | Past trips, budgets, group types and positive feedback feed the prompt. |
| Quality scoring | ✅ | Heuristic completeness/consistency/richness/map-accuracy score shown as "AI confidence". |
| Prompt cache and A/B variants | ✅ | TTL cache for identical prompts; deterministic per-user variant split. |
| Feedback loop | ✅ | Thumbs up/down feeds personalisation; aggregated insights endpoint. |

## 2. Traveller — itinerary, maps and safety

| Feature | Status | Notes |
|---|---|---|
| Day-by-day itinerary view | ✅ | Timeline with activities, stays, food, transport and tips. |
| Multi-day stay deduplication | ✅ | Consecutive nights at one property merge into one card. |
| Inline activity editing | ✅ | Title, time slot, cost, location, description and GPS coordinates. |
| Drag-and-drop reordering | ✅ | Activities within a day; whole days move with automatic renumbering. |
| Background autosave | ✅ | Local edits save automatically; structured edits persist immediately. |
| Version history and restore | ✅ | Every save creates a restorable snapshot; pre-restore state is backed up too. Retention is configurable. |
| Interactive map | ✅ | Leaflet/OpenStreetMap, numbered activity pins, hotel markers, popups. |
| Per-leg distance and travel time | ✅ | Client-computed instantly, refined by the backend routing endpoint. |
| User-drawn custom routes | ✅ | Draw, name, colour, tag a day, pick a travel mode; stored per trip and recomputed server-side. |
| Per-day weather advisories | ✅ | Open-Meteo forecast with risk levels and concrete hill-road/heat/cold/wind guidance; seasonal fallback beyond the forecast window. |
| AI indoor alternative | ✅ | Proposes a weather-safe rewrite of one day; applied only when the user accepts. |
| Nearby places | ✅ | Restaurants, cafés, attractions, ATMs, pharmacies and fuel; Geoapify → Overpass → Nominatim failover; one-click add to a day. |
| Weather-aware plan check | ✅ | Flags travel legs in rough weather and offers explicit fixes (swap day, rebuild indoors, pad travel time). |
| Stays and dining view | ✅ | Consolidated stay cards and curated food spots per day. |
| Travel guide and packing | ✅ | Climate notes, packing checklist and etiquette. |

## 3. Traveller — money

| Feature | Status | Notes |
|---|---|---|
| Expense ledger | ✅ | Per-trip, per-day spend with description, category and amount. |
| Planned vs actual | ✅ | Category comparison chart plus planned/spent/remaining/variance cards. |
| Group travellers | ✅ | Add companions; record who paid each expense. |
| Multi-currency | ✅ | 30 ECB-quoted currencies; rates cached and snapshotted onto the trip; base currency switchable. |
| Bill splitting | ✅ | Not split, equal or custom shares. |
| Settle up | ✅ | Per-person paid/share/net balances plus the fewest transfers to settle. |
| Receipt attachments | ✅ | JPEG/PNG/WebP/PDF, size-capped, magic-byte verified, previewable and removable. |

## 4. Traveller — sharing and discovery

| Feature | Status | Notes |
|---|---|---|
| Public read-only trip links | ✅ | Token-based, no account needed. |
| Messenger text export | ✅ | Formatted summary for WhatsApp/Telegram/email. |
| JSON backup | ✅ | Full raw data export. |
| Print stylesheet | ✅ | Browser print-to-PDF layout that hides navigation and reformats cards. |
| Publish to gallery | ✅ | Separate from the unlisted share link; money and identities never included. |
| Hide exact dates | ✅ | Per-trip toggle shows month and duration instead. |
| Traveller profile | ✅ | Handle, bio and published trips at `/travelers/:handle`. |
| Explore gallery | ✅ | Browsable published trips. |
| Clone a published trip | ✅ | Creates an editable draft in the visitor's account. |
| Request to join a trip | ✅ | Queued for the owner; approval grants commenter access only. |
| Report content | ✅ | Three distinct open reports auto-hide a gallery trip pending review. |

## 5. Collaboration (personal and agency trips)

| Feature | Status | Notes |
|---|---|---|
| Trip roles | ✅ | Owner, editor, commenter, viewer. |
| Invites | ✅ | Link or email invites with expiry and use limits; token hashed at rest. |
| Members cap | ✅ | Configurable hard cap per trip. |
| Comments | ✅ | Paginated, rate-limited, XSS-safe by construction. |
| Polls | ✅ | Multiple-choice decisions inside a trip. |
| Decisions | ✅ | Group decisions recorded on the trip. |
| Trip chat | ✅ | Floating drawer, typing indicators, unread badges, end-to-end encrypted. |
| Chat key backup | ✅ | Optional password-assisted account-key backup with a one-time recovery code; mobile and web. |
| Chat history migration | ✅ | Backs up every epoch key a client can still open; unreadable history is reported, never guessed. |
| Live presence | ✅ | SSE stream with heartbeat; polling fallback when the live tier is off. |
| Version history | ✅ | Shared across travellers and agency staff. |
| Trash and restore | ✅ | Soft delete with restore; permanent purge is restricted. |

## 6. Public agency directory

| Feature | Status | Notes |
|---|---|---|
| Directory listing `/agencies` | 🟡 | Cursor pagination, search and facet filters for city, destination, specialty and language. Content-gated until there are enough live profiles. |
| Agency profile `/agencies/:slug` | ✅ | About, base city, destinations, specialties, services, languages, contact, logo, upcoming events, package cards. |
| Readiness-gated publishing | ✅ | No description, city, destination, service or logo means no listing. |
| Package cards | ✅ | Snapshot of a trip: title, nights, highlights, inclusions, cover, optional per-person price. Never re-reads the source trip. |
| "From ₹…" listing price | ✅ | Always the cheapest live package; unpriced packages say "price on request". |
| Enquiry form | ✅ | Signed-in travellers only; consent, dates, party size, budget band and message. |
| Agency inbox | ✅ | Claim/assign, status funnel, unread per side, convert to client, hand off to a quote. |
| Two-way enquiry threads | ✅ | In-app for travellers; 90-day private guest links for guests; raw tokens never stored. |
| Live enquiries | ✅ | SSE for new leads, replies and read receipts; 20-second visible-tab poll fallback. |
| Proposal comparison `/proposals` | ✅ | Side-by-side totals, per-person price, validity, inclusions and exclusions; open the pinned document; ask a question in the thread. |
| In-app accept/decline | ✅ | Traveller accepts or declines a proposal; the agency sees the decline. |
| Verified badge | 🟡 | Manual human review by the platform operator; never publishes or unpublishes. |
| Reply-time signal | ✅ | Median of recent replies, hidden until at least five answered enquiries. |
| Ops moderation | ✅ | Hide/restore a profile or package with a reason; effective on listing, facets, URLs, assets and the enquiry form. |

## 7. Agency workspace

### 7.1 Shell and work

| Feature | Status | Notes |
|---|---|---|
| Separate agency login | ✅ | Workspace slug + email + password; separate realm, cookie and JWT. |
| Onboarding | ✅ | First-run setup for brand and team. |
| Sidebar workspace shell | ✅ | Grouped navigation, breadcrumbs, command palette, live counters. |
| Overview | ✅ | Today's work: enquiries, trips, events, invites, usage. |
| Trips library | ✅ | Search, status, destination, assigned staff and client filters. |
| AI trip planner in the workspace | ✅ | Same engine and editing features as the traveller product. |
| Client trip access | ✅ | Clients are invited through trip membership, never given staff access. |
| Archive lifecycle | ✅ | Archive and restore rather than destructive delete. |
| Enquiries inbox | ✅ | Split-view inbox with thread, proposals and actions. |
| Events | ✅ | Camps, group trips and retreats with public interest and a roster. |
| Clients | ✅ | Reusable client directory, linked to quotes and trips. |
| Team | ✅ | Invite, role change, remove, owner transfer, last-owner protection. |
| Operations | ✅ | Plan usage, export history and the tenant audit trail. |
| Settings | ✅ | Brand, assets, public profile, quote defaults, terms, contact and GSTIN. |

### 7.2 Quotes and commercial documents

| Feature | Status | Notes |
|---|---|---|
| Versioned quotes | ✅ | Draft/sent/accepted/cancelled; a sent quote is frozen; edits create a new version. |
| Server-computed totals | ✅ | Line items, markup, tax, discount, total and per-person; the browser never sends the final total. |
| Per-agency quote numbers | ✅ | Unique numbering per tenant. |
| Client-safe projection | ✅ | Internal cost, markup, expenses and prepared-by are stripped from client views. |
| Default terms | ✅ | Agency-level inclusions, exclusions, things to carry, cancellation and payment terms. |
| Client linkage | ✅ | Quote can be tied to a directory client. |

### 7.3 Templates and brand

| Feature | Status | Notes |
|---|---|---|
| Built-in HTML templates | ✅ | Client brochure and internal summary, designed for variable day counts and long text. |
| Custom HTML templates | ✅ | Validated against a versioned contract; no arbitrary JS or remote assets. |
| In-app HTML source editing | ✅ | Saves a new immutable version with assets carried forward. |
| Uploaded PDF designs | ✅ | Sanitised to a passive vector background; visual slot mapper; one repeat page per itinerary day; in-process pdf-lib rendering. |
| Preview before activation | ✅ | Rendered against a real trip; activation refuses unpinned versions. |
| Immutable versions | ✅ | Old exports stay pinned to the version they were rendered with. |
| One default per audience | ✅ | Enforced in service logic and tests. |
| Archive and restore | ✅ | Archived templates cannot be selected for new exports. |
| Brand assets | ✅ | Logo, mascot, fonts, colours and images; private and tenant-scoped; MIME- and size-checked. |
| Asset snapshotting | ✅ | A template pins the assets it was activated with. |

### 7.4 Exports and proposals

| Feature | Status | Notes |
|---|---|---|
| Branded PDF export | ✅ | Queued render jobs, two at a time, with retry and interrupted-job recovery. |
| Local Chrome or remote Gotenberg renderer | ✅ | Remote renderer is basic-auth protected and reports its mode on `/api/health`. |
| Signed downloads | ✅ | Short-lived HMAC-signed URLs; never public object URLs. |
| Export history | ✅ | Per-agency history with status and retry. |
| Export rate limits and plan quota | ✅ | Per-agency and per-user limits plus the monthly plan quota. |
| Proposal share links | ✅ | Minted only from a ready client export; pin quote + export; sha256 at rest; revocable and expiring. |
| Public proposal page | ✅ | Branded document, client-only quote summary, PDF download, accept without an account. |
| Atomic acceptance | ✅ | Idempotent `sent → accepted` transition, audited on both platform and tenant trails. |
| Live proposal documents | ✅ | Sent proposals can be answered in-app without waiting for an export. |

### 7.5 Events

| Feature | Status | Notes |
|---|---|---|
| Event library | ✅ | Draft/published/closed lifecycle, status filters, soonest-first. |
| Public event pages | ✅ | Dates, venue, capacity, price, highlights, cover; listed on Explore and the agency profile. |
| Interest form | ✅ | Per-event guest interest cap; duplicate and capacity guards. |
| Roster | ✅ | Pending-first roster, confirmation and decline counts, no roster action on drafts. |
| Lifecycle guards | ✅ | Cannot publish an ended event; closed events cannot be republished until reopened; under-review rows offer no close. |
| Pending-interest badge | ✅ | Nav badge driven by route changes. |

### 7.6 Limits, team and audit

| Feature | Status | Notes |
|---|---|---|
| Plan tiers | ✅ | `starter` (3 seats / 10 exports / 100 MB) and `pro` (15 / 100 / 1 GB), configurable by environment. |
| Server-side enforcement | ✅ | Seats checked on invite; exports and storage checked per write; clear 409s with the current limit. |
| Usage reporting | ✅ | Live seat, export and storage usage in Operations. |
| Per-agency overrides | ✅ | Admin console can override limits; blank fields inherit the tier. |
| Audit trail | ✅ | Append-only, tenant-scoped; members, templates, quotes, exports, trips and plan changes. |
| Roles | ✅ | Owner, admin, planner, viewer. |
| Seat and export exhaustion behaviour | ✅ | Invite fails with the current plan; exports answer 409 until the next month. |

## 8. Platform admin console

| Feature | Status | Notes |
|---|---|---|
| Separate platform login | ✅ | Third realm at `/admin/login`; separate cookie and JWT. |
| Overview | ✅ | Accounts, agencies, applications and shortcuts. |
| Account directory | ✅ | Every realm as separate rows; same-email accounts are never merged. |
| Agency provisioning | ✅ | Name, slug, plan, billing contacts, owner email; three rows in one compensatable operation. |
| Public application queue | ✅ | Approve (provisions) or reject with a note. |
| Tenant lifecycle | ✅ | Suspend (invalidates sessions, blocks login, fails public links closed) and reactivate. |
| Password reset | ✅ | One-time password, forced change, personal account untouched. |
| Plan and billing metadata | ✅ | Tier change, overrides, renewal date, contact, notes. |
| Directory moderation | ✅ | Verify/unverify, hide/restore profiles and packages with reasons. |
| Reported content | ✅ | Gallery report queue with auto-hide on three distinct reports; agency pages reviewed manually. |
| Platform audit | ✅ | Filters by action, target, date and free text; paginated with facets. |
| Platform admins | ✅ | Create, reset, disable; last-active-admin protection. |
| Bootstrap CLI | ✅ | Creates the first super-admin without opening public registration. |

## 9. Agency client setup (end-to-end)

| Step | Status | Notes |
|---|---|---|
| Public application form | ✅ | Rate-limited, honeypot, strict validation; creates no account or tenant. |
| Duplicate-email guards | ✅ | One agency account per tenant; duplicate pending applications refused. |
| Admin review queue | ✅ | Approve or reject with a note; every decision audited. |
| Approval → provisioning | ✅ | Reuses the same provisioning primitive as the console. |
| Direct provisioning | ✅ | Operator enters name, slug, plan, billing and owner details. |
| Owner-email preview | ✅ | Warns about personal/platform accounts; blocks an email that owns another workspace. |
| Three-row tenant creation | ✅ | Agency + owner agency account + owner membership, with compensating cleanup. |
| One-time temporary password | ✅ | Shown once, never retrievable; `Tv!` prefixed. |
| Forced first-login password change | ✅ | Temporary session is limited until the password changes, then invalidated. |
| Tenant-scoped sign-in | ✅ | `/agency/login?workspace=<slug>`. |
| Staff invites | ✅ | Owner/admin invites; seat capacity enforced. |
| Brand, templates, first trip, client, quote, export, share | ✅ | Documented as a ten-step handover checklist in the operations runbook. |
| Suspension and recovery | ✅ | Sessions invalidated; reactivation requires a fresh sign-in. |

## 10. Security, privacy and operations

| Feature | Status | Notes |
|---|---|---|
| Three isolated account realms | ✅ | Separate passwords, cookies, JWTs and authorization. |
| Tenant-scoped login | ✅ | Workspace slug disambiguates the tenant. |
| Per-tenant email uniqueness | ✅ | The same email can legitimately exist in several realms or tenants. |
| CSRF double-submit | ✅ | `X-CSRF-Token` on every write; all realm cookies are targets; bootstrap paths exempt. |
| Input validation | ✅ | Zod schemas on every route. |
| Rate limiting | ✅ | Auth, generation, collaboration writes, enquiries, applications and platform writes. |
| Security headers | ✅ | Helmet with a self-only script CSP and explicit map/image origins. |
| Upload verification | ✅ | Size cap + MIME allow-list + magic-byte check. |
| Token hygiene | ✅ | Invites, guest links and proposals stored as hashes with expiry. |
| Tenant isolation | ✅ | Every agency query carries the tenant id; cross-tenant ids return 404. |
| Route coverage test | ✅ | Walks the Express router and fails if a trip-scoped route lacks a guard. |
| Health endpoint | ✅ | Reports feature flags, live tiers, storage and renderer mode. |
| Kill switches | ✅ | `AGENCY_WORKSPACE_ENABLED`, `PLATFORM_ADMIN_ENABLED`; surfaces answer 404 without data loss. |
| Audit trails | ✅ | Platform and tenant, append-only, no secrets in metadata. |
| Backup/rollback runbook | ✅ | Documented; realm migration has a restore procedure. |

## 11. Responsive and accessibility

| Feature | Status | Notes |
|---|---|---|
| Mobile-first layout | ✅ | Tested from 320 px phones through 4K desktops. |
| Touch targets | ✅ | 44 px minimum on interactive controls. |
| Mobile navigation | ✅ | Drawer navigation; split-view inboxes collapse to one pane with a back action. |
| Keyboard and focus | ✅ | Visible focus rings, keyboard-activatable list rows, command palette. |
| Dark mode | ✅ | Theme initialisation and per-component dark styles. |

## 12. Deliberately not built

| Not built | Why |
|---|---|
| Payments, checkout, subscriptions, GST invoices, receipts | No gateway or billing domain exists; plan limits are enforced but not charged. |
| Transactional email and notifications | Invites, password handoff and proposals are copy-link by design; no mailer in the stack. |
| Self-serve agency signup, trials and upgrades | Agencies are provisioned by the platform operator; self-service was retired on purpose. |
| Full CRM (pipelines, tasks, commissions) | Out of scope for the first release. |
| Accounting and GST invoice generation | Separate concern from quoting. |
| DOCX/XLSX export | PDF is the delivered artefact; HTML and uploaded PDF designs cover the design need. |
| Visual drag-and-drop theme editor | HTML source editing and PDF slot mapping cover customisation; a full editor is deferred. |
| Automatic Canva/Figma/InDesign ingestion | A design is uploaded and mapped once, then reused; arbitrary conversion is not attempted. |
| AI-generated prices, legal or cancellation text | Commercial and legal copy stays agency-owned. |
| Chat export from the server | Trip chat is end-to-end encrypted, so the server cannot read or export it. |
| Bookings and deposits | The product sells proposals, not inventory. |
| Reviews, ratings, likes, follows, DMs | Deliberately excluded from the gallery and directory. |
| White-label domains and mobile apps | Later-stage concerns. |
| Production SLA | The current hosting is a free-tier pilot environment. |

---

## 13. Verification snapshot

- **Backend tests:** Node's built-in runner through `tsx`, with unit, integration and router-coverage suites registered explicitly in `backend/package.json`.
- **Frontend:** TypeScript typecheck, the WebCrypto key-backup interoperability suite (`npm run test:key-backup`), and production build are part of the release check.
- **Mobile:** `tsc --noEmit`, `expo lint`, and `npm run test:chat-recovery` (crypto and session suites) are part of the release check.
- **Smoke scripts:** agency A5–A9 security and lifecycle smokes, A6/A6f template smokes, the M9 launch gate, the chat-backup database smoke, and end-to-end browser passes for the traveller → enquiry → quote → proposal loop.
- **Milestones:** M4–M6 and M8–M10 complete. M7's shipped slice covers the conversation drawer, typing and unread state; its AI-bot participant remains future work. Agency A0–A9 and platform PA0–PA6 are implemented and verified locally. A real-agency pilot and production cutover remain the next gate.
