import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RoutingDayInput,
  analyzeWeatherRouting,
  buildDayFlags,
  buildRiskyLegs,
  buildSuggestions,
  candidatePoints,
  dayExposureKm,
  pickTravelReason,
  swapDayPlans,
} from './weatherRouting.js';
import type { LatLng } from './distance.js';

// ~11 km apart along latitude
const A: LatLng = [11.5, 76.0];
const B: LatLng = [11.6, 76.0];
const C: LatLng = [11.7, 76.0];

const RAIN = ['Heavy rain expected (~26 mm) — hill roads turn slippery and landslide-prone.'];

test('candidatePoints drops malformed coordinates', () => {
  const day: RoutingDayInput = {
    day: 1,
    riskLevel: 'high',
    points: [A, [0, 0], [999, 999] as LatLng, undefined as unknown as LatLng, B],
  };
  assert.deepEqual(candidatePoints(day), [A, B]);
  assert.deepEqual(candidatePoints({ day: 1, riskLevel: 'none' }), []);
});

test('dayExposureKm prefers a supplied total and otherwise measures the path', () => {
  const closeTo = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 0.01, `${actual} should be within 0.01 of ${expected}`);

  closeTo(dayExposureKm({ day: 1, riskLevel: 'none', points: [A, B] }), pathOf(A, B));
  assert.equal(dayExposureKm({ day: 1, riskLevel: 'none', points: [A, B], totalKm: 42 }), 42);
  // A zero/negative total is ignored in favour of the measured path
  closeTo(dayExposureKm({ day: 1, riskLevel: 'none', points: [A, B], totalKm: 0 }), pathOf(A, B));
  assert.equal(dayExposureKm({ day: 1, riskLevel: 'none' }), 0);
});

/** Local helper: the same haversine path length the service computes. */
function pathOf(from: LatLng, to: LatLng): number {
  const R = 6371.0088;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to[0] - from[0]);
  const dLng = toRad(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

test('pickTravelReason prefers road/landslide advisories', () => {
  assert.equal(pickTravelReason(RAIN), RAIN[0]);
  assert.equal(
    pickTravelReason(['Very hot day ahead (~41°C).', 'Boat rides may be suspended due to strong winds.']),
    'Boat rides may be suspended due to strong winds.'
  );
  assert.match(pickTravelReason([]), /rain on a moving day/i);
  assert.match(pickTravelReason(undefined), /rain on a moving day/i);
});

test('buildRiskyLegs flags every leg on a risky day only', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B, C] },
    { day: 2, riskLevel: 'high', points: [A, B, C], advisories: RAIN },
    { day: 3, riskLevel: 'moderate', points: [A], advisories: RAIN },
  ];

  const legs = buildRiskyLegs(days);
  // Two legs on Day 2, none on the clear day or the single-point day
  assert.equal(legs.length, 2);
  assert.deepEqual(
    legs.map((leg) => [leg.day, leg.fromIndex, leg.toIndex]),
    [
      [2, 0, 1],
      [2, 1, 2],
    ]
  );
  assert.equal(legs[0].riskLevel, 'high');
  assert.ok(legs[0].km > 10 && legs[0].km < 12);
  assert.ok(legs[0].minutes > 0);
  assert.equal(legs[0].reason, RAIN[0]);
});

test('buildDayFlags summarises exposure and risky legs per day', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B] },
    { day: 2, riskLevel: 'high', points: [A, B, C] },
  ];
  const flags = buildDayFlags(days, buildRiskyLegs(days));

  assert.equal(flags.length, 2);
  assert.equal(flags[0].weatherSafe, true);
  assert.equal(flags[0].riskyLegCount, 0);
  assert.equal(flags[1].weatherSafe, false);
  assert.equal(flags[1].riskyLegCount, 2);
  assert.ok(flags[1].travelExposureKm > flags[0].travelExposureKm);
});

test('buildSuggestions proposes moving a rainy travel day to a dry one', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B], activityCount: 3 },
    { day: 2, riskLevel: 'high', points: [A, B, C], advisories: RAIN, activityCount: 3 },
  ];

  const suggestions = buildSuggestions(days, buildRiskyLegs(days));
  const swap = suggestions.find((item) => item.type === 'swap_days');

  assert.ok(swap, 'a day swap should be suggested');
  assert.equal(swap!.day, 2);
  assert.equal(swap!.withDay, 1);
  assert.equal(swap!.severity, 'high');
  assert.deepEqual(swap!.action, { kind: 'swap_days', fromDay: 2, toDay: 1 });
  assert.match(swap!.detail, /dry/i);

  // A high-risk day also gets an indoor rebuild suggestion
  const indoor = suggestions.find((item) => item.type === 'indoor_swap');
  assert.ok(indoor);
  assert.deepEqual(indoor!.action, { kind: 'indoor_swap', day: 2 });

  // ...and a travel buffer, because Day 2 involves real distance
  const buffer = suggestions.find((item) => item.type === 'buffer_time');
  assert.ok(buffer);
  assert.match(buffer!.title, /Add ~\d+ min of travel buffer/);
  assert.equal(buffer!.action, undefined);
});

test('buildSuggestions leaves a clear trip alone', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B] },
    { day: 2, riskLevel: 'low', points: [B, C] },
  ];
  assert.deepEqual(buildSuggestions(days, buildRiskyLegs(days)), []);
});

