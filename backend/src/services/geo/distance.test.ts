import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  pathLengthKm,
  isValidCoord,
  bearing,
  centroid,
  boundingBox,
  estimateTravelMinutes,
  formatDistance,
  formatDuration,
  buildLegs,
  totalRoute,
} from './distance.js';

test('haversineKm matches known distances within tolerance', () => {
  const london: [number, number] = [51.5074, -0.1278];
  const paris: [number, number] = [48.8566, 2.3522];
  // Great-circle ~344 km
  assert.ok(Math.abs(haversineKm(london, paris) - 344) < 5);

  const delhi: [number, number] = [28.6139, 77.209];
  const mumbai: [number, number] = [19.076, 72.8777];
  // Great-circle ~1153 km
  assert.ok(Math.abs(haversineKm(delhi, mumbai) - 1153) < 20);

  // Identical points are zero distance
  assert.equal(haversineKm(london, london), 0);
});

test('isValidCoord rejects null-island and out-of-range coordinates', () => {
  assert.equal(isValidCoord([11.6854, 76.132]), true);
  assert.equal(isValidCoord([0, 0]), false);
  assert.equal(isValidCoord([91, 10]), false);
  assert.equal(isValidCoord([10, 181]), false);
  assert.equal(isValidCoord([NaN, 10]), false);
  assert.equal(isValidCoord([10]), false);
  assert.equal(isValidCoord('nope'), false);
});

test('pathLengthKm sums a polyline', () => {
  const a: [number, number] = [0, 0];
  const b: [number, number] = [0, 1];
  const c: [number, number] = [0, 2];
  const leg = haversineKm(a, b);
  assert.ok(Math.abs(pathLengthKm([a, b, c]) - leg * 2) < 0.001);
  assert.equal(pathLengthKm([a]), 0);
});

test('bearing and centroid behave sanely', () => {
  const north = bearing([0, 0], [1, 0]);
  assert.ok(Math.abs(north - 0) < 1 || Math.abs(north - 360) < 1);
  const east = bearing([0, 0], [0, 1]);
  assert.ok(Math.abs(east - 90) < 1);

  assert.deepEqual(centroid([[0, 0], [2, 2]]), [1, 1]);
  assert.equal(centroid([]), null);
});

test('boundingBox covers all points', () => {
  const box = boundingBox([[10, 20], [12, 18], [11, 25]]);
  assert.deepEqual(box, { minLat: 10, minLng: 18, maxLat: 12, maxLng: 25 });
  assert.equal(boundingBox([]), null);
});

test('estimateTravelMinutes applies mode speeds and never returns 0 for a real leg', () => {
  // 30 km straight-line, drive (30 km/h * 1.35 road factor) => 81 min
  assert.equal(estimateTravelMinutes(30, 'drive'), 81);
  // Walking takes far longer than driving
  assert.ok(estimateTravelMinutes(5, 'walk') > estimateTravelMinutes(5, 'drive'));
  // A tiny leg still takes at least 1 minute
  assert.equal(estimateTravelMinutes(0.01, 'walk'), 1);
  assert.equal(estimateTravelMinutes(0, 'drive'), 0);
});

test('formatDistance / formatDuration produce friendly labels', () => {
  assert.equal(formatDistance(0.82), '820 m');
  assert.equal(formatDistance(4.234), '4.2 km');
  assert.equal(formatDistance(42.6), '43 km');
  assert.equal(formatDuration(18), '18 min');
  assert.equal(formatDuration(85), '1h 25m');
  assert.equal(formatDuration(120), '2h');
});

test('buildLegs / totalRoute aggregate a sequence', () => {
  const points: [number, number][] = [
    [11.5, 76.0],
    [11.55, 76.08],
    [11.62, 76.23],
  ];
  const legs = buildLegs(points, 'drive');
  assert.equal(legs.length, 2);
  assert.equal(legs[0].fromIndex, 0);
  assert.equal(legs[1].toIndex, 2);
  assert.ok(legs.every((leg) => leg.km > 0 && leg.minutes >= 1));

  const total = totalRoute(points, 'drive');
  assert.ok(Math.abs(total.km - (legs[0].km + legs[1].km)) < 0.02);
  assert.equal(total.minutes, legs.reduce((sum, leg) => sum + leg.minutes, 0));
});
