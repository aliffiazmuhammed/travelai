/**
 * Profile editing (Milestone 7, F14): display name, profile photo, password.
 * Milestone 8 G1 adds the public traveler handle and bio — gallery identity,
 * personal accounts only.
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
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { userLabel } from '../collab/comments.js';
import type { AvatarMimeType } from './avatar.js';
import { assertAvatarBytes, deleteAvatarFile, saveAvatar } from './avatar.js';
import {
  BIO_MAX_LEN,
  HANDLE_MAX_LEN,
  HANDLE_MIN_LEN,
  NAME_MAX_LEN,
} from '../../schemas/profile.schema.js';

/** What the owner's own session may see about itself. */
export interface PublicUser {
  _id: string;
  email: string;
  name?: string;
  /** The label other members will see (name, else the email local part). */
  label: string;
  avatarUrl?: string;
  /** Public traveler handle (Milestone 8 G1), absent until one is claimed. */
  handle?: string;
  /** Public bio shown on the traveler page (Milestone 8 G1). */
  bio?: string;
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
  if (user.profile?.handle) projected.handle = String(user.profile.handle);
  if (user.profile?.bio) projected.bio = String(user.profile.bio);
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

/* -------------------------------------------------------------------------- */
/*  Traveler handle (Milestone 8 G1)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Handles that would shadow app routes (`/explore`, `/travelers/:handle`) or
 * read as staff. Lowercase because the handle is a case-insensitive URL key.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about',
  'account',
  'admin',
  'agency',
  'api',
  'auth',
  'dashboard',
  'explore',
  'gallery',
  'help',
  'invite',
  'join',
  'login',
  'logout',
  'me',
  'new',
  'privacy',
  'profile',
  'settings',
  'shared',
  'signin',
  'signup',
  'support',
  'terms',
  'traveler',
  'travelers',
  'trip',
  'trips',
]);

const HANDLE_PATTERN = /^[a-z0-9_]+$/;

/** Trim, drop a leading `@`, lowercase — the one normalization used everywhere. */
export function normalizeHandle(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

/** Pure rule: 3–24 chars, `[a-z0-9_]`, never a reserved word. */
export function assertHandleAllowed(handle: string): void {
  if (handle.length < HANDLE_MIN_LEN || handle.length > HANDLE_MAX_LEN) {
    throw new AppError(
      `Handles must be ${HANDLE_MIN_LEN}–${HANDLE_MAX_LEN} characters.`,
      400
    );
  }
  if (!HANDLE_PATTERN.test(handle)) {
    throw new AppError('Handles can use lowercase letters, numbers and underscores only.', 400);
  }
  if (RESERVED_HANDLES.has(handle)) {
    throw new AppError('That handle is reserved. Please choose another.', 400);
  }
}

/** Bio normalization: single-spaced, trimmed, capped at 280 (empty clears it). */
export function normalizeBio(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function assertBioAllowed(bio: string): void {
  if (bio.length > BIO_MAX_LEN) {
    throw new AppError(`Bios must be ${BIO_MAX_LEN} characters or fewer.`, 400);
  }
}

export interface HandleAvailability {
  handle: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
}

/** Non-throwing handle check for the live availability endpoint. */
export async function checkHandleAvailability(raw: unknown): Promise<HandleAvailability> {
  const handle = normalizeHandle(raw);
  if (
    handle.length < HANDLE_MIN_LEN ||
    handle.length > HANDLE_MAX_LEN ||
    !HANDLE_PATTERN.test(handle)
  ) {
    return { handle, available: false, reason: 'invalid' };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { handle, available: false, reason: 'reserved' };
  }
  const taken = await User.exists({ accountType: 'personal', 'profile.handle': handle });
  return taken ? { handle, available: false, reason: 'taken' } : { handle, available: true };
}

async function hasPublishedTrips(userId: string): Promise<boolean> {
  return Boolean(
    await Trip.exists({
      userId,
      workspace: { $ne: 'agency' },
      visibility: 'public',
      isDeleted: { $ne: true },
    })
  );
}

/**
 * The personal PATCH /profile path: name, handle and bio may be updated
 * independently, but only fields present in the body are touched.
 */
export interface PersonalProfileInput {
  name?: unknown;
  handle?: unknown;
  bio?: unknown;
}

export async function updatePersonalProfile(
  userId: string,
  input: PersonalProfileInput
): Promise<PublicUser> {
  const user = await loadOwnUser(userId);

  // Validate everything before the first write: a rejected handle must not
  // leave a half-applied name/bio change behind.
  const nextName = input.name === undefined ? undefined : normalizeName(input.name);
  if (nextName !== undefined) assertNameAllowed(nextName);

  const nextHandle = input.handle === undefined ? undefined : normalizeHandle(input.handle);
  if (nextHandle) {
    assertHandleAllowed(nextHandle);
    const taken = await User.exists({
      accountType: 'personal',
      'profile.handle': nextHandle,
      _id: { $ne: userId },
    });
    if (taken) {
      throw new AppError('That handle is already taken.', 409);
    }
  }
  if (nextHandle === '' && (await hasPublishedTrips(userId))) {
    throw new AppError('Unpublish your trips before removing your handle.', 409);
  }

  const nextBio = input.bio === undefined ? undefined : normalizeBio(input.bio);
  if (nextBio !== undefined) assertBioAllowed(nextBio);

  if (nextName !== undefined) {
    if (nextName) {
      user.name = nextName;
    } else {
      // Mongoose ignores assignments of `undefined`; clearing needs an explicit
      // `$unset` so the label falls back to the email local part.
      await User.updateOne({ _id: userId }, { $unset: { name: 1 } });
      user.name = undefined;
    }
  }

  const profile: { handle?: string; bio?: string } = {};
  if (user.profile?.handle) profile.handle = String(user.profile.handle);
  if (user.profile?.bio) profile.bio = String(user.profile.bio);

  if (nextHandle !== undefined) {
    if (nextHandle) profile.handle = nextHandle;
    else delete profile.handle;
  }
  if (nextBio !== undefined) {
    if (nextBio) profile.bio = nextBio;
    else delete profile.bio;
  }

  const profileTouched =
    (nextHandle !== undefined && nextHandle !== (user.profile?.handle ?? '')) ||
    (nextBio !== undefined && nextBio !== (user.profile?.bio ?? ''));

  if (profileTouched) {
    if (profile.handle || profile.bio) {
      user.profile = profile;
    } else {
      await User.updateOne({ _id: userId }, { $unset: { profile: 1 } });
      user.profile = undefined;
    }
  }

  try {
    await user.save();
  } catch (error: any) {
    // The unique index is the real gate (two tabs can race the availability
    // check); translate the duplicate-key error into an actionable 409.
    if (error?.code === 11000) {
      throw new AppError('That handle is already taken.', 409);
    }
    throw error;
  }

  return publicUser(user);
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
