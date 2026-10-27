import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import itineraryRouter from '../../routes/itinerary.routes.js';
import { AUTH_GUARD_TAG } from '../../middleware/auth.middleware.js';
import { tripCloneLimiter, TRIP_CLONE_DAILY_LIMIT } from '../../middleware/rateLimiter.middleware.js';
import { cloneGalleryTrip } from './clone.js';

/**
 * Milestone 8 G4 — clone a published trip.
 *
 * The source row below deliberately carries every private field a trip can
 * have (members, expenses, finance, generation metadata, a share id, activity
 * prices). The only thing the clone may inherit is what `projectGalleryTrip`
 * exposes, so these assertions are the privacy contract for the copy path.
 */

const SOURCE_ID = '64b000000000000000000201';
const OWNER_ID = '64b0000000000000000000a1';
const CLONER_ID = '64b0000000000000000000c3';

let sourceRow: any = null;
let currentUsers: any[] = [];
let saved: any[] = [];

const originalFindOne = Trip.findOne;
const originalUserFind = User.find;
const originalSave = Trip.prototype.save;

(Trip as any).findOne = (_filter: any) => ({
  select: () => ({ lean: async () => sourceRow }),
});

(User as any).find = (_filter: any) => {
  const chain: any = {
    select: () => chain,
    lean: async () => currentUsers,
  };
  return chain;
};

(Trip.prototype as any).save = async function (this: any) {
  saved.push(this);
  return this;
};

test.after(() => {
  (Trip as any).findOne = originalFindOne;
  (User as any).find = originalUserFind;
  (Trip.prototype as any).save = originalSave;
});

function publisher(): any {
  return {
    _id: OWNER_ID,
    name: 'Ada',
    profile: { handle: 'ada' },
  };
}

function publishedTrip(overrides: Record<string, unknown> = {}): any {
  return {
    _id: SOURCE_ID,
    title: 'Himalaya Week',
    startDate: new Date('2026-11-10T00:00:00.000Z'),
    endDate: new Date('2026-11-15T00:00:00.000Z'),
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    gallery: { hideExactDates: false, summary: 'Six days in the hills', tags: ['hills'] },
    generationMeta: { request: { destination: 'Manali' }, qualityScore: 91 },
    shareId: 'secret-share-id',
    members: [{ userId: OWNER_ID, role: 'owner' }],
    expenses: [{ label: 'Taxi', amount: 2000, currency: 'INR' }],
    participants: [{ name: 'Ada', isMe: true }],
    finance: { baseCurrency: 'INR', exchangeRates: { USD: 83 } },
    customRoutes: [
      {
        name: 'Old Manali loop',
        day: 2,
        color: '#0ea5e9',
        mode: 'drive',
        points: [
          [32.2, 77.1],
          [32.3, 77.2],
        ],
        distanceKm: 4,
      },
    ],
    tripDetails: {
      trip_title: 'Himalaya Week',
      duration_days: 6,
      season: 'winter',
      group_type: 'friends',
      highlights: ['Old Manali'],
      budget_per_person: 45000,
      budget_breakdown: { accommodation: 20000, total: 45000 },
      weather_advisory: {
        expected_weather: 'Cold',
        packing_tips: ['Layers'],
        risks: [],
        seasonal_highlights: [],
      },
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive',
          activities: [
            { name: 'Cafe hopping', approx_cost: 1200, coordinates: [32.2, 77.1] },
          ],
          stay_recommendations: [{ name: 'Cottage', price_per_night: 3500 }],
          food_spots: ['Johnson Cafe'],
          transport: [],
          pro_tip: [],
          permit_required: false,
        },
      ],
    },
    ...overrides,
  };
}

function reset(row: any | null): void {
  sourceRow = row;
  currentUsers = row ? [publisher()] : [];
  saved = [];
}

test('a public trip is cloned into a private draft owned by the caller', async () => {
  reset(publishedTrip());

  const doc = await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(saved.length, 1, 'exactly one new trip is written');
  assert.equal(String(doc.userId), CLONER_ID, 'the cloner owns the draft');
  assert.equal(doc.workspace, 'personal', 'a clone never enters an agency realm');
  assert.equal(doc.title, 'Himalaya Week');
  assert.equal(doc.status, 'draft');
  assert.equal(doc.visibility, 'private');
  assert.equal(doc.isPublic, false);
});

