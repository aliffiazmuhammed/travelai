/**
 * Receipt upload helpers (Milestone 5 — Budget & Financial, sub-milestone 5.5).
 *
 * Supports dual storage drivers:
 * 1. Cloudinary CDN (production recommended) when CLOUDINARY_URL or
 *    CLOUDINARY_CLOUD_NAME/KEY/SECRET are provided.
 * 2. Local disk (development fallback) in `UPLOAD_DIR` (default `backend/uploads`)
 *    served from `/uploads`.
 *
 * Validation never trusts the client: the declared MIME type is checked against
 * an allow-list *and* the file's magic bytes are sniffed before anything is written,
 * and storage filenames are always generated server-side.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type ReceiptMimeType = (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

/** Public URL prefix the uploaded files are served from locally. */
export const RECEIPT_URL_PREFIX = '/uploads';
export const RECEIPT_FILE_PREFIX = 'receipt-';
export const DEFAULT_MAX_UPLOAD_MB = 5;

const EXTENSION_FOR_MIME: Record<ReceiptMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Configured maximum upload size in whole megabytes. */
export function maxUploadMb(): number {
  const raw = Number(process.env.MAX_UPLOAD_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_MB;
}

/** Configured maximum upload size in bytes. */
export function maxUploadBytes(): number {
  return Math.round(maxUploadMb() * 1024 * 1024);
}

/** True when the declared MIME type is one of the accepted receipt formats. */
export function isAllowedReceiptMime(mime: unknown): mime is ReceiptMimeType {
  return (ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(
    String(mime ?? '').toLowerCase()
  );
}

/** File extension to store a given MIME type under (or null when unsupported). */
export function extensionForMime(mime: unknown): string | null {
  return EXTENSION_FOR_MIME[String(mime ?? '').toLowerCase() as ReceiptMimeType] ?? null;
}

/**
 * Sniffs a file's leading bytes and returns the MIME type they imply, or null
 * when the signature is not one of the supported formats. This is the check that
 * stops a renamed/forged file from being stored.
 */
export function sniffMime(buffer: Buffer | Uint8Array | null | undefined): ReceiptMimeType | null {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : Buffer.from((buffer ?? new Uint8Array()) as ArrayBuffer);
  const at = (index: number): number => bytes[index] ?? -1;

  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  // WebP: "RIFF" ???? "WEBP"
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp';
  }
  // PDF: "%PDF"
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'application/pdf';

  return null;
}

/** True when the file's actual contents match the type the browser declared. */
export function contentMatchesMime(mime: unknown, buffer: Buffer | null | undefined): boolean {
  const sniffed = sniffMime(buffer);
  return sniffed !== null && sniffed === String(mime ?? '').toLowerCase();
}

/** Strips directory components and unsafe characters from a client filename. */
export function sanitizeFilename(name: unknown): string {
  const base = path.basename(String(name ?? ''))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  return base.slice(0, 120) || 'receipt';
}

/**
 * Generates the storage filename. Only the generated name is ever used on disk,
 * so a hostile `originalname` cannot influence the path.
 */
export function buildReceiptFilename(
  tripId: unknown,
  expenseId: unknown,
  mime: unknown,
  unique?: string
): string {
  const tail = (value: unknown): string =>
    String(value ?? '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-12) || 'x';
  const token =
    String(unique ?? '').replace(/[^a-zA-Z0-9]/g, '') ||
    crypto.randomBytes(6).toString('hex');

  return `${RECEIPT_FILE_PREFIX}${tail(tripId)}-${tail(expenseId)}-${token}${extensionForMime(mime) || '.bin'}`;
}

/** Public URL for a stored receipt filename. */
export function receiptUrlFor(filename: unknown): string {
  return `${RECEIPT_URL_PREFIX}/${path.basename(String(filename ?? ''))}`;
}

/** True when a stored `receiptUrl` points at a local file this service manages. */
export function isManagedReceiptUrl(url: unknown): boolean {
  const value = String(url ?? '');
  if (!value || value.includes('..') || value.includes('\\')) return false;
  return value.startsWith(`${RECEIPT_URL_PREFIX}/${RECEIPT_FILE_PREFIX}`);
}

/** Extracts the storage filename from a managed receipt URL (or null). */
export function receiptFilenameFromUrl(url: unknown): string | null {
  if (!isManagedReceiptUrl(url)) return null;
  const base = path.basename(String(url));
  return base.startsWith(RECEIPT_FILE_PREFIX) ? base : null;
}

/** Absolute directory receipts are written to locally. */
export function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR;
  // Anchored to this module so the path does not depend on the process cwd.
  return configured ? path.resolve(configured) : path.resolve(__dirname, '../../../uploads');
}

/** Creates the upload directory if needed and returns its absolute path. */
export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Writes a validated receipt to local disk and returns its absolute path. */
export async function writeReceiptFile(filename: string, buffer: Buffer): Promise<string> {
  const dir = await ensureUploadDir();
  const target = path.join(dir, path.basename(filename));
  await fs.writeFile(target, buffer);
  return target;
}

// ============================================================================
// Cloudinary Integration
// ============================================================================

/** True when Cloudinary environment variables are present and non-empty. */
export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim().length > 0) {
    return true;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(
    cloudName && cloudName.trim().length > 0 &&
    apiKey && apiKey.trim().length > 0 &&
    apiSecret && apiSecret.trim().length > 0
  );
}

