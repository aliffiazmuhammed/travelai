import { apiRequest } from './client';
import type { TripCustomRoute, TripItinerary } from './trips';

/**
 * Anonymous, read-only projection from `GET /api/itinerary/shared/:shareId`.
 * Photos arrive with share-scoped URLs; budgets and members never travel.
 */
export interface SharedTrip {
  _id: string;
  title?: string;
  status?: string;
  tripDetails?: TripItinerary;
  customRoutes?: TripCustomRoute[];
  createdAt?: string;
}

export function fetchSharedTrip(shareId: string): Promise<SharedTrip> {
  return apiRequest<SharedTrip & { success: true }>(
    `/itinerary/shared/${encodeURIComponent(shareId)}`,
    { auth: false, handleUnauthorized: false }
  );
}
