# TravelAI — market go report and subscription design

**Date:** 2026-10-28
**Status:** proposal for owner review — no pricing has been committed to customers
**Basis:** feature inventory read from the codebase (`docs/roadmap-*.md`, `backend/src/config/env.ts`, `backend/src/services/agency/plan.ts`, `frontend/src/App.tsx`), not from market research

Every number below is a hypothesis to validate with design partners, not a settled price.

---

## 1. Executive summary

TravelAI is three products sharing one itinerary engine:

1. **A consumer planner** — AI generation, collaboration, expenses, gallery.
2. **A collaboration layer** — members, roles, invites, comments, polls, decisions, live presence.
3. **An agency workspace** — clients, quotes, proposals, branded PDF exports, templates, team, audit, plan limits.

**Recommendation: charge for the agency workspace first.** It already has the full value chain a tour operator pays for (client → quote → proposal → accepted proposal → branded document), the plan-limit enforcement is built, and the buyer has a budget line. Consumer subscriptions should wait — the consumer app is the acquisition funnel, not the revenue line.

The subscription *architecture* is ~70% done: tiers, limits (seats / monthly exports / storage), live usage, per-agency overrides, platform-admin console, suspension. What is missing is **money**: checkout, GST invoicing, transactional email, trials, self-serve plan changes, and reliability a paying customer will accept.

**Launch shape:** three workspace tiers (Solo / Studio / Agency) with a 14-day card-less trial, priced per workspace with seat expansion and a metered monthly export quota — the export quota is already the enforced unit, so it can ship without new metering infrastructure.

---

## 2. What ships today (and why it matters commercially)

| Area | Shipped now | Commercial relevance |
|---|---|---|
| AI planning | Dual-provider streaming generation (Gemini/Groq), 9 Indian languages, prompt variants, response cache | Cost centre; keep free or cheap |
| Trip editing | Inline day edits, activity reorder, version history + restore | Table stakes |
| Curation | Editors add/edit/remove stays and food spots per day (prices stay private to the trip) | Agency differentiator; just shipped |
| Maps & routes | OpenStreetMap/Leaflet, routing, weather-aware day swaps | "Looks more thoughtful than a Word doc" |
| Expenses | Splitting, participants, multi-currency, receipts | Group/consumer retention |
| Collaboration | Members, roles (owner/admin/planner/viewer), invites, comments, polls, decisions, presence, chat drawer, versions | The reason a *team* buys seats rather than one licence |
| Gallery | Publish trips, traveler profiles, explore, join requests, clone, reports/moderation | Acquisition + social proof; no price leakage (prices stripped) |
| Consumers | Share links, feedback, print/PDF | Free funnel |
| Agency — clients | Client directory, link a quote to a client | Sticky account data |
| Agency — sales | Quotes, proposals with public token links, accept endpoint, proposal PDF | **The monetisable workflow** |
| Agency — output | Branded PDF exports, HTML templates, uploaded PDF design templates with a slot mapper, assets, Cloudinary storage | What an agency would otherwise pay a designer for |
| Agency — team | Invites, roles, audit log | Seat expansion revenue |
| Agency — limits | `starter` (3 seats / 10 exports / 100 MB), `pro` (15 / 100 / 1 GB), live usage, ops overrides | Billing rails already exist |
| Platform admin | Provisioning, plan + billing metadata, suspension, accounts, moderation reports, platform audit | Sales-assisted provisioning already works |
| Infra | Render free tier app, Gotenberg renderer, no cron, no persistent disk | **Blocks a paid SLA** |
| Missing | Payments, invoices, email, trials, self-serve upgrades, DOCX export | See §3 |

Today agencies are **provisioned by platform admin**; self-service agency creation was deliberately retired (PA0). That is fine for a pilot and wrong for scale — it makes the first 20 customers a sales motion, which is acceptable, but the trial funnel has to exist before the 50th.

---

## 3. What must change before we charge

### P0 — blockers for taking money (in build order)

