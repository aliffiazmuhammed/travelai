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
  createAgencyPdfTemplateHandler,
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
  getAgencyPdfTokenCatalogHandler,
  getAgencyQuoteHandler,
  getAgencyTemplateBackgroundHandler,
  getAgencyTemplateLayoutHandler,
  getAgencyTemplateSourceHandler,
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
  saveAgencyTemplateLayoutHandler,
  saveAgencyTemplateSourceHandler,
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
import {
  createAgencyPackageHandler,
  deleteAgencyPackageHandler,
  getAgencyDirectoryProfile,
  listAgencyPackagesHandler,
  publishAgencyDirectoryProfile,
  publishAgencyPackageHandler,
  saveAgencyDirectoryProfile,
  unpublishAgencyDirectoryProfile,
  unpublishAgencyPackageHandler,
  updateAgencyPackageHandler,
} from '../controllers/directory.controller.js';
import {
  convertAgencyEnquiryHandler,
  getAgencyEnquiryHandler,
  getAgencyEnquirySummaryHandler,
  listAgencyEnquiriesHandler,
  markAgencyEnquiryReadHandler,
  subscribeAgencyEnquiryEvents,
  updateAgencyEnquiryHandler,
} from '../controllers/enquiries.controller.js';
import { sendAgencyEnquiryMessageHandler } from '../controllers/conversations.controller.js';
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
  handleAgencyPdfTemplateUpload,
  handleAgencyTemplateUpload,
} from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  conversationMessageSchema,
  updateAgencyEnquirySchema,
} from '../schemas/agencyEnquiry.schema.js';
import {
  createAgencyPackageSchema,
  saveAgencyDirectoryProfileSchema,
  updateAgencyPackageSchema,
} from '../schemas/directory.schema.js';
import {
  addAgencyTemplateVersionSchema,
  activateAgencyInviteSchema,
  changeAgencyMemberRoleSchema,
  createAgencyAssetSchema,
  createAgencyClientSchema,
  createAgencyExportSchema,
  createAgencyInviteSchema,
  createAgencyPdfTemplateSchema,
  createAgencyProposalLinkSchema,
  createAgencyTemplateSchema,
  createAgencyTripSchema,
  previewAgencyTemplateVersionSchema,
  saveAgencyQuoteSchema,
  saveAgencyTemplateLayoutSchema,
  saveAgencyTemplateSourceSchema,
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
  enquiryStreamLimiter,
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

// Enquiry inbox (M9 D5/D6). Workspace-addressed (no `:agencyId`), because the
// signed-in agency session already names the tenant; the membership guard falls
// back to that session tenant. Registered before `/:agencyId` so "enquiries" is
// never read as a tenant id. Viewers can read the inbox; claiming, moving status
// and converting are planner work.
router.get(
  '/enquiries',
  protectAgency,
  requireAgencyMember(),
  listAgencyEnquiriesHandler
);
// Must precede `/:enquiryId`, or "summary" would be read as an id.
router.get(
  '/enquiries/summary',
  protectAgency,
  requireAgencyMember(),
  getAgencyEnquirySummaryHandler
);
// Live inbox stream (M9 R1). Same reason as `summary`: "events" is not an id.
router.get(
  '/enquiries/events',
  protectAgency,
  requireAgencyMember(),
  enquiryStreamLimiter,
  subscribeAgencyEnquiryEvents
);
router.get(
  '/enquiries/:enquiryId',
  protectAgency,
  requireAgencyMember(),
  getAgencyEnquiryHandler
);
router.patch(
  '/enquiries/:enquiryId',
  protectAgency,
  requireAgencyRole('planner'),
  validate(updateAgencyEnquirySchema),
  updateAgencyEnquiryHandler
);
router.post(
  '/enquiries/:enquiryId/convert',
  protectAgency,
  requireAgencyRole('planner'),
  convertAgencyEnquiryHandler
);
// Two-way thread reply (M9 D8). Same rank as moving a lead: a reply changes
// `new → replied` and stamps the reply time the public profile advertises.
router.post(
  '/enquiries/:enquiryId/messages',
  protectAgency,
  requireAgencyRole('planner'),
  validate(conversationMessageSchema),
  sendAgencyEnquiryMessageHandler
);
// Explicit inbox receipt (M9 R1): opening the lead also stamps it, but the SPA
// needs a way to clear the badge without re-fetching a thread it holds.
router.post(
  '/enquiries/:enquiryId/read',
  protectAgency,
  requireAgencyMember(),
  markAgencyEnquiryReadHandler
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

// Public directory profile (M9 D1). Every member can read the draft and the
// publish readiness list; only owner/admin can edit or publish, because this
// text and the logo appear on a public page under the agency's name.
router.get(
  '/:agencyId/profile',
  protectAgency,
  requireAgencyMember(),
  getAgencyDirectoryProfile
);
router.put(
  '/:agencyId/profile',
  protectAgency,
  requireAgencyRole('admin'),
  validate(saveAgencyDirectoryProfileSchema),
  saveAgencyDirectoryProfile
);
router.post(
  '/:agencyId/profile/publish',
  protectAgency,
  requireAgencyRole('admin'),
  publishAgencyDirectoryProfile
);
router.post(
  '/:agencyId/profile/unpublish',
  protectAgency,
  requireAgencyRole('admin'),
  unpublishAgencyDirectoryProfile
);

// Trip packages (M9 D4). Planners draft from a trip; publishing and deleting
// touch the public directory under the agency's name, so they stay admin-only.
router.get(
  '/:agencyId/packages',
  protectAgency,
  requireAgencyMember(),
  listAgencyPackagesHandler
);
router.post(
  '/:agencyId/packages',
  protectAgency,
  requireAgencyRole('planner'),
  validate(createAgencyPackageSchema),
  createAgencyPackageHandler
);
router.patch(
  '/:agencyId/packages/:packageId',
  protectAgency,
  requireAgencyRole('planner'),
  validate(updateAgencyPackageSchema),
  updateAgencyPackageHandler
);
router.post(
  '/:agencyId/packages/:packageId/publish',
  protectAgency,
  requireAgencyRole('admin'),
  publishAgencyPackageHandler
);
router.post(
  '/:agencyId/packages/:packageId/unpublish',
  protectAgency,
  requireAgencyRole('admin'),
  unpublishAgencyPackageHandler
);
router.delete(
  '/:agencyId/packages/:packageId',
  protectAgency,
  requireAgencyRole('admin'),
  deleteAgencyPackageHandler
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
// PDF-background templates (A6f). The design arrives as a PDF and the layout
// as a slot map validated against that PDF's real page geometry. Editing a
// layout mints a new immutable version instead of rewriting the approved one.
router.post(
  '/:agencyId/templates/pdf',
  protectAgency,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  handleAgencyPdfTemplateUpload,
  validate(createAgencyPdfTemplateSchema),
  createAgencyPdfTemplateHandler
);
router.get(
  '/:agencyId/templates/pdf-tokens',
  protectAgency,
  requireAgencyRole('admin'),
  getAgencyPdfTokenCatalogHandler
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
router.get(
  '/:agencyId/templates/:templateId/versions/:version/source',
  protectAgency,
  requireAgencyRole('admin'),
  getAgencyTemplateSourceHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/from-source',
  protectAgency,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  validate(saveAgencyTemplateSourceSchema),
  saveAgencyTemplateSourceHandler
);
router.get(
  '/:agencyId/templates/:templateId/versions/:version/layout',
  protectAgency,
  requireAgencyRole('admin'),
  getAgencyTemplateLayoutHandler
);
router.get(
  '/:agencyId/templates/:templateId/versions/:version/background',
  protectAgency,
  requireAgencyRole('admin'),
  getAgencyTemplateBackgroundHandler
);
router.post(
  '/:agencyId/templates/:templateId/versions/from-layout',
  protectAgency,
  requireAgencyRole('admin'),
  agencyTemplateUploadLimiter,
  validate(saveAgencyTemplateLayoutSchema),
  saveAgencyTemplateLayoutHandler
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
