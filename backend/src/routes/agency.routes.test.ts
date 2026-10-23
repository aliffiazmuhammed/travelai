import { test } from 'node:test';
import assert from 'node:assert/strict';
import agencyRouter from './agency.routes.js';
import { protect } from '../middleware/auth.middleware.js';
import {
  AGENCY_MEMBER_GUARD_TAG,
  AGENCY_ROLE_GUARD_TAG,
  AGENCY_TRIP_GUARD_TAG,
} from '../middleware/agencyAccess.middleware.js';
import {
  AGENCY_WORKSPACE_GUARD_TAG,
  createAgencyWorkspaceGuard,
} from '../middleware/agencyWorkspace.middleware.js';

type Layer = {
  route?: {
    path: unknown;
    methods: Record<string, boolean>;
    stack: any[];
  };
  handle?: any;
};

function routeLayers(): Layer[] {
  return (agencyRouter as any).stack.filter((layer: Layer) => layer.route) as Layer[];
}

function pathOf(layer: Layer): string {
  const path = layer.route?.path as unknown;
  return Array.isArray(path) ? String(path[0]) : String(path);
}

function methodsOf(layer: Layer): string[] {
  return Object.keys(layer.route?.methods ?? {})
    .map((method) => method.toUpperCase())
    .sort();
}

function handlesOf(layer: Layer): any[] {
  return (layer.route?.stack ?? []).map((handler: any) => handler?.handle);
}

function hasTag(layer: Layer, tag: symbol): boolean {
  return handlesOf(layer).some((handle: any) => handle?.[tag] === true || handle?.[tag] !== undefined);
}

function roleMin(layer: Layer): string | undefined {
  const handle = handlesOf(layer).find((entry: any) => entry?.[AGENCY_ROLE_GUARD_TAG]);
  return handle?.[AGENCY_ROLE_GUARD_TAG]?.min;
}

/**
 * A1 turns the dark A0 probe into the one agency namespace. These structural
 * tests are the anti-loophole guarantee: a future route that forgets the
 * feature gate, `protect`, or a tenant guard fails CI.
 */

test('the feature gate is mounted on the whole namespace', () => {
  const gate = (agencyRouter as any).stack.find(
    (layer: Layer) => layer.handle?.[AGENCY_WORKSPACE_GUARD_TAG] === true
  );
  assert.ok(gate, 'requireAgencyWorkspace must be mounted with router.use');
  assert.equal(
    (agencyRouter as any).stack.indexOf(gate),
    0,
    'the feature gate must run before every agency route'
  );
});

test('A1-A6 agency API exposes the expected route table', () => {
  const routes = routeLayers().map(
    (layer) => `${pathOf(layer)} ${methodsOf(layer).join(',')}`
  );
  assert.deepEqual(routes, [
    '/status GET',
    '/invites/:token GET',
    '/invites/:token/accept POST',
    '/ GET',
    '/ POST',
    '/:agencyId GET',
    '/:agencyId PATCH',
    '/:agencyId/assets GET',
    '/:agencyId/assets POST',
    '/:agencyId/assets/:assetId DELETE',
    '/:agencyId/assets/:assetId/content GET',
    '/:agencyId/clients GET',
    '/:agencyId/clients POST',
    '/:agencyId/clients/:clientId PATCH',
    '/:agencyId/clients/:clientId DELETE',
    '/:agencyId/templates GET',
    '/:agencyId/templates POST',
    '/:agencyId/templates/:templateId PATCH',
    '/:agencyId/templates/:templateId/versions GET',
    '/:agencyId/templates/:templateId/versions POST',
    '/:agencyId/templates/:templateId/versions/:version/preview POST',
    '/:agencyId/templates/:templateId/versions/:version/activate POST',
    '/:agencyId/templates/:templateId/archive POST',
    '/:agencyId/templates/:templateId/default POST',
    '/:agencyId/trips/:tripId/exports GET',
    '/:agencyId/trips/:tripId/exports/preview POST',
    '/:agencyId/trips/:tripId/exports POST',
    '/:agencyId/trips/:tripId/exports/:exportId/retry POST',
    '/:agencyId/exports/:exportId/download GET',
    '/:agencyId/trips GET',
    '/:agencyId/trips POST',
    '/:agencyId/trash GET',
    '/:agencyId/trips/:tripId GET',
    '/:agencyId/trips/:tripId PATCH',
    '/:agencyId/trips/:tripId DELETE',
    '/:agencyId/trips/:tripId/restore POST',
    '/:agencyId/trips/:tripId/purge DELETE',
    '/:agencyId/trips/:tripId/quote GET',
    '/:agencyId/trips/:tripId/quote/versions GET',
    '/:agencyId/trips/:tripId/quote PUT',
    '/:agencyId/trips/:tripId/quote/send POST',
    '/:agencyId/trips/:tripId/quote/accept POST',
    '/:agencyId/trips/:tripId/quote/cancel POST',
    '/:agencyId/members GET',
    '/:agencyId/members/:userId PATCH',
    '/:agencyId/members/:userId DELETE',
    '/:agencyId/invites GET',
    '/:agencyId/invites POST',
    '/:agencyId/invites/:inviteId DELETE',
  ]);
});

