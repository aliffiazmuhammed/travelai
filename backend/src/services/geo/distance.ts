/**
 * Pure geo math helpers (Milestone 4 — Map & Geo).
 *
 * Coordinates are always `[latitude, longitude]` tuples to match the itinerary
 * contract (`ActivityItem.coordinates`). No external dependencies so this can be
 * unit-tested and mirrored on the frontend (`frontend/src/lib/geo.ts`).
 */

export type LatLng = [number, number];
export type TravelMode = 'walk' | 'bike' | 'drive';

const EARTH_RADIUS_KM = 6371.0088;

/** Average sustained speeds (km/h) used for straight-line travel estimation. */
export const MODE_SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.8,
  bike: 15,
  drive: 30,
};

/** Straight-line → real road distance correction factor per mode. */
export const MODE_ROAD_FACTOR: Record<TravelMode, number> = {
  walk: 1.2,
  bike: 1.3,
  drive: 1.35,
};

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Validates a `[lat, lng]` pair (in range and not the null-island `[0,0]`). */
export function isValidCoord(point: unknown): point is LatLng {
  if (!Array.isArray(point) || point.length < 2) return false;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Great-circle (haversine) distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const lat1 = a[0];
  const lon1 = a[1];
  const lat2 = b[0];
  const lon2 = b[1];

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLon * sinLon;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total haversine length of a polyline, in kilometres. */
export function pathLengthKm(points: LatLng[]): number {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

/** Initial bearing (degrees, 0–360) from `a` to `b`. */
export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLon = toRadians(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Arithmetic centroid of a set of points. */
export function centroid(points: LatLng[]): LatLng | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const [pLat, pLng] of points) {
    lat += pLat;
    lng += pLng;
  }
  return [lat / points.length, lng / points.length];
}

/** Bounding box of a set of points. */
export function boundingBox(points: LatLng[]): {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
} | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Estimates travel time (minutes) for a straight-line distance, applying the
 * mode-specific road factor and speed. Always returns at least 1 minute.
 */
export function estimateTravelMinutes(
  straightLineKm: number,
  mode: TravelMode = 'drive'
): number {
  if (!Number.isFinite(straightLineKm) || straightLineKm <= 0) return 0;
  const speed = MODE_SPEED_KMH[mode] ?? MODE_SPEED_KMH.drive;
  const roadKm = straightLineKm * (MODE_ROAD_FACTOR[mode] ?? MODE_ROAD_FACTOR.drive);
  return Math.max(1, Math.round((roadKm / speed) * 60));
}

/** Human-friendly distance label (e.g. `820 m`, `4.2 km`). */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '0 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Human-friendly duration label (e.g. `18 min`, `1h 25m`). */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  km: number;
  minutes: number;
}

export interface RouteResult {
  legs: RouteLeg[];
  totalKm: number;
  totalMinutes: number;
  provider: string;
}

/** Builds per-leg distances/times for a sequence of points (straight-line). */
export function buildLegs(points: LatLng[], mode: TravelMode = 'drive'): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(points[i - 1], points[i]);
    legs.push({
      fromIndex: i - 1,
      toIndex: i,
      km: Number(km.toFixed(2)),
      minutes: estimateTravelMinutes(km, mode),
    });
  }
  return legs;
}

/** Convenience aggregate of `buildLegs` (total distance + time). */
export function totalRoute(
  points: LatLng[],
  mode: TravelMode = 'drive'
): { km: number; minutes: number } {
  const legs = buildLegs(points, mode);
  return {
    km: Number(legs.reduce((sum, leg) => sum + leg.km, 0).toFixed(2)),
    minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
  };
}
