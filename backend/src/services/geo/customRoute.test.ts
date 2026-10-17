import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POINTS_PER_ROUTE,
  isDrawableRoute,
  normalizeRoutePoints,
  routeDistanceKm,
} from './customRoute.js';

test('normalizeRoutePoints drops malformed coordinates', () => {
  const points = normalizeRoutePoints([
    [11.5, 76.0],
    [0, 0], // null island
    [91, 10], // out of range
    [10, 181], // out of range
    [11.6, 76.2],
    'nope',
    [12, 76, 99], // extra members are tolerated
  ]);
  assert.deepEqual(points, [
    [11.5, 76.0],
    [11.6, 76.2],
    [12, 76],
  ]);
  assert.deepEqual(normalizeRoutePoints('nope'), []);
});

test('normalizeRoutePoints caps the number of points', () => {
  const raw = Array.from({ length: MAX_POINTS_PER_ROUTE + 25 }, (_, i) => [
    10 + i * 0.0001,
    76,
  ]);
  assert.equal(normalizeRoutePoints(raw).length, MAX_POINTS_PER_ROUTE);
});

test('routeDistanceKm sums the polyline and caps points', () => {
  const a = routeDistanceKm([
    [11.5, 76.0],
    [11.55, 76.08],
    [11.62, 76.23],
  ]);
  assert.ok(a > 0);
  // A single valid point (or none) has no length
  assert.equal(routeDistanceKm([[11.5, 76.0]]), 0);
  assert.equal(routeDistanceKm([]), 0);
  assert.equal(routeDistanceKm(null), 0);
});

test('isDrawableRoute requires at least two valid points', () => {
  assert.equal(isDrawableRoute([[11.5, 76.0], [11.6, 76.1]]), true);
  assert.equal(isDrawableRoute([[11.5, 76.0]]), false);
  assert.equal(isDrawableRoute([[0, 0], [0, 0]]), false);
});
