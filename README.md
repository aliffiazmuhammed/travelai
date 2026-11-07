# TravelAI

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini_2.5-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq_Fallback-F55036?style=for-the-badge)](https://groq.com/)

TravelAI is a full-stack travel platform with three separate audiences: travellers who want to find real trips, plan together and keep their money straight; travel agencies that need a public profile, packages, enquiries, quotes and branded documents; and platform operators who provision and moderate the whole thing.

AI planning is still here, but it is no longer the centre of the product. The centre is discovery and the traveller-to-agency loop: browse what other people and agencies are actually running, ask to join or copy it, send an enquiry, get a quote, accept a proposal. The AI is supporting cast - it turns a short wizard into a day-by-day itinerary, proposes weather-safe alternatives, and answers questions inside a trip conversation.

---

## Table of contents

- [Who uses TravelAI](#who-uses-travelai)
- [Why the product exists](#why-the-product-exists)
- [Traveller features](#traveller-features)
- [Agency features](#agency-features)
- [Platform administration](#platform-administration)
- [How the application works](#how-the-application-works)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)
- [Security and privacy](#security-and-privacy)
- [Responsive and accessibility](#responsive-and-accessibility)
- [Known limits and deliberate exclusions](#known-limits-and-deliberate-exclusions)
- [Documentation map](#documentation-map)

---

## Who uses TravelAI

| Audience | Entry point | What they get |
|---|---|---|
| Traveller | `/` (`/dashboard` once signed in) | Discovery, AI planning, collaborative editing, maps, money tracking, sharing |
| Agency | `/agency/login` | A tenant workspace: trips, clients, enquiries, quotes, proposals, exports, events, team |
| Platform operator | `/admin/login` | Provisioning, moderation, reports, audit, plan overrides |
| Anonymous visitor | public routes | Explore trips, agency directory, agency and traveller profiles, events, shared trips, guest proposal pages and guest enquiry threads |

The three signed-in realms are deliberately isolated. A personal session never opens the agency workspace, an agency session never opens the admin console, and the same email address may legitimately exist in more than one realm or tenant. See [Account realms](#account-realms).

---

## Why the product exists

A raw LLM itinerary is useful but brittle. Left alone it packs ten far-apart sights into an afternoon, changes hotels every night, invents map coordinates, and ignores local transit, permits and payment reality. Earlier versions of this product wrapped a prompt; the current application wraps the *trip*.

Every generated plan is normalised, scored and rendered against real geography. Travel legs get distances and travel times. Stays on consecutive nights at the same property collapse into one card. Weather is checked per day, and when a day looks rough the app proposes a concrete indoor alternative instead of silently keeping it. A budget is split into categories, then compared with what was actually logged and spent.

The rest of the product exists because a plan is rarely a solo artefact:

- Other people need to see it, comment on it, vote on it and edit it.
- Some trips already happened, and are worth copying rather than inventing.
- Some people want a professional to run the trip, which means agencies need a credible public shopfront and a private workspace.
- An agency needs an accountable trail: who claimed the lead, who sent the quote, which template version produced the PDF.
- An operator needs a way to review, suspend and audit tenants without reading their data.

The result is a product that starts from real trips and real agencies, then uses AI to remove the blank page.

---

## Traveller features

### Discover trips and agencies

- **Explore gallery** (`/explore`) is split into two doors:
  - **Live trips** - published trips that have not started yet, sorted by soonest departure. A traveller can ask to join, or open the owner's profile.
  - **Copy a plan** - finished trips, sorted by most recent. They are read-only references: the join action is replaced by a "Finished" state and a copy action.
  - Filters live in compact dropdowns rather than long inline rows: duration, group type and tags. Filters are URL-backed, so a filtered view can be shared or reloaded. Results paginate with Previous/Next.
- **Gallery trip page** (`/explore/:tripId`) shows the itinerary projection only: day plan, stays, food, practical notes and cover. It never shows money, expenses, members, versions or generation metadata. Exact dates can be hidden by the owner, in which case the page shows month and duration instead.
- **Copy a published trip** creates an editable draft in the visitor's own account. The original owner is never modified.
- **Ask to join** is available only on live trips. A request is queued for the owner; approval grants commenter access, not edit rights.
- **Traveler profiles** (`/travelers/:handle`) show a handle, bio and that person's published trips, including finished ones. Handles are unique and availability-checked while typing.
- **Agency directory** (`/agencies`) lists published agency profiles with cursor pagination, search and facets for base city, destination, specialty and language. The navigation entry appears only once at least five agencies have published a profile; the pages stay reachable by URL.
- **Agency profile** (`/agencies/:slug`) shows the agency's story, base city, destinations, specialties, services, languages, trust signals, upcoming events, package cards and an enquiry form.
- **Events** (`/explore/events/:eventId`) are dated camps, group trips and retreats run by agencies. The public page shows dates, venue, capacity, price, highlights and a cover, plus an "I'm interested" form with duplicate and capacity guards.
- **Report and block** are part of discovery, not an afterthought. A signed-in traveller can report a trip or profile, and can block another account one-way. Three distinct open reports auto-hide a gallery trip pending review. Reporting never exposes the reporter on any public payload.
- **Guidelines** (`/guidelines`) describe the community rules in plain language.

### Plan with AI

- **Six-step wizard**: destination, dates, group, budget, vibe/pace and review. The wizard keeps its state when moving back and can prefill from the last trip.
- **Destination discovery**: 80+ curated Indian travel hubs with coordinates, plus Nominatim geocoding for unlisted places.
- **Group and budget**: solo, couple, family and friends presets; separate adult and child counts; per-person and total budget sliders with category allocation.
- **Preferences**: eight interest tags, travel pace (relaxed, balanced, action-packed), dietary notes and output language. Preferences are converted into activity weights and prompt constraints rather than decorative labels.
- **Dual-provider generation**: Gemini 2.5 Flash is the primary model; Groq (`openai/gpt-oss-120b`) is the automatic fallback on rate limits or provider failures. Generation streams over server-sent events with staged progress.
- **Prompt quality work**: seasonal adaptation (winter, summer/pre-monsoon, monsoon, post-monsoon), returning-traveller personalisation from past trips and positive feedback, stable JSON keys across nine languages, a TTL prompt cache, deterministic per-user A/B prompt variants, and a heuristic quality score shown as "AI confidence".
- **Feedback**: thumbs up/down on a generated plan feeds future personalisation. Aggregated quality, feedback, variant and destination counts are available from the insights endpoint.

### Edit, map and adapt

- **Day-by-day itinerary**: activities, stays, food spots, transport and practical tips, with multi-night stays merged into one card.
- **Inline editing**: change any activity's title, time slot, approximate cost, location, description and GPS coordinates.
- **Reordering**: drag activities within a day, or move whole days with automatic renumbering. Accessible up/down controls mirror every drag interaction.
- **Autosave and versions**: local edits autosave; structured edits and reorders persist immediately. Every itinerary save writes a restorable snapshot (30 by default), and restoring backs up the pre-restore state first.
- **Trash and restore**: deleting a trip is soft; restore is available until a permanent purge, which is restricted.
- **Leaflet map**: numbered activity pins, hotel markers, popups and per-day route polylines on OpenStreetMap. Distances and travel times are computed on the client instantly, then refined by the backend routing endpoint when it is available.
- **Drawn routes**: click-to-draw a detour, trek or alternate drive, then name it, tag a day, choose a colour and travel mode. Length is shown live and recomputed server-side on save.
- **Weather advisories**: each day gets an Open-Meteo forecast chip with temperature, rainfall and wind, risk-coloured from clear through light rain, showers and rough weather. The advice is concrete (hill-road landslides, heat, cold nights, high winds). Dates beyond the forecast window fall back to a seasonal outlook.
- **Indoor alternative**: on a risky day, ask the AI to rework just that day around the conditions. The proposal is shown for review and only replaces the day when accepted - through the normal edit path, so version history still works.
- **Nearby places**: find restaurants, cafes, attractions, ATMs, pharmacies and fuel stops around a day, sorted by distance with addresses and opening hours. Providers are chained Geoapify then Overpass then Nominatim, so one overloaded service does not break search. Results become amber map markers and can be added to a day in one click.
- **Weather-aware plan check**: cross-references the forecast with actual travel legs, flags every leg running through rough weather, and offers explicit fixes - swap a rainy day onto a dry day, rebuild a high-risk day indoors, or pad the travel time. Nothing is applied silently.
- **Personal PDF**: a purpose-built jsPDF export renders a clean A4 document from itinerary data (no screen capture), alongside a print stylesheet for browser printing.

### Plan together

- **Roles**: owner, editor, commenter and viewer.
- **Invites**: link or email invites with expiry, use limits and a per-trip member cap. Tokens are hashed at rest.
- **Comments**: paginated and rate-limited, with XSS-safe rendering by construction.
- **Polls**: multiple-choice decisions inside a trip. Poll payloads are sealed on the client; the server stores opaque ciphertext.
- **Decisions**: a record of what the group settled on, separate from the chat scroll.
- **Trip chat**: a floating drawer with typing indicators, unread badges and end-to-end encryption. The server cannot read message bodies and therefore cannot export them.
- **@TravelAI assistant**: an answer-only participant. It receives the trip facts the server already holds plus a bounded, visibly disclosed set of decrypted recent messages from the asker's browser. The reply returns to that browser, is encrypted with the trip key, and is stored as a normal comment flagged as a bot message.
- **Presence and live updates**: SSE streams with heartbeat when the live tier is on; a 20-second visible-tab poll when it is off. The SPA discovers the tier from `/api/health`.
- **Shared version history**: agency staff and trip members see the same version trail, so a hand-off does not fork the plan.

### Track money

- **Expense ledger**: description, category, amount, date and day, per trip.
- **Planned vs actual**: category chart plus planned, spent, remaining and variance cards.
- **Travellers**: add companions and record who paid each expense.
- **Multi-currency**: 30 ECB-quoted currencies via Frankfurter, cached for 12 hours and snapshotted onto the trip. Amounts are stored converted into the trip's base currency; changing the base re-converts the ledger.
- **Splitting**: not split, equal, or custom per-person shares.
- **Settle up**: per-traveller paid, share and net balances, plus the fewest transfers needed to settle.
- **Receipts**: attach a JPEG, PNG, WebP or PDF receipt, preview it, open it from the ledger, and remove it. Files are size-capped, MIME-checked and verified against magic bytes before storage. Cloudinary is used when configured; local disk is the development fallback.

### Share and export

- **Unlisted share links**: a token-based read-only page (`/shared/:shareId`) for people without accounts.
- **Messenger text**: a formatted summary ready for WhatsApp, Telegram or email.
- **JSON backup**: the full raw trip document.
- **PDF and print**: a real PDF export plus a print stylesheet that hides navigation and reformats cards.
- **Publish to the gallery**: a separate decision from the unlisted share link. Publishing exposes only the public projection, never money or identities. Publishing can be undone without breaking the unlisted link.

### Account and safety

- **Personal password reset**: self-service forgot/reset flow with a one-time hashed token. Agency and platform accounts are reset by their owner or an operator instead.
- **Country-aware phone numbers**: every entry form uses a country picker, validates the national number per country, and sends/stores E.164.
- **One-way blocks** and **daily-limited reports**, both scoped to the personal realm.

---

## Agency features

An agency is a tenant, not a personal account with extra buttons. Its workspace has its own login, session, roles, data boundaries and audit trail.

### Workspace and team

- **Separate sign-in** at `/agency/login?workspace=<slug>` with email and password.
- **Onboarding**: first-run setup for brand and team, plus a forced password change on a one-time temporary credential.
- **Workspace shell**: grouped sidebar navigation, breadcrumbs, a command palette and live counters. Pages: Overview, Trips, Events, Clients, Enquiries, Templates, Team, Operations, Settings.
- **Overview**: today's work - new enquiries, trips in flight, events, invites and plan usage.
- **Trips library**: search and filter by status, destination, assigned staff and client. Trips are archived and restored rather than destructively deleted.
- **Workspace trip planner**: the same AI engine, map and editing surface as the traveller product, within the tenant.
- **Client access**: clients are invited through trip membership and never receive staff access.
- **Team**: owner, admin, planner and viewer roles; invite, role change, removal, owner transfer and last-owner protection.

### Public presence and packages

- **Directory profile**: about, base city, destinations, specialties, services, languages, optional phone and GSTIN, and a logo.
- **Readiness-gated publishing**: publishing is a check, not a toggle. No description, city, destination, service or logo means no listing.
- **Package cards**: publish a trip as a snapshot - title, nights, highlights, inclusions, cover image and an optional per-person price. The card never re-reads the source trip, so editing or deleting the trip cannot break a public listing. The published itinerary is price-free; only the agency-authored package price is shown.
- **Pricing display**: unpriced packages say "price on request"; the "from" price on the directory is always the cheapest live package.
- **Trust signals**: a human-reviewed verification badge, and "usually replies in ~X h" computed from the median of recent replies. The reply-time signal stays hidden until at least five enquiries have been answered, so a new listing never over-promises.

### Enquiries and conversations

- **Public enquiry form** on the profile and on package cards. The traveller must be signed in; the form carries consent, dates, party size, budget band and a message.
- **Inbox**: split-view inbox with claim/assign, unread counts per side, status transitions (`new -> replied -> quoted -> won/lost`) and one-click conversion into a client with a prefilled quote.
- **Two-way threads**: the agency replies from the inbox; the traveller replies from `/enquiries` or `/enquiry/:id`. Guests receive a private 90-day link that works without an account. Raw tokens are never stored - only a sha256 hash, a short hint and an expiry.
- **Live refresh**: new leads, replies and read receipts arrive through a per-account SSE stream discovered from `/api/health`. With the live tier off, both sides fall back to a 20-second visible-tab poll; guest links keep plain reads.
- **Proposal comparison** (`/proposals`): every live proposal answering the traveller's own enquiries, side by side - total and per-person price, validity, inclusions and exclusions. A proposal can be opened as the pinned document or PDF, and "Ask about this" sends a question into the thread it answers.

### Quotes and proposals

- **Versioned quotes**: draft, sent, accepted, cancelled. A sent quote is frozen; editing creates a new version. Quote numbers are unique per agency.
- **Server-computed totals**: line items, markup, tax, discount, total and per-person are calculated on the server; the browser never submits the final total.
- **Client-safe projection**: internal cost, markup, expenses and preparer identity are stripped from every client-facing view.
- **Default terms**: agency-level inclusions, exclusions, things to carry, cancellation and payment terms, reusable on every quote.
- **Proposal share links**: minted from a ready client export or from a live sent quote. The link pins the quote and (when present) the export, is stored as a sha256 hash, expires (30 days by default, capped at 90), and is revocable.
- **Public proposal page** (`/proposal/:token`): branded document, client-only quote summary, PDF download, and acceptance without an account.
- **Atomic acceptance**: an idempotent `sent -> accepted` transition, audited on both the platform and tenant trails. A second accepted quote for the same trip is refused; a decline is written back to the enquiry and shown to the agency.

### Templates, exports and brand

- **Built-in HTML templates**: a client brochure and an internal summary, designed for variable day counts and long text.
- **Custom HTML templates**: validated against a versioned contract with no arbitrary JavaScript or remote assets. The in-app source editor saves a new immutable version and carries assets forward.
- **Uploaded PDF designs**: sanitised to a passive vector background, mapped to named slots, and rendered with one repeat page per itinerary day using `pdf-lib`.
- **Preview and activation**: preview against a real trip; activation refuses an unpinned version.
- **Immutable versions**: old exports stay pinned to the template version they were rendered with. One default per audience is enforced in service logic and tests. Templates can be archived and restored.
- **Brand assets**: logo, mascot, fonts, colours and images, private and tenant-scoped, MIME- and size-checked. A template pins the assets it was activated with.
- **PDF export pipeline**: queued jobs rendered two at a time, with retry and interrupted-job recovery at boot. The engine is a locally installed Chrome in development, or a basic-auth-protected Gotenberg service in deployment. Downloads use short-lived HMAC-signed URLs, never public object URLs.
- **History, rate limits and quota**: per-agency export history with status and retry, per-user and per-agency rate limits, and a monthly plan quota.

### Events

- **Event library**: draft, published and closed lifecycle with status filters and soonest-first ordering.
- **Public event pages**: dates, venue, capacity, price, highlights and cover; listed on Explore and the agency profile.
- **Interest**: guest interest with per-event caps, duplicate guards and a confirmation flow.
- **Roster**: pending-first roster with confirmation and decline counts. Drafts offer no roster action; ended events cannot be published; closed events cannot be republished until reopened.

### Plans, limits and audit

- **Plan tiers**: `starter` (3 seats, 10 exports/month, 100 MB) and `pro` (15 seats, 100 exports, 1 GB), configurable by environment.
- **Server-side enforcement**: seat checks on invite; export and storage checks on write; clear `409` responses naming the current limit. Exhausted exports recover when the month rolls over.
- **Usage reporting**: live seat, export and storage usage in Operations.
- **Per-agency overrides**: the admin console can override any limit; blank fields inherit the tier.
- **Audit trail**: append-only and tenant-scoped, covering members, templates, quotes, exports, trips and plan changes. Metadata never contains secrets.

---

## Platform administration

The console lives at `/admin/login` and is a third, fully separate realm.

- **Overview**: accounts, agencies, applications and shortcuts.
- **Account directory**: every realm as separate rows; same-email accounts are never silently merged.
- **Agency provisioning**: name, slug, plan, billing contacts and owner email, created as one compensatable operation (agency + owner account + owner membership).
- **Public application queue**: approve (which provisions the tenant) or reject with a note. Applications are anonymous, rate-limited, honeypot-protected and create no account until approved.
- **Tenant lifecycle**: suspend (invalidates sessions, blocks login, fails public links closed) and reactivate.
- **Password reset**: one-time password with forced change; personal accounts are untouched.
- **Plan and billing metadata**: tier change, overrides, renewal date, contact and notes.
- **Directory moderation**: verify/unverify and hide/restore profiles or individual packages with a reason. A takedown is effective on the listing, facets, direct URLs, logos, covers and enquiry forms, while preserving the agency's own publishing choice.
- **Reported content**: gallery report queue with automatic hiding at three distinct reports; agency pages are reviewed manually.
- **Platform audit**: filters by action, target, actor, date and free text, paginated with facets.
- **Platform admins**: create, reset and disable, with last-active-admin protection.
- **Bootstrap**: `bootstrap:platform-admin` creates the first super-admin without opening public registration.

The namespace is dark unless `PLATFORM_ADMIN_ENABLED` is explicitly true. When it is off, `/api/admin/*` answers 404 and the SPA presents `/admin` as unavailable.

---

## How the application works

### Request pipeline

1. Express trusts one reverse proxy hop so HTTPS and client IPs are correct behind Render.
2. Helmet sets a self-only script CSP with explicit map, image and font origins.
3. CORS is an exact-origin allow-list. Same-origin requests (single-service deployment) skip CORS entirely. Suffix wildcards were removed on purpose: anyone can deploy under `*.onrender.com`.
4. JSON bodies are capped at 1 MB.
5. A double-submit CSRF cookie is issued on any request; non-GET requests must echo it in `X-CSRF-Token`. Bootstrap auth paths are exempt.
6. Zod validates every route payload.
7. Realm middleware proves the caller before a handler runs. Tenant routes always carry the agency id; cross-tenant ids return 404 rather than 403, so existence is not leaked.
8. Rate limiters cover auth, AI generation, collaboration writes, enquiries, applications, public interest and platform writes.
9. One error handler produces the JSON error envelope. In production, the SPA fallback serves `index.html` for non-API GETs and returns JSON 404 for unknown API routes.

`GET /api/health` reports database state, uptime, feature tiers, storage provider, PDF renderer mode and memory. It answers `503` when the process is alive but the database is not, so a bad instance is replaced instead of being reported ready.

### Account realms

| Realm | Session | Routes | Isolation rule |
|---|---|---|---|
| Personal | Personal JWT cookie | `/api/auth`, `/api/itinerary`, `/api/invites`, `/api/blocks`, `/api/reports`, `/api/enquiries`, `/api/proposals` | Agency and platform sessions are refused by the personal guard |
| Agency | Separate agency JWT | `/api/agency/auth`, `/api/agency/*` | Every tenant route requires an agency session and a tenant id |
| Platform | Separate platform JWT | `/api/admin/auth`, `/api/admin/*` | The whole namespace sits behind `requirePlatformAdmin` |

Public namespaces (`/api/travelers`, `/api/explore`, `/api/events`, `/api/agencies`, `/api/agency-applications`, `/api/conversations`) never accept a session as authorisation. They return projections only.

### Visibility and publishing rules

- A trip has two independent visibility decisions: an **unlisted share token** and **gallery publication**. Revoking one does not break the other.
- Gallery eligibility is computed on the server: published, not agency-owned, and matching the requested temporal bucket.
- Every public trip response leaves through an allow-list projection. Sessions, members, expenses, finance, generation metadata and versions are structurally absent, not merely filtered.
- Exact dates can be hidden per trip; the public page then shows month and duration.
- Agency directory publication is readiness-gated, and operations moderation can hide a profile or a single package regardless of the agency's preference.

### Live versus finished trips

| Bucket | Definition | Sort | Join | Primary action |
|---|---|---|---|---|
| Live | Published, not agency-owned, `startDate` in the future (or absent) | Soonest departure first | Request, then owner approval grants commenter access | Ask to join |
| Finished | Published and `startDate` before today (UTC) | Most recent first | Closed | Copy the plan |

The write path for join requests remains upcoming-only. The read path exposes `joinable: false` on a finished trip so the UI can explain why the action disappeared instead of offering a button that fails.

### Enquiry lifecycle

1. A signed-in traveller sends an enquiry from a profile or package with consent.
2. The agency sees it in the inbox and can claim or assign it.
3. Status moves through `new -> replied -> quoted -> won/lost`. Conversion creates a directory client and hands off to a prefilled quote; it does not force `won`.
4. Replies are two-way. Signed-in travellers use `/enquiries`; guests use a 90-day private token link.
5. Sending a quote and sending a proposal both write back to the enquiry, so the traveller's thread and comparison page stay truthful.
6. Accepting or declining a proposal is reflected on the enquiry, and a decline is explicitly surfaced to the agency.

### Proposal lifecycle

1. A quote is composed with server-computed totals.
2. A proposal is shared either from a ready export (pinning quote + document) or from a live sent quote (pinning the quote and its snapshot).
3. The raw token is shown once and stored only as a hash; the link expires and can be revoked.
4. The public page renders the client-safe quote and, when present, the branded PDF.
5. Acceptance is idempotent and audited; a second accepted quote for the same trip is refused.

### Export pipeline

Exports are queued rather than synchronously rendered. Two jobs run at a time. Each job is pinned to an immutable template version and its asset snapshot. A job stranded in `rendering` by a restart is recovered at boot and turned into a retryable failure. A completed export is downloaded through a short-lived HMAC-signed URL.

### Live updates and fallbacks

- Trip collaboration and enquiries each have an SSE tier, discovered from `/api/health`.
- With a tier off, the corresponding routes answer 404 rather than opening an empty stream, and the SPA falls back to a 20-second poll that only runs while the tab is visible.
- Enquiry streams are capped per channel; the oldest stream is closed past the cap so a runaway tab cannot pin unbounded memory.

### Transactional email

Delivery is a Resend HTTP adapter behind an outbox and a dark-by-default flag. With `EMAIL_ENABLED` off, or without a provider key, every notification helper is a no-op and no outbox row is written. Because free hosting has no cron, the dispatcher and lifecycle sweeps ride the web process: the outbox drains on an interval, and a boot pass catches whatever a sleeping instance missed. Lifecycle sweeps cover event reminders, renewal reminders and the weekly agency digest.

### Phone numbers

Every phone input is country-aware on the client, then validated again on the server per country and stored in E.164. The form never sends an unchecked international-looking string into the database.

---

## Architecture

```mermaid
flowchart TD
    Traveller["Traveller (browser / mobile)"]
    AgencyUser["Agency staff"]
    Operator["Platform operator"]

    subgraph SPA["Frontend - Vite + React 18 + TypeScript"]
        Discovery["Explore, directory, profiles, events"]
        Wizard["Six-step AI planner"]
        Workspace["Trip workspace: map, weather, money, collaboration"]
        AgencyApp["Agency workspace"]
        AdminApp["Platform console"]
        Client["API client, auth contexts, SSE + poll hooks"]
    end

    subgraph API["Backend - Express 5 + TypeScript"]
        Security["Helmet, exact CORS, CSRF, rate limits, Zod"]
        Realms["Personal / agency / platform realm guards"]
        Collab["Collab: members, comments, polls, decisions, chat keys, presence"]
        Gallery["Gallery + directory projections"]
        Enquiries["Enquiries, conversations, quotes, proposals"]
        Exports["Templates, export queue, signed downloads"]
        AI["AI orchestrator, cache, quality, assistant"]
        Geo["Geo: distance, routing, weather, nearby, plan check"]
        Money["Finance: expenses, splits, settlement, FX, receipts"]
        Mail["Mail outbox + lifecycle sweeps"]
    end

    subgraph Ext["External services"]
        Gemini["Google Gemini 2.5 Flash"]
        Groq["Groq fallback"]
        Mongo[("MongoDB Atlas")]
        Cloudinary["Cloudinary storage"]
        Gotenberg["Gotenberg PDF renderer"]
        GeoAPIs["Open-Meteo, Geoapify / Overpass / Nominatim, OSRM, Frankfurter"]
        Resend["Resend email"]
    end

    Traveller --> SPA
    AgencyUser --> AgencyApp
    Operator --> AdminApp
    Discovery --> Client
    Wizard --> Client
    Workspace --> Client
    AgencyApp --> Client
    AdminApp --> Client

    Client -->|HTTPS + HttpOnly cookies| Security
    Security --> Realms
    Realms --> Collab
    Realms --> Gallery
    Realms --> Enquiries
    Realms --> Exports
    Realms --> AI
    Realms --> Geo
    Realms --> Money
    Realms --> Mail

    AI --> Gemini
    AI -.->|429 or failure| Groq
    Geo -.-> GeoAPIs
    Money -.-> GeoAPIs
    Mail --> Resend
    Exports --> Gotenberg
    Gallery --> Mongo
    Collab --> Mongo
    Enquiries --> Mongo
    Exports --> Mongo
    Money --> Mongo
    Realms --> Mongo
    Exports -.->|tenant-private bytes| Cloudinary
    Money -.->|receipts| Cloudinary
```

---

## Repository layout

```text
travelai/
├── package.json                 # Workspaces + dev/build/verify/start scripts
├── render.yaml                  # Single-service Render blueprint
├── README.md
├── docs/                        # Roadmaps, test plans, ADRs, runbooks
│
├── backend/
│   ├── .env.example
│   ├── package.json             # Start/dev/build/test + seed/migrate scripts
│   ├── ensure-frontend.js       # Static bundle discovery helper
│   ├── src/
│   │   ├── index.ts             # Middleware pipeline, route mounts, health, static serving
│   │   ├── config/              # Zod env parsing, CSP, feature flags
│   │   ├── controllers/         # HTTP adapters
│   │   ├── middleware/          # Realm guards, CSRF, rate limits, validation, errors
│   │   ├── models/              # 31 Mongoose models across trips, agencies and platform
│   │   ├── routes/              # 18 route namespaces
│   │   ├── schemas/             # Zod request and response contracts
│   │   ├── services/
│   │   │   ├── ai/              # Prompt, generation, fallback, cache, quality, normalise
│   │   │   ├── auth/            # Realms, migration, password reset
│   │   │   ├── itinerary/       # Generation orchestration, editing, history context
│   │   │   ├── collab/          # Membership, invites, comments, polls, decisions, chat, presence, assistant
│   │   │   ├── realtime/        # SSE hubs and frame contracts
│   │   │   ├── gallery/         # Publish, projections, explore, clone, join requests, reports
│   │   │   ├── directory/       # Agency profile, listing, packages, enquiries, conversations
│   │   │   ├── agency/          # Tenancy, clients, quotes, proposals, templates, exports, events, plan
│   │   │   ├── platform/        # Accounts, provisioning, applications, moderation, audit
│   │   │   ├── geo/             # Distance, routing, weather, nearby, weather-aware plan check
│   │   │   ├── finance/         # Expenses, settlement, FX, receipts
│   │   │   ├── events/          # Public events and interest
│   │   │   ├── mail/            # Outbox, Resend adapter, templates, recipients, lifecycle
│   │   │   └── user/            # Profiles and handles
│   │   └── utils/               # Health, phone, escaping, AppError
│   └── scripts/                 # Seeds, migrations, bootstrap, smoke and launch-gate scripts
│
└── frontend/
    ├── vite.config.ts           # Port 8080, /api and /uploads proxy to :5000
    └── src/
        ├── App.tsx              # Route table for all three realms
        ├── pages/               # Traveller, agency, admin and public pages
        ├── components/          # Dashboard, wizard, directory and UI primitives
        ├── context/             # User, agency and platform auth providers
        ├── hooks/               # Feature discovery, SSE/poll, access, encryption
        ├── services/api.ts      # Typed API client and stream reader
        ├── lib/                 # Geo, weather, currency, settlement, PDF, phone, covers
        └── types/               # Trip, gallery, directory and enquiry contracts
```

Generated or local-only directories (`backend/public`, `backend/dist`, `backend/uploads`, `backend/agency-*`, `backend/node_modules`, `frontend/dist`) are not source and are ignored by git.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, React Router 6, TanStack Query, Tailwind CSS, shadcn/ui + Radix, Lucide |
| Typography | Newsreader (display) and Manrope (body) |
| Maps and visuals | Leaflet, React-Leaflet, OpenStreetMap, Recharts |
| Documents | jsPDF (personal itinerary), pdf-lib + pdfjs-dist (agency templates), Mustache + parse5 (HTML templates) |
| Backend | Node.js 20+, Express 5, TypeScript, tsx, Zod, Multer |
| Database | MongoDB, Mongoose |
| AI | Google Generative AI (`gemini-2.5-flash`), Groq SDK |
| Security | Helmet, exact-origin CORS, double-submit CSRF, express-rate-limit, bcryptjs, jsonwebtoken |
| External data | Open-Meteo, Geoapify / Overpass / Nominatim, OSRM (optional), Frankfurter (ECB FX) |
| Storage | Cloudinary (receipts and tenant bytes), local disk fallback |
| PDF rendering | Local Chrome or remote Gotenberg |
| Email | Resend via an outbox, dark by default |
| Deployment | Render single free web service; Vercel config retained but not the maintained path |

---

## Getting started

### Prerequisites

- Node.js 20 or later (Node 24 is used in development)
- A MongoDB database (local or Atlas)
- A Gemini API key
- Optional: Groq key, Cloudinary account, Gotenberg service, Resend key

### Install and run

```bash
# From the repository root - installs root, backend and frontend workspaces
npm install

# Copy the environment template and fill in the required values
cp backend/.env.example backend/.env

# Start API on :5000 and Vite on :8080
npm run dev
```

Open `http://localhost:8080`. Vite proxies `/api` and `/uploads` to `http://localhost:5000`, so the frontend uses same-origin paths in development.

Run one side only:

```bash
npm run dev:backend
npm run dev:frontend
```

Production-style run:

```bash
npm run build      # compiles backend, builds frontend, syncs frontend/dist -> backend/public
npm start          # Express serves API + SPA on PORT (default 5000)
```

### Minimum environment

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:pass@cluster/travelai
JWT_SECRET=replace-with-a-long-random-secret
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=optional-groq-key
FRONTEND_URL=http://localhost:8080
```

`MONGODB_URI`, `JWT_SECRET` and `GEMINI_API_KEY` are mandatory; the process exits at boot if any is missing. Everything else has a safe default or is optional.

---

## Environment variables

The server validates its environment with Zod at boot. Feature tiers are dark by default unless explicitly enabled.

### Core

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | Runtime mode |
| `MONGODB_URI` | required | MongoDB connection string |
| `JWT_SECRET` | required | Signs every realm's session token |
| `FRONTEND_URL` | unset | Exact CORS origin for a split deployment |
| `ALLOWED_EXTRA_ORIGINS` | unset | Extra exact origins, comma-separated; no suffix wildcards |
| `SERVE_STATIC` | unset | Force serving the SPA bundle from the backend |

### AI

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | required | Primary provider |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Primary model |
| `GROQ_API_KEY` | unset | Optional fallback |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Fallback model |
| `AI_CACHE_TTL_MS` | service default | Prompt cache lifetime |
| `AI_CACHE_MAX` | service default | Prompt cache entry cap |

### Feature tiers

| Variable | Default | Effect when off |
|---|---|---|
| `ENABLE_TRIP_SSE` | off | Presence, comments, polls and decisions fall back to a 20s visible-tab poll |
| `ENABLE_ENQUIRY_SSE` | off | Enquiry streams answer 404; both inboxes fall back to polling |
| `ENQUIRY_SSE_MAX_STREAMS` | `25` | Concurrent streams per channel before the oldest is closed |
| `AGENCY_WORKSPACE_ENABLED` | off | `/api/agency/*` answers 404; no agency navigation |
| `PLATFORM_ADMIN_ENABLED` | off | `/api/admin/*` answers 404; `/admin` renders unavailable |
| `EMAIL_ENABLED` | off | No outbox rows and no delivery |
| `AGENCY_PROPOSAL_TTL_DAYS` | `30` | Proposal link lifetime (capped at 90) |
| `AGENCY_PLAN_TIERS` | starter/pro defaults | JSON tier overrides |
| `AGENCY_PLAN_DEFAULT` | `starter` | Tier for agencies without an override |
| `AGENCY_OPS_KEY` | unset | Secret required for ops plan changes; unset means API changes are impossible |

### Collaboration

`TRIP_MAX_MEMBERS` (25), `INVITE_TTL_HOURS` (168), `INVITE_DEFAULT_MAX_USES` (1), `VERSIONS_MAX` (30), `COMMENT_MAX_LEN` (2000), `COMMENT_MAX_PER_TRIP` (200), `COMMENT_CREATE_PER_15MIN` (60), `COMMENTS_PAGE_SIZE` (50), `DECISION_MAX_PER_TRIP` (50), `POLL_MAX_PER_TRIP` (30), `BOT_DAILY_LIMIT` (20), `PRESENCE_TTL_MS` (30000).

### Geography, weather and nearby search

`GEO_ROUTING_PROVIDER` (`haversine` or `osrm`), `OSRM_BASE_URL`, `OPEN_METEO_BASE`, `WEATHER_CACHE_TTL_MS`, `OVERPASS_ENDPOINTS`, `OVERPASS_TIMEOUT_MS`, `OVERPASS_BUDGET_MS`, `GEOAPIFY_API_KEY`, `GEOAPIFY_TIMEOUT_MS`, `NOMINATIM_BASE`, `NOMINATIM_TIMEOUT_MS`, `NOMINATIM_MIN_INTERVAL_MS`, `NEARBY_CACHE_TTL_MS`, `NEARBY_RETRY_AFTER_MS`, `NEARBY_BUDGET_MS`.

Provider order for nearby places: Geoapify (when a key is set), Overpass, Nominatim. When all three fail, the API returns `available: false` rather than an empty list.

### Money and storage

`CURRENCY_RATES_PROVIDER` (Frankfurter), `CURRENCY_CACHE_TTL_MS` (12 hours), `UPLOAD_DIR`, `MAX_UPLOAD_MB` (5), `CLOUDINARY_URL` or the individual Cloudinary keys, `CLOUDINARY_FOLDER`, `AGENCY_STORAGE_PROVIDER` (`cloudinary` or `local`).

Without Cloudinary, uploads live on local disk. That is fine in development and ephemeral on Render: receipts, avatars, agency assets and export PDFs disappear on redeploy.

### PDF rendering

`AGENCY_PDF_RENDERER_URL`, `AGENCY_PDF_RENDERER_USERNAME`, `AGENCY_PDF_RENDERER_PASSWORD`. When the URL is unset, a locally installed Chrome is used. `GET /api/health` reports which engine is active.

### Email

`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_OUTBOX_INTERVAL_MS` (60s), `EMAIL_MAX_ATTEMPTS` (4), `EMAIL_LIFECYCLE_INTERVAL_MS` (1h), `EMAIL_EVENT_REMINDER_HOURS` (48), `EMAIL_RENEWAL_REMINDER_DAYS` (14).

### Event interest limits

`EVENT_INTEREST_IP_DAILY_LIMIT` (12), `EVENT_INTEREST_EVENT_IP_DAILY_LIMIT` (4), `EVENT_INTEREST_EMAIL_DAILY_LIMIT` (3), `EVENT_INTEREST_EVENT_DAILY_LIMIT` (50).

`backend/.env` is gitignored at every level. Never commit real keys.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Backend (`tsx watch`, :5000) and Vite (:8080) together |
| `npm run dev:backend` | Backend only |
| `npm run dev:frontend` | Frontend only |
| `npm run build` | Backend `tsc` + frontend production build + sync into `backend/public` |
| `npm run build:backend` | Backend compile only |
| `npm run build:frontend` | Frontend build and static sync |
| `npm start` | Production server (API + SPA) |
| `npm test` | Backend test suite (Node test runner through `tsx`) |
| `npm run verify` | Tests + backend build + frontend typecheck + frontend build |
| `npm run lint:frontend` | ESLint on the frontend |

A release check is `npm run verify`. It is the same sequence used before each milestone was accepted.

### Seeds, migrations and operations scripts

Run from `backend/`:

| Script | Purpose |
|---|---|
| `npm run bootstrap:platform-admin` | Create the first platform super-admin |
| `npm run seed:gallery` | Seed synthetic published trips for Explore |
| `npm run seed:directory` | Seed synthetic agency directory fixtures |
| `npm run migrate:members` | Backfill trip members |
| `npm run migrate:account-realms` | Migrate legacy accounts into the three-realm model |
| `npm run migrate:trip-visibility` | Migrate `isPublic` to the current visibility model |

Additional operational scripts live in `backend/scripts/`: `smoke-a5` through `smoke-a9`, `smoke-m8-g6`, collaboration smokes (`smoke-e2`, `e5`, `e6`, `f8`, `f9`, `f10`, `f12a`, `f13`, `f14`), `load-a9`, `db-audit`, and `launch-gate-m9`.

`launch-gate-m9.mts` is read-only and checks the announcement gate: at least five verified live agency profiles, a priced package on each, and at least one answered test enquiry.

Seeds and smokes write to whatever database `MONGODB_URI` points at. Use a disposable or synthetic database, and clean up fixtures afterwards.

---

## API reference

All routes are JSON and return a consistent `{ success, ... }` envelope.

| Namespace | Realm | Purpose |
|---|---|---|
| `GET /api/health` | public | Database, feature tiers, storage, PDF engine, memory |
| `/api/auth` | personal | Signup, signin, logout, current user |
| `/api/itinerary` | personal | Generate, stream, CRUD, versions, sharing, feedback, insights |
| `/api/invites` | personal | Trip invite preview and acceptance |
| `/api/geo` | personal | Distance/routing, weather, nearby, plan check |
| `/api/travelers` | public | Traveler profile projection |
| `/api/explore` | public | Live and finished trip listing, gallery trip projection |
| `/api/events` | public | Public events and guest interest |
| `/api/agencies` | public | Directory listing, profile, packages, public enquiry write |
| `/api/agency-applications` | public | Anonymous "join as an agency" application |
| `/api/blocks` | personal | One-way block list |
| `/api/reports` | personal | Content reports |
| `/api/enquiries` | personal | A traveller's own enquiries and threads |
| `/api/conversations` | public capability | Guest enquiry thread resolved by its private token |
| `/api/proposals` | personal | A traveller's proposal comparison and actions |
| `/api/agency/auth` | agency | Context, CSRF, signin, logout, password setup |
| `/api/agency/*` | agency | Trips, clients, enquiries, quotes, proposals, templates, exports, events, team, operations, settings |
| `/api/admin/auth` | platform | Platform signin, logout, current admin |
| `/api/admin/*` | platform | Accounts, agencies, applications, reports, audit, platform admins |
| `/uploads/*` | public but unlisted | Locally stored receipt and avatar files; generated names include random bytes |

Public responses are projections. A public endpoint never returns a raw trip or agency document.

---

## Data model

MongoDB collections fall into five groups:

- **Personal and planning**: `User`, `Trip` (itinerary, members, versions, expenses, finance, visibility), `TripInvite`, `TripJoinRequest`, `TripComment`, `TripPoll`, `TripDecision`, `TripChatKey`, `TripReadState`, `TripReport`, `UserBlock`.
- **Gallery and discovery**: public projections are computed, not stored, except publish state on `Trip` and the traveler handle on `User`.
- **Agency tenant**: `Agency`, `AgencyMember`, `AgencyInvite`, `AgencyClient`, `AgencyQuote`, `AgencyProposalLink`, `AgencyTemplate`, `AgencyTemplateVersion`, `AgencyAsset`, `AgencyExport`, `AgencyAudit`, `AgencyEvent`, `AgencyEventInterest`.
- **Public agency surface**: `AgencyProfile`, `AgencyPackage`, `AgencyEnquiry`, plus interest rows for events.
- **Platform and operations**: `AgencyApplication`, `PlatformAudit`, `PasswordResetToken`, `EmailOutbox`.

Two rules matter more than the names:

1. **Tenant id on every agency query.** Cross-tenant ids behave as missing.
2. **Hash what is a capability.** Invite, guest-thread and proposal tokens are stored as hashes with expiry and a short hint, never as raw values.

---

## Testing and verification

Backend tests use Node's built-in runner through `tsx` and are registered explicitly in `backend/package.json`. The suite covers pure rules (editing, geo maths, expenses, settlement, currency, weather risk, nearby failover, projections, template validation, plan limits), service glue (gallery explore, join requests, enquiries, proposals, exports, mail), middleware and security (realm isolation, CSRF, trip access, platform admin, event interest limits), and router coverage tests that walk the Express stack and fail if a trip-scoped route is missing a guard.

```bash
npm test          # backend suite
npm run verify    # suite + backend build + frontend typecheck + frontend build
```

Manual and scripted verification used during development:

- Headless Chrome/CDP browser passes for desktop and light/dark layouts.
- Synthetic-data smokes for agency A5-A9, templates, exports, proposals and the full traveller -> enquiry -> quote -> proposal loop.
- Read-only `launch-gate-m9` before a pilot announcement.

When adding a backend test file, register it in `backend/package.json`; the runner does not discover files automatically.

---

## Deployment

The maintained deployment is the single-service Render blueprint in [`render.yaml`](render.yaml):

- One free `travelai-app` web service running `npm install --include=dev && npm run build`, started with `npm start`.
- Express serves both `/api` and the built SPA from `backend/public`, so auth cookies are first-party and CORS is not involved.
- Health check: `/api/health`.
- The blueprint enables the agency workspace and both SSE tiers. It does **not** enable platform admin or email; set `PLATFORM_ADMIN_ENABLED=true` and `EMAIL_ENABLED=true` (plus a Resend key) when those are needed.
- `JWT_SECRET` is generated by Render. `MONGODB_URI`, `GEMINI_API_KEY`, `GROQ_API_KEY`, Cloudinary and renderer credentials are supplied in the dashboard.
- PDF exports use a separate Gotenberg service (`AGENCY_PDF_RENDERER_URL`), because the free Node runtime has no browser.
- Cloudinary is strongly recommended. Without it, uploads and export PDFs live on ephemeral disk and vanish on redeploy.

Operational notes for the pilot:

- Free instances sleep. The first request after a sleep is slow, and the external renderer may sleep too. Export jobs are recovered and retried rather than left spinning forever.
- There is no cron. Email delivery and lifecycle sweeps run inside the web process and catch up at boot.
- The pilot is not a production SLA. A paid instance and a durable renderer are the next infrastructure step.

`backend/vercel.json` remains from an earlier deployment path, but the documented and tested deployment is Render.

---

## Security and privacy

- **Three isolated realms** with separate passwords, cookies, JWTs and guards. A session from one realm is never accepted by another.
- **Tenant-scoped sign-in and data access.** Every agency query carries the tenant id; cross-tenant ids return 404.
- **Per-tenant email uniqueness.** One email can legitimately exist in several realms or tenants; accounts are never silently merged.
- **CSRF double-submit** on all writes, with bootstrap auth paths exempt.
- **Exact-origin CORS.** Suffix wildcards are rejected on purpose.
- **Helmet CSP** with a self-only script policy and explicit map, image, font and style origins.
- **Zod validation** on every route and **rate limits** on auth, generation, collaboration, enquiries, applications, event interest and platform writes.
- **Upload verification** by size, MIME allow-list and magic bytes.
- **Capability tokens hashed at rest** with expiry: invites, guest threads, proposals.
- **Public projections by allow-list.** Money, sessions, members, versions and generation metadata cannot leak through a forgotten field.
- **End-to-end encrypted chat and sealed polls.** The server stores ciphertext and cannot read or export conversations.
- **Auditable operations.** Platform and tenant audit trails are append-only and never contain secrets.
- **Kill switches.** Agency and platform namespaces answer 404 when disabled, preserving data.
- **No secrets in git.** `.env` files are ignored at every level; the repository only ships `.env.example`.

---

## Responsive and accessibility

- Layouts are tested from 320 px phones through tablets and 4K desktops.
- Interactive controls meet a 44 px minimum touch target.
- Mobile navigation uses a drawer; split-view inboxes collapse to one pane with a back action.
- Focus rings are visible, list rows are keyboard-activatable, and the workspace has a command palette.
- Light and dark themes are both supported, with per-component dark styles.
- Long lists and tables use fixed-height scroll areas with Previous/Next pagination rather than unbounded "load more".

---

## Known limits and deliberate exclusions

- **No payments, checkout or subscriptions.** Plan limits are enforced, but nothing is charged and no GST invoice is generated.
- **No self-serve agency signup.** An agency either applies for review or is provisioned by a platform operator.
- **Email is dark by default.** In-app inboxes and copy-link flows are the primary paths; Resend delivery must be explicitly enabled.
- **No booking or inventory.** The product sells proposals, not seats, rooms or deposits.
- **No reviews, ratings, likes, follows or DMs.** Discovery is intentionally not a social network.
- **No DOCX/XLSX export.** PDF is the delivered artefact; HTML and uploaded PDF designs cover the design need.
- **No visual drag-and-drop theme editor, and no automatic Canva/Figma/InDesign ingestion.** A design is uploaded and mapped once, then reused.
- **No AI-authored prices, legal terms or cancellation policy.** Commercial and legal copy stays agency-owned.
- **No server-side chat export.** Chat is end-to-end encrypted, so the server cannot read it.
- **The @TravelAI assistant is answer-only.** It does not edit the itinerary, send messages as a member, or act autonomously.
- **The events nav badge updates on route change**, not live; the pending count is refreshed when navigating.
- **Free-tier hosting is a pilot environment.** Instances sleep, the renderer cold-starts, and there is no SLA.
- **Vercel configuration is stale.** Render is the maintained deployment.

---

## Documentation map

`docs/` holds the working record behind the code:

- `roadmap-milestones-4-5.md`, `roadmap-milestone-6-collaboration.md`, `roadmap-milestone-7-conversation.md`, `roadmap-milestone-8-gallery.md`, `roadmap-milestone-9-agency-directory.md`, `roadmap-agency-workspace.md`, `roadmap-platform-admin.md` - milestone decisions and acceptance criteria.
- Per-milestone test plans (`agency-a0`, `a1`, `a2`, `a4`-`a9`, `milestone-8`, `milestone-9`, `platform-admin`) and `m10-qa-tickets.md` - test plans and QA records.
- `agency-operations-runbook.md` - agency handover, plan limits and recovery procedures.
- `agency-template-contract.md`, `agency-a8-design.md` - template contract and A8 design.
- `agency-identity-migration.md` - realm migration and rollback.
- `adr/` - architecture decision records.
