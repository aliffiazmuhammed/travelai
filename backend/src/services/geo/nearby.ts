/**
 * Nearby search (Milestone 4 — Map & Geo, sub-milestone 4.5).
 *
 * Queries the Overpass API (OpenStreetMap, free, no key) server-side so the
 * browser avoids CORS and the public endpoint gets one cached request per
 * coordinate/category instead of one per user. Responses are normalized into a
 * compact, distance-sorted list and cached for `NEARBY_CACHE_TTL_MS` (24h).
 *
 * Overpass is run by volunteers and the public instances go down or get
 * overloaded (the primary instance can take >25s to time out). Two defences:
 *   - several endpoints are tried in preference order within a shared time
 *     budget (`OVERPASS_ENDPOINTS`, `OVERPASS_TIMEOUT_MS`, `OVERPASS_BUDGET_MS`);
 *   - a short failure backoff (`NEARBY_RETRY_AFTER_MS`) keeps repeated clicks
 *     from stalling on an instance that is known to be down.
 * A total outage is reported honestly via `available: false` so the UI can say
 * "temporarily unavailable" instead of pretending there is nothing nearby.
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

    const dedupeKey = `${name.toLowerCase()}|${coordinates[0].toFixed(4)}|${coordinates[1].toFixed(4)}`;
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

export interface NearbyResult {
  places: NearbyPlace[];
  provider: 'overpass' | 'none';
  radius: number;
  cached?: boolean;
  /**
   * False when no provider could be reached: `places` is then empty because the
   * lookup failed, *not* because the area has nothing to offer.
   */
  available: boolean;
  note?: string;
}

const FETCH_TIMEOUT_MS = 6000;
const TOTAL_BUDGET_MS = 10000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_RETRY_AFTER_MS = 60 * 1000; // 1 minute

const OVERPASS_USER_AGENT = 'TravelAI/1.0 (+https://github.com/travelai; nearby search)';

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
  'Nearby search is temporarily unavailable — OpenStreetMap’s servers are not responding. Please try again in a moment.';

const nearbyCache = new Map<string, { expiresAt: number; result: NearbyResult }>();
/** Keys whose lookup failed, mapped to the timestamp they may be retried after. */
const retryCache = new Map<string, number>();

/** Clears the in-memory nearby caches (used by tests). */
export function clearNearbyCache(): void {
  nearbyCache.clear();
  retryCache.clear();
}

/** Describes why an endpoint attempt failed, in a log-friendly way. */
function attemptError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timed out';
    return error.message;
  }
  return String(error);
}

/** POSTs an Overpass QL query and parses the JSON, aborting after `timeoutMs`. */
async function fetchOverpass(endpoint: string, body: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        // Overpass asks clients to identify themselves
        'User-Agent': OVERPASS_USER_AGENT,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`responded with ${response.status}`);

    // Overpass also returns HTML error pages with a 200 status, so the status
    // alone is never trusted — parsing is what decides success.
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs the query against each endpoint until one answers, within a shared
 * budget. Returns `null` (and fills `attempts`) when every endpoint fails.
 */
async function queryOverpass(
  category: NearbyCategory,
  lat: number,
  lng: number,
  radius: number,
  attempts: string[]
): Promise<unknown | null> {
  const body = new URLSearchParams({
    data: buildOverpassQuery(category, lat, lng, radius),
  }).toString();
  const deadline = Date.now() + overpassBudgetMs();

  for (const endpoint of overpassEndpoints()) {
    const remaining = deadline - Date.now();
    if (remaining < 500) {
      attempts.push(`${endpoint}: skipped (budget exhausted)`);
      continue;
    }

    try {
      return await fetchOverpass(endpoint, body, Math.min(remaining, overpassTimeoutMs()));
    } catch (error) {
      attempts.push(`${endpoint}: ${attemptError(error)}`);
    }
  }

  return null;
}

/**
 * Finds named places of a category near a coordinate. Never throws: on total
 * provider failure it resolves with an empty list, `available: false` and an
 * explanatory `note`.
 */
export async function findNearbyPlaces(
  lat: number,
  lng: number,
  category: NearbyCategory,
  radiusInput?: number | string
): Promise<NearbyResult> {
  const radius = clampRadius(radiusInput);
  const origin: LatLng = [lat, lng];
  const key = `${category}|${lat.toFixed(3)},${lng.toFixed(3)}|${radius}`;

  const cached = nearbyCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, cached: true };
  }

  // Circuit breaker: a recent failure is remembered so rapid retries are instant
  const retryAt = retryCache.get(key);
  if (retryAt && Date.now() < retryAt) {
    return {
      places: [],
      provider: 'none',
      radius,
      cached: true,
      available: false,
      note: UNAVAILABLE_NOTE,
    };
  }

  const attempts: string[] = [];
  const json = await queryOverpass(category, lat, lng, radius, attempts);

  if (json !== null) {
    const result: NearbyResult = {
      places: normalizeOverpassElements(json, origin, category, radius),
      provider: 'overpass',
      radius,
      available: true,
    };
    nearbyCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), result });
    retryCache.delete(key);
    return result;
  }

  console.warn(`Nearby search failed on every Overpass endpoint — ${attempts.join(' | ')}`);
  retryCache.set(key, Date.now() + retryAfterMs());

  return {
    places: [],
    provider: 'none',
    radius,
    available: false,
    note: UNAVAILABLE_NOTE,
  };
}
