import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  buildOverpassQuery,
  clampRadius,
  clearNearbyCache,
  elementCoordinates,
  findNearbyPlaces,
  isNearbyCategory,
  normalizeOverpassElements,
  overpassBudgetMs,
  overpassEndpoints,
  overpassTimeoutMs,
  retryAfterMs,
} from './nearby.js';

const ORIGIN: [number, number] = [11.5, 76.0];

/** Runs `fn` with the given env vars applied, restoring them afterwards. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

/* -------------------------------------------------------------------------- */
/* Endpoint failover & honest failure reporting                                */
/* -------------------------------------------------------------------------- */

test('overpassEndpoints falls back to the built-in mirrors', async () => {
  await withEnv({ OVERPASS_ENDPOINTS: undefined, OVERPASS_ENDPOINT: undefined }, async () => {
    const endpoints = overpassEndpoints();
    assert.ok(endpoints.length >= 2, 'more than one endpoint should be tried');
    assert.match(endpoints[0], /^https:\/\//);
    // A Switzerland-only extract would answer 200 with an empty list everywhere
    // else, which is worse than being unavailable — it must never be a default.
    assert.equal(endpoints.some((endpoint) => endpoint.includes('osm.ch')), false);
    // The French instance rejects non-whitelisted usage with a 403.
    assert.equal(endpoints.some((endpoint) => endpoint.includes('openstreetmap.fr')), false);
  });
});

test('OVERPASS_ENDPOINTS replaces the list, OVERPASS_ENDPOINT keeps the fallbacks', async () => {
  await withEnv({ OVERPASS_ENDPOINTS: 'https://one.example/api, https://two.example/api' }, async () => {
    assert.deepEqual(overpassEndpoints(), [
      'https://one.example/api',
      'https://two.example/api',
    ]);
  });

  // Duplicates and non-http entries are filtered out
  await withEnv(
    { OVERPASS_ENDPOINTS: 'https://dup.example/api,https://dup.example/api,ftp://x.example,nonsense' },
    async () => {
      assert.deepEqual(overpassEndpoints(), ['https://dup.example/api']);
    }
  );

  // Legacy singular var: the configured endpoint is tried first and the default
  // mirrors stay available so an old config still gains failover.
  await withEnv(
    { OVERPASS_ENDPOINTS: undefined, OVERPASS_ENDPOINT: 'https://mine.example/api' },
    async () => {
      const endpoints = overpassEndpoints();
      assert.equal(endpoints[0], 'https://mine.example/api');
      assert.ok(endpoints.length > 1);
    }
  );

  // An empty/blank plural value must not disable lookups entirely
  await withEnv({ OVERPASS_ENDPOINTS: '   ', OVERPASS_ENDPOINT: undefined }, async () => {
    assert.ok(overpassEndpoints().length > 0);
  });
});

test('timeout, budget and retry knobs default and honour the environment', async () => {
  await withEnv(
    { OVERPASS_TIMEOUT_MS: undefined, OVERPASS_BUDGET_MS: undefined, NEARBY_RETRY_AFTER_MS: undefined },
    async () => {
      assert.equal(overpassTimeoutMs(), 6000);
      assert.equal(overpassBudgetMs(), 10000);
      assert.equal(retryAfterMs(), 60000);
    }
  );

  await withEnv(
    { OVERPASS_TIMEOUT_MS: '1500', OVERPASS_BUDGET_MS: '3000', NEARBY_RETRY_AFTER_MS: '-5' },
    async () => {
      assert.equal(overpassTimeoutMs(), 1500);
      assert.equal(overpassBudgetMs(), 3000);
      // A nonsense value falls back to the default rather than disabling the breaker
      assert.equal(retryAfterMs(), 60000);
    }
  );
});

test('a total provider outage is reported as unavailable, not as "no places"', async () => {
  // Port 1 refuses connections immediately, so this exercises the real failover
  // path without mocking `fetch` — and without waiting on the public network.
  await withEnv(
    {
      OVERPASS_ENDPOINTS: 'http://127.0.0.1:1/api/interpreter',
      OVERPASS_TIMEOUT_MS: '400',
      OVERPASS_BUDGET_MS: '800',
      NEARBY_RETRY_AFTER_MS: '60000',
    },
    async () => {
      clearNearbyCache();

      const failed = await findNearbyPlaces(11.5, 76.0, 'cafe', 1000);
      assert.equal(failed.available, false);
      assert.equal(failed.provider, 'none');
      assert.deepEqual(failed.places, []);
      assert.equal(failed.radius, 1000);
      assert.match(String(failed.note), /temporarily unavailable/i);

      // The circuit breaker makes an immediate retry instant and equally honest
      const started = Date.now();
      const retried = await findNearbyPlaces(11.5, 76.0, 'cafe', 1000);
      assert.equal(retried.available, false);
      assert.equal(retried.cached, true);
      assert.ok(Date.now() - started < 250, 'a known-down provider must not be retried immediately');

      // A different radius is a different lookup, so it does hit the provider
      const otherRadius = await findNearbyPlaces(11.5, 76.0, 'cafe', 2000);
      assert.equal(otherRadius.available, false);
    }
  );
});
