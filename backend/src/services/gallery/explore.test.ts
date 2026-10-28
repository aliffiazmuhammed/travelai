import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import {
  buildExploreFilter,
  listGalleryTrips,
  loadGalleryTrip,
} from './explore.js';

/**
 * Milestone 8 G3 — the public gallery listing and trip page.
 *
 * `projection.test.ts` already pins *what* a public payload may contain. These
 * tests pin *which* rows may appear at all (published, personal, live, not
 * deleted), how the filters and the `(publishedAt, _id)` cursor are built, and
 * that both read paths leave through the projection.
 */

const USER_A = '64b0000000000000000000a1';
const USER_B = '64b0000000000000000000b2';
const TRIP_1 = '64b000000000000000000101';
const TRIP_2 = '64b000000000000000000102';

let tripQuery: any = null;
let countQuery: any = null;
let tripLimit: number | null = null;
let currentRows: any[] = [];
let currentTotal = 0;
let currentUsers: any[] = [];
let findOneResult: any = null;

const originals = {
  find: Trip.find,
  findOne: Trip.findOne,
  countDocuments: Trip.countDocuments,
  userFind: User.find,
};

(Trip as any).find = (filter: any) => {
  tripQuery = filter;
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    limit: (value: number) => {
      tripLimit = value;
      return chain;
    },
    lean: async () => currentRows,
  };
  return chain;
};

(Trip as any).findOne = (filter: any) => {
  tripQuery = filter;
  return {
    select: () => ({ lean: async () => findOneResult }),
  };
};

(Trip as any).countDocuments = async (filter: any) => {
  countQuery = filter;
  return currentTotal;
};

(User as any).find = (_filter: any) => {
  const chain: any = {
    select: () => chain,
    lean: async () => currentUsers,
  };
  return chain;
};

test.after(() => {
  (Trip as any).find = originals.find;
  (Trip as any).findOne = originals.findOne;
  (Trip as any).countDocuments = originals.countDocuments;
  (User as any).find = originals.userFind;
});

function publisher(id = USER_A, overrides: Record<string, unknown> = {}): any {
  return {
    _id: id,
    name: 'Ada',
    avatarUrl: 'https://cdn.example.com/a.jpg',
    profile: { handle: 'ada' },
    email: 'ada@example.com',
    ...overrides,
  };
}

function trip(overrides: Record<string, unknown> = {}): any {
  return {
    _id: TRIP_1,
    title: 'Himalaya Week',
    startDate: new Date('2026-11-10T00:00:00.000Z'),
    endDate: new Date('2026-11-15T00:00:00.000Z'),
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    gallery: { hideExactDates: false, summary: 'Six days in the hills', tags: ['hills'] },
    generationMeta: { request: { destination: 'Manali' } },
    customRoutes: [
      { name: 'Old Manali loop', day: 2, points: [[32.2, 77.1], [32.3, 77.2]], distanceKm: 4 },
    ],
    tripDetails: {
      trip_title: 'Himalaya Week',
      duration_days: 6,
      season: 'winter',
      group_type: 'friends',
      highlights: ['Old Manali'],
      budget_per_person: 45000,
      budget_breakdown: { total: 45000 },
      weather_advisory: { expected_weather: 'Cold', packing_tips: ['Layers'], risks: [], seasonal_highlights: [] },
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive',
          activities: [{ name: 'Cafe hopping', approx_cost: 1200, coordinates: [32.2, 77.1] }],
          stay_recommendations: [{ name: 'Cottage', price_per_night: 3500 }],
          food_spots: ['Johnson Cafe'],
        },
      ],
    },
    members: [{ userId: USER_A, role: 'owner' }],
    email: 'ada@example.com',
    ...overrides,
  };
}

function reset(): void {
  tripQuery = null;
  countQuery = null;
  tripLimit = null;
  currentRows = [];
  currentTotal = 0;
  currentUsers = [publisher()];
  findOneResult = trip();
}

function clauses(filter: any): any[] {
  return Array.isArray(filter?.$and) ? filter.$and : [filter];
}

