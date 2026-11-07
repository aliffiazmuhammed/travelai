import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import {
  buildExploreFilter,
  listGalleryTrips,
  loadGalleryTrip,
  publicTripClauses,
} from './explore.js';

/**
 * Milestone 8 G3 — the public gallery listing and trip page.
 *
 * `projection.test.ts` already pins *what* a public payload may contain. These
 * tests pin *which* rows may appear at all (published, personal, live/past,
 * not deleted), how the filters and the two tab orderings are built, and that
 * both read paths leave through the projection.
 */

const USER_A = '64b0000000000000000000a1';
const USER_B = '64b0000000000000000000b2';
const TRIP_1 = '64b000000000000000000101';
const TRIP_2 = '64b000000000000000000102';

let tripQuery: any = null;
let countQuery: any = null;
let lastPipeline: any[] | null = null;
let currentRows: any[] = [];
let currentTotal = 0;
let currentUsers: any[] = [];
let findOneResult: any = null;

const originals = {
  find: Trip.find,
  findOne: Trip.findOne,
  countDocuments: Trip.countDocuments,
  aggregate: Trip.aggregate,
  userFind: User.find,
};

(Trip as any).find = (filter: any) => {
  tripQuery = filter;
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => currentRows,
  };
  return chain;
};

(Trip as any).aggregate = async (pipeline: any[]) => {
  lastPipeline = pipeline;
  tripQuery = pipeline[0]?.$match ?? null;
  return currentRows;
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
  (Trip as any).aggregate = originals.aggregate;
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
  lastPipeline = null;
  currentRows = [];
  currentTotal = 0;
  currentUsers = [publisher()];
  findOneResult = trip();
}

function pipelineStage(name: string): any {
  return lastPipeline?.find((stage) => Object.prototype.hasOwnProperty.call(stage, name)) ?? null;
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

test('includePast drops only the date window', () => {
  const clauses = publicTripClauses({ includePast: true });

  assert.equal(
    clauses.some((clause: any) => Array.isArray(clause.$or)),
    false,
    'a past trip stays visible on profiles and direct links'
  );
  assert.ok(clauses.some((clause: any) => clause.visibility === 'public'));
  assert.ok(clauses.some((clause: any) => clause['moderation.hiddenAt'] === null));
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

test('the past tab keeps finished trips only and drops the live window', () => {
  const filter = buildExploreFilter({ when: 'past' });
  const flat = clauses(filter);

  assert.equal(
    flat.some((clause) => Array.isArray(clause.$or) && clause.$or[0]?.startDate?.$gte),
    false,
    'the live window must not survive on the past tab'
  );
  const past = flat.find((clause) => clause.startDate?.$lt instanceof Date);
  assert.ok(past, 'past rows must start before today');
  assert.equal(past.startDate.$lt.getUTCHours(), 0);
});

/* -------------------------------------------------------------------------- */
/*  Ordering and paging                                                        */
/* -------------------------------------------------------------------------- */

test('the live listing leads with the soonest departure', async () => {
  reset();
  await listGalleryTrips({ limit: 12 });

  const added = pipelineStage('$addFields');
  assert.ok(added, 'the live sort needs a computed departure key');
  assert.deepEqual(added.$addFields.__sortStart, {
    $ifNull: ['$startDate', new Date('9999-12-31T00:00:00.000Z')],
  });
  assert.deepEqual(pipelineStage('$sort'), {
    $sort: { __sortStart: 1, publishedAt: -1, _id: -1 },
  });
});

test('the past listing leads with the most recent trip', async () => {
  reset();
  await listGalleryTrips({ when: 'past', limit: 12 });

  assert.equal(pipelineStage('$addFields'), null, 'past rows all have a start date');
  assert.deepEqual(pipelineStage('$sort'), {
    $sort: { startDate: -1, publishedAt: -1, _id: -1 },
  });
});

test('a page number becomes a skip and the page size becomes the limit', async () => {
  reset();
  currentRows = [trip(), trip({ _id: TRIP_2, publishedAt: new Date('2026-09-01T00:00:00.000Z') })];
  const page = await listGalleryTrips({ page: 3, limit: 6 });

  assert.deepEqual(pipelineStage('$skip'), { $skip: 12 });
  assert.deepEqual(pipelineStage('$limit'), { $limit: 7 });
  assert.equal(page.page, 3);
  assert.equal(page.pageSize, 6);
  assert.equal(page.trips.length, 2);
  assert.equal(page.hasMore, false);
});

/* -------------------------------------------------------------------------- */
/*  Listing                                                                    */
/* -------------------------------------------------------------------------- */

test('the listing fetches one extra row to detect another page', async () => {
  reset();
  currentRows = [trip(), trip({ _id: TRIP_2, publishedAt: new Date('2026-09-01T00:00:00.000Z') })];
  currentUsers = [publisher()];

  const page = await listGalleryTrips({ limit: 1 });

  assert.deepEqual(pipelineStage('$limit'), { $limit: 2 });
  assert.equal(page.trips.length, 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.page, 1);
});

test('the last page does not claim another page', async () => {
  reset();
  currentRows = [trip()];

  const page = await listGalleryTrips({ limit: 12 });

  assert.equal(page.trips.length, 1);
  assert.equal(page.hasMore, false);
});

test('total counts the whole filter, not just the page', async () => {
  reset();
  currentRows = [trip()];
  currentTotal = 37;

  const page = await listGalleryTrips({ q: 'hills', limit: 1, page: 3 });

  assert.equal(page.total, 37);
  assert.ok(orClauseStartingWith(tripQuery, 'title'), 'page query keeps the search');
  assert.ok(orClauseStartingWith(countQuery, 'title'), 'count keeps the search');
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

test('the trip page stays reachable after the trip ends', async () => {
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
  // A finished trip keeps its page: only the listing applies the date window.
  assert.ok(!clauses.some((clause) => Array.isArray(clause.$or)));
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
