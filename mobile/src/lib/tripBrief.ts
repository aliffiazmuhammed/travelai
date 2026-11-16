import type { GenerateTripInput, TravelPace } from '@/api/generation';

export type GroupType = 'Solo' | 'Couple' | 'Family' | 'Friends';

export const MAX_TRIP_DAYS = 30;

export const GROUP_OPTIONS: readonly {
  value: GroupType;
  label: string;
  caption: string;
  icon: 'person-outline' | 'heart-outline' | 'people-outline' | 'beer-outline';
}[] = [
  { value: 'Solo', label: 'Solo', caption: 'Your own pace', icon: 'person-outline' },
  { value: 'Couple', label: 'Couple', caption: 'Two of you', icon: 'heart-outline' },
  { value: 'Family', label: 'Family', caption: 'All ages', icon: 'people-outline' },
  { value: 'Friends', label: 'Friends', caption: 'A group', icon: 'beer-outline' },
];

export const INTEREST_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'Adventure', label: 'Adventure' },
  { value: 'Culture', label: 'Culture & forts' },
  { value: 'Relaxation', label: 'Slow & restful' },
  { value: 'Food', label: 'Food trails' },
  { value: 'Nature', label: 'Nature' },
  { value: 'Photography', label: 'Views & photos' },
  { value: 'Nightlife', label: 'Nights out' },
  { value: 'Shopping', label: 'Markets' },
];

export const PACE_OPTIONS: readonly {
  value: TravelPace;
  label: string;
  caption: string;
}[] = [
  { value: 'relaxed', label: 'Relaxed', caption: 'Two or three things a day' },
  { value: 'balanced', label: 'Balanced', caption: 'Room to wander' },
  { value: 'packed', label: 'Full days', caption: 'See as much as you can' },
];

export const DESTINATION_IDEAS: readonly { label: string; value: string }[] = [
  { label: 'Goa', value: 'Goa, India' },
  { label: 'Jaipur', value: 'Jaipur, India' },
  { label: 'Manali', value: 'Manali, Himachal Pradesh' },
  { label: 'Kerala', value: 'Kerala, India' },
  { label: 'Leh Ladakh', value: 'Leh Ladakh, India' },
  { label: 'Varanasi', value: 'Varanasi, India' },
];

export const BUDGET_PRESETS = [15000, 25000, 50000, 100000] as const;

export interface TripBrief {
  destination: string;
  startDate: string;
  days: number;
  group: GroupType;
  budget: string;
  interests: string[];
  pace: TravelPace;
}

/** Local calendar day, so a date picked in India stays the same date anywhere. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** The end date is the last day of the trip, so a 3-day trip starts and ends 2 days apart. */
export function endDateFor(startIso: string, days: number): string {
  return addDaysIso(startIso, Math.max(days, 1) - 1);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatIsoDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateRange(startIso: string, days: number): string {
  const endIso = endDateFor(startIso, days);
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const sameYear = start.getFullYear() === end.getFullYear();

  if (start.getMonth() === end.getMonth() && sameYear) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${
      MONTHS[end.getMonth()]
    } ${start.getFullYear()}`;
  }
  return `${formatIsoDate(startIso)} – ${formatIsoDate(endIso)}`;
}

export interface BriefErrors {
  destination?: string;
  budget?: string;
  startDate?: string;
  interests?: string;
}

export function validateBrief(brief: TripBrief): BriefErrors {
  const errors: BriefErrors = {};
  if (!brief.destination.trim()) {
    errors.destination = 'Tell us where you are headed.';
  }
  const budget = Number(brief.budget);
  if (!Number.isFinite(budget) || budget < 1) {
    errors.budget = 'Give us a rough per-person budget.';
  }
  if (!brief.startDate) {
    errors.startDate = 'Pick a start date.';
  }
  if (brief.interests.length === 0) {
    errors.interests = 'Pick at least one thing you enjoy.';
  }
  return errors;
}

export function hasErrors(errors: BriefErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildGenerationInput(brief: TripBrief): GenerateTripInput {
  return {
    destination: brief.destination.trim(),
    days: Math.min(Math.max(brief.days, 1), MAX_TRIP_DAYS),
    budget: Number(brief.budget),
    startdate: brief.startDate,
    enddate: endDateFor(brief.startDate, brief.days),
    interests: brief.interests,
    groupType: brief.group,
    preferences: { pace: brief.pace },
  };
}
