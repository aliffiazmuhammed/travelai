import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { setChatPubKey } from '../services/auth.service.js';
import { changePassword as changeOwnPassword, updateDisplayName } from '../services/user/profile.js';
import { clearRealmCookie, setRealmCookie, signSessionForAccount } from '../services/auth/realm.js';
import {
  getAgencyLoginContext,
  loadAgencySession,
  projectAgencySession,
  signinAgency,
} from '../services/agency/auth.js';
import { getCsrfToken, issueCsrfCookie } from '../middleware/csrf.middleware.js';

/**
 * Agency realm auth endpoints (PA0). Mounted at `/api/agency/auth` behind the
 * same workspace feature gate as the rest of `/api/agency`.
 */

/** GET /api/agency/auth/context?workspace=<slug> — public tenant lookup. */
export const context = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const result = await getAgencyLoginContext(req.query.workspace);
  res.status(200).json({ success: true, ...result });
});

/** POST /api/agency/auth/signin — workspace + email + password. */
export const signin = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const session = await signinAgency({
    workspace: req.body?.workspace,
    email: req.body?.email,
    password: req.body?.password,
  });
  setRealmCookie(res, 'agency', session.token);
  res.status(200).json({ success: true, ...projectAgencySession(session) });
});

export const logout = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  clearRealmCookie(res, 'agency');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/** GET /api/agency/auth/me — session account, tenant and role. */
export const me = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const session = await loadAgencySession(String(req.userId));
  res.status(200).json({ success: true, ...projectAgencySession(session) });
});

/** PATCH /api/agency/auth/profile — display name only (email is immutable). */
export const updateProfile = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    await updateDisplayName(String(req.userId), req.body?.name);
    const session = await loadAgencySession(String(req.userId));
    res.status(200).json({ success: true, ...projectAgencySession(session) });
  }
);

/** PUT /api/agency/auth/chat-key — agency accounts publish their own M7 keys. */
export const publishChatKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    await setChatPubKey(String(req.userId), req.body?.pubKey);
    res.status(200).json({ success: true });
  }
);

/**
 * POST /api/agency/auth/password — change + reissue only this realm's cookie.
 * The bump to tokenVersion signs every other device out; the response keeps
 * the caller signed in.
 */
export const changePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await changeOwnPassword(
      String(req.userId),
      req.body?.currentPassword,
      req.body?.newPassword
    );
    setRealmCookie(res, 'agency', signSessionForAccount(user, 'agency'));
    res.status(200).json({
      success: true,
      message: 'Your password has been updated.',
    });
  }
);

export { getCsrfToken, issueCsrfCookie };
