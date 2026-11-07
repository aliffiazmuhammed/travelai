import mongoose, { type FilterQuery } from 'mongoose';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { normalizeGalleryTags } from './publish.js';
import {
  projectGalleryTrip,
  projectGalleryTripSummary,
  type GalleryPublisher,
  type GalleryTrip,
  type GalleryTripSummary,
} from './projection.js';

/**
 * Public gallery listing and trip page (Milestone 8 G3).
 *
 * The listing is deliberately narrow: only published, non-agency, non-deleted
 * trips. `when` splits it in two:
 *
 * - `live` (the default) is a trip whose start date is today or later, plus
 *   date-flexible trips; those are the ones a visitor can still ask to join.
 * - `past` is a trip that has already started. Its page and plan stay public,
 *   so it can still be copied, but joining is closed.
 *
 * Every row passes through `projectGalleryTripSummary`; the full page uses
 * `projectGalleryTrip`, so no builder here can add a money or member field.
 *
 * Paging is offset-based because the live tab is ordered by departure, not by
 * publication. A page number and a fixed limit give the client Previous/Next
 * without asking it to carry sort keys.
 */

export type ExploreDuration = 'short' | 'week' | 'fortnight' | 'long';
export type ExploreWhen = 'live' | 'past';

export interface ExploreListQuery {
  q?: string;
  duration?: ExploreDuration;
  groupType?: string;
  tags?: string | string[];
  when?: ExploreWhen;
  page?: number;
  limit?: number;
}

