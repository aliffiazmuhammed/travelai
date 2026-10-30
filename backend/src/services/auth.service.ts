import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { mergePubKeyList } from './collab/chatKeys.js';
import { assertNameAllowed, normalizeName, publicUser } from './user/profile.js';
import { signSessionForAccount } from './auth/realm.js';

/**
 * Personal auth service (PA0 scoping).
 *
 * Both signup and signin filter `accountType: 'personal'`. Without that filter
 * an email lookup could resolve an agency or platform account after the global
 * email index is replaced by realm-scoped partial indexes — a personal
 * credential must never open another realm.
 */

const PERSONAL = 'personal' as const;

export const signup = async (email: string, password: string, name?: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({
    email: normalizedEmail,
    accountType: PERSONAL,
  });
  if (existingUser) {
    throw new AppError('An account with this email already exists. Please sign in instead.', 400);
  }

  const displayName = normalizeName(name);
  assertNameAllowed(displayName);

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = new User({
    email: normalizedEmail,
    password: hashedPassword,
    accountType: PERSONAL,
    ...(displayName ? { name: displayName } : {}),
  });
  await user.save();

  const token = signSessionForAccount(user, 'personal');

  return { user: publicUser(user), token };
};

export const signin = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    accountType: PERSONAL,
  });
  if (!user) {
    throw new AppError('Incorrect email or password. Please check your credentials and try again.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError('Incorrect email or password. Please check your credentials and try again.', 401);
  }
  if (user.status !== 'active') {
    // Same generic answer as a bad password: disabled is not enumerable.
    throw new AppError('Incorrect email or password. Please check your credentials and try again.', 401);
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const token = signSessionForAccount(user, 'personal');

  return { user: publicUser(user), token };
};

/**
 * Loads the signed-in account for `/api/auth/me`.
 *
 * Returns the same narrow projection as signup/signin. The previous
 * `select('-password')` still shipped `chatPubKey(s)`, `googleId`, `updatedAt`
 * and any future schema field; `/auth/me` is a profile payload, not a document
 * dump, so the shape is now explicit and shared with the other auth responses.
 */
export const getUserById = async (userId: string) => {
  const user = await User.findOne({
    _id: userId,
    accountType: PERSONAL,
  }).select('email name avatarUrl profile createdAt');
  if (!user) {
    throw new AppError('User profile not found.', 404);
  }
  return publicUser(user);
};

/**
 * Publishes the browser's chat public key (Milestone 7, F10; multi-device
 * F10d). Idempotent: re-publishing the same key just moves it to the front.
 * The private half never reaches this service, so there is nothing secret to
 * protect beyond what the zod layer already validated. Each browser keeps its
 * own slot in `chatPubKeys` (newest first, capped) so two devices of one
 * account can BOTH hold the conversation key.
 */
export const setChatPubKey = async (userId: string, pubKey: string) => {
  const key = String(pubKey || '').trim();
  const user = await User.findById(userId).select('chatPubKeys').lean();
  const chatPubKeys = mergePubKeyList((user as any)?.chatPubKeys, key);
  await User.updateOne({ _id: userId }, { $set: { chatPubKey: key, chatPubKeys } });
};
