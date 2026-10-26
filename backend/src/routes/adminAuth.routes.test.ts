import { test } from 'node:test';
import assert from 'node:assert/strict';
import adminAuthRouter from './adminAuth.routes.js';
import { protectPlatform, AUTH_GUARD_TAG } from '../middleware/auth.middleware.js';
import {
  PLATFORM_ADMIN_GUARD_TAG,
} from '../middleware/platformAdmin.middleware.js';

/**
 * PA1 structural coverage: the admin auth router must sit behind the kill
 * switch, expose only the four documented credential routes, and protect every
 * session route with the platform guard. A future route that forgets either
 * invariant fails CI instead of shipping an open admin surface.
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
  return (adminAuthRouter as any).stack.filter((layer: Layer) => layer.route) as Layer[];
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

test('the platform flag gate is mounted before every admin auth route', () => {
  const stack = (adminAuthRouter as any).stack;
  const gate = stack.find(
    (layer: Layer) => layer.handle?.[PLATFORM_ADMIN_GUARD_TAG] === true
  );
  assert.ok(gate, 'requirePlatformAdmin must be mounted with router.use');
  assert.equal(stack.indexOf(gate), 0, 'the flag gate must run first');
});

test('the admin auth route table is the documented PA1 surface', () => {
  const routes = routeLayers().map(
    (layer) => `${pathOf(layer)} ${methodsOf(layer).join(',')}`
  );
  assert.deepEqual(routes, [
    '/csrf GET',
    '/signin POST',
    '/logout POST',
    '/me GET',
    '/password POST',
  ]);
});

test('no public admin account-creation route exists', () => {
  const paths = routeLayers().map(pathOf);
  assert.equal(paths.some((path) => /signup|register/i.test(path)), false);
});

test('every session route carries protectPlatform', () => {
  for (const layer of routeLayers()) {
    const path = pathOf(layer);
    if (!['/me', '/password'].includes(path)) continue;
    const guarded = handlesOf(layer).some(
      (handle: any) =>
        handle === protectPlatform ||
        handle?.[AUTH_GUARD_TAG]?.realm === 'platform'
    );
    assert.ok(guarded, `${path} must use protectPlatform`);
  }
});
