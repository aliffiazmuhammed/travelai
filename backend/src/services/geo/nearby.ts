/**
 * Nearby search (Milestone 4 — Map & Geo, sub-milestone 4.5).
 *
 * Queries the Overpass API (OpenStreetMap, free, no key) server-side so the
 * browser avoids CORS and the public endpoint gets one cached request per
 * coordinate/category instead of one per user. Responses are normalized into a
 * compact, distance-sorted list and cached for `NEARBY_CACHE_TTL_MS` (24h).
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
  provider: 'overpass';
  radius: number;
  cached?: boolean;
  note?: string;
}

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheTtlMs(): number {
  const raw = Number(process.env.NEARBY_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

function overpassEndpoint(): string {
  return process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';
}

const nearbyCache = new Map<string, { expiresAt: number; result: NearbyResult }>();

/** Clears the in-memory nearby cache (used by tests). */
export function clearNearbyCache(): void {
  nearbyCache.clear();
}

/**
 * Finds named places of a category near a coordinate. Never throws: on provider
 * failure it resolves with an empty list plus an explanatory `note`.
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

  const query = buildOverpassQuery(category, lat, lng, radius);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(overpassEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Overpass asks clients to identify themselves
        'User-Agent': 'TravelAI/1.0 (nearby search)',
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass responded with ${response.status}`);

    const json: any = await response.json();
    const result: NearbyResult = {
      places: normalizeOverpassElements(json, origin, category, radius),
      provider: 'overpass',
      radius,
    };
    nearbyCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), result });
    return result;
  } catch (error) {
    console.warn('Nearby search failed:', error);
    return {
      places: [],
      provider: 'overpass',
      radius,
      note: 'Nearby search is unavailable right now. Please try again in a moment.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
