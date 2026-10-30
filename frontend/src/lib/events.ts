import { formatMoney } from '@/lib/currency';
import type { PublicEventKind } from '@/types/events';

/**
 * Shared event copy (Milestone 10). The agency editor and the public pages read
 * the same labels so a camp never reads as "group_trip" on one surface.
 */
export const EVENT_KIND_LABELS: Record<PublicEventKind, string> = {
  camp: 'Camp',
  group_trip: 'Group trip',
  retreat: 'Retreat',
  other: 'Other',
};

/** `null` when the host set no capacity — there is no spot count to show. */
export function spotsLabel(spotsLeft: number | null): string | null {
  if (spotsLeft === null) return null;
  if (spotsLeft <= 0) return 'Every spot is taken';
  return `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`;
}

export function eventPriceLabel(event: {
  pricePerPerson: number | null;
  currency: string;
}): string {
  if (event.pricePerPerson === null) return 'Price on request';
  return `${formatMoney(event.pricePerPerson, event.currency)} per person`;
}
