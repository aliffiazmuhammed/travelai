import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreItinerary } from './quality.js';

function goodItinerary() {
  return {
    trip_title: 'Wayanad Adventure',
    duration_days: 2,
    budget_per_person: 20000,
    highlights: ['Chembra Peak', 'Edakkal Caves'],
    weather_advisory: {
      expected_weather: 'Pleasant',
      packing_tips: ['Jacket'],
      risks: ['None'],
      seasonal_highlights: ['Waterfalls'],
    },
    day_by_day_itinerary: [
      {
        day: 1,
        title: 'Day 1: Arrival',
        activities: [
          {
            title: 'Trek to Chembra Peak',
            time: 'Morning',
            description: 'A scenic trek to the heart-shaped lake with guided support.',
            location_name: 'Chembra',
            approx_cost: 500,
            coordinates: [11.5516, 76.0874],
          },
          {
            title: 'Visit Edakkal Caves',
            time: 'Afternoon',
            description: 'Explore ancient rock carvings with a local historian.',
            location_name: 'Edakkal',
            approx_cost: 300,
            coordinates: [11.6224, 76.2351],
          },
          {
            title: 'Sunset at Pookode Lake',
            time: 'Evening',
            description: 'Boating and a quiet lakeside walk at dusk.',
            location_name: 'Pookode',
            approx_cost: 200,
            coordinates: [11.5236, 76.0453],
          },
        ],
      },
      {
        day: 2,
        title: 'Day 2: Departure',
        activities: [
          {
            title: 'Soochipara Falls',
            time: 'Morning',
            description: 'Swim at the three-tiered waterfall with a short forest walk.',
            location_name: 'Soochipara',
            approx_cost: 100,
            coordinates: [11.4749, 76.2236],
          },
          {
            title: 'Tea Estate Tour',
            time: 'Afternoon',
            description: 'Guided tour of a working tea plantation with tasting.',
            location_name: 'Meppadi',
            approx_cost: 250,
            coordinates: [11.5512, 76.1389],
          },
        ],
      },
    ],
    budget_breakdown: {
      accommodation: 8000,
      food_and_drinks: 4000,
      activities_and_entry: 3000,
      local_transport: 3000,
      miscellaneous_buffer: 2000,
      total: 20000,
    },
  };
}

test('scoreItinerary rates a complete itinerary highly', () => {
  const report = scoreItinerary(goodItinerary(), { expectedDays: 2 });
  assert.ok(report.score >= 85, `expected high score, got ${report.score}`);
  assert.equal(report.grade, 'excellent');
  assert.equal(report.issues.filter((i) => i.severity === 'error').length, 0);
});

test('scoreItinerary returns a poor score for empty input', () => {
  const report = scoreItinerary(null);
  assert.equal(report.score, 0);
  assert.equal(report.grade, 'poor');
  assert.ok(report.issues.some((i) => i.code === 'empty'));
});

test('scoreItinerary flags a day-count mismatch', () => {
  const report = scoreItinerary(goodItinerary(), { expectedDays: 5 });
  assert.ok(report.issues.some((i) => i.code === 'day_count_mismatch'));
  assert.ok(report.breakdown.consistency < 100);
});

test('scoreItinerary detects a budget mismatch', () => {
  const itin = goodItinerary();
  itin.budget_breakdown.total = 50000;
  const report = scoreItinerary(itin, { expectedDays: 2 });
  assert.ok(report.issues.some((i) => i.code === 'budget_mismatch'));
});

test('scoreItinerary flags vague activities and invalid coordinates', () => {
  const itin = goodItinerary();
  itin.day_by_day_itinerary[0].activities = [
    {
      title: 'Explore nearby',
      time: 'Any',
      description: 'Just explore nearby and eat somewhere.',
      coordinates: [0, 0],
    },
    {
      title: 'Free time',
      time: 'Any',
      description: 'Free time to relax.',
      coordinates: [999, 999],
    },
  ];
  const report = scoreItinerary(itin, { expectedDays: 2 });
  assert.ok(report.issues.some((i) => i.code === 'vague_activities'));
  assert.ok(report.issues.some((i) => i.code === 'missing_coordinates'));
});

test('scoreItinerary reports missing required sections', () => {
  const report = scoreItinerary({ trip_title: 'X' });
  assert.ok(report.issues.some((i) => i.code === 'missing_keys'));
  assert.ok(report.issues.some((i) => i.code === 'no_days'));
});