test('buildSuggestions does not suggest a swap when every day is risky', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'high', points: [A, B], advisories: RAIN },
    { day: 2, riskLevel: 'moderate', points: [B, C], advisories: RAIN },
  ];
  const suggestions = buildSuggestions(days, buildRiskyLegs(days));

  assert.equal(suggestions.some((item) => item.type === 'swap_days'), false);
  // Buffer advice is still useful
  assert.equal(suggestions.some((item) => item.type === 'buffer_time'), true);
});

test('buildSuggestions never swaps two rainy days and never reuses a dry day', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'high', points: [A, B], advisories: RAIN, activityCount: 2 },
    { day: 2, riskLevel: 'high', points: [A, B], advisories: RAIN, activityCount: 2 },
    { day: 3, riskLevel: 'none', points: [A, B], activityCount: 2 },
  ];

  const swaps = buildSuggestions(days, buildRiskyLegs(days)).filter(
    (item) => item.type === 'swap_days'
  );
  assert.equal(swaps.length, 1, 'only one rainy day can claim the single dry day');
  assert.equal(swaps[0].withDay, 3);
});

test('buildSuggestions ignores risky days with no real travel', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B] },
    // Rainy but everything is within a few metres — nothing worth reshuffling
    { day: 2, riskLevel: 'high', points: [A, [11.50001, 76.00001]], advisories: RAIN, activityCount: 2 },
  ];

  const suggestions = buildSuggestions(days, buildRiskyLegs(days));
  assert.equal(suggestions.some((item) => item.type === 'swap_days'), false);
});

test('buildSuggestions caps the list so the UI stays readable', () => {
  const days: RoutingDayInput[] = Array.from({ length: 6 }, (_, index) => ({
    day: index + 1,
    riskLevel: 'high' as const,
    points: [A, B, C],
    advisories: RAIN,
    activityCount: 3,
  }));

  const suggestions = buildSuggestions(days, buildRiskyLegs(days));
  assert.ok(suggestions.length <= 4);
});

test('analyzeWeatherRouting assembles flags, legs, suggestions and summary', () => {
  const days: RoutingDayInput[] = [
    { day: 1, riskLevel: 'none', points: [A, B], activityCount: 3 },
    { day: 2, riskLevel: 'moderate', points: [A, B, C], advisories: RAIN, activityCount: 4 },
    { day: 3, riskLevel: 'high', points: [A, B], advisories: RAIN, activityCount: 2 },
  ];

  const analysis = analyzeWeatherRouting(days);

  assert.equal(analysis.dayFlags.length, 3);
  assert.equal(analysis.summary.riskyDayCount, 2);
  assert.equal(analysis.summary.worstRiskLevel, 'high');
  assert.equal(analysis.summary.worstDay, 3);
  assert.ok(analysis.summary.totalRiskyLegs > 0);
  assert.ok(analysis.summary.exposureKm > 0);
  assert.match(analysis.summary.headline, /2 days carry weather risk/);
});

test('analyzeWeatherRouting reports a clean trip clearly', () => {
  const analysis = analyzeWeatherRouting([
    { day: 1, riskLevel: 'none', points: [A, B] },
    { day: 2, riskLevel: 'low', points: [B, C] },
  ]);

  assert.equal(analysis.summary.riskyDayCount, 0);
  assert.equal(analysis.summary.worstDay, null);
  assert.equal(analysis.summary.worstRiskLevel, 'low');
  assert.equal(analysis.riskyLegs.length, 0);
  assert.match(analysis.summary.headline, /No weather conflicts/);
});

test('analyzeWeatherRouting is robust to empty/malformed input', () => {
  for (const input of [[], null as unknown as RoutingDayInput[]]) {
    const analysis = analyzeWeatherRouting(input);
    assert.deepEqual(analysis.dayFlags, []);
    assert.deepEqual(analysis.riskyLegs, []);
    assert.deepEqual(analysis.suggestions, []);
    assert.equal(analysis.summary.worstDay, null);
  }

  // A day without a usable number is skipped rather than crashing
  const analysis = analyzeWeatherRouting([
    { day: Number.NaN, riskLevel: 'high', points: [A, B] },
    { day: 1, riskLevel: 'none', points: [A, B] },
  ]);
  assert.equal(analysis.dayFlags.length, 1);
  assert.equal(analysis.dayFlags[0].day, 1);
});

test('swapDayPlans exchanges two days and keeps numbering contiguous', () => {
  const days = [
    { day: 1, title: 'Beach' },
    { day: 2, title: 'Trek' },
    { day: 3, title: 'Museum' },
  ];

  const swapped = swapDayPlans(days, 1, 2);
  assert.deepEqual(
    swapped.map((day) => [day.day, day.title]),
    [
      [1, 'Trek'],
      [2, 'Beach'],
      [3, 'Museum'],
    ]
  );

  // Non-adjacent swap, and the original array is untouched
  const far = swapDayPlans(days, 1, 3);
  assert.deepEqual(
    far.map((day) => day.title),
    ['Museum', 'Trek', 'Beach']
  );
  assert.deepEqual(
    days.map((day) => day.title),
    ['Beach', 'Trek', 'Museum']
  );

  // Unknown day numbers are a no-op
  assert.deepEqual(swapDayPlans(days, 1, 9), days);
  assert.deepEqual(swapDayPlans(days, 2, 2), days);
});
