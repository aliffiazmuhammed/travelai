import { Router } from 'express';
import {
  acceptAgencyInvite,
  acceptAgencyQuoteHandler,
  activateAgencyTemplateVersionHandler,
  addAgencyTemplateVersionHandler,
  archiveAgencyTemplateHandler,
  archiveAgencyTripHandler,
  cancelAgencyQuoteHandler,
  changeAgencyMemberRoleHandler,
  createAgency,
  createAgencyClientHandler,
  createAgencyExportHandler,
  createAgencyInviteHandler,
  createAgencyProposalLinkHandler,
  createAgencyTemplateHandler,
  createAgencyTripHandler,
  deleteAgencyAssetHandler,
  deleteAgencyClientHandler,
  downloadAgencyExportHandler,
  downloadAgencyProposalHandler,
  getAgency,
  getAgencyAssetContentHandler,
  getAgencyInvitePreview,
  getAgencyProposalHandler,
  getAgencyQuoteHandler,
  getAgencyTripHandler,
  getAgencyUsageHandler,
  listAgencies,
  listAgencyAssetsHandler,
  listAgencyAuditHandler,
  listAgencyClientsHandler,
  listAgencyDeletedTripsHandler,
  listAgencyExportsHandler,
  listAgencyInvitesHandler,
  listAgencyMembersHandler,
  listAgencyProposalLinksHandler,
  listAgencyQuoteVersionsHandler,
  listAgencyTemplatesHandler,
  listAgencyTemplateVersionsHandler,
  listAgencyTripsHandler,
  previewAgencyExportHandler,
  previewAgencyTemplateVersionHandler,
  removeAgencyMemberHandler,
  retryAgencyExportHandler,
  revokeAgencyInviteHandler,
  revokeAgencyProposalLinkHandler,
  acceptAgencyProposalHandler,
  saveAgencyQuoteHandler,
  sendAgencyQuoteHandler,
  setDefaultAgencyTemplateHandler,
  updateAgency,
  updateAgencyClientHandler,
  updateAgencyPlanHandler,
  updateAgencyTemplateHandler,
  updateAgencyTripHandler,
  unarchiveAgencyTripHandler,
  uploadAgencyAssetHandler,
} from '../controllers/agency.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { deleteTrip, purgeTrip, restoreTrip } from '../controllers/itinerary.controller.js';
import { requireAgencyWorkspace } from '../middleware/agencyWorkspace.middleware.js';
import {
  requireAgencyMember,
  requireAgencyRole,
  requireAgencyTripRole,
} from '../middleware/agencyAccess.middleware.js';
import {
  handleAgencyAssetUpload,
  handleAgencyTemplateUpload,
} from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  addAgencyTemplateVersionSchema,
  changeAgencyMemberRoleSchema,
  createAgencyAssetSchema,
  createAgencyClientSchema,
  createAgencyExportSchema,
  createAgencyInviteSchema,
  createAgencyProposalLinkSchema,
  createAgencySchema,
  createAgencyTemplateSchema,
  createAgencyTripSchema,
  previewAgencyTemplateVersionSchema,
  saveAgencyQuoteSchema,
  updateAgencyClientSchema,
  updateAgencyPlanSchema,
  updateAgencySchema,
  updateAgencyTemplateSchema,
  updateAgencyTripSchema,
} from '../schemas/agency.schema.js';
import {
  agencyAssetUploadAgencyLimiter,
  agencyAssetUploadLimiter,
  agencyCreateLimiter,
  agencyExportLimiter,
  agencyInviteCreateLimiter,
  agencyTemplateUploadLimiter,
  agencyWideExportLimiter,
  inviteAcceptLimiter,
  inviteManageLimiter,
  invitePreviewLimiter,
  proposalAcceptLimiter,
  publicShareLimiter,
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
    milestone: 'A8',
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

// Public proposal shares (A7). No session and no tenant guard: the 256-bit
// token is the only capability, and the service pins the exact quote and
// export the link was minted for. Declared before `/:agencyId` for the same
// reason as invites; every write path (accept) is bounded by its own limiter.
router.get(
  '/proposals/:token',
  publicShareLimiter,
  getAgencyProposalHandler
);
router.post(
  '/proposals/:token/accept',
  proposalAcceptLimiter,
  acceptAgencyProposalHandler
);
router.get(
  '/proposals/:token/pdf',
  publicShareLimiter,
  downloadAgencyProposalHandler
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

// Brand assets (A3). Members can view the library; only admins can add or
// remove bytes. The content endpoint is authenticated, so an asset URL never
// works without a tenant membership check.
router.get(
  '/:agencyId/assets',
  protect,
  requireAgencyMember(),
  listAgencyAssetsHandler
);
router.post(
  '/:agencyId/assets',
  protect,
  requireAgencyRole('admin'),
  agencyAssetUploadLimiter,
  agencyAssetUploadAgencyLimiter,
  handleAgencyAssetUpload,
  validate(createAgencyAssetSchema),
  uploadAgencyAssetHandler
);
router.delete(
  '/:agencyId/assets/:assetId',
  protect,
  requireAgencyRole('admin'),
  deleteAgencyAssetHandler
);
router.get(
  '/:agencyId/assets/:assetId/content',
  protect,
  requireAgencyMember(),
  getAgencyAssetContentHandler
);

// Client directory (A4). Everyone can read the address book; planners manage
// it. Directory records never grant trip access.
router.get(
  '/:agencyId/clients',
  protect,
  requireAgencyMember(),
  listAgencyClientsHandler
);
router.post(
  '/:agencyId/clients',
  protect,
  requireAgencyRole('planner'),
  validate(createAgencyClientSchema),
  createAgencyClientHandler
);
router.patch(
  '/:agencyId/clients/:clientId',
  protect,
  requireAgencyRole('planner'),
  validate(updateAgencyClientSchema),
  updateAgencyClientHandler
);
router.delete(
  '/:agencyId/clients/:clientId',
  protect,
  requireAgencyRole('planner'),
  deleteAgencyClientHandler
);

// Document templates and proposal exports (A5/A6). Every member can pick an
// active client template and read history; generating needs planner rank, and
// internal desk copies are narrowed again to admin inside the service.
// Uploading, previewing, activating, archiving and defaulting a custom
// template is admin-only. Previews render the uploaded HTML, and exports start
// a browser process, so both paths stay behind their own rate limits.
router.get(
  '/:agencyId/templates',
  protect,
  requireAgencyMember(),
  listAgencyTemplatesHandler
);
router.post(
  '/:agencyId/templates',
  protect,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  handleAgencyTemplateUpload,
  validate(createAgencyTemplateSchema),
  createAgencyTemplateHandler
);
router.patch(
  '/:agencyId/templates/:templateId',
  protect,
  requireAgencyRole('admin'),
  validate(updateAgencyTemplateSchema),
  updateAgencyTemplateHandler
);
router.get(
  '/:agencyId/templates/:templateId/versions',
  protect,
  requireAgencyRole('admin'),
  listAgencyTemplateVersionsHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions',
  protect,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  handleAgencyTemplateUpload,
  validate(addAgencyTemplateVersionSchema),
  addAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/:version/preview',
  protect,
  requireAgencyRole('admin'),
  validate(previewAgencyTemplateVersionSchema),
  previewAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/:version/activate',
  protect,
  requireAgencyRole('admin'),
  activateAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/archive',
  protect,
  requireAgencyRole('admin'),
  archiveAgencyTemplateHandler
);
router.post(
  '/:agencyId/templates/:templateId/default',
  protect,
  requireAgencyRole('admin'),
  setDefaultAgencyTemplateHandler
);
router.get(
  '/:agencyId/trips/:tripId/exports',
  protect,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyExportsHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports/preview',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyExportSchema),
  previewAgencyExportHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyExportSchema),
  createAgencyExportHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports/:exportId/retry',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  retryAgencyExportHandler
);
// Signed, short-lived staff download. The route has no `:tripId`, so the
// tenant boundary is membership + the service's agencyId scope + signature.
router.get(
  '/:agencyId/exports/:exportId/download',
  protect,
  requireAgencyMember(),
  downloadAgencyExportHandler
);

// Client-facing share links (A7). A link pins one ready client export, so
// creating one is a planner write narrowed to the trip; listing and revoking
// follow the same ranks as export history.
router.post(
  '/:agencyId/trips/:tripId/exports/:exportId/share',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyProposalLinkSchema),
  createAgencyProposalLinkHandler
);
router.get(
  '/:agencyId/trips/:tripId/shares',
  protect,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyProposalLinksHandler
);
router.delete(
  '/:agencyId/trips/:tripId/shares/:shareId',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  revokeAgencyProposalLinkHandler
);

