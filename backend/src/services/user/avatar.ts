/**
 * Profile-photo storage (Milestone 7, F14).
 *
 * Same storage contract as receipts (Milestone 5.5): Cloudinary when it is
 * configured, local disk under `uploads/` otherwise. The differences are
 * deliberate and narrow:
 *
 * - **images only** — no PDF, and the bytes must sniff as JPEG/PNG/WebP;
 * - **2 MB cap** (`AVATAR_MAX_MB`), because a face crop never needs more;
 * - the public id is derived from the **account id only**, so a member has at
 *   most one live photo and replacing it overwrites the old one instead of
 *   leaving an orphan behind.
 *
 * The URL stored on `User.avatarUrl` is always one this module wrote; a
 * client-supplied foreign URL is never accepted (see the schema layer).
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../../utils/AppError.js';
import {
  ensureUploadDir,
  initCloudinary,
  isCloudinaryConfigured,
  isCloudinaryUrl,
  parseCloudinaryPublicId,
  sniffMime,
  uploadDir,
} from '../finance/receipt.js';

export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

/** Local route prefix the uploads are served from (shared with receipts). */
export const AVATAR_URL_PREFIX = '/uploads';
export const AVATAR_FILE_PREFIX = 'avatar-';
export const DEFAULT_AVATAR_MAX_MB = 2;

const EXTENSION_FOR_MIME: Record<AvatarMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function avatarMaxMb(): number {
  const raw = Number(process.env.AVATAR_MAX_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AVATAR_MAX_MB;
}

export function avatarMaxBytes(): number {
  return Math.round(avatarMaxMb() * 1024 * 1024);
}

/** True when the declared MIME type is an accepted profile-photo format. */
export function isAllowedAvatarMime(mime: unknown): mime is AvatarMimeType {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(
    String(mime ?? '').toLowerCase()
  );
}

export function avatarExtensionForMime(mime: unknown): string | null {
  return EXTENSION_FOR_MIME[String(mime ?? '').toLowerCase() as AvatarMimeType] ?? null;
}

/**
 * The storage filename. The account id keeps only hex characters, and the
 * random suffix means a replacement never reuses a cached URL.
 */
export function buildAvatarFilename(
  userId: unknown,
  mime: unknown,
  unique?: string
): string | null {
  const extension = avatarExtensionForMime(mime);
  if (!extension) return null;
  const account = String(userId ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  const suffix = (unique || crypto.randomBytes(6).toString('hex')).replace(/[^a-zA-Z0-9]/g, '');
  return `${AVATAR_FILE_PREFIX}${account || 'user'}-${suffix}.${extension}`;
}

/** True when a stored `avatarUrl` points at a local file this service manages. */
export function isManagedAvatarUrl(url: unknown): boolean {
  const value = String(url ?? '');
  if (!value || value.includes('..') || value.includes('\\')) return false;
  return value.startsWith(`${AVATAR_URL_PREFIX}/${AVATAR_FILE_PREFIX}`);
}

/** Extracts the storage filename from a managed local avatar URL (or null). */
export function avatarFilenameFromUrl(url: unknown): string | null {
  if (!isManagedAvatarUrl(url)) return null;
  const base = path.basename(String(url));
  return base.startsWith(AVATAR_FILE_PREFIX) ? base : null;
}

/** Validates a buffer as a real image of the declared type (throws 400). */
export function assertAvatarBytes(mime: unknown, buffer: Buffer | null | undefined): void {
  const sniffed = sniffMime(buffer);
  const declared = String(mime ?? '').toLowerCase();
  if (!isAllowedAvatarMime(declared)) {
    throw new AppError('Choose a JPEG, PNG or WebP photo.', 400);
  }
  if (sniffed !== declared) {
    throw new AppError('That file does not look like a photo. Choose a JPEG, PNG or WebP image.', 400);
  }
}

/** Cloudinary folder for profile photos (kept apart from receipts). */
export function avatarFolder(): string {
  const base = process.env.CLOUDINARY_FOLDER || 'travelai';
  return `${base.replace(/\/+$/, '')}/avatars`;
}

/**
 * Uploads a photo and returns the URL to store. Cloudinary gets a square
 * 400px face crop so chat bubbles and the roster never download a 6 MP file.
 */
export async function saveAvatar(
  userId: string,
  buffer: Buffer,
  mime: AvatarMimeType
): Promise<string> {
  if (isCloudinaryConfigured()) {
    const cld = initCloudinary();
    return new Promise<string>((resolve, reject) => {
      const uploadStream = cld.uploader.upload_stream(
        {
          folder: avatarFolder(),
          public_id: `${AVATAR_FILE_PREFIX}${String(userId).replace(/[^a-zA-Z0-9]/g, '')}`,
          resource_type: 'image',
          overwrite: true,
          invalidate: true,
          transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
        },
        (error, result) => {
          if (error || !result?.secure_url) {
            reject(error || new Error('Failed to store the profile photo'));
          } else {
            resolve(result.secure_url);
          }
        }
      );
      uploadStream.end(buffer);
    });
  }

  const filename = buildAvatarFilename(userId, mime);
  if (!filename) throw new AppError('Choose a JPEG, PNG or WebP photo.', 400);
  const dir = await ensureUploadDir();
  await fs.writeFile(path.join(dir, filename), buffer);
  return `${AVATAR_URL_PREFIX}/${filename}`;
}

/**
 * Best-effort removal of the file behind a stored URL. Never throws: losing the
 * file must not block the account update that cleared the reference.
 */
export async function deleteAvatarFile(url: unknown): Promise<void> {
  try {
    if (isCloudinaryUrl(url)) {
      const parsed = parseCloudinaryPublicId(url);
      if (!parsed) return;
      await initCloudinary().uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType,
        invalidate: true,
      });
      return;
    }
    const filename = avatarFilenameFromUrl(url);
    if (!filename) return;
    await fs.unlink(path.join(uploadDir(), filename));
  } catch {
    // A missing/already-deleted file is fine.
  }
}
