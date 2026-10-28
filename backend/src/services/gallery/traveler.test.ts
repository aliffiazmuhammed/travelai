import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { loadTravelerProfile } from './traveler.js';

/**
 * Milestone 8 G2 — public traveler pages. The projection is pinned in
 * `projection.test.ts`; these tests pin the lookup rules that decide which
 * account and which trips may appear at all.
 */

let userQuery: Record<string, any> | null = null;
let tripQuery: Record<string, any> | null = null;
let currentUser: any = null;
let currentTrips: any[] = [];

const originalUserFindOne = User.findOne;
const originalTripFind = Trip.find;

(User as any).findOne = (filter: Record<string, any>) => {
  userQuery = filter;
  return { select: () => ({ lean: async () => currentUser }) };
};

(Trip as any).find = (filter: Record<string, any>) => {
  tripQuery = filter;
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => currentTrips,
  };
  return chain;
};

test.after(() => {
  (User as any).findOne = originalUserFindOne;
  (Trip as any).find = originalTripFind;
});

function traveler(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'u1',
    name: 'Ada',
    avatarUrl: 'https://cdn.example.com/a.jpg',
    profile: { handle: 'ada', bio: 'Slow traveler' },
    email: 'ada@example.com',
    ...overrides,
  };
}

function trip(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 't1',
    title: 'Himalaya Week',
    startDate: new Date('2026-11-10T00:00:00.000Z'),
    endDate: new Date('2026-11-15T00:00:00.000Z'),
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    gallery: { hideExactDates: false, summary: 'Six days in the hills', tags: ['hills'] },
    generationMeta: { request: { destination: 'Manali' } },
    tripDetails: {
      trip_title: 'Himalaya Week',
      duration_days: 6,
      season: 'winter',
      group_type: 'friends',
      highlights: ['Old Manali'],
      budget_per_person: 45000,
      budget_breakdown: { total: 45000 },
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive',
          activities: [{ name: 'Cafe hopping', approx_cost: 1200 }],
          stay_recommendations: [{ name: 'Cottage', price_per_night: 3500 }],
          food_spots: ['Johnson Cafe'],
        },
      ],
    },
    members: [{ userId: 'u1', role: 'owner' }],
    email: 'ada@example.com',
    ...overrides,
  };
}

function reset(): void {
  userQuery = null;
  tripQuery = null;
  currentUser = traveler();
  currentTrips = [trip()];
}

test('an unknown handle is a 404 and never queries trips', async () => {
  reset();
  currentUser = null;

  await assert.rejects(() => loadTravelerProfile('nobody'), /Traveler not found/);
  assert.equal(tripQuery, null);
});

test('only active personal accounts with that handle resolve', async () => {
  reset();
  await loadTravelerProfile(' @ADA ');

  assert.deepEqual(userQuery, {
    accountType: 'personal',
    status: 'active',
    'profile.handle': 'ada',
  });
});

test('the trip query reuses the shared public clauses and scopes to owned rows', async () => {
  reset();
  await loadTravelerProfile('ada');

  // G6: the profile page shares `publicTripClauses()`, so a hidden trip leaves
  // the traveler page at the same time it leaves the gallery listing.
  const scopes = tripQuery?.$and as Array<Record<string, any>>;
  assert.ok(Array.isArray(scopes), 'the shared public clauses must be applied');
  assert.ok(scopes.some((clause) => clause.visibility === 'public'));
  assert.ok(scopes.some((clause) => clause.isDeleted?.$ne === true));
  assert.ok(scopes.some((clause) => clause.workspace?.$ne === 'agency'));
  assert.ok(scopes.some((clause) => clause.publishedAt?.$ne === null));
  assert.ok(scopes.some((clause) => clause['moderation.hiddenAt'] === null));

  assert.deepEqual(scopes[scopes.length - 1], {
    members: { $elemMatch: { userId: 'u1', role: 'owner' } },
  });

  const upcoming = scopes.find((clause) => Array.isArray(clause.$or));
  assert.equal(
    upcoming,
    undefined,
    'a profile keeps published trips after they end, so no date window applies'
  );
});

test('the profile carries identity and card summaries only', async () => {
  reset();
  const profile = await loadTravelerProfile('ada');

  assert.equal(profile.handle, 'ada');
  assert.equal(profile.name, 'Ada');
  assert.equal(profile.bio, 'Slow traveler');
  assert.equal(profile.avatarUrl, 'https://cdn.example.com/a.jpg');
  assert.equal(profile.trips.length, 1);
  assert.equal(profile.trips[0].title, 'Himalaya Week');
  assert.equal(profile.trips[0].destination, 'Manali');
  assert.deepEqual(profile.trips[0].dates, {
    exact: true,
    startDate: '2026-11-10',
    endDate: '2026-11-15',
    label: 'Nov 2026 · 6 days',
  });

  const serialized = JSON.stringify(profile);
  for (const leaked of ['ada@example.com', 'budget', '45000', 'approx_cost', 'members']) {
    assert.ok(!serialized.includes(leaked), `payload leaked ${leaked}`);
  }
});

test('hidden dates never carry the concrete window', async () => {
  reset();
  currentTrips = [
    trip({ gallery: { hideExactDates: true, summary: 'Hills', tags: [] } }),
  ];

  const profile = await loadTravelerProfile('ada');
  const dates = profile.trips[0].dates;

  assert.deepEqual(dates, { exact: false, label: 'Nov 2026 · 6 days' });
  const serialized = JSON.stringify(profile);
  assert.ok(!serialized.includes('2026-11-10'));
  assert.ok(!serialized.includes('2026-11-15'));
});

test('a date-less published trip reads as flexible instead of disappearing', async () => {
  reset();
  currentTrips = [
    trip({
      startDate: undefined,
      endDate: undefined,
      gallery: { hideExactDates: false, summary: '', tags: [] },
    }),
  ];

  const profile = await loadTravelerProfile('ada');
  assert.deepEqual(profile.trips[0].dates, { exact: false, label: 'Dates flexible' });
});

test('an account with no published trips still has a public profile', async () => {
  reset();
  currentTrips = [];

  const profile = await loadTravelerProfile('ada');
  assert.deepEqual(profile.trips, []);
  assert.equal(profile.handle, 'ada');
});