// Agency trip library (A2). Agency-wide visibility for members; creation needs
// planner rank; the trash is admin-only because only they can restore/purge.
router.get(
  '/:agencyId/trips',
  protect,
  requireAgencyMember(),
  listAgencyTripsHandler
);
router.post(
  '/:agencyId/trips',
  protect,
  requireAgencyRole('planner'),
  validate(createAgencyTripSchema),
  createAgencyTripHandler
);
router.get(
  '/:agencyId/trash',
  protect,
  requireAgencyRole('admin'),
  listAgencyDeletedTripsHandler
);
router.get(
  '/:agencyId/trips/:tripId',
  protect,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  getAgencyTripHandler
);
router.patch(
  '/:agencyId/trips/:tripId',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  validate(updateAgencyTripSchema),
  updateAgencyTripHandler
);
// Destructive library actions are admin-only, matching the A2 trash policy.
// The handlers are the canonical trip handlers; the tenant guard above has
// already narrowed them to this agency's trip.
router.delete(
  '/:agencyId/trips/:tripId',
  protect,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin'),
  deleteTrip
);
router.post(
  '/:agencyId/trips/:tripId/restore',
  protect,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin', { includeDeleted: true, onlyDeleted: true }),
  restoreTrip
);
router.delete(
  '/:agencyId/trips/:tripId/purge',
  protect,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin', { includeDeleted: true, onlyDeleted: true }),
  purgeTrip
);
// A8 archive: a read-only state distinct from the A2 trash. Trash restore
// already owns /restore, so unarchive takes its own path.
router.post(
  '/:agencyId/trips/:tripId/archive',
  protect,
  requireAgencyRole('admin'),
  requireAgencyTripRole('viewer'),
  archiveAgencyTripHandler
);
router.post(
  '/:agencyId/trips/:tripId/unarchive',
  protect,
  requireAgencyRole('admin'),
  requireAgencyTripRole('viewer'),
  unarchiveAgencyTripHandler
);

