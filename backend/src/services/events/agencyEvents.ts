import mongoose from 'mongoose';
import AgencyEvent, {
  AGENCY_EVENT_LIMITS,
  AGENCY_EVENT_KINDS,
  type AgencyEventKind,
  type AgencyEventState,
  type IAgencyEvent,
} from '../../models/AgencyEvent.js';
import AgencyEventInterest, {
  type AgencyEventInterestStatus,
} from '../../models/AgencyEventInterest.js';
import { AppError } from '../../utils/AppError.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { agencyAssetContentUrl } from '../agency/assetStorage.js';
import { resolveCoverAsset } from '../directory/packages.js';
import { normalizeTextList } from '../directory/taxonomy.js';
import { eventDateLabel, eventHasEnded } from './projection.js';

/**
 * Agency-side event library and interest roster (Milestone 10 E2).
 *
 * The lifecycle mirrors packages: planners draft, admins publish because the
 * change appears on a public page under the agency's name. Two rules are
 * event-specific:
 *
 * 1. **Closing is not unpublishing.** A close ends the booking window but keeps
 *    the page readable for anyone holding a spot; reopening restores interest
 *    without a second publish.
 * 2. **The roster is the attendance list.** Confirming is capacity-guarded so a
 *    capped camp can never be oversold from the desk.
 *
 * Editing a closed event is refused: a closed page is a promise to travellers
 * already on the list, so the team reopens it first if details changed.
 */

export interface AgencyEventReadiness {
  ready: boolean;
  missing: string[];
}

export interface AgencyEventInterestCounts {
  pending: number;
  confirmed: number;
  declined: number;
}

export interface OwnAgencyEventView {
  id: string;
  title: string;
  summary: string;
  kind: AgencyEventKind;
  destination: string;
  venue: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  capacity: number | null;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  highlights: string[];
  state: AgencyEventState;
  publishedAt: string | null;
  closedAt: string | null;
  /** Ops takedown; the agency can see it but cannot clear it. */
  hidden: boolean;
  hiddenReason: string | null;
  interests: AgencyEventInterestCounts;
  readiness: AgencyEventReadiness;
}

export interface AgencyEventInput {
  title?: unknown;
  summary?: unknown;
  kind?: unknown;
  destination?: unknown;
  venue?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  capacity?: unknown;
  pricePerPerson?: unknown;
  highlights?: unknown;
  coverAssetId?: unknown;
}

