import { test } from 'node:test';
import assert from 'node:assert/strict';
import tripRouter from '../../routes/itinerary.routes.js';
import { TRIP_GUARD_TAG } from '../../middleware/tripAccess.middleware.js';

/**
 * The anti-loophole guarantee (`docs/roadmap-milestone-6-collaboration.md`
 * §6.3): trip authorization lives in ONE place — the `requireTripRole` guard on
 * the router. A new trip-scoped route that forgets its guard fails these tests
 * in CI, so a controller can never silently become an authorization decision.
 */

type Layer = { route?: { path: unknown; methods: Record<string, boolean>; stack: any[] } };

function routeLayers(): Layer[] {
  return (tripRouter as any).stack.filter((layer: Layer) => layer.route) as Layer[];
}

function pathOf(layer: Layer): string {
  const path = layer.route?.path as any;
  // Express uses strings for our routes (some middleware paths are RegExp — skipped).
  return Array.isArray(path) ? String(path[0]) : String(path);
}

function methodsOf(layer: Layer): string[] {
  return Object.keys(layer.route?.methods ?? {});
}

function hasGuard(layer: Layer): boolean {
  return (layer.route?.stack ?? []).some(
    (requestHandler) => requestHandler?.handle?.[TRIP_GUARD_TAG] !== undefined
  );
}

/** Routes where the path carries a trip id (`:id`) or a share id. */
function isTripScoped(path: string): boolean {
  return path.startsWith('/:id');
}

test('every trip-scoped route carries a requireTripRole guard', () => {
  const layers = routeLayers();
  const unguarded = layers.filter((layer) => isTripScoped(pathOf(layer)) && !hasGuard(layer));
  assert.deepEqual(
    unguarded.map((layer) => `${methodsOf(layer)} ${pathOf(layer)}`),
    [],
    'Every /:id route must declare requireTripRole(minimum) on the router'
  );
});

test('public routes are intentionally NOT guarded (allow-list, not accident)', () => {
  const guardedPublic = routeLayers().filter((layer) => {
    const path = pathOf(layer);
    return (
      !isTripScoped(path) &&
      path !== '/' &&
      !path.startsWith('/generate') &&
      path !== '/insights' &&
      !path.startsWith('/shared') &&
      hasGuard(layer)
    );
  });
  assert.deepEqual(
    guardedPublic.map((layer) => pathOf(layer)),
    [],
    'A guard on a non-trip-scoped route means the allow-list above is stale'
  );
});

test('specific routes resolve in the order their guards assume', () => {
  const paths = routeLayers().map((layer) => pathOf(layer));

  // `/insights` and `/shared/:shareId` must be declared before any `/:id…`
  const indexOfFirstIdRoute = paths.findIndex((path) => path.startsWith('/:id'));
  const indexOfInsights = paths.indexOf('/insights');

  assert.ok(indexOfFirstIdRoute > -1, 'expected trip routes to exist');
  assert.ok(indexOfInsights > -1 && indexOfInsights < indexOfFirstIdRoute,
    '/insights must be declared before /:id or Express will match GET /:id first');
});

test('guards declare the expected minimum roles (spot checks)', () => {
  const layers = routeLayers();

  const minimumFor = (method: string, path: string): string | undefined => {
    const layer = layers.find(
      (candidate) =>
        pathOf(candidate) === path && methodsOf(candidate).includes(method.toLowerCase())
    );
    if (!layer) return undefined;
    const guard = (layer.route as any).stack.find(
      (handler: any) => handler?.handle?.[TRIP_GUARD_TAG] !== undefined
    );
    return guard?.handle?.[TRIP_GUARD_TAG]?.min;
  };

  assert.equal(minimumFor('GET', '/:id'), 'viewer');
  assert.equal(minimumFor('DELETE', '/:id'), 'owner');
  assert.equal(minimumFor('POST', '/:id/share'), 'owner');
  assert.equal(minimumFor('PUT', '/:id/expenses/:expenseId'), 'editor');
  assert.equal(minimumFor('PUT', '/:id/participants'), 'editor');
});

test('version-cap routes expose history only with the versions field loaded', () => {
  const layers = routeLayers();

  const optionsFor = (method: string, path: string): { withVersions?: boolean } => {
    const layer = layers.find(
      (candidate) =>
        pathOf(candidate) === path && methodsOf(candidate).includes(method.toLowerCase())
    );
    if (!layer) return {};
    const guard = (layer.route as any).stack.find(
      (handler: any) => handler?.handle?.[TRIP_GUARD_TAG] !== undefined
    );
    return guard?.handle?.[TRIP_GUARD_TAG]?.options ?? {};
  };

  assert.equal(optionsFor('GET', '/:id/versions').withVersions, true);
  assert.equal(optionsFor('PUT', '/:id').withVersions, true);
  assert.equal(optionsFor('GET', '/:id/expenses').withVersions, undefined);
});
