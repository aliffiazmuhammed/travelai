import { test } from 'node:test';
import assert from 'node:assert/strict';
import adminRouter from './admin.routes.js';
import { protectPlatform } from '../middleware/auth.middleware.js';
import { PLATFORM_ADMIN_GUARD_TAG } from '../middleware/platformAdmin.middleware.js';
import { platformWriteLimiter } from '../middleware/rateLimiter.middleware.js';

/**
 * PA2 structural coverage: the directory router must sit behind the kill switch
 * and `protectPlatform`, expose only the documented directory/management
 * routes, and keep every mutation rate-limited. A route added without the
 * guards fails CI instead of shipping an open tenant directory.
 */

type Layer = {
  route?: {
    path: unknown;
    methods: Record<string, boolean>;
    stack: any[];
  };
  handle?: any;
};

function routeLayers(): Layer[] {
  return (adminRouter as any).stack.filter((layer: Layer) => layer.route) as Layer[];
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

test('the kill switch and platform guard run before every admin route', () => {
  const stack = (adminRouter as any).stack;
  const gateIndex = stack.findIndex(
    (layer: Layer) => layer.handle?.[PLATFORM_ADMIN_GUARD_TAG] === true
  );
  const guardIndex = stack.findIndex(
    (layer: Layer) => layer.handle === protectPlatform
  );
  const firstRouteIndex = stack.findIndex((layer: Layer) => layer.route);

  assert.notEqual(gateIndex, -1, 'requirePlatformAdmin must be mounted');
  assert.notEqual(guardIndex, -1, 'protectPlatform must be mounted');
  assert.equal(gateIndex, 0, 'the kill switch must run first');
  assert.ok(guardIndex < firstRouteIndex, 'protectPlatform must precede routes');
});

test('the admin directory route table is the documented PA2 surface', () => {
  const routes = routeLayers().map(
    (layer) => `${pathOf(layer)} ${methodsOf(layer).join(',')}`
  );
  assert.deepEqual(routes, [
    '/overview GET',
    '/reports GET',
    '/reports/:targetType/:targetId/hide POST',
    '/reports/:targetType/:targetId/dismiss POST',
    '/applications GET',
    '/applications/:id/approve POST',
    '/applications/:id/reject POST',
    '/agencies GET',
    '/agencies/plans GET',
    '/agencies/owner-preview GET',
    '/agencies POST',
    '/agencies/:id GET',
    '/agencies/:id/status PATCH',
    '/agencies/:id/plan PATCH',
    '/agencies/:id/members/invite POST',
    '/agencies/:id/members/:userId PATCH',
    '/agencies/:id/members/:userId DELETE',
    '/agencies/:id/members/:userId/transfer-owner POST',
    '/agencies/:id/members/:userId/reset-password POST',
    '/agencies/:id/directory/verify POST',
    '/agencies/:id/directory/unverify POST',
    '/agencies/:id/directory/hide POST',
    '/agencies/:id/directory/restore POST',
    '/agencies/:id/directory/packages/:packageId/hide POST',
    '/agencies/:id/directory/packages/:packageId/restore POST',
    '/audit GET',
    '/accounts GET',
    '/accounts/:id GET',
    '/accounts/:id/status PATCH',
    '/accounts/:id/reset-password POST',
    '/platform-accounts GET',
    '/platform-accounts POST',
    '/platform-accounts/:id PATCH',
  ]);
});

test('no tenant-content or personal-trip routes exist in the admin namespace', () => {
  const paths = routeLayers().map(pathOf);
  assert.equal(
    paths.some((path) => /trips?|itinerar|clients?|quotes?|exports?|templates?/i.test(path)),
    false
  );
});

test('every mutating admin route is rate-limited', () => {
  for (const layer of routeLayers()) {
    const methods = methodsOf(layer);
    if (methods.every((method) => ['GET', 'HEAD', 'OPTIONS'].includes(method))) {
      continue;
    }
    assert.ok(
      handlesOf(layer).includes(platformWriteLimiter),
      `${pathOf(layer)} ${methods.join(',')} must use platformWriteLimiter`
    );
  }
});
