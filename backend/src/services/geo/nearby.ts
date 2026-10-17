/**
 * Nearby search (Milestone 4 — Map & Geo, sub-milestone 4.5).
 *
 * Runs server-side so the browser avoids CORS and each coordinate/category is
 * fetched once and cached for `NEARBY_CACHE_TTL_MS` (24h), then normalized into
 * a compact, distance-sorted list.
 *
 * Three providers are chained, first success wins:
 *   1. **Geoapify** — used when `GEOAPIFY_API_KEY` is set. A commercial service
 *      with an SLA that covers every category uniformly; promoted to first place
 *      because it is the only reliable option, but optional (no key, no cost).
 *   2. **Overpass** (OpenStreetMap) — keyless and returns the richest tags, but
 *      volunteer-run and regularly overloaded, so several endpoints are tried in
 *      preference order within a shared budget (`OVERPASS_ENDPOINTS`).
 *   3. **Nominatim** (OpenStreetMap) — keyless last resort. Coverage depends on
 *      per-country special phrases, so some categories are thin; its 1 req/s
 *      policy is respected by serialising lookups.
 *
 * A short failure backoff (`NEARBY_RETRY_AFTER_MS`) keeps repeated clicks from
 * stalling on providers that are known to be down, and a total outage is
 * reported honestly via `available: false` so the UI can say "temporarily
 * unavailable" instead of pretending there is nothing nearby.
 */

import { haversineKm, LatLng } from './distance.js';

export const NEARBY_CATEGORIES = [
  'restaurant',
  'cafe',
  'atm',
  'pharmacy',
  'fuel',
  'attraction',
] as const;

export type NearbyCategory = (typeof NEARBY_CATEGORIES)[number];

export interface NearbyTags {
  cuisine?: string;
  openingHours?: string;
  website?: string;
  phone?: string;
  address?: string;
}

export interface NearbyPlace {
  id: string;
  name: string;
  category: NearbyCategory;
  /** `[lat, lng]` to match the itinerary contract. */
  coordinates: LatLng;
  distanceKm: number;
  tags: NearbyTags;
}

export const DEFAULT_RADIUS_M = 2000;
export const MIN_RADIUS_M = 200;
export const MAX_RADIUS_M = 5000;
export const MAX_RESULTS = 20;

/** Overpass tag filters per category (nodes + ways where applicable). */
const CATEGORY_FILTERS: Record<NearbyCategory, string[]> = {
  restaurant: ['node["amenity"="restaurant"]', 'way["amenity"="restaurant"]'],
  cafe: ['node["amenity"="cafe"]', 'way["amenity"="cafe"]'],
  atm: ['node["amenity"="atm"]'],
  pharmacy: ['node["amenity"="pharmacy"]', 'way["amenity"="pharmacy"]'],
  fuel: ['node["amenity"="fuel"]'],
  attraction: [
    'node["tourism"~"^(attraction|museum|viewpoint)$"]',
    'way["tourism"~"^(attraction|museum|viewpoint)$"]',
  ],
};

export function isNearbyCategory(value: string): value is NearbyCategory {
  return (NEARBY_CATEGORIES as readonly string[]).includes(value);
}

/** Clamps a requested radius into the supported range. */
export function clampRadius(radius?: number | string): number {
  const parsed = Number(radius);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(parsed)));
}

/** Builds the Overpass QL query for a category/radius around a point. */
export function buildOverpassQuery(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number
): string {
  const filters = CATEGORY_FILTERS[category] ?? CATEGORY_FILTERS.attraction;
  const clauses = filters
    .map((filter) => `  ${filter}(around:${radius},${lat},${lng});`)
    .join('\n');
  // `center` gives ways a usable single coordinate; the default `body` mode
  // keeps the tags we surface in the UI.
  return `[out:json][timeout:20];\n(\n${clauses}\n);\nout center ${MAX_RESULTS * 3};`;
}

