import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCsrf } from './csrf.middleware.js';

/**
 * PA0 CSRF coverage: all three realm cookies count as session cookies, so no
 * realm can mutate with a cookie and no header. Bootstrap paths for each realm
 * stay exempt, and Bearer callers are not CSRF targets.
 */

function request(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'POST',
    path: '/api/agency/a1/trips',
    cookies: {},
    headers: {},
    ...overrides,
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()];
    },
  };
}

function response(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function check(req: any): { status: number; next: boolean } {
  const res = response();
  let next = false;
  verifyCsrf(req, res, () => {
    next = true;
  });
  return { status: res.statusCode, next };
}

test('a cookie mutation without the header is rejected', () => {
  for (const cookie of ['token', 'agency_token', 'platform_token']) {
    const result = check(
      request({ cookies: { [cookie]: 'session', csrf: 'expected-token' } })
    );
    assert.equal(result.status, 403, `${cookie} must require the CSRF header`);
    assert.equal(result.next, false);
  }
});

test('a matching double-submit is accepted for every realm', () => {
  for (const cookie of ['token', 'agency_token', 'platform_token']) {
    const result = check(
      request({
        cookies: { [cookie]: 'session', csrf: 'expected-token' },
        headers: { 'x-csrf-token': 'expected-token' },
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.next, true);
  }
});

test('each realm bootstrap path is exempt', () => {
  for (const path of [
    '/api/auth/signin',
    '/api/auth/logout',
    '/api/auth/csrf',
    '/api/agency/auth/signin',
    '/api/agency/auth/logout',
    '/api/agency/auth/csrf',
    '/api/admin/auth/signin',
    '/api/admin/auth/logout',
    '/api/admin/auth/csrf',
  ]) {
    const result = check(request({ path, cookies: { token: 'session' } }));
    assert.equal(result.next, true, `${path} must be exempt`);
  }
});

test('safe methods and Bearer callers skip the check', () => {
  assert.equal(check(request({ method: 'GET', cookies: { token: 's' } })).next, true);
  assert.equal(
    check(
      request({
        cookies: { agency_token: 's' },
        headers: { authorization: 'Bearer token' },
      })
    ).next,
    true
  );
});

test('anonymous writes still pass (there is no cookie to forge)', () => {
  assert.equal(check(request()).next, true);
});
