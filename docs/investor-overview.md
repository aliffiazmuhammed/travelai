# TravelAI — travel discovery and the agency sales workspace

**Prepared:** 2026-10-30 · **Positioning updated:** 2026-10-30
**Stage:** pre-pilot. Discovery surfaces, the agency workspace and the platform console are built and locally verified; a real-agency pilot and production cutover are the next gate.
**What this document is:** a plain-language description of the product as built and the business it is now pointed at. It contains no financial projections and no committed pricing.

---

## 1. The one-page version

TravelAI is a **travel discovery network with a commercial back end for agencies**.

Travellers come to find something worth doing: an agency that plans their kind of trip, a real trip another traveller has shared, or an event with spots open. Agencies come to be found — and to turn that attention into a priced, branded proposal without leaving the product.

The product has three surfaces that feed each other:

1. **Discover** — a directory of agencies, snapshot package cards, dated events, and a gallery of trips real people have published.
2. **Decide** — ask to join a trip, take a copy, or plan one from scratch with AI; collaborate, map it, cost it.
3. **Deliver** — the agency receives the enquiry in-app, replies, converts it to a client, builds a quote, generates a branded proposal, and sends a link the client can accept without an account.

**Why this shape.** AI itinerary generation on its own is commoditised: every assistant can produce a plan, users expect it to be free, and there is no supply, reputation or transaction to defend. Discovery is different. It accumulates things a competitor cannot copy overnight — listed businesses, published trips, events, verified badges, reply-time signals and the conversations between them. The agency workspace is where that attention becomes money: seats, proposals and storage are already counted and enforced.

**What already works, end to end:**

- A visitor can browse agencies, packages, events and shared trips without an account.
- A traveller can request to join a shared trip or clone it into their own draft.
- A traveller can send an agency a real enquiry and hold the conversation in-app.
- The agency can reply, convert the lead to a client, quote it, generate a proposal and send a token link the client accepts without an account.
- The platform operator can onboard the agency, set its plan, moderate its public listing and audit every action.

**What does not exist yet:** payments, invoices, transactional email, self-serve upgrades and a production SLA. Those are the bridge between "works" and "chargeable", and they are deliberately out of scope for the current build.

---

## 2. Why we moved away from "AI trip generator"

The original pitch was a better itinerary generator. It is a good feature and a weak company.

- **The output is commoditised.** General assistants generate itineraries, maps and budgets. A marginally better prompt is not a moat.
- **Willingness to pay is low.** Travellers plan a handful of trips a year and expect planning to be free. A consumer subscription for itinerary text is a hard sale.
- **There is no supply lock-in.** A generated itinerary creates no inventory, no reputation and no reason for a business to stay.
- **There is no transaction.** The plan ends in a text file; the money changes hands somewhere else.

The pivot keeps the engine and changes the front door. **Discovery creates the reason for a trip to exist; planning makes it real; the agency workspace captures the commercial value.**

What changed in the product, not just the story:

- The landing page now leads with **people, trips and events**, with AI planning as the door you take when nothing fits.
- **Explore** is built around "find a trip you'd like to join", not "generate a trip".
- **`/agencies`** is a browsable business directory with packages, events and enquiry forms.
- AI generation remains a first-class capability, but it sits behind discovery and collaboration rather than in front of them.

This is a positioning and product-focus change. Nothing that travellers already use was removed.

---

## 3. The three surfaces and the loop between them

```text
        ┌──────────────────────────────────────────────────────────┐
        │                        DISCOVER                          │
        │  agency directory · packages · events · shared trips     │
        └───────────────┬──────────────────────────┬───────────────┘
                        │                          │
             traveller interest              traveller publishes
                        │                          │
                        ▼                          │
        ┌──────────────────────────┐               │
        │         DECIDE           │               │
        │ join · clone · plan (AI) │               │
        │ collaborate · map · cost │               │
        └────────────┬─────────────┘               │
                     │                             │
             asks an agency                     shares the trip
                     │                             │
                     ▼                             │
        ┌──────────────────────────┐               │
        │         DELIVER          │               │
        │ enquiry → quote →        │               │
        │ proposal → accepted      │               │
        └────────────┬─────────────┘               │
                     │                             │
              published trip ──────────────────────┘
```

Every trip can become public proof: a shared itinerary, a traveller profile, an event recap, or a package an agency turns into its next storefront card. That is the loop: **supply creates discovery, discovery creates demand, demand creates transactions, transactions create more supply.**

The loop is deliberately local and segment-specific. A traveller looking for a Himalayan trek does not care about a Goa beach package; the directory's city, destination, specialty and language facets are how relevance is expressed today.

