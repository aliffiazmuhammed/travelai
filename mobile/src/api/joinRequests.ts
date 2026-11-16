import { apiRequest } from './client';

/**
 * Requester side of gallery join requests, mirrored from
 * `backend/src/services/gallery/joinRequests.ts`. Approval only ever grants a
 * commenter seat; `isOwner` / `isMember` tell the trip page how to word it.
 */

export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface JoinRequest {
  _id: string;
  status: JoinRequestStatus;
  message?: string;
  createdAt: string;
  decidedAt?: string | null;
}

export interface JoinRequestState {
  request: JoinRequest | null;
  isMember: boolean;
  isOwner: boolean;
  /** False once the start date has passed; the plan stays readable and copyable. */
  joinable: boolean;
}

export const JOIN_MESSAGE_MAX = 280;

function requestPath(tripId: string): string {
  return `/itinerary/${encodeURIComponent(tripId)}/join-request`;
}

export function fetchJoinRequestState(tripId: string): Promise<JoinRequestState> {
  return apiRequest<JoinRequestState & { success: true }>(requestPath(tripId));
}

export async function requestToJoin(tripId: string, message?: string): Promise<JoinRequest> {
  const response = await apiRequest<{ success: true; request: JoinRequest }>(requestPath(tripId), {
    method: 'POST',
    body: message ? { message } : {},
  });
  return response.request;
}

export async function withdrawJoinRequest(tripId: string): Promise<JoinRequest> {
  const response = await apiRequest<{ success: true; request: JoinRequest }>(requestPath(tripId), {
    method: 'DELETE',
  });
  return response.request;
}
