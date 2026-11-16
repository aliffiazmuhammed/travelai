import type { JoinRequest } from './joinRequests';
import { apiRequest } from './client';
import type { TripRole } from './trips';

/**
 * Owner-facing membership endpoints, mirrored from
 * `backend/src/services/collab/members.ts`, `gallery/joinRequests.ts` and
 * `collab/invites.ts`. Approval of a join request always grants `commenter`;
 * ownership changes only through a transfer, so `owner` is never assignable
 * here. Invite tokens come back exactly once, in `link`, and are never listed.
 */

export type InvitableRole = Exclude<TripRole, 'owner'>;
export type InviteKind = 'link' | 'email';

export interface TripMember {
  userId: string;
  role: TripRole;
  joinedAt: string;
  label: string;
  avatarUrl?: string;
  /** Owner's view only. */
  email?: string;
  isYou?: boolean;
}

export interface JoinRequester {
  id: string;
  label: string;
  handle?: string;
  avatarUrl?: string;
}

export interface QueuedJoinRequest extends JoinRequest {
  /** Present on owner-facing rows. */
  requester?: JoinRequester;
}

export interface TripInvite {
  _id: string;
  role: InvitableRole;
  kind: InviteKind;
  email: string | null;
  tokenHint: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateInviteInput {
  role: InvitableRole;
  kind?: InviteKind;
  email?: string;
  maxUses?: number;
  ttlHours?: number;
}

export interface CreatedInvite {
  invite: TripInvite;
  /** The shared-once link; the token inside it is not retrievable again. */
  link: string;
}

function tripPath(tripId: string, suffix: string): string {
  return `/itinerary/${encodeURIComponent(tripId)}${suffix}`;
}

function memberPath(tripId: string, userId?: string): string {
  return tripPath(tripId, `/members${userId ? `/${encodeURIComponent(userId)}` : ''}`);
}

/* Members ------------------------------------------------------------------ */

export async function fetchTripMembers(tripId: string): Promise<TripMember[]> {
  const response = await apiRequest<{ success: true; members: TripMember[] }>(memberPath(tripId));
  return response.members;
}

export async function changeMemberRole(
  tripId: string,
  userId: string,
  role: InvitableRole
): Promise<TripMember[]> {
  const response = await apiRequest<{ success: true; members: TripMember[] }>(
    memberPath(tripId, userId),
    { method: 'PATCH', body: { role } }
  );
  return response.members;
}

export async function removeMember(tripId: string, userId: string): Promise<TripMember[]> {
  const response = await apiRequest<{ success: true; members: TripMember[] }>(
    memberPath(tripId, userId),
    { method: 'DELETE' }
  );
  return response.members;
}

export async function leaveTrip(tripId: string): Promise<void> {
  await apiRequest<{ success: true; message: string }>(memberPath(tripId, 'me'), {
    method: 'DELETE',
  });
}

/* Join requests (owner queue) ---------------------------------------------- */

export async function fetchJoinQueue(tripId: string): Promise<QueuedJoinRequest[]> {
  const response = await apiRequest<{ success: true; requests: QueuedJoinRequest[] }>(
    tripPath(tripId, '/join-requests')
  );
  return response.requests;
}

function decideRequest(
  tripId: string,
  requestId: string,
  decision: 'approve' | 'decline' | 'block'
): Promise<QueuedJoinRequest> {
  return apiRequest<{ success: true; request: QueuedJoinRequest }>(
    tripPath(tripId, `/join-requests/${encodeURIComponent(requestId)}/${decision}`),
    { method: 'POST' }
  ).then((response) => response.request);
}

/** Welcomes the requester as a commenter. */
export function approveJoinRequest(tripId: string, requestId: string): Promise<QueuedJoinRequest> {
  return decideRequest(tripId, requestId, 'approve');
}

/** Silent to the requester — their row simply stops being pending. */
export function declineJoinRequest(tripId: string, requestId: string): Promise<QueuedJoinRequest> {
  return decideRequest(tripId, requestId, 'decline');
}

/** Also declines that person's pending requests across all your trips. */
export function blockJoinRequester(tripId: string, requestId: string): Promise<QueuedJoinRequest> {
  return decideRequest(tripId, requestId, 'block');
}

/* Invites ------------------------------------------------------------------ */

export async function fetchTripInvites(tripId: string): Promise<TripInvite[]> {
  const response = await apiRequest<{ success: true; invites: TripInvite[] }>(
    tripPath(tripId, '/invites')
  );
  return response.invites;
}

export function createTripInvite(
  tripId: string,
  input: CreateInviteInput
): Promise<CreatedInvite> {
  return apiRequest<{ success: true } & CreatedInvite>(tripPath(tripId, '/invites'), {
    method: 'POST',
    body: input,
  });
}

export async function revokeTripInvite(tripId: string, inviteId: string): Promise<TripInvite> {
  const response = await apiRequest<{ success: true; invite: TripInvite }>(
    tripPath(tripId, `/invites/${encodeURIComponent(inviteId)}`),
    { method: 'DELETE' }
  );
  return response.invite;
}
