import { Router } from 'express';
import {
  acceptAgencyInvite,
  changeAgencyMemberRoleHandler,
  createAgency,
  createAgencyInviteHandler,
  getAgency,
  getAgencyInvitePreview,
  listAgencies,
  listAgencyInvitesHandler,
  listAgencyMembersHandler,
  removeAgencyMemberHandler,
  revokeAgencyInviteHandler,
  updateAgency,
} from '../controllers/agency.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireAgencyWorkspace } from '../middleware/agencyWorkspace.middleware.js';
import {
  requireAgencyMember,
  requireAgencyRole,
} from '../middleware/agencyAccess.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  changeAgencyMemberRoleSchema,
  createAgencyInviteSchema,
  createAgencySchema,
  updateAgencySchema,
} from '../schemas/agency.schema.js';
import {
  agencyCreateLimiter,
  inviteAcceptLimiter,
  inviteManageLimiter,
  invitePreviewLimiter,
} from '../middleware/rateLimiter.middleware.js';

/**
 * Agency Workspace API namespace (A1).
 *
 * ALL routes are behind `requireAgencyWorkspace`, so flipping the feature flag
 * off is an immediate kill switch: every path answers 404, including status.
 *
 * Tenant-scoped routes (`/:agencyId/...`) additionally carry
 * `requireAgencyMember` or `requireAgencyRole`. The route coverage test in
 * `src/routes/agency.routes.test.ts` fails CI if a future route forgets one.
 */
const router = Router();

router.use(requireAgencyWorkspace);

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    workspace: 'agency',
    milestone: 'A1',
    writesEnabled: true,
  });
});

// Token-identified invitation endpoints. Declared before `/:agencyId` so
// "invites" is never interpreted as an agency id.
router.get('/invites/:token', protect, invitePreviewLimiter, getAgencyInvitePreview);
router.post(
  '/invites/:token/accept',
  protect,
  inviteAcceptLimiter,
  acceptAgencyInvite
);

// The caller's agencies + onboarding.
router.get('/', protect, listAgencies);
router.post(
  '/',
  protect,
  agencyCreateLimiter,
  validate(createAgencySchema),
  createAgency
);

// Tenant-scoped read/update.
router.get('/:agencyId', protect, requireAgencyMember(), getAgency);
router.patch(
  '/:agencyId',
  protect,
  requireAgencyRole('admin'),
  validate(updateAgencySchema),
  updateAgency
);

// Team management.
router.get(
  '/:agencyId/members',
  protect,
  requireAgencyMember(),
  listAgencyMembersHandler
);
router.patch(
  '/:agencyId/members/:userId',
  protect,
  requireAgencyRole('admin'),
  validate(changeAgencyMemberRoleSchema),
  changeAgencyMemberRoleHandler
);
router.delete(
  '/:agencyId/members/:userId',
  protect,
  requireAgencyRole('admin'),
  removeAgencyMemberHandler
);

// Pending invitations. Emails are delivered manually in v1; the copied link is
// the delivery mechanism.
router.get(
  '/:agencyId/invites',
  protect,
  requireAgencyRole('admin'),
  listAgencyInvitesHandler
);
router.post(
  '/:agencyId/invites',
  protect,
  requireAgencyRole('admin'),
  inviteManageLimiter,
  validate(createAgencyInviteSchema),
  createAgencyInviteHandler
);
router.delete(
  '/:agencyId/invites/:inviteId',
  protect,
  requireAgencyRole('admin'),
  revokeAgencyInviteHandler
);

export default router;
