import type { EnquiryBudgetBand, EnquiryDates, EnquiryStatus } from '@/api/enquiries';
import { formatTripDates } from '@/lib/personalTrip';

export const BUDGET_BANDS: readonly { value: EnquiryBudgetBand; label: string }[] = [
  { value: 'under_25k', label: 'Under ₹25,000 per person' },
  { value: '25k_50k', label: '₹25,000–50,000 per person' },
  { value: '50k_1l', label: '₹50,000–1,00,000 per person' },
  { value: 'above_1l', label: 'Above ₹1,00,000 per person' },
  { value: 'not_sure', label: 'Not sure yet' },
];

export function budgetLabel(band: EnquiryBudgetBand | null | undefined): string | null {
  if (!band) return null;
  return BUDGET_BANDS.find((option) => option.value === band)?.label ?? null;
}

export function datesLabel(dates: EnquiryDates | null | undefined): string {
  if (!dates) return 'Dates to be set';
  if (dates.flexible) return 'Flexible dates';
  if (!dates.start) return 'Dates to be set';
  return formatTripDates(dates.start, dates.end ?? undefined);
}

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'Sent',
  replied: 'Replied',
  quoted: 'Proposal ready',
  won: 'Booked',
  lost: 'Closed',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact feed timestamp: "Today, 14:05", "Yesterday, 09:10", "12 Nov". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (wasYesterday) return `Yesterday, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

/** "12 Nov 2026" for a calendar date or ISO instant. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function partyLine(party: { adults: number; children: number }): string {
  const adults = `${party.adults} ${party.adults === 1 ? 'adult' : 'adults'}`;
  if (!party.children) return adults;
  return `${adults} · ${party.children} ${
    party.children === 1 ? 'child' : 'children'
  }`;
}
