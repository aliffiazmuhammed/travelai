import type { ProposalItinerary, ProposalSummary } from '@/api/proposals';

export type ProposalFilter = 'all' | 'live' | 'accepted' | 'declined';
export type ProposalState = Exclude<ProposalFilter, 'all'>;

export const PROPOSAL_FILTERS: readonly { key: ProposalFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Waiting' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
];

export function proposalState(proposal: ProposalSummary): ProposalState {
  if (proposal.acceptedAt || proposal.settledByAcceptedTrip) return 'accepted';
  if (proposal.declinedAt) return 'declined';
  return 'live';
}

export function totalTravellers(itinerary: ProposalItinerary | null): number {
  if (!itinerary?.client) return 0;
  return (itinerary.client.adults ?? 0) + (itinerary.client.children ?? 0);
}

export function stayCount(itinerary: ProposalItinerary | null): number {
  if (!itinerary) return 0;
  const names = new Set<string>();
  for (const day of itinerary.trip.days) {
    for (const stay of day.stay) {
      if (stay.name) names.add(stay.name.toLowerCase());
    }
  }
  return names.size;
}

function hasGuide(inclusions: string[]): boolean {
  return inclusions.some((line) => /guide/i.test(line));
}

/** The facts line under a proposal card: days, stays and whether a guide is in. */
export function summaryFacts(proposal: ProposalSummary, itinerary: ProposalItinerary | null): string {
  const parts: string[] = [];
  const days = itinerary?.trip.durationDays ?? 0;
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  const stays = stayCount(itinerary);
  if (stays > 0) parts.push(`${stays} ${stays === 1 ? 'stay' : 'stays'}`);
  if (proposal.quote && hasGuide(proposal.quote.inclusions)) parts.push('guide included');
  if (parts.length === 0 && proposal.quote) {
    parts.push(`Proposal ${proposal.quote.number}`);
  }
  return parts.join(' · ');
}

export function quoteFacts(
  itinerary: ProposalItinerary | null,
  quote: { inclusions: string[] } | null
): string[] {
  const parts: string[] = [];
  const days = itinerary?.trip.durationDays ?? 0;
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  const stays = stayCount(itinerary);
  if (stays > 0) parts.push(`${stays} ${stays === 1 ? 'stay' : 'stays'}`);
  if (quote && hasGuide(quote.inclusions)) parts.push('guide included');
  return parts;
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalState, string> = {
  live: 'Awaiting you',
  accepted: 'Accepted',
  declined: 'Declined',
};
