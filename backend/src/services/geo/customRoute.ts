/**
 * Pure helpers for user-drawn custom routes (Milestone 4 — Map & Geo).
 *
 * Keeps point validation and distance computation dependency-free so they can
 * be unit-tested and reused by both the API and the client.
 */

import { isValidCoord, pathLengthKm, LatLng } from './distance.js';

/** Hard limits enforced on every saved route. */
export const MAX_ROUTES_PER_TRIP = 20;
export const MAX_POINTS_PER_ROUTE = 500;

/**
 * Filters a raw point list down to valid `[lat, lng]` coordinates and caps the
 * length. Non-arrays and malformed entries are dropped rather than throwing.
 */
export function normalizeRoutePoints(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isValidCoord)
    .slice(0, MAX_POINTS_PER_ROUTE)
    .map((point) => [Number(point[0]), Number(point[1])] as LatLng);
}

/** Great-circle length of a route, rounded to 2 decimal places. */
export function routeDistanceKm(points: unknown): number {
  const normalized = normalizeRoutePoints(points);
  if (normalized.length < 2) return 0;
  return Number(pathLengthKm(normalized).toFixed(2));
}

/** True when a route has enough well-formed points to be drawn. */
export function isDrawableRoute(points: unknown): boolean {
  return normalizeRoutePoints(points).length >= 2;
}
