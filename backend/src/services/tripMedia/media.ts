import { Types } from 'mongoose';
import TripMedia, { type ITripMedia } from '../../models/TripMedia.js';
import { AppError } from '../../utils/AppError.js';
import {
  extensionForAgencyAssetMime,
  sniffAgencyAssetMime,
} from '../agency/assets.js';
import {
  buildTripMediaStorageKey,
  readTripMediaFile,
  removeTripMediaFile,
  tripMediaContentUrl,
  writeTripMediaFile,
} from './storage.js';

/**
 * Trip photo ingestion and reads.
 *
 * The declared MIME and the file's magic bytes must agree; the extension comes
 * from the sniffed type, never from the uploaded filename. A photo id is only
 * resolvable inside the trip that owns it, so a leaked id from one trip cannot
 * be read through another trip's access.
 */

export const TRIP_MEDIA_MAX_MB = 8;
export const TRIP_MEDIA_MAX_BYTES = TRIP_MEDIA_MAX_MB * 1024 * 1024;
/** Enough for a long trip with a hero and thumbnails on every day. */
export const TRIP_MEDIA_MAX_FILES = 500;
const MAX_DIMENSION = 20_000;

export interface TripMediaRef {
  /** TripMedia document id. */
  id: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface TripMediaView {
  id: string;
  url: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function positiveDimension(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_DIMENSION
    ? parsed
    : undefined;
}

/** Keeps only the fields an itinerary image reference may carry. */
export function normalizeMediaRef(value: unknown): TripMediaRef | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as any;
  const id = String(source.id ?? '').trim().toLowerCase();
  if (!OBJECT_ID.test(id)) return null;
  const alt = typeof source.alt === 'string' ? source.alt.trim().slice(0, 160) : '';
  const width = positiveDimension(source.width);
  const height = positiveDimension(source.height);
  return {
    id,
    ...(alt ? { alt } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function assertTripId(tripId: unknown): string {
  const id = String(tripId ?? '').trim();
  if (!OBJECT_ID.test(id)) {
    throw new AppError('That trip reference is not valid.', 400);
  }
  return id;
}

function assertMediaId(mediaId: unknown): string {
  const id = String(mediaId ?? '').trim().toLowerCase();
  if (!OBJECT_ID.test(id)) {
    throw new AppError('That photo reference is not valid.', 400);
  }
  return id;
}

export function tripMediaView(tripId: string, media: ITripMedia): TripMediaView {
  return {
    id: String(media._id),
    url: tripMediaContentUrl(tripId, media._id),
    mime: media.mime,
    bytes: media.bytes,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
  };
}

export async function saveTripMedia(input: {
  tripId: string;
  userId: string;
  buffer: Buffer;
  declaredMime?: string | null;
  width?: unknown;
  height?: unknown;
}): Promise<ITripMedia> {
  const tripId = assertTripId(input.tripId);
  if (!input.buffer?.byteLength) {
    throw new AppError('That photo is empty. Choose another file.', 400);
  }
  if (input.buffer.byteLength > TRIP_MEDIA_MAX_BYTES) {
    throw new AppError(
      `Photos must be smaller than ${TRIP_MEDIA_MAX_MB} MB.`,
      413
    );
  }

  const mime = sniffAgencyAssetMime(input.buffer);
  if (!mime || !mime.startsWith('image/')) {
    throw new AppError('Choose a JPEG, PNG or WebP photo.', 400);
  }
  const declared = String(input.declaredMime ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (declared && declared !== 'application/octet-stream' && declared !== mime) {
    // Browsers occasionally send `image/jpg`; the sniffer and the normaliser
    // both canonicalise it, so a genuine mismatch means the file was renamed.
    const normalizedDeclared = declared === 'image/jpg' ? 'image/jpeg' : declared;
    if (normalizedDeclared !== mime) {
      throw new AppError('That file is not the image type it claims to be.', 400);
    }
  }

  const count = await TripMedia.countDocuments({ tripId });
  if (count >= TRIP_MEDIA_MAX_FILES) {
    throw new AppError(
      `This trip already has ${TRIP_MEDIA_MAX_FILES} photos. Remove one before adding another.`,
      409
    );
  }

  const extension = extensionForAgencyAssetMime(mime);
  if (!extension) throw new AppError('That photo type is not supported.', 400);

  const mediaId = new Types.ObjectId();
  const storageKey = buildTripMediaStorageKey(tripId, mediaId, extension);

  await writeTripMediaFile(storageKey, input.buffer);
  try {
    return await TripMedia.create({
      _id: mediaId,
      tripId,
      uploadedBy: input.userId,
      storageKey,
      mime,
      bytes: input.buffer.byteLength,
      ...(positiveDimension(input.width)
        ? { width: positiveDimension(input.width) }
        : {}),
      ...(positiveDimension(input.height)
        ? { height: positiveDimension(input.height) }
        : {}),
    });
  } catch (error) {
    await removeTripMediaFile(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function readTripMedia(
  tripId: unknown,
  mediaId: unknown
): Promise<{ media: ITripMedia; bytes: Buffer }> {
  const trip = assertTripId(tripId);
  const id = assertMediaId(mediaId);
  const media = await TripMedia.findOne({ _id: id, tripId: trip });
  if (!media) throw new AppError('Photo not found', 404);
  const bytes = await readTripMediaFile(media.storageKey);
  return { media, bytes };
}

export async function deleteTripMedia(
  tripId: unknown,
  mediaId: unknown
): Promise<boolean> {
  const trip = assertTripId(tripId);
  const id = assertMediaId(mediaId);
  const media = await TripMedia.findOneAndDelete({ _id: id, tripId: trip });
  if (!media) return false;
  await removeTripMediaFile(media.storageKey).catch(() => undefined);
  return true;
}

/** Deletes every photo row and file for a trip (trash purge). */
export async function purgeTripMedia(tripId: unknown): Promise<void> {
  const trip = String(tripId ?? '').trim();
  if (!OBJECT_ID.test(trip)) return;
  const rows = await TripMedia.find({ tripId: trip }).select('storageKey');
  await TripMedia.deleteMany({ tripId: trip });
  await Promise.all(
    rows.map((row) => removeTripMediaFile(row.storageKey).catch(() => undefined))
  );
}

/**
 * Removes image references from a copied itinerary. Photos belong to the trip
 * that uploaded them, so a duplicate or gallery clone must not inherit ids it
 * cannot read (or that would point at another trip's files).
 */
export function stripTripMediaRefs<T extends Record<string, any>>(details: T): T {
  if (!details || typeof details !== 'object') return details;
  const clone = JSON.parse(JSON.stringify(details)) as T;
  const days = Array.isArray((clone as any).day_by_day_itinerary)
    ? (clone as any).day_by_day_itinerary
    : [];
  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    delete day.image;
    for (const key of ['activities', 'stay_recommendations', 'stays', 'food_spots', 'food']) {
      const items = day[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item && typeof item === 'object') delete item.image;
      }
    }
  }
  return clone;
}

/**
 * Normalises every stored image reference on write: a ref is only an id plus
 * optional alt/dimensions, never a client-supplied URL. Invalid refs are
 * dropped rather than rejected so a partial edit cannot fail the whole save.
 */
export function sanitizeTripMediaRefs<T extends Record<string, any>>(details: T): T {
  if (!details || typeof details !== 'object') return details;
  const clone = JSON.parse(JSON.stringify(details)) as T;
  const clean = (holder: any): void => {
    if (!holder || typeof holder !== 'object' || holder.image === undefined) return;
    const ref = normalizeMediaRef(holder.image);
    if (ref) holder.image = ref;
    else delete holder.image;
  };
  const days = Array.isArray((clone as any).day_by_day_itinerary)
    ? (clone as any).day_by_day_itinerary
    : [];
  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    clean(day);
    for (const key of ['activities', 'stay_recommendations', 'stays', 'food_spots', 'food']) {
      const items = day[key];
      if (!Array.isArray(items)) continue;
      items.forEach(clean);
    }
  }
  return clone;
}
