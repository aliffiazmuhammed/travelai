import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  changePassword as changeOwnPassword,
  clearAvatar,
  replaceAvatar,
  updateDisplayName,
} from '../services/user/profile.js';
import { setRealmCookie, signSessionForAccount } from '../services/auth/realm.js';

/**
 * Profile editing (Milestone 7, F14). Every handler answers with the caller's
 * own projection, so the SPA can swap its cached user in one assignment.
 */

/** PATCH /api/auth/profile — set (or clear) the display name. */
export const updateProfile = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await updateDisplayName(String(req.userId), req.body?.name);
  res.status(200).json({ success: true, user });
});

/** POST /api/auth/password — current password plus the new one. */
export const changePassword = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await changeOwnPassword(
    String(req.userId),
    req.body?.currentPassword,
    req.body?.newPassword
  );
  // The password change bumped tokenVersion; reissue THIS realm's cookie so the
  // caller stays signed in while every other device is signed out.
  setRealmCookie(res, 'personal', signSessionForAccount(user, 'personal'));
  res.status(200).json({
    success: true,
    message: 'Your password has been updated.',
  });
});

/** POST /api/auth/avatar — multipart `avatar`, image bytes only. */
export const uploadAvatar = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const file = (req as any).file as { buffer?: Buffer; mimetype?: string } | undefined;
  const user = await replaceAvatar(String(req.userId), file?.buffer, file?.mimetype);
  res.status(200).json({ success: true, user });
});

/** DELETE /api/auth/avatar — back to initials. */
export const removeAvatar = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await clearAvatar(String(req.userId));
  res.status(200).json({ success: true, user });
});
