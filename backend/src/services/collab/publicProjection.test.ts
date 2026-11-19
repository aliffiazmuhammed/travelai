import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPublicTrip } from './publicTrip.js';

/**
 * F14 (E5) — the public share payload is an exact allow-list, not a filter
 * over the full document. Nobody "adds a field for convenience" here without
 * this test forcing the decision: a new key must be added to the expected list
 * (and reviewed), otherwise the contract fails at unit-test time.
 */
const EXPECTED_PUBLIC_KEYS = ['_id', 'title', 'status', 'tripDetails', 'customRoutes', 'createdAt'];

test('the public projection exposes exactly the allowed keys (F14 allow-list)', () => {
  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Wayanad Wander',
    status: 'planned',
    tripDetails: { trip_title: 'Wayanad Wander' },
    customRoutes: [{ name: 'route' }],
    createdAt: new Date(),
  });

  assert.deepEqual(Object.keys(projection).sort(), [...EXPECTED_PUBLIC_KEYS].sort());
});

test('the public projection leaks nothing sensitive (F14 exhaustive sweep)', () => {
  // A maximal trip — every key we might accidentally publish — goes in, and
  // only the allow-list comes out.
  const maximalTrip: Record<string, unknown> = {
    ...EXPECTED_PUBLIC_KEYS.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = key === 'customRoutes' ? [] : `allowed:${key}`;
      return acc;
    }, {}),
    // Session/payment/ownership fields that exist on real documents:
    shareId: 'deadbeefdeadbeef',
    isPublic: true,
    userId: 'ownerid',
    members: [{ userId: 'u', role: 'owner', joinedAt: new Date() }],
    participants: [{ name: 'someone', isMe: true }],
    expenses: [{ title: 'hotel', amount: 100 }],
    finance: { baseCurrency: 'INR' },
    generationMeta: { provider: 'x', costUsd: 0.42 },
    versions: [{ version: 1, tripDetails: {} }],
    feedback: { rating: 'up' },
    isDeleted: false,
    hasEdited: true,
  };

  const projection = projectPublicTrip(maximalTrip as any);
  for (const leaked of [
    'shareId',
    'isPublic',
    'userId',
    'members',
    'participants',
    'expenses',
    'finance',
    'generationMeta',
    'versions',
    'feedback',
    'isDeleted',
    'hasEdited',
  ]) {
    assert.equal(leaked in projection, false, `public payload must not carry ${leaked}`);
  }
});

test('public image references carry share-scoped URLs', () => {
  const mediaId = 'a'.repeat(24);
  const details = {
    day_by_day_itinerary: [
      {
        day: 1,
        image: { id: mediaId },
        activities: [{ title: 'Walk', image: { id: mediaId, alt: 'Trail' } }],
        stay_recommendations: [{ name: 'Homestay', image: { id: 'not-a-media-id' } }],
      },
    ],
  };

  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Wayanad Wander',
    status: 'planned',
    shareId: 'share-abc',
    tripDetails: details,
    createdAt: new Date(),
  }) as any;

  const expected = `/api/itinerary/shared/share-abc/media/${mediaId}/content`;
  const day = projection.tripDetails.day_by_day_itinerary[0];
  assert.equal(day.image.url, expected);
  assert.equal(day.activities[0].image.url, expected);
  assert.equal(day.activities[0].image.alt, 'Trail');
  // Unknown ids are left alone rather than turned into fetchable URLs.
  assert.deepEqual(day.stay_recommendations[0].image, { id: 'not-a-media-id' });
  // The stored itinerary is cloned, not mutated.
  assert.equal('url' in details.day_by_day_itinerary[0].image, false);
});

test('the public projection strips every budget field from tripDetails (C-02)', () => {
  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Wayanad Wander',
    status: 'planned',
    tripDetails: {
      trip_title: 'Wayanad Wander',
      duration_days: 3,
      budget_per_person: 18000,
      budget_breakdown: {
        accommodation: 6000,
        food_and_drinks: 4000,
        activities_and_entry: 3000,
        local_transport: 2000,
        miscellaneous_buffer: 3000,
        total: 18000,
      },
      day_by_day_itinerary: [{ day: 1, title: 'Arrive' }],
    },
    createdAt: new Date(),
  }) as any;

  assert.equal('budget_per_person' in projection.tripDetails, false);
  assert.equal('budget_breakdown' in projection.tripDetails, false);
  assert.equal(projection.tripDetails.trip_title, 'Wayanad Wander');
  assert.equal(projection.tripDetails.duration_days, 3);
  assert.equal(projection.tripDetails.day_by_day_itinerary[0].title, 'Arrive');
});

test('stripping budgets does not mutate the stored trip details', () => {
  const details = {
    trip_title: 'Wayanad Wander',
    budget_per_person: 18000,
    budget_breakdown: { total: 18000 },
  };
  projectPublicTrip({ _id: 'tripid', tripDetails: details, createdAt: new Date() });

  assert.equal(details.budget_per_person, 18000);
  assert.equal(details.budget_breakdown.total, 18000);
});

test('customRoutes defaults to an empty array (drafts drawn nothing yet)', () => {
  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Early Draft',
    status: 'draft',
    tripDetails: {},
    createdAt: new Date(),
  });
  assert.deepEqual(projection.customRoutes, []);
});
