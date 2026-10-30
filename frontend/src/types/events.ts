/**
 * Public event payloads (Milestone 10 E1). These mirror the server projection in
 * `backend/src/services/events/projection.ts` — only what a signed-out visitor
 * may see. Agency ids, moderation state, the roster and interest contacts are
 * never part of these shapes.
 */

import type { AgencyEventKind } from './agency';

export type PublicEventKind = AgencyEventKind;

export interface PublicEventAgency {
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
}

export interface PublicEventDates {
  startDate: string;
  endDate: string;
  label: string;
}

export interface PublicEventSummary {
  /** The public key; event pages are addressed by `_id`. */
  _id: string;
  title: string;
  summary: string;
  kind: PublicEventKind;
  destination: string;
  venue: string;
  dates: PublicEventDates;
  capacity: number | null;
  /** `null` when the host set no capacity. */
  spotsLeft: number | null;
  pricePerPerson: number | null;
  currency: string;
  /** Relative, anonymous image path; render it directly. */
  coverUrl: string | null;
  /** Computed server-side so a closed, ended or full event never offers a form. */
  acceptingInterest: boolean;
  agency: PublicEventAgency;
}

export interface PublicEventDetail extends PublicEventSummary {
  highlights: string[];
  closed: boolean;
  ended: boolean;
  publishedAt: string | null;
}

export interface PublicEventsPage {
  events: PublicEventSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface PublicEventFilters {
  /** One agency's page, by directory slug. */
  agency?: string;
  cursor?: string;
  limit?: number;
}

/** The anonymous "I'm interested" form. `website` is a honeypot. */
export interface EventInterestInput {
  name: string;
  email: string;
  phone: string;
  note?: string;
  website?: string;
}

/** What the server echoes back: ids and timestamps, never contact details. */
export interface EventInterestAcknowledgement {
  id: string;
  status: 'pending';
  createdAt: string | null;
}
