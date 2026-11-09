import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../../utils/AppError.js';
import {
  agencyStorageProvider,
} from '../agency/cloudStorage.js';
import { initCloudinary, isCloudinaryConfigured } from '../finance/receipt.js';

/**
 * Private storage for trip photos.
 *
 * Same contract as agency assets: server-generated keys, Cloudinary `raw`
 * private objects when configured, local disk otherwise. Keys are
 * `<tripId>/<mediaId>.<ext>` and resolve only after the trip's own access
 * check (membership, or the unlisted share link for anonymous viewers).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const READ_TIMEOUT_MS = 30_000;
const READ_URL_TTL_SECONDS = 60;

export function tripMediaRootDir(): string {
  const configured = process.env.TRIP_MEDIA_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(__dirname, '../../../trip-media');
}

function isHexId(value: unknown): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value ?? ''));
}

export function buildTripMediaStorageKey(
  tripId: unknown,
  mediaId: unknown,
  extension: unknown
): string {
  if (!isHexId(tripId) || !isHexId(mediaId)) {
    throw new AppError('That photo reference is not valid.', 400);
  }
  const ext = String(extension ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(ext)) {
    throw new AppError('That photo type is not supported.', 400);
  }
  return `${String(tripId)}/${String(mediaId)}.${ext}`;
}

export function tripMediaFilePath(storageKey: unknown): string {
  const root = tripMediaRootDir();
  const key = String(storageKey ?? '').replace(/\\/g, '/');
  if (!key || key.startsWith('/') || key.includes('..')) {
    throw new AppError('That photo reference is not valid.', 400);
  }
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new AppError('That photo reference is not valid.', 400);
  }
  return target;
}

function cloudinaryBase(): string {
  const folder = String(process.env.CLOUDINARY_FOLDER || 'travelai').replace(
    /\/+$/,
    ''
  );
  return `${folder}/trip-media`;
}

function cloudinaryPublicId(storageKey: string): string {
  return `${cloudinaryBase()}/${storageKey}`;
}

export async function writeTripMediaFile(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  if (agencyStorageProvider() === 'cloudinary') {
    const cld = initCloudinary();
    await new Promise<void>((resolve, reject) => {
      cld.uploader
        .upload_stream(
          {
            public_id: cloudinaryPublicId(storageKey),
            resource_type: 'raw',
            type: 'private',
            overwrite: true,
          },
          (error) => (error ? reject(error) : resolve())
        )
        .end(buffer);
    });
    return;
  }
  const target = tripMediaFilePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { mode: 0o600 });
}

export async function readTripMediaFile(storageKey: string): Promise<Buffer> {
  if (agencyStorageProvider() === 'cloudinary') {
    if (!isCloudinaryConfigured()) {
      throw new AppError('Photo storage is not configured on this server.', 500);
    }
    const cld = initCloudinary();
    const url = cld.utils.private_download_url(
      cloudinaryPublicId(storageKey),
      '',
      {
        resource_type: 'raw',
        type: 'private',
        expires_at: Math.floor(Date.now() / 1000) + READ_URL_TTL_SECONDS,
      }
    );
    const response = await fetch(url, {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (response.status === 404) {
      throw new AppError('Photo not found', 404);
    }
    if (!response.ok) {
      throw new AppError('Photo storage could not be read right now.', 502);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  try {
    return await fs.readFile(tripMediaFilePath(storageKey));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new AppError('Photo not found', 404);
    }
    throw error;
  }
}

/** Best-effort delete: a missing file is already the desired state. */
export async function removeTripMediaFile(storageKey: string): Promise<void> {
  if (agencyStorageProvider() === 'cloudinary') {
    const cld = initCloudinary();
    await cld.uploader.destroy(cloudinaryPublicId(storageKey), {
      resource_type: 'raw',
      type: 'private',
    });
    return;
  }
  try {
    await fs.unlink(tripMediaFilePath(storageKey));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

/** Authenticated content URL for an itinerary image reference. */
export function tripMediaContentUrl(tripId: unknown, mediaId: unknown): string {
  return `/api/itinerary/${String(tripId)}/media/${String(mediaId)}/content`;
}

/** Anonymous content URL for the same photo through an unlisted share link. */
export function sharedTripMediaContentUrl(
  shareId: unknown,
  mediaId: unknown
): string {
  return `/api/itinerary/shared/${encodeURIComponent(String(shareId))}/media/${String(
    mediaId
  )}/content`;
}
