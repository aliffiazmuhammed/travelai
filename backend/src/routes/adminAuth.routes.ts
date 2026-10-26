import { Router } from 'express';
import {
  changePassword,
  getCsrfToken,
  issueCsrfCookie,
  logout,
  me,
  signin,
} from '../controllers/adminAuth.controller.js';
import { protectPlatform } from '../middleware/auth.middleware.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { platformSigninSchema } from '../schemas/platform.schema.js';
import { changePasswordSchema } from '../schemas/profile.schema.js';
import {
  passwordChangeLimiter,
  platformAuthLimiter,
} from '../middleware/rateLimiter.middleware.js';

/**
 * Platform realm auth (PA1), mounted at `/api/admin/auth`.
 *
 * The flag gate is first, so disabling `PLATFORM_ADMIN_ENABLED` turns the whole
 * namespace into a 404 and cuts off login at the same time. Public bootstrap is
 * `csrf`, `signin` and `logout`; `me` and `password` require `platform_token`.
 */
const router = Router();

router.use(requirePlatformAdmin);

router.get('/csrf', issueCsrfCookie, getCsrfToken);
router.post('/signin', platformAuthLimiter, validate(platformSigninSchema), signin);
router.post('/logout', logout);

router.get('/me', protectPlatform, me);
router.post(
  '/password',
  protectPlatform,
  passwordChangeLimiter,
  validate(changePasswordSchema),
  changePassword
);

export default router;
