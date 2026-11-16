import type { Request } from 'express';

/**
 * Native shells cannot be relied on to persist httpOnly cookies, so the mobile
 * client opts into a Bearer session by sending this header on sign-in. Browser
 * requests never send it, which keeps the JWT out of web JavaScript even though
 * the guards already accept Bearer tokens.
 */
export const MOBILE_CLIENT_HEADER = 'x-client';

export function wantsTokenInBody(req: Pick<Request, 'get'>): boolean {
  const value = req.get(MOBILE_CLIENT_HEADER);
  return typeof value === 'string' && value.trim().toLowerCase() === 'mobile';
}
