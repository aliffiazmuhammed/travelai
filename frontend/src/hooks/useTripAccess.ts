import { useMemo } from 'react';
import type { Trip, TripRole } from '@/types/trip';

/**
 * Role → UI gating (`docs/roadmap-milestone-6-collaboration.md` §3.8).
 *
 * **Cosmetic only.** Hiding a button is presentation, not authorization — the
 * server enforces every rank on every request. This hook exists so the UI can
 * render a truthful experience: viewers get a genuinely read-only trip, and
 * owner-only controls disappear instead of failing with a 403.
 */

const RANK: Record<TripRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

export interface TripAccess {
  /** The caller's role, or `null` when the payload carries no annotation. */
  role: TripRole | null;
  isOwner: boolean;
  /** Content edits: itineraries, expenses, participants, restores. */
  canEdit: boolean;
  /** Trip metadata, sharing, feedback, invitations, member management. */
  canManage: boolean;
  /** Role rank helper for conditional rendering outside this hook. */
  atLeast: (min: TripRole) => boolean;
}

/**
 * `trip.role` comes annotated from every trip payload listed in Milestone 6
 * (§3.4). A missing role (legacy flows such as the freshly generated preview)
 * falls back to owner — single-user behaviour is unchanged.
 */
export function useTripAccess(trip?: Pick<Trip, 'role' | 'userId'> | null, viewerId?: string): TripAccess {
  return useMemo(() => {
    // The dashboard list and the single-trip fetch annotate `role`. A payload
    // without one is either a legacy single-user trip (still owner) or a
    // freshly generated TEMP preview (no persisted trip at all — owner by
    // construction). An annotated payload wins in every case.
    const annotated = trip?.role;
    const role: TripRole | null =
      annotated ??
      (trip && trip.userId !== undefined
        ? viewerId && String(trip.userId) === String(viewerId)
          ? 'owner'
          : null
        : 'owner');

    const atLeast = (min: TripRole) => role !== null && RANK[role] >= RANK[min];

    return {
      role,
      isOwner: role === 'owner',
      canEdit: atLeast('editor'),
      canManage: role === 'owner',
      atLeast,
    };
  }, [trip?.role, (trip as any)?.userId, viewerId]);
}

/** Human label for a role badge. */
export function roleLabel(role: TripRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