| # | Change | Why | Code anchor |
|---|---|---|---|
| 1 | **Subscription + payment domain**: `AgencySubscription` (gateway id, status, period, seats, add-ons), Razorpay subscriptions with UPI Autopay / card mandates, webhook controller, idempotent events | There is no gateway code today; tier changes are an admin action only | `Agency.plan`, `normalizeAgencyPlanChange` in `services/agency/plan.ts`; `admin/agencies` routes |
| 2 | **GST invoices + receipts** (PDF, invoice series, GSTIN, place of supply, SAC 9985) | Indian B2B buyers need a tax invoice to expense it | `IAgencyBilling` already carries `taxId`; reuse the PDF stack |
| 3 | **Transactional email** (trial ending, invite, proposal sent, quota 80%, payment failed, receipt) | Invites are link-copy only; dunning is impossible without email | New email service; invite/proposal flows are the call sites |
| 4 | **Agency billing surface**: current plan, usage meters (Operations already shows usage), upgrade/downgrade, invoice history, cancel | Customers cannot currently see or change what they pay for | `getAgencyUsage` already exists; add plan card in Agency settings |
| 5 | **Trial + entitlement state machine**: 14-day trial, 80% quota warnings, grace week on failed payment, downgrade rules (over-seat → invites blocked, data retained) | Quota enforcement today hard-409s with exact numbers — good for warnings, bad as a first impression on day 1 of a trial | `assertSeatAvailable`, `assertExportQuota`, `assertStorageQuota` |
| 6 | **Reliability for paying tenants**: no sleeping instance, Mongo backups, renderer redundancy, status page, support inbox with a stated response time | Render free tier + a single renderer is a pilot environment, not a ₹4k/month promise | `render.yaml`, export recovery |
| 7 | **Legal**: Terms, privacy notice (DPDP Act 2023), DPA for agency client data, refund policy, data export/deletion | Proposals carry client PII | `/guidelines` page exists; needs real policies |
| 8 | **Product analytics**: signup → first trip → first proposal → first export → accept | Cannot price, prove ROI or diagnose churn without it | Instrument during the pilot |

### P1 — what makes the tiers worth upgrading for

Ordered by willingness to pay, based on what the agency workflow already implies:

1. **Proposal intelligence** — link opens, view time, accept/decline with a reason. This turns the tool into a sales asset and is cheap to build on the existing token routes.
2. **WhatsApp delivery** of proposal links (WhatsApp Business API). Indian clients read WhatsApp, not email.
3. **Branding depth** — agency logo, colours, cover, custom share domain, "remove TravelAI footer" on paid plans. `brand.ts` and template versions already support most of the plumbing.
4. **DOCX export** — agencies still edit in Word; PDF-only is a real objection. Deferred in the roadmap (§7.5); promote it.
5. **Reusable itinerary blocks** — save a day/cluster and apply it to another client. This is the single biggest time saver for repeat destinations.
6. **Multi-currency quotes** — finance/currency code already exists; packaging into quotes is small.
7. **Client portal** — the client sees the proposal, comments, and accepts in one place; today it is a token link + PDF.

### P2 — expansion, not launch

- Gallery → **lead inbox** for agencies (join requests already exist; this is the marketplace seed).
- Traveller deposits/payments — regulated, high effort, do not start here.
- Enterprise SSO, dedicated renderer, DPA-lite, onboarding services.

### What *not* to build yet

Consumer subscriptions, a mobile app, a public API, an AI chat upsell, and a full booking/CRM. None of them move the first ₹1 lakh of MRR; all of them dilute the agency wedge.

---

## 4. Who pays

**Primary ICP:** small Indian inbound and domestic tour operators / boutique travel designers — 1–15 planners, 20–200 custom itineraries a year, currently producing proposals in Word, Canva and WhatsApp.

**Secondary:** independent trip designers and honeymoon specialists (single seat, high output).

**Tertiary (12+ months):** DMCs and larger holiday companies — enterprise pricing, SSO, multiple brands.

**Positioning:** "The workspace where a travel team turns a client brief into a branded, accepted itinerary — together, in minutes." Not "AI itinerary generator" (commoditised), not "OTA" (different game).

**Why us:** the combination is unusual — AI drafting + real collaboration + branded document output + role-based team + quota-enforced tenancy. Competitors are either marketplaces (no workflow) or single-player itinerary builders (no team, no brand output).

---

## 5. Subscription design

### Principles