test('every non-status route requires authentication', () => {
  for (const layer of routeLayers()) {
    if (pathOf(layer) === '/status') continue;
    assert.ok(
      handlesOf(layer).includes(protect),
      `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing protect`
    );
  }
});

test('every tenant-scoped route carries a tenant guard', () => {
  for (const layer of routeLayers()) {
    if (!pathOf(layer).startsWith('/:agencyId')) continue;
    assert.ok(
      hasTag(layer, AGENCY_MEMBER_GUARD_TAG) || hasTag(layer, AGENCY_ROLE_GUARD_TAG),
      `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing an agency tenant guard`
    );
  }
});

test('team, settings, trash, assets and invite management require admin rank', () => {
  const adminRoutes = new Set([
    '/:agencyId PATCH',
    '/:agencyId/assets POST',
    '/:agencyId/assets/:assetId DELETE',
    '/:agencyId/trash GET',
    '/:agencyId/trips/:tripId DELETE',
    '/:agencyId/trips/:tripId/restore POST',
    '/:agencyId/trips/:tripId/purge DELETE',
    '/:agencyId/members/:userId PATCH',
    '/:agencyId/members/:userId DELETE',
    '/:agencyId/invites GET',
    '/:agencyId/invites POST',
    '/:agencyId/invites/:inviteId DELETE',
    '/:agencyId/templates POST',
    '/:agencyId/templates/:templateId PATCH',
    '/:agencyId/templates/:templateId/versions GET',
    '/:agencyId/templates/:templateId/versions POST',
    '/:agencyId/templates/:templateId/versions/:version/preview POST',
    '/:agencyId/templates/:templateId/versions/:version/activate POST',
    '/:agencyId/templates/:templateId/archive POST',
    '/:agencyId/templates/:templateId/default POST',
  ]);

  for (const layer of routeLayers()) {
    const key = `${pathOf(layer)} ${methodsOf(layer).join(',')}`;
    if (!adminRoutes.has(key)) continue;
    assert.equal(roleMin(layer), 'admin', `${key} must require admin`);
  }
});

test('read-only tenant routes require membership, not admin', () => {
  const readRoutes = new Set([
    '/:agencyId GET',
    '/:agencyId/assets GET',
    '/:agencyId/assets/:assetId/content GET',
    '/:agencyId/clients GET',
    '/:agencyId/templates GET',
    '/:agencyId/trips GET',
    '/:agencyId/trips/:tripId GET',
    '/:agencyId/trips/:tripId/exports GET',
    '/:agencyId/exports/:exportId/download GET',
    '/:agencyId/trips/:tripId/quote GET',
    '/:agencyId/trips/:tripId/quote/versions GET',
    '/:agencyId/members GET',
  ]);
  for (const layer of routeLayers()) {
    const key = `${pathOf(layer)} ${methodsOf(layer).join(',')}`;
    if (!readRoutes.has(key)) continue;
    assert.equal(roleMin(layer), undefined, `${key} must not require admin`);
  }
});

test('trip writes, directory writes, quote actions and exports require planner rank', () => {
  const plannerRoutes = new Set([
    '/:agencyId/clients POST',
    '/:agencyId/clients/:clientId PATCH',
    '/:agencyId/clients/:clientId DELETE',
    '/:agencyId/trips POST',
    '/:agencyId/trips/:tripId PATCH',
    '/:agencyId/trips/:tripId/exports/preview POST',
    '/:agencyId/trips/:tripId/exports POST',
    '/:agencyId/trips/:tripId/exports/:exportId/retry POST',
    '/:agencyId/trips/:tripId/quote PUT',
    '/:agencyId/trips/:tripId/quote/send POST',
    '/:agencyId/trips/:tripId/quote/accept POST',
    '/:agencyId/trips/:tripId/quote/cancel POST',
  ]);
  for (const layer of routeLayers()) {
    const key = `${pathOf(layer)} ${methodsOf(layer).join(',')}`;
    if (!plannerRoutes.has(key)) continue;
    assert.equal(roleMin(layer), 'planner', `${key} must require planner`);
  }
});

test('tenant trip routes also narrow to one agency trip', () => {
  for (const layer of routeLayers()) {
    if (!pathOf(layer).includes(':tripId')) continue;
    assert.ok(
      handlesOf(layer).some((handle: any) => handle?.[AGENCY_TRIP_GUARD_TAG]),
      `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing requireAgencyTripRole`
    );
  }
});

test('a disabled agency gate answers 404 and never calls next', () => {
  const guard = createAgencyWorkspaceGuard(false);
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  guard({} as any, response as any, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Not found',
    message: 'Not found',
  });
  assert.equal(nextCalled, false);
});

test('an enabled agency gate continues to the route', () => {
  const guard = createAgencyWorkspaceGuard(true);
  let nextCalled = false;

  guard({} as any, {} as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