---

## 4. The demand side: what a traveller can do

### 4.1 Discover without signing up

- Browse the **agency directory** by city, destination, specialty and language.
- Open an **agency profile**: about, base city, destinations, services, languages, contact, logo and upcoming events.
- See **package cards**: a title, nights, highlights, inclusions, a cover, and either a "from" price or "on request". The card is a snapshot — editing the source trip later cannot break the listing.
- See **events**: camps, group trips and retreats with dates, venue, capacity, price and spots remaining.
- Browse the **gallery**: real trips published by real travellers, with exact dates or just the month, and a traveller profile behind each one.
- See **trust signals**: a human-reviewed verification badge and a "usually replies in ~X h" line that stays hidden until an agency has answered at least five enquiries.

### 4.2 Find a trip socially

- **Request to join** a shared trip. The owner decides; approval grants commenter access only, never edit rights.
- **Clone** any published trip into an editable draft of their own.
- **Open a traveller profile** to see what that person has published.
- **Report** content that should not be public. Three distinct open reports auto-hide a gallery trip pending review; agency pages are reviewed manually.

### 4.3 Plan, together

- Start from a clone, or start fresh with the AI planner: six steps, nine languages, real maps, weather-aware days and nearby places.
- Invite people with owner, editor, commenter and viewer roles; comment, poll and decide in one thread.
- Track money with a real expense ledger, splitting, settlement and receipts.
- Keep version history so a plan can be rolled back.

### 4.4 Buy with confidence

- Send a **signed-in enquiry** to an agency with dates, party size, budget band and a message.
- Read and reply in-app, or through a private 90-day link if the thread is shared with someone who is not signed in.
- Compare live proposals side by side: total and per-person price, validity, inclusions and exclusions.
- Open the exact pinned proposal document or PDF, ask a question in the thread it answers, then **accept or decline in-app**.
- Accept a proposal from a token link without creating an account.

---

## 5. The supply side: what an agency gets

An agency does not just get a listing. It gets a **storefront in front of demand** and a **sales desk behind it**.

| Layer | What the agency gets |
|---|---|
| **Storefront** | A public profile with readiness gating, package cards, dated events, a verification badge and a computed reply-time signal. |
| **Demand** | Directory enquiries in an in-app inbox: claim/assign, reply, move through `new → replied → quoted → won/lost`. Transactional email mirrors key events when a provider is configured; the inbox itself never depends on it. |
| **Conversion** | One-click conversion of a lead into a client, with a quote hand-off and a trip start. |
| **Sales documents** | Versioned quotes with server-computed totals; branded PDF proposals from built-in, custom HTML or uploaded PDF designs; token links the client can accept without an account. |
| **Delivery** | The full itinerary engine — AI generation, maps, weather, editing, versions, expenses — scoped to the agency and its invited client. |
| **Events** | Publish camps, group trips and retreats, collect traveller interest, manage a roster and close the booking window. |
| **Team** | Owner, admin, planner and viewer roles; hashed invites; seat limits; last-owner protection; owner transfer. |
| **Operations** | Plan usage, export history, tenant audit trail, suspend/reactivate, password resets. |
| **Commercial rails** | Plan limits already enforced server-side: seats, monthly PDF exports and storage. |

Publishing is a **readiness check**, not a toggle. No description, city, destination, service or logo means no listing. That is deliberate: the directory's value is that everything in it is a real, complete business.

---

## 6. How an agency becomes a TravelAI client

There are two entry paths into the same provisioning primitive. Both produce an identical tenant: an agency row, an owner account in the agency realm, and an owner membership.

```text
Public application                    Direct onboarding
(agency asks)                         (operator invites)
      │                                      │
      ▼                                      ▼
Platform admin reviews  ───────────►  Provision agency
      │                                      │
      └──────────────┬───────────────────────┘
                     ▼
        Agency + owner account + membership
        + one-time temporary password
                     ▼
        Owner signs in at /agency/login?workspace=<slug>
                     ▼
        Forced password change → storefront + workspace
```

### 6.1 Path A — the agency applies

1. **Application.** The agency fills in a short public form at `/agencies/apply`: agency name, phone, email and an optional note. It is rate-limited per IP and per email, honeypot-protected and strictly validated.
2. **Guard rails.** An email that already owns an agency workspace is refused immediately — one agency account belongs to exactly one tenant. A second pending application for the same email is also refused.
3. **What it does not do.** Submitting an application creates no account, no tenant and no password. It is a row of intent.
4. **Review.** The operator sees it in the admin console's Applications queue and approves or rejects it with a note. Every decision is audited.
5. **Approval.** Approving calls the same `provisionAgency` primitive used for hand-onboarded agencies, so a self-applied agency is indistinguishable from any other tenant afterwards.

