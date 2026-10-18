import { z } from 'zod';

/**
 * Trip roles and the access-control policy (Milestone 6 — Collaboration).
 *
 * Every trip-scoped authorization decision in the backend MUST go through this
 * module. Controllers never filter `Trip` on `userId` themselves — the router
 * applies `requireTripRole`, which loads the document and exposes it as
 * `req.trip`.
 *
 * Key semantics:
 * - **Roles are ranked**: `viewer(0) < commenter(1) < editor(2) < owner(3)`.
 *   A route declares the minimum rank it accepts, so "editor can also view"
 *   falls out of the arithmetic instead of a role list.
 * - **No access is reported as 404, never 403**, so a stranger cannot discover
 *   whether a trip id exists. A 403 is reserved for a known member whose rank
 *   is too low for the specific action.
 * - **`userId` is the creator, not the access list.** Authorization reads
 *   `members[]`; `userId` only survives as the creator/audit field and for the
 *   pre-backfill fallback below.
 */

export type TripRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export const TRIP_ROLES: readonly TripRole[] = ['owner', 'editor', 'commenter', 'viewer'];

export const ROLE_RANK: Record<TripRole, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
};

/** Capability keys naming what a caller may attempt, independent of roles. */
export type TripCapability =
  /** View the itinerary, map, weather and routing panels. */
  | 'view'
  /** View the expense ledger, settlement and currency settings. */
  | 'viewFinances'
  /** Create, edit, delete and reorder activities, days and custom routes. */
  | 'editItinerary'
  /** Add, edit, delete expenses and change travellers/currency. */
  | 'editExpenses'
  /** Restore a historical version snapshot. */
  | 'restoreVersion'
  /** Regenerate/AI analyses that cost provider quota. */
  | 'useAiTools'
  /** Rename the trip or change its status. */
  | 'manageTripSettings'
  /** Delete the trip. */
  | 'deleteTrip'
  /** Create/revoke the public share link. */
  | 'manageSharing'
  /** Invite, remove, demote members and transfer ownership. */
  | 'manageMembers'
  /** Sees AI generation metadata/quality information. */
  | 'viewGenerationMeta';

/**
 * The single source of truth behind the permission matrix in
 * `docs/roadmap-milestone-6-collaboration.md` §1.3 — the tests iterate it.
 * `commenter` is reserved for a future comments feature (no route uses it yet).
 */
export const TRIP_CAPABILITIES: Record<TripCapability, TripRole> = {
  view: 'viewer',
  viewFinances: 'viewer',
  editItinerary: 'editor',
  editExpenses: 'editor',
  restoreVersion: 'editor',
  useAiTools: 'editor',
  manageTripSettings: 'owner',
  deleteTrip: 'owner',
  manageSharing: 'owner',
  manageMembers: 'owner',
  viewGenerationMeta: 'owner',
};

/** Everything below a role inherits everything above it — verified by tests. */
export const ROLE_INHERITED: Record<TripRole, TripRole[]> = {
  viewer: [],
  commenter: ['viewer'],
  editor: ['viewer', 'commenter'],
  owner: ['viewer', 'commenter', 'editor'],
};

/** Rank compares roles; `can` answers "may this role attempt this action?". */
export function can(role: TripRole | null, min: TripRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Capability sugar over `can()` — keeps call sites tied to the matrix. */
export function roleCan(role: TripRole | null, capability: TripCapability): boolean {
  return role !== null && can(role, TRIP_CAPABILITIES[capability]);
}

/** Shape of `Trip.userId` / `Trip.members[]` needed for a role decision. */
export interface TripAccessShape {
  userId?: unknown;
  members?: Array<{ userId?: unknown; role?: unknown }>;
}

/**
 * The caller's role on a trip, or `null` when they have none at all. Falls back
 * to the creator as owner while legacy documents have not been backfilled yet
 * (`docs/roadmap-milestone-6-collaboration.md` §7); the fallback is removed once
 * the backfill is confirmed everywhere.
 */
export function roleOf(trip: TripAccessShape | null | undefined, userId?: string): TripRole | null {
  if (!userId) return null;

  const member = (trip?.members || []).find(
    (entry) => entry && String(entry.userId) === String(userId)
  );

  if (member) {
    const role = String(member.role || '') as TripRole;
    return ROLE_RANK[role] !== undefined ? role : null;
  }

  if (trip && trip.userId !== undefined && String(trip.userId) === String(userId)) {
    return 'owner';
  }

  return null;
}

/** Zod schema for a role coming in from the wire. */
export const tripRoleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);

/** Roles an invitation may grant — nobody joins directly as owner. */
export const invitableRoles = ['editor', 'commenter', 'viewer'] as const;

/** Zod schema for the role of a created invitation. */
export const invitableRoleSchema = z.enum(['editor', 'commenter', 'viewer']);
