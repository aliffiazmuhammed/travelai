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

  // Sprint E2: `DELETE /:id/members/me` must precede `DELETE /:id/members/:userId`,
  // otherwise "me" would be parsed as a member ObjectId and leave impossible.
  const indexOfMe = paths.indexOf('/:id/members/me');
  const indexOfUserParam = paths.indexOf('/:id/members/:userId');
  assert.ok(indexOfMe > -1 && indexOfUserParam > -1, 'expected member routes to exist');
  assert.ok(indexOfMe < indexOfUserParam,
    '/:id/members/me must be declared before /:id/members/:userId');
});

/**
 * Structural invariant: controllers never resolve trips themselves — the
 * authorization choke point (`requireTripRole`) owns every `Trip.findOne`.
 * This keeps "authorization lives on the router" enforceable, not aspirational.
 */
test('controllers contain zero trip lookups (choke-point invariant)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const controllersDir = path.resolve(here, '../../controllers');
  const files = fs
    .readdirSync(controllersDir)
    .filter((file) => file.endsWith('.controller.ts'));

  assert.ok(files.length >= 4, `expected the API controllers to exist, found: ${files}`);

  const offenders = files.filter((file) => {
    const source = fs.readFileSync(path.join(controllersDir, file), 'utf8');
    return /Trip\.(findOne|findById)\(/.test(source);
  });

  assert.deepEqual(
    offenders,
    [],
    'Controllers must not look trips up directly; use tripContext() / services'
  );
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
  // Sprint E2 — members & invites.
  assert.equal(minimumFor('GET', '/:id/members'), 'viewer');
  assert.equal(minimumFor('DELETE', '/:id/members/me'), 'viewer');
  assert.equal(minimumFor('PATCH', '/:id/members/:userId'), 'owner');
  // Sprint E5 — share-link lifecycle (F7).
  assert.equal(minimumFor('DELETE', '/:id/share'), 'owner');
  assert.equal(minimumFor('DELETE', '/:id/members/:userId'), 'owner');
  assert.equal(minimumFor('POST', '/:id/transfer'), 'owner');
  assert.equal(minimumFor('POST', '/:id/invites'), 'owner');
  assert.equal(minimumFor('GET', '/:id/invites'), 'owner');
  assert.equal(minimumFor('DELETE', '/:id/invites/:inviteId'), 'owner');
  // Sprint E4 — live tier.
  assert.equal(minimumFor('GET', '/:id/events'), 'viewer');
  assert.equal(minimumFor('POST', '/:id/events/heartbeat'), 'viewer');
  // Sprint F6a — comments. Read is viewer; posting is the first route to use
  // the `commenter` rank (the tier existed, reserved, until now).
  assert.equal(minimumFor('GET', '/:id/comments'), 'viewer');
  assert.equal(minimumFor('POST', '/:id/comments'), 'commenter');
  // Edit/delete sit at `viewer`: authorship, not rank, is the rule (a demoted
  // ex-editor still owns their words).
  assert.equal(minimumFor('PATCH', '/:id/comments/:commentId'), 'viewer');
  assert.equal(minimumFor('DELETE', '/:id/comments/:commentId'), 'viewer');
  // Milestone 7 / F8a — read state + typing. Both viewer-ranked: live tier
  // reads, never writes that touch the trip document.
  assert.equal(minimumFor('GET', '/:id/comments/read-state'), 'viewer');
  assert.equal(minimumFor('POST', '/:id/comments/read'), 'viewer');
  assert.equal(minimumFor('POST', '/:id/events/typing'), 'viewer');
  // Milestone 7 / F9 — decisions are snapshot records beside the Trip: all
  // three routes bottom out at `viewer` because authorship (not rank) rules:
  // comment author-or-owner promotes, promoter-or-owner unmarks.
  assert.equal(minimumFor('GET', '/:id/decisions'), 'viewer');
  assert.equal(minimumFor('POST', '/:id/comments/:commentId/decision'), 'viewer');
  assert.equal(minimumFor('DELETE', '/:id/decisions/:decisionId'), 'viewer');
});

test('version-cap routes expose history only with the versions field loaded', () => {
  const layers = routeLayers();

  const optionsFor = (method: string, path: string): { withVersions?: boolean; revMode?: string } => {
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

/**
 * Sprint E4 — `revMode: 'required'` is set per route (`§3.6`), so the guarantee
 * that "no controller can forget the concurrency check" extends to the routes
 * where a stale write destroys work wholesale. Whole-document and multi-item
 * mutations must demand a `baseRev`; id-addressed writes stay `optional`.
 */
test('content-mutation routes require baseRev (E4 concurrency spot checks)', () => {
  const layers = routeLayers();

  const revModeFor = (method: string, path: string): string | undefined => {
    const layer = layers.find(
      (candidate) =>
        pathOf(candidate) === path && methodsOf(candidate).includes(method.toLowerCase())
    );
    if (!layer) return undefined;
    const guard = (layer.route as any).stack.find(
      (handler: any) => handler?.handle?.[TRIP_GUARD_TAG] !== undefined
    );
    return guard?.handle?.[TRIP_GUARD_TAG]?.options?.revMode;
  };

  // Required: a stale write here overwrites more than its own item.
  for (const [method, path] of [
    ['PUT', '/:id'],
    ['PUT', '/:id/activities'],
    ['PUT', '/:id/activities/reorder'],
    ['PUT', '/:id/days/reorder'],
    ['PUT', '/:id/participants'],
    ['POST', '/:id/versions/:version/restore'],
    ['POST', '/:id/transfer'],
  ] as const) {
    assert.equal(
      revModeFor(method, path),
      'required',
      `${method} ${path} must run with revMode 'required' under E4`
    );
  }

  // Optional: id-addressed writes lose at most that one item.
  assert.equal(revModeFor('PUT', '/:id/expenses/:expenseId'), 'optional');
  assert.equal(revModeFor('POST', '/:id/routes'), 'optional');
});

/**
 * Sprint E5 — hardening surfaces the share-link lifecycle and the insights
 * scope changes in the router table.
 */
test('share link lifecycle is owner-scoped end to end (E5)', () => {
  const layers = routeLayers();

  const minimumForE5 = (method: string, path: string): string | undefined => {
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

  assert.equal(minimumForE5('POST', '/:id/share'), 'owner');
  // F7: the revoke route exists at all...
  assert.equal(minimumForE5('DELETE', '/:id/share'), 'owner');
});

test('the public shared endpoint carries the abuse brake limiter (F11)', () => {
  const layer = routeLayers().find((candidate) => pathOf(candidate) === '/shared/:shareId');
  assert.ok(layer, 'GET /shared/:shareId must be registered');
  // publicShareLimiter + controller: at least two layers before the handler.
  const handlers = (layer!.route as any).stack.map((entry: any) => entry.handle);
  assert.equal(handlers.length >= 2, true, 'expected the limiter to run before the controller');
});
