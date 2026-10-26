import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { AccountRealm, RealmTokenClaims } from '../../types/index.js';

export type { AccountRealm, RealmTokenClaims };

/** Realm session cookies are independent so personal and agency can coexist. */
export const SESSION_COOKIES: Record<AccountRealm, string> = {
  personal: 'token',
  agency: 'agency_token',
  platform: 'platform_token',
};

/** Every cookie that represents a session for CSRF purposes. */
export const ALL_SESSION_COOKIES: readonly string[] = Object.values(SESSION_COOKIES);

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const ACCOUNT_REALMS: readonly AccountRealm[] = [
  'personal',
  'agency',
  'platform',
];

interface SignedRealmInput {
  userId: string;
  realm: AccountRealm;
  agencyId?: string;
  role?: 'super_admin';
  tokenVersion?: number;
}

/**
 * Signs a realm-scoped JWT.
 *
 * The realm claim is mandatory for new tokens. `ver` is the account's
 * `tokenVersion`, so a password change or admin disable invalidates every
 * already-issued token without a server-side session store.
 */
export function signRealmToken(input: SignedRealmInput): string {
  const claims: RealmTokenClaims = {
    userId: String(input.userId),
    realm: input.realm,
    ver: Number(input.tokenVersion ?? 0),
  };
  if (input.realm === 'agency') {
    claims.agencyId = String(input.agencyId ?? '');
  }
  if (input.realm === 'platform' && input.role) {
    claims.role = input.role;
  }
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verifies shape and signature. Legacy personal tokens (issued before PA0)
 * carry only `{ userId }`; they are treated as `realm: 'personal', ver: 0`,
 * exactly as the migration plan specifies.
 */
export function verifyRealmToken(token: string): RealmTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
  const userId = typeof decoded.userId === 'string' ? decoded.userId : '';
  if (!userId) throw new Error('Invalid session token.');

  const realm = (
    typeof decoded.realm === 'string' ? decoded.realm : 'personal'
  ) as AccountRealm;
  if (!ACCOUNT_REALMS.includes(realm)) throw new Error('Invalid session realm.');

  const version = Number(decoded.ver);
  const claims: RealmTokenClaims = {
    userId,
    realm,
    ver: Number.isInteger(version) && version >= 0 ? version : 0,
  };

  if (realm === 'agency') {
    if (typeof decoded.agencyId !== 'string' || !decoded.agencyId) {
      throw new Error('Agency session is missing its tenant.');
    }
    claims.agencyId = decoded.agencyId;
  }
  if (realm === 'platform') {
    if (decoded.role !== 'super_admin') throw new Error('Invalid platform role.');
    claims.role = 'super_admin';
  }

  return claims;
}

export function signSessionForAccount(
  user: {
    _id: unknown;
    tokenVersion?: number;
    agencyId?: unknown;
    platformRole?: string;
  },
  realm: AccountRealm
): string {
  return signRealmToken({
    userId: String(user._id),
    realm,
    tokenVersion: Number(user.tokenVersion ?? 0),
    agencyId: realm === 'agency' ? String(user.agencyId ?? '') : undefined,
    role:
      realm === 'platform' && user.platformRole === 'super_admin'
        ? 'super_admin'
        : undefined,
  });
}

/** Cookie options shared by every realm (previously in auth.controller). */
export const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS,
    expires: new Date(Date.now() + SESSION_DURATION_MS),
  };
};

export function setRealmCookie(
  res: Response,
  realm: AccountRealm,
  token: string
): void {
  res.cookie(SESSION_COOKIES[realm], token, getCookieOptions());
}

export function clearRealmCookie(res: Response, realm: AccountRealm): void {
  const opts = getCookieOptions();
  res.clearCookie(SESSION_COOKIES[realm], {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
}