1. **Charge for client-facing output and seats, not AI tokens.** AI cost is ours to manage; the agency buys proposals and time saved.
2. **Workspace-level plan with seat expansion** — the collaboration work is the moat; per-seat-only pricing punishes inviting a colleague.
3. **Exports are the metered unit.** One "export" = one client-ready proposal document, which is already counted and already enforced per month.
4. **INR, GST extra, monthly and annual** (annual = 10 months).
5. **Free consumer tier stays**; the gallery is the funnel, not a paid product.

### Recommended tiers (hypotheses to test)

| | **Solo** | **Studio** *(core)* | **Agency** | **Enterprise** |
|---|---|---|---|---|
| Monthly / Annual (₹, +18% GST) | 1,499 / 14,990 | 3,999 / 39,990 | 8,999 / 89,990 | custom |
| Seats | 1 | 5 | 20 | custom |
| Client-ready exports / month | 30 | 150 | 600 | custom |
| Storage | 2 GB | 15 GB | 60 GB | custom |
| Clients & quotes | ✓ | ✓ | ✓ | ✓ |
| Branded PDF (HTML templates) | ✓ | ✓ | ✓ | ✓ |
| Uploaded PDF design templates | — | ✓ | ✓ | ✓ |
| Custom branding / footer removal | — | ✓ | ✓ | ✓ |
| Proposal insights | — | ✓ | ✓ | ✓ |
| DOCX export | — | ✓ | ✓ | ✓ |
| Audit log | — | ✓ | ✓ | ✓ |
| Priority support | — | — | ✓ | ✓ |
| SSO / DPA / dedicated renderer | — | — | — | ✓ |

**Add-ons:** extra seat ₹399/mo · export top-up ₹299 per 25 · storage ₹99 per 10 GB. **Trial:** 14 days of Studio, 10 exports, no card required (UPI Autopay is a strong Indian default at conversion time).

**Mapping to the code:** the limits live in `AGENCY_PLAN_TIERS` (env), so this is a config change plus a rename/migration of existing `starter`/`pro` agencies — `solo ↔ starter`, `studio ↔ pro`, `agency` new. Enforcement points do not change.

### Rejected alternatives

| Model | Why not |
|---|---|
| Pure per-seat (₹499/seat) | Punishes exactly the behaviour we built for; seats saturate at 2 and MRR stalls |
| Pure usage (₹ per export) | Unpredictable for a seasonal business; agencies budget per month, not per document |
| Consumer-first subscription | The consumer app has no proven retention loop; charging now would throttle the gallery funnel |
| One flat ₹999 plan | Leaves money on the table at 10+ seats, and gives no upgrade path when an agency grows |

### Consumer Pro (deferred)

If consumer monetisation is attempted later, start with ₹399/mo (₹2,999/yr): unlimited AI trips, watermark-free exports, gallery publishing, priority generation. Do not launch it before there are three months of retention data — a paid tier on an unretained funnel converts the wrong signal.

---

## 6. Go-to-market plan

### Phase 0 — design partners (now → Dec 2026)

- Recruit **3–5 agencies** through the founder network and Instagram/Google Maps outreach to small operators.
- Free, fully instrumented, with weekly check-ins. Deliverable per agency: **one real branded proposal sent to a real client in week one.**
- Success gate: 3 agencies sending ≥3 proposals/week, 2 written case studies, a ranked list of objections (branding, Word, WhatsApp, price).

### Phase 1 — paid beta (Jan → Mar 2027)

- 10–20 agencies at **50% off for 3 months**, invoiced manually via Razorpay payment links while checkout is built; annual prepay offered at beta pricing to fund the build.
- Onboarding is concierge: brand + template + one past itinerary imported in a 30-minute call. Activation target: **first export within 48 hours**.
- Success gate: ≥35% trial/provisioned → paid, ≥60% of quota used by month two, <3% monthly logo churn.

### Phase 2 — launch (Apr → Sep 2027)

- Self-serve trial behind a waitlist (agency provisioning stays assisted but fast).
- Channels, in priority order: (1) published gallery itineraries as SEO landing pages for destination + "sample itinerary" queries; (2) travel creators who plan for audiences; (3) regional agency associations and trade meetups; (4) referral — one free month per referred agency that pays.
- Publish a public pricing page with the trial CTA; add ROI framing ("one extra booking pays for the year").

