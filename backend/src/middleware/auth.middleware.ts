import { Response, NextFunction } from 'express';
import User from '../models/User.js';
import {
  SESSION_COOKIES,
  verifyRealmToken,
} from '../services/auth/realm.js';
import { isAgencyActive } from '../services/agency/status.js';
import type {
  AccountRealm,
  AuthenticatedRequest,
  RealmIdentity,
  RealmTokenClaims,
} from '../types/index.js';

/**
 * Realm-aware authentication guards (PA0).
 *
 * Every protected route names its realm:
 *
 * - `protectPersonal` — personal cookie/Bearer only.
 * - `protectAgency` — agency cookie/Bearer only; the account's `agencyId` must
 *   match any `:agencyId` path param, and the tenant must be active.
 * - `protectSession` — shared trip surface: accepts `token` or `agency_token`
 *   (never `platform_token`) and records every valid identity so the trip guard
 *   can pick the one that actually has access.
 * - `protectPlatform` — platform cookie/Bearer and `super_admin` (PA1).
 *
 * The database account is the source of truth: realm, status, `tokenVersion`,
 * tenant binding and platform role are re-checked on every request. A mismatch
 * is a generic 401; a cross-tenant path is a 404 like a missing resource.
 */

export const AUTH_GUARD_TAG = Symbol.for('travelai.realmGuard');
export type AuthGuardKind = 'personal' | 'agency' | 'session' | 'platform';

const INVALID_SESSION_MESSAGE =
  'Your session has expired or is invalid. Please sign in again.';
const PASSWORD_CHANGE_MESSAGE =
  'Change your temporary password before continuing.';
const AGENCY_NOT_FOUND_MESSAGE = 'Agency not found';

/**
 * Routes reachable while `mustChangePassword` is set. Paths are relative to the
 * auth router mount (`/api/auth` or `/api/agency/auth`). Every other guard use
 * is blocked with `403 PASSWORD_CHANGE_REQUIRED`.
 */
const PASSWORD_CHANGE_EXEMPT_PATHS = new Set([
  '/me',
  '/password',
  '/logout',
  '/csrf',
]);

interface LoadedIdentity extends RealmIdentity {
  mustChangePassword: boolean;
}

function unauthorized(res: Response) {
  return res.status(401).json({
    success: false,
    error: INVALID_SESSION_MESSAGE,
    message: INVALID_SESSION_MESSAGE,
  });
}

function tenantNotFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: AGENCY_NOT_FOUND_MESSAGE,
    message: AGENCY_NOT_FOUND_MESSAGE,
  });
}

function passwordChangeRequired(res: Response) {
  return res.status(403).json({
    success: false,
    code: 'PASSWORD_CHANGE_REQUIRED',
    error: PASSWORD_CHANGE_MESSAGE,
    message: PASSWORD_CHANGE_MESSAGE,
  });
}

function cookieToken(req: AuthenticatedRequest, realm: AccountRealm): string | undefined {
  const value = req.cookies?.[SESSION_COOKIES[realm]];
  return typeof value === 'string' && value ? value : undefined;
}

function bearerToken(req: AuthenticatedRequest): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token || undefined;
}

/**
 * Loads the account behind a verified claim and applies every realm rule.
 * Returns `null` for any mismatch so callers answer one generic 401.
 */
async function loadIdentity(
  claims: RealmTokenClaims,
  acceptedRealms: readonly AccountRealm[]
): Promise<LoadedIdentity | null> {
  if (!acceptedRealms.includes(claims.realm)) return null;

  const user = await User.findById(claims.userId).select(
    'accountType agencyId platformRole status mustChangePassword tokenVersion'
  );
  if (!user) return null;
  if (user.accountType !== claims.realm) return null;
  if (user.status !== 'active') return null;
  if (Number(user.tokenVersion ?? 0) !== Number(claims.ver ?? 0)) return null;

  if (claims.realm === 'agency') {
    if (!user.agencyId) return null;
    if (!claims.agencyId || String(user.agencyId) !== String(claims.agencyId)) {
      return null;
    }
    if (!(await isAgencyActive(user.agencyId))) return null;
  }

  if (claims.realm === 'platform') {
    if (user.platformRole !== 'super_admin') return null;
    if (claims.role !== 'super_admin') return null;
  }

  return {
    userId: String(user._id),
    realm: claims.realm,
    agencyId: user.agencyId ? String(user.agencyId) : undefined,
    mustChangePassword: user.mustChangePassword === true,
  };
}

