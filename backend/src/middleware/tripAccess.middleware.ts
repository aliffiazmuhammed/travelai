import { Request, Response, NextFunction } from 'express';
import Trip from '../models/Trip.js';
import AgencyMember from '../models/AgencyMember.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest, RealmIdentity } from '../types/index.js';
import { TripRole, can, roleOf } from '../services/collab/access.js';
import {
  mapAgencyRoleToTripRole,
  type AgencyRole,
} from '../services/agency/access.js';

/**
 * The trip-access guard — the ONLY place trip authorization happens
 * (`docs/roadmap-milestone-6-collaboration.md` §3.2).
 *
 * Applied on the router, never inside controllers:
 *
 *   router.put('/:id', protectSession, requireTripRole('owner'), updateTrip)
 *
 * Responsibilities:
 * 1. Load the trip by id, rejecting soft-deleted documents unless the route
 *    explicitly opts into the trash (`includeDeleted`); restore/purge also set
 *    `onlyDeleted` so those routes cannot act on a live trip.
 * 2. Resolve the caller's role via `roleOf` and reject with **404 when they
 *    have no access at all** (identical to a nonexistent trip, so ids cannot
 *    be probed) and **403 when they are a member whose rank is too low**.
 * 3. Enforce optimistic-concurrency `rev` checks (Milestone 6 §3.6) so no
 *    controller can forget them.
 * 4. Stash the loaded document on `req.trip` so controllers never re-query —
 *    which also removes the temptation to re-scope by `userId`.
 *
 * The `__tripGuard` tag is asserted by the router-coverage test
 * (`src/services/collab/routerCoverage.test.ts`): any trip-scoped route
 * without this guard fails CI.
 */
export const TRIP_GUARD_TAG = Symbol.for('travelai.requireTripRole');

export interface TripAccessRequest extends AuthenticatedRequest {
  /** The trip document loaded and authorized by `requireTripRole`. */
  trip?: any;
  /** The caller's role on `req.trip` (`null` is impossible past the guard). */
  tripRole?: TripRole;
  /** The client's declared `rev`, when it sent one. */
  baseRev?: number;
  /** Set when the effective role came from an agency membership. */
  agencyRole?: AgencyRole;
  agencyStaff?: boolean;
}

/** How strictly the guard should compare `req.body.baseRev` against `trip.rev`. */
export type RevMode =
  /** Ignore concurrency entirely (reads, and single-item writes in E1). */
  | 'off'
  /** Compare when the client sent `baseRev`; ignore when it did not. */
  | 'optional'
  /** 409 when `baseRev` is absent or stale — protects whole-document writes. */
  | 'required';

export interface TripGuardOptions {
  /** Load `versions` too (the field is `select: false`). */
  withVersions?: boolean;
  revMode?: RevMode;
  /**
   * Allow a soft-deleted trip through. Reserved for the trash routes; every
   * normal trip route must keep the default so a deleted trip answers 404.
   */
  includeDeleted?: boolean;
  /** Require the trip to be deleted (restore/purge). Implies `includeDeleted`. */
  onlyDeleted?: boolean;
}

