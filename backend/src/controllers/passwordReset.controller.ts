import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import {
  requestPersonalPasswordReset,
  resetPasswordWithToken,
} from '../services/auth/passwordReset.js';
import { publicUser } from '../services/user/profile.js';
import { setRealmCookie, signSessionForAccount } from '../services/auth/realm.js';

const SAME_ANSWER =
  'If an account exists for that email, a reset link is on its way. Check your inbox in a moment.';

/** POST /api/auth/forgot-password — always the same answer (no enumeration). */
export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await requestPersonalPasswordReset(req.body?.email);
  res.status(200).json({ success: true, message: SAME_ANSWER });
});

/** POST /api/auth/reset-password — consume the link and sign the user in. */
export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const user = await resetPasswordWithToken(req.body?.token, req.body?.password);
  // The reset bumped tokenVersion; issue a fresh personal session for this device.
  setRealmCookie(res, 'personal', signSessionForAccount(user, 'personal'));
  res.status(200).json({
    success: true,
    message: 'Your password is updated. You are signed in.',
    user: publicUser(user),
  });
});
