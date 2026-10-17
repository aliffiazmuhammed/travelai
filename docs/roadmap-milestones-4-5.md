# TravelAI — Roadmap: Map & Geo (Milestone 4) + Budget & Financial (Milestone 5)

> Status: **All sprints implemented** — sub-milestones 4.1–4.6 and 5.1–5.5 are shipped (see §9–§12).
> Continues from **Milestone 1 — Trip Management & Editing** and **Milestone 2 — AI Prompt Improvements**.
> This document breaks the two feature groups into independently shippable sub-milestones with backend, frontend, data-model, testing, and acceptance details.

---

## 0. Current State (baseline)

**Map & Geo**
- `frontend/src/components/dashboard/TripMap.tsx` renders Leaflet (`react-leaflet` + `leaflet`) with a hardcoded `DESTINATION_COORDS` dictionary (80+ hubs) and a Nominatim geocoding fallback.
- Activity `coordinates: [lat, lng]` are already part of the itinerary contract (`ActivityItem`).
- Routes are **straight dashed polylines** between activity pins — no real distance, no travel time, no drawing, no weather, no nearby search.

**Budget & Financial**
- `frontend/src/components/dashboard/BudgetVisualizer.tsx` shows a Recharts donut + daily bar from the **AI-estimated** `budget_breakdown`.
- INR-only, planned-only (no actual spend), no participants, no receipts, no currency conversion.

**Reusable foundations already in place**
- Trip documents store arbitrary itinerary JSON (`tripDetails`) and now expose version snapshots + `generationMeta`.
- Backend has a pure-helper + `node:test` testing convention (`backend/src/services/**`), a TTL cache (`backend/src/services/ai/cache.ts`), Zod validation middleware, and `AppError` error handling.

---

## 1. Guiding Architecture Decisions

1. **Proxy all third-party geo/finance APIs through the backend.** Keeps API keys, CORS, rate limits and provider quirks off the client. New `backend/src/services/geo/*` + `backend/src/services/finance/*` layers.
2. **Cache aggressively per provider** (reuse the TTL cache pattern, but with per-provider TTLs). Weather/currency are time-sensitive; OSM POIs and geocoding are effectively static.
3. **Pure, testable math** for distances, travel time, weather risk, currency conversion and bill settlement — mirror of the Milestone 1/2 approach (`*.ts` + `*.test.ts`).
4. **Keep AI itinerary content and user/trip metadata separate.** Expenses, participants, custom routes, weather cache and currency snapshot live at the **Trip root**, *not* inside `tripDetails` — so they never pollute the AI JSON schema or create noisy version snapshots.
5. **Editing stays gated on `onSave`.** Map drawing and expense editing only render when the trip is persisted/editable (the public shared view stays read-only).
6. **Graceful degradation.** Every external provider has a fallback (haversine when routing is down, stored rate snapshot when FX is down, cached/empty state when weather is unavailable).

---

## 2. Milestone 4 — Map & Geo Features

### 4.1 Geo Math Foundation — `P0`
**Goal:** One shared, dependency-free source of truth for geo math.

- **Backend:** `backend/src/services/geo/distance.ts` — `haversineKm(a, b)`, `pathLengthKm(points)`, `bearing`, `centroid`, `boundingBox`, `formatDistance`, `estimateTravelMinutes(km, mode)`.
- **Frontend:** `frontend/src/lib/geo.ts` — identical pure functions (small, duplicated intentionally to avoid a shared package for now; can be lifted into a `packages/shared` later).
- **Tests:** `distance.test.ts` (known city pairs, zero-distance, antimeridian edge, mode speeds).
- **Acceptance:** distances match reference values within ~0.5%; pure functions have unit tests.
- **Effort:** 0.5–1 dev-day.

### 4.2 Distance & Travel-Time Between Activities — `P0`
**Goal:** Show real distances/times between consecutive activities per day and per day total.

- **Backend:** `POST /api/geo/route` — body `{ points: [[lat,lng],...], mode }` → `{ legs: [{ fromIndex, toIndex, km, minutes }], totalKm, totalMinutes, provider }`. Uses haversine by default; optional OSRM when `GEO_ROUTING_PROVIDER=osrm` (walking/driving profiles), with haversine fallback on failure. Cached by rounded coordinates + mode.
- **Frontend (`TripMap.tsx`, `DayTimeline.tsx`):** per-leg chips between activity cards (`→ 4.2 km · ~12 min drive`), day total in the map filter bar, summed trip distance in `TripHeader` quick stats.
- **Tests:** route-leg assembly, provider fallback, empty/single-point input.
- **Acceptance:** distances render on timeline + map; totals are correct; works offline (haversine).
- **Effort:** 1.5–2 dev-days.

### 4.3 User-Drawn Custom Routes — `P1`
**Goal:** Draw, edit, name and persist custom paths (detours, treks, alternative drives) on the map.

- **New dep:** `@geoman-io/leaflet-geoman-free` (MIT, maintained) *or* `leaflet-draw`. Geoman preferred (better UX, actively maintained).
- **Data model (Trip root):**
  ```ts
  customRoutes: [{
    id: string;
    name: string;
    day?: number;          // optional day association
    color: string;
    mode: 'walk' | 'drive' | 'bike';
    points: [number, number][];
    distanceKm: number;    // computed server-side on save
    createdAt: Date;
  }]
  ```
