import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityTime,
  activityTimeLabel,
  buildTripMapModel,
  hasCoordinates,
} from './itineraryTruth';
import type { ItineraryData } from '@/types/trip';

type DayPlan = ItineraryData['day_by_day_itinerary'][number];

const day = (overrides: Partial<DayPlan> & Pick<DayPlan, 'day'>): DayPlan => ({
  title: `Day ${overrides.day}`,
  activities: [],
  stay_recommendations: [],
  transport: [],
  food_spots: [],
  pro_tip: [],
  permit_required: false,
  ...overrides,
});

/**
 * C-04 fixtures: a generated plan is allowed to be incomplete. The map and
 * timeline must show the gaps instead of filling them with plausible-looking
 * coordinates or times of day.
 */

test('a trip with no coordinates and no times renders no pins and no schedule claims', () => {
  const model = buildTripMapModel([
    day({
      day: 1,
      activities: [
        { title: 'Walk the old town' },
        { title: 'Sunset viewpoint' },
      ],
      stay_recommendations: [{ name: 'Riverside homestay' }],
    }),
  ]);

  assert.equal(model.pins.length, 0);
  assert.equal(model.unmapped.length, 3);
  assert.deepEqual(
    model.unmapped.map((item) => [item.type, item.title]),
    [
      ['activity', 'Walk the old town'],
      ['activity', 'Sunset viewpoint'],
      ['stay', 'Riverside homestay'],
    ]
  );

  assert.equal(activityTimeLabel({ title: 'Walk the old town' }, 0), 'Stop 1');
  assert.equal(activityTimeLabel({ title: 'Sunset viewpoint' }, 1), 'Stop 2');
  assert.equal(activityTime({ title: 'Walk the old town' }), null);
});

test('only stored, in-range coordinates become pins', () => {
  const model = buildTripMapModel([
    day({
      day: 2,
      activities: [
        { title: 'Mapped', coordinates: [15.2993, 74.124] },
        { title: 'Invalid latitude', coordinates: [120, 74.124] },
        { title: 'Null island', coordinates: [0, 0] },
        { title: 'Missing pair' },
      ],
      stay_recommendations: [
        { name: 'Mapped stay', coordinates: [15.31, 74.13] },
        { name: 'Unmapped stay' },
      ],
    }),
  ]);

  assert.equal(model.pins.length, 2);
  assert.deepEqual(
    model.pins.map((pin) => pin.title),
    ['Mapped', 'Mapped stay']
  );
  assert.deepEqual(model.pins[0].coords, [15.2993, 74.124]);

  assert.deepEqual(
    model.unmapped.map((item) => item.title),
    ['Invalid latitude', 'Null island', 'Missing pair', 'Unmapped stay']
  );
});

test('a stay without coordinates is never given a synthesized location', () => {
  const model = buildTripMapModel([
    day({
      day: 3,
      stay_recommendations: [{ name: 'Cliffside guesthouse', location: 'North ridge' }],
    }),
  ]);

  assert.equal(model.pins.length, 0);
  assert.equal(model.unmapped.length, 1);
  assert.equal(model.unmapped[0].type, 'stay');
  assert.equal(model.unmapped[0].title, 'Cliffside guesthouse');
  assert.equal(model.unmapped[0].location, 'North ridge');
});

test('reordering activities cannot change the time each one carries', () => {
  const morning = { title: 'Temple visit', time: '08:30 AM' };
  const evening = { title: 'Night market', time: '7:00 PM' };

  const before = [
    activityTimeLabel(morning, 0),
    activityTimeLabel(evening, 1),
  ];
  const after = [
    activityTimeLabel(evening, 0),
    activityTimeLabel(morning, 1),
  ];

  assert.deepEqual(before, ['08:30 AM', '7:00 PM']);
  assert.deepEqual(after, ['7:00 PM', '08:30 AM']);
  // The fallback label is bound to the new order, but a stored time is not.
  assert.equal(activityTimeLabel({ title: 'Untimed' }, 2), 'Stop 3');
});

test('blank or whitespace-only times fall back to the stop order', () => {
  assert.equal(activityTime({ title: 'Blank', time: '   ' }), null);
  assert.equal(activityTimeLabel({ title: 'Blank', time: '   ' }, 0), 'Stop 1');
});

test('activity and stay strings are surfaced instead of silently dropped', () => {
  const model = buildTripMapModel([
    day({
      day: 4,
      activities: ['Local market walk'],
      stay_recommendations: ['Family-run guesthouse'],
    }),
  ]);

  assert.equal(model.pins.length, 0);
  assert.deepEqual(
    model.unmapped.map((item) => item.title),
    ['Local market walk', 'Family-run guesthouse']
  );
});

test('hasCoordinates rejects malformed values and accepts a valid pair', () => {
  assert.equal(hasCoordinates([15.2993, 74.124]), true);
  assert.equal(hasCoordinates([0, 0]), false);
  assert.equal(hasCoordinates([91, 0]), false);
  assert.equal(hasCoordinates(['15.2993', '74.124'] as unknown), true);
  assert.equal(hasCoordinates([Number.NaN, 74.124]), false);
  assert.equal(hasCoordinates('15.2993,74.124'), false);
  assert.equal(hasCoordinates(null), false);
});
