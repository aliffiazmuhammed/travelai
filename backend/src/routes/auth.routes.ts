import { Router } from 'express';
import { signup, signin, logout, getMe, getCsrfToken, publishChatKey } from '../controllers/auth.controller.js';
import {
  changePassword,
  getHandleAvailability,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from '../controllers/profile.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { issueCsrfCookie } from '../middleware/csrf.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { signupSchema, signinSchema } from '../schemas/auth.schema.js';
import { publishChatKeySchema } from '../schemas/chatKey.schema.js';
import { changePasswordSchema, updateProfileSchema } from '../schemas/profile.schema.js';
import { handleAvatarUpload } from '../middleware/upload.middleware.js';
import {
  authLimiter,
  avatarUploadLimiter,
  passwordChangeLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), signup);
router.post('/signin', authLimiter, validate(signinSchema), signin);
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
router.post('/password', protectPersonal, passwordChangeLimiter, validate(changePasswordSchema), changePassword);

export default router;
