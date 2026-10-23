import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../../utils/AppError.js';

/**
 * Private storage adapter for agency brand assets (A3).
 *
 * The local disk implementation deliberately writes outside the public
 * `/uploads` tree: assets are tenant data and are only served after the agency
 * guard has authorised the caller. Storage keys are `<agencyId>/<assetId>.<ext>`
 * and are generated server-side, so a client can never choose a path.
 *
 * A Cloudinary/S3 adapter can replace these functions later without changing
 * the routes; the `storageKey` column stays the stable reference.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Private root; override with `AGENCY_ASSET_DIR` in deployments. */
export function agencyAssetRootDir(): string {
  const configured = process.env.AGENCY_ASSET_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(__dirname, '../../../agency-assets');
}

function isHexId(value: unknown): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value ?? ''));
}

/** Builds the tenant-scoped key. Both ids and the extension are validated. */
export function buildAgencyAssetStorageKey(
  agencyId: unknown,
  assetId: unknown,
  extension: unknown
): string {
  if (!isHexId(agencyId) || !isHexId(assetId)) {
    throw new AppError('That asset reference is not valid.', 400);
  }
  const ext = String(extension ?? '').trim().toLowerCase();
  // Strict allow-list (no trimming of separators/dots): the extension is part
  // of a filesystem path even though it is server-generated.
  if (!/^[a-z0-9]{2,5}$/.test(ext)) {
    throw new AppError('That asset type is not supported.', 400);
  }
  return `${String(agencyId)}/${String(assetId)}.${ext}`;
}

/** Resolves a storage key under the configured root, rejecting traversal. */
export function agencyAssetFilePath(storageKey: unknown): string {
  const root = agencyAssetRootDir();
  const key = String(storageKey ?? '').replace(/\\/g, '/');
  if (!key || key.startsWith('/') || key.includes('..')) {
    throw new AppError('That asset reference is not valid.', 400);
  }
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new AppError('That asset reference is not valid.', 400);
  }
  return target;
}

export async function writeAgencyAssetFile(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  const target = agencyAssetFilePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { mode: 0o600 });
}

export async function readAgencyAssetFile(storageKey: string): Promise<Buffer> {
  try {
    return await fs.readFile(agencyAssetFilePath(storageKey));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new AppError('Asset not found', 404);
    }
    throw error;
  }
}

/** Best-effort delete: a missing file is already the desired state. */
export async function removeAgencyAssetFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(agencyAssetFilePath(storageKey));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

/** Authenticated content URL stored in `Agency.branding.logoUrl`/`mascotUrl`. */
export function agencyAssetContentUrl(agencyId: unknown, assetId: unknown): string {
  return `/api/agency/${String(agencyId)}/assets/${String(assetId)}/content`;
}
