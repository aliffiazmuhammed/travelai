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

export { getCsrfToken } from '../middleware/csrf.middleware.js';
export { getCookieOptions, SESSION_DURATION_MS };

export const signup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name } = req.body;
  const { user, token } = await authService.signup(email, password, name);
  setRealmCookie(res, 'personal', token);
  res.status(201).json({ success: true, user });
});

export const signin = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signin(email, password);
  setRealmCookie(res, 'personal', token);
  res.status(200).json({ success: true, user });
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
