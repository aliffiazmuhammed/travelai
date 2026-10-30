import mongoose, { type FilterQuery } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import { AppError } from '../../utils/AppError.js';
import { readAgencyAssetContent } from '../agency/assets.js';
import { publicProfileFilter } from '../directory/profile.js';
import {
  projectPublicEventDetail,
  projectPublicEventSummary,
  type PublicEventDetail,
  type PublicEventSummary,
} from './projection.js';

/**
 * Public event listing and event page (Milestone 10 E1).
 *
 * Two eligibility layers, and both are needed:
 *
 * 1. The row itself: published, dated, not ops-hidden and — for the listing —
 *    still open and not finished.
 * 2. The host: an active agency whose directory profile is published. This is
 *    the same rule that gates the agency page and its package covers, so a
 *    suspended or draft agency cannot leave a camp floating in Explore.
 *
 * The listing is (startDate, _id) ascending, soonest first, with `limit + 1`
 * to learn whether another page exists. `total` counts the eligible set before
 * the page, exactly like the gallery and directory.
 */

export interface PublicEventListQuery {
  /** One agency's page, addressed by its directory slug. */
  agency?: string;
  cursor?: string;
  limit?: number;
}

export interface PublicEventPage {
  events: PublicEventSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

interface PublicEventCursor {
  startDate: Date;
  id: string;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

const PUBLIC_EVENT_SELECT =
  'agencyId title summary kind destination venue startDate endDate capacity pricePerPerson currency coverAssetId highlights publishedAt closedAt';

const AGENCY_SELECT = 'slug name branding';

export function startOfTodayUtc(now: Date = new Date()): Date {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/**
 * "An event the public listing may show": live, open and not finished. An
 * event running today is still listed; one that ended yesterday is not.
 */
export function publicEventListingClauses(): FilterQuery<any>[] {
  return [
    { state: 'published' },
    { publishedAt: { $ne: null } },
    { 'moderation.hiddenAt': null },
    { closedAt: null },
    { endDate: { $gte: startOfTodayUtc() } },
  ];
}

/**
 * "An event page may open": the same publication and moderation rules, but a
 * closed or finished event still has a page. Someone who bookmarked, shared or
 * still holds a confirmed spot must not land on a 404 after the window shuts.
 */
export function publicEventDetailClauses(): FilterQuery<any>[] {
  return [
    { state: 'published' },
    { publishedAt: { $ne: null } },
    { 'moderation.hiddenAt': null },
  ];
}

/**
 * The agencies an event may be shown for: active tenants with a published,
 * non-hidden directory profile. Loaded as an id list rather than a `$lookup`
 * so the listing filter stays a plain query and `countDocuments` agrees with
 * the page. The directory is small today; if it grows into the thousands this
 * should become a join.
 */
async function publicAgencyIds(): Promise<string[]> {
  const [profiles, agencies] = await Promise.all([
    AgencyProfile.find(publicProfileFilter())
      .select('agencyId')
      .lean() as unknown as Promise<any[]>,
    Agency.find({ status: 'active' })
      .select('_id')
      .lean() as unknown as Promise<any[]>,
  ]);

  const active = new Set(agencies.map((row) => String(row._id)));
  const ids = profiles
    .map((row) => String(row.agencyId))
    .filter((id) => mongoose.isValidObjectId(id) && active.has(id));
  return [...new Set(ids)];
}

export function encodePublicEventCursor(row: any): string {
  const startDate = new Date(row.startDate);
  return Buffer.from(
    JSON.stringify({ s: startDate.toISOString(), i: String(row._id) })
  ).toString('base64url');
}

export function decodePublicEventCursor(raw: string): PublicEventCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const startDate = new Date(String(parsed?.s ?? ''));
    const id = String(parsed?.i ?? '');
    if (
      Number.isNaN(startDate.getTime()) ||
      !mongoose.isValidObjectId(id) ||
      Object.keys(parsed ?? {}).length !== 2
    ) {
      throw new Error('bad cursor');
    }
    return { startDate, id };
  } catch {
    throw new AppError('That page cursor is not valid.', 400);
  }
}

/** Exported so the eligibility rules and the cursor shape are pinned by tests. */
export function buildPublicEventFilter(
  query: PublicEventListQuery,
  agencyIds: string[]
): FilterQuery<any> {
  const clauses: FilterQuery<any>[] = publicEventListingClauses();
  clauses.push({ agencyId: { $in: agencyIds } });

  if (query.cursor) {
    const cursor = decodePublicEventCursor(query.cursor);
    clauses.push({
      $or: [
        { startDate: { $gt: cursor.startDate } },
        {
          startDate: cursor.startDate,
          _id: { $gt: new mongoose.Types.ObjectId(cursor.id) },
        },
      ],
    });
  }

  return { $and: clauses };
}

function limitOf(value: unknown): number {
  return Math.min(Math.max(Math.floor(Number(value) || DEFAULT_LIMIT), 1), MAX_LIMIT);
}

function emptyEventPage(): PublicEventPage {
  return { events: [], nextCursor: null, hasMore: false, total: 0 };
}

/**
 * The listing narrowed to one agency's page. The slug is resolved inside the
 * eligible set rather than against the whole tenant table, so a draft, hidden
 * or suspended agency has no events to show. `null` means "not eligible": the
 * caller answers with an empty page, because the agency page itself already
 * decides between a profile and a 404.
 */
async function scopeToAgency(
  slug: string,
  eligibleIds: string[]
): Promise<string[] | null> {
  const normalized = String(slug ?? '').trim().toLowerCase();
  if (!normalized) return eligibleIds;

  const agency = (await Agency.findOne({ slug: normalized, status: 'active' })
    .select('_id')
    .lean()) as any;
  const id = agency ? String(agency._id) : '';
  return eligibleIds.includes(id) ? [id] : null;
}

async function agencyMap(
  agencyIds: string[]
): Promise<Map<string, { agency: any; profile: any }>> {
  const ids = [...new Set(agencyIds.filter((id) => mongoose.isValidObjectId(id)))];
  const result = new Map<string, { agency: any; profile: any }>();
  if (ids.length === 0) return result;

  const [agencies, profiles] = await Promise.all([
    Agency.find({ _id: { $in: ids }, status: 'active' })
      .select(AGENCY_SELECT)
      .lean() as unknown as Promise<any[]>,
    AgencyProfile.find({ agencyId: { $in: ids }, ...publicProfileFilter() })
      .select('agencyId verifiedAt')
      .lean() as unknown as Promise<any[]>,
  ]);

  const profileByAgency = new Map(
    profiles.map((profile) => [String(profile.agencyId), profile])
  );
  for (const agency of agencies) {
    const profile = profileByAgency.get(String(agency._id));
    if (profile) result.set(String(agency._id), { agency, profile });
  }
  return result;
}

/** Confirmed spots per event, in one grouped read instead of a count per card. */
async function confirmedCounts(eventIds: string[]): Promise<Map<string, number>> {
  const ids = [
    ...new Set(eventIds.filter((id) => mongoose.isValidObjectId(id))),
  ].map((id) => new mongoose.Types.ObjectId(id));
  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const rows = (await AgencyEventInterest.aggregate([
    { $match: { eventId: { $in: ids }, status: 'confirmed' } },
    { $group: { _id: '$eventId', count: { $sum: 1 } } },
  ])) as any[];

  for (const row of rows) {
    result.set(String(row._id), Math.max(0, Math.floor(Number(row.count) || 0)));
  }
  return result;
}

/** Anonymous event listing, soonest start first. */
export async function listPublicEvents(
  query: PublicEventListQuery = {}
): Promise<PublicEventPage> {
  const limit = limitOf(query.limit);
  const eligibleIds = await publicAgencyIds();
  const agencyIds = query.agency
    ? await scopeToAgency(query.agency, eligibleIds)
    : eligibleIds;
  if (!agencyIds) return emptyEventPage();

  const filter = buildPublicEventFilter(query, agencyIds);
  const countFilter = buildPublicEventFilter({ ...query, cursor: undefined }, agencyIds);

  const [rows, total] = await Promise.all([
    AgencyEvent.find(filter)
      .select(PUBLIC_EVENT_SELECT)
      .sort({ startDate: 1, _id: 1 })
      .limit(limit + 1)
      .lean() as unknown as Promise<any[]>,
    AgencyEvent.countDocuments(countFilter),
  ]);

  const pageRows = rows.slice(0, limit);
  const [hosts, counts] = await Promise.all([
    agencyMap(pageRows.map((row) => String(row.agencyId))),
    confirmedCounts(pageRows.map((row) => String(row._id))),
  ]);

  const now = new Date();
  const events = pageRows
    .map((row) => {
      const host = hosts.get(String(row.agencyId));
      if (!host) return null;
      return projectPublicEventSummary({
        event: row,
        agency: host.agency,
        profile: host.profile,
        confirmedCount: counts.get(String(row._id)) ?? 0,
        now,
      });
    })
    .filter((event): event is PublicEventSummary => event !== null);

  const last = pageRows[pageRows.length - 1];
  return {
    events,
    nextCursor: rows.length > limit && last ? encodePublicEventCursor(last) : null,
    hasMore: rows.length > limit,
    total,
  };
}

/**
 * The host of one event, resolved through the same public rule the listing
 * uses. Returns null for an unknown, suspended or unpublished agency. Shared
 * with the interest write so a page and its form can never disagree.
 */
export async function loadPublicEventHost(
  agencyId: unknown
): Promise<{ agency: any; profile: any } | null> {
  if (!mongoose.isValidObjectId(String(agencyId ?? ''))) return null;

  const agency = (await Agency.findOne({ _id: agencyId, status: 'active' })
    .select(AGENCY_SELECT)
    .lean()) as any;
  if (!agency) return null;

  const profile = (await AgencyProfile.findOne({
    agencyId: agency._id,
    ...publicProfileFilter(),
  })
    .select('verifiedAt')
    .lean()) as any;
  if (!profile) return null;

  return { agency, profile };
}

/** One public event page. Closed and finished events stay readable. */
export async function loadPublicEvent(eventId: string): Promise<PublicEventDetail> {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError('Event not found.', 404);
  }