test('the clone records attribution to the original owner', async () => {
  reset(publishedTrip());

  const doc = await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(String(doc.clonedFrom.tripId), SOURCE_ID);
  assert.equal(doc.clonedFrom.ownerHandle, 'ada');
  assert.ok(doc.clonedFrom.clonedAt instanceof Date);
});

test('money, members and private metadata are never copied', async () => {
  reset(publishedTrip());

  const doc = await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(doc.tripDetails.budget_per_person, undefined);
  assert.equal(doc.tripDetails.budget_breakdown, undefined);
  const activity = doc.tripDetails.day_by_day_itinerary[0].activities[0];
  assert.equal(activity.approx_cost, undefined, 'activity prices are dropped');
  const stay = doc.tripDetails.day_by_day_itinerary[0].stay_recommendations[0];
  assert.equal(stay.price_per_night, undefined, 'stay prices are dropped');

  assert.deepEqual(doc.members, [], 'source members are not carried over');
  assert.deepEqual(doc.expenses, []);
  assert.deepEqual(doc.participants, []);
  assert.equal(doc.finance, undefined);
  assert.equal(doc.generationMeta, undefined);
  assert.equal(doc.shareId, undefined);
});

test('exact public dates are copied and the itinerary keeps its routes', async () => {
  reset(publishedTrip());

  const doc = await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(doc.startDate.toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(doc.endDate.toISOString(), '2026-11-15T00:00:00.000Z');
  assert.equal(doc.tripDetails.duration_days, 6);
  assert.equal(doc.customRoutes.length, 1);
  assert.equal(doc.customRoutes[0].name, 'Old Manali loop');
  assert.deepEqual(doc.customRoutes[0].points, [
    [32.2, 77.1],
    [32.3, 77.2],
  ]);
});

test('a hidden-date source clones without resurrecting the exact window', async () => {
  reset(
    publishedTrip({
      gallery: { hideExactDates: true, summary: 'Dates hidden', tags: [] },
    })
  );

  const doc = await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(doc.startDate, undefined);
  assert.equal(doc.endDate, undefined);
  assert.equal(doc.tripDetails.duration_days, 6, 'duration survives without dates');
});

test('the original document is left untouched', async () => {
  const row = publishedTrip();
  reset(row);

  await cloneGalleryTrip(SOURCE_ID, CLONER_ID);

  assert.equal(saved.length, 1);
  assert.equal(row.tripDetails.budget_per_person, 45000);
  assert.equal(row.tripDetails.day_by_day_itinerary[0].activities[0].approx_cost, 1200);
  assert.equal(row.members.length, 1);
  assert.equal(row.shareId, 'secret-share-id');
});

test('an unpublished, expired or agency source is a 404 and writes nothing', async () => {
  // `loadGalleryTrip` has already applied those filters when it returns null;
  // cloning maps the same answer so a stale link cannot be used as a copy API.
  reset(null);

  await assert.rejects(() => cloneGalleryTrip(SOURCE_ID, CLONER_ID), /Trip not found/);
  assert.equal(saved.length, 0);
});

test('a malformed source id is a 404 without a query', async () => {
  reset(null);

  await assert.rejects(() => cloneGalleryTrip('not-an-id', CLONER_ID), /Trip not found/);
  assert.equal(saved.length, 0);
});

test('POST /:id/clone is personal-guarded and carries the daily clone limiter', () => {
  const layers = itineraryRouter.stack.filter(
    (layer: any) => layer.route && String(layer.route.path) === '/:id/clone'
  );
  assert.equal(layers.length, 1, 'the clone route exists exactly once');

  const handlers = layers[0].route.stack.map((layer: any) => layer.handle);
  assert.ok(handlers.includes(tripCloneLimiter), 'clone must be rate-limited');
  assert.equal(TRIP_CLONE_DAILY_LIMIT, 10, 'the clone cap is 10/day/account');

  const guard = handlers.find((handler: any) => handler?.[AUTH_GUARD_TAG]);
  assert.ok(guard, 'clone must carry a realm guard');
  assert.equal(guard[AUTH_GUARD_TAG].realm, 'personal');
});
