import { test } from 'node:test';
import assert from 'node:assert/strict';
import agencyRouter from './agency.routes.js';
import { protectAgency } from '../middleware/auth.middleware.js';
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

test('A1-A8 agency API exposes the expected route table', () => {
  const routes = routeLayers().map(
    (layer) => `${pathOf(layer)} ${methodsOf(layer).join(',')}`
  );
  assert.deepEqual(routes, [
    '/status GET',
    '/invites/:token GET',
    '/invites/:token/accept POST',
    '/proposals/:token GET',
    '/proposals/:token/accept POST',
    '/proposals/:token/pdf GET',
    '/enquiries GET',
    '/enquiries/summary GET',
    '/enquiries/:enquiryId GET',
    '/enquiries/:enquiryId PATCH',
    '/enquiries/:enquiryId/convert POST',
    '/enquiries/:enquiryId/messages POST',
    '/:agencyId GET',
    '/:agencyId PATCH',
    '/:agencyId/profile GET',
    '/:agencyId/profile PUT',
    '/:agencyId/profile/publish POST',
    '/:agencyId/profile/unpublish POST',
    '/:agencyId/packages GET',
    '/:agencyId/packages POST',
    '/:agencyId/packages/:packageId PATCH',
    '/:agencyId/packages/:packageId/publish POST',
    '/:agencyId/packages/:packageId/unpublish POST',
    '/:agencyId/packages/:packageId DELETE',
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
    '/:agencyId/templates/pdf POST',
    '/:agencyId/templates/pdf-tokens GET',
    '/:agencyId/templates/:templateId PATCH',
    '/:agencyId/templates/:templateId/versions GET',
    '/:agencyId/templates/:templateId/versions/:version/source GET',
    '/:agencyId/templates/:templateId/versions/from-source POST',
    '/:agencyId/templates/:templateId/versions/:version/layout GET',
    '/:agencyId/templates/:templateId/versions/:version/background GET',
    '/:agencyId/templates/:templateId/versions/from-layout POST',
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
    '/:agencyId/trips/:tripId/exports/:exportId/share POST',
    '/:agencyId/trips/:tripId/shares GET',
    '/:agencyId/trips/:tripId/shares/:shareId DELETE',
    '/:agencyId/trips GET',
    '/:agencyId/trips POST',
    '/:agencyId/trash GET',
    '/:agencyId/trips/:tripId GET',
    '/:agencyId/trips/:tripId PATCH',
    '/:agencyId/trips/:tripId DELETE',
    '/:agencyId/trips/:tripId/restore POST',
    '/:agencyId/trips/:tripId/purge DELETE',
    '/:agencyId/trips/:tripId/archive POST',
    '/:agencyId/trips/:tripId/unarchive POST',
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
    '/:agencyId/usage GET',
    '/:agencyId/audit GET',
    '/:agencyId/plan PATCH',
  ]);
});

// PA0: invite preview/activation are public (the token is the capability and
// activation requires email + password). A7 proposal routes are token-only.
// The plan route is ops-key-only (break-glass, no session). Everything else in
// the namespace must sit behind `protectAgency`.
const PUBLIC_ROUTES = new Set([
  '/status',
  '/invites/:token',
  '/invites/:token/accept',
  '/proposals/:token',
  '/proposals/:token/accept',
  '/proposals/:token/pdf',
  '/:agencyId/plan',
]);