function clauseWithKey(filter: any, key: string): any {
  return clauses(filter).find((clause) => Object.prototype.hasOwnProperty.call(clause, key));
}

function orClauseStartingWith(filter: any, key: string): any {
  return clauses(filter).find(
    (clause) => Array.isArray(clause.$or) && clause.$or[0] && Object.prototype.hasOwnProperty.call(clause.$or[0], key)
  );
}

/* -------------------------------------------------------------------------- */
/*  Eligibility                                                                */
/* -------------------------------------------------------------------------- */

test('the listing only asks for published, personal, live rows', () => {
  const filter = buildExploreFilter({});
  const flat = clauses(filter);

  assert.deepEqual(
    flat.find((clause) => 'visibility' in clause),
    { visibility: 'public' }
  );
  assert.deepEqual(
    flat.find((clause) => 'isDeleted' in clause),
    { isDeleted: { $ne: true } }
  );
  assert.deepEqual(
    flat.find((clause) => 'workspace' in clause),
    { workspace: { $ne: 'agency' } }
  );
  assert.deepEqual(
    flat.find((clause) => 'publishedAt' in clause),
    { publishedAt: { $ne: null } }
  );

  const upcoming = orClauseStartingWith(filter, 'startDate');
  assert.ok(upcoming, 'expiry clause must exist');
  assert.equal(upcoming.$or.length, 3);
  assert.ok(upcoming.$or[0].startDate.$gte instanceof Date);
  assert.equal(upcoming.$or[0].startDate.$gte.getUTCHours(), 0);
  assert.deepEqual(upcoming.$or[1], { startDate: { $exists: false } });
  assert.deepEqual(upcoming.$or[2], { startDate: null });
});

test('the expiry cutoff is midnight today, so a finished trip drops out', () => {
  const filter = buildExploreFilter({});
  const upcoming = orClauseStartingWith(filter, 'startDate');
  const cutoff = upcoming.$or[0].startDate.$gte as Date;

  const now = new Date();
  assert.equal(
    cutoff.getTime(),
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    'trips are listed while their start date is today or later'
  );
});

/* -------------------------------------------------------------------------- */
/*  Filters                                                                    */
/* -------------------------------------------------------------------------- */

test('search is escaped and covers title, destination and summary', () => {
  const filter = buildExploreFilter({ q: '  hills (and) lakes ' });
  const search = orClauseStartingWith(filter, 'title');

  assert.ok(search, 'search clause must exist');
  assert.equal(search.$or.length, 4);
  const pattern: RegExp = search.$or[0].title;
  assert.ok(pattern instanceof RegExp);
  // Metacharacters from the query must be literal, not wildcards.
  assert.equal(pattern.source, 'hills \\(and\\) lakes');
  assert.equal(pattern.flags, 'i');
});

test('group type is matched exactly and case-insensitively', () => {
  const filter = buildExploreFilter({ groupType: 'Friends' });
  const group = clauses(filter).find((clause) => 'tripDetails.group_type' in clause);

  assert.ok(group);
  assert.equal(group['tripDetails.group_type'].source, '^Friends$');
  assert.equal(group['tripDetails.group_type'].flags, 'i');
});

test('tags are normalized to the stored form and matched with $all', () => {
  const filter = buildExploreFilter({ tags: 'Hills, #MOUNTAIN ,hills' });
  const tags = clauses(filter).find((clause) => 'gallery.tags' in clause);

  assert.deepEqual(tags, { 'gallery.tags': { $all: ['hills', 'mountain'] } });
});

test('duration buckets read the declared day count, then the day list', () => {
  const durationClause = (value: 'short' | 'week' | 'fortnight' | 'long') =>
    clauses(buildExploreFilter({ duration: value })).find((clause) => '$expr' in clause)?.$expr;

  const expression = {
    $ifNull: [
      '$tripDetails.duration_days',
      { $size: { $ifNull: ['$tripDetails.day_by_day_itinerary', []] } },
    ],
  };

  assert.deepEqual(durationClause('short'), {
    $and: [{ $gte: [expression, 1] }, { $lte: [expression, 3] }],
  });
  assert.deepEqual(durationClause('week'), {
    $and: [{ $gte: [expression, 4] }, { $lte: [expression, 7] }],
  });
  assert.deepEqual(durationClause('fortnight'), {
    $and: [{ $gte: [expression, 8] }, { $lte: [expression, 14] }],
  });
  assert.deepEqual(durationClause('long'), { $gte: [expression, 15] });
});

