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
 *   `members[]` only; `userId` survives as the creator/audit field.
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
 * `commenter` is the conversation participant floor: posting comments and
 * creating/voting in polls sit at that rank; editors inherit it.
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
 * The caller's role on a trip, or `null` when they have none at all.
 *
 * **Authorization reads `members[]` exclusively.** The pre-backfill creator
 * fallback that once lived here is gone (E4 smoke proved the flaw: a creator
 * who *left* the trip would have retained owner access): the `migrate:members`
 * backfill has run against every environment trip database the app serves,
 * so `members[]` is authoritative and `userId` is the audit field only.
 */
export function roleOf(trip: TripAccessShape | null | undefined, userId?: string): TripRole | null {
  if (!userId) return null;

  const member = (trip?.members || []).find(
    (entry) => entry && String(entry.userId) === String(userId)
  );

  if (!member) return null;
  const role = String(member.role || '') as TripRole;
  return ROLE_RANK[role] !== undefined ? role : null;
}

/**
 * Shape of a document at the moment it is being created. `isNew` is Mongoose's
 * flag; the helper stays framework-free so it can be unit-tested.
 */
export interface TripMembershipShape {
  isNew?: boolean;
  userId?: unknown;
  members?: Array<{ userId?: unknown; role?: string; joinedAt?: Date }>;
}

/**
 * P0 invariant (2026-10-20): **a freshly created trip always contains its
 * creator as owner.**
 *
 * Why this lives next to `roleOf`: since the Milestone 6 E4 backfill,
 * authorization reads `members[]` exclusively, and `roleOf` intentionally has
 * no creator fallback. A trip created without a member row is therefore
 * listed (the dashboard query also matches `userId`) but answers 404 on every
 * trip route. The generator and duplicate paths both created such documents,
 * so the next generated trip was unopenable.
 *
 * Only **new** documents are seeded. A transferred or left owner must never be
 * re-added when an existing document is saved. If a new document already names
 * the creator with a weaker role, that row is promoted rather than duplicated.
 *
 * @returns true when a row was added or promoted.
 */
export function ensureCreatorMembership(trip: TripMembershipShape): boolean {
  if (!trip || !trip.isNew || !trip.userId) return false;

  const creatorId = String(trip.userId);
  const members = (trip.members ?? []) as NonNullable<TripMembershipShape['members']>;
  trip.members = members;

  const existing = members.find((entry) => entry && String(entry.userId) === creatorId);
  if (existing) {
    if (existing.role === 'owner') return false;
    existing.role = 'owner';
    return true;
  }

  members.unshift({ userId: trip.userId, role: 'owner', joinedAt: new Date() });
  return true;
}

/** Zod schema for a role coming in from the wire. */
export const tripRoleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);

/** Roles an invitation may grant — nobody joins directly as owner. */
export const invitableRoles = ['editor', 'commenter', 'viewer'] as const;

/** Zod schema for the role of a created invitation. */
export const invitableRoleSchema = z.enum(['editor', 'commenter', 'viewer']);
