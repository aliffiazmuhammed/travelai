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
import { protectAgency } from '../middleware/auth.middleware.js';
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
  activateAgencyInviteSchema,
  changeAgencyMemberRoleSchema,
  createAgencyAssetSchema,
  createAgencyClientSchema,
  createAgencyExportSchema,
  createAgencyInviteSchema,
  createAgencyProposalLinkSchema,
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
    milestone: 'A9',
    writesEnabled: true,
  });
});

// Token-identified invitation endpoints. Declared before `/:agencyId` so
// "invites" is never interpreted as an agency id. PA0 makes the preview public
// (tenant name/logo/role/expiry only) and turns acceptance into activation:
// the invite token plus the invitee's chosen credentials create or sign in the
// tenant's agency account. Personal accounts are never touched.
router.get('/invites/:token', invitePreviewLimiter, getAgencyInvitePreview);
router.post(
  '/invites/:token/accept',
  inviteAcceptLimiter,
  validate(activateAgencyInviteSchema),
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

// PA0: self-service agency creation is gone. Tenants are provisioned by the
// platform admin (PA3); until then `GET /` and `POST /` stay removed.

// Tenant-scoped read/update.
router.get('/:agencyId', protectAgency, requireAgencyMember(), getAgency);
router.patch(
  '/:agencyId',
  protectAgency,
  requireAgencyRole('admin'),
  validate(updateAgencySchema),
  updateAgency
);

// Brand assets (A3). Members can view the library; only admins can add or
// remove bytes. The content endpoint is authenticated, so an asset URL never
// works without a tenant membership check.
router.get(
  '/:agencyId/assets',
  protectAgency,
  requireAgencyMember(),
  listAgencyAssetsHandler
);
router.post(
  '/:agencyId/assets',
  protectAgency,
  requireAgencyRole('admin'),
  agencyAssetUploadLimiter,
  agencyAssetUploadAgencyLimiter,
  handleAgencyAssetUpload,
  validate(createAgencyAssetSchema),
  uploadAgencyAssetHandler
);
router.delete(
  '/:agencyId/assets/:assetId',
  protectAgency,
  requireAgencyRole('admin'),
  deleteAgencyAssetHandler
);
router.get(
  '/:agencyId/assets/:assetId/content',
  protectAgency,
  requireAgencyMember(),
  getAgencyAssetContentHandler
);

// Client directory (A4). Everyone can read the address book; planners manage
// it. Directory records never grant trip access.
router.get(
  '/:agencyId/clients',
  protectAgency,
  requireAgencyMember(),
  listAgencyClientsHandler
);
router.post(
  '/:agencyId/clients',
  protectAgency,
  requireAgencyRole('planner'),
  validate(createAgencyClientSchema),
  createAgencyClientHandler
);
router.patch(
  '/:agencyId/clients/:clientId',
  protectAgency,
  requireAgencyRole('planner'),
  validate(updateAgencyClientSchema),
  updateAgencyClientHandler
);
router.delete(
  '/:agencyId/clients/:clientId',
  protectAgency,
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
  protectAgency,
  requireAgencyMember(),
  listAgencyTemplatesHandler
);
router.post(
  '/:agencyId/templates',
  protectAgency,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  handleAgencyTemplateUpload,
  validate(createAgencyTemplateSchema),
  createAgencyTemplateHandler
);
router.patch(
  '/:agencyId/templates/:templateId',
  protectAgency,
  requireAgencyRole('admin'),
  validate(updateAgencyTemplateSchema),
  updateAgencyTemplateHandler
);
router.get(
  '/:agencyId/templates/:templateId/versions',
  protectAgency,
  requireAgencyRole('admin'),
  listAgencyTemplateVersionsHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions',
  protectAgency,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  handleAgencyTemplateUpload,
  validate(addAgencyTemplateVersionSchema),
  addAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/:version/preview',
  protectAgency,
  requireAgencyRole('admin'),
  validate(previewAgencyTemplateVersionSchema),
  previewAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/:version/activate',
  protectAgency,
  requireAgencyRole('admin'),
  activateAgencyTemplateVersionHandler
);
router.post(
  '/:agencyId/templates/:templateId/archive',
  protectAgency,
  requireAgencyRole('admin'),
  archiveAgencyTemplateHandler
);
router.post(
  '/:agencyId/templates/:templateId/default',
  protectAgency,
  requireAgencyRole('admin'),
  setDefaultAgencyTemplateHandler
);
router.get(
  '/:agencyId/trips/:tripId/exports',
  protectAgency,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyExportsHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports/preview',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyExportSchema),
  previewAgencyExportHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyExportSchema),
  createAgencyExportHandler
);
router.post(
  '/:agencyId/trips/:tripId/exports/:exportId/retry',
  protectAgency,
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
  protectAgency,
  requireAgencyMember(),
  downloadAgencyExportHandler
);

