import { apiRequest } from './client';
import type { TripRole } from './trips';

/** Mirrors `backend/src/services/collab/invites.ts`; tokens are never listed. */

export type InviteSeat = Exclude<TripRole, 'owner'>;
export type InviteKind = 'link' | 'email';

export interface InvitePreview {
  trip: { title: string; destination?: string };
  role: InviteSeat;
  kind: InviteKind;
  invitedBy?: string;
  expiresAt: string;
  emailBoundTo?: string;
}

export interface AcceptedInvite {
  role: TripRole;
  alreadyMember: boolean;
  tripId: string;
  trip: { title: string; rev: number };
  message: string;
}

export function fetchInvitePreview(token: string): Promise<InvitePreview> {
  return apiRequest<InvitePreview & { success: true }>(
    `/invites/${encodeURIComponent(token)}`
  );
}

export function acceptInvite(token: string): Promise<AcceptedInvite> {
  return apiRequest<AcceptedInvite & { success: true }>(
    `/invites/${encodeURIComponent(token)}/accept`,
    { method: 'POST' }
  );
}