  const event = (await AgencyEvent.findOne({
    _id: eventId,
    $and: publicEventDetailClauses(),
  })
    .select(PUBLIC_EVENT_SELECT)
    .lean()) as any;
  if (!event) throw new AppError('Event not found.', 404);

  const host = await loadPublicEventHost(event.agencyId);
  if (!host) throw new AppError('Event not found.', 404);

  const counts = await confirmedCounts([String(event._id)]);
  return projectPublicEventDetail({
    event,
    agency: host.agency,
    profile: host.profile,
    confirmedCount: counts.get(String(event._id)) ?? 0,
    now: new Date(),
  });
}

export interface PublicEventCover {
  buffer: Buffer;
  mime: string;
}

/**
 * Public cover bytes. Same eligibility as the event page, so a closed event
 * keeps its image while a draft, an ops-hidden row or a suspended host serves
 * nothing. Covers are ordinary private agency assets, never direct URLs.
 */
export async function loadPublicEventCover(
  eventId: string
): Promise<PublicEventCover | null> {
  if (!mongoose.isValidObjectId(eventId)) return null;

  const event = (await AgencyEvent.findOne({
    _id: eventId,
    $and: publicEventDetailClauses(),
  })
    .select('agencyId coverAssetId')
    .lean()) as any;
  if (!event?.coverAssetId) return null;

  const host = await loadPublicEventHost(event.agencyId);
  if (!host) return null;

  try {
    const { asset, buffer } = await readAgencyAssetContent(
      String(host.agency._id),
      String(event.coverAssetId)
    );
    if (asset.kind !== 'image') return null;
    return { buffer, mime: asset.mime };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return null;
    throw error;
  }
}