// Client-facing share links (A7). A link pins one ready client export, so
// creating one is a planner write narrowed to the trip; listing and revoking
// follow the same ranks as export history.
router.post(
  '/:agencyId/trips/:tripId/exports/:exportId/share',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  agencyExportLimiter,
  agencyWideExportLimiter,
  validate(createAgencyProposalLinkSchema),
  createAgencyProposalLinkHandler
);
router.get(
  '/:agencyId/trips/:tripId/shares',
  protectAgency,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyProposalLinksHandler
);
router.delete(
  '/:agencyId/trips/:tripId/shares/:shareId',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  revokeAgencyProposalLinkHandler
);

// Agency trip library (A2). Agency-wide visibility for members; creation needs
// planner rank; the trash is admin-only because only they can restore/purge.
router.get(
  '/:agencyId/trips',
  protectAgency,
  requireAgencyMember(),
  listAgencyTripsHandler
);
router.post(
  '/:agencyId/trips',
  protectAgency,
  requireAgencyRole('planner'),
  validate(createAgencyTripSchema),
  createAgencyTripHandler
);
router.get(
  '/:agencyId/trash',
  protectAgency,
  requireAgencyRole('admin'),
  listAgencyDeletedTripsHandler
);
router.get(
  '/:agencyId/trips/:tripId',
  protectAgency,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  getAgencyTripHandler
);
router.patch(
  '/:agencyId/trips/:tripId',
  protectAgency,
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
  protectAgency,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin'),
  deleteTrip
);
router.post(
  '/:agencyId/trips/:tripId/restore',
  protectAgency,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin', { includeDeleted: true, onlyDeleted: true }),
  restoreTrip
);
router.delete(
  '/:agencyId/trips/:tripId/purge',
  protectAgency,
  requireAgencyRole('admin'),
  requireAgencyTripRole('admin', { includeDeleted: true, onlyDeleted: true }),
  purgeTrip
);
// A8 archive: a read-only state distinct from the A2 trash. Trash restore
// already owns /restore, so unarchive takes its own path.
router.post(
  '/:agencyId/trips/:tripId/archive',
  protectAgency,
  requireAgencyRole('admin'),
  requireAgencyTripRole('viewer'),
  archiveAgencyTripHandler
);
router.post(
  '/:agencyId/trips/:tripId/unarchive',
  protectAgency,
  requireAgencyRole('admin'),
  requireAgencyTripRole('viewer'),
  unarchiveAgencyTripHandler
);

// Quote and commercial layer (A4). Reading is member-wide (viewers get the
// client-safe projection); every commercial write needs planner rank and is
// narrowed to one tenant trip.
router.get(
  '/:agencyId/trips/:tripId/quote',
  protectAgency,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  getAgencyQuoteHandler
);
router.get(
  '/:agencyId/trips/:tripId/quote/versions',
  protectAgency,
  requireAgencyMember(),
  requireAgencyTripRole('viewer'),
  listAgencyQuoteVersionsHandler
);
router.put(
  '/:agencyId/trips/:tripId/quote',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  validate(saveAgencyQuoteSchema),
  saveAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/send',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  sendAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/accept',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  acceptAgencyQuoteHandler
);
router.post(
  '/:agencyId/trips/:tripId/quote/cancel',
  protectAgency,
  requireAgencyRole('planner'),
  requireAgencyTripRole('planner'),
  cancelAgencyQuoteHandler
);

// Team management.
router.get(
  '/:agencyId/members',
  protectAgency,
  requireAgencyMember(),
  listAgencyMembersHandler
);
router.patch(
  '/:agencyId/members/:userId',
  protectAgency,
  requireAgencyRole('admin'),
  validate(changeAgencyMemberRoleSchema),
  changeAgencyMemberRoleHandler
);
router.delete(
  '/:agencyId/members/:userId',
  protectAgency,
  requireAgencyRole('admin'),
  removeAgencyMemberHandler
);

// Pending invitations. Emails are delivered manually in v1; the copied link is
// the delivery mechanism.
router.get(
  '/:agencyId/invites',
  protectAgency,
  requireAgencyRole('admin'),
  listAgencyInvitesHandler
);
router.post(
  '/:agencyId/invites',
  protectAgency,
  requireAgencyRole('admin'),
  inviteManageLimiter,
  agencyInviteCreateLimiter,
  validate(createAgencyInviteSchema),
  createAgencyInviteHandler
);
router.delete(
  '/:agencyId/invites/:inviteId',
  protectAgency,
  requireAgencyRole('admin'),
  revokeAgencyInviteHandler
);

// A8 operations. Usage and audit are owner/admin read surfaces. The plan
// route deliberately carries no session or membership guard: TravelAI ops is
// not a member, and the `X-TravelAI-Ops` secret is the entire capability. PA0
// keeps it as the break-glass path while agency accounts have their own realm.
router.get(
  '/:agencyId/usage',
  protectAgency,
  requireAgencyMember(),
  requireAgencyRole('admin'),
  getAgencyUsageHandler
);
router.get(
  '/:agencyId/audit',
  protectAgency,
  requireAgencyMember(),
  requireAgencyRole('admin'),
  listAgencyAuditHandler
);
router.patch(
  '/:agencyId/plan',
  validate(updateAgencyPlanSchema),
  updateAgencyPlanHandler
);

export default router;
