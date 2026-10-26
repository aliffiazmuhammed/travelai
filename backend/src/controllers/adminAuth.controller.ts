import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { changePassword as changeOwnPassword } from '../services/user/profile.js';
import {
  clearRealmCookie,
  setRealmCookie,
  signSessionForAccount,
} from '../services/auth/realm.js';
import {
  loadPlatformSession,
  signinPlatform,
} from '../services/platform/auth.js';
import { recordPlatformAudit } from '../services/platform/audit.js';
import { getCsrfToken, issueCsrfCookie } from '../middleware/csrf.middleware.js';

/**
 * Platform realm auth endpoints (PA1). Mounted at `/api/admin/auth` behind the
 * `PLATFORM_ADMIN_ENABLED` gate. `platform_token` is the only credential any
 * admin route accepts; personal and agency sessions never reach this realm.
 */

function clientContext(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  };
}

/** POST /api/admin/auth/signin — platform super-admin email + password. */
export const signin = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const session = await signinPlatform({
      email: req.body?.email,
      password: req.body?.password,
    });
    setRealmCookie(res, 'platform', session.token);

    await recordPlatformAudit({
      actorId: session.user._id,
      action: 'platform.signin',
      targetType: 'platform_account',
      targetId: session.user._id,
      metadata: { email: session.user.email },
      ...clientContext(req),
    });

    res.status(200).json({ success: true, user: session.user });
  }
);

export const logout = catchAsync(
  async (_req: AuthenticatedRequest, res: Response) => {
    clearRealmCookie(res, 'platform');
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  }
);

/** GET /api/admin/auth/me — the signed-in platform account. */
export const me = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const session = await loadPlatformSession(String(req.userId));
  res.status(200).json({ success: true, ...session });
});

/**
 * POST /api/admin/auth/password — change and reissue only the platform cookie.
 * The `tokenVersion` bump invalidates every other platform device.
 */
export const changePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await changeOwnPassword(
      String(req.userId),
      req.body?.currentPassword,
      req.body?.newPassword
    );
    setRealmCookie(res, 'platform', signSessionForAccount(user, 'platform'));

    await recordPlatformAudit({
      actorId: String(req.userId),
      action: 'platform.password_changed',
      targetType: 'platform_account',
      targetId: String(req.userId),
      ...clientContext(req),
    });

    res.status(200).json({
      success: true,
      message: 'Your password has been updated.',
    });
  }
);

export { getCsrfToken, issueCsrfCookie };
