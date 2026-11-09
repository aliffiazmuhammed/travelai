import Trip from '../../models/Trip.js';
import { isAgencyActive } from '../agency/status.js';
import { sharedTripMediaContentUrl } from '../tripMedia/storage.js';

/**
 * Public share access (Milestone 6 E1). Centralizes the one lookup that is
 * intentionally NOT authorization-gated: a shared trip must be explicitly
 * `isPublic` and not soft-deleted. No `userId`/membership involvement — callers
 * are anonymous.
 *
 * Revoking a share flips `isPublic` to false (flaw F7 handling lands in E5 with
 * a proper `shareRevokedAt`/rotation), which immediately makes this return
 * null.
 */
export async function findPublicSharedTrip(shareId: string): Promise<any | null> {
  if (!shareId || typeof shareId !== 'string') return null;
  const trip = await Trip.findOne({
    shareId,
    isPublic: true,
    isDeleted: { $ne: true },
  });
  if (!trip) return null;

  // A suspended tenant's content fails closed, like its proposals and live
  // routes. Personal trips have no tenant and are unaffected.
  if (trip.workspace === 'agency' && trip.agencyId) {
    if (!(await isAgencyActive(trip.agencyId))) return null;
  }
  return trip;
}

/**
 * The exact public share payload (F14, E5). An allow-list, not a sanitize
 * filter: adding a field here is a deliberate review decision, which is why
 * `publicProjection.test.ts` pins the key set. Everything session- or
 * payment-related (members, expenses, finance, generationMeta, versions…) is
 * structurally absent because it is never selected.
 */
export function projectPublicTrip(trip: {
  _id?: any;
  title?: string;
  status?: string;
  tripDetails?: Record<string, any>;
  customRoutes?: unknown[];
  createdAt?: Date | string;
  shareId?: string;
}): Record<string, unknown> {
  return {
    _id: trip._id,
    title: trip.title,
    status: trip.status,
    tripDetails: withShareMediaUrls(trip.tripDetails, trip.shareId),
    // Drawn routes are part of the shared plan (E5 addition); not sensitive.
    customRoutes: trip.customRoutes || [],
    createdAt: trip.createdAt,
  };
}

/**
 * Anonymous viewers cannot send the trip cookie, so every image reference on
 * the public payload carries its share-scoped URL. Members keep constructing
 * the authenticated URL from the media id, which stays untouched here.
 */
function withShareMediaUrls(
  details: Record<string, any> | undefined,
  shareId: string | undefined
): Record<string, any> | undefined {
  if (!details || !shareId) return details;
  const clone = JSON.parse(JSON.stringify(details));
  const days = Array.isArray(clone.day_by_day_itinerary)
    ? clone.day_by_day_itinerary
    : [];
  const tag = (holder: any): void => {
    if (!holder || typeof holder !== 'object') return;
    const id = String(holder.image?.id ?? '').trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) return;
    holder.image = { ...holder.image, url: sharedTripMediaContentUrl(shareId, id) };
  };
  for (const day of days) {
    tag(day);
    for (const key of ['activities', 'stay_recommendations', 'stays', 'food_spots', 'food']) {
      const items = day?.[key];
      if (Array.isArray(items)) items.forEach(tag);
    }
  }
  return clone;
}
