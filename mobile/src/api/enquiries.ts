import { apiRequest } from './client';

/**
 * The traveller's side of agency enquiries, mirrored from
 * `backend/src/services/directory/{enquiries,conversations}.ts`. Every read is
 * personal-realm: the server refuses agency and platform sessions.
 */

export type EnquiryStatus = 'new' | 'replied' | 'quoted' | 'won' | 'lost';
export type EnquiryBudgetBand =
  | 'under_25k'
  | '25k_50k'
  | '50k_1l'
  | 'above_1l'
  | 'not_sure';
export type EnquiryAuthor = 'traveller' | 'agency';

export interface EnquiryDates {
  start: string | null;
  end: string | null;
  flexible: boolean;
}

export interface EnquiryParty {
  adults: number;
  children: number;
}

export interface EnquiryPackageRef {
  id: string;
  title: string;
}

export interface EnquiryAgencyRef {
  name: string;
  slug: string;
}

export interface EnquiryProposalCount {
  count: number;
  lastAt: string | null;
  lastDeclinedAt: string | null;
}

/** One row of `GET /api/enquiries` — the consumer projection has no contact. */
export interface EnquirySummary {
  id: string;
  status: EnquiryStatus;
  source: 'profile' | 'package';
  party: EnquiryParty;
  dates: EnquiryDates;
  budgetBand: EnquiryBudgetBand | null;
  message: string;
  package: EnquiryPackageRef | null;
  agency: EnquiryAgencyRef | null;
  replyCount: number;
  unread: { agency: number; traveller: number };
  lastMessageAt: string | null;
  lastMessageBy: EnquiryAuthor | null;
  proposals: EnquiryProposalCount;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EnquiryPage {
  enquiries: EnquirySummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface EnquiryMessage {
  id: string;
  author: EnquiryAuthor;
  authorName: string;
  body: string;
  createdAt: string | null;
  readByAgencyAt: string | null;
  readByTravellerAt: string | null;
}

/** `GET /api/enquiries/:id` — the full thread, marked read by the server. */
export interface EnquiryThread {
  id: string;
  status: EnquiryStatus;
  agency: EnquiryAgencyRef;
  traveller: { name: string };
  enquiry: {
    source: 'profile' | 'package';
    message: string;
    party: EnquiryParty;
    dates: EnquiryDates;
    budgetBand: EnquiryBudgetBand | null;
    packageTitle: string | null;
    createdAt: string | null;
  };
  messages: EnquiryMessage[];
  unread: { agency: number; traveller: number };
  lastMessageAt: string | null;
  lastMessageBy: EnquiryAuthor | null;
  repliedAt: string | null;
  expiresAt: string | null;
  canReply: boolean;
}

export interface EnquirySummaryCounts {
  unread: number;
  liveProposals: number;
  lastMessageAt: string | null;
}

export interface EnquiryInput {
  name: string;
  email: string;
  phone?: string;
  adults: number;
  children?: number;
  startDate?: string;
  endDate?: string;
  flexible?: boolean;
  budgetBand?: EnquiryBudgetBand;
  message: string;
  packageId?: string;
  consent: true;
}

export interface EnquiryAcknowledgement {
  id: string;
  status: EnquiryStatus;
  createdAt: string | null;
}

/** `POST /api/agencies/:slug/enquiries` — attributed to the signed-in account. */
export function submitEnquiry(
  slug: string,
  input: EnquiryInput
): Promise<EnquiryAcknowledgement> {
  return apiRequest<{ success: true; enquiry: EnquiryAcknowledgement }>(
    `/agencies/${encodeURIComponent(slug)}/enquiries`,
    { method: 'POST', body: input }
  ).then((response) => response.enquiry);
}

/** `GET /api/enquiries` — newest first, cursor paged. */
export function fetchMyEnquiries(cursor?: string | null, limit = 20): Promise<EnquiryPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return apiRequest<{ success: true } & EnquiryPage>(`/enquiries?${query.toString()}`);
}

/** `GET /api/enquiries/summary` — unread and live-proposal badges. */
export function fetchEnquirySummary(): Promise<EnquirySummaryCounts> {
  return apiRequest<{ success: true; summary: EnquirySummaryCounts }>(
    '/enquiries/summary'
  ).then((response) => response.summary);
}

/** `GET /api/enquiries/:id` — the thread; opening it clears the unread count. */
export function fetchEnquiryThread(id: string): Promise<EnquiryThread> {
  return apiRequest<{ success: true; conversation: EnquiryThread }>(
    `/enquiries/${encodeURIComponent(id)}`
  ).then((response) => response.conversation);
}

/** `POST /api/enquiries/:id/messages` — the traveller's reply. */
export function sendEnquiryMessage(id: string, body: string): Promise<EnquiryThread> {
  return apiRequest<{ success: true; conversation: EnquiryThread }>(
    `/enquiries/${encodeURIComponent(id)}/messages`,
    { method: 'POST', body: { body } }
  ).then((response) => response.conversation);
}

/** `POST /api/enquiries/:id/read` — explicit receipt for the list badge. */
export function markEnquiryRead(id: string): Promise<{ agency: number; traveller: number }> {
  return apiRequest<{
    success: true;
    unread: { agency: number; traveller: number };
  }>(`/enquiries/${encodeURIComponent(id)}/read`, { method: 'POST' }).then(
    (response) => response.unread
  );
}