let cloudinaryConfigured = false;

/** Configures Cloudinary instance with credentials from environment. */
export function initCloudinary(): typeof cloudinary {
  if (!cloudinaryConfigured) {
    if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim().length > 0) {
      cloudinary.config({
        secure: true,
      });
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
    cloudinaryConfigured = true;
  }
  return cloudinary;
}

/** True when a stored `receiptUrl` is hosted on Cloudinary. */
export function isCloudinaryUrl(url: unknown): boolean {
  const value = String(url ?? '');
  return value.includes('res.cloudinary.com');
}

/**
 * Extracts public_id (including folder) and resource_type from a Cloudinary URL.
 */
export function parseCloudinaryPublicId(url: unknown): {
  publicId: string;
  resourceType: 'image' | 'raw' | 'video';
} | null {
  const value = String(url ?? '').split('?')[0];
  if (!isCloudinaryUrl(value)) return null;

  // Cloudinary URL pattern:
  // .../<resource_type>/upload/(transformations/)?(v<version>/)?<folder>/<public_id>(.<ext>)?
  const match = value.match(
    /\/([a-z0-9_-]+)\/upload\/(?:(?:[a-z0-9_,-]+:(?:[a-z0-9_,-]+)|[a-z]_[a-z0-9_,-]+)\/)*(?:v\d+\/)?(.+)$/i
  );
  if (!match) return null;

  const rawType = match[1].toLowerCase();
  const resourceType: 'image' | 'raw' | 'video' =
    rawType === 'raw' ? 'raw' : rawType === 'video' ? 'video' : 'image';

  const publicIdWithExt = match[2];
  const publicId =
    resourceType === 'raw'
      ? publicIdWithExt
      : publicIdWithExt.replace(/\.[a-zA-Z0-9]+$/, '');

  return { publicId, resourceType };
}

/**
 * Uploads a receipt buffer directly to Cloudinary using streaming upload.
 * Returns the secure HTTPS CDN URL.
 */
export async function uploadReceiptToCloudinary(
  filename: string,
  buffer: Buffer,
  mime?: string
): Promise<string> {
  const cld = initCloudinary();
  const isPdf =
    String(mime ?? '').toLowerCase() === 'application/pdf' ||
    filename.toLowerCase().endsWith('.pdf');
  const baseName = path.parse(filename).name;
  const folder = process.env.CLOUDINARY_FOLDER || 'travelai/receipts';

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cld.uploader.upload_stream(
      {
        folder,
        public_id: baseName,
        resource_type: isPdf ? 'auto' : 'image',
        overwrite: true,
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error('Failed to retrieve secure URL from Cloudinary'));
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Deletes a receipt from Cloudinary by extracting its public_id from the URL.
 * Non-throwing and graceful on missing files.
 */
export async function deleteCloudinaryReceipt(url: unknown): Promise<boolean> {
  const parsed = parseCloudinaryPublicId(url);
  if (!parsed) return false;

  try {
    const cld = initCloudinary();
    const res = await cld.uploader.destroy(parsed.publicId, {
      resource_type: parsed.resourceType,
      invalidate: true,
    });
    if (res.result === 'ok' || res.result === 'not found') {
      return true;
    }
    // If not found under current resource type, attempt fallback type
    if (parsed.resourceType === 'image') {
      const retryRaw = await cld.uploader.destroy(parsed.publicId, {
        resource_type: 'raw',
        invalidate: true,
      });
      return retryRaw.result === 'ok' || retryRaw.result === 'not found';
    }
    return false;
  } catch (err) {
    console.warn('Failed to delete Cloudinary receipt (non-fatal):', err);
    return false;
  }
}

// ============================================================================
// Unified Storage Dispatcher
// ============================================================================

export interface SavedReceipt {
  url: string;
  storage: 'cloudinary' | 'local';
}

/**
 * Saves a validated receipt. If Cloudinary credentials are configured in the
 * environment, the file is uploaded to Cloudinary CDN and its secure HTTPS URL
 * is returned. Otherwise, it falls back to local disk storage (`UPLOAD_DIR`).
 */
export async function saveReceiptFile(
  filename: string,
  buffer: Buffer,
  mime?: string
): Promise<SavedReceipt> {
  if (isCloudinaryConfigured()) {
    try {
      const url = await uploadReceiptToCloudinary(filename, buffer, mime);
      return { url, storage: 'cloudinary' };
    } catch (error) {
      console.warn('⚠️ Cloudinary upload failed, falling back to local disk:', error);
    }
  }

  await writeReceiptFile(filename, buffer);
  return {
    url: receiptUrlFor(filename),
    storage: 'local',
  };
}

/**
 * Deletes the file behind a stored receipt URL. Works for both Cloudinary CDN URLs
 * and local `/uploads/receipt-*` paths. Refuses unmanaged / foreign hosts.
 * Never throws — a missing file is not an error worth failing a request over.
 */
export async function deleteReceiptFile(url: unknown): Promise<boolean> {
  if (isCloudinaryUrl(url)) {
    return deleteCloudinaryReceipt(url);
  }

  const filename = receiptFilenameFromUrl(url);
  if (!filename) return false;

  try {
    await fs.unlink(path.join(uploadDir(), filename));
    return true;
  } catch {
    return false;
  }
}