/** Extracts `[lat, lng]` from an Overpass element (node or way with center). */
export function elementCoordinates(element: any): LatLng | null {
  if (!element) return null;
  const lat = Number(element.lat ?? element.center?.lat);
  const lng = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

function readTags(tags: Record<string, any> | undefined): NearbyTags {
  const source = tags || {};
  const cuisine = String(source.cuisine || '').replace(/;/g, ', ').trim();
  const address = [
    source['addr:housenumber'],
    source['addr:street'],
    source['addr:suburb'] || source['addr:city'],
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    cuisine: cuisine || undefined,
    openingHours: source.opening_hours ? String(source.opening_hours) : undefined,
    website: source.website || source['contact:website'] || undefined,
    phone: source.phone || source['contact:phone'] || undefined,
    address: address || undefined,
  };
}

/**
 * Normalizes an Overpass response into distance-sorted, named places within the
 * radius. Unnamed elements, duplicates and out-of-range entries are dropped.
 */
export function normalizeOverpassElements(
  json: any,
  origin: LatLng,
  category: NearbyCategory,
  radius = DEFAULT_RADIUS_M,
  limit = MAX_RESULTS
): NearbyPlace[] {
  const elements: any[] = Array.isArray(json?.elements) ? json.elements : [];
  const seen = new Set<string>();
  const places: NearbyPlace[] = [];

  for (const element of elements) {
    const name = String(element?.tags?.name || '').trim();
    if (!name) continue;

    const coordinates = elementCoordinates(element);
    if (!coordinates) continue;

    const distanceKm = haversineKm(origin, coordinates);
    if (distanceKm * 1000 > radius * 1.05) continue;

    const dedupeKey = placeKey(name, coordinates);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    places.push({
      id: `osm-${element.type || 'node'}-${element.id}`,
      name,
      category,
      coordinates,
      distanceKm: Number(distanceKm.toFixed(3)),
      tags: readTags(element?.tags),
    });
  }

  return places
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));
}

export type NearbyProvider = 'geoapify' | 'overpass' | 'nominatim' | 'none';

export interface NearbyResult {
  places: NearbyPlace[];
  provider: NearbyProvider;
  radius: number;
  cached?: boolean;
  /**
   * False when no provider could be reached: `places` is then empty because the
   * lookup failed, *not* because the area has nothing to offer.
   */
  available: boolean;
  note?: string;
  /** Attribution required by whichever provider served these results. */
  attribution?: string;
}

const FETCH_TIMEOUT_MS = 6000;
const TOTAL_BUDGET_MS = 10000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_RETRY_AFTER_MS = 60 * 1000; // 1 minute
const DEFAULT_NEARBY_BUDGET_MS = 15000;
const DEFAULT_GEOAPIFY_TIMEOUT_MS = 8000;
const DEFAULT_NOMINATIM_TIMEOUT_MS = 10000;
const DEFAULT_NOMINATIM_MIN_INTERVAL_MS = 1100;

const NEARBY_USER_AGENT = 'TravelAI/1.0 (+https://github.com/travelai; nearby search)';

/** Per-provider attribution, required by Geoapify's free plan and OSM's ODbL. */
const PROVIDER_ATTRIBUTION: Record<Exclude<NearbyProvider, 'none'>, string> = {
  geoapify: 'Powered by Geoapify — place data © OpenStreetMap contributors',
  overpass: 'Place data © OpenStreetMap contributors',
  nominatim: 'Place data © OpenStreetMap contributors',
};

/**
 * Provider order.
 *
 * Overpass is the default because it needs no key and returns the richest OSM
 * tags. Geoapify is promoted to first place when a key is configured: it is a
 * commercial service with an SLA and covers every category uniformly, whereas
 * Overpass is volunteer-run and regularly overloaded. Nominatim is the keyless
 * last resort.
 */
export function nearbyProviderChain(
  apiKey = geoapifyApiKey()
): Exclude<NearbyProvider, 'none'>[] {
  return apiKey ? ['geoapify', 'overpass', 'nominatim'] : ['overpass', 'nominatim'];
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Normalizes a name/coordinate pair into a de-duplication key. */
function placeKey(name: string, coordinates: LatLng): string {
  return `${name.toLowerCase()}|${coordinates[0].toFixed(4)}|${coordinates[1].toFixed(4)}`;
}

/** Validates a `[lat, lng]` pair, rejecting null islands and out-of-range values. */
function coordinatesFrom(lat: unknown, lng: unknown): LatLng | null {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (latNum === 0 && lngNum === 0) return null;
  if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return null;
  return [latNum, lngNum];
}

/** Joins address fragments into one display string, dropping blanks/dupes. */
function joinAddress(parts: unknown[], max = 4): string | undefined {
  const cleaned = parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => part.length > 0);
  const unique = [...new Set(cleaned)];
  return unique.length > 0 ? unique.slice(0, max).join(', ') : undefined;
}

