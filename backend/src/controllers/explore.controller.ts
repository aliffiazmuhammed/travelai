import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { parseQuery } from '../utils/parseQuery.js';
import { exploreQuerySchema } from '../schemas/gallery.schema.js';
import { listGalleryTrips, loadGalleryTrip } from '../services/gallery/explore.js';

/**
 * Public gallery (Milestone 8 G3).
 *
 * Both handlers are anonymous by design: the router mounts no realm guard
 * because a signed-out visitor is the primary audience. Safety comes from the
 * service layer — every row is read through `projectGalleryTripSummary` /
 * `projectGalleryTrip`, so the response shape is an allow-list regardless of
 * what the query asks for.
 */

/** GET /api/explore — filterable, cursor-paginated public listing. */
export const getExplore = catchAsync(async (req: Request, res: Response) => {
  const query = parseQuery(exploreQuerySchema, req.query);
  const page = await listGalleryTrips(query);
  res.status(200).json({ success: true, ...page });
});

/** GET /api/explore/:tripId — one public itinerary, 404 unless still live. */
export const getGalleryTrip = catchAsync(async (req: Request, res: Response) => {
  const trip = await loadGalleryTrip(String(req.params.tripId ?? ''));
  res.status(200).json({ success: true, trip });
});