- **Backend:** `PUT /api/itinerary/:id/routes` (replace list, size-capped e.g. max 20 routes / 500 points each), `DELETE /api/itinerary/:id/routes/:routeId`. Validates coords, recomputes `distanceKm`. Ownership enforced. No version snapshot (metadata, not itinerary content).
- **Frontend:** draw/edit/drag/delete toolbar (only when `onSave` present), rename + colour + mode controls, rendered as solid `Polyline`s with a sidebar list; autosave with debounce.
- **Tests:** route validation (bounds, point caps), distance recompute.
- **Acceptance:** draw → save → reload persists; distances auto-calculated; read-only view cannot draw.
- **Effort:** 2–3 dev-days.

### 4.4 Weather-Integrated Routing & Advisories — `P1`
**Goal:** Warn about rain/flood/heat per day and steer suggestions indoors; optionally route around high-risk areas.

- **Provider:** [Open-Meteo](https://open-meteo.com) (free, no key). Forecast for near dates; climate/seasonal normals fallback for far-future dates.
- **Backend:** `backend/src/services/geo/weather.ts` + `GET /api/geo/weather?lat&lng&start&end` → per-day `{ date, tempMin, tempMax, precipitationMm, precipitationProbability, windKph, riskLevel: none|low|moderate|high, advisories: string[] }`. Risk thresholds tuned for Indian travel (monsoon/landslide warnings). Cache 30–60 min.
- **Frontend:** risk badges + advisory tooltips in `DayTimeline`; map overlay/markers tinted by risk; a **"Suggest indoor alternative"** action that reuses the Milestone 2 prompt with a weather constraint and offers a replacement day.
- **Integration with 4.2 (weather-aware routing, `P2`):** flag legs that cross high-risk days and propose reordering or indoor swaps.
- **Tests:** risk mapping thresholds, advisory text, provider failure → graceful empty state.
- **Acceptance:** per-day weather shown; high-rain days flagged; caching verified.
- **Effort:** 2–3 dev-days.

### 4.5 Nearby Search — `P1`
**Goal:** Find restaurants, cafés, ATMs, pharmacies, fuel and attractions near a planned activity and optionally add them to the itinerary.

- **Provider:** [Overpass API](https://overpass-api.de) (OSM, free). Server-side proxy avoids CORS + applies rate limiting/caching.
- **Backend:** `GET /api/geo/nearby?lat&lng&category=restaurant|cafe|atm|pharmacy|attraction|fuel&radius=2000` → normalized `[{ name, category, coords, distanceKm, tags: { cuisine?, opening_hours? } }]`, sorted by distance, capped (e.g. 20). Cache 24h.
- **Frontend:** "Nearby" panel per day/activity; results as map markers; **"Add as activity"** inserts into that day (reuses existing activity persistence from Milestone 1).
- **Tests:** Overpass response normalization, category mapping, radius guard rails.
- **Acceptance:** search returns results; adding a POI updates+persists the itinerary.
- **Effort:** 2 dev-days.

---

## 3. Milestone 5 — Budget & Financial Features

### 5.1 Expense Ledger Data Model + API — `P0`
**Goal:** Record real spend against the planned budget.

- **Data model (Trip root):**
  ```ts
  participants: [{ id: string; name: string; isMe?: boolean }]
  finance: { baseCurrency: string; exchangeRates?: Record<string, number>; ratesUpdatedAt?: Date }
  expenses: [{
    id: string;
    label: string;
    category: 'accommodation' | 'food_and_drinks' | 'activities_and_entry' | 'local_transport' | 'miscellaneous_buffer' | 'other';
    amount: number;
    currency: string;
    amountInBase: number;
    exchangeRate: number;
    date: Date;
    day?: number;
    paidBy?: string;            // participant id
    split: { mode: 'none' | 'equal' | 'custom'; shares?: { participantId: string; amount: number }[] };
    notes?: string;
    receiptUrl?: string;
    createdAt: Date;
  }]
  ```
  > Embedded subdocuments keep trips atomic and simple. If expense volume becomes large, extract to a dedicated `Expense` collection keyed by `tripId` (documented migration path).
- **Backend:** Zod schemas + `GET/POST /api/itinerary/:id/expenses`, `PUT/DELETE /api/itinerary/:id/expenses/:expenseId`, `PUT /api/itinerary/:id/participants`. Server computes `amountInBase`. Ownership enforced. Expenses are metadata → **no itinerary version snapshots**.
- **Frontend types + `api.ts` methods.**
- **Tests:** schema validation, `amountInBase` computation, auth scoping.
- **Acceptance:** full CRUD over expenses + participants.
- **Effort:** 2 dev-days.

### 5.2 Real-Time Cost Tracking UI — `P0`
**Goal:** Live planned-vs-actual analytics during the trip.

- **Frontend:** new **"Expenses"** tab in `ItineraryDisplay` (7th tab) with an add/edit expense modal, list grouped by day/category, running totals.
- **Analytics (`BudgetVisualizer` extension or new `ExpenseTracker.tsx`):** grouped Recharts bar (planned vs actual per category), variance %, remaining budget, projected overspend, daily burn-down.
- **Acceptance:** adding an expense updates all totals/charts instantly; variance math is correct.
- **Effort:** 2–3 dev-days.

### 5.3 Currency Conversion — `P1`
**Goal:** Support international travellers entering/reading amounts in multiple currencies.

- **Provider:** [Frankfurter](https://frankfurter.app) (ECB, no key) primary; `exchangerate.host` optional; manual override supported.
- **Backend:** `backend/src/services/finance/currency.ts` + `GET /api/geo/currency/rates?base=INR&symbols=USD,EUR,AED,...`. Cache 12h. On trip creation/expense entry, snapshot used rates into `trip.budget.exchangeRates` so totals stay stable offline.
- **Frontend:** base-currency selector; per-expense currency input; totals converted; display currency symbol formatting (reuse/introduce a small `formatMoney(amount, currency)`).
- **Tests:** conversion math, missing-rate fallback to snapshot, symbol formatting.
- **Acceptance:** totals correct across currencies; offline uses snapshot.
- **Effort:** 1.5–2 dev-days.

### 5.4 Bill Splitting Calculator — `P1`
**Goal:** Track who paid and settle group expenses with minimal transfers.

- **Pure logic:** `backend/src/services/finance/settlement.ts` (mirrored in frontend `lib/settlement.ts`) — net balances per participant, then greedy **minimise-transactions** settlement. Also per-person and per-category summaries.
- **UI:** participants manager; per-expense payer + split mode (equal / custom / excluded); "Settle Up" panel showing who owes whom.
- **Tests:** balances sum to zero; unequal/custom shares; multi-payer scenarios; minimal-transfer correctness.
- **Acceptance:** settlement is correct and balanced for all split modes.
- **Effort:** 1.5–2 dev-days.

### 5.5 Receipt Upload — `P2`
**Goal:** Attach receipt images/PDFs to expenses.

- **Backend:** `POST /api/itinerary/:id/expenses/:expenseId/receipt` (multipart via `multer`). Validate MIME (`jpeg/png/webp/pdf`) + size (≤ `MAX_UPLOAD_MB`, default 5). Storage: local `UPLOAD_DIR` (dev) with static serving; **Cloudinary/S3 recommended for serverless prod** (ephemeral disks). Returns `receiptUrl`; delete removes the file.
- **Frontend:** file input + thumbnail preview + remove in the expense modal/row.
- **Security:** sanitize filenames, never trust client MIME alone, auth + ownership on every upload.
- **Acceptance:** upload → preview → delete works; bad types/sizes rejected.
- **Effort:** 1.5–2 dev-days.

---

## 4. Cross-Cutting Work (both milestones)

| Area | Work |
|---|---|
| **Validation** | Zod schemas for every new endpoint (`geo`, `expenses`, `participants`, `routes`, `receipt`). |
| **Caching** | Extend the TTL cache with per-provider TTLs (weather 45 min, FX 12 h, POI/geocode 24 h, routes 24 h). |
| **Rate limiting** | Dedicated limiter for `/api/geo/*` (external providers). |
| **Error handling** | `AppError` for all failures; provider outages degrade gracefully (never 500 the trip view). |
| **Tests** | `node:test` for all pure logic (geo, weather risk, FX, settlement, variance). |
| **Docs** | README: features, endpoint table, directory tree, env vars, architecture diagram. |
| **Types** | `frontend/src/types/trip.ts`: `TripExpense`, `TripParticipant`, `CustomRoute`, `WeatherDay`, `NearbyPlace`, `TripCurrency`. |
| **Responsive/a11y** | Drawing + expense modals mobile-friendly; keyboard-accessible controls; `prefers-reduced-motion` for map fly-to. |

---

## 5. Delivery Sequence

```mermaid
flowchart LR
  subgraph S1["Sprint A — Foundations (Wk 1-2) ✅"]
    A1[4.1 Geo math]
    A2[4.2 Distances & travel time]
    A3[5.1 Expense model + API]
    A4[5.2 Cost tracking UI]
  end
  subgraph S2["Sprint B — Interactive (Wk 3) ✅"]
    B1[4.3 Custom routes]
    B2[5.3 Currency conversion]
    B3[5.4 Bill splitting]
  end
  subgraph S3["Sprint C — Intelligence (Wk 4) ✅"]
    C1[4.4 Weather advisories]
    C2[4.5 Nearby search]
  end
  subgraph S4["Sprint D — Polish (Wk 5) ✅"]
    D1[5.5 Receipt upload]
    D2[4.6 Weather-aware routing]
    D3[Docs + tests + a11y]
  end
  A1 --> A2 --> B1
  A3 --> A4 --> B2
  A3 --> B3
  A2 --> C1
  C1 --> D2
  B3 --> D1
```

**Sequencing rationale:** geo math + distances and expense ledger + tracking deliver the highest user value first and unblock everything else. Weather and nearby search are additive and independent once distances exist. Receipts and weather-aware routing are the lowest-priority polish items.

**Dependency notes**
- 4.2 depends on 4.1 · 4.3 depends on 4.1/4.2 · 4.6 depends on 4.2 + 4.4.
- 5.2/5.3/5.4/5.5 all depend on 5.1.

---

## 6. New Dependencies

| Package | Purpose | Where | Notes |
|---|---|---|---|
| ~~`@geoman-io/leaflet-geoman-free`~~ | Draw/edit routes on the map | frontend | **Not needed** — 4.3 shipped as a dependency-free click-to-draw mode built on `react-leaflet`'s `useMapEvents` |
| `multer` (+ `@types/multer`) | Receipt multipart upload | backend | ✅ Sprint D |
| *(none)* | Distances, weather, FX, settlement | — | Implemented as pure code + `fetch` against free APIs |

New env vars (documented in `backend/.env.example`):

| Variable | Default | Purpose | Shipped |
|---|---|---|---|
| `GEO_ROUTING_PROVIDER` | `haversine` | `haversine` \| `osrm` | ✅ Sprint A |
| `OSRM_BASE_URL` | public demo | Routing provider endpoint | ✅ Sprint A |
| `OVERPASS_ENDPOINT` | public | POI/nearby search | ✅ Sprint C |
| `OPEN_METEO_BASE` | public | Weather | ✅ Sprint C |
| `CURRENCY_RATES_PROVIDER` | `frankfurter` | FX provider | ✅ Sprint B |
| `CURRENCY_CACHE_TTL_MS` | `43200000` (12h) | FX cache TTL | ✅ Sprint B |
| `UPLOAD_DIR` | `<backend>/uploads` | Receipt storage (dev) | ✅ Sprint D |
| `MAX_UPLOAD_MB` | `5` | Upload size cap | ✅ Sprint D |
| ~~`CLOUDINARY_URL`~~ | — | Optional prod receipt storage | ❌ Not wired — see §12 |
| `WEATHER_CACHE_TTL_MS` | `2700000` (45m) | Weather cache TTL | ✅ Sprint C |
| `NEARBY_CACHE_TTL_MS` | `86400000` (24h) | POI cache TTL | ✅ Sprint C |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Public Overpass/OSRM/Nominatim usage policies or rate limits | Server-side proxy + aggressive caching + configurable endpoints + fallback logic |
| Weather provider outage / far-future dates | Climate/seasonal fallback; degrade to "no advisory" instead of erroring |
| FX provider downtime or stale rates | Snapshot rates onto the trip; manual override |
| Ephemeral disk on Render/Vercel breaks uploads | Recommend Cloudinary/S3 for prod; document local-dev-only path |
| Map-draw saves spamming the API | Debounced autosave + size caps on routes/points |
| Expense array growth hurting trip payloads | Caps + documented migration to a dedicated `Expense` collection |
| Bundle size from Geoman | Lazy-load the map tab / dynamic import of draw plugin |

---

## 8. Definition of Done (per sub-milestone)

- [ ] Backend endpoint(s) implemented with Zod validation + ownership checks.
- [ ] Pure logic extracted and unit-tested with the Node test runner (`npm test`).
- [ ] Frontend UI wired, type-safe (`tsc --noEmit`) and lint-clean for changed files.
- [ ] Changes to itinerary content are persisted; unrelated metadata does **not** create version snapshots.
- [ ] Read-only/shared view stays unaffected.
- [ ] Graceful degradation verified for provider failure/offline.
- [ ] README (features, endpoints, env, structure) updated.
- [ ] `npm run build` (backend + frontend) and `npm test` pass.

---

## 9. Sprint A — Implementation Notes (shipped)

Sprint A delivered the four foundational sub-milestones. Notes and deviations from the plan above:

**Backend**
- `services/geo/distance.ts` — pure haversine/travel-time helpers (kept dependency-free; mirrored on the client rather than shared).
- `services/geo/route.ts` — `computeRoute()` uses haversine by default and OSRM when `GEO_ROUTING_PROVIDER=osrm`, with automatic fallback on any provider error.
- `services/finance/expenses.ts` — `computeAmountInBase`, `computeEqualShares` (rounding-safe), `summarizeExpenses`.
- `POST /api/geo/route` mounted at `/api/geo` (auth required, Zod-validated 2–50 points).
- Expense CRUD + participants endpoints added to `/api/itinerary`; `sanitizeTrip` extracted to `utils/sanitizeTrip.ts` and shared.
- Trip model gained `participants[]`, `expenses[]` and a `finance` root subdocument (**named `finance`, not `budget`, to avoid confusion with the AI `budget_breakdown`**). Equal splits are derived server-side; expenses never create itinerary version snapshots.
- New unit tests: `geo/distance.test.ts`, `geo/route.test.ts`, `finance/expenses.test.ts` (backend suite now **42 tests**).

**Frontend**
- `lib/geo.ts` mirrors the backend math so distances render instantly and offline; `lib/budget.ts` holds category metadata + planned-vs-actual helpers.
- `DayTimeline` shows a distance/time chip between located activities plus a per-day total; `TripMap` shows the selected day's route total, refined by the backend endpoint with a local fallback.
- New `ExpenseTracker` + `ExpenseEditor`, wired as a 7th **Expenses** tab in `ItineraryDisplay`; `Dashboard` passes `expenses`, `participants` and `finance`.
- Travellers can be added/removed; expenses support description, amount, category, date, day, payer and none/equal splitting.

**Deliberately deferred to later sprints** (unchanged from above): custom route drawing (4.3), weather (4.4), nearby search (4.5), currency conversion (5.3), custom/unequal splits + settlement (5.4), receipt upload (5.5).

**Known follow-ups**
- The trips list endpoint returns expenses inline (the dashboard uses it as the detail payload); extract to a dedicated `Expense` collection if ledgers grow large.
- Server-side caching of OSRM responses is not yet implemented (haversine is instant; OSRM is only called on demand for the selected day).

---

## 10. Sprint B — Implementation Notes (shipped)

Sprint B delivered the three interactive sub-milestones. Notes and deviations from the plan above:

**4.3 User-Drawn Custom Routes**
- **Dependency-free drawing**: instead of `@geoman-io/leaflet-geoman-free`, the map has a *Draw Route* mode built on `react-leaflet`'s `useMapEvents`. Clicking the map appends vertices (with undo), the draft renders as a dashed polyline with vertex markers, and *Finish* opens `RouteEditor` (name, travel mode, trip day, colour). This keeps the client bundle lean and matches the earlier decision to prefer native browser primitives over new packages.
- Data model: `customRoutes: [{ name, day?, color, mode, points: [lat,lng][], distanceKm, createdAt }]` hangs off the trip root, so — like expenses — it never creates an itinerary version snapshot.
- Endpoints are **granular** (`POST` / `PUT /:routeId` / `DELETE /:routeId`) rather than the single `PUT /:id/routes` replace-list in the original plan; this is consistent with the rest of the app's editing API.
- Caps enforced server-side: 20 routes per trip, 500 points per route. `services/geo/customRoute.ts` normalizes points (drops out-of-range/malformed coordinates) and always **recomputes `distanceKm`** so clients cannot inject bogus lengths.
- Route list renders below the map with edit/delete; drawn routes also appear in the read-only shared view. Duplicating a trip carries the drawn routes over.
- Tests: `services/geo/customRoute.test.ts` (coordinate filtering, point caps, distance recompute, drawable-route check).

**5.3 Currency Conversion**
- Provider: [Frankfurter](https://frankfurter.app) (ECB reference rates, no API key) for 30 supported currencies, cached in-memory for `CURRENCY_CACHE_TTL_MS` (default 12 h).
- **Rate semantics are explicit and uniform**: `rates[X]` is the value of **one unit of X in the trip's base currency** (base INR → `rates.USD ≈ 85.5`). That is exactly `ITripExpense.exchangeRate`, so `amountInBase = amount * rate` holds for the API, the DB and both mirrors. Frankfurter's inverted `1 base = X` response is flipped once via `invertRates()`.
- `GET /api/geo/currency/rates?base=INR&symbols=…` exposes the snapshot. `PUT /api/itinerary/:id/finance` changes the base currency and/or refreshes rates: it fetches every supported currency in one call, re-converts **all** existing expenses, scales custom shares proportionally (so they still sum to the total), recomputes equal splits and writes `finance.exchangeRates` + `ratesUpdatedAt`.
- Adding an expense in a foreign currency resolves its rate in priority order: explicit `exchangeRate` → trip snapshot → live single-currency lookup → friendly `502` (manual rate always accepted).
- UI: a *Currency & Rates* card in the Expense tab (base-currency selector + refresh), and the expense modal gained a currency selector plus an editable rate with a live "≈ ₹X recorded" preview. Foreign-currency rows show the original amount alongside the converted total.
- Tests: `services/finance/currency.test.ts` (inversion, rounding, missing/invalid rates, lookup bounds, cache).

**5.4 Bill Splitting Calculator**
- Pure logic in `services/finance/settlement.ts` (mirrored frontend-side as `lib/settlement.ts`): `computeBalances()` gives each traveller `paid` / `share` / `net`, and `minimizeTransfers()` runs a greedy largest-debtor-vs-largest-creditor pass producing **at most `n-1` transfers**. All maths runs in integer cents to avoid float drift.
- `splitMode` is `none` (borne entirely by the payer, keeps solo ledgers zero-sum) / `equal` (server-derived, rounding-safe) / `custom` (explicit per-person shares, validated to sum to the expense total within half a cent).
- Removing or adding travellers re-derives equal splits; changing the base currency rescales custom shares by the amount ratio.
- UI: the expense modal offers *Not split / Split equally / Custom amounts* (leave someone at 0 to exclude them, with a live allocated-vs-total indicator), and a *Settle Up* card lists each traveller's balance plus the minimal set of suggested transfers (or "Everyone is settled up").
- Tests: `services/finance/settlement.test.ts` (zero-sum nets, equal/custom/unsplit attribution, multi-payer ledgers, rounding resolution, unknown payers) plus `rescaleShares` / `sharesMatchTotal` cases in `finance/expenses.test.ts`.

**Verification (Sprint B)**: backend `npm run build` ✅ · backend `npm test` **61/61** ✅ (was 42) · frontend `npx tsc --noEmit` ✅ · frontend `npm run build` ✅ · new/changed frontend files ESLint-clean (only the pre-existing `TripMap` `no-empty` and `api.ts` `no-explicit-any` findings remain, untouched).

**Still deferred**: weather advisories (4.4), nearby search (4.5), weather-aware routing (4.6), receipt upload (5.5).

---

## 11. Sprint C — Implementation Notes (shipped)

Sprint C delivered the two remaining read-only geo features of Milestone 4 (4.4 + 4.5).

**4.4 Weather Advisories**
- Provider: [Open-Meteo](https://open-meteo.com) (free, no key) via `backend/src/services/geo/weather.ts`. One request returns the whole trip window's daily `temperature_2m_max/min`, `precipitation_sum`, `precipitation_probability_max`, `wind_speed_10m_max` and `weather_code`.
- **Deviation — seasonal fallback instead of the climate API**: the plan suggested Open-Meteo's climate endpoint for far-future dates. That API wants long multi-decade ranges and specific model IDs, so it is a poor fit for a 3–7 day trip. Instead the fallback is a deterministic, unit-tested **seasonal normals table** (`seasonalNormals()`) driven by month + latitude: monsoon (Jun–Sep) ⇒ moderate rain risk, October ⇒ retreating monsoon, summer ⇒ heat, Himalayan winter ⇒ cold nights. It is also used whenever the provider errors out, so the UI always has an advisory (`source: 'seasonal'` and the note *"not a live forecast"* are surfaced in the badge).
- All threshold + copy logic is pure: `classifyRisk()` (rain dominates, then heat ≥ 36/40 °C, then wind ≥ 45/60 km/h), `buildAdvisories()` (landslide-prone hill roads, ORS/electrolytes for heat, layers for cold nights, suspended boat rides/cable cars for wind, plus a monsoon reminder in Jun–Sep), `summarizeDay()`, `normalizeOpenMeteoDaily()`, `dateRange()` (inclusive, capped at 16 days, safe on reversed/invalid input) and `pickAnchor()`.
- `GET /api/geo/weather?lat&lng&start&end` — cached in-memory for `WEATHER_CACHE_TTL_MS` (45 min) keyed by rounded coordinate + window.
- **Enabling change**: trips now persist a planned window. `Trip.startDate` / `Trip.endDate` are written at generation time by `resolveTripWindow()` (end date derived from trip length when only a start date was supplied) and returned to the client, which is what makes per-day forecasts possible.
- `POST /api/itinerary/:id/days/:day/indoor-alternative` reuses the Milestone 2 prompt stack: it resolves the day's anchor coordinate and date, fetches that day's advisory, and calls `buildDayAlternativePrompt()` — a focused prompt that switches to an explicitly **indoor-first** brief when risk is `moderate`/`high`, forbids repeating the existing activities, and requests strict JSON (`{ rationale, activities[] }`). The response is a **proposal only** — nothing is persisted until the user clicks *Apply*, which replaces the day through the normal editing path so version snapshots and undo keep working.
- UI: a colour-coded `WeatherBadge` (temps · mm · wind + risk label, tooltip = advisories) on every day, an inline advisory panel for risky days, risk dots on the map's day pills, and a *Suggest indoor alternative* dialog (`DayAlternativeDialog`) with rationale, per-activity cost, *Regenerate* and *Apply to Day N*.

**4.5 Nearby Search**
- Provider: [Overpass API](https://overpass-api.de) (OpenStreetMap, free, no key) proxied server-side via `backend/src/services/geo/nearby.ts`, so the browser never hits CORS and the public endpoint sees one cached query per coordinate/category rather than one per user.
- Categories map to Overpass tag filters: `restaurant`, `cafe`, `attraction` (`tourism=attraction|museum|viewpoint`), `atm`, `pharmacy`, `fuel`. Nodes and ways are both queried (`out center` gives ways a usable coordinate).
- Pure, unit-tested helpers: `buildOverpassQuery()`, `elementCoordinates()`, `clampRadius()` (200 m – 5 km, default 2 km) and `normalizeOverpassElements()`, which drops unnamed POIs, de-duplicates the same place mapped as both node and way, discards out-of-radius results, sorts by great-circle distance and caps at 20 with `{ cuisine, openingHours, website, phone, address }` tags.
- `GET /api/geo/nearby?lat&lng&category&radius` — cached for `NEARBY_CACHE_TTL_MS` (24 h) and **never throws**: provider failure resolves to an empty list plus an explanatory note.
- UI: a `NearbyExplorer` panel above the map with a day picker, category chips and a radius selector; results show distance, address, cuisine and opening hours. Results are published up to `TripMap` and rendered as amber circle markers (with a legend entry), and *Add to Day N* appends the place to that day as a normal activity — persisted through the existing debounced autosave, so no new write endpoint was needed.

**Cross-cutting**
- `backend/src/utils/parseQuery.ts` was added because the shared `validate` middleware only inspects `req.body` and Express keeps `req.query` read-only. GET endpoints now parse and coerce their parameters through Zod and get a friendly 400 on bad input.
- New env vars (all optional, all with working defaults): `OPEN_METEO_BASE`, `WEATHER_CACHE_TTL_MS`, `OVERPASS_ENDPOINT`, `NEARBY_CACHE_TTL_MS`.
- **Known limitation (documented, intentional)**: both new endpoints sit behind `protect`, matching every other trip endpoint. The public shared-trip view therefore shows neither weather nor nearby results; the nearby panel is hidden there and the weather request is skipped. Making these two read-only lookups public is a small change if that trade-off is ever revisited, but it would expose the server as an unauthenticated proxy to Open-Meteo/Overpass.

**Verification (Sprint C)**: backend `npm run build` ✅ · backend `npm test` **77/77** ✅ (was 61) · frontend `npx tsc --noEmit` ✅ · frontend `npm run build` ✅ · new/changed frontend files ESLint-clean (only the pre-existing `TripMap` `no-empty`, `Dashboard.tsx`/`api.ts` `no-explicit-any` findings remain, untouched).

**Still deferred**: weather-aware routing (4.6), receipt upload (5.5).

---

## 12. Sprint D — Implementation Notes (shipped)

Sprint D closed out both milestones: the last geo feature (4.6 weather-aware routing) and the last finance feature (5.5 receipt upload). *Docs + tests + a11y* landed with them (README, `.env.example`, this document, 101 backend tests).

**4.6 Weather-Aware Routing**
- New pure module `backend/src/services/geo/weatherRouting.ts` cross-references the 4.4 per-day risk with the 4.2 distances between a day's located activities. It answers *"which legs are exposed?"* and *"what should I do about it?"* with **no network and no AI**, so it is fully unit-tested (`weatherRouting.test.ts`, 13 cases) and deterministic.
- Public API: `analyzeWeatherRouting(days)` → `{ dayFlags, riskyLegs, suggestions, summary }`; helpers `buildRiskyLegs()`, `buildDayFlags()`, `buildSuggestions()`, `dayExposureKm()`, `pickTravelReason()`, `candidatePoints()`, `swapDayPlans()`.
- Risk model: a day is *exposed* when its risk is `moderate`/`high`; each consecutive pair of located activities on such a day becomes a `RiskyLeg` carrying km, minutes (via `estimateTravelMinutes`) and a road-flavoured reason (an advisory mentioning roads/landslides/ferries is preferred, else a generic ghat-road explanation).
- Three suggestion types, all explainable and capped at 4:
  - `swap_days` — move a rainy day's plan onto a **dry** day. The partner is chosen as the nearest dry day that no other rainy day has already claimed, so two rainy days never both point at the same date. Skipped when the day's exposure is under 0.5 km (nothing worth reshuffling).
  - `indoor_swap` — `high`-risk days get a "rebuild this day indoors" proposal that hands off to the 4.4 alternative-day flow.
  - `buffer_time` — when a risky day still involves real driving, `+25%` (min 10 min) of its legs' travel time is added as an explicit buffer instead of pretending the schedule holds.
- `GET /api/itinerary/:id/weather-routing` (behind `protect`, owns the trip) sorts the itinerary days, derives the trip window from `Trip.startDate`/`endDate`, anchors the forecast on the first located activity, and reuses the **cached** weather provider — so a trip with cached weather costs no extra upstream call. It persists nothing.
- UI: a `WeatherRoutingCard` at the top of the map tab shows the headline, risk chips per exposed day, the worst exposed legs and the suggestions. Applying one is an explicit click:
  - *Swap Day 2 ↔ Day 4* runs the mirrored `swapDayPlans()` client-side and goes through the normal autosave/edit path, so **version snapshots and undo keep working**.
  - *Suggest indoor Day 3* opens the same dialog the timeline uses.
- **Deviation — one dialog, one owner**: the Milestone 4.4 alternative-day dialog moved out of `DayTimeline` up into `ItineraryDisplay`. `DayTimeline` now takes `onSuggestAlternative` + `alternativeLoadingDay` (trigger and busy state only). Without this, the map's routing card would have needed a second copy of the request/apply logic.
- **Deviation — analysis lives server-side only** (no `lib/` mirror, unlike distances/currency/settlement). The analysis is a non-trivial heuristic; duplicating it would invite drift. Only the tiny `swapDayPlans()` helper is mirrored in `frontend/src/lib/weatherRouting.ts` because the UI must apply the swap locally, plus display labels.

**5.5 Receipt Upload**
- `multer` (`^2.4.0`) with `memoryStorage`, so the file is capped by `MAX_UPLOAD_MB` **before** anything touches the disk and a rejected upload leaves no partial file behind. `middleware/upload.middleware.ts` wraps it as `handleReceiptUpload`, translating `MulterError` into friendly `AppError`s (413 for oversize, 400 for count/unexpected fields) instead of an opaque 500.
- `services/finance/receipt.ts` holds the pure, unit-tested rules (`receipt.test.ts`, 9 cases): the MIME allow-list (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), `sniffMime()` (**magic-byte** detection for all four formats), `contentMatchesMime()`, `sanitizeFilename()`, `buildReceiptFilename()` (server-generated `receipt-<tripTail>-<expenseTail>-<ts>-<rand>.<ext>`, so a hostile `originalname` can never influence the path), `receiptUrlFor()`, `isManagedReceiptUrl()` / `receiptFilenameFromUrl()` (traversal- and foreign-path-proof) and the storage helpers.
- **Security — never trust the client, twice**: the declared MIME type must be on the allow-list *and* the actual bytes must match it. A text file renamed to `.jpg` is rejected before any write. Stored URLs are only ever deleted through `isManagedReceiptUrl()`, so `deleteReceiptFile()` cannot be tricked into unlinking an arbitrary path (covered by tests).
- `POST /api/itinerary/:id/expenses/:expenseId/receipt` (multipart field `receipt`) → validates ownership + expense existence, verifies contents, writes the file, deletes the *previous* file when replacing, saves `expense.receiptUrl`, returns the sanitized trip. `DELETE .../receipt` clears the field and removes the file. Deleting an expense also removes its receipt file, so the uploads directory does not accumulate orphans.
- Files are served read-only from `/uploads` (`express.static` with `index: false`, `dotfiles: 'deny'`, `fallthrough: false`, `X-Content-Type-Options: nosniff`), registered **before** the SPA fallback so `/uploads/<file>` is never rewritten to `index.html`. Filenames embed random bytes → unlisted, not guessable, but not secret either (documented).
- **Storage — Cloudinary CDN, local disk as the fallback** (supersedes the earlier "local disk only" note): `services/finance/receipt.ts` exposes one dispatcher, `saveReceiptFile(filename, buffer, mime)` → `{ url, storage }`. When Cloudinary credentials are present (`CLOUDINARY_URL`, or all three of `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`) the buffer is streamed through `uploader.upload_stream()` into `CLOUDINARY_FOLDER` (default `travelai/receipts`) and the secure HTTPS URL is stored; if no credentials are configured — or if an upload throws — it falls back to local disk in `UPLOAD_DIR` rather than losing the receipt. Deletes are symmetric and non-throwing: `deleteCloudinaryReceipt()` recovers the `public_id` from the stored URL via `parseCloudinaryPublicId()` (with a `raw`-type retry for PDFs), while local files go through the traversal-proof `deleteReceiptFile()`. Reliability: `GET /api/health` reports the active driver (`receiptStorage.provider: 'cloudinary' | 'local'`), and the controllers never branch on storage. **Operational caveat for the local fallback** (documented in `.env.example` and the README): on ephemeral hosts (Render free tier, serverless) uploads disappear on redeploy — mount a persistent disk or configure Cloudinary.
- UI: in the expense modal, *Attach receipt* validates client-side first (`lib/receipt.ts` mirrors the allow-list + size cap for instant feedback), previews images (object URL) or shows a PDF icon, supports *Replace* / *Remove* with an *Undo*, and uploads on save. Creation is two-phase under the hood — the expense is saved first, then the receipt — so a failed upload can never lose the expense (the failure is toasted, not thrown, avoiding a duplicate expense on retry). Ledger rows show a *Receipt* link (image or PDF icon) opening the file in a new tab.

**Cross-cutting**
- Caching was reused rather than re-implemented: the routing endpoint rides the 45-minute weather cache (as designed in §4) and receipt files carry no server-side cache of their own.
- `frontend/vite.config.ts` proxies `/uploads` to the backend in dev, so receipts work identically against the dev server and the single-origin production build.
- `.gitignore` ignores `backend/uploads/` — user uploads are never committed.

**Verification (Sprint D)**: backend `npm run build` ✅ · backend `npm test` **101/101** ✅ (was 77) · frontend `npx tsc --noEmit` ✅ · frontend `npm run build` ✅ · new/changed frontend files ESLint-clean (only the pre-existing `TripMap` `no-empty` and `Dashboard.tsx`/`api.ts` `no-explicit-any` findings remain, untouched). Two real bugs were caught by the new tests: `Number(null) === 0` leaking through the weather number parser, and an over-tight distance assertion in `nearby.test.ts`.

**Every sub-milestone in this document is now implemented (4.1–4.6, 5.1–5.5).**

---

## 13. Post-sprint hardening — Nearby search resilience (shipped)

**Symptom.** The Nearby panel reported *"Nearby search is unavailable right now"* with an empty list. The cause was **not** in our code: the primary public Overpass instance was answering the interpreter with `502 Gateway Timeout` / never responding (>25 s). A single hard-coded `OVERPASS_ENDPOINT` therefore turned an upstream outage into a user-visible dead feature.

**Investigation (all verified against the live services).**

| Instance | Observed behaviour | Verdict |
|---|---|---|
| `overpass-api.de` (+ `lz4`/`z`) | website 200, `/api/interpreter` times out (>25 s) / `502` | primary, but currently degraded |
| `overpass.private.coffee` (== `overpass.kumi.systems`) | landing page 200, interpreter `500` for every request shape (form POST, GET, raw POST) | usable as a fallback when healthy |
| `overpass.openstreetmap.fr` | `403 This service is only available to white-listed usages` | unusable for third parties |
| `overpass.osm.ch` | 200 — `0` elements for Kochi, `10` for Zurich | **Switzerland-only extract**: would silently answer "nothing here" worldwide |
| `overpass.osm.jp`, `overpass.openstreetmap.ru`, `maps.mail.ru` | connection/timeout from this network | unreliable |
| Photon (`photon.komoot.io`) | 200 in ~0.4 s, but the lat/lon bias is far too weak (results 30–4500 km away) | **rejected**: it is a geocoder, not a proximity search |

**Shipped changes.**
- **Multi-endpoint failover.** `overpassEndpoints()` resolves a preference-ordered list: `OVERPASS_ENDPOINTS` (comma-separated) *replaces* it, the deprecated singular `OVERPASS_ENDPOINT` is tried first with the built-in mirrors kept as fallbacks, and with nothing configured the built-in pair is used. Non-`http(s)` entries and duplicates are dropped. The two mirrors that *cannot* work as defaults (the French whitelist and the Swiss extract) are deliberately excluded, with the reason recorded in the code.
- **Bounded latency.** Each attempt is capped by `OVERPASS_TIMEOUT_MS` (6 s) inside a shared `OVERPASS_BUDGET_MS` (10 s) deadline, so a hanging instance can never stall a click indefinitely; once the budget is gone the remaining endpoints are recorded as *skipped* instead of being tried.
- **Honest availability.** A new `available: boolean` on the response is `false` only when *every* endpoint failed. The UI now shows an amber "temporarily unavailable" banner with a **Try again** button, distinct from the neutral "No places found nearby. Try a wider radius." — an empty list is no longer ambiguous between "nothing here" and "we couldn't ask".
- **Circuit breaker.** A failed coordinate/category/radius is remembered for `NEARBY_RETRY_AFTER_MS` (60 s), so hammering a dead provider is instant instead of paying the full budget each time; a different radius is a different lookup and does hit the network. Success clears the breaker.
- **Robust response handling.** The provider's status is never trusted on its own — Overpass also returns HTML error pages with a `200` status, so the body must parse as JSON; every attempt logs its endpoint and failure reason, so an outage is diagnosable from the server log.
- **Tests** (`nearby.test.ts`, 9 cases total): endpoint resolution (defaults, plural replacement, dedupe/filtering, legacy fallback, blank values), the env knobs with nonsense/negative fallbacks, and an end-to-end **outage** test pointing at `http://127.0.0.1:1` (connection refused, so no mocking and no public network) asserting `available: false`, `provider: 'none'`, a `note`, and that an immediate retry returns instantly from the breaker.

**Not changed.** Response caching (24 h), normalization/dedupe/radius rules, the category set and the `GET /api/geo/nearby` contract apart from the additive `available` field.

