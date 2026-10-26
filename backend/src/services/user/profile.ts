/**
 * Profile editing (Milestone 7, F14): display name, profile photo, password.
 *
 * Two deliberate boundaries:
 *
 * 1. **The name is presentation, never identity.** Authorization keeps using
 *    `userId` everywhere; the name only decides which label a member-facing
 *    surface renders (`userLabel` in `collab/comments.ts`).
 * 2. **The email is not editable here.** It is the sign-in identity and there is
 *    no verification mail path in this deployment, so a typo would lock the
 *    account out silently. Changing it needs a verified flow, not a form.
 *
 * Password changes keep the caller signed in on this device (the JWT is
 * stateless and the cookie is re-issued); already-issued tokens on *other*
 * devices stay valid until they expire — the documented, deliberate limit of
 * this increment (see docs/roadmap-milestone-7-conversation.md §12.17).
 */

import bcrypt from 'bcryptjs';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { userLabel } from '../collab/comments.js';
import type { AvatarMimeType } from './avatar.js';
import { assertAvatarBytes, deleteAvatarFile, saveAvatar } from './avatar.js';
import { NAME_MAX_LEN } from '../../schemas/profile.schema.js';

/** What the owner's own session may see about itself. */
export interface PublicUser {
  _id: string;
  email: string;
  name?: string;
  /** The label other members will see (name, else the email local part). */
  label: string;
  avatarUrl?: string;
  createdAt?: Date;
}

/** Projects a `User` document for its own owner (never for other members). */
export function publicUser(user: any): PublicUser {
  const projected: PublicUser = {
    _id: String(user._id),
    email: String(user.email || ''),
    label: userLabel(user),
  };
  if (user.name) projected.name = String(user.name);
  if (user.avatarUrl) projected.avatarUrl = String(user.avatarUrl);
  if (user.createdAt) projected.createdAt = user.createdAt;
  return projected;
}

/** Collapses runs of whitespace and trims — the one normalization used everywhere. */
export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pure rule: a name is 0..40 characters after normalization (0 clears it). */
export function assertNameAllowed(name: string): void {
  if (name.length > NAME_MAX_LEN) {
    throw new AppError(`Names must be ${NAME_MAX_LEN} characters or fewer.`, 400);
  }
}

export async function loadOwnUser(userId: string): Promise<any> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User profile not found.', 404);
  }
  return user;
}

/** Sets (or clears, with an empty name) the display name. */
export async function updateDisplayName(userId: string, rawName: unknown): Promise<PublicUser> {
  const name = normalizeName(rawName);
  assertNameAllowed(name);

  const user = await loadOwnUser(userId);
  if (name) {
    user.name = name;
    await user.save();
  } else {
    // Mongoose ignores assignments of `undefined`; clearing needs an explicit
    // `$unset` so the label falls back to the email local part.
    await User.updateOne({ _id: userId }, { $unset: { name: 1 } });
    user.name = undefined;
  }
  return publicUser(user);
}

/**
 * Verifies the current password and replaces it. Wrong current password and a
 * missing account both answer 401/404 — the caller already proved a session, so
 * "wrong password" is the only interesting failure.
 *
 * PA0: a password change bumps `tokenVersion`, so every other device's token
 * for this account is rejected on its next request, and clears the forced
 * change flag. The caller's realm controller reissues its own cookie with the
 * new version; the generic profile service stays realm-agnostic.
 */
export async function changePassword(
  userId: string,
  currentPassword: unknown,
  newPassword: unknown
): Promise<any> {
  const user = await loadOwnUser(userId);

  const matches = await bcrypt.compare(String(currentPassword ?? ''), user.password);
  if (!matches) {
    throw new AppError('That is not your current password. Please try again.', 401);
  }

  const next = String(newPassword ?? '');
  if (next.length < 6) {
    throw new AppError('Your new password must be at least 6 characters.', 400);
  }
  if (next === String(currentPassword ?? '')) {
    throw new AppError('Your new password must be different from the current one.', 400);
  }

  user.password = await bcrypt.hash(next, 12);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await user.save();
  return user;
}

/**
 * Stores a new photo, replacing (and then cleaning up) the previous one. The
 * file is written first so a failed upload never leaves an account pointing at
 * a URL that was never stored.
 */
export async function replaceAvatar(
  userId: string,
  buffer: Buffer | undefined,
  mime: string | undefined
): Promise<PublicUser> {
  if (!buffer || buffer.length === 0) {
    throw new AppError('Choose a photo to upload.', 400);
  }
  assertAvatarBytes(mime, buffer);

  const user = await loadOwnUser(userId);
  const previous = user.avatarUrl;
  const url = await saveAvatar(userId, buffer, String(mime).toLowerCase() as AvatarMimeType);

  user.avatarUrl = url;
  await user.save();

  if (previous && previous !== url) {
    await deleteAvatarFile(previous);
  }
  return publicUser(user);
}

/** Removes the photo (and its file), falling back to initials everywhere. */
export async function clearAvatar(userId: string): Promise<PublicUser> {
  const user = await loadOwnUser(userId);
  const previous = user.avatarUrl;
  await User.updateOne({ _id: userId }, { $unset: { avatarUrl: 1 } });
  user.avatarUrl = undefined;

  if (previous) await deleteAvatarFile(previous);
  return publicUser(user);
}