/** Sorts distance-ascending and caps the list. */
function finalize(places: NearbyPlace[], limit: number): NearbyPlace[] {
  return places
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));
}

/* -------------------------------------------------------------------------- */
/* Provider 1 — Geoapify (optional key)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Geoapify hierarchical category keys, taken from the published taxonomy.
 * A parent key also matches its children, so `tourism.attraction` covers
 * viewpoints, and `healthcare.pharmacy` covers pharmacy sub-types.
 */
export const GEOAPIFY_CATEGORIES: Record<NearbyCategory, string> = {
  restaurant: 'catering.restaurant',
  cafe: 'catering.cafe',
  atm: 'service.financial.atm',
  pharmacy: 'healthcare.pharmacy',
  fuel: 'service.vehicle.fuel',
  attraction: 'tourism.attraction,entertainment.museum',
};

export function geoapifyApiKey(): string {
  return String(process.env.GEOAPIFY_API_KEY ?? '').trim();
}

function geoapifyTimeoutMs(): number {
  return envMs('GEOAPIFY_TIMEOUT_MS', DEFAULT_GEOAPIFY_TIMEOUT_MS);
}

/**
 * Builds a Places API request. `filter=circle` bounds the search to the radius
 * and `bias=proximity` orders matches by distance, which is exactly the
 * `around:` semantics the Overpass query uses.
 *
 * The `:` and `,` separators are deliberately left unescaped (they are legal
 * query sub-delimiters) because `URLSearchParams` would encode them.
 */
export function buildGeoapifyUrl(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): string {
  const categories = GEOAPIFY_CATEGORIES[category] ?? GEOAPIFY_CATEGORIES.attraction;
  const query = [
    `categories=${categories}`,
    `filter=circle:${lng},${lat},${radius}`,
    `bias=proximity:${lng},${lat}`,
    `limit=${MAX_RESULTS}`,
    'lang=en',
    `apiKey=${encodeURIComponent(apiKey)}`,
  ].join('&');

  return `https://api.geoapify.com/v2/places?${query}`;
}

/** Reads a cuisine name out of Geoapify's category list (`catering.restaurant.indian`). */
function cuisineFromCategories(categories: unknown): string | undefined {
  if (!Array.isArray(categories)) return undefined;
  for (const entry of categories) {
    const match = /^catering\.restaurant\.([a-z0-9_]+)$/i.exec(String(entry));
    if (match) return match[1].replace(/_/g, ' ');
  }
  return undefined;
}

/**
 * Normalizes a Geoapify `FeatureCollection` into distance-sorted places.
 * GeoJSON positions are `[lng, lat]`, so the pair is swapped to our `[lat, lng]`.
 */
