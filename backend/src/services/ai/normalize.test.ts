import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFoodSpots, normalizeGeneratedItinerary } from './normalize.js';

test('normalizeFoodSpots keeps structured objects and trims their fields', () => {
  assert.deepEqual(
    normalizeFoodSpots([
      { name: '  Dinner at Artjuna Cafe, Anjuna  ', cuisine: ' Goan ', note: ' Ask for the thali. ' },
      { name: 'Fish thali stall', cuisine: '', note: '' },
    ]),
    [
      { name: 'Dinner at Artjuna Cafe, Anjuna', cuisine: 'Goan', note: 'Ask for the thali.' },
      { name: 'Fish thali stall' },
    ]
  );
});

test('normalizeFoodSpots reads note from description and drops nameless entries', () => {
  assert.deepEqual(
    normalizeFoodSpots([
      { name: 'Cafe Lilliput', description: 'Sunset seating on the beach.' },
      { name: '   ', note: 'orphan' },
      { cuisine: 'Goan' },
      null,
      42,
    ]),
    [{ name: 'Cafe Lilliput', note: 'Sunset seating on the beach.' }]
  );
});

test('normalizeFoodSpots keeps legacy strings untouched as a fallback', () => {
  assert.deepEqual(
    normalizeFoodSpots([
      'Lunch near Old Goa (Halal-friendly options: ask for vegetarian thalis).',
      '   ',
    ]),
    ['Lunch near Old Goa (Halal-friendly options: ask for vegetarian thalis).']
  );
});

test('normalizeFoodSpots tolerates a missing or malformed list', () => {
  assert.deepEqual(normalizeFoodSpots(undefined), []);
  assert.deepEqual(normalizeFoodSpots('Dinner at X'), []);
});

test('normalizeGeneratedItinerary only rewrites days that carry food_spots', () => {
  const input = {
    trip_title: 'Goa',
    day_by_day_itinerary: [
      { day: 1, food_spots: [{ name: ' Artjuna Cafe ', note: 'Goan breakfast.' }], activities: [] },
      { day: 2, food_spots: ['Local thali'], activities: [] },
      { day: 3, activities: [] },
      'not-a-day',
    ],
  };

  const output = normalizeGeneratedItinerary(input);

  assert.deepEqual(output.day_by_day_itinerary[0].food_spots, [
    { name: 'Artjuna Cafe', note: 'Goan breakfast.' },
  ]);
  assert.deepEqual(output.day_by_day_itinerary[1].food_spots, ['Local thali']);
  assert.equal(output.day_by_day_itinerary[2], input.day_by_day_itinerary[2]);
  assert.equal(output.day_by_day_itinerary[3], 'not-a-day');
  assert.equal(output.trip_title, 'Goa');
  // The parsed itinerary is replaced, never mutated in place.
  assert.deepEqual(input.day_by_day_itinerary[0].food_spots, [
    { name: ' Artjuna Cafe ', note: 'Goan breakfast.' },
  ]);
});

test('normalizeGeneratedItinerary passes through itineraries without days', () => {
  const input = { trip_title: 'Empty' };
  assert.equal(normalizeGeneratedItinerary(input), input);
});
