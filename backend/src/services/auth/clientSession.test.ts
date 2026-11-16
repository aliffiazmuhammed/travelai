import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_CLIENT_HEADER, wantsTokenInBody } from './clientSession.js';

function request(header?: string) {
  return {
    get(name: string) {
      return name.toLowerCase() === MOBILE_CLIENT_HEADER ? header : undefined;
    },
  };
}

test('mobile header opts the sign-in response into a Bearer token', () => {
  assert.equal(wantsTokenInBody(request('mobile') as any), true);
});

test('browser requests keep the cookie-only contract', () => {
  assert.equal(wantsTokenInBody(request() as any), false);
  assert.equal(wantsTokenInBody(request('web') as any), false);
});

test('header matching is case-insensitive and trimmed', () => {
  assert.equal(wantsTokenInBody(request('  Mobile ') as any), true);
});