export function normalizeGeoapifyFeatures(
  json: unknown,
  origin: LatLng,
  category: NearbyCategory,
  radius = DEFAULT_RADIUS_M,
  limit = MAX_RESULTS
): NearbyPlace[] {
  const features = Array.isArray((json as any)?.features) ? (json as any).features : [];
  const seen = new Set<string>();
  const places: NearbyPlace[] = [];

  for (const feature of features) {
    const props: Record<string, any> = feature?.properties || {};
    const name = String(props.name || '').trim();
    if (!name) continue;

    const geometry = Array.isArray(feature?.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
    const coordinates =
      coordinatesFrom(geometry[1], geometry[0]) ?? coordinatesFrom(props.lat, props.lon);
    if (!coordinates) continue;

    const distanceKm = haversineKm(origin, coordinates);
    if (distanceKm * 1000 > radius * 1.05) continue;

    const key = placeKey(name, coordinates);
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({
      id: `place-${props.place_id ?? key}`,
      name,
      category,
      coordinates,
      distanceKm: Number(distanceKm.toFixed(3)),
      tags: {
        cuisine: cuisineFromCategories(props.categories),
        openingHours: props.opening_hours ? String(props.opening_hours) : undefined,
        website: typeof props.website === 'string' ? props.website : undefined,
        phone: typeof props.phone === 'string' ? props.phone : undefined,
        address:
          joinAddress([
            props.housenumber,
            props.street,
            props.district || props.suburb,
            props.city || props.county,
            props.postcode,
          ]) ?? joinAddress([props.address_line1, props.address_line2]),
      },
    });
  }

  return finalize(places, limit);
}

/* -------------------------------------------------------------------------- */
/* Provider 2 — Nominatim (keyless last resort)                                */
/* -------------------------------------------------------------------------- */

/**
 * Nominatim "special phrase" per category. Phrases are resolved against
 * per-country phrase files, and their coverage is uneven: restaurant, cafe, atm
 * and fuel are reliable, while pharmacy only matches `[chemist]` and attraction
 * is thin. These are best-effort backstops — a configured Geoapify key is the
 * supported path for full coverage.
 */
export const NOMINATIM_PHRASES: Record<NearbyCategory, string> = {
  restaurant: '[restaurant]',
  cafe: '[cafe]',
  atm: '[atm]',
  pharmacy: '[chemist]',
  fuel: '[fuel]',
  attraction: '[attraction]',
};

function nominatimEndpoint(): string {
  const configured = String(process.env.NOMINATIM_BASE ?? '').trim();
  return configured || 'https://nominatim.openstreetmap.org/search';
}

function nominatimTimeoutMs(): number {
  return envMs('NOMINATIM_TIMEOUT_MS', DEFAULT_NOMINATIM_TIMEOUT_MS);
}

function nominatimMinIntervalMs(): number {
  return envMs('NOMINATIM_MIN_INTERVAL_MS', DEFAULT_NOMINATIM_MIN_INTERVAL_MS);
}

function nearbyBudgetMs(): number {
  return envMs('NEARBY_BUDGET_MS', DEFAULT_NEARBY_BUDGET_MS);
}

/**
 * Bounding box for `viewbox` — Nominatim accepts the two opposite corners and
 * normalises them, so the pair is emitted as `left,minLat,right,maxLat`.
 */
export function nominatimViewbox(lat: number, lng: number, radiusM: number): string {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
    .map((value) => value.toFixed(5))
    .join(',');
}

/**
 * Builds a bounded (`bounded=1`) search restricted to the radius box. `q` holds
 * the bracketed special phrase — free-text queries rank by importance rather
 * than proximity, which is why `[restaurant]` is used instead of `restaurant`.
 */
export function buildNominatimUrl(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  endpoint = nominatimEndpoint()
): string {
  const phrase = NOMINATIM_PHRASES[category] ?? NOMINATIM_PHRASES.attraction;
  const query = [
    `q=${encodeURIComponent(phrase)}`,
    'format=jsonv2',
    `limit=${MAX_RESULTS}`,
    'addressdetails=1',
    'extratags=1',
    'bounded=1',
    `viewbox=${nominatimViewbox(lat, lng, radius)}`,
  ].join('&');

  return `${endpoint}?${query}`;
}

/** Normalizes Nominatim's `lat`/`lon` string results into distance-sorted places. */
export function normalizeNominatimResults(
  json: unknown,
  origin: LatLng,
  category: NearbyCategory,
  radius = DEFAULT_RADIUS_M,
  limit = MAX_RESULTS
): NearbyPlace[] {
  const source = json as any;
  const items: any[] = Array.isArray(source)
    ? source
    : Array.isArray(source?.results)
      ? source.results
      : [];
  const seen = new Set<string>();
  const places: NearbyPlace[] = [];

  for (const item of items) {
    const name = String(item?.name || '').trim();
    if (!name) continue;

    const coordinates = coordinatesFrom(item?.lat, item?.lon);
    if (!coordinates) continue;

    const distanceKm = haversineKm(origin, coordinates);
    if (distanceKm * 1000 > radius * 1.05) continue;

    const key = placeKey(name, coordinates);
    if (seen.has(key)) continue;
    seen.add(key);

    const extras: Record<string, any> = item?.extratags || {};
    const address: Record<string, any> = item?.address || {};

    places.push({
      id: `osm-${item?.osm_type || 'node'}-${item?.osm_id ?? key}`,
      name,
      category,
      coordinates,
      distanceKm: Number(distanceKm.toFixed(3)),
      tags: {
        cuisine: extras.cuisine ? String(extras.cuisine).replace(/;/g, ', ') : undefined,
        openingHours: extras.opening_hours ? String(extras.opening_hours) : undefined,
        website: extras.website || extras['contact:website'] || undefined,
        phone: extras.phone || extras.mobile || extras['contact:phone'] || undefined,
        address: joinAddress([
          address.house_number,
          address.road,
          address.neighbourhood || address.suburb,
          address.city || address.county,
          address.postcode,
        ]),
      },
    });
  }

  return finalize(places, limit);
}


/**
 * Public mirrors, in preference order. Verified against each instance's real
 * behaviour (2025): the main German cluster is the default, `private.coffee` is
 * its own operator. Deliberately **excluded**:
 *   - `overpass.openstreetmap.fr` → 403 "white-listed usages only"
 *   - `overpass.osm.ch` → a Switzerland-only extract, so it answers 200 with an
 *     empty list everywhere else (silently wrong rather than unavailable)
 */
const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function cacheTtlMs(): number {
  return envMs('NEARBY_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS);
}

/** How long a failed lookup is remembered before the provider is retried. */
export function retryAfterMs(): number {
  return envMs('NEARBY_RETRY_AFTER_MS', DEFAULT_RETRY_AFTER_MS);
}

/** Per-attempt timeout for a single Overpass endpoint. */
export function overpassTimeoutMs(): number {
  return envMs('OVERPASS_TIMEOUT_MS', FETCH_TIMEOUT_MS);
}

/** Shared budget across all Overpass endpoints before giving up. */
export function overpassBudgetMs(): number {
  return envMs('OVERPASS_BUDGET_MS', TOTAL_BUDGET_MS);
}

/**
 * Endpoints to try, in order.
 *
 * - `OVERPASS_ENDPOINTS` (comma-separated) replaces the list entirely, so a
 *   deployment can point at its own instance or a regional extract.
 * - `OVERPASS_ENDPOINT` (singular, legacy) is tried first and the built-in
 *   mirrors stay as fallbacks, so older configs gain failover without changes.
 */
export function overpassEndpoints(): string[] {
  const split = (value: unknown): string[] =>
    String(value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => /^https?:\/\//i.test(entry));

  const plural = split(process.env.OVERPASS_ENDPOINTS);
  if (plural.length > 0) return [...new Set(plural)];

  const legacy = split(process.env.OVERPASS_ENDPOINT);
  return [...new Set([...legacy, ...DEFAULT_OVERPASS_ENDPOINTS])];
}

const UNAVAILABLE_NOTE =
  'Nearby place search is temporarily unavailable — the place-data services are not responding. The map and your routes are unaffected; please try again in a moment.';

const nearbyCache = new Map<string, { expiresAt: number; result: NearbyResult }>();
/** Keys whose lookup failed, mapped to the timestamp they may be retried after. */
const retryCache = new Map<string, number>();

/** Clears the in-memory nearby caches (used by tests). */
export function clearNearbyCache(): void {
  nearbyCache.clear();
  retryCache.clear();
}

/** Describes why a provider attempt failed, in a log-friendly way. */
function attemptError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timed out';
    return error.message;
  }
  return String(error);
}

/**
 * Fetches JSON with a hard timeout. The HTTP status is never trusted on its own:
 * Overpass in particular answers with HTML error pages under a `200`, so a
 * successful parse is what decides success.
 */
async function fetchJson(
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`responded with ${response.status}`);
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs the query against each Overpass endpoint until one answers, within a
 * shared budget. Returns `null` (and fills `attempts`) when every endpoint fails.
 */
async function queryOverpass(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  attempts: string[],
  budgetMs: number
): Promise<unknown | null> {
  const body = new URLSearchParams({
    data: buildOverpassQuery(category, lat, lng, radius),
  }).toString();
  const deadline = Date.now() + budgetMs;

  for (const endpoint of overpassEndpoints()) {
    const remaining = deadline - Date.now();
    if (remaining < 500) {
      attempts.push(`${endpoint}: skipped (budget exhausted)`);
      continue;
    }

    try {
      return await fetchJson(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            // Overpass asks clients to identify themselves
            'User-Agent': NEARBY_USER_AGENT,
          },
          body,
        },
        Math.min(remaining, overpassTimeoutMs())
      );
    } catch (error) {
      attempts.push(`${endpoint}: ${attemptError(error)}`);
    }
  }

  return null;
}