### 6.2 Path B — the operator provisions directly

1. The operator signs in at `/admin/login` (a third, separate account realm).
2. Opens **Agencies → Provision agency** and enters:
   - agency name and workspace slug (or generate one),
   - a plan tier,
   - optional billing contacts,
   - the owner's email and name.
3. Before submitting, the console previews what will happen to that email: it warns if a personal or platform account already uses it (the new agency account is still separate), and blocks the request if the email already belongs to another agency workspace.
4. On submit, one operation writes three durable rows — the `Agency`, the owner's **agency** account and the owner membership — with compensating cleanup if any step fails. It never converts or attaches a personal account.

### 6.3 The credential handoff

- The success dialog shows the workspace URL, the owner email and a **one-time temporary password**. It is not retrievable after the dialog closes.
- The owner opens `/agency/login?workspace=<slug>`, signs in, and is **forced to choose a new password** before reaching the workspace. The temporary session is invalidated on change.
- If the password is later forgotten, the operator resets it from the tenant drawer; the reset issues another one-time password and forces another change. A personal account with the same email is untouched.

That is the "agency client setup" in one sentence: **the operator creates the tenant, hands over a one-time credential, and the owner chooses their own password on first sign-in — landing in a storefront that can receive demand on day one.**

---

## 7. The agency's first day, step by step

The onboarding runbook is a checklist the operator can walk the owner through. It is ordered storefront-first, because the point of the platform is to be found.

1. **Sign in and change the password.** Forced on first login.
2. **Learn the workspace.** The sidebar groups Work (overview, enquiries, events, trips), Relationships (clients), Studio (templates) and Workspace (team, operations, settings). Overview shows today's work.
3. **Set the brand.** Logo, mascot, fonts, colours, contact, address and GSTIN. Assets are private and tenant-scoped; wrong file types and oversized files are rejected at upload.
4. **Complete the public profile.** About, base city, destinations, specialties, services and languages. This is what makes the agency findable — incomplete profiles cannot publish.
5. **Publish packages and events.** Turn a trip into a snapshot package card; publish camps, retreats or group departures with dates and capacity.
6. **Pick the proposal design.** Keep a built-in template, upload an HTML design, or upload a finished PDF design and map its slots. Preview against a real trip before activating.
7. **Create the first trip.** Generate with AI inside the workspace, then edit, map, price and share exactly as a traveller would.
8. **Add the client and the quote.** Link a client record, fill line items, markup, tax, validity and terms. Totals are computed server-side; the browser never supplies the final number.
9. **Export the proposal.** Choose the client template, confirm the quote, preview, generate. The job queues, renders two at a time, and appears in Export history. Downloads use short-lived signed URLs.
10. **Send the link and hand over.** Mint a proposal link from the ready client export; the client sees only client-safe data and can accept without an account. Confirm the owner can run the loop alone before the operator steps away.

---

## 8. What platform operations can do

The admin console is a third account realm at `/admin`. It never reads tenant content — no trips, quotes, clients or chat — only metadata, usage and audits.

| Capability | What it does |
|---|---|
| **Overview** | Counts and shortcuts across accounts, agencies and the application queue. |
| **Accounts** | Search every account across all realms; same-email personal / agency / platform rows stay separate identities, never merged. |
| **Agencies** | Provision a tenant; view plan, billing metadata and usage; change plan or override limits; suspend and reactivate; reset an agency password; invite/change/remove members; transfer ownership. |
| **Applications** | Review the public intake queue; approve (which provisions) or reject with a note. |
| **Public directory** | Verify or unverify a badge; hide or restore a profile or a package with a reason. A takedown is effective on the listing, facets, direct URLs, logos, covers and enquiry forms, and never overwrites the agency's own draft/published choice. |
| **Reported content** | Review traveller reports. Three distinct open reports auto-hide a gallery trip; agency pages are reviewed manually. |
| **Audit** | Filter platform events by action, target, date and free text. Tenant-visible platform changes also appear in the tenant's own audit. |
| **Platform admins** | Bootstrap the first super-admin from the CLI, create more, reset passwords, disable. The last active super-admin cannot be disabled. |

Two independent kill switches exist: `AGENCY_WORKSPACE_ENABLED` and `PLATFORM_ADMIN_ENABLED`. When either is off, its routes answer `404` exactly like an unknown path, the SPA hides the surface automatically from the health payload, and no data is deleted.