test('filters are omitted when the query is empty', () => {
  const filter = buildExploreFilter({});

  assert.equal(orClauseStartingWith(filter, 'title'), undefined);
  assert.equal(clauses(filter).find((clause) => '$expr' in clause), undefined);
  assert.equal(clauses(filter).find((clause) => 'gallery.tags' in clause), undefined);
});

/* -------------------------------------------------------------------------- */
/*  Cursor                                                                     */
/* -------------------------------------------------------------------------- */

function makeCursor(publishedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ p: publishedAt, i: id })).toString('base64url');
}

test('the cursor narrows on (publishedAt, _id), never on _id alone', () => {
  const publishedAt = '2026-10-01T00:00:00.000Z';
  const filter = buildExploreFilter({ cursor: makeCursor(publishedAt, TRIP_1) });
  const cursor = orClauseStartingWith(filter, 'publishedAt');

  assert.ok(cursor, 'cursor clause must exist');
  assert.deepEqual(cursor.$or[0], { publishedAt: { $lt: new Date(publishedAt) } });
  assert.equal(cursor.$or[1].publishedAt.toISOString(), publishedAt);
  assert.ok(cursor.$or[1]._id.$lt instanceof mongoose.Types.ObjectId);
  assert.equal(cursor.$or[1]._id.$lt.toHexString(), TRIP_1);
});

test('a malformed or padded cursor is a 400 instead of a query', () => {
  for (const cursor of [
    'not-a-cursor',
    makeCursor('not-a-date', TRIP_1),
    makeCursor('2026-10-01T00:00:00.000Z', 'nope'),
    Buffer.from(JSON.stringify({ p: '2026-10-01T00:00:00.000Z', i: TRIP_1, x: 1 })).toString('base64url'),
  ]) {
    assert.throws(() => buildExploreFilter({ cursor }), /page cursor is not valid/);
  }
});

/* -------------------------------------------------------------------------- */
/*  Listing                                                                    */
/* -------------------------------------------------------------------------- */

test('the listing fetches one extra row to detect another page', async () => {
  reset();
  currentRows = [trip(), trip({ _id: TRIP_2, publishedAt: new Date('2026-09-01T00:00:00.000Z') })];
  currentUsers = [publisher()];

  const page = await listGalleryTrips({ limit: 1 });

  assert.equal(tripLimit, 2);
  assert.equal(page.trips.length, 1);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  const decoded = JSON.parse(Buffer.from(page.nextCursor!, 'base64url').toString('utf8'));
  assert.deepEqual(decoded, { p: '2026-10-01T00:00:00.000Z', i: TRIP_1 });
});

