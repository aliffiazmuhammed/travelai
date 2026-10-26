import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlatformAdminGuard,
  PLATFORM_ADMIN_GUARD_TAG,
} from './platformAdmin.middleware.js';

/**
 * PA1: `PLATFORM_ADMIN_ENABLED` is a fail-closed kill switch. When it is off the
 * admin namespace must be indistinguishable from an unknown path, and the guard
 * must carry the tag that protects future route mounts from forgetting it.
 */

function run(guard: any): { status: number; body: any; next: boolean } {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let next = false;
  guard({} as any, res, () => {
    next = true;
  });
  return { status: res.statusCode, body: res.body, next };
}

test('the admin gate answers an unknown-path 404 when disabled', () => {
  const result = run(createPlatformAdminGuard(false));
  assert.equal(result.next, false);
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    success: false,
    error: 'Not found',
    message: 'Not found',
  });
});

test('the admin gate passes the request through when enabled', () => {
  const result = run(createPlatformAdminGuard(true));
  assert.equal(result.next, true);
});

test('the admin gate is tagged so route coverage can assert it', () => {
  const guard = createPlatformAdminGuard(true) as any;
  assert.equal(guard[PLATFORM_ADMIN_GUARD_TAG], true);
});
