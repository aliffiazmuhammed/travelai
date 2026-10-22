import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';

/**
 * Agency roles and the access-control policy (Agency Workspace A1).
 *
 * This module is the single source of truth for agency-level authorization.
 * Every agency-scoped route goes through `requireAgencyMember` or
 * `requireAgencyRole`, and the member-management services call the pure rules
 * below so "the last owner" can never be removed or demoted by accident.
 *
 * Semantics:
 * - Roles are ranked: viewer(0) < planner(1) < admin(2) < owner(3).
 * - No access at all is a 404, exactly like a missing agency, so a personal
 *   user cannot probe agency ids.
 * - A known member with too little rank gets a 403.
 * - Clients are trip collaborators, never AgencyMembers.
 */

export type AgencyRole = 'owner' | 'admin' | 'planner' | 'viewer';

export const AGENCY_ROLES: readonly AgencyRole[] = ['owner', 'admin', 'planner', 'viewer'];

export const AGENCY_ROLE_RANK: Record<AgencyRole, number> = {
  viewer: 0,
  planner: 1,
  admin: 2,
  owner: 3,
};

/** Roles an invitation may grant. Ownership is granted by an owner, not a link. */
export const AGENCY_INVITABLE_ROLES = ['admin', 'planner', 'viewer'] as const;
export type AgencyInvitableRole = (typeof AGENCY_INVITABLE_ROLES)[number];

export const agencyRoleSchema = z.enum(['owner', 'admin', 'planner', 'viewer']);
export const agencyInvitableRoleSchema = z.enum(['admin', 'planner', 'viewer']);

export function isAgencyRole(value: unknown): value is AgencyRole {
  return typeof value === 'string' && AGENCY_ROLES.includes(value as AgencyRole);
}

export function agencyCan(role: AgencyRole | null | undefined, min: AgencyRole): boolean {
  return role !== null && role !== undefined && AGENCY_ROLE_RANK[role] >= AGENCY_ROLE_RANK[min];
}

export interface AgencyMemberShape {
  userId?: unknown;
  role?: unknown;
}

export interface AgencyAccessDecision {
  status: 200 | 403 | 404;
  role?: AgencyRole;
}

/**
 * Pure decision used by the middleware. `agency` is only checked for
 * presence; the membership row is the authority (there is no creator fallback).
 */
export function decideAgencyAccess(
  agency: unknown,
  member: AgencyMemberShape | null | undefined,
  min: AgencyRole
): AgencyAccessDecision {
  if (!agency || !member) return { status: 404 };
  const role = isAgencyRole(member.role) ? member.role : null;
  if (!role) return { status: 404 };
  if (!agencyCan(role, min)) return { status: 403, role };
  return { status: 200, role };
}

export function ownerCount(members: AgencyMemberShape[]): number {
  return members.filter((member) => member?.role === 'owner').length;
}

function findMember(members: AgencyMemberShape[], userId: string): AgencyMemberShape | undefined {
  return members.find((member) => String(member?.userId) === String(userId));
}

/**
 * Rules for `PATCH /:agencyId/members/:userId`.
 *
 * The route already guarantees the caller is at least an admin. These rules
 * cover the invariants beyond rank:
 * - only an owner can grant ownership;
 * - only an owner can change another owner's role;
 * - the agency can never lose its last owner.
 */
export function assertAgencyRoleChange(
  members: AgencyMemberShape[],
  targetUserId: string,
  nextRole: unknown,
  actorRole: AgencyRole
): void {
  if (!agencyCan(actorRole, 'admin')) {
    throw new AppError('You do not have permission to manage this agency team.', 403);
  }
  if (!isAgencyRole(nextRole)) {
    throw new AppError('Choose a valid agency role.', 400);
  }

  const target = findMember(members, targetUserId);
  if (!target) {
    throw new AppError('That person is not part of this agency.', 404);
  }
  if (!isAgencyRole(target.role)) {
    throw new AppError('That membership has an invalid role. Contact support.', 409);
  }

  if (nextRole === 'owner' && actorRole !== 'owner') {
    throw new AppError('Only an owner can give someone else ownership.', 403);
  }

  if (target.role === 'owner' && nextRole !== 'owner') {
    if (actorRole !== 'owner') {
      throw new AppError("Only an owner can change another owner's role.", 403);
    }
    if (ownerCount(members) <= 1) {
      throw new AppError(
        'An agency must always have at least one owner. Add another owner before changing this one.',
        409
      );
    }
  }
}

/**
 * Rules for `DELETE /:agencyId/members/:userId`.
 *
 * Admins manage the team but cannot remove an owner; owners can remove
 * themselves only when another owner remains.
 */
export function assertAgencyMemberRemoval(
  members: AgencyMemberShape[],
  targetUserId: string,
  actorRole: AgencyRole
): void {
  if (!agencyCan(actorRole, 'admin')) {
    throw new AppError('You do not have permission to manage this agency team.', 403);
  }

  const target = findMember(members, targetUserId);
  if (!target) {
    throw new AppError('That person is not part of this agency.', 404);
  }
  if (!isAgencyRole(target.role)) {
    throw new AppError('That membership has an invalid role. Contact support.', 409);
  }

  if (target.role === 'owner') {
    if (actorRole !== 'owner') {
      throw new AppError('Only an owner can remove another owner.', 403);
    }
    if (ownerCount(members) <= 1) {
      throw new AppError(
        'An agency must always have at least one owner. Add another owner before removing this one.',
        409
      );
    }
  }
}
