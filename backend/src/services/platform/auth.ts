import bcrypt from 'bcryptjs';
import User, { type IUser } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { signSessionForAccount } from '../auth/realm.js';
import { publicUser } from '../user/profile.js';

/**
 * Platform realm authentication (PA1).
 *
 * The platform realm is deliberately not an agency or personal login with extra
 * fields: only `accountType: 'platform'` records with `platformRole:
 * 'super_admin'` may sign in, and the generic credential error keeps the realm
 * unenumerable. There is no public signup path for this realm; the first
 * account is created by `scripts/bootstrap-platform-admin.ts`.
 */

const GENERIC_LOGIN_ERROR =
  'Incorrect email or password. Please check your details and try again.';

export interface PlatformSessionUser {
  _id: string;
  email: string;
  name?: string;
  label: string;
  avatarUrl?: string;
  createdAt?: Date;
  accountType: 'platform';
  platformRole: 'super_admin';
  mustChangePassword: boolean;
}

export interface PlatformSession {
  user: PlatformSessionUser;
}

/** The projection returned by signin and `/me` (never password/tokenVersion). */
export function projectPlatformSession(user: IUser): PlatformSession {
  return {
    user: {
      ...publicUser(user),
      accountType: 'platform',
      platformRole: 'super_admin',
      mustChangePassword: user.mustChangePassword === true,
    },
  };
}

export interface PlatformSigninInput {
  email: unknown;
  password: unknown;
}

export interface PlatformSigninResult extends PlatformSession {
  token: string;
}

export async function signinPlatform(
  input: PlatformSigninInput
): Promise<PlatformSigninResult> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');

  const user = email
    ? await User.findOne({
        email,
        accountType: 'platform',
        platformRole: 'super_admin',
      })
    : null;
  if (!user || user.status !== 'active') {
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) throw new AppError(GENERIC_LOGIN_ERROR, 401);

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return {
    ...projectPlatformSession(user),
    token: signSessionForAccount(user, 'platform'),
  };
}

/**
 * Loads the account behind a verified `protectPlatform` session. A missing or
 * downgraded account answers the same generic 401 as an invalid token.
 */
export async function loadPlatformSession(userId: string): Promise<PlatformSession> {
  const user = await User.findOne({
    _id: userId,
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
  });
  if (!user) {
    throw new AppError(
      'Your session has expired or is invalid. Please sign in again.',
      401
    );
  }
  return projectPlatformSession(user);
}
