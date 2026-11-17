import { apiRequest } from './client';
import type { EnquiryThread } from './enquiries';
import type { ProposalSummary } from './proposals';
import { API_URL } from '@/config';

/**
 * The guest's private enquiry link (`GET /api/conversations/:token`). No
 * session: the token is the capability, and every read is scoped to one thread.
 */

function path(token: string, suffix = ''): string {
  return `/conversations/${encodeURIComponent(token)}${suffix}`;
}

const guestOptions = { auth: false, handleUnauthorized: false } as const;

export function fetchGuestConversation(token: string): Promise<EnquiryThread> {
  return apiRequest<{ success: true; conversation: EnquiryThread }>(path(token), guestOptions).then(
    (response) => response.conversation
  );
}

export function sendGuestMessage(token: string, body: string): Promise<EnquiryThread> {
  return apiRequest<{ success: true; conversation: EnquiryThread }>(
    path(token, '/messages'),
    { ...guestOptions, method: 'POST', body: { body } }
  ).then((response) => response.conversation);
}

export function fetchGuestProposals(token: string): Promise<ProposalSummary[]> {
  return apiRequest<{ success: true; proposals: ProposalSummary[] }>(
    path(token, '/proposals'),
    guestOptions
  ).then((response) => response.proposals);
}

/** Absolute PDF URL for a guest proposal; open it with the OS browser. */
export function guestProposalPdfUrl(token: string, linkId: string): string {
  return `${API_URL}${path(token, `/proposals/${encodeURIComponent(linkId)}/pdf`)}`;
}
