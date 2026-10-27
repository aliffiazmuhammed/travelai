import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGalleryDates,
  projectGalleryItinerary,
  projectGalleryTrip,
  projectGalleryTripSummary,
  projectPublisher,
  projectTravelerProfile,
} from './projection.js';

/**
 * Milestone 8 G1 — the gallery payload is an exact allow-list. These pins are
 * the review gate: a new public field must be added here (and reviewed for
 * privacy) before it can ship.
 */

const EXPECTED_TRIP_KEYS = [
  '_id',
  'title',
  'destination',
  'summary',
  'tags',
  'dates',
  'durationDays',
  'season',
  'groupType',
  'publisher',
  'publishedAt',
  'itinerary',
  'customRoutes',
];

const EXPECTED_SUMMARY_KEYS = [
  '_id',
  'title',
  'destination',
  'summary',
  'tags',
  'dates',
  'durationDays',
  'season',
  'groupType',
  'publisher',
  'publishedAt',
];

const EXPECTED_ITINERARY_KEYS = [
  'trip_title',
  'duration_days',
  'season',
  'group_type',
  'highlights',
  'weather_advisory',
  'day_by_day_itinerary',
  'local_transport',
  'footnotes_safety_tips',
];

const EXPECTED_DAY_KEYS = [
  'day',
  'title',
  'activities',
  'stay_recommendations',
  'transport',
  'food_spots',
  'pro_tip',
  'permit_required',
];

