import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../../models/User.js';
import PasswordResetToken from '../../models/PasswordResetToken.js';
import { AppError } from '../../utils/AppError.js';
import { appUrl } from '../mail/templates.js';
import { notifyPasswordReset } from '../mail/notify.js';

/**
 * Self-service password reset for the personal realm.
 *
 * Agency accounts are reset by their workspace owner or a platform operator, and
 * platform accounts rotate through `/api/admin/auth/password`; only the personal
 * realm has a public "forgot password" door. Requesting a reset always looks the
 * same to the caller, whether or not the address exists, so this endpoint cannot
 * be used to enumerate accounts.
 */

export const PASSWORD_RESET_TTL_MINUTES = 60;
const TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
const INVALID_LINK = 'This reset link is invalid or has expired.';

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/** 256-bit URL-safe token; only the hash is persisted. */
export function mintResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function resetTokenHash(rawToken: string): string {
  return sha256(String(rawToken || ''));
}

export function resetLinkFor(rawToken: string): string {
  return appUrl(`/reset-password/${rawToken}`);
}

/**
 * Issues a fresh token and emails the link. Unknown, disabled and non-personal
 * addresses are a no-op — the controller still answers with the same generic
 * message.
 */
export async function requestPersonalPasswordReset(rawEmail: unknown): Promise<void> {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!email) return;

  const user = await User.findOne({
    email,
    accountType: 'personal',
    status: 'active',
  });
  if (!user) return;

  // A new request replaces any link still sitting in an inbox.
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });

  const rawToken = mintResetToken();
  const token = await PasswordResetToken.create({
    userId: user._id,
    tokenHash: resetTokenHash(rawToken),
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  await notifyPasswordReset({
    userId: String(user._id),
    email: String(user.email),
    name: user.name ? String(user.name) : undefined,
    resetTokenId: String(token._id),
    resetUrl: resetLinkFor(rawToken),
    expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
}

/**
 * Consumes a token and replaces the password. The token is claimed atomically
 * *after* the account is validated (so a typo in the new password does not burn
 * the link) but *before* the password write (so two requests cannot both win).
 */
export async function resetPasswordWithToken(
  rawToken: unknown,
  newPassword: unknown
): Promise<any> {
  const tokenValue = String(rawToken ?? '').trim();
  const next = String(newPassword ?? '');
  if (!tokenValue) throw new AppError(INVALID_LINK, 400);
  if (next.length < 6) {
    throw new AppError('Your new password must be at least 6 characters.', 400);
  }

  const token = await PasswordResetToken.findOne({
    tokenHash: resetTokenHash(tokenValue),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!token) throw new AppError(INVALID_LINK, 400);

  const user = await User.findOne({
    _id: token.userId,
    accountType: 'personal',
    status: 'active',
  });
  if (!user) throw new AppError(INVALID_LINK, 400);

  if (await bcrypt.compare(next, user.password)) {
    throw new AppError('Choose a password you have not used on this account before.', 400);
  }

  const claimed = await PasswordResetToken.findOneAndUpdate(
    { _id: token._id, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!claimed) throw new AppError(INVALID_LINK, 400);

  user.password = await bcrypt.hash(next, 12);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await user.save();

  await PasswordResetToken.deleteMany({ userId: user._id, _id: { $ne: claimed._id } });
  return user;
}