/** Parses a client-supplied `baseRev`, ignoring malformed values. */
function parseBaseRev(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Parser for the `x-trip-rev` header, kept alongside the body-based one. */
export function resolveBaseRev(
  req: Pick<TripAccessRequest, 'body'> & { headers?: Record<string, unknown>; get?: (k: string) => string | undefined }
): number | undefined {
  const headerValue = typeof req.get === 'function' ? req.get('x-trip-rev') : undefined;
  return parseBaseRev(headerValue ?? (req.body as { baseRev?: unknown } | undefined)?.baseRev);
}

/**
 * Strict accessor for controllers — pairs with `req.trip`/`req.tripRole` set
 * by the guard. Throws loudly (500) if a handler ever runs without its guard,
 * so a wiring mistake cannot silently weaken authorization.
 */
export function tripContext(req: Request): {
  trip: any;
  role: TripRole;
  agencyRole?: AgencyRole;
  agencyStaff: boolean;
} {
  const access = req as TripAccessRequest;
  if (!access.trip || !access.tripRole) {
    throw new AppError('Route is missing its trip access guard. This is a server bug.', 500);
  }
  return {
    trip: access.trip,
    role: access.tripRole,
    agencyRole: access.agencyRole,
    agencyStaff: access.agencyStaff === true,
  };
}

const FORBIDDEN_MESSAGE =
  "You don't have permission to make this change to this trip.";

const REV_CONFLICT_MESSAGE =
  'This trip was changed by someone else while you were working. Reload the latest version to continue.';

const OUT_OF_DATE_MESSAGE =
  'Your view of this trip is out of date. Reload the latest version before making changes.';

/**
 * Guard factory. `min` is the minimum role rank accepted — `commenter` is the
 * floor for posting to a trip's comment stream (F6a); a trip's creator is an
 * `owner` member.
 */
export function requireTripRole(
  min: TripRole,
  options: TripGuardOptions = {}
): (req: TripAccessRequest, res: Response, next: NextFunction) => Promise<unknown> {
  const guard = async (
    req: TripAccessRequest,
    res: Response,
    next: NextFunction
  ): Promise<unknown> => {
    // `protectSession` runs first on every guarded route; enforce the ordering.
    const candidates: RealmIdentity[] = req.sessionCandidates?.length
      ? req.sessionCandidates
      : req.userId
        ? [
            {
              userId: req.userId,
              realm: req.realm ?? 'personal',
              agencyId: req.agencyId,
            },
          ]
        : [];
    if (candidates.length === 0) {
      throw new AppError('Please sign in to access this feature.', 401);
    }

    const includeDeleted = options.includeDeleted === true || options.onlyDeleted === true;
    const trip = await Trip.findOne({
      _id: String(req.params.id),
      ...(includeDeleted ? {} : { isDeleted: { $ne: true } }),
    }).select(options.withVersions ? '+versions' : '');

    // Not found AND no access are indistinguishable on purpose (§3.2).
    // Agency staff authorization comes from `AgencyMember`, never from the
    // trip creator field. Client collaborators on the same trip still resolve
    // through `members[]` below. When the caller is an agency member, that
    // mapping takes precedence over any trip membership row; non-members are
    // treated as clients using the normal invite roles.
    //
    // PA0: a browser may hold both `token` and `agency_token`. The trip's
    // tenant decides which identity applies — never the cookie order.
    let role = null as TripRole | null;
    let agencyRole: AgencyRole | undefined;
    let agencyStaff = false;
    let identity: RealmIdentity | undefined;

    if (trip && trip.workspace === 'agency' && trip.agencyId) {
      const tenantIdentity = candidates.find(
        (candidate) =>
          candidate.realm === 'agency' &&
          String(candidate.agencyId) === String(trip.agencyId)
      );
      if (tenantIdentity) {
        const member = await AgencyMember.findOne({
          agencyId: trip.agencyId,
          userId: tenantIdentity.userId,
        })
          .select('role')
          .lean();

        if (member) {
          identity = tenantIdentity;
          agencyRole = member.role as AgencyRole;
          agencyStaff = true;
          role = mapAgencyRoleToTripRole(agencyRole);
        }
      }
    }

    if (!identity) {
      // Personal collaborator, or an agency account that was invited directly.
      for (const candidate of candidates) {
        const candidateRole = roleOf(trip, candidate.userId);
        if (candidateRole) {
          identity = candidate;
          role = candidateRole;
          break;
        }
      }
    }

    if (!trip || !role || !identity) {
      throw new AppError('Trip not found', 404);
    }

    // Restore/purge are trash-only routes; a live trip is not found there.
    if (options.onlyDeleted && !trip.isDeleted) {
      throw new AppError('Trip not found', 404);
    }

    if (!can(role, min)) {
      throw new AppError(FORBIDDEN_MESSAGE, 403);
    }

    // Concurrency check (§3.6): viewers never write, so skip for read guards.
    const revMode = options.revMode ?? 'off';
    if (revMode !== 'off') {
      const baseRev = parseBaseRev(req.body?.baseRev);

      if (revMode === 'required' && baseRev === undefined) {
        // Same structured shape as a genuine conflict so the client treats
        // "did not send a rev" and "sent a stale rev" with one UX path.
        return res.status(409).json({
          success: false,
          code: 'REV_CONFLICT',
          currentRev: trip.rev ?? 1,
          updatedAt: trip.updatedAt,
          error: OUT_OF_DATE_MESSAGE,
          message: OUT_OF_DATE_MESSAGE,
        });
      }

      if (baseRev !== undefined && Number(trip.rev ?? 1) !== baseRev) {
        return res.status(409).json({
          success: false,
          code: 'REV_CONFLICT',
          currentRev: trip.rev ?? 1,
          updatedAt: trip.updatedAt,
          error: REV_CONFLICT_MESSAGE,
          message: REV_CONFLICT_MESSAGE,
        });
      }

      req.baseRev = baseRev;
    }

    req.trip = trip;
    req.tripRole = role;
    req.agencyRole = agencyRole;
    req.agencyStaff = agencyStaff;
    // Controllers and services act as the identity the trip authorized, not
    // whichever realm cookie happened to be first.
    req.userId = identity.userId;
    req.realm = identity.realm;
    req.agencyId = identity.agencyId;
    return next();
  };

  // Expose the tag for the router-coverage test on the OUTER handler (the one
  // Express actually mounts) — `catchAsync` wraps the implementation, so the
  // tag would otherwise disappear.
  const guarded = catchAsync(guard as any) as any;
  guarded[TRIP_GUARD_TAG] = { min, options };
  return guarded;
}
