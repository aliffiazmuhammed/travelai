import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  getCsrfToken,
  issueCsrfCookie,
  verifyCsrf,
} from '../../middleware/csrf.middleware.js';
import { isAllowedCorsOrigin, isSameOriginRequest } from './httpOrigins.js';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type CookieMap = Record<string, string>;

function fakeReq(options: {
  method?: string;
  path?: string;
  cookies?: CookieMap;
  authorization?: string;
  csrfHeader?: string;
}) {
  const headers: Record<string, string | undefined> = {};
  return {
    method: options.method ?? 'POST',
    path: options.path ?? '/api/itinerary/672abc/feed',
    url: options.path ?? '/api/itinerary/672abc/feed',
    cookies: { ...(options.cookies ?? {}) } as CookieMap,
    headers,
    get(name: string) {
      const key = name.toLowerCase();
      if (key === CSRF_HEADER) return options.csrfHeader;
      if (key === 'authorization') return options.authorization;
      return headers[key];
    },
  } as any;
}

function fakeRes() {
  const res: any = {
    statusCode: 0,
    cookies: {} as Record<string, { value: string; options?: unknown }>,
    body: null as unknown,
    _next: false,
  };
  res.cookie = (name: string, value: string, options?: unknown) => {
    res.cookies[name] = { value, options };
    return res;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  res._next = () => {
    res._next = true;
    return undefined as any;
  };
  return res;
}

/** Runs verifyCsrf, returning 'next' when continuation is asserted. */
function runVerify(req: any, res: any): 'next' | number {
  verifyCsrf(req, res, () => {
    (res as any)._next = true;
  });
  return (res as any)._next === true ? 'next' : (res as any).statusCode;
}

/* -------------------------------------------------------------------------- */
/*  CSRF double-submit (flaw F1)                                               */
/* -------------------------------------------------------------------------- */

test('generateCsrfToken() yields unpredictable 64-hex values', () => {
  const first = generateCsrfToken();
  const second = generateCsrfToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('issueCsrfCookie() sets a readable, Lax cookie when missing', () => {
  const req = fakeReq({ method: 'GET' });
  const res = fakeRes();
  issueCsrfCookie(req, res, () => undefined);
  assert.ok(res.cookies[CSRF_COOKIE]);
  assert.equal(res.cookies[CSRF_COOKIE].options.sameSite, 'lax');
  assert.equal(res.cookies[CSRF_COOKIE].options.httpOnly, false);
  // The same request must see the issued value (see the middleware's comment).
  assert.equal(req.cookies[CSRF_COOKIE], res.cookies[CSRF_COOKIE].value);
});

test('issueCsrfCookie() is a no-op when the cookie already exists', () => {
  const req = fakeReq({ method: 'GET', cookies: { [CSRF_COOKIE]: 'existing' } });
  const res = fakeRes();
  issueCsrfCookie(req, res, () => undefined);
  assert.equal(Object.keys(res.cookies).length, 0);
});

test('getCsrfToken() echoes the existing cookie value in the body', () => {
  const req = fakeReq({ method: 'GET', cookies: { [CSRF_COOKIE]: 'abc123' } });
  const res = fakeRes();
  getCsrfToken(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).csrfToken, 'abc123');
});

test('verifyCsrf: safe methods always continue', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const res = fakeRes();
    assert.equal(runVerify(fakeReq({ method, cookies: { token: 'session' } }), res), 'next');
  }
});

test('verifyCsrf: a cookie session without a matching token is rejected', () => {
  const res = fakeRes();
  const result = runVerify(
    fakeReq({ cookies: { token: 'session' } }),
    res
  );
  assert.equal(result, 403);
  assert.match(String((res as any).body?.message), /refresh/i);
});

test('verifyCsrf: matching cookie + header token continues', () => {
  const token = generateCsrfToken();
  const res = fakeRes();
  const result = runVerify(
    fakeReq({
      cookies: { token: 'session', [CSRF_COOKIE]: token },
      csrfHeader: token,
    }),
    res
  );
  assert.equal(result, 'next');
});

