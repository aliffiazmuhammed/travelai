import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Agency from '../models/Agency.js';
import AgencyMember from '../models/AgencyMember.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  decideAgencyAccess,
  type AgencyRole,
} from '../services/agency/access.js';

/**
 * Agency access guards (Agency Workspace A1).
 *
 * Every `/:agencyId` route must carry one of these. No access is a 404, so a
 * personal user cannot distinguish "agency exists" from "agency does not
 * exist". A known member below the required rank gets a 403.
 *
 * The loaded documents are stashed on the request so controllers never re-query
 * without the tenant filter.
 */
export interface AgencyAccessRequest extends AuthenticatedRequest {
  agency?: any;
  agencyMember?: any;
  agencyRole?: AgencyRole;
}

export const AGENCY_MEMBER_GUARD_TAG = Symbol.for('travelai.requireAgencyMember');
export const AGENCY_ROLE_GUARD_TAG = Symbol.for('travelai.requireAgencyRole');

const FORBIDDEN_MESSAGE =
  "You don't have permission to make this change in this agency.";

async function loadAgencyAccess(req: AgencyAccessRequest) {
  if (!req.userId) {
    throw new AppError('Please sign in to access this feature.', 401);
  }

  const agencyId = String(req.params.agencyId || '');
  if (!mongoose.isValidObjectId(agencyId)) {
    return { agency: null, member: null };
  }

  const [agency, member] = await Promise.all([
    Agency.findById(agencyId),
    AgencyMember.findOne({ agencyId, userId: req.userId }),
  ]);
  return { agency, member };
}

function attach(
  req: AgencyAccessRequest,
  agency: any,
  member: any
): void {
  req.agency = agency;
  req.agencyMember = member;
  req.agencyRole = member.role as AgencyRole;
}

export function requireAgencyMember(): any {
  const guard = async (
    req: AgencyAccessRequest,
    _res: Response,
    next: NextFunction
  ) => {
    const { agency, member } = await loadAgencyAccess(req);
    const decision = decideAgencyAccess(agency, member, 'viewer');
    if (decision.status === 404) throw new AppError('Agency not found', 404);
    if (decision.status === 403) throw new AppError(FORBIDDEN_MESSAGE, 403);
    attach(req, agency, member);
    return next();
  };

  const guarded = catchAsync(guard as any) as any;
  guarded[AGENCY_MEMBER_GUARD_TAG] = { min: 'viewer' };
  return guarded;
}

export function requireAgencyRole(min: AgencyRole): any {
  const guard = async (
    req: AgencyAccessRequest,
    _res: Response,
    next: NextFunction
  ) => {
    const { agency, member } = await loadAgencyAccess(req);
    const decision = decideAgencyAccess(agency, member, min);
    if (decision.status === 404) throw new AppError('Agency not found', 404);
    if (decision.status === 403) throw new AppError(FORBIDDEN_MESSAGE, 403);
    attach(req, agency, member);
    return next();
  };

  const guarded = catchAsync(guard as any) as any;
  // The role guard also proves membership; both tags let the coverage test
  // accept either guard on a route.
  guarded[AGENCY_ROLE_GUARD_TAG] = { min };
  guarded[AGENCY_MEMBER_GUARD_TAG] = { min };
  return guarded;
}

/**
 * Strict accessor for controllers. Throws loudly if a handler runs without its
 * guard, so a wiring mistake cannot silently weaken authorization.
 */
export function agencyContext(req: AgencyAccessRequest): {
  agency: any;
  member: any;
  role: AgencyRole;
} {
  if (!req.agency || !req.agencyMember || !req.agencyRole) {
    throw new AppError('Route is missing its agency access guard. This is a server bug.', 500);
  }
  return {
    agency: req.agency,
    member: req.agencyMember,
    role: req.agencyRole,
  };
}
