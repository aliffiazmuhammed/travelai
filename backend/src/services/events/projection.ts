import {
  AGENCY_EVENT_KINDS,
  type AgencyEventKind,
} from '../../models/AgencyEvent.js';
import { publicDirectoryLogoUrl } from '../directory/projection.js';

/**
 * Public event projections (Milestone 10 E1).
 *
 * An exact allow-list, pinned by a key-set test. An event payload carries what
 * a stranger needs to decide whether to ask about the camp: what it is, when
 * and where it runs, what it costs, how many spots are left and which agency
 * hosts it. It never carries `agencyId`, `state`, moderation, the roster,
 * interest contact details or any pricing internals — those are structurally
 * absent because they are never read.
 *
 * `acceptingInterest` is computed here rather than in the client so a closed,
 * ended or full event cannot be offered an interest form by a stale card.
 */

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
];

const PUBLIC_EVENT_KINDS = AGENCY_EVENT_KINDS;
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
  _id: string;
  title: string;
  summary: string;
  kind: PublicEventKind;
  destination: string;
  venue: string;
  dates: PublicEventDates;
  capacity: number | null;
  spotsLeft: number | null;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  acceptingInterest: boolean;
  agency: PublicEventAgency;
}

export interface PublicEventDetail extends PublicEventSummary {
  highlights: string[];
  closed: boolean;
  ended: boolean;
  publishedAt: string | null;
}

/** Sorted for the key-set test; keep in sync with the interface above. */
export const PUBLIC_EVENT_CARD_KEYS = [
  '_id',
  'acceptingInterest',
  'agency',
  'capacity',
  'coverUrl',
  'currency',
  'dates',
  'destination',
  'kind',
  'pricePerPerson',
  'spotsLeft',
  'summary',
  'title',
  'venue',
] as const;

/** Sorted for the key-set test; keep in sync with the interface above. */
export const PUBLIC_EVENT_DETAIL_KEYS = [
  ...PUBLIC_EVENT_CARD_KEYS,
  'closed',
  'ended',
  'highlights',
  'publishedAt',
].sort() as readonly string[];

/** Sorted for the key-set test; keep in sync with the interface above. */
export const PUBLIC_EVENT_AGENCY_KEYS = ['logoUrl', 'name', 'slug', 'verified'] as const;

/** Sorted for the key-set test; keep in sync with the interface above. */
export const PUBLIC_EVENT_DATE_KEYS = ['endDate', 'label', 'startDate'] as const;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** A human window in UTC; an end before the start is treated as a one-day event. */
export function eventDateLabel(start: Date, end: Date | null): string {
  if (!end || end.getTime() <= start.getTime()) return dayLabel(start);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}

function kindOf(value: unknown): PublicEventKind {
  const kind = text(value);
  return (PUBLIC_EVENT_KINDS as readonly string[]).includes(kind)
    ? (kind as PublicEventKind)
    : 'other';
}

function projectDates(event: any): PublicEventDates {
  const start = toDate(event?.startDate);
  const end = toDate(event?.endDate) ?? start;
  if (!start) {
    // The model requires dates; a row without them is not publishable and the
    // service drops it before projection. This keeps the shape stable anyway.
    return { startDate: '', endDate: '', label: '' };
  }
  return {
    startDate: isoDay(start),
    endDate: isoDay(end!),
    label: eventDateLabel(start, end),
  };
}

function coverUrlOf(eventId: string, coverAssetId: unknown): string | null {
  if (!coverAssetId) return null;
  return `/api/events/${encodeURIComponent(eventId)}/cover`;
}

function projectAgency(agency: any, profile: any): PublicEventAgency {
  return {
    slug: text(agency?.slug),
    name: text(agency?.name),
    logoUrl: publicDirectoryLogoUrl(agency?.slug, agency?.branding),
    verified: Boolean(profile?.verifiedAt),
  };
}

/**
 * True once the end day has passed, in UTC whole days. Shared with the agency
 * service so "finished" means the same thing on both sides of the guard.
 */
export function eventHasEnded(event: any, now: Date = new Date()): boolean {
  const end = toDate(event?.endDate) ?? toDate(event?.startDate);
  if (!end) return false;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return end.getTime() < today.getTime();
}

function spotsLeftOf(event: any, confirmedCount: number): number | null {
  const capacity = Number(event?.capacity);
  if (!Number.isFinite(capacity) || capacity < 1) return null;
  return Math.max(0, Math.floor(capacity) - confirmedCount);
}

export function projectPublicEventSummary(input: {
  event: any;
  agency: any;
  profile?: any;
  confirmedCount?: number;
  now?: Date;
}): PublicEventSummary {
  const { event, agency, profile } = input;
  const confirmed = Math.max(0, Math.floor(Number(input.confirmedCount) || 0));
  const now = input.now ?? new Date();
  const id = String(event?._id ?? '');
  const capacity = Number(event?.capacity);
  const hasCapacity = Number.isFinite(capacity) && capacity >= 1;
  const price = Number(event?.pricePerPerson);
  const ended = eventHasEnded(event, now);

  return {
    _id: id,
    title: text(event?.title),
    summary: text(event?.summary),
    kind: kindOf(event?.kind),
    destination: text(event?.destination),
    venue: text(event?.venue),
    dates: projectDates(event),
    capacity: hasCapacity ? Math.floor(capacity) : null,
    spotsLeft: ended ? null : spotsLeftOf(event, confirmed),
    pricePerPerson:
      event?.pricePerPerson === null ||
      event?.pricePerPerson === undefined ||
      !Number.isFinite(price)
        ? null
        : price,
    currency: text(event?.currency) || 'INR',
    coverUrl: coverUrlOf(id, event?.coverAssetId),
    acceptingInterest:
      !event?.closedAt &&
      !eventHasEnded(event, now) &&
      (!hasCapacity || confirmed < Math.floor(capacity)),
    agency: projectAgency(agency, profile),
  };
}

export function projectPublicEventDetail(input: {
  event: any;
  agency: any;
  profile?: any;
  confirmedCount?: number;
  now?: Date;
}): PublicEventDetail {
  const summary = projectPublicEventSummary(input);
  return {
    ...summary,
    highlights: Array.isArray(input.event?.highlights)
      ? input.event.highlights
          .filter((entry: unknown): entry is string => typeof entry === 'string')
          .map((entry: string) => entry.trim())
          .filter(Boolean)
      : [],
    closed: Boolean(input.event?.closedAt),
    ended: eventHasEnded(input.event, input.now ?? new Date()),
    publishedAt: input.event?.publishedAt
      ? new Date(input.event.publishedAt).toISOString()
      : null,
  };
}