test('the last page has no cursor', async () => {
  reset();
  currentRows = [trip()];

  const page = await listGalleryTrips({ limit: 12 });

  assert.equal(page.trips.length, 1);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test('total counts the whole filter, not just the page', async () => {
  reset();
  currentRows = [trip()];
  currentTotal = 37;

  const page = await listGalleryTrips({ q: 'hills', limit: 1, cursor: makeCursor('2026-10-01T00:00:00.000Z', TRIP_1) });

  assert.equal(page.total, 37);
  assert.ok(orClauseStartingWith(tripQuery, 'title'), 'page query keeps the search');
  assert.ok(orClauseStartingWith(countQuery, 'title'), 'count keeps the search');
  assert.equal(orClauseStartingWith(countQuery, 'publishedAt'), undefined, 'count ignores the cursor');
});

test('a publisher without a handle drops the row instead of inventing one', async () => {
  reset();
  currentRows = [trip()];
  currentUsers = [publisher(USER_A, { profile: {} })];

  const page = await listGalleryTrips({ limit: 12 });
  assert.deepEqual(page.trips, []);
});

test('a card carries the summary projection only', async () => {
  reset();
  currentRows = [trip()];

  const page = await listGalleryTrips({ limit: 12 });
  const card = page.trips[0];

  assert.deepEqual(Object.keys(card).sort(), [
    '_id',
    'dates',
    'destination',
    'durationDays',
    'groupType',
    'publishedAt',
    'publisher',
    'season',
    'summary',
    'tags',
    'title',
  ]);
  assert.equal(card.destination, 'Manali');
  assert.equal(card.summary, 'Six days in the hills');

  const serialized = JSON.stringify(page);
  for (const leaked of ['ada@example.com', '45000', 'budget', 'approx_cost', 'price_per_night', 'members']) {
    assert.ok(!serialized.includes(leaked), `listing leaked ${leaked}`);
  }
});

/* -------------------------------------------------------------------------- */
/*  Public trip page                                                           */
/* -------------------------------------------------------------------------- */

test('an invalid id is a 404 without touching Mongo', async () => {
  reset();
  await assert.rejects(() => loadGalleryTrip('not-an-id'), /Trip not found/);
  assert.equal(tripQuery, null);
});

test('the trip page queries only live public rows', async () => {
  reset();
  await loadGalleryTrip(TRIP_1);

  assert.equal(tripQuery._id, TRIP_1);
  // G5: the page and the join-request path share `publicTripClauses()`, so the
  // eligibility rule lives in exactly one place and arrives here as `$and`.
  const clauses = tripQuery.$and as any[];
  assert.ok(Array.isArray(clauses), 'the shared public clauses must be applied');
  assert.ok(clauses.some((clause) => clause.visibility === 'public'));
  assert.ok(clauses.some((clause) => clause.isDeleted?.$ne === true));
  assert.ok(clauses.some((clause) => clause.workspace?.$ne === 'agency'));
  assert.ok(clauses.some((clause) => clause.publishedAt?.$ne === null));
  assert.ok(clauses.some((clause) => Array.isArray(clause.$or)));
});

test('an unpublished, expired or deleted trip is a 404', async () => {
  reset();
  findOneResult = null;

  await assert.rejects(() => loadGalleryTrip(TRIP_1), /Trip not found/);
});

test('a publisher who lost their handle takes the page down', async () => {
  reset();
  currentUsers = [publisher(USER_A, { profile: {} })];

  await assert.rejects(() => loadGalleryTrip(TRIP_1), /Trip not found/);
});

test('the trip page carries the sanitized itinerary and routes', async () => {
  reset();
  const detail = await loadGalleryTrip(TRIP_1);

  assert.equal(detail.title, 'Himalaya Week');
  assert.equal(detail.itinerary.duration_days, 6);
  assert.deepEqual(detail.itinerary.day_by_day_itinerary[0].activities, [
    { name: 'Cafe hopping', coordinates: [32.2, 77.1] },
  ]);
  assert.deepEqual(detail.itinerary.day_by_day_itinerary[0].stay_recommendations, [
    { name: 'Cottage' },
  ]);
  assert.equal(detail.customRoutes.length, 1);

  const serialized = JSON.stringify(detail);
  for (const leaked of [
    'ada@example.com',
    '45000',
    'budget',
    'approx_cost',
    'price_per_night',
    'members',
    'shareId',
  ]) {
    assert.ok(!serialized.includes(leaked), `trip page leaked ${leaked}`);
  }
});

test('two publishers in one page resolve against their own owner', async () => {
  reset();
  currentRows = [
    trip(),
    trip({ _id: TRIP_2, members: [{ userId: USER_B, role: 'owner' }] }),
  ];
  currentUsers = [
    publisher(),
    publisher(USER_B, { name: 'Grace', profile: { handle: 'grace' }, avatarUrl: undefined }),
  ];

  const page = await listGalleryTrips({ limit: 12 });

  assert.equal(page.trips.length, 2);
  assert.equal(page.trips[0].publisher.handle, 'ada');
  assert.equal(page.trips[1].publisher.handle, 'grace');
  assert.equal(page.trips[1].publisher.avatarUrl, undefined);
});
