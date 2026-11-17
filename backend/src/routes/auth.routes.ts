import { Router } from 'express';
import { signup, signin, logout, getMe, getCsrfToken, publishChatKey } from '../controllers/auth.controller.js';
import {
  changePassword,
  getHandleAvailability,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from '../controllers/profile.controller.js';
import {
  forgotPassword,
  resetPassword,
} from '../controllers/passwordReset.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { issueCsrfCookie } from '../middleware/csrf.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signupSchema,
  signinSchema,
} from '../schemas/auth.schema.js';
import { publishChatKeySchema } from '../schemas/chatKey.schema.js';
import { personalChangePasswordSchema, updateProfileSchema } from '../schemas/profile.schema.js';
import { requireTripRole } from '../middleware/tripAccess.middleware.js';
import { enrollKeyBackupSchema, recoverKeyBackupSchema, putTripKeyBackupSchema } from '../schemas/keyBackup.schema.js';
import {
  backupBodyLimit, getKeyBackup, enrollKeyBackup, recoverKeyBackup,
  getKeyBackupEpochs, getKeyBackupTrips, getKeyBackupRows, putKeyBackupRow,
} from '../controllers/keyBackup.controller.js';
import { handleAvatarUpload } from '../middleware/upload.middleware.js';
import {
  authLimiter,
  avatarUploadLimiter,
  passwordChangeLimiter,
  keyBackupLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), signup);
router.post('/signin', authLimiter, validate(signinSchema), signin);
// Personal self-service reset. The request endpoint never reveals whether the
// address exists; the reset endpoint consumes a single-use hashed token.
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/logout', logout);
// CSRF bootstrap: hands the token to cross-origin SPAs in the body, because a
// cross-site client cannot read the `csrf` cookie set on this origin. The
// cookie is issued app-wide by `issueCsrfCookie`; this route just re-issues
// when missing and echoes the value.
router.get('/csrf', issueCsrfCookie, getCsrfToken);
router.get('/me', protectPersonal, getMe);
// Chat identity (Milestone 7, F10): the browser publishes ONLY its public
// ECDH key half. The private half never travels — that is the E2EE premise.
router.put('/chat-key', protectPersonal, validate(publishChatKeySchema), publishChatKey);

// Profile (Milestone 7, F14). `protectPersonal` runs first on every route so the
// user-keyed limiters below can key on the account, not on a shared IP.
router.patch('/profile', protectPersonal, validate(updateProfileSchema), updateProfile);
// Public traveler handle (Milestone 8 G1): answers `available`/`reason` instead
// of failing validation, so the settings field can give live feedback.
router.get('/profile/handle-available', protectPersonal, getHandleAvailability);
router.post('/avatar', protectPersonal, avatarUploadLimiter, handleAvatarUpload, uploadAvatar);
router.delete('/avatar', protectPersonal, removeAvatar);
router.post('/password', protectPersonal, passwordChangeLimiter, backupBodyLimit, validate(personalChangePasswordSchema), changePassword);

// Personal first, trip guard second: a dual-cookie browser must never select
// its agency identity for personal recovery (including agency-trip collaborators).
router.get('/key-backup', protectPersonal, keyBackupLimiter, getKeyBackup);
router.post('/key-backup', protectPersonal, keyBackupLimiter, passwordChangeLimiter, backupBodyLimit, validate(enrollKeyBackupSchema), enrollKeyBackup);
router.post('/key-backup/recover', protectPersonal, keyBackupLimiter, passwordChangeLimiter, backupBodyLimit, validate(recoverKeyBackupSchema), recoverKeyBackup);
router.get('/key-backup/trips', protectPersonal, keyBackupLimiter, getKeyBackupTrips);
router.get('/key-backup/trips/:id/epochs', protectPersonal, requireTripRole('viewer'), keyBackupLimiter, getKeyBackupEpochs);
router.get('/key-backup/trips/:id/backups', protectPersonal, requireTripRole('viewer'), keyBackupLimiter, getKeyBackupRows);
router.put('/key-backup/trips/:id/backups/:epoch', protectPersonal, requireTripRole('viewer'), keyBackupLimiter, backupBodyLimit, validate(putTripKeyBackupSchema), putKeyBackupRow);

export default router;