### Phase 3 — expansion (Oct 2027+)

- Enterprise tier, lead marketplace from gallery traffic, multi-brand workspaces.

---

## 7. Pricing operations & finance

- **GST:** 18% on SaaS; invoice needs GSTIN, legal name, address, place of supply, SAC 9985, and a sequential invoice series. Store `taxId` (already modelled) and validate format at checkout.
- **Annual prepay:** recognise monthly; issue one invoice for the term.
- **Failed payment:** 7-day grace with in-app banner + email; then exports pause (data retained, read-only) — never delete a paying customer's itineraries.
- **Downgrade:** if seats exceed the new limit, invites are blocked and existing members stay until the next renewal; exports fall to the new quota immediately with a 30-day warning.
- **Abuse:** an agency reselling exports to non-clients is fine at this stage; a single account generating hundreds of exports/day is not. Add per-account generation and export rate limits before launch (some limiters already exist).
- **AI cost:** cap generations per seat per day; the cache already removes repeat cost. Track cost per accepted proposal — this is the number that decides whether the margins work.

---

## 8. Metrics to run the business on

| Metric | Why | Hypothesis target (first two quarters) |
|---|---|---|
| Activation: first export ≤48h | Predicts everything downstream | ≥70% of provisioned agencies |
| Proposals sent per active agency per week | Depth of use | ≥3 by week four |
| Proposal acceptance rate (via `/accept`) | Proves the output sells | ≥40% |
| Export quota utilisation (median) | Are tiers priced right? | 40–70% (100% = raise the tier) |
| Seat saturation | Expansion revenue | ≥60% of seats used by month three |
| Trial → paid | Funnel health | ≥35% |
| Logo churn | Product-market fit | ≤2.5%/month |
| NRR | Seat + tier expansion | ≥110% |
| CAC payback (assisted sales) | Can we afford reps? | <6 months at ₹4k ARPU |

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AI cost per generation vs ₹ pricing | Margin erosion | Per-seat generation caps, cache, cost-per-proposal dashboard |
| Free-tier hosting, single renderer, no cron | Paid customers hit outages or stuck exports | Paid instance, backups, renderer redundancy, status page before Phase 1 |
| No email | Onboarding and dunning impossible | P0 #3; until then, WhatsApp/manual for pilot |
| DPDP / client PII in proposals | Legal exposure | Consent copy, retention policy, deletion path, DPA |
| Gallery quality | Brand risk if weak itineraries are public | Moderation exists; publish a quality bar and keep the 5-trip nav gate |
| Seasonality (Oct–Mar peak) | Cash-flow troughs | Annual plans, off-season content and template packs |
| OTA/competitor bundling | Price pressure | Compete on branded output + team workflow, not AI novelty |
| Reselling/gaming | Quota abuse | Rate limits, anomaly alerts, manual review above a threshold |

---

## 10. Open decisions for the owner

1. **Agency-first for two quarters** — recommended yes; consumer monetisation deferred.
2. **Card-less trial** — recommended yes (UPI Autopay at conversion).
3. **Export quota as the billable unit** — recommended yes; it maps to the value delivered and is already enforced.
4. **Price points** ₹1,499 / ₹3,999 / ₹8,999 — validate with 10 agency interviews before publishing.
5. **Keep the gallery public during the pilot** — recommended yes, curated; it is the only zero-cost acquisition channel that exists today.

---

## 11. 90-day sequence

| Weeks | Work |
|---|---|
| 1–2 | Analytics instrumentation; recruit design partners; draft Terms/Privacy/DPA |
| 3–4 | Subscription model + Razorpay integration (behind a flag); invoice PDF |
| 5–6 | Agency billing surface (plan, usage, invoices, upgrade CTA); trial state machine + quota warnings |
| 7–8 | Transactional email; dunning + grace flow; reliability uplift (instance, backups, status page) |
| 9–10 | Two design-partner case studies; onboarding runbook (30-minute concierge); pricing page copy |
| 11–12 | Paid beta opens at 50%, manual payment links; measure activation, proposals/week, quota use |