function publishedTrip(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    _id: 'trip1',
    title: 'Wayanad Wander',
    startDate: new Date('2026-11-10T00:00:00.000Z'),
    endDate: new Date('2026-11-15T00:00:00.000Z'),
    visibility: 'public',
    publishedAt: new Date('2026-10-20T10:00:00.000Z'),
    gallery: { hideExactDates: false, summary: 'Six slow days in the hills.', tags: ['hills', 'food'] },
    generationMeta: {
      request: { destination: 'Wayanad, Kerala', budget: 45000 },
      variant: 'A',
    },
    tripDetails: {
      trip_title: 'Wayanad Wander',
      duration_days: 6,
      budget_per_person: 18000,
      budget_breakdown: {
        accommodation: 9000,
        food_and_drinks: 3000,
        activities_and_entry: 2000,
        local_transport: 2000,
        miscellaneous_buffer: 2000,
        total: 18000,
      },
      season: 'winter',
      group_type: 'couple',
      highlights: ['Sunrise at Chembra', 'Coffee estate walk'],
      weather_advisory: {
        expected_weather: 'Cool mornings',
        packing_tips: ['Layer up'],
        risks: [],
        seasonal_highlights: ['Misty valleys'],
      },
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive and settle',
          activities: [
            {
              name: 'Chembra Peak trek',
              title: 'Chembra Peak trek',
              time: '06:00',
              description: 'A guided sunrise hike.',
              location: 'Meppadi',
              approx_cost: 1200,
              coordinates: [11.5333, 76.1167],
            },
            'Evening at the lake',
          ],
          stay_recommendations: [
            {
              name: 'Hilltop homestay',
              location: 'Meppadi',
              description: 'Two cottages above the valley.',
              vibe: 'quiet',
              price_per_night: 2400,
              coordinates: [11.53, 76.11],
            },
          ],
          transport: ['Private cab'],
          food_spots: ['Local thali'],
          pro_tip: ['Carry cash for permits'],
          permit_required: true,
        },
      ],
      local_transport: {
        walking: 'Walkable town core',
        auto_rickshaw: 'Meter-less, agree first',
        local_buses: 'Sparse',
        shared_cabs: 'Best for day trips',
        tips: ['Start early'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Remove shoes at temples'],
        safety: ['Leeches in monsoon'],
        payment: { upi: 'Widely accepted', cash: 'Carry some' },
        permits: { rohtang_pass_required: false, apply_online: 'Not needed' },
        connectivity: { wifi: 'Patchy', mobile_networks: 'Jio works' },
      },
    },
    customRoutes: [
      {
        name: 'Lake loop',
        day: 1,
        color: '#0ea5e9',
        mode: 'drive',
        points: [
          [11.53, 76.11],
          [11.54, 76.12],
        ],
        distanceKm: 12.5,
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

const PUBLISHER = { handle: 'ada', name: 'Ada', avatarUrl: 'https://cdn.test/ada.png' };

test('gallery trip exposes exactly the pinned top-level keys', () => {
  const projected = projectGalleryTrip(publishedTrip(), PUBLISHER);
  assert.deepEqual(Object.keys(projected).sort(), [...EXPECTED_TRIP_KEYS].sort());
});

test('gallery summary exposes exactly the card keys and stays a subset of the trip', () => {
  const summary = projectGalleryTripSummary(publishedTrip(), PUBLISHER);
  assert.deepEqual(Object.keys(summary).sort(), [...EXPECTED_SUMMARY_KEYS].sort());

  const trip = projectGalleryTrip(publishedTrip(), PUBLISHER);
  for (const key of Object.keys(summary)) {
    assert.equal(key in trip, true, `trip payload must also carry ${key}`);
  }
});

test('the itinerary allow-list drops every price-bearing field', () => {
  const projected = projectGalleryTrip(publishedTrip(), PUBLISHER);
  assert.deepEqual(
    Object.keys(projected.itinerary).sort(),
    [...EXPECTED_ITINERARY_KEYS].sort()
  );

  const day = projected.itinerary.day_by_day_itinerary[0];
  assert.deepEqual(Object.keys(day).sort(), [...EXPECTED_DAY_KEYS].sort());
  assert.deepEqual(Object.keys(day.activities[0]).sort(), [
    'coordinates',
    'description',
    'location',
    'name',
    'time',
  ]);
  assert.deepEqual(Object.keys(day.stay_recommendations[0]).sort(), [
    'coordinates',
    'description',
    'location',
    'name',
    'vibe',
  ]);

  const serialized = JSON.stringify(projected);
  for (const forbidden of [
    'budget_per_person',
    'budget_breakdown',
    'approx_cost',
    'price_per_night',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `payload must not carry ${forbidden}`);
  }

  assert.deepEqual(Object.keys(projected.customRoutes[0]).sort(), [
    'color',
    'day',
    'distanceKm',
    'mode',
    'name',
    'points',
  ]);
});

test('a maximal trip leaks no session, membership or money fields', () => {
  const maximal = publishedTrip({
    userId: 'owner1',
    shareId: 'deadbeefdeadbeef',
    isPublic: true,
    members: [{ userId: 'u1', role: 'owner', joinedAt: new Date() }],
    participants: [{ name: 'Ada', isMe: true }],
    expenses: [{ label: 'hotel', amount: 4200 }],
    finance: { baseCurrency: 'INR' },
    versions: [{ version: 1, tripDetails: {} }],
    feedback: { rating: 'up' },
    isDeleted: false,
    hasEdited: true,
  });

  const projected = projectGalleryTrip(maximal, PUBLISHER);
  const serialized = JSON.stringify(projected);

  for (const forbidden of [
    'userId',
    'shareId',
    'isPublic',
    'members',
    'participants',
    'expenses',
    'finance',
    'generationMeta',
    'versions',
    'feedback',
    'isDeleted',
    'hasEdited',
    'owner1',
    'deadbeefdeadbeef',
    '45000',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `payload must not carry ${forbidden}`);
  }
});

test('exact dates are published by default with a month + duration label', () => {
  const dates = buildGalleryDates(publishedTrip(), false);
  assert.deepEqual(dates, {
    exact: true,
    startDate: '2026-11-10',
    endDate: '2026-11-15',
    label: 'Nov 2026 · 6 days',
  });
});

test('hidden dates never carry a concrete date on the payload', () => {
  const trip = publishedTrip({ gallery: { hideExactDates: true } });
  const projected = projectGalleryTrip(trip, PUBLISHER);

  assert.deepEqual(projected.dates, { exact: false, label: 'Nov 2026 · 6 days' });
  assert.equal('startDate' in projected.dates, false);
  assert.equal('endDate' in projected.dates, false);
  assert.equal(JSON.stringify(projected).includes('2026-11-10'), false);
});

test('a trip without dates is "Dates flexible", never an exact empty window', () => {
  const dates = buildGalleryDates(
    { startDate: undefined, endDate: undefined, tripDetails: { duration_days: 4 } },
    false
  );
  assert.deepEqual(dates, { exact: false, label: 'Dates flexible' });
});

test('duration falls back to the day count, then to the date span', () => {
  const fromDays = buildGalleryDates(
    {
      startDate: new Date('2026-11-10T00:00:00.000Z'),
      tripDetails: {
        day_by_day_itinerary: [{ day: 1 }, { day: 2 }, { day: 3 }],
      },
    },
    true
  );
  assert.equal(fromDays.label, 'Nov 2026 · 3 days');

  const fromSpan = buildGalleryDates(
    {
      startDate: new Date('2026-11-10T00:00:00.000Z'),
      endDate: new Date('2026-11-12T00:00:00.000Z'),
      tripDetails: {},
    },
    true
  );
  assert.equal(fromSpan.label, 'Nov 2026 · 3 days');
});

test('publisher and traveler payloads never include an email', () => {
  const publisher = projectPublisher({
    name: 'Ada',
    avatarUrl: '/uploads/avatar-ada.png',
    profile: { handle: 'ada', bio: 'Slow travel' },
    email: 'ada@example.com',
  } as any);
  assert.deepEqual(publisher, {
    handle: 'ada',
    name: 'Ada',
    avatarUrl: '/uploads/avatar-ada.png',
  });

  const traveler = projectTravelerProfile(
    {
      name: 'Ada',
      profile: { handle: 'ada', bio: 'Slow travel' },
      email: 'ada@example.com',
    } as any,
    [publishedTrip()]
  );

  assert.deepEqual(Object.keys(traveler).sort(), ['bio', 'handle', 'name', 'trips']);
  assert.deepEqual(Object.keys(traveler.trips[0]).sort(), [...EXPECTED_SUMMARY_KEYS].sort());
  assert.equal(JSON.stringify(traveler).includes('ada@example.com'), false);
});

test('a nameless traveler falls back to the handle, never the email', () => {
  const traveler = projectTravelerProfile(
    { profile: { handle: 'kiran' }, email: 'kiran@example.com' } as any,
    []
  );
  assert.equal(traveler.name, 'kiran');
  assert.equal(JSON.stringify(traveler).includes('kiran@example.com'), false);
});

test('itinerary projection tolerates a draft with only a title', () => {
  const itinerary = projectGalleryItinerary({ trip_title: 'Early draft' });
  assert.equal(itinerary.trip_title, 'Early draft');
  assert.deepEqual(itinerary.day_by_day_itinerary, []);
  assert.deepEqual(itinerary.highlights, []);
});
