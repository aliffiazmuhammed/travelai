import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineRoute, computeRoute } from './route.js';

const POINTS: [number, number][] = [
  [11.5, 76.0],
  [11.55, 76.08],
  [11.62, 76.23],
];

test('haversineRoute assembles legs and totals', () => {
  const result = haversineRoute(POINTS, 'drive');
  assert.equal(result.provider, 'haversine');
  assert.equal(result.legs.length, 2);
  assert.ok(result.totalKm > 0);
  assert.ok(result.totalMinutes >= 2);
});

test('haversineRoute handles fewer than two points gracefully', () => {
  const result = haversineRoute([[11.5, 76.0]], 'drive');
  assert.deepEqual(result.legs, []);
  assert.equal(result.totalKm, 0);
  assert.equal(result.totalMinutes, 0);
});

test('computeRoute defaults to the haversine provider', async () => {
  const previous = process.env.GEO_ROUTING_PROVIDER;
  delete process.env.GEO_ROUTING_PROVIDER;
  try {
    const result = await computeRoute(POINTS, 'drive');
    assert.equal(result.provider, 'haversine');
    assert.equal(result.legs.length, 2);
  } finally {
    if (previous === undefined) delete process.env.GEO_ROUTING_PROVIDER;
    else process.env.GEO_ROUTING_PROVIDER = previous;
  }
});