test('the status probe advertises the latest agency milestone', () => {
  const layer = routeLayers().find((entry) => pathOf(entry) === '/status');
  assert.ok(layer, 'status route must exist');
  const handler = handlesOf(layer).pop();
  assert.equal(typeof handler, 'function');

  let body: unknown;
  const response = {
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
  handler({}, response);

  assert.deepEqual(body, {
    success: true,
    workspace: 'agency',
    milestone: 'A9',
    writesEnabled: true,
  });
});

test('every route except the documented public paths requires an agency session', () => {
  for (const layer of routeLayers()) {
    if (PUBLIC_ROUTES.has(pathOf(layer))) continue;
    assert.ok(
      handlesOf(layer).includes(protectAgency),
      `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing protectAgency`
    );
  }
});

test('only token, activation and ops-key paths are public', () => {
  const publicPaths = routeLayers()
    .filter((layer) => !handlesOf(layer).includes(protectAgency))
    .map(pathOf)
    .filter((path) => path !== '/status');
  assert.deepEqual(publicPaths.sort(), [
    '/:agencyId/plan',
    '/invites/:token',
    '/invites/:token/accept',
    '/proposals/:token',
    '/proposals/:token/accept',
    '/proposals/:token/pdf',
  ]);
});

test('every tenant-scoped route carries a tenant guard', () => {
  // The plan route is ops-only (secret-guarded service, no membership) —
  // TravelAI ops is not an agency member. Everything else must narrow to the
  // tenant before the handler runs.
  const TENANT_GUARD_EXEMPT = new Set(['/:agencyId/plan']);
  for (const layer of routeLayers()) {
    if (!pathOf(layer).startsWith('/:agencyId')) continue;
    if (TENANT_GUARD_EXEMPT.has(pathOf(layer))) continue;
    assert.ok(
      hasTag(layer, AGENCY_MEMBER_GUARD_TAG) || hasTag(layer, AGENCY_ROLE_GUARD_TAG),
      `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing an agency tenant guard`
    );
  }
});

test('team, settings, trash, assets and invite management require admin rank', () => {
  const adminRoutes = new Set([
    '/:agencyId PATCH',
    '/:agencyId/profile PUT',
    '/:agencyId/profile/publish POST',
    '/:agencyId/profile/unpublish POST',
    '/:agencyId/packages/:packageId/publish POST',
    '/:agencyId/packages/:packageId/unpublish POST',
    '/:agencyId/packages/:packageId DELETE',
    '/:agencyId/assets POST',
    '/:agencyId/assets/:assetId DELETE',
    '/:agencyId/trash GET',
    '/:agencyId/trips/:tripId DELETE',
    '/:agencyId/trips/:tripId/restore POST',
    '/:agencyId/trips/:tripId/purge DELETE',
    '/:agencyId/trips/:tripId/archive POST',
    '/:agencyId/trips/:tripId/unarchive POST',
    '/:agencyId/members/:userId PATCH',
    '/:agencyId/members/:userId DELETE',
    '/:agencyId/invites GET',
    '/:agencyId/invites POST',
    '/:agencyId/invites/:inviteId DELETE',
    '/:agencyId/templates POST',
    '/:agencyId/templates/pdf POST',
    '/:agencyId/templates/pdf-tokens GET',
    '/:agencyId/templates/:templateId PATCH',
    '/:agencyId/templates/:templateId/versions GET',
    '/:agencyId/templates/:templateId/versions/:version/source GET',
    '/:agencyId/templates/:templateId/versions/from-source POST',
    '/:agencyId/templates/:templateId/versions/:version/layout GET',
    '/:agencyId/templates/:templateId/versions/:version/background GET',
    '/:agencyId/templates/:templateId/versions/from-layout POST',
    '/:agencyId/templates/:templateId/versions POST',
    '/:agencyId/templates/:templateId/versions/:version/preview POST',
    '/:agencyId/templates/:templateId/versions/:version/activate POST',
    '/:agencyId/templates/:templateId/archive POST',
    '/:agencyId/templates/:templateId/default POST',
    '/:agencyId/usage GET',
    '/:agencyId/audit GET',
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
    '/:agencyId/profile GET',
    '/:agencyId/packages GET',
    '/:agencyId/assets GET',
    '/:agencyId/assets/:assetId/content GET',
    '/:agencyId/clients GET',
    '/:agencyId/templates GET',
    '/:agencyId/trips GET',
    '/:agencyId/trips/:tripId GET',
    '/:agencyId/trips/:tripId/exports GET',
    '/:agencyId/trips/:tripId/shares GET',
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
    '/:agencyId/packages POST',
    '/:agencyId/packages/:packageId PATCH',
    '/:agencyId/trips POST',
    '/:agencyId/trips/:tripId PATCH',
    '/:agencyId/trips/:tripId/exports/preview POST',
    '/:agencyId/trips/:tripId/exports POST',
    '/:agencyId/trips/:tripId/exports/:exportId/retry POST',
    '/:agencyId/trips/:tripId/exports/:exportId/share POST',
    '/:agencyId/trips/:tripId/shares/:shareId DELETE',
    '/:agencyId/trips/:tripId/quote PUT',
    '/:agencyId/trips/:tripId/quote/send POST',
    '/:agencyId/trips/:tripId/quote/accept POST',
    '/:agencyId/trips/:tripId/quote/cancel POST',
    '/enquiries/:enquiryId PATCH',
    '/enquiries/:enquiryId/convert POST',
    '/enquiries/:enquiryId/messages POST',
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