---

## 9. Trust, security and isolation

Discovery only works if people trust what they find. These are structural properties, not policy promises:

- **Three account realms, three sessions.** Personal, agency and platform accounts have separate cookies, separate JWTs and separate passwords. Logging into one never authorizes another. The same email may exist in all three, and in multiple tenants, as separate records.
- **Tenant isolation.** Every agency query includes the tenant id; cross-tenant ids return `404`, not `403`. A personal dashboard never returns an agency trip, and an agency route never returns a personal trip.
- **CSRF.** A double-submit cookie plus `X-CSRF-Token` on every state-changing request. Every realm's session cookie is a CSRF target, so an agency or platform session cannot inherit the personal realm's exemption.
- **Token hygiene.** Proposal, invite and guest-link tokens exist once at creation; rows store only a SHA-256 hash and an expiry. Unknown, expired and revoked tokens return the same generic `404`.
- **Public payloads are allow-lists.** Gallery, directory, package, event and proposal projections are separate modules pinned by key-set tests. Money, internal costs, member identities and chat never leave the server on a public route.
- **Chat is end-to-end encrypted.** The server cannot read trip chat, and the product never promises to export it.
- **Chat recovery is opt-in, and its trade-off is stated.** A traveller can wrap trip keys under their password plus a one-time recovery code, then restore readable history on a new device. The server stores only sealed wrappers and never receives the account key or recovery code. Because the sign-in server does receive the password, this is not zero-knowledge recovery, and the UI says so. History no remaining device can open is not recoverable.
- **Uploads are verified.** Size-capped, MIME-allow-listed and magic-byte checked; a renamed executable is rejected.
- **Template sandbox.** Custom HTML follows a closed, logic-light contract: no arbitrary JavaScript, no server-side code, no remote asset fetch. Uploaded PDF designs are rebuilt as passive vector backgrounds with scripts, forms, actions and attachments dropped.
- **Moderation exists from day one.** Report queue, auto-hide for gallery trips, manual review for agency pages, ops delisting with reasons, and an audit trail on both sides.
- **Kill switches.** The workspace and the platform console can each be switched off without a frontend deploy and without deleting data.

---

## 10. Architecture and hosting

- **Frontend:** React 18, TypeScript, Vite, Tailwind, shadcn/Radix, React Router with lazy routes.
- **Backend:** Node.js, Express 5, TypeScript, Mongoose/MongoDB, Zod validation, Helmet, rate limiting.
- **AI:** Gemini 2.5 Flash primary; Groq fallback; streaming SSE; TTL prompt cache; heuristic quality scoring. AI is the assembly layer behind a trip, not the business.
- **Documents:** HTML→PDF through a local Chrome binary or a remote Gotenberg service (basic-auth protected). Uploaded PDF designs render in-process with pdf-lib, so they need no browser.
- **Storage:** Cloudinary when configured, otherwise local private directories. Tenant bytes are never served from a guessable public path.
- **Deployment:** one Render web service serving both the API and the built SPA, plus a separate Gotenberg renderer service. Health check at `/api/health`; live tiers enabled in the blueprint; no cron and no persistent disk on the free plan.
- **Tests:** Node's built-in runner via `tsx` for backend units, integration and route-coverage tests (a router-walking test fails the build if a trip route loses its guard), plus frontend typecheck, shared mobile/web key-backup interoperability vectors, a mobile chat-recovery suite and production builds.

The hosting choices are deliberate pilot economics, not a claim of production SLA. A paying customer needs a non-sleeping instance, database backups and a redundant renderer; those are listed as prerequisites before charging.

---

## 11. Build status: shipped vs pending

| Area | Status |
|---|---|
| Consumer planning: AI generation, maps, weather, nearby, editing, versions | Shipped |
| Collaboration: roles, invites, comments, polls, decisions, presence, encrypted chat with optional account recovery | Shipped |
| Money: expenses, multi-currency, splitting, settlement, receipts | Shipped |
| Social discovery: gallery, traveller profiles, join requests, clone, reporting | Shipped |
| Agency discovery: directory, facets, profiles, packages, events | Shipped, content-gated at five published profiles |
| Enquiries: in-app inbox, two-way threads, live tier, proposal comparison, accept/decline | Shipped |
| Agency workspace A0–A9: tenancy, trips, brand, quotes, exports, templates, proposals, limits, audit | Implemented and verified locally, including a simulated pilot |
| Platform console PA0–PA6: realms, provisioning, applications, lifecycle, moderation, audit | Implemented and verified locally |
| **Real-agency pilot and production cutover** | **Pending — the next gate** |

