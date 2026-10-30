import { Router } from 'express';
import {
  accountDetail,
  createPlatformAccount,
  listAccounts,
  listPlatformAccounts,
  overview,
  resetAccountPassword,
  updateAccountStatus,
  updatePlatformAccount,
} from '../controllers/adminAccounts.controller.js';
import {
  agencyDetail,
  agencyOwnerPreview,
  agencyPlans,
  createAgencyTenant,
  hideAgencyPackage,
  hideAgencyProfile,
  inviteAgencyMember,
  listAgencies,
  platformAudit,
  removeAgencyMember,
  resetAgencyMemberPassword,
  restoreAgencyPackage,
  restoreAgencyProfile,
  transferAgencyOwner,
  unverifyAgencyProfile,
  updateAgencyMemberRole,
  updateAgencyPlan,
  updateAgencyStatus,
  verifyAgencyProfile,
} from '../controllers/adminAgencies.controller.js';
import {
  approveApplication,
  listApplications,
  rejectApplication,
} from '../controllers/adminAgencyApplications.controller.js';
import {
  dismissReportedContent,
  hideReportedContent,
  listReports,
} from '../controllers/adminModeration.controller.js';
import { protectPlatform } from '../middleware/auth.middleware.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.middleware.js';
import {
  agencyCreateLimiter,
  platformWriteLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  accountStatusSchema,
  createPlatformAccountSchema,
  updatePlatformAccountSchema,
} from '../schemas/platformAccounts.schema.js';
import {
  agencyMemberInviteSchema,
  agencyMemberRoleSchema,
  agencyOwnerTransferSchema,
  agencyPlanChangeSchema,
  agencyStatusSchema,
  createAgencyTenantSchema,
} from '../schemas/platformAgencies.schema.js';

/**
 * Platform directory and account management (PA2), mounted at `/api/admin`.
 *
 * The kill switch is first and repeated here, exactly like the auth router, so
 * a future mount cannot silently expose the directory. `protectPlatform` then
 * requires a live `platform_token` and blocks the surface until a bootstrapped
 * admin has replaced their temporary password.
 */
const router = Router();

router.use(requirePlatformAdmin);
router.use(protectPlatform);

router.get('/overview', overview);

// G6 moderation. Reported content only: these routes never list the personal
// trip directory, and every decision is written to the platform audit trail.
router.get('/reports', listReports);
router.post(
  '/reports/:targetType/:targetId/hide',
  platformWriteLimiter,
  hideReportedContent
);
router.post(
  '/reports/:targetType/:targetId/dismiss',
  platformWriteLimiter,
  dismissReportedContent
);

// PA6 public agency applications. Approval runs the same provisioning
// primitive as a hand-onboarded agency and returns its one-time password;
// rejection keeps the row plus an internal note.
router.get('/applications', listApplications);
router.post(
  '/applications/:id/approve',
  platformWriteLimiter,
  approveApplication
);
router.post(
  '/applications/:id/reject',
  platformWriteLimiter,
  rejectApplication
);

// PA3 agency provisioning plus PA4 lifecycle/access operations. Static agency
// paths are declared before `/:id` so they can never be read as a tenant id.
// Creation is the one place a tenant, an agency account and an owner membership
// are born together.
router.get('/agencies', listAgencies);
router.get('/agencies/plans', agencyPlans);
router.get('/agencies/owner-preview', agencyOwnerPreview);
router.post(
  '/agencies',
  platformWriteLimiter,
  agencyCreateLimiter,
  validate(createAgencyTenantSchema),
  createAgencyTenant
);
router.get('/agencies/:id', agencyDetail);
router.patch(
  '/agencies/:id/status',
  platformWriteLimiter,
  validate(agencyStatusSchema),
  updateAgencyStatus
);
router.patch(
  '/agencies/:id/plan',
  platformWriteLimiter,
  validate(agencyPlanChangeSchema),
  updateAgencyPlan
);
router.post(
  '/agencies/:id/members/invite',
  platformWriteLimiter,
  validate(agencyMemberInviteSchema),
  inviteAgencyMember
);
router.patch(
  '/agencies/:id/members/:userId',
  platformWriteLimiter,
  validate(agencyMemberRoleSchema),
  updateAgencyMemberRole
);
router.delete(
  '/agencies/:id/members/:userId',
  platformWriteLimiter,
  removeAgencyMember
);
router.post(
  '/agencies/:id/members/:userId/transfer-owner',
  platformWriteLimiter,
  validate(agencyOwnerTransferSchema),
  transferAgencyOwner
);
router.post(
  '/agencies/:id/members/:userId/reset-password',
  platformWriteLimiter,
  resetAgencyMemberPassword
);

// M9 D7 directory operations. Verification is a badge only; a hide takes the
// profile or one package off every public surface (listing, facets, direct URL,
// cover bytes) until ops restores it. Every action is audited.
router.post(
  '/agencies/:id/directory/verify',
  platformWriteLimiter,
  verifyAgencyProfile
);
router.post(
  '/agencies/:id/directory/unverify',
  platformWriteLimiter,
  unverifyAgencyProfile
);
router.post(
  '/agencies/:id/directory/hide',
  platformWriteLimiter,
  hideAgencyProfile
);
router.post(
  '/agencies/:id/directory/restore',
  platformWriteLimiter,
  restoreAgencyProfile
);
router.post(
  '/agencies/:id/directory/packages/:packageId/hide',
  platformWriteLimiter,
  hideAgencyPackage
);
router.post(
  '/agencies/:id/directory/packages/:packageId/restore',
  platformWriteLimiter,
  restoreAgencyPackage
);

// PA4 audit viewer. Platform action history only; tenant audit rows stay in the
// tenant's own viewer and are never a back door to tenant content.
router.get('/audit', platformAudit);

router.get('/accounts', listAccounts);
router.get('/accounts/:id', accountDetail);
router.patch(
  '/accounts/:id/status',
  platformWriteLimiter,
  validate(accountStatusSchema),
  updateAccountStatus
);
router.post(
  '/accounts/:id/reset-password',
  platformWriteLimiter,
  resetAccountPassword
);

router.get('/platform-accounts', listPlatformAccounts);
router.post(
  '/platform-accounts',
  platformWriteLimiter,
  validate(createPlatformAccountSchema),
  createPlatformAccount
);
router.patch(
  '/platform-accounts/:id',
  platformWriteLimiter,
  validate(updatePlatformAccountSchema),
  updatePlatformAccount
);

export default router;
