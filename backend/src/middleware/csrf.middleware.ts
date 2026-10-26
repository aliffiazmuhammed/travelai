import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ALL_SESSION_COOKIES } from '../services/auth/realm.js';

/**
 * CSRF defense for cookie-based auth (Milestone 6 E1.0 — flaw F1).
 *
 * Why it exists: production cookies are `SameSite=None` because the SPA is
 * deployed cross-origin (vercel.app frontend, onrender.com API). That makes the
 * browser happy to attach the session cookie to a cross-site request, so a
 * malicious origin can issue *forged writes* against the API even though CORS
 * stops it from reading responses. `SameSite=Strict` would fix it, but it would
 * also sign every user out of the legitimate split deployment (the SPA's cross
 * -origin `fetch` would stop sending the cookie).
 *
 * Double-submit pattern, chosen precisely because it works cross-origin:
 *
 * 1. `/api/auth/me` (and this module opportunistically) issues a random,
 *    JS-readable `csrf` cookie — `SameSite=Lax`, so the browser never attaches
 *    it to a cross-site request.
 * 2. `GET /api/auth/csrf` returns the token in the body so a cross-origin SPA
 *    can hold it in memory (CORS protects that response from other origins).
 * 3. Every state-changing request must echo it in `X-CSRF-Token`.
 *
 * An attacker page can neither read the cross-site response (strict CORS) nor
 * set the header, so forged writes fail. Requests authenticated with a Bearer
 * token are exempt — CSRF is not transferable to that channel.
 */

export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Always exempt regardless of method — no session exists yet / self-healing. */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/signup',
  '/api/auth/signin',
  '/api/auth/logout',
  '/api/auth/csrf',
  // PA0 agency realm bootstrap. Each realm's signin/logout/csrf are exempt;
  // leaving one out would silently CSRF-exempt its cookie-authenticated writes.
  '/api/agency/auth/signin',
  '/api/agency/auth/logout',
  '/api/agency/auth/csrf',
  // PA1 platform realm bootstrap. The admin namespace is gated separately, but
  // these three paths must stay usable before a `platform_token` exists.
  '/api/admin/auth/signin',
  '/api/admin/auth/logout',
  '/api/admin/auth/csrf',
  '/api/health',
]);

/** Exact match, minus one trailing slash, so `/signin-evil` is never exempt. */
function isCsrfExemptPath(path: string): boolean {
  const normalized =
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return CSRF_EXEMPT_PATHS.has(normalized);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfCookieOptions() {
  return {
    httpOnly: false as const, // must be readable by the SPA's JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // never attached to a cross-site request
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Generates the next CSRF token. */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const safeEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length || leftBytes.length === 0) return false;
  return crypto.timingSafeEqual(leftBytes, rightBytes);
};

/**
 * Sets the CSRF cookie when it is missing so any client recovers on its next
 * request instead of being wedged until the next login (also covers users whose
 * sessions predate the rollout).
 */
export const issueCsrfCookie = (req: Request, res: Response, next: NextFunction) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
    // Same request flow must see the value it just set.
    req.cookies[CSRF_COOKIE] = token;
  }
  next();
};

/** Returns the current token in the body (cross-origin SPA bootstrap point). */
export const getCsrfToken = (req: Request, res: Response) => {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = existing ?? generateCsrfToken();
  if (!existing) {
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  }
  return res.status(200).json({ success: true, csrfToken: token });
};

/**
 * Verifies double-submitted tokens on writes. Registered before the API
 * routers; `OPTIONS` preflights are handled before this by `cors`.
 */
export const verifyCsrf = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();

  // Bearer-token callers are not CSRF targets and may not have cookie access.
  if (req.get?.('authorization')?.startsWith('Bearer ')) return next();

  if (isCsrfExemptPath(req.path)) return next();

  const sessionCookie = ALL_SESSION_COOKIES.some((name) => Boolean(req.cookies?.[name]));
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = (req.get(CSRF_HEADER) || '') as string;

  // A request logged-in via cookie (the CSRF target) must prove possession.
  // Every realm cookie counts: an agency or platform session must not inherit
  // the personal realm's exemption.
  if (sessionCookie) {
    if (cookieToken && safeEqual(cookieToken, headerToken)) {
      return next();
    }
    const message =
      'Your session needs a refresh for security. Please reload the page and try again.';
    return res.status(403).json({ success: false, error: message, message });
  }

  return next();
};
