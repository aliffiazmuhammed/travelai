import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  buildOverpassQuery,
  clampRadius,
  elementCoordinates,
  isNearbyCategory,
  normalizeOverpassElements,
} from './nearby.js';

const ORIGIN: [number, number] = [11.5, 76.0];

test('clampRadius applies defaults and guard rails', () => {
  assert.equal(clampRadius(undefined), DEFAULT_RADIUS_M);
  assert.equal(clampRadius('nonsense'), DEFAULT_RADIUS_M);
  assert.equal(clampRadius(0), DEFAULT_RADIUS_M);
  assert.equal(clampRadius(50), MIN_RADIUS_M);
  assert.equal(clampRadius(999999), MAX_RADIUS_M);
  assert.equal(clampRadius('1500'), 1500);
});

test('isNearbyCategory accepts only supported categories', () => {
  assert.equal(isNearbyCategory('restaurant'), true);
  assert.equal(isNearbyCategory('attraction'), true);
  assert.equal(isNearbyCategory('helipad'), false);
});

test('buildOverpassQuery targets the right tags and radius', () => {
  const restaurants = buildOverpassQuery('restaurant', 11.5, 76.0, 2000);
  assert.match(restaurants, /around:2000,11.5,76/);
  assert.match(restaurants, /amenity"="restaurant"/);
  assert.match(restaurants, /\[out:json\]/);
  assert.match(restaurants, /out center/);

  const atms = buildOverpassQuery('atm', 11.5, 76.0, 800);
  assert.match(atms, /around:800,11.5,76/);
  assert.match(atms, /amenity"="atm"/);

  const attractions = buildOverpassQuery('attraction', 11.5, 76.0, 2000);
  assert.match(attractions, /tourism/);
});

test('elementCoordinates reads nodes and centered ways', () => {
  assert.deepEqual(elementCoordinates({ type: 'node', lat: 11.5, lon: 76.1 }), [11.5, 76.1]);
  assert.deepEqual(
    elementCoordinates({ type: 'way', center: { lat: 10, lon: 20 } }),
    [10, 20]
  );
  assert.equal(elementCoordinates({ type: 'node' }), null);
  assert.equal(elementCoordinates({ type: 'node', lat: 0, lon: 0 }), null);
  assert.equal(elementCoordinates(null), null);
});

test('normalizeOverpassElements drops unnamed/duplicate/far places and sorts by distance', () => {
  const payload = {
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 11.501,
        lon: 76.001,
        tags: {
          name: 'Saravana Bhavan',
          amenity: 'restaurant',
          cuisine: 'south_indian;vegetarian',
          opening_hours: 'Mo-Su 07:00-22:00',
          'addr:street': 'MG Road',
        },
      },
      {
        // Same place mapped as a way — should be de-duplicated
        type: 'way',
        id: 2,
        center: { lat: 11.501, lon: 76.001 },
        tags: { name: 'Saravana Bhavan', amenity: 'restaurant' },
      },
      {
        // Unnamed POIs are not useful in the UI
        type: 'node',
        id: 3,
        lat: 11.502,
        lon: 76.002,
        tags: { amenity: 'restaurant' },
      },
      {
        // ~11 km away — outside the 2 km radius
        type: 'node',
        id: 4,
        lat: 11.6,
        lon: 76.0,
        tags: { name: 'Far Away Diner', amenity: 'restaurant' },
      },
      {
        type: 'way',
        id: 5,
        center: { lat: 11.503, lon: 76.004 },
        tags: { name: 'Cafe Coffee Day', amenity: 'cafe' },
      },
    ],
  };

  const places = normalizeOverpassElements(payload, ORIGIN, 'restaurant', 2000);

  assert.equal(places.length, 2);
  assert.equal(places[0].name, 'Saravana Bhavan');
  assert.equal(places[1].name, 'Cafe Coffee Day');
  assert.ok(places[0].distanceKm < places[1].distanceKm);
  assert.ok(places[0].distanceKm < 0.3);
  assert.equal(places[0].category, 'restaurant');
  assert.equal(places[0].tags.cuisine, 'south_indian, vegetarian');
  assert.equal(places[0].tags.openingHours, 'Mo-Su 07:00-22:00');
  assert.equal(places[0].tags.address, 'MG Road');
  assert.equal(places[0].id, 'osm-node-1');

  // The limit is respected and malformed payloads are safe
  assert.equal(normalizeOverpassElements(payload, ORIGIN, 'restaurant', 2000, 1).length, 1);
  assert.deepEqual(normalizeOverpassElements({}, ORIGIN, 'restaurant'), []);
  assert.deepEqual(normalizeOverpassElements(null, ORIGIN, 'restaurant'), []);
});