export interface EventInterestView {
  id: string;
  name: string;
  email: string;
  phone: string;
  note: string;
  status: AgencyEventInterestStatus;
  decidedAt: string | null;
  createdAt: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isoDay(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function parseDay(value: unknown, label: string): Date {
  const raw = text(value);
  if (!raw) throw new AppError(`Choose the event's ${label} date.`, 400);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Choose a valid ${label} date.`, 400);
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function asDay(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function validityOf(
  start: unknown,
  end: unknown
): { start: Date; end: Date } | null {
  const startDate = asDay(start);
  const endDate = asDay(end);
  if (!startDate || !endDate) return null;
  if (endDate.getTime() < startDate.getTime()) return null;
  return { start: startDate, end: endDate };
}

export function eventReadiness(event: Partial<IAgencyEvent> | null): AgencyEventReadiness {
  const missing: string[] = [];
  if (!text(event?.title)) {
    missing.push('Give the event a title.');
  }
  if (!text(event?.summary)) {
    missing.push('Write a line travellers will read on the card.');
  }
  if (!text(event?.destination)) {
    missing.push('Add the destination.');
  }
  if (
    !event?.startDate ||
    !event?.endDate ||
    !validityOf(event.startDate, event.endDate)
  ) {
    missing.push("Check the dates: both are needed and the end can't come first.");
  }
  return { ready: missing.length === 0, missing };
}

function kindOf(value: unknown): AgencyEventKind | undefined {
  if (value === undefined) return undefined;
  const kind = text(value);
  if (!(AGENCY_EVENT_KINDS as readonly string[]).includes(kind)) {
    throw new AppError('Choose an event type.', 400);
  }
  return kind as AgencyEventKind;
}

function capacityOf(value: unknown): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  const capacity = Number(value);
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > AGENCY_EVENT_LIMITS.capacityMax
  ) {
    throw new AppError(
      `Capacity must be a whole number between 1 and ${AGENCY_EVENT_LIMITS.capacityMax}.`,
      400
    );
  }
  return capacity;
}

function priceOf(value: unknown): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  const price = Number(value);
  if (
    !Number.isInteger(price) ||
    price < 0 ||
    price > AGENCY_EVENT_LIMITS.priceMax
  ) {
    throw new AppError('Enter a per-person price in whole rupees.', 400);
  }
  return price;
}

function textField(
  input: AgencyEventInput,
  key: 'title' | 'summary' | 'destination' | 'venue'
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  const cleaned = text(value);
  const max = AGENCY_EVENT_LIMITS[key];
  if (cleaned.length > max) {
    throw new AppError(
      `Keep the ${key} under ${max} characters.`,
      400
    );
  }
  return cleaned;
}

/** Shape wall for event writes; unknown keys never reach the document. */
export function buildEventFields(input: AgencyEventInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  for (const key of ['title', 'summary', 'destination', 'venue'] as const) {
    const value = textField(input, key);
    if (value !== undefined) fields[key] = value;
  }

  const kind = kindOf(input.kind);
  if (kind !== undefined) fields.kind = kind;

  if (input.startDate !== undefined) {
    fields.startDate = parseDay(input.startDate, 'start');
  }
  if (input.endDate !== undefined) {
    fields.endDate = parseDay(input.endDate, 'end');
  }

  if (input.capacity !== undefined) {
    fields.capacity = capacityOf(input.capacity);
  }
  if (input.pricePerPerson !== undefined) {
    fields.pricePerPerson = priceOf(input.pricePerPerson);
  }

  if (input.highlights !== undefined) {
    fields.highlights = normalizeTextList(input.highlights, {
      label: 'highlights',
      maxItems: AGENCY_EVENT_LIMITS.highlights,
      maxLength: AGENCY_EVENT_LIMITS.listItem,
    });
  }

  return fields;
}

export async function getAgencyEvent(
  agencyId: string,
  eventId: string
): Promise<IAgencyEvent> {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError('Event not found.', 404);
  }
  const event = await AgencyEvent.findOne({ _id: eventId, agencyId });
  if (!event) throw new AppError('Event not found.', 404);
  return event;
}

export async function createAgencyEvent(input: {
  agencyId: string;
  actorId?: string;
  fields: AgencyEventInput;
}): Promise<IAgencyEvent> {
  const fields = buildEventFields(input.fields);
  const startDate = fields.startDate as Date | undefined;
  const endDate = fields.endDate as Date | undefined;
  if (!startDate || !endDate) {
    throw new AppError('Add the event dates before saving it.', 400);
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new AppError("The end date can't come before the start date.", 400);
  }

  const coverAssetId =
    input.fields.coverAssetId !== undefined
      ? await resolveCoverAsset(input.agencyId, input.fields.coverAssetId)
      : null;

  const event = await AgencyEvent.create({
    agencyId: input.agencyId,
    title: (fields.title as string | undefined) ?? '',
    summary: (fields.summary as string | undefined) ?? '',
    kind: (fields.kind as AgencyEventKind | undefined) ?? 'camp',
    destination: (fields.destination as string | undefined) ?? '',
    venue: (fields.venue as string | undefined) ?? '',
    startDate,
    endDate,
    capacity: (fields.capacity as number | null | undefined) ?? null,
    pricePerPerson: (fields.pricePerPerson as number | null | undefined) ?? null,
    currency: 'INR',
    coverAssetId,
    highlights: (fields.highlights as string[] | undefined) ?? [],
    state: 'draft',
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'event.created',
    targetType: 'event',
    targetId: String(event._id),
    metadata: { title: event.title },
  });

  return event;
}

export async function updateAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
  fields: AgencyEventInput;
}): Promise<IAgencyEvent> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (event.closedAt) {
    throw new AppError(
      'Reopen this event before editing it, so the page travellers already saw stays stable.',
      409
    );
  }

  const fields = buildEventFields(input.fields);

  if (input.fields.coverAssetId !== undefined) {
    fields.coverAssetId = await resolveCoverAsset(
      input.agencyId,
      input.fields.coverAssetId
    );
  }

  if (Object.keys(fields).length === 0) {
    throw new AppError('Provide an event change.', 400);
  }

  const start = (fields.startDate as Date | undefined) ?? event.startDate;
  const end = (fields.endDate as Date | undefined) ?? event.endDate;
  if (new Date(end).getTime() < new Date(start).getTime()) {
    throw new AppError("The end date can't come before the start date.", 400);
  }

  const nextCapacity = fields.capacity;
  if (typeof nextCapacity === 'number') {
    const confirmed = await AgencyEventInterest.countDocuments({
      eventId: event._id,
      status: 'confirmed',
    });
    if (confirmed > nextCapacity) {
      throw new AppError(
        `You already have ${confirmed} confirmed ${
          confirmed === 1 ? 'traveller' : 'travellers'
        }. Keep the capacity at ${confirmed} or more, or release a spot first.`,
        409
      );
    }
  }

  Object.assign(event, fields);
  await event.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'event.updated',
    targetType: 'event',
    targetId: String(event._id),
  });

  return event;
}

export async function publishAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
}): Promise<IAgencyEvent> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (event.moderation?.hiddenAt) {
    throw new AppError(
      'This event is under review. Contact support before publishing it again.',
      409
    );
  }
  if (event.closedAt) {
    throw new AppError('Reopen this event before publishing it again.', 409);
  }
  if (eventHasEnded(event)) {
    throw new AppError(
      'This event has already finished. Move its dates forward before publishing it, so travellers never land on a page that is over.',
      409
    );
  }

  const readiness = eventReadiness(event);
  if (!readiness.ready) {
    throw new AppError(`Finish these first: ${readiness.missing.join(' ')}`, 400);
  }

  event.state = 'published';
  if (!event.publishedAt) event.publishedAt = new Date();
  await event.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'event.published',
    targetType: 'event',
    targetId: String(event._id),
    metadata: { title: event.title },
  });

  return event;
}

export async function unpublishAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
}): Promise<IAgencyEvent> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  event.state = 'draft';
  event.publishedAt = null;
  await event.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'event.unpublished',
    targetType: 'event',
    targetId: String(event._id),
    metadata: { title: event.title },
  });

  return event;
}

export async function closeAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
}): Promise<IAgencyEvent> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (event.state !== 'published') {
    throw new AppError('Publish the event before closing it.', 409);
  }

  if (!event.closedAt) {
    event.closedAt = new Date();
    await event.save();

    await recordAgencyAudit({
      agencyId: input.agencyId,
      actorId: input.actorId,
      action: 'event.closed',
      targetType: 'event',
      targetId: String(event._id),
      metadata: { title: event.title },
    });
  }

  return event;
}

export async function reopenAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
}): Promise<IAgencyEvent> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (event.closedAt) {
    event.closedAt = null;
    await event.save();

    await recordAgencyAudit({
      agencyId: input.agencyId,
      actorId: input.actorId,
      action: 'event.reopened',
      targetType: 'event',
      targetId: String(event._id),
      metadata: { title: event.title },
    });
  }

  return event;
}

/**
 * Drafts only, and only before anyone asked about them. A published event must
 * be unpublished first so the public page disappears deliberately, and an event
 * with interest is closed instead of deleted so the roster is never lost.
 */
export async function deleteAgencyEvent(input: {
  agencyId: string;
  eventId: string;
  actorId?: string;
}): Promise<{ id: string }> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (event.state !== 'draft') {
    throw new AppError('Unpublish the event before deleting it.', 409);
  }

  const interests = await AgencyEventInterest.countDocuments({
    eventId: event._id,
  });
  if (interests > 0) {
    throw new AppError(
      'This event has traveller interest. Close it instead of deleting it.',
      409
    );
  }

  await AgencyEvent.deleteOne({ _id: event._id, agencyId: input.agencyId });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'event.deleted',
    targetType: 'event',
    targetId: String(event._id),
    metadata: { title: event.title },
  });

  return { id: String(event._id) };
}

export interface AgencyEventInterestSummary {
  pending: number;
  confirmed: number;
  declined: number;
}

/**
 * The tenant-wide interest queue: one number for the Events nav badge.
 *
 * It reads the agency-wide index rather than the library, so a team member on
 * any page learns that someone asked for a spot without opening the roster.
 * Declined rows are counted too — the roster shows them — but only `pending`
 * is a call to action.
 */
export async function getAgencyEventInterestSummary(
  agencyId: string
): Promise<AgencyEventInterestSummary> {
  const rows = (await AgencyEventInterest.aggregate([
    { $match: { agencyId: new mongoose.Types.ObjectId(agencyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])) as any[];

  const summary: AgencyEventInterestSummary = {
    pending: 0,
    confirmed: 0,
    declined: 0,
  };
  for (const row of rows) {
    const status = String(row?._id ?? '') as AgencyEventInterestStatus;
    if (!Object.prototype.hasOwnProperty.call(summary, status)) continue;
    summary[status] = Math.max(0, Math.floor(Number(row?.count) || 0));
  }
  return summary;
}

async function interestCounts(
  eventIds: unknown[]
): Promise<Map<string, AgencyEventInterestCounts>> {
  const ids = [
    ...new Set(
      eventIds
        .map((id) => String(id ?? ''))
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));
  const result = new Map<string, AgencyEventInterestCounts>();
  if (ids.length === 0) return result;

  const rows = (await AgencyEventInterest.aggregate([
    { $match: { eventId: { $in: ids } } },
    {
      $group: {
        _id: { eventId: '$eventId', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ])) as any[];

  for (const row of rows) {
    const key = String(row._id?.eventId ?? '');
    const status = String(row._id?.status ?? '') as AgencyEventInterestStatus;
    if (!key || !['pending', 'confirmed', 'declined'].includes(status)) continue;
    const counts =
      result.get(key) ?? { pending: 0, confirmed: 0, declined: 0 };
    counts[status] = Math.max(0, Math.floor(Number(row.count) || 0));
    result.set(key, counts);
  }
  return result;
}

export function viewOwnEvent(
  event: any,
  agencyId: string,
  counts?: AgencyEventInterestCounts
): OwnAgencyEventView {
  const startDate = new Date(event?.startDate ?? '');
  const endDate = new Date(event?.endDate ?? event?.startDate ?? '');
  const capacity = Number(event?.capacity);
  const price = Number(event?.pricePerPerson);

  return {
    id: String(event?._id ?? ''),
    title: text(event?.title),
    summary: text(event?.summary),
    kind: (
      (AGENCY_EVENT_KINDS as readonly string[]).includes(text(event?.kind))
        ? text(event?.kind)
        : 'other'
    ) as AgencyEventKind,
    destination: text(event?.destination),
    venue: text(event?.venue),
    startDate: isoDay(startDate),
    endDate: isoDay(endDate),
    dateLabel: Number.isNaN(startDate.getTime())
      ? ''
      : eventDateLabel(startDate, endDate),
    capacity:
      event?.capacity === null ||
      event?.capacity === undefined ||
      !Number.isFinite(capacity)
        ? null
        : Math.floor(capacity),
    pricePerPerson:
      event?.pricePerPerson === null ||
      event?.pricePerPerson === undefined ||
      !Number.isFinite(price)
        ? null
        : price,
    currency: text(event?.currency) || 'INR',
    coverUrl: event?.coverAssetId
      ? agencyAssetContentUrl(agencyId, event.coverAssetId)
      : null,
    highlights: Array.isArray(event?.highlights)
      ? event.highlights
          .filter((entry: unknown): entry is string => typeof entry === 'string')
          .map((entry: string) => entry.trim())
          .filter(Boolean)
      : [],
    state: (event?.state ?? 'draft') as AgencyEventState,
    publishedAt: event?.publishedAt
      ? new Date(event.publishedAt).toISOString()
      : null,
    closedAt: event?.closedAt ? new Date(event.closedAt).toISOString() : null,
    hidden: Boolean(event?.moderation?.hiddenAt),
    hiddenReason: event?.moderation?.reason
      ? String(event.moderation.reason)
      : null,
    interests: counts ?? { pending: 0, confirmed: 0, declined: 0 },
    readiness: eventReadiness(event),
  };
}

/** The full library, newest start first. Drafts, past and closed rows included. */
export async function listAgencyEvents(
  agencyId: string
): Promise<OwnAgencyEventView[]> {
  const rows = (await AgencyEvent.find({ agencyId })
    .sort({ startDate: -1, _id: -1 })
    .lean()) as any[];
  const counts = await interestCounts(rows.map((row) => row._id));
  return rows.map((row) =>
    viewOwnEvent(row, agencyId, counts.get(String(row._id)))
  );
}

export async function getOwnAgencyEvent(
  agencyId: string,
  eventId: string
): Promise<OwnAgencyEventView> {
  const event = await getAgencyEvent(agencyId, eventId);
  const counts = await interestCounts([event._id]);
  return viewOwnEvent(event, agencyId, counts.get(String(event._id)));
}

function viewInterest(interest: any): EventInterestView {
  return {
    id: String(interest?._id ?? ''),
    name: text(interest?.name),
    email: text(interest?.email),
    phone: text(interest?.phone),
    note: text(interest?.note),
    status: (interest?.status ?? 'pending') as AgencyEventInterestStatus,
    decidedAt: interest?.decidedAt
      ? new Date(interest.decidedAt).toISOString()
      : null,
    createdAt: interest?.createdAt
      ? new Date(interest.createdAt).toISOString()
      : '',
  };
}

/**
 * One event's roster, actionable rows first.
 *
 * `decidedAt` is null until someone answers, so sorting it ascending puts the
 * queue on top; `status` then splits confirmed from declined, and `createdAt`
 * keeps the newest ask first inside each group.
 */
export async function listEventInterests(input: {
  agencyId: string;
  eventId: string;
  status?: AgencyEventInterestStatus;
}): Promise<EventInterestView[]> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);
  const query: Record<string, unknown> = {
    eventId: event._id,
    agencyId: input.agencyId,
  };
  if (input.status) query.status = input.status;

  const rows = (await AgencyEventInterest.find(query)
    .sort({ decidedAt: 1, status: 1, createdAt: -1, _id: -1 })
    .lean()) as any[];
  return rows.map(viewInterest);
}

/**
 * Confirm or decline one interest. Confirming is capacity-guarded; declining
 * frees a spot. Both are idempotent, and both are audited only when the row
 * actually changes, so a double click leaves one trail.
 */
export async function decideEventInterest(input: {
  agencyId: string;
  eventId: string;
  interestId: string;
  actorId?: string;
  status: 'confirmed' | 'declined';
}): Promise<EventInterestView> {
  const event = await getAgencyEvent(input.agencyId, input.eventId);

  if (!mongoose.isValidObjectId(input.interestId)) {
    throw new AppError('That interest is no longer on this event.', 404);
  }
  const interest = await AgencyEventInterest.findOne({
    _id: input.interestId,
    eventId: event._id,
    agencyId: input.agencyId,
  });
  if (!interest) {
    throw new AppError('That interest is no longer on this event.', 404);
  }

  if (input.status === 'confirmed') {
    const capacity = Number(event.capacity);
    if (Number.isFinite(capacity) && capacity >= 1) {
      const confirmed = await AgencyEventInterest.countDocuments({
        eventId: event._id,
        status: 'confirmed',
        _id: { $ne: interest._id },
      });
      if (confirmed >= Math.floor(capacity)) {
        throw new AppError(
          'Every spot is already confirmed. Decline someone else or raise the capacity first.',
          409
        );
      }
    }
  }

  const changed = interest.status !== input.status;
  if (changed) {
    interest.status = input.status;
    interest.decidedBy = input.actorId
      ? new mongoose.Types.ObjectId(input.actorId)
      : null;
    interest.decidedAt = new Date();
    await interest.save();

    await recordAgencyAudit({
      agencyId: input.agencyId,
      actorId: input.actorId,
      action:
        input.status === 'confirmed'
          ? 'event.interest_confirmed'
          : 'event.interest_declined',
      targetType: 'event',
      targetId: String(event._id),
      metadata: {
        interestId: String(interest._id),
        name: interest.name,
      },
    });
  }

  return viewInterest(interest);
}
