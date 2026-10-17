/**
 * Route computation for activity sequences (Milestone 4 — Map & Geo).
 *
 * Default provider is a dependency-free haversine estimate. When
 * `GEO_ROUTING_PROVIDER=osrm`, accurate road distances/times are fetched from an
 * OSRM server (configurable via `OSRM_BASE_URL`) with automatic fallback to the
 * haversine estimate on any failure.
 */

import { LatLng, RouteLeg, RouteResult, TravelMode, buildLegs } from './distance.js';

const OSRM_PROFILE: Record<TravelMode, string> = {
  walk: 'foot',
  bike: 'bike',
  drive: 'driving',
};

const OSRM_TIMEOUT_MS = 6000;

function activeProvider(): string {
  return (process.env.GEO_ROUTING_PROVIDER || 'haversine').trim().toLowerCase();
}

function osrmBaseUrl(): string {
  return (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
}

/** Straight-line estimate provider (always available). */
export function haversineRoute(points: LatLng[], mode: TravelMode = 'drive'): RouteResult {
  const legs = buildLegs(points, mode);
  return {
    legs,
    totalKm: Number(legs.reduce((sum, leg) => sum + leg.km, 0).toFixed(2)),
    totalMinutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
    provider: 'haversine',
  };
}

async function osrmRoute(points: LatLng[], mode: TravelMode): Promise<RouteResult> {
  const profile = OSRM_PROFILE[mode] ?? 'driving';
  // OSRM expects `lng,lat;lng,lat` order
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${osrmBaseUrl()}/route/v1/${profile}/${coords}?overview=false&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM responded with ${res.status}`);
    const data: any = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('OSRM returned no route');

    const legs: RouteLeg[] = (route.legs || []).map((leg: any, index: number) => ({
      fromIndex: index,
      toIndex: index + 1,
      km: Number((leg.distance / 1000).toFixed(2)),
      minutes: Math.max(1, Math.round(leg.duration / 60)),
    }));

    return {
      legs,
      totalKm: Number((route.distance / 1000).toFixed(2)),
      totalMinutes: Math.max(1, Math.round(route.duration / 60)),
      provider: 'osrm',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Computes a route for the given points using the configured provider, falling
 * back to the haversine estimate when the provider is unavailable or errors.
 */
export async function computeRoute(
  points: LatLng[],
  mode: TravelMode = 'drive'
): Promise<RouteResult> {
  if (activeProvider() === 'osrm' && points.length >= 2) {
    try {
      return await osrmRoute(points, mode);
    } catch (error) {
      console.warn('OSRM routing failed, using haversine estimate:', error);
    }
  }
  return haversineRoute(points, mode);
}
