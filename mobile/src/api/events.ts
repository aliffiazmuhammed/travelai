import { apiRequest } from './client';

export type PublicEventKind = 'camp' | 'group_trip' | 'retreat' | 'other';

export interface PublicEventSummary {
  _id: string;
  title: string;
  summary: string;
  kind: PublicEventKind;
  destination: string;
  venue: string;
  dates: { startDate: string; endDate: string; label: string };
  capacity: number | null;
  spotsLeft: number | null;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  acceptingInterest: boolean;
  agency: { slug: string; name: string; logoUrl: string | null; verified: boolean };
}

export interface PublicEventDetail extends PublicEventSummary {
  highlights: string[];
  closed: boolean;
  ended: boolean;
  publishedAt: string | null;
}

interface EventsPage {
  success: true;
  events: PublicEventSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

/** Anonymous read: upcoming events only, soonest first. */
export function fetchPublicEvents(limit = 6): Promise<EventsPage> {
  return apiRequest<EventsPage>(`/events?limit=${limit}`, { auth: false });
}

export function fetchPublicEvent(id: string): Promise<PublicEventDetail> {
  return apiRequest<{ success: true; event: PublicEventDetail }>(
    `/events/${encodeURIComponent(id)}`,
    { auth: false }
  ).then((response) => response.event);
}

export interface EventInterestInput {
  name: string;
  email: string;
  phone: string;
  note?: string;
}

/** The agency keeps the contact card; nothing is charged on waytowalk. */
export function submitEventInterest(id: string, input: EventInterestInput): Promise<void> {
  return apiRequest<{
    success: true;
    interest: { id: string; status: string; createdAt: string } | null;
  }>(`/events/${encodeURIComponent(id)}/interest`, {
    method: 'POST',
    body: input,
    auth: false,
    handleUnauthorized: false,
  }).then(() => undefined);
}
