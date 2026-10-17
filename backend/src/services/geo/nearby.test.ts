import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RADIUS_M,
  GEOAPIFY_CATEGORIES,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  NOMINATIM_PHRASES,
  buildGeoapifyUrl,
  buildNominatimUrl,
  buildOverpassQuery,
  clampRadius,
  clearNearbyCache,
  elementCoordinates,
  findNearbyPlaces,
  isNearbyCategory,
  nearbyProviderChain,
  normalizeGeoapifyFeatures,
  normalizeNominatimResults,
  normalizeOverpassElements,
  nominatimViewbox,
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
  // Every provider is pinned so the result cannot depend on the network.
  await withEnv(
    {
      OVERPASS_ENDPOINTS: 'http://127.0.0.1:1/api/interpreter',
      OVERPASS_TIMEOUT_MS: '400',
      OVERPASS_BUDGET_MS: '800',
      GEOAPIFY_API_KEY: undefined,
      NOMINATIM_BASE: 'http://127.0.0.1:1/search',
      NOMINATIM_MIN_INTERVAL_MS: '1',
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

      // A different radius is a different lookup, so it does hit the providers
      const otherRadius = await findNearbyPlaces(11.5, 76.0, 'cafe', 2000);
      assert.equal(otherRadius.available, false);
    }
  );
});

/* -------------------------------------------------------------------------- */
/* Provider chain                                                              */
/* -------------------------------------------------------------------------- */

test('nearbyProviderChain promotes Geoapify only when a key is configured', () => {
  assert.deepEqual(nearbyProviderChain('test-key'), ['geoapify', 'overpass', 'nominatim']);
  assert.deepEqual(nearbyProviderChain(''), ['overpass', 'nominatim']);
});

test('every category maps to a real Geoapify category key', () => {
  for (const [category, key] of Object.entries(GEOAPIFY_CATEGORIES)) {
    assert.ok(key.length > 0, `${category} must map to a category`);
    // Geoapify keys are dot-separated, comma-separated for OR groups
    assert.match(key, /^[a-z_]+(\.[a-z0-9_]+)*(,[a-z_]+(\.[a-z0-9_]+)*)*$/);
  }

  assert.equal(GEOAPIFY_CATEGORIES.restaurant, 'catering.restaurant');
  assert.equal(GEOAPIFY_CATEGORIES.pharmacy, 'healthcare.pharmacy');
  assert.equal(GEOAPIFY_CATEGORIES.fuel, 'service.vehicle.fuel');
  assert.equal(GEOAPIFY_CATEGORIES.atm, 'service.financial.atm');
  // A parent key also matches its children, so viewpoints come along for free.
  assert.match(GEOAPIFY_CATEGORIES.attraction, /tourism\.attraction/);
});

test('buildGeoapifyUrl carries the circle filter, proximity bias and key', () => {
  const url = buildGeoapifyUrl('restaurant', 9.9312, 76.2673, 1500, 'abc123');
  const [base, query] = url.split('?');

  assert.equal(base, 'https://api.geoapify.com/v2/places');
  assert.match(query, /categories=catering\.restaurant/);
  // Longitude comes first in Geoapify's circle/proximity formats
  assert.match(query, /filter=circle:76\.2673,9\.9312,1500/);
  assert.match(query, /bias=proximity:76\.2673,9\.9312/);
  assert.match(query, /limit=20/);
  assert.match(query, /apiKey=abc123/);
  // The separators must stay literal — URLSearchParams would escape them
  assert.equal(query.includes('%3A'), false);
});

test('normalizeGeoapifyFeatures swaps lon/lat, filters, sorts and reads tags', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [76.27, 9.94] }, // [lng, lat]
        properties: {
          name: 'The Salt Restaurant',
          place_id: 'p1',
          housenumber: '12',
          street: 'Marine Drive',
          city: 'Kochi',
          postcode: '682031',
          categories: ['catering.restaurant', 'catering.restaurant.indian'],
        },
      },
      {
        // Out of the 1 km radius (≈0.09° of latitude)
        geometry: { type: 'Point', coordinates: [76.27, 10.5] },
        properties: { name: 'Far Away Cafe', place_id: 'p2', categories: ['catering.cafe'] },
      },
      {
        // Unnamed places are dropped
        geometry: { type: 'Point', coordinates: [76.27, 9.9313] },
        properties: { place_id: 'p3' },
      },
      {
        // Duplicate of the first (same name + coordinates) — deduped
        geometry: { type: 'Point', coordinates: [76.27, 9.94] },
        properties: { name: 'The Salt Restaurant', place_id: 'p4' },
      },
      {
        // Falls back to the properties lat/lon when geometry is absent
        properties: { name: 'Fallback Kitchen', place_id: 'p5', lat: 9.9315, lon: 76.2675 },
      },
    ],
  };

  const places = normalizeGeoapifyFeatures(payload, [9.9312, 76.2673], 'restaurant', 1000);

  assert.deepEqual(
    places.map((place) => place.name),
    ['Fallback Kitchen', 'The Salt Restaurant']
  );
  // Coordinates come back as [lat, lng], not GeoJSON order
  assert.deepEqual(places[1].coordinates, [9.94, 76.27]);
  assert.equal(places[1].id, 'place-p1');
  assert.equal(places[1].category, 'restaurant');
  assert.equal(places[1].tags.cuisine, 'indian');
  assert.equal(places[1].tags.address, '12, Marine Drive, Kochi, 682031');
  assert.ok(places[0].distanceKm < places[1].distanceKm, 'sorted by distance');

  // Malformed payloads are safe
  assert.deepEqual(normalizeGeoapifyFeatures({}, ORIGIN, 'restaurant'), []);
  assert.deepEqual(normalizeGeoapifyFeatures(null, ORIGIN, 'restaurant'), []);
});