**Not built, deliberately:**

- Payments, billing automation, GST invoices and receipts.
- Transactional email and a notification centre; invites and proposal links are copy-link only.
- Self-serve plan changes and trials.
- A visual theme editor for HTML templates (HTML source editing and PDF slot mapping do exist).
- DOCX/XLSX export; full CRM; accounting; white-label domains; mobile apps.
- Automatic ingestion of arbitrary Canva/Figma/InDesign files; a design is uploaded and mapped once, then reused.

---

## 12. Commercial model — not finalized

This section describes the *shape* of the business, not a price list. No price has been quoted, invoiced or committed to a customer.

- **Who pays:** the agency, per workspace. Discovery and planning stay free for travellers; they are what make the workspace worth paying for.
- **What is metered:** the platform already enforces three limits — seats, monthly PDF exports and storage. These are the natural billing units because the product already counts and enforces them.
- **What exists today:** two plan presets in configuration — `starter` (3 seats, 10 exports/month, 100 MB) and `pro` (15 seats, 100 exports/month, 1 GB) — plus per-agency overrides and live usage reporting. No price is attached to either preset.
- **Why not consumer subscriptions:** the consumer app is the demand engine. Charging travellers for itinerary text would shrink the audience the agencies are paying to reach.
- **What is missing before money can be taken:** a payment gateway, GST invoicing, transactional email, trial and entitlement state, a customer-facing billing surface, and production reliability.

An internal pricing proposal exists at `docs/market-go-and-pricing.md`. It is explicitly marked as an unapproved hypothesis for owner review and must not be presented as a committed price.

---

## 13. What comes next

1. **Pilot with real agencies that list.** Two to three agencies complete a storefront, receive a real enquiry, quote it and send a proposal without developer help. That is the acceptance test the simulated pilot cannot replace.
2. **Reach directory supply.** Clear the launch gate: five published and verified profiles, each with a priced package, and one answered test enquiry. Only then should the directory be advertised.
3. **Production cutover.** Back up, rehearse on a copy, bootstrap the first platform admin, provision the pilot tenant, enable the two flags.
4. **Billing rails.** Payments, invoices, email and a billing surface — in that order.
5. **Reliability for paying tenants.** Non-sleeping instance, backups, renderer redundancy, status page and a support channel.
6. **Then widen discovery.** More agencies, more events, more shared trips, and the reputation data that makes the directory useful at scale.

---

## 14. Honest constraints

- **No paying customers yet.** Discovery, the agency workspace and the console are built and locally verified; the real-agency pilot has not run.
- **Discovery has a cold-start problem.** The directory is gated at five published profiles for a reason: a two-agency directory is not useful and should not be advertised. Supply has to be recruited before demand is marketed.
- **Social surfaces need moderation.** Reporting, auto-hide and manual review are built, but a consumer community needs active operations, not just features.
- **Free-tier hosting is a pilot environment.** The app and renderer can sleep; there is no persistent disk unless Cloudinary is configured; there is no cron.
- **Transactional email is built but off by default.** Invites, password resets, enquiries and decisions can be emailed through Resend, but the pilot runs with `EMAIL_ENABLED` off until a sending domain and key are configured; until then the same actions stay copy-link and in-app.
- **Template onboarding is partly a service.** HTML source editing and PDF slot mapping are self-serve, but a fully bespoke design still needs a human to build or map it.
- **Pricing is a hypothesis.** The plan presets are enforcement primitives, not a validated price point.

---

## Glossary

| Term | Meaning |
|---|---|
| **Discovery** | The demand-side surfaces: agency directory, packages, events, shared trips and traveller profiles. |
| **Realm** | One of three separate account identities: personal, agency, platform. Separate passwords, sessions and authorization. |
| **Tenant** | One agency workspace. Every agency row is scoped to exactly one tenant. |
| **Provisioning** | The single operation that creates an agency, its owner account and the owner membership together. |
| **Lead / enquiry** | A traveller's expression of interest in an agency or event, delivered to the agency inbox as a thread. |
| **Package** | A snapshot marketing card of a trip, published on the agency's public profile. It never reads the source trip again. |
| **Proposal** | A branded, client-safe PDF generated from a trip and a quote, delivered by token link. |
| **Event** | A dated, capped gathering an agency hosts publicly: a camp, group trip or retreat. |
| **Snapshot** | A frozen copy of content at publish time, so later edits cannot break a live listing or an existing proposal. |
| **Kill switch** | A feature flag that makes an entire surface answer `404` without deleting data. |