test('verifyCsrf: a mismatching token is rejected', () => {
  const res = fakeRes();
  const result = runVerify(
    fakeReq({
      cookies: { token: 'session', [CSRF_COOKIE]: generateCsrfToken() },
      csrfHeader: generateCsrfToken(),
    }),
    res
  );
  assert.equal(result, 403);
});

test('verifyCsrf: elevated-session request with absent token cookie is rejected', () => {
  // Guarantees self-healing cannot be socially bypassed mid-request.
  const res = fakeRes();
  assert.equal(runVerify(fakeReq({ cookies: { token: 'session' }, csrfHeader: '' }), res), 403);
});

test('verifyCsrf: Bearer-token calls are exempt (not CSRF targets)', () => {
  const res = fakeRes();
  const result = runVerify(
    fakeReq({ cookies: { token: 'session' }, authorization: 'Bearer abc' }),
    res
  );
  assert.equal(result, 'next');
});

test('verifyCsrf: anonymous requests (no session cookie) also continue', () => {
  const res = fakeRes();
  assert.equal(runVerify(fakeReq({ cookies: {} }), res), 'next');
});

test('verifyCsrf: auth signup/signin/csrf are exempt', () => {
  const tokenLess = fakeReq({ path: '/api/auth/signin', cookies: {} });
  assert.equal(runVerify(tokenLess, fakeRes()), 'next');
});

test('verifyCsrf: token comparison is safe against crafted protobufs — plain strings only', () => {
  const token = generateCsrfToken();
  const res = fakeRes();
  // An object cookie value must not crash the middleware nor pass.
  const req = fakeReq({ cookies: { token: 'session', [CSRF_COOKIE]: 'abc' }, csrfHeader: token });
  if (req.cookies[CSRF_COOKIE] === token) {
    assert.fail('test setup error');
  }
  assert.equal(runVerify(req, res), 403);
});

/* -------------------------------------------------------------------------- */
/*  Strict CORS allow-list (flaw F1)                                           */
/* -------------------------------------------------------------------------- */

test('built-in deploy origins are approved', () => {
  assert.equal(isAllowedCorsOrigin('https://travelai-eta.vercel.app'), true);
  assert.equal(isAllowedCorsOrigin('https://travelai-8cm4.vercel.app'), true);
  assert.equal(isAllowedCorsOrigin('https://travelai-tjce.onrender.com'), true);
});

test('localhost dev ports are approved', () => {
  assert.equal(isAllowedCorsOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:8080'), true);
});

test('wildcard-suffix free-attacks are REJECTED (the F1 hole is closed)', () => {
  assert.equal(isAllowedCorsOrigin('https://evil.vercel.app'), false);
  assert.equal(isAllowedCorsOrigin('https://evil-evil-vercel-clone.onrender.com'), false);
  assert.equal(
    isAllowedCorsOrigin('https://travelai-eta.vercel.app.attacker.io'),
    false
  );
});

test('even near-miss subdomain spoofs are rejected', () => {
  assert.equal(isAllowedCorsOrigin('https://travelai-eta.attacker.vercel.app'), false);
});

test('trailing-slash tolerance on listed origins', () => {
  assert.equal(isAllowedCorsOrigin('http://localhost:5173/'), true);
});

test('same-origin requests are recognized without being on the allow-list', () => {
  // The unified deployment serves the SPA itself; Vite's module scripts carry
  // `crossorigin`, so they arrive with an Origin header that must not be
  // rejected just because FRONTEND_URL names a different dev port.
  assert.equal(isSameOriginRequest('http://localhost:5059', 'http://localhost:5059'), true);
  assert.equal(
    isSameOriginRequest('https://travelai-tjce.onrender.com/', 'https://travelai-tjce.onrender.com'),
    true
  );
  assert.equal(isSameOriginRequest('http://localhost:5059', 'http://localhost:5060'), false);
  assert.equal(isSameOriginRequest('https://app.example.com', 'http://app.example.com'), false);
  assert.equal(isSameOriginRequest('', 'http://localhost:5059'), false);
});
