import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import type { ITripMedia } from '../models/TripMedia.js';
import { findPublicSharedTrip } from '../services/collab/publicTrip.js';
import { tripContext, type TripAccessRequest } from '../middleware/tripAccess.middleware.js';
import {
  deleteTripMedia,
  readTripMedia,
  saveTripMedia,
  tripMediaView,
} from '../services/tripMedia/media.js';

/**
 * Trip photo routes. Authorization is the router's `requireTripRole` guard for
 * member reads/writes; the shared route is the one anonymous reader, gated by
 * the trip's `shareId` lookup (same rule as `GET /shared/:shareId`).
 */

const IMMUTABLE_CACHE = 'private, max-age=604800, immutable';
const PUBLIC_CACHE = 'public, max-age=604800, immutable';

function sendPhoto(
  res: Response,
  media: Pick<ITripMedia, '_id' | 'mime' | 'bytes'>,
  bytes: Buffer,
  cacheControl: string
): void {
  const etag = `"${String(media._id)}-${media.bytes}"`;
  res.set({
    'Content-Type': media.mime,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': cacheControl,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (res.req?.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.status(200).send(bytes);
}

export const uploadTripMedia = catchAsync(
  async (req: TripAccessRequest, res: Response) => {
    const { trip } = tripContext(req);
    const file = req.file;
    if (!file) throw new AppError('Choose a photo to upload.', 400);

    const media = await saveTripMedia({
      tripId: String(trip._id),
      userId: String(req.userId),
      buffer: file.buffer,
      declaredMime: file.mimetype,
      width: req.body?.width,
      height: req.body?.height,
    });

    res.status(201).json({
      success: true,
      media: tripMediaView(String(trip._id), media),
    });
  }
);

export const deleteTripMediaFile = catchAsync(
  async (req: TripAccessRequest, res: Response) => {
    const { trip } = tripContext(req);
    const removed = await deleteTripMedia(trip._id, req.params.mediaId);
    if (!removed) throw new AppError('Photo not found', 404);
    res.status(200).json({ success: true });
  }
);

export const serveTripMedia = catchAsync(
  async (req: TripAccessRequest, res: Response) => {
    const { trip } = tripContext(req);
    const { media, bytes } = await readTripMedia(trip._id, req.params.mediaId);
    sendPhoto(res, media, bytes, IMMUTABLE_CACHE);
  }
);

export const serveSharedTripMedia = catchAsync(
  async (req, res: Response) => {
    const trip = await findPublicSharedTrip(String(req.params.shareId));
    if (!trip) {
      throw new AppError('Shared itinerary not found or has been revoked', 404);
    }
    const { media, bytes } = await readTripMedia(trip._id, req.params.mediaId);
    sendPhoto(res, media, bytes, PUBLIC_CACHE);
  }
);