/* -------------------------------------------------------------------------- */
/* Nominatim fallback                                                          */
/* -------------------------------------------------------------------------- */

test('every category has a bracketed Nominatim special phrase', () => {
  for (const [category, phrase] of Object.entries(NOMINATIM_PHRASES)) {
    assert.match(phrase, /^\[[a-z ]+\]$/, `${category} must use the [phrase] syntax`);
  }

  // Free-text queries rank by importance, not proximity — the brackets are what
  // make this a radius search, so guard against a regression to plain words.
  assert.equal(NOMINATIM_PHRASES.restaurant, '[restaurant]');
  // India's phrase file has no [pharmacy]; [chemist] is the one that resolves.
  assert.equal(NOMINATIM_PHRASES.pharmacy, '[chemist]');
});

test('nominatimViewbox brackets the point and grows with the radius', () => {
  const [left, minLat, right, maxLat] = nominatimViewbox(9.9312, 76.2673, 2000)
    .split(',')
    .map(Number);

  assert.ok(left < 76.2673 && right > 76.2673, 'longitude is bracketed');
  assert.ok(minLat < 9.9312 && maxLat > 9.9312, 'latitude is bracketed');
  assert.ok(right - left > 0 && maxLat - minLat > 0);

  const wider = nominatimViewbox(9.9312, 76.2673, 4000).split(',').map(Number);
  assert.ok(wider[2] - wider[0] > right - left, 'a wider radius yields a wider box');
});

test('buildNominatimUrl is bounded, uses the phrase, and stays unencoded-safe', () => {
  const url = buildNominatimUrl('restaurant', 9.9312, 76.2673, 2000);
  const [base, query] = url.split('?');

  assert.equal(base, 'https://nominatim.openstreetmap.org/search');
  assert.match(query, /q=%5Brestaurant%5D/);
  assert.match(query, /format=jsonv2/);
  assert.match(query, /bounded=1/);
  assert.match(query, /addressdetails=1/);
  assert.match(query, /extratags=1/);
  assert.match(query, /viewbox=-?\d/);
  assert.match(query, /limit=20/);
});

test('normalizeNominatimResults reads string coordinates, extratags and address', () => {
  const payload = [
    {
      place_id: 253604809,
      osm_type: 'way',
      osm_id: 899375956,
      lat: '9.9355469',
      lon: '76.2604634',
      name: 'Febina Family Restaurant',
      display_name: 'Febina Family Restaurant, PT Jacob Road, Kochi, Kerala, India',
      address: {
        house_number: 'W7P6',
        road: 'PT Jacob Road',
        suburb: 'Thoppumpady',
        city: 'Kochi',
        postcode: '682005',
      },
      extratags: { cuisine: 'indian;chinese', opening_hours: '08:00-23:00', mobile: '04842236026' },
    },
    {
      // Outside a 1 km radius
      lat: '10.5',
      lon: '76.26',
      name: 'Far Away',
      address: {},
    },
    { lat: '9.9313', lon: '76.2673' }, // unnamed
    { name: 'No Coordinates' }, // unlocatable
    {
      // Duplicate of the first
      lat: '9.9355469',
      lon: '76.2604634',
      name: 'Febina Family Restaurant',
      address: {},
    },
  ];

  const places = normalizeNominatimResults(payload, [9.9312, 76.2673], 'restaurant', 1000);

  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Febina Family Restaurant');
  assert.deepEqual(places[0].coordinates, [9.9355469, 76.2604634]);
  assert.equal(places[0].id, 'osm-way-899375956');
  assert.equal(places[0].tags.cuisine, 'indian, chinese');
  assert.equal(places[0].tags.openingHours, '08:00-23:00');
  assert.equal(places[0].tags.phone, '04842236026');
  assert.equal(places[0].tags.address, 'W7P6, PT Jacob Road, Thoppumpady, Kochi');

  // A `{ results: [...] }` envelope is also accepted, and bad input is safe
  assert.equal(normalizeNominatimResults({ results: payload }, [9.9312, 76.2673], 'restaurant', 1000).length, 1);
  assert.deepEqual(normalizeNominatimResults({}, ORIGIN, 'restaurant'), []);
  assert.deepEqual(normalizeNominatimResults(null, ORIGIN, 'restaurant'), []);
});
