import { Response } from 'express';
import * as authService from '../services/auth.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  clearRealmCookie,
  getCookieOptions,
  SESSION_DURATION_MS,
  setRealmCookie,
} from '../services/auth/realm.js';
import { wantsTokenInBody } from '../services/auth/clientSession.js';
import {
  AUTH_PRIVACY_PATH,
  AUTH_PRIVACY_VERSION,
  AUTH_TERMS_PATH,
  AUTH_TERMS_VERSION,
} from '../config/authPolicy.js';
import { env } from '../config/env.js';
import { PASSWORD_POLICY } from '../services/auth/passwordPolicy.js';

export { getCsrfToken } from '../middleware/csrf.middleware.js';
export { getCookieOptions, SESSION_DURATION_MS };

/**
 * Public auth capability document (Phase 1B / decision D-19).
 *
 * Clients render the policy versions the server will actually accept, so a
 * copy change does not require an app release to keep consent records honest.
 * Nothing here is secret: it is the same text a visitor can read on `/terms`
 * and `/privacy`.
 */
export const getAuthConfig = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    success: true,
    consentRequired: env.AUTH_LEGAL_CONSENT_REQUIRED,
    legal: {
      termsVersion: AUTH_TERMS_VERSION,
      privacyVersion: AUTH_PRIVACY_VERSION,
      termsPath: AUTH_TERMS_PATH,
      privacyPath: AUTH_PRIVACY_PATH,
    },
    // Clients render the same floor and copy the API enforces. Numbers only;
    // the common-password list stays server-side.
    password: PASSWORD_POLICY,
  });
});

/**
 * Sign-up/sign-in return the JWT in the body only when the caller identifies
 * as the native client; browsers keep the httpOnly cookie response.
 */
function sessionPayload(req: AuthenticatedRequest, user: unknown, token: string) {
  return wantsTokenInBody(req) ? { success: true, user, token } : { success: true, user };
}

export const signup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, consent } = req.body;
  const { user, token } = await authService.signup(email, password, name, consent);
  setRealmCookie(res, 'personal', token);
  res.status(201).json(sessionPayload(req, user, token));
});

export const signin = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signin(email, password);
  setRealmCookie(res, 'personal', token);
  res.status(200).json(sessionPayload(req, user, token));
});

export const logout = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  clearRealmCookie(res, 'personal');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const getMe = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getUserById(req.userId!);
  res.status(200).json({ success: true, user });
});

/**
 * PUT /api/auth/chat-key — publish this browser's chat key half (F10 E2EE).
 *
 * The browser mints an ECDH P-256 keypair locally; only the public half
 * arrives here. It is how members' browsers can envelope the conversation key
 * for one another through the server without the server ever learning the
 * private half or the conversation key. Idempotent by design: re-publishing the
 * same key is a no-op; a new key means a re-imported backup or a fresh
 * identity (old envelopes for the previous key become unwrappable, which the
 * key-backup flow exists to prevent).
 */
export const publishChatKey = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  await authService.setChatPubKey(String(req.userId), req.body?.pubKey);
  res.status(200).json({ success: true });
});