/** Throws when no Overpass endpoint answers. */
async function findViaOverpass(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  timeoutMs: number,
  attempts: string[]
): Promise<NearbyPlace[]> {
  const json = await queryOverpass(category, lat, lng, radius, attempts, timeoutMs);
  if (json === null) throw new Error('every Overpass endpoint failed');
  return normalizeOverpassElements(json, [lat, lng], category, radius);
}

/** Throws when the key is missing or the request fails. */
async function findViaGeoapify(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  timeoutMs: number
): Promise<NearbyPlace[]> {
  const apiKey = geoapifyApiKey();
  if (!apiKey) throw new Error('not configured');

  const json = await fetchJson(
    buildGeoapifyUrl(category, lat, lng, radius, apiKey),
    { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': NEARBY_USER_AGENT } },
    timeoutMs
  );

  return normalizeGeoapifyFeatures(json, [lat, lng], category, radius);
}

// Nominatim's usage policy permits at most 1 request/second, so its lookups are
// serialised in-process. The 24h cache means this is rarely hit at all.
let nominatimNextSlot = 0;

async function respectNominatimPolicy(): Promise<void> {
  const gap = nominatimMinIntervalMs();
  const now = Date.now();
  const wait = Math.max(0, nominatimNextSlot - now);
  nominatimNextSlot = Math.max(now, nominatimNextSlot) + gap;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Throws when the request fails. */
async function findViaNominatim(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  timeoutMs: number
): Promise<NearbyPlace[]> {
  await respectNominatimPolicy();

  const json = await fetchJson(
    buildNominatimUrl(category, lat, lng, radius),
    { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': NEARBY_USER_AGENT } },
    timeoutMs
  );

  return normalizeNominatimResults(json, [lat, lng], category, radius);
}

function unavailable(radius: number, cached: boolean): NearbyResult {
  return {
    places: [],
    provider: 'none',
    radius,
    cached,
    available: false,
    note: UNAVAILABLE_NOTE,
  };
}

/**
 * Finds named places of a category near a coordinate, walking the provider
 * chain until one answers. Never throws: on total provider failure it resolves
 * with an empty list, `available: false` and an explanatory `note`.
 *
 * The first provider to answer wins even when it found nothing — an empty list
 * from a healthy provider is a real answer, and falling through on every empty
 * result would multiply latency for genuinely quiet areas.
 */
export async function findNearbyPlaces(
  lat: number,
  lng: number,
  category: NearbyCategory,
  radiusInput?: number | string
): Promise<NearbyResult> {
  const radius = clampRadius(radiusInput);
  const key = `${category}|${lat.toFixed(3)},${lng.toFixed(3)}|${radius}`;

  const cached = nearbyCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, cached: true };
  }

  // Circuit breaker: a recent failure is remembered so rapid retries are instant
  const retryAt = retryCache.get(key);
  if (retryAt && Date.now() < retryAt) return unavailable(radius, true);

  const attempts: string[] = [];
  const deadline = Date.now() + nearbyBudgetMs();

  for (const provider of nearbyProviderChain()) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) {
      attempts.push(`${provider}: skipped (budget exhausted)`);
      continue;
    }

    try {
      let places: NearbyPlace[];
      if (provider === 'geoapify') {
        places = await findViaGeoapify(
          category,
          lat,
          lng,
          radius,
          Math.min(remaining, geoapifyTimeoutMs())
        );
      } else if (provider === 'nominatim') {
        places = await findViaNominatim(
          category,
          lat,
          lng,
          radius,
          Math.min(remaining, nominatimTimeoutMs())
        );
      } else {
        places = await findViaOverpass(
          category,
          lat,
          lng,
          radius,
          Math.min(remaining, overpassBudgetMs()),
          attempts
        );
      }

      const result: NearbyResult = {
        places,
        provider,
        radius,
        available: true,
        attribution: PROVIDER_ATTRIBUTION[provider],
      };
      nearbyCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), result });
      retryCache.delete(key);
      return result;
    } catch (error) {
      // Only the provider name is logged — a Geoapify URL would carry the key.
      attempts.push(`${provider}: ${attemptError(error)}`);
    }
  }

  console.warn(`Nearby search failed on every provider — ${attempts.join(' | ')}`);
  retryCache.set(key, Date.now() + retryAfterMs());

  return unavailable(radius, false);
}
