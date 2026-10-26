import { Router } from 'express';
import {
  changePassword,
  context,
  getCsrfToken,
  issueCsrfCookie,
  logout,
  me,
  publishChatKey,
  signin,
  updateProfile,
} from '../controllers/agencyAuth.controller.js';
import { protectAgency } from '../middleware/auth.middleware.js';
import { requireAgencyWorkspace } from '../middleware/agencyWorkspace.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { agencySigninSchema } from '../schemas/agency.schema.js';
import { publishChatKeySchema } from '../schemas/chatKey.schema.js';
import { changePasswordSchema, updateProfileSchema } from '../schemas/profile.schema.js';
import {
  agencyAuthLimiter,
  passwordChangeLimiter,
} from '../middleware/rateLimiter.middleware.js';

/**
 * Agency realm auth (PA0), mounted at `/api/agency/auth`.
 *
 * The workspace gate is first, so disabling `AGENCY_WORKSPACE_ENABLED` kills
 * agency login along with the rest of the namespace. Public bootstrap paths are
 * `context`, `csrf`, `signin`, `logout`; everything else is agency-session only.
 */
const router = Router();

router.use(requireAgencyWorkspace);

router.get('/context', context);
router.get('/csrf', issueCsrfCookie, getCsrfToken);
router.post('/signin', agencyAuthLimiter, validate(agencySigninSchema), signin);
router.post('/logout', logout);

router.get('/me', protectAgency, me);
router.patch('/profile', protectAgency, validate(updateProfileSchema), updateProfile);
router.put('/chat-key', protectAgency, validate(publishChatKeySchema), publishChatKey);
router.post(
  '/password',
  protectAgency,
  passwordChangeLimiter,
  validate(changePasswordSchema),
  changePassword
);

export default router;