// Quote and commercial layer (A4). Reading is member-wide (viewers get the
// client-safe projection); every commercial write needs planner rank and is
// narrowed to one tenant trip.
router.get(
  '/:agencyId/trips/:tripId/quote',
  protect,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  getAgencyQuoteHandler
);
router.get(
  '/:agencyId/trips/:tripId/quote/versions',
  protect,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyQuoteVersionsHandler
);
router.put(
  '/:agencyId/trips/:tripId/quote',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  validate(saveAgencyQuoteSchema),
  saveAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/send',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  sendAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/accept',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  acceptAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/cancel',
  protect,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  cancelAgencyQuoteHandler
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
  agencyInviteCreateLimiter,
  validate(createAgencyInviteSchema),
  createAgencyInviteHandler
);
router.delete(
  '/:agencyId/invites/:inviteId',
  protect,
  requireAgencyRole('admin'),
  revokeAgencyInviteHandler
);

// A8 operations. Usage and audit are owner/admin read surfaces. The plan
// route deliberately carries no membership guard: TravelAI ops is not a
// member; the service gates on the ops secret instead.
router.get(
  '/:agencyId/usage',
  protect,
  requireAgencyMember(),
  requireAgencyRole('admin'),
  getAgencyUsageHandler
);
router.get(
  '/:agencyId/audit',
  protect,
  requireAgencyMember(),
  requireAgencyRole('admin'),
  listAgencyAuditHandler
);
router.patch(
  '/:agencyId/plan',
  protect,
  validate(updateAgencyPlanSchema),
  updateAgencyPlanHandler
);

export default router;