function attachIdentity(req: AuthenticatedRequest, identity: RealmIdentity): void {
  req.userId = identity.userId;
  req.realm = identity.realm;
  req.agencyId = identity.agencyId;
}

function requestedTenantMismatch(
  req: AuthenticatedRequest,
  identity: RealmIdentity
): boolean {
  const requested = req.params?.agencyId;
  if (!requested) return false;
  return (
    identity.realm !== 'agency' ||
    String(requested) !== String(identity.agencyId ?? '')
  );
}

function applyPasswordGate(
  req: AuthenticatedRequest,
  res: Response,
  identity: LoadedIdentity
): boolean {
  if (identity.mustChangePassword && !PASSWORD_CHANGE_EXEMPT_PATHS.has(req.path)) {
    passwordChangeRequired(res);
    return false;
  }
  return true;
}

/**
 * Single-realm guard factory. A Bearer token takes precedence over cookies, so
 * an API client never accidentally authenticates with a browser cookie.
 */
function makeRealmGuard(realm: AccountRealm): any {
  const guard: any = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = bearerToken(req) ?? cookieToken(req, realm);
      if (!token) return unauthorized(res);

      const claims = verifyRealmToken(token);
      const identity = await loadIdentity(claims, [realm]);
      if (!identity) return unauthorized(res);

      if (realm === 'agency' && requestedTenantMismatch(req, identity)) {
        return tenantNotFound(res);
      }
      if (!applyPasswordGate(req, res, identity)) return;

      attachIdentity(req, identity);
      req.sessionCandidates = [
        { userId: identity.userId, realm: identity.realm, agencyId: identity.agencyId },
      ];
      return next();
    } catch {
      return unauthorized(res);
    }
  };

  guard[AUTH_GUARD_TAG] = { realm };
  return guard;
}

/** Personal realm: `/api/auth`, personal trip collections, trip invites, geo. */
export const protectPersonal = makeRealmGuard('personal');

/** Agency realm: `/api/agency/*` staff routes and `/api/agency/auth/*`. */
export const protectAgency = makeRealmGuard('agency');

/** Platform realm (PA1): `/api/admin/*` only. */
export const protectPlatform = makeRealmGuard('platform');

/**
 * Shared trip guard. Both personal and agency cookies are independent, so a
 * browser may legitimately hold both. Each cookie is verified on its own; an
 * expired personal cookie never blocks a live agency session (and vice versa).
 * The primary identity follows the request's declared `agencyId`, otherwise the
 * personal session wins. `requireTripRole` re-selects per trip document.
 */
export const protectSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const candidates: LoadedIdentity[] = [];
    const bearer = bearerToken(req);

    if (bearer) {
      const claims = verifyRealmToken(bearer);
      const identity = await loadIdentity(claims, ['personal', 'agency']);
      if (identity) candidates.push(identity);
    } else {
      for (const realm of ['personal', 'agency'] as const) {
        const token = cookieToken(req, realm);
        if (!token) continue;
        try {
          const claims = verifyRealmToken(token);
          if (claims.realm !== realm) continue;
          const identity = await loadIdentity(claims, ['personal', 'agency']);
          if (identity) candidates.push(identity);
        } catch {
          // A stale credential for one realm must not sign the other out.
        }
      }
    }

    if (candidates.length === 0) return unauthorized(res);

    const requestedAgencyId = String(
      (req.body as { agencyId?: unknown } | undefined)?.agencyId ??
        (req.query as { agencyId?: unknown } | undefined)?.agencyId ??
        ''
    );

    const primary =
      (requestedAgencyId
        ? candidates.find(
            (candidate) =>
              candidate.realm === 'agency' &&
              String(candidate.agencyId) === requestedAgencyId
          )
        : undefined) ??
      candidates.find((candidate) => candidate.realm === 'personal') ??
      candidates[0];

    if (!applyPasswordGate(req, res, primary)) return;

    req.sessionCandidates = candidates.map(({ userId, realm, agencyId }) => ({
      userId,
      realm,
      agencyId,
    }));
    attachIdentity(req, primary);
    return next();
  } catch {
    return unauthorized(res);
  }
};

(protectSession as any)[AUTH_GUARD_TAG] = { realm: 'session' };