export interface ExplorePage {
  trips: GalleryTripSummary[];
  hasMore: boolean;
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const MAX_PAGE = 200;
/** Date-flexible trips sort after every dated trip in the live tab. */
const FAR_FUTURE = new Date('9999-12-31T00:00:00.000Z');

const DURATION_RANGES: Record<ExploreDuration, { min: number; max?: number }> = {
  short: { min: 1, max: 3 },
  week: { min: 4, max: 7 },
  fortnight: { min: 8, max: 14 },
  long: { min: 15 },
};

function startOfTodayUtc(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

/**
 * Whether a trip can still accept join requests. A date-flexible trip has no
 * window to miss, so it stays joinable; anything that starts before today has
 * already begun and is copy-only.
 */
export function isTripLive(
  trip: { startDate?: Date | string | null },
  now: Date = new Date()
): boolean {
  if (!trip?.startDate) return true;
  const start = new Date(trip.startDate);
  if (Number.isNaN(start.getTime())) return true;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return start >= today;
}

/** Mirrors the traveler page: future or date-less, never a finished trip. */
function upcomingClause(): FilterQuery<any> {
  return {
    $or: [
      { startDate: { $gte: startOfTodayUtc() } },
      { startDate: { $exists: false } },
      { startDate: null },
    ],
  };
}

/**
 * The definition of "a trip the public gallery may show", exported so that the
 * join-request path reuses exactly the same eligibility rule instead of
 * inventing a second one. A trip that fails these clauses cannot be browsed,
 * cloned or joined: unpublished, deleted, agency-owned, never published, or
 * already in the past.
 *
 * `includePast` keeps everything except the date window. The live listing and
 * join requests stay upcoming-only, while a traveler page, the past tab and a
 * direct trip link keep working after the trip ends — a published trip does not
 * vanish from the person who shared it.
 */
export function publicTripClauses(
  options: { includePast?: boolean } = {}
): FilterQuery<any>[] {
  const clauses: FilterQuery<any>[] = [
    { visibility: 'public' },
    { isDeleted: { $ne: true } },
    { workspace: { $ne: 'agency' } },
    // `publishedAt` is written by the publish endpoint; requiring it drops any
    // hand-edited public row and keeps the card's "shared on" field meaningful.
    { publishedAt: { $ne: null } },
    // G6: auto-hidden or admin-de-listed content leaves every public surface
    // at once. `null` matches both an absent field and an explicit null, which
    // is the two-state reality of `moderation.hiddenAt`.
    { 'moderation.hiddenAt': null },
  ];
  if (!options.includePast) clauses.push(upcomingClause());
  return clauses;
}

function normalizeTagsInput(input: ExploreListQuery['tags']): string[] {
  if (input === undefined) return [];
  const raw = Array.isArray(input) ? input : String(input).split(',');
  return normalizeGalleryTags(raw);
}

/**
 * The same duration precedence as the projection: declared day count first,
 * then the day list length. Mongo has no stored duration field, so the filter
 * is an `$expr` over the nested itinerary.
 */
function durationExpression(): Record<string, unknown> {
  return {
    $ifNull: [
      '$tripDetails.duration_days',
      { $size: { $ifNull: ['$tripDetails.day_by_day_itinerary', []] } },
    ],
  };
}

/**
 * Builds the Mongo filter for the listing. Exported so the query shape
 * (eligibility, live/past window, search, tags, duration) is pinned by tests
 * without starting a database.
 */
export function buildExploreFilter(query: ExploreListQuery): FilterQuery<any> {
  const when = query.when === 'past' ? 'past' : 'live';
  const clauses: FilterQuery<any>[] =
    when === 'past'
      ? [...publicTripClauses({ includePast: true }), { startDate: { $lt: startOfTodayUtc() } }]
      : publicTripClauses();

  const search = String(query.q ?? '').trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    clauses.push({
      $or: [
        { title: pattern },
        { 'tripDetails.trip_title': pattern },
        { 'generationMeta.request.destination': pattern },
        { 'gallery.summary': pattern },
      ],
    });
  }

  const groupType = String(query.groupType ?? '').trim();
  if (groupType) {
    clauses.push({
      'tripDetails.group_type': new RegExp(`^${escapeRegex(groupType)}$`, 'i'),
    });
  }

  const tags = normalizeTagsInput(query.tags);
  if (tags.length > 0) {
    clauses.push({ 'gallery.tags': { $all: tags } });
  }

  if (query.duration) {
    const range = DURATION_RANGES[query.duration];
    const expression = durationExpression();
    const bounds: Record<string, unknown>[] = [{ $gte: [expression, range.min] }];
    if (range.max !== undefined) bounds.push({ $lte: [expression, range.max] });
    clauses.push({ $expr: bounds.length === 1 ? bounds[0] : { $and: bounds } });
  }

  return { $and: clauses };
}

function ownerIdOf(trip: any): string | undefined {
  const owner = (Array.isArray(trip?.members) ? trip.members : []).find(
    (member: any) => String(member?.role) === 'owner'
  );
  return owner?.userId ? String(owner.userId) : undefined;
}

async function publisherMap(trips: any[]): Promise<Map<string, GalleryPublisher>> {
  const ids = [
    ...new Set(
      trips
        .map(ownerIdOf)
        .filter((id): id is string => Boolean(id) && mongoose.isValidObjectId(id))
    ),
  ];
  if (ids.length === 0) return new Map();

  const users = (await User.find({
    _id: { $in: ids },
    accountType: 'personal',
    status: 'active',
  })
    .select('name avatarUrl profile')
    .lean()) as any[];

  const map = new Map<string, GalleryPublisher>();
  for (const user of users) {
    const handle = String(user?.profile?.handle ?? '').trim();
    if (!handle) continue;
    map.set(String(user._id), {
      handle,
      name: String(user.name ?? '').trim() || handle,
      ...(user.avatarUrl ? { avatarUrl: String(user.avatarUrl) } : {}),
    });
  }
  return map;
}

/**
 * Anonymous gallery listing. The live tab leads with the soonest departure;
 * the past tab leads with the trip that finished most recently.
 */
export async function listGalleryTrips(
  query: ExploreListQuery = {}
): Promise<ExplorePage> {
  const when = query.when === 'past' ? 'past' : 'live';
  const limit = Math.min(Math.max(Math.floor(Number(query.limit) || DEFAULT_LIMIT), 1), MAX_LIMIT);
  const page = Math.min(Math.max(Math.floor(Number(query.page) || 1), 1), MAX_PAGE);
  const filter = buildExploreFilter({ ...query, when });

  const pipeline: mongoose.PipelineStage[] = [{ $match: filter }];
  if (when === 'live') {
    // Date-flexible trips are joinable but have no departure to sort by, so
    // they follow every dated trip instead of leading the list.
    pipeline.push({ $addFields: { __sortStart: { $ifNull: ['$startDate', FAR_FUTURE] } } });
    pipeline.push({ $sort: { __sortStart: 1, publishedAt: -1, _id: -1 } });
  } else {
    pipeline.push({ $sort: { startDate: -1, publishedAt: -1, _id: -1 } });
  }
  pipeline.push({
    $project: {
      title: 1,
      tripDetails: 1,
      gallery: 1,
      startDate: 1,
      endDate: 1,
      publishedAt: 1,
      generationMeta: 1,
      members: 1,
    },
  });
  pipeline.push({ $skip: (page - 1) * limit });
  pipeline.push({ $limit: limit + 1 });

  const [rows, total] = await Promise.all([
    Trip.aggregate(pipeline) as unknown as Promise<any[]>,
    Trip.countDocuments(filter),
  ]);

  const pageRows = rows.slice(0, limit);
  const publishers = await publisherMap(pageRows);
  const trips = pageRows
    .map((trip) => {
      const publisher = publishers.get(ownerIdOf(trip) ?? '');
      return publisher ? projectGalleryTripSummary(trip, publisher) : null;
    })
    .filter((trip): trip is GalleryTripSummary => trip !== null);

  return {
    trips,
    hasMore: rows.length > limit,
    total,
    page,
    pageSize: limit,
  };
}

/** One public trip page. 404 for unpublished, deleted or agency rows. */
export async function loadGalleryTrip(tripId: string): Promise<GalleryTrip> {
  if (!mongoose.isValidObjectId(tripId)) {
    throw new AppError('Trip not found.', 404);
  }

  const trip = (await Trip.findOne({
    _id: tripId,
    $and: publicTripClauses({ includePast: true }),
  })
    .select(
      'title tripDetails gallery startDate endDate publishedAt generationMeta members customRoutes'
    )
    .lean()) as any;

  if (!trip) {
    throw new AppError('Trip not found.', 404);
  }

  const publishers = await publisherMap([trip]);
  const publisher = publishers.get(ownerIdOf(trip) ?? '');
  if (!publisher) {
    // A disabled/departed publisher takes their public page down with them.
    throw new AppError('Trip not found.', 404);
  }

  return projectGalleryTrip(trip, publisher);
}
