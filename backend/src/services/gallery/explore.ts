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
 * trips whose travel window has not passed (a trip with no dates is treated as
 * "dates flexible" and stays visible, matching the traveler page). Every row
 * passes through `projectGalleryTripSummary`; the full page uses
 * `projectGalleryTrip`, so no builder here can add a money or member field.
 *
 * Pagination is a stable `(publishedAt, _id)` cursor. `_id` is the tie-break
 * that keeps two trips published in the same millisecond from being skipped or
 * repeated.
 */

export type ExploreDuration = 'short' | 'week' | 'fortnight' | 'long';

export interface ExploreListQuery {
  q?: string;
  duration?: ExploreDuration;
  groupType?: string;
  tags?: string | string[];
  cursor?: string;
  limit?: number;
}

export interface ExplorePage {
  trips: GalleryTripSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

interface ExploreCursor {
  publishedAt: Date;
  id: string;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

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

function decodeCursor(raw: string): ExploreCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const publishedAt = new Date(String(parsed?.p ?? ''));
    const id = String(parsed?.i ?? '');
    if (
      Number.isNaN(publishedAt.getTime()) ||
      !mongoose.isValidObjectId(id) ||
      Object.keys(parsed ?? {}).length !== 2
    ) {
      throw new Error('bad cursor');
    }
    return { publishedAt, id };
  } catch {
    throw new AppError('That page cursor is not valid.', 400);
  }
}

function encodeCursor(trip: any): string {
  const publishedAt = new Date(trip.publishedAt);
  return Buffer.from(
    JSON.stringify({ p: publishedAt.toISOString(), i: String(trip._id) })
  ).toString('base64url');
}

/**
 * Builds the Mongo filter for the listing. Exported so the query shape
 * (eligibility, expiry, search, tags, duration, cursor) is pinned by tests
 * without starting a database.
 */
export function buildExploreFilter(query: ExploreListQuery): FilterQuery<any> {
  const clauses: FilterQuery<any>[] = [
    { visibility: 'public' },
    { isDeleted: { $ne: true } },
    { workspace: { $ne: 'agency' } },
    // `publishedAt` is written by the publish endpoint; requiring it keeps the
    // cursor maths well-defined and drops any hand-edited public row.
    { publishedAt: { $ne: null } },
    upcomingClause(),
  ];

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

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const id = new mongoose.Types.ObjectId(cursor.id);
    clauses.push({
      $or: [
        { publishedAt: { $lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, _id: { $lt: id } },
      ],
    });
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

/** Anonymous gallery listing, newest publication first. */
export async function listGalleryTrips(
  query: ExploreListQuery = {}
): Promise<ExplorePage> {
  const limit = Math.min(Math.max(Math.floor(Number(query.limit) || DEFAULT_LIMIT), 1), MAX_LIMIT);
  const filter = buildExploreFilter(query);
  const countFilter = buildExploreFilter({ ...query, cursor: undefined });

  const [rows, total] = await Promise.all([
    Trip.find(filter)
      .select(
        'title tripDetails gallery startDate endDate publishedAt generationMeta members'
      )
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean() as unknown as Promise<any[]>,
    Trip.countDocuments(countFilter),
  ]);

  const pageRows = rows.slice(0, limit);
  const publishers = await publisherMap(pageRows);
  const trips = pageRows
    .map((trip) => {
      const publisher = publishers.get(ownerIdOf(trip) ?? '');
      return publisher ? projectGalleryTripSummary(trip, publisher) : null;
    })
    .filter((trip): trip is GalleryTripSummary => trip !== null);

  const last = pageRows[pageRows.length - 1];
  return {
    trips,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
    hasMore: rows.length > limit,
    total,
  };
}

/** One public trip page. 404 for unpublished, expired, deleted or agency rows. */
export async function loadGalleryTrip(tripId: string): Promise<GalleryTrip> {
  if (!mongoose.isValidObjectId(tripId)) {
    throw new AppError('Trip not found.', 404);
  }

  const trip = (await Trip.findOne({
    _id: tripId,
    visibility: 'public',
    isDeleted: { $ne: true },
    workspace: { $ne: 'agency' },
    publishedAt: { $ne: null },
    ...upcomingClause(),
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
