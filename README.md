# ✈️ TravelAI — Intelligent AI Travel Companion & Itinerary Generator

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini_2.5-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq_Fallback-F55036?style=for-the-badge)](https://groq.com/)

> **TravelAI** is a modern, full-stack web platform that synthesizes bespoke, day-by-day travel itineraries in seconds. By pairing Google Gemini 2.5 Flash and high-speed Groq fallbacks with interactive maps, financial analytics, and multi-night stay deduplication, TravelAI transforms travel planning from hours of frustrating research into an effortless, personalized experience.

---

## 📌 Table of Contents
- [What Problem Does TravelAI Solve?](#-what-problem-does-travelai-solve)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Monorepo Directory Structure](#-monorepo-directory-structure)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Installation & Running Dev Server](#installation--running-dev-server)
- [API Reference](#-api-reference)
- [Responsive & Cross-Device Support](#-responsive--cross-device-support)
- [Deployment](#-deployment)
- [Security & Best Practices](#-security--best-practices)

---

## 💡 What Problem Does TravelAI Solve?

Traditional trip planning involves juggling dozen of browser tabs: reading conflicting travel blogs, estimating taxi fares, looking up weather advisories, checking permit requirements, and calculating budgets in spreadsheets. Furthermore, basic LLM prompts often generate flawed itineraries that suffer from:
1. **Unrealistic Pacing & Logistics**: Packing 10 far-apart attractions into a single afternoon without travel time.
2. **Hotel Hopping Fatigue**: Changing accommodations every single night instead of scheduling continuous stays.
3. **Hallucinated or Absent Map Coordinates**: Generic lists with no spatial context or geographic centering.
4. **Unrealistic Budgets**: Overlooking local transit, buffer reserves, permit fees, or regional payment realities (e.g. offline cash vs UPI in remote hill stations).
5. **API Quota Brittleness**: Application crashes when a single AI provider experiences rate limits or downtime.

**TravelAI solves all of these challenges with a production-grade, fault-tolerant travel intelligence engine.**

---

## ✨ Key Features

### 🧠 Dual-Provider AI Streaming Pipeline
- **Primary Model**: Powered by Google's latest **Gemini 2.5 Flash** for rapid reasoning and multimodal world knowledge.
- **Instant Fallback**: Automatic failover to ultra-low-latency **Groq (`openai/gpt-oss-120b` / `qwen/qwen3.8-27b`)** upon rate limits (429) or API disruptions.
- **Live SSE Streaming**: Multi-stage progress indicators keeping users engaged while the itinerary synthesizes in real time.

### 🧭 6-Step Visual Trip Wizard
- **Destination Discovery**: Search bar with auto-suggestions and trending Indian hotspots (Goa, Manali, Wayanad, Jaipur, Ladakh, etc.).
- **Smart Calendar**: Departure/return pickers with duration presets (Weekend Getaway, 5-Day Recharge, 1-Week Vacation).
- **Group Presets & Custom Pacing**: Solo, Couple, Family, and Friends modes with independent adult and child count adjusters.
- **Dynamic Budget Allocator**: Per-person and total group budget sliders with automatic category allocation.
- **Vibe & Style Filters**: Adventure, Culture, Relaxation, Culinary, Nature, Photography, Nightlife, and Shopping.
- **Pace, Diet & Language**: Set a travel pace, dietary preferences and the itinerary's output language right in the wizard.

### 🗺️ Interactive OpenStreetMap & Leaflet Visualization
- **80+ Curated Travel Hub Coordinates**: Pre-mapped coordinates covering hill stations, beaches, and cultural centers across India.
- **Dynamic Nominatim Geocoding**: Automatically geocodes custom or unlisted destinations if not found in the local coordinate cache.
- **Day-by-Day Route Polylines**: Connects scheduled daily activities with color-coded travel routes.
- **Distance & Travel-Time Insights**: Per-leg distances and estimated drive times are shown between consecutive activities, with a per-day total on both the timeline and the map — computed instantly on the client and refined by the backend routing endpoint when available.
- **User-Drawn Custom Routes**: Click-to-draw your own paths on the map (detours, treks, alternate drives), name them, tag a trip day, pick a colour and travel mode, and see the length instantly. Saved per trip with edit/delete, and recomputed server-side on save.
- **Per-Day Weather Advisories**: Each day shows a live forecast chip (temperatures, rainfall, wind) colour-coded by travel risk — `clear` → `light rain` → `showers` → `rough weather` — with concrete advisories for hill-road landslides, extreme heat, cold nights and high winds. Forecasts come from Open-Meteo and degrade to a seasonal outlook for dates beyond the ~16-day window.
- **Suggest an Indoor Alternative**: On a risky day, ask the AI to rework just that day around the conditions (museums, cafés, covered markets…). The proposal is shown for review and only replaces the day when you accept it — through the normal edit path, so version history still works.
- **Nearby Places Search**: Find real restaurants, cafés, attractions, ATMs, pharmacies and fuel stops around any day, sorted by distance with addresses and opening hours. Results appear as amber map markers and can be added to the day as an activity in one click. Up to three independent place providers are chained — Geoapify (when an API key is configured), then Overpass, then Nominatim — so one overloaded instance never breaks search. If every provider is down it says so honestly, with a retry, rather than pretending nothing is nearby.
- **Weather-Aware Plan Check**: A map-tab panel cross-references the forecast with your actual travel legs — it flags every leg running through rough weather, then proposes concrete fixes: swap a rainy day's plan onto a dry day, rebuild a high-risk day indoors, or pad the travel time. Every suggestion is an explicit action; nothing is applied silently.
- **Interactive Pins**: Custom numbered activity markers and distinctive hotel icons with detailed popups.

### 🏨 Smart Multi-Day Stay Deduplication
- Automatically detects and merges multi-night reservations at the same property across consecutive days into consolidated cards (e.g. `Stay Duration: Days 1 – 4 (4 Nights)`), eliminating repetitive cards.

### ✏️ Inline Trip Editing & Version History
- **Activity Editor Modal**: Edit any activity's title, time slot, approximate cost, location, description, and GPS coordinates.
- **Drag-and-Drop Reordering**: Reorder activities within a day (drag handle or accessible up/down controls) and move entire days with automatic day renumbering.
- **Background Autosave**: Local edits autosave automatically, while fine-grained activity edits and reorders persist instantly via dedicated endpoints.
- **Version Snapshots & Restore**: Every itinerary save creates a restorable snapshot (last 20 per trip kept). Roll back to any version from the **History** tab — the pre-restore state is auto-backed up, so you can move forward again.

### 🌏 Personalized AI Prompt Engine
- **Multi-Language Output**: Generate the full itinerary in English, Hindi, Tamil, Bengali, Telugu, Marathi, Kannada, Malayalam, or Gujarati (JSON keys stay stable so the UI always renders correctly).
- **Interest Weighting**: Selected travel styles are converted into activity weights, so focused selections concentrate the itinerary around what you actually love.
- **Seasonal Adaptation**: Weather advisories, packing hints and activity picks automatically adapt to the travel month (Winter, Summer/Pre-Monsoon, Monsoon, Post-Monsoon).
- **Traveller Preferences**: Choose a travel pace (relaxed / balanced / action-packed) and dietary preferences that flow directly into every food and activity recommendation.
- **Returning-Traveller Personalization**: Past trips, preferred budgets, group types and positively-rated highlights are summarized into the prompt so repeat plans keep improving.
- **Quality Scoring**: Every generated itinerary is heuristically scored (completeness, consistency, richness, map accuracy) and the score is shown to the user as an "AI confidence" hint.
- **Prompt Caching & A/B Variants**: Identical prompts are served from a TTL cache to cut latency and cost, and prompts are deterministically A/B split per user for ongoing experimentation.

### 👍 Feedback Loop & Insights
- **Thumbs Up/Down Rating**: Rate any generated itinerary; ratings feed straight back into future personalization.
- **Analytics Endpoint**: Aggregated quality scores, feedback counts, variant performance and top destinations are exposed via `/api/itinerary/insights`.

### 📊 Expense Tracking & Settlement
- **Real Expense Tracking**: Log actual spend during the trip (description, category, amount, date, day) into a per-trip ledger.
- **Planned vs Actual**: A grouped bar chart plus planned / spent / remaining / variance cards compare your logged expenses against the AI's planned budget per category.
- **Group Travellers**: Add companions so each expense can record who paid and be split equally (foundation for settlement).
- **Multi-Currency Logging & Conversion**: Log expenses in any of 30 ECB-quoted currencies; rates come from Frankfurter (12-hour cache), are snapshotted onto the trip, and every amount is stored converted into the trip's base currency. Switch the base currency at any time and the whole ledger re-converts.
- **Bill Splitting & Settle Up**: Choose not-split, equal, or custom per-person shares, then see each traveller's paid/share/net balance plus the fewest transfers needed to settle up.
- **Receipt Attachments**: Attach a photo or PDF receipt to any expense (JPEG/PNG/WebP/PDF, ≤ `MAX_UPLOAD_MB`, default 5 MB), preview it before saving, open it from the ledger, and remove it again. Nothing is stored unless the file's actual bytes match its declared type.

### 📤 Seamless Sharing, Export & Print
- **Public Read-Only Web Links**: Unique share tokens allowing friends or family to explore the itinerary without needing an account.
- **Instant Messenger Text Export**: Formatted, emoji-rich summary ready for WhatsApp, Telegram, or Email.
- **JSON Data Backup**: Full raw data export.
- **Dedicated Print Stylesheet**: Browser print-to-PDF styles that hide navigation bars and reformat cards for clean physical paper printing.

### 🏢 Agency Workspace, Public Directory & Enquiries
- **Agency Workspace**: A separate agency realm for travel businesses — team members and roles, branding and assets, trip planning, clients, quotes, PDF exports and plan limits. It never mixes with personal trips or accounts.
- **Public Directory**: Agencies publish a profile (about, base city, destinations, specialties, services, languages, optional phone/GSTIN, logo) and appear on `/agencies` with cursor pagination, search and facet filters for city, destination, specialty and language. Publishing is a readiness check, not a toggle: no description, city, destination, service or logo, no listing.
- **Package Cards**: A trip can be published as a snapshot package — title, nights, highlights, inclusions, a cover image and an optional per-person price. The card never reads the source trip again, so editing or deleting the trip cannot break a public listing. Unpriced packages show "on request", and "from ₹…" on the listing is always the cheapest live package.
- **Guest Enquiries**: Travellers can send an enquiry from a profile or package with consent, dates, party size, budget band and a message. The agency gets it in an in-app inbox (no email dependency) with claim/assign, status transitions (`new → replied → quoted → won/lost`), and one-click conversion into a client with a prefilled quote.
- **Trust Signals**: A human-reviewed verification badge, and "Usually replies in ~X h" computed from the median of recent replies — hidden until the agency has answered at least five enquiries, so a new listing never over-promises.
- **Ops Moderation**: Platform admins can verify/unverify and hide/restore profiles or individual packages from the admin console. A takedown is effective on the listing, facets, direct URLs, logos, covers and enquiry forms, keeps the agency's own draft/published choice, and is audited on both the platform and tenant trails. A read-only launch gate (`scripts/launch-gate-m9.mts`) checks the announcement bar: ≥5 verified live profiles, a priced package on each, and at least one answered test enquiry.

### 📱 Mobile-First Responsive Design
- Optimized for all screen sizes from ultra-compact smartphones (320px iPhone SE) and tablets to 4K desktop displays.
- Touch-friendly 44px min-height targets, scrollable pill selectors, and mobile drawer navigation.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    User["Traveler (Browser / Mobile)"]

    subgraph Frontend ["Frontend (Vite + React 18 + TypeScript)"]
        UI["shadcn/ui + Tailwind CSS"]
        Wizard["6-Step Trip Wizard"]
        Dashboard["Itinerary Dashboard"]
        Leaflet["Leaflet Map Engine"]
        Charts["Recharts Analytics"]
        AuthContext["UserContext & API Client"]
    end

    subgraph Backend ["Backend API (Express 5 + TypeScript)"]
        Router["Express Router (/api/auth, /api/itinerary, /api/geo)"]
        Security["Helmet + Rate Limiting + CORS"]
        Zod["Zod Input Validation"]
        AIService["AI Orchestrator with Fallback"]
        Cache["TTL Generation Cache"]
        Quality["Quality Scorer"]
        Geo["Geo Service (distance / routing)"]
        Finance["Finance Service (FX rates / settlement)"]
        Gemini["Primary: Gemini 2.5 Flash"]
        Groq["Fallback: Groq SDK"]
        Mongo["MongoDB / Mongoose"]
    end

    User <-->|HTTPS / HTTP-only Cookies| UI
    UI --> Wizard
    UI --> Dashboard
    Dashboard --> Leaflet
    Dashboard --> Charts
    Wizard --> AuthContext
    Dashboard --> AuthContext

    AuthContext <-->|REST & SSE Streaming| Router
    Router --> Security --> Zod
    Zod --> AIService
    Router --> Geo
    Router --> Finance
    Geo -.->|Optional OSRM| Router
    Finance -.->|Frankfurter FX (12h cache)| Router
    AIService -->|1st Attempt| Gemini
    AIService -.->|On 429 / Error| Groq
    AIService <-->|Cache hit / store| Cache
    AIService -->|Score generated plan| Quality
    Router <-->|Trips, users, expenses, routes & FX cache| Mongo
```

---

## 📁 Monorepo Directory Structure

```text
travelai/
├── package.json               # Root monorepo runner (concurrently backend + frontend)
├── .gitignore                 # Root gitignore (strictly excludes secrets and builds)
├── README.md                  # Comprehensive system documentation
│
├── backend/                   # Node.js + Express 5 + TypeScript REST API
│   ├── .env.example           # Environment template
│   ├── package.json
│   ├── tsconfig.json
│   ├── vercel.json            # Vercel serverless deployment configuration
│   └── src/
│       ├── index.ts           # Server entry point & middleware pipeline
│       ├── db.ts              # MongoDB Mongoose connection
│       ├── config/
│       │   └── env.ts         # Zod-validated environment config
│       ├── controllers/
│       │   ├── auth.controller.ts       # Signup, Signin, Logout, Me
│       │   ├── itinerary.controller.ts  # Generation, CRUD, Sharing, Streaming
│       │   ├── expense.controller.ts    # Expense ledger, travellers, split derivation
│       │   └── geo.controller.ts        # Distance / travel-time routing
│       ├── middleware/
│       │   ├── auth.middleware.ts       # JWT cookie authorization
│       │   ├── error.middleware.ts      # Global centralized error handler
│       │   ├── rateLimiter.middleware.ts# Rate limiting (auth & AI generation)
│       │   └── validate.middleware.ts   # Zod schema request validator
│       ├── models/
│       │   ├── Trip.ts        # Itinerary schema with sharing tokens, versions & expenses
│       │   └── User.ts        # User credentials schema
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── itinerary.routes.ts
│       │   └── geo.routes.ts
│       ├── schemas/           # Zod validation schemas
│       ├── services/
│       │   ├── auth.service.ts
│       │   ├── itinerary/
│       │   │   ├── editing.ts           # Pure day/activity reorder & edit helpers
│       │   │   ├── editing.test.ts      # Unit tests (node:test) for editing helpers
│       │   │   └── context.ts           # Trip-history summarizer for personalization
│       │   ├── geo/
│       │   │   ├── distance.ts          # Pure haversine / travel-time helpers
│       │   │   ├── distance.test.ts     # Geo math unit tests
│       │   │   ├── route.ts             # Route provider (haversine + optional OSRM)
│       │   │   ├── route.test.ts        # Route assembly unit tests
│       │   │   ├── customRoute.ts       # Drawn-route point validation & distance
│       │   │   ├── customRoute.test.ts  # Drawn-route unit tests
│       │   │   ├── weather.ts           # Per-day advisories (Open-Meteo + seasonal fallback)
│       │   │   ├── weather.test.ts      # Risk mapping & advisory unit tests
│       │   │   ├── nearby.ts            # Nearby POI search (Overpass proxy + normalization)
│       │   │   ├── nearby.test.ts       # Overpass/Geoapify/Nominatim parsing, radius, failover tests
│       │   │   ├── weatherRouting.ts    # Weather-aware routing analysis (exposed legs + fixes)
│       │   │   └── weatherRouting.test.ts # Routing-analysis unit tests
│       │   ├── finance/
│       │   │   ├── expenses.ts          # Amount conversion, equal splits, planned vs actual
│       │   │   ├── expenses.test.ts     # Budget maths unit tests
│       │   │   ├── currency.ts          # FX rates (Frankfurter) + conversion helpers
│       │   │   ├── currency.test.ts     # Conversion & cache unit tests
│       │   │   ├── settlement.ts        # Balances + minimal-transfer settlement
│       │   │   ├── settlement.test.ts   # Bill-splitting unit tests
│       │   │   ├── receipt.ts           # Receipt storage helpers (validation, sniffing, files)
│       │   │   └── receipt.test.ts      # Upload validation & MIME-sniffing unit tests
│       │   └── ai/
│       │       ├── ai.interface.ts      # AIService abstraction
│       │       ├── gemini.service.ts    # Google Gemini 2.5 Flash implementation
│       │       ├── groq.service.ts      # Groq high-speed fallback implementation
│       │       ├── prompt.ts            # Multi-language, weighted & seasonal prompt builder
│       │       ├── prompt.test.ts       # Prompt builder unit tests
│       │       ├── quality.ts           # Heuristic itinerary quality scorer
│       │       ├── quality.test.ts      # Quality scorer unit tests
│       │       ├── cache.ts             # TTL cache for identical generations
│       │       ├── cache.test.ts        # Cache unit tests
│       │       └── index.ts             # Orchestrator with fallback + caching
│       └── types/             # Shared backend TypeScript types
│
└── frontend/                  # React 18 + Vite + TypeScript Client
    ├── index.html             # HTML5 entry with mobile viewport & theme initialization
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── App.tsx            # Main routes & QueryClient setup
        ├── config.ts          # API Base URL resolver
        ├── components/
        │   ├── Navbar.tsx     # Responsive navbar with mobile sheet drawer & dark mode
        │   ├── Hero.tsx       # Auth-aware responsive hero section
        │   ├── FeatureCard.tsx
        │   ├── ErrorBoundary.tsx
        │   ├── ItineraryDisplay.tsx # Multi-tab coordinator
        │   ├── dashboard/
        │   │   ├── TripHeader.tsx       # Visual cover, quick stats & export triggers
        │   │   ├── DayTimeline.tsx      # Vertical timeline with editable, reorderable activities & leg distances
        │   │   ├── ActivityEditor.tsx   # Modal to edit an activity's full details
        │   │   ├── TripVersions.tsx     # Version history list with one-click restore
        │   │   ├── TripFeedback.tsx     # Thumbs up/down rating & AI confidence hint
        │   │   ├── ExpenseTracker.tsx   # Ledger, planned-vs-actual, currency settings, settle-up
        │   │   ├── ExpenseEditor.tsx    # Modal to log / edit an expense (currency, splits, receipt)
        │   │   ├── WeatherAdvisory.tsx  # Per-day risk badges & advisory panels
        │   │   ├── WeatherRoutingCard.tsx# Weather-aware plan check with one-click fixes
        │   │   ├── DayAlternativeDialog.tsx # Review an AI-proposed weather-safe day
        │   │   ├── NearbyExplorer.tsx   # Nearby POI search with add-to-day actions
        │   │   ├── RouteEditor.tsx      # Modal to name / colour / tag a drawn route
        │   │   ├── TripMap.tsx          # Leaflet map with 80+ destinations, drawn routes & distances
        │   │   ├── StayAndCuisine.tsx   # Consolidated stay cards & dining hotspots
        │   │   ├── TravelGuideSafety.tsx# Climate, packing checklist & etiquette
        │   │   ├── ShareExportModal.tsx # Public link, WhatsApp text & PDF print
        │   │   └── MyTripsView.tsx      # Library view with search, filter & duplicates
        │   └── wizard/
        │       ├── WizardProgress.tsx   # 6-step progress bar with mobile scaling
        │       ├── StepWhere.tsx        # Destination search & popular hotspots
        │       ├── StepWhen.tsx         # Date range pickers & duration presets
        │       ├── StepWho.tsx          # Group type selector & traveler counters
        │       ├── StepBudget.tsx       # Interactive budget slider & INR tiers
        │       ├── StepStyle.tsx        # Travel vibe & interest selectors
        │       ├── StepReview.tsx       # Pre-submission review & validation
        │       └── GenerationOverlay.tsx# Live streaming generation animation
        ├── pages/
        │   ├── Landing.tsx    # Marketing homepage
        │   ├── TripPlanner.tsx# Full wizard journey
        │   ├── Dashboard.tsx  # User itinerary view & trip library
        │   ├── SharedTrip.tsx # Public read-only trip viewer
        │   ├── Auth.tsx       # Login & signup
        │   └── NotFound.tsx
        ├── services/
        │   └── api.ts         # Type-safe API client with SSE stream reader
        ├── lib/
        │   ├── geo.ts         # Client-side haversine / travel-time helpers
        │   ├── routeStyle.ts  # Colours & travel-mode metadata for drawn routes
        │   ├── currency.ts    # Supported currencies, FX conversion & money formatting
        │   ├── settlement.ts  # Mirror of the bill-splitting / settle-up maths
        │   ├── weather.ts     # Weather risk metadata, day/date + forecast zipping
        │   ├── weatherRouting.ts # Client helpers for applying weather-routing fixes
        │   ├── receipt.ts     # Receipt validation, preview & URL helpers
        │   └── budget.ts      # Expense categories & planned-vs-actual helpers
        └── types/
            └── trip.ts        # Comprehensive itinerary data contract
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide Icons |
| **Mapping & Visuals** | Leaflet, React-Leaflet, OpenStreetMap, Recharts |
| **Travel Data APIs** | Open-Meteo (weather advisories), Geoapify + Overpass + Nominatim (nearby search, chained failover), OSRM (optional routing), Frankfurter/ECB (FX rates) |
| **File Uploads** | Multer (in-memory, magic-byte verified) + Cloudinary CDN (or local disk fallback) |
| **Backend** | Node.js (v20+), Express 5, TypeScript, tsx |
| **Database** | MongoDB, Mongoose ODM |
| **Artificial Intelligence** | Google Generative AI SDK (`gemini-2.5-flash`), Groq SDK |
| **Security & Validation** | Zod, Helmet, express-rate-limit, bcryptjs, jsonwebtoken, cookie-parser |
| **Deployment** | Vercel (Serverless Backend + Static Frontend), Docker-ready |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or later recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas cluster URI)
- [Google AI Studio API Key](https://aistudio.google.com/) for Gemini
- [Groq API Key](https://console.groq.com/) (Optional, recommended for fallback resilience)

### Environment Configuration

Create a `.env` file in the `backend/` directory (you can copy `backend/.env.example`):

```bash
cp backend/.env.example backend/.env
```

Populate the required credentials:

```env
# Server Port
PORT=5000
NODE_ENV=development

# Database Connection
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/travelai?retryWrites=true&w=majority

# JWT Authentication Secret
JWT_SECRET=super_secret_jwt_passphrase_change_me_in_production

# AI Provider API Keys
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
GROQ_API_KEY=gsk_...your_groq_api_key_here

# Frontend URL (for CORS allowance — exact origins, comma-separated for multiple)
# Milestone 6 note: wildcard suffixes (*.vercel.app / *.onrender.com) are no longer
# accepted. List every deployment (including Vercel previews) explicitly.
FRONTEND_URL=http://localhost:8080
# Optional: extra exact origins beyond FRONTEND_URL
ALLOWED_EXTRA_ORIGINS=
# Same-origin requests (SERVE_STATIC=true) are always allowed and need no entry.

# Collaboration (Milestone 6, sprint E2)
TRIP_MAX_MEMBERS=25            # hard cap on members per trip (incl. the owner)
INVITE_TTL_HOURS=168           # default invite lifetime (168h = 1 week); max 720h
INVITE_DEFAULT_MAX_USES=1      # default uses per link invite (email invites are always 1)

# Live tier (Milestone 6, sprint E4 — optional locally, ON in render.yaml)
ENABLE_TRIP_SSE=false          # true enables the SSE presence stream (+ heartbeat route)
PRESENCE_TTL_MS=30000          # presence entry TTL — clients heartbeat at ≥2x this rate
# When SSE is off, the SPA polls comments/polls/decisions every 20s. Render's
# blueprint sets ENABLE_TRIP_SSE=true; check GET /api/health → collab.sse.

# Version history (Milestone 6, sprint E5 / flaw F13)
VERSIONS_MAX=30                # version snapshots retained per trip (each stores a full itinerary)

# Comments (Milestone 6, sprint F6a)
COMMENT_MAX_LEN=2000           # per-comment body cap (chars, zod-enforced)
COMMENT_MAX_PER_TRIP=200       # max live (non-deleted) comments per trip; POST 409s above it
COMMENT_CREATE_PER_15MIN=60    # per-user POST limiter (keyed user-or-IP, F18 pattern)
COMMENTS_PAGE_SIZE=50          # server max comments per page regardless of a larger `limit`

# AI Generation Cache (optional)
AI_CACHE_TTL_MS=21600000   # 6 hours
AI_CACHE_MAX=200

# Geo Routing (optional) — `haversine` (default) or `osrm`
GEO_ROUTING_PROVIDER=haversine
OSRM_BASE_URL=https://router.project-osrm.org

# Currency Rates (optional) — Frankfurter by default (no API key required)
CURRENCY_RATES_PROVIDER=frankfurter
CURRENCY_CACHE_TTL_MS=43200000   # 12 hours

# Weather Advisories (optional) — Open-Meteo by default (no API key required)
# Forecasts cover ~16 days; further-out dates fall back to seasonal normals.
OPEN_METEO_BASE=https://api.open-meteo.com/v1/forecast
WEATHER_CACHE_TTL_MS=2700000     # 45 minutes

# Nearby Search (optional) — three providers are chained, first success wins:
#   1. Geoapify  — used when GEOAPIFY_API_KEY is set. Reliable, covers every category
#                  uniformly, 3,000 free requests/day, no credit card required:
#                  https://myprojects.geoapify.com
#   2. Overpass  — keyless OpenStreetMap. Richest tags, but volunteer-run and often
#                  overloaded, so several endpoints are tried within a shared budget.
#   3. Nominatim — keyless OpenStreetMap last resort (thin coverage for some categories,
#                  governed by a 1 request/second policy).
# When every provider fails the API returns `available: false` instead of an empty list.
GEOAPIFY_API_KEY=                # optional; when set, Geoapify is tried first
GEOAPIFY_TIMEOUT_MS=8000
# OVERPASS_ENDPOINTS=https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter
OVERPASS_TIMEOUT_MS=6000         # per-endpoint attempt cap
OVERPASS_BUDGET_MS=10000         # total budget across all Overpass endpoints
NOMINATIM_BASE=https://nominatim.openstreetmap.org/search
NOMINATIM_TIMEOUT_MS=10000
NOMINATIM_MIN_INTERVAL_MS=1100   # honours Nominatim's 1 request/second policy
NEARBY_BUDGET_MS=15000           # ceiling across the whole provider chain
NEARBY_CACHE_TTL_MS=86400000     # 24 hours
NEARBY_RETRY_AFTER_MS=60000      # backoff after a failed lookup

# Receipt Uploads (Milestone 5)
# Option A: Cloudinary CDN (Recommended for production: Render / Vercel / Railway)
CLOUDINARY_URL=                     # e.g. cloudinary://<api_key>:<api_secret>@<cloud_name>
CLOUDINARY_CLOUD_NAME=              # or individual keys
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=travelai/receipts # Cloudinary folder for uploaded receipts

# Option B: Local disk storage (automatic fallback when Cloudinary is unset)
UPLOAD_DIR=backend/uploads       # defaults to <backend>/uploads when unset
MAX_UPLOAD_MB=5                  # per-file cap; JPEG/PNG/WebP/PDF only
```

> **Note**: Both the root and subfolder `.gitignore` files strictly ignore `.env` files. Secrets are never tracked or committed to version control.

### Installation & Running Dev Server

You can install and run both backend and frontend concurrently with a single command from the project root:

```bash
# 1. Install all dependencies across root, backend, and frontend
npm run install:all

# 2. Run backend (Port 5000) and frontend (Port 8080) simultaneously
npm run dev
```

Visit **`http://localhost:8080`** in your browser.

#### Running Individually

**Backend only:**
```bash
cd backend
npm install
npm run dev
```

**Frontend only:**
```bash
cd frontend
npm install
npm run dev
```

### Running Tests

Backend unit tests for the itinerary editing helpers, the prompt builder, the quality scorer and the generation cache run with Node's built-in test runner via `tsx`:

```bash
# From the project root
npm test
```

> The test suite covers: activity/day reorder & edit helpers, multi-language and personalized prompt construction, seasonal adaptation, interest weighting, itinerary quality scoring, and the TTL cache.

---

## 📡 API Reference

### Authentication Endpoints (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Create account & set HTTP-only cookie | No |
| `POST` | `/api/auth/signin` | Sign in & set HTTP-only cookie | No |
| `POST` | `/api/auth/logout` | Clear auth cookie | Yes |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Yes |

### Itinerary Endpoints (`/api/itinerary`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/itinerary/generate` | Generate complete itinerary JSON | Yes |
| `POST` | `/api/itinerary/generate-stream` | Generate itinerary with Server-Sent Events (SSE) | Yes |
| `GET` | `/api/itinerary` | Retrieve all saved trips for current user | Yes |
| `GET` | `/api/itinerary/:id` | Fetch specific trip details by ID | Yes |
| `PUT` | `/api/itinerary/:id` | Update itinerary details or status | Yes |
| `DELETE`| `/api/itinerary/:id` | Delete trip from library | Yes |
| `POST` | `/api/itinerary/:id/duplicate`| Clone trip into a new editable draft | Yes |
| `POST` | `/api/itinerary/:id/share` | Generate public read-only share token | Yes |
| `GET` | `/api/itinerary/shared/:shareId`| Fetch public read-only trip (unauthenticated) | No |
| `PUT` | `/api/itinerary/:id/activities` | Update a single activity within a day | Yes |
| `PUT` | `/api/itinerary/:id/activities/reorder` | Reorder activities within a day | Yes |
| `PUT` | `/api/itinerary/:id/days/reorder` | Move a whole day and renumber the rest | Yes |
| `GET` | `/api/itinerary/:id/versions` | List version history (lightweight summaries) | Yes |
| `GET` | `/api/itinerary/:id/versions/:version` | Fetch one version's full itinerary details | Yes |
| `POST` | `/api/itinerary/:id/versions/:version/restore` | Restore the trip to a previous version | Yes |
| `POST` | `/api/itinerary/:id/feedback` | Submit a thumbs up/down rating for a trip | Yes |
| `GET` | `/api/itinerary/insights` | Aggregated quality, feedback & variant analytics | Yes |
| `GET` | `/api/itinerary/:id/expenses` | List the trip's expense ledger, travellers & finance settings | Yes |
| `POST` | `/api/itinerary/:id/expenses` | Log a new expense (base-currency amount derived server-side) | Yes |
| `PUT` | `/api/itinerary/:id/expenses/:expenseId` | Update an existing expense | Yes |
| `DELETE`| `/api/itinerary/:id/expenses/:expenseId` | Remove an expense | Yes |
| `PUT` | `/api/itinerary/:id/participants` | Replace the traveller list (re-derives equal splits) | Yes |
| `PUT` | `/api/itinerary/:id/finance` | Change the base currency and/or refresh the trip's FX rate snapshot | Yes |
| `POST` | `/api/itinerary/:id/routes` | Save a user-drawn route (distance recomputed server-side) | Yes |
| `PUT` | `/api/itinerary/:id/routes/:routeId` | Update a saved route (name, day, colour, mode, points) | Yes |
| `DELETE`| `/api/itinerary/:id/routes/:routeId` | Delete a saved route | Yes |
| `POST` | `/api/itinerary/:id/days/:day/indoor-alternative` | AI-proposed weather-safe replacement for one day (proposal only, not persisted) | Yes |
| `GET` | `/api/itinerary/:id/weather-routing` | Weather-aware routing analysis: exposed legs, risky days & suggested fixes (advisory only) | Yes |
| `POST` | `/api/itinerary/:id/expenses/:expenseId/receipt` | Upload/replace an expense receipt (multipart `receipt`; JPEG/PNG/WebP/PDF, ≤ `MAX_UPLOAD_MB`) | Yes |
| `DELETE`| `/api/itinerary/:id/expenses/:expenseId/receipt` | Remove an expense receipt (and its stored file) | Yes |

### Geo Endpoints (`/api/geo`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/geo/route` | Compute per-leg distance & travel time for 2–50 coordinates (haversine or OSRM) | Yes |
| `GET` | `/api/geo/currency/rates?base=INR&symbols=USD,EUR` | Base-per-unit FX rates (12-hour cache) for currency conversion | Yes |
| `GET` | `/api/geo/weather?lat&lng&start&end` | Per-day forecast with risk level (`none`/`low`/`moderate`/`high`) + travel advisories (45-minute cache) | Yes |
| `GET` | `/api/geo/nearby?lat&lng&category&radius` | Named POIs sorted by distance — categories `restaurant`, `cafe`, `attraction`, `atm`, `pharmacy`, `fuel`. Providers chained Geoapify → Overpass → Nominatim (24-hour cache); returns `available: false` + `note` instead of an empty list when all are down | Yes |

---

## 📱 Responsive & Cross-Device Support

TravelAI has been designed and tested across multiple device categories:
- **Mobile Phones (320px – 480px)**: Compact step indicators, full-width touch actions, stackable budget switches, scrollable day pills, and safe modal height scrolling (`max-h-[92vh] overflow-y-auto`).
- **Tablets & iPads (768px – 1024px)**: 2-column card layouts, responsive Leaflet map controls, and flexible header stats.
- **Desktops & Laptops (1024px+)**: Full multi-column dashboard, 3-column cuisine grids, and side-by-side Recharts visualizations.

---

## 🚢 Deployment

### Option 1: Render Single Web Service (Recommended ⭐)
Deploy both the Express API and the Vite React frontend on a **single Render Web Service**. This uses only **1 free tier slot**, completely eliminates CORS cross-origin complexities, and ensures 100% reliable same-origin cookie authentication across all web browsers.

1. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Web Service**.
2. Connect your GitHub repository (`travelai`).
3. Set the following fields in the Render dashboard:
   - **Name**: `travelai` (or any name you prefer)
   - **Region**: Nearest to your users (e.g., *Singapore*, *Frankfurt*, *Oregon*)
   - **Branch**: `main`
   - **Root Directory**: *(Leave blank / empty)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Add the following **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production optimizations |
   | `PORT` | `10000` | Default Render port |
   | `MONGODB_URI` | `mongodb+srv://...` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | *(Generate a 32+ character random string)* | Secret for auth tokens |
   | `GEMINI_API_KEY` | *(Your Gemini API Key)* | From Google AI Studio |
   | `GEMINI_MODEL` | `gemini-2.5-flash` | Fast, cost-efficient model |
   | `GROQ_API_KEY` | *(Optional)* | For automatic failover |
   | `SERVE_STATIC` | `true` | *(Optional, auto-detected when built)* |
5. Click **Create Web Service**. Render will automatically build the backend with `tsc`, compile the frontend with `vite build`, and serve both seamlessly from your single Render URL (`https://your-service.onrender.com`)!

> **Why Single Service?**
> - **Zero CORS Issues**: Because the frontend and backend share the exact same domain and port, there are no CORS headers or preflight requests needed.
> - **Bulletproof Auth Cookies**: Authentication cookies are treated as first-party (same-site), avoiding third-party cookie restrictions in Safari, Chrome, and Firefox.
> - **100% Free Tier Friendly**: Uses only 1 Render free service instance.

---

### Option 2: Split Render Services (Blueprint / render.yaml)
If you prefer decoupling the frontend as a Render Static Site and the backend as an Express Web Service, use Render's Blueprint feature with the provided [`render.yaml`](file:///d:/Projects/travelai/render.yaml).

---

### Option 3: Monorepo Vercel Deployment
The repository includes pre-configured [`backend/vercel.json`](file:///d:/Projects/travelai/backend/vercel.json) settings for deploying the API to Vercel Serverless Functions:
1. Connect the GitHub repository to [Vercel](https://vercel.com).
2. Configure Environment Variables in the Vercel dashboard (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NODE_ENV=production`).
3. Deploy!

### Production Build Verification
To verify the full production build locally from the monorepo root:

```bash
# Builds both backend (tsc) and frontend (vite build)
npm run build
```

---

## 🚀 Deploy checklist (Milestone 6+)

Run this **once right after the first deploy** against every new MongoDB database — including each environment (local / staging / production) of the same cluster:

```bash
npm run migrate:members
```

It backfills legacy trips with their owner `members[]` row and `rev` for Milestone 6 access control. It is idempotent and additive — re-running is always safe. **New trips no longer need it:** since 2026-10-20 a schema `pre('validate')` hook seeds the creator as `owner` on every newly created document (generate, stream, duplicate, seeds, scripts). The script remains for rows created before that fix.

> **Why it is required for legacy rows:** since sprint E4, authorization reads `members[]` only (the pre-backfill creator fallback was removed for security reasons — a left/transferred owner would otherwise keep access). A trip without member rows appears in list results but answers 404 on open until backfilled. The read-only audit tool `backend/scripts/db-audit.mts` lists every database on the cluster with its `trips` and `legacyNoMembers` counts (0 remaining = done):
> ```bash
> $env:AUDIT_URI='<database-uri>'; npx tsx scripts/db-audit.mts   # from backend/
> ```

---

## 🔒 Security & Best Practices
- **No Secret Leaks**: Strict `.gitignore` configurations ensure zero `.env` or sensitive credentials enter git history.
- **HTTP-Only Cookies**: Authentication tokens are stored in `httpOnly`, `secure`, `sameSite: none` cookies to mitigate XSS attacks.
- **Input Validation**: All incoming API payloads are parsed and validated with strict [Zod](https://zod.dev/) schemas before processing.
- **Security Headers & Rate Limiting**: `helmet` sends a Content-Security-Policy allow-list (self-only scripts, explicit map/Cloudinary/Unsplash image origins, same-origin API plus Nominatim) and `express-rate-limit` brakes auth, generation, day rebuilds and collaboration writes. `/api/auth/me` returns a narrow profile projection, never the user document.
- **Untrusted Uploads**: Receipt uploads are size-capped (`MAX_UPLOAD_MB`), MIME-allow-listed, **magic-byte verified** (a renamed executable is rejected), stored under server-generated filenames, and served with `X-Content-Type-Options: nosniff`. Deleting an expense or its receipt removes the stored file.

---

## 📄 License
This project is open source and available under the [MIT License](LICENSE).
