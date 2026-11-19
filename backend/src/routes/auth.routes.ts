import { Router } from 'express';
import {
  signup,
  signin,
  logout,
  getMe,
  getAuthConfig,
  getCsrfToken,
  publishChatKey,
} from '../controllers/auth.controller.js';
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
  validateResetToken,
} from '../controllers/passwordReset.controller.js';
import {
  createAccountDeletionRequest,
  getAccountDeletionRequest,
} from '../controllers/accountDeletion.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { issueCsrfCookie } from '../middleware/csrf.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  accountDeletionRequestSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signupSchema,
  signinSchema,
  validateResetTokenSchema,
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
  deletionRequestLimiter,
  passwordChangeLimiter,
  keyBackupLimiter,
  resetTokenLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Public capability document: current policy versions, consent enforcement and
// (later) the enabled sign-in methods. Anonymous by design — the consent page
// and the sign-up form both need it before a session exists.
router.get('/config', getAuthConfig);
router.post('/signup', authLimiter, validate(signupSchema), signup);
router.post('/signin', authLimiter, validate(signinSchema), signin);
// Personal self-service reset. The request endpoint never reveals whether the
// address exists; the reset endpoint consumes a single-use hashed token.
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
// Read-only preflight: the reset page rejects a dead link before showing the
// password form. Never claims the token, so refreshes cannot burn it.
router.post('/reset-password/validate', resetTokenLimiter, validate(validateResetTokenSchema), validateResetToken);
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

// Account deletion is a support-queue request in Phase 4, not self-serve
// deletion (D-F). The route records the request and never removes data.
router.get('/account-deletion-request', protectPersonal, getAccountDeletionRequest);
router.post(
  '/account-deletion-request',
  protectPersonal,
  deletionRequestLimiter,
  validate(accountDeletionRequestSchema),
  createAccountDeletionRequest
);

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
