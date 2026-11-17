import { apiRequest } from './client';

/**
 * Proposals an agency shared in answer to this account's enquiries, mirrored
 * from `backend/src/services/agency/proposals.ts`. Every read proves ownership
 * through the enquiry/client chain, so a link id alone opens nothing.
 */

export type ProposalKind = 'pdf' | 'live';

export interface ProposalQuoteSummary {
  number: string;
  version: number;
  status: string;
  currency: string;
  total: number;
  perPerson: number;
  validUntil: string | null;
  inclusions: string[];
  exclusions: string[];
  createdAt: string | null;
}

/** One card of `GET /api/proposals`. */
export interface ProposalSummary {
  id: string;
  kind: ProposalKind;
  enquiryId: string | null;
  agency: { name: string; slug: string };
  trip: { id: string; title: string };
  quote: ProposalQuoteSummary | null;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  settledByAcceptedTrip: boolean;
}

export interface ProposalLineItem {
  label: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ProposalQuote {
  _id?: string;
  number: string;
  version: number;
  status: string;
  currency: string;
  lineItems: ProposalLineItem[];
  subtotal: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  validUntil: string;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  createdAt?: string;
}

export interface ProposalExportActivity {
  title: string;
  time: string | null;
  description: string | null;
  location: string | null;
}

export interface ProposalExportStay {
  name: string;
  location: string | null;
  description: string | null;
  pricePerNight: string | null;
}

export interface ProposalExportDay {
  day: number;
  date: string | null;
  title: string;
  summary: string | null;
  activities: ProposalExportActivity[];
  stay: ProposalExportStay[];
  food: string[];
  transport: string[];
  tips: string[];
  permitRequired: boolean;
  imageUrl: string | null;
}

/** The send-time itinerary snapshot behind a `live` proposal. */
export interface ProposalItinerary {
  agency: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  trip: {
    id: string;
    title: string;
    destination: string;
    startDate: string | null;
    endDate: string | null;
    durationDays: number;
    nights: number;
    groupType: string | null;
    season: string | null;
    days: ProposalExportDay[];
  };
  client: {
    name: string;
    adults: number | null;
    children: number | null;
    rooms: number | null;
  } | null;
  quote: {
    number: string;
    version: number;
    status: string;
    validUntil: string | null;
    currency: string;
    total: number;
    perPerson: number;
    inclusions: string[];
    exclusions: string[];
    terms: string[];
  } | null;
  recommendations: string[];
  thingsToCarry: string[];
  cancellationPolicy: string[];
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };
}

/** `GET /api/proposals/:linkId` — the pinned document for its owner. */
export interface ProposalDetail {
  agency: { name: string };
  trip: { _id: string; title: string };
  quote: ProposalQuote | null;
  canAccept: boolean;
  accepted: boolean;
  acceptedAt: string | null;
  declined: boolean;
  declinedAt: string | null;
  documentMode: 'live' | 'html' | 'pdf';
  /** Present for live proposals; null for generated exports. */
  itinerary: ProposalItinerary | null;
  pageCount: number;
  templateName: string;
  pdf: { bytes: number } | null;
  expiresAt: string;
}

export interface ProposalAcceptResult {
  status: 'accepted';
  acceptedAt: string;
  quote: ProposalQuote;
}

export interface ProposalDeclineResult {
  status: 'declined';
  declinedAt: string;
}

/** `GET /api/proposals` — every live proposal answering this account. */
export function fetchMyProposals(): Promise<ProposalSummary[]> {
  return apiRequest<{ success: true; proposals: ProposalSummary[] }>(
    '/proposals'
  ).then((response) => response.proposals);
}

/** `GET /api/proposals/:linkId`. */
export function fetchProposal(linkId: string): Promise<ProposalDetail> {
  return apiRequest<{ success: true; proposal: ProposalDetail }>(
    `/proposals/${encodeURIComponent(linkId)}`
  ).then((response) => response.proposal);
}

/** `POST /api/proposals/:linkId/accept` — final, locks the quote. */
export function acceptProposal(linkId: string): Promise<ProposalAcceptResult> {
  return apiRequest<{ success: true; acceptance: ProposalAcceptResult }>(
    `/proposals/${encodeURIComponent(linkId)}/accept`,
    { method: 'POST' }
  ).then((response) => response.acceptance);
}

/** `POST /api/proposals/:linkId/decline` — the thread stays open. */
export function declineProposal(linkId: string): Promise<ProposalDeclineResult> {
  return apiRequest<{ success: true; decline: ProposalDeclineResult }>(
    `/proposals/${encodeURIComponent(linkId)}/decline`,
    { method: 'POST' }
  ).then((response) => response.decline);
}
