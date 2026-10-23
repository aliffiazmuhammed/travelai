import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../../utils/AppError.js';
import { initCloudinary, isCloudinaryConfigured } from '../finance/receipt.js';

/**
 * Cloudinary-first blob store for the agency workspace.
 *
 * Brand assets, template sources/snapshots and rendered export PDFs are
 * tenant-private, so they are never served from the public Cloudinary CDN.
 * Bytes are stored as `resource_type: 'raw'` with `type: 'private'` — private
 * assets are only readable through a signed, expiring download URL on
 * api.cloudinary.com, which the server fetches and relays through the existing
 * authenticated content routes. No public or long-lived URL ever leaves the
 * server.
 *
 * Storage keys are the same `<agencyId>/<...>` strings in both providers, so
 * the `storageKey` columns stay the stable reference. Local disk remains the
 * fallback when Cloudinary is not configured (or `AGENCY_STORAGE_PROVIDER`
 * forces it), matching the receipts/avatars contract.
 */

const READ_TIMEOUT_MS = 30_000;

/** Signed read URLs stay usable for a minute; they are consumed immediately. */
const READ_URL_TTL_SECONDS = 60;

/** Which provider agency files use: Cloudinary when configured, else local. */
export function agencyStorageProvider(): 'cloudinary' | 'local' {
  const override = String(process.env.AGENCY_STORAGE_PROVIDER ?? '')
    .trim()
    .toLowerCase();
  if (override === 'local') return 'local';
  if (override === 'cloudinary') return 'cloudinary';
  return isCloudinaryConfigured() ? 'cloudinary' : 'local';
}

/** Folder prefix under the account's CLOUDINARY_FOLDER (defaults to `travelai`). */
export function agencyCloudinaryBase(): string {
  const folder = String(process.env.CLOUDINARY_FOLDER || 'travelai').replace(
    /\/+$/,
    ''
  );
  return `${folder}/agency`;
}

/** Full Cloudinary public_id for a server-generated storage key. */
export function agencyCloudinaryPublicId(storageKey: string): string {
  return `${agencyCloudinaryBase()}/${storageKey}`;
}

export async function cloudWriteAgencyBytes(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  const cld = initCloudinary();
  await new Promise<void>((resolve, reject) => {
    cld.uploader
      .upload_stream(
        {
          public_id: agencyCloudinaryPublicId(storageKey),
          resource_type: 'raw',
          type: 'private',
          overwrite: true,
        },
        (error) => (error ? reject(error) : resolve())
      )
      .end(buffer);
  });
}

export async function cloudReadAgencyBytes(
  storageKey: string,
  notFoundMessage: string,
  notFoundStatus: number = 404
): Promise<Buffer> {
  if (!isCloudinaryConfigured()) {
    throw new AppError('Agency storage is not configured on this server.', 500);
  }
  const cld = initCloudinary();
  const url = cld.utils.private_download_url(
    agencyCloudinaryPublicId(storageKey),
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
    throw new AppError(notFoundMessage, notFoundStatus);
  }
  if (!response.ok) {
    throw new AppError('Agency storage could not be read right now.', 502);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Best-effort delete; a missing object is already the desired state. */
export async function cloudRemoveAgencyBytes(storageKey: string): Promise<void> {
  const cld = initCloudinary();
  await cld.uploader.destroy(agencyCloudinaryPublicId(storageKey), {
    resource_type: 'raw',
    type: 'private',
  });
}
