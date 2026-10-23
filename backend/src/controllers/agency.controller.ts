import { Response } from 'express';
import User from '../models/User.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import { agencyContext, type AgencyAccessRequest } from '../middleware/agencyAccess.middleware.js';
import { linkOriginHints } from '../services/collab/invites.js';
import {
  agencyMemberCount,
  createAgencyForUser,
  listAgenciesForUser,
  projectAgency,
  updateAgencyDetails,
} from '../services/agency/agencies.js';
import {
  changeAgencyMemberRole,
  listAgencyMembers,
  removeAgencyMember,
} from '../services/agency/members.js';
import {
  createAgencyInvite,
  listAgencyInvites,
  previewAgencyInvite,
  projectAgencyInvite,
  redeemAgencyInvite,
  revokeAgencyInvite,
} from '../services/agency/invites.js';
import {
  createAgencyTrip,
  listAgencyDeletedTrips,
  listAgencyTrips,
  updateAgencyTrip,
} from '../services/agency/trips.js';
import {
  deleteAgencyAsset,
  extensionForAgencyAssetMime,
  listAgencyAssets,
  readAgencyAssetContent,
  uploadAgencyAsset,
} from '../services/agency/assets.js';
import {
  createAgencyClient,
  deleteAgencyClient,
  listAgencyClients,
  updateAgencyClient,
} from '../services/agency/clients.js';
import {
  acceptQuote,
  cancelQuote,
  getLatestQuote,
  listQuoteVersions,
  projectQuote,
  saveQuote,
  sendQuote,
} from '../services/agency/quotes.js';
import {
  createAgencyExport,
  listAgencyExports,
  previewAgencyExport,
  projectAgencyExport,
  readAgencyExportDownload,
  retryAgencyExport,
} from '../services/agency/exports/exports.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../services/agency/exports/templates.js';
import {
  activateAgencyTemplateVersion,
  addAgencyTemplateVersion,
  archiveAgencyTemplate,
  createAgencyTemplate,
  listAgencyTemplateVersions,
  previewAgencyTemplateVersion,
  setDefaultAgencyTemplate,
  updateAgencyTemplateDetails,
} from '../services/agency/exports/templateManagement.js';
import type { AgencyTemplateAssetSelection } from '../services/agency/exports/templateAssets.js';
import { sanitizeTripFor } from '../utils/sanitizeTrip.js';

/** Agency Workspace A1 HTTP handlers. */

export const listAgencies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) throw new AppError('Please sign in to access this feature.', 401);
    const agencies = await listAgenciesForUser(req.userId);
    res.json({ success: true, agencies });
  }
);

export const createAgency = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) throw new AppError('Please sign in to access this feature.', 401);
    const agency = await createAgencyForUser({
      userId: req.userId,
      name: req.body?.name,
      gstin: req.body?.gstin,
      branding: req.body?.branding,
    });
    res.status(201).json({ success: true, agency });
  }
);

export const getAgency = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const memberCount = await agencyMemberCount(String(agency._id));
    res.json({
      success: true,
      agency: projectAgency(agency, role, memberCount),
    });
  }
);

export const updateAgency = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const updated = await updateAgencyDetails(String(agency._id), {
      name: req.body?.name,
      gstin: req.body?.gstin,
      branding: req.body?.branding,
      defaultTerms: req.body?.defaultTerms,
    });
    const memberCount = await agencyMemberCount(String(agency._id));
    res.json({
      success: true,
      agency: projectAgency(updated, role, memberCount),
    });
  }
);

export const listAgencyMembersHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const members = await listAgencyMembers(
      String(agency._id),
      req.userId!,
      role
    );
    res.json({ success: true, members });
  }
);

export const changeAgencyMemberRoleHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const members = await changeAgencyMemberRole({
      agencyId: String(agency._id),
      actorId: req.userId!,
      actorRole: role,
      targetUserId: String(req.params.userId || ''),
      nextRole: req.body?.role,
    });
    res.json({ success: true, members });
  }
);

export const removeAgencyMemberHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const members = await removeAgencyMember({
      agencyId: String(agency._id),
      actorId: req.userId!,
      actorRole: role,
      targetUserId: String(req.params.userId || ''),
    });
    res.json({ success: true, members });
  }
);

export const createAgencyInviteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const result = await createAgencyInvite({
      agencyId: String(agency._id),
      createdBy: req.userId!,
      role: req.body?.role,
      kind: req.body?.kind,
      email: req.body?.email,
      maxUses: req.body?.maxUses,
      ttlHours: req.body?.ttlHours,
      linkOrigins: linkOriginHints(req),
    });
    res.status(201).json({
      success: true,
      invite: projectAgencyInvite(result.invite),
      link: result.link,
    });
  }
);

export const listAgencyInvitesHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const invites = await listAgencyInvites(String(agency._id));
    res.json({ success: true, invites });
  }
);

export const revokeAgencyInviteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const invite = await revokeAgencyInvite(
      String(agency._id),
      String(req.params.inviteId || '')
    );
    res.json({ success: true, invite: projectAgencyInvite(invite) });
  }
);

export const getAgencyInvitePreview = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) throw new AppError('Please sign in to access this feature.', 401);
    const preview = await previewAgencyInvite(String(req.params.token || ''));
    res.json({ success: true, ...preview });
  }
);

export const acceptAgencyInvite = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) throw new AppError('Please sign in to access this feature.', 401);
    const user = await User.findById(req.userId).select('email').lean();
    if (!user) {
      throw new AppError('Your account could not be found. Please sign in again.', 401);
    }

    const result = await redeemAgencyInvite(String(req.params.token || ''), {
      id: req.userId,
      email: user.email,
    });

    res.json({
      success: true,
      agencyId: result.agencyId,
      role: result.role,
      alreadyMember: result.alreadyMember,
      message: result.alreadyMember
        ? 'You are already part of this agency.'
        : 'Welcome to the agency team.',
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Agency trips (A2)                                                          */
/* -------------------------------------------------------------------------- */

export const listAgencyTripsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const trips = await listAgencyTrips({
      agencyId: String(agency._id),
      role,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ success: true, trips });
  }
);

export const createAgencyTripHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const trip = await createAgencyTrip({
      agencyId: String(agency._id),
      userId: req.userId!,
      role,
      title: String(req.body?.title || ''),
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      assignedTo: req.body?.assignedTo,
      clientId: req.body?.clientId,
    });
    res.status(201).json({ success: true, trip });
  }
);

export const listAgencyDeletedTripsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const trips = await listAgencyDeletedTrips(String(agency._id), role);
    res.json({ success: true, trips });
  }
);

export const updateAgencyTripHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.trip) {
      throw new AppError(
        'Route is missing its agency trip guard. This is a server bug.',
        500
      );
    }
    const trip = await updateAgencyTrip(req.trip, {
      agencyId: String(agency._id),
      role,
      assignedTo: req.body?.assignedTo,
      clientId: req.body?.clientId,
    });
    res.json({ success: true, trip });
  }
);

/**
 * Tenant trip detail. The guard has already resolved the document through the
 * agency scope, so this only adds the same role annotations as the personal
 * detail endpoint.
 */
export const getAgencyTripHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    if (!req.trip || !req.tripRole) {
      throw new AppError(
        'Route is missing its agency trip guard. This is a server bug.',
        500
      );
    }
    res.json({
      ...sanitizeTripFor(req.trip, req.tripRole),
      role: req.tripRole,
      ...(req.agencyRole ? { agencyRole: req.agencyRole } : {}),
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Brand assets (A3)                                                         */
/* -------------------------------------------------------------------------- */

export const listAgencyAssetsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const assets = await listAgencyAssets(String(agency._id));
    res.json({ success: true, assets });
  }
);

export const uploadAgencyAssetHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.file) {
      throw new AppError('Choose a file to upload.', 400);
    }

    const result = await uploadAgencyAsset({
      agencyId: String(agency._id),
      userId: req.userId!,
      kind: req.body?.kind,
      buffer: req.file.buffer,
      declaredMime: req.file.mimetype,
      originalName: req.file.originalname,
      fontFamily: req.body?.fontFamily,
      licenseNote: req.body?.licenseNote,
    });

    const memberCount = await agencyMemberCount(String(agency._id));
    res.status(201).json({
      success: true,
      asset: result.asset,
      // Logo/mascot uploads update the active branding pointer.
      ...(result.agency
        ? { agency: projectAgency(result.agency, role, memberCount) }
        : {}),
    });
  }
);

export const deleteAgencyAssetHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const result = await deleteAgencyAsset(
      String(agency._id),
      String(req.params.assetId || '')
    );
    const memberCount = await agencyMemberCount(String(agency._id));
    res.json({
      success: true,
      asset: result.asset,
      // Deleting an active logo/mascot (or a referenced font) clears the
      // corresponding branding field server-side.
      ...(result.agency
        ? { agency: projectAgency(result.agency, role, memberCount) }
        : {}),
    });
  }
);

/**
 * Authenticated asset bytes. The tenant guard has already proved membership;
 * the service re-scopes the row by agencyId before touching the file.
 */
export const getAgencyAssetContentHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const { asset, buffer } = await readAgencyAssetContent(
      String(agency._id),
      String(req.params.assetId || '')
    );
    const extension = extensionForAgencyAssetMime(asset.mime) || 'bin';

    res.setHeader('Content-Type', asset.mime);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(asset._id)}.${extension}"`
    );
    res.send(buffer);
  }
);

/* -------------------------------------------------------------------------- */
/*  Client directory (A4)                                                     */
/* -------------------------------------------------------------------------- */

export const listAgencyClientsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const clients = await listAgencyClients(
      String(agency._id),
      typeof req.query.search === 'string' ? req.query.search : undefined
    );
    res.json({ success: true, clients });
  }
);

export const createAgencyClientHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const client = await createAgencyClient({
      agencyId: String(agency._id),
      createdBy: req.userId!,
      name: req.body?.name,
      email: req.body?.email,
      phone: req.body?.phone,
      company: req.body?.company,
      notes: req.body?.notes,
    });
    res.status(201).json({ success: true, client });
  }
);

export const updateAgencyClientHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const client = await updateAgencyClient(
      String(agency._id),
      String(req.params.clientId || ''),
      {
        name: req.body?.name,
        email: req.body?.email,
        phone: req.body?.phone,
        company: req.body?.company,
        notes: req.body?.notes,
      }
    );
    res.json({ success: true, client });
  }
);

export const deleteAgencyClientHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const client = await deleteAgencyClient(
      String(agency._id),
      String(req.params.clientId || '')
    );
    res.json({
      success: true,
      client,
      message: 'Client removed. Trips keep their itinerary but are unlinked.',
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Quotes (A4)                                                               */
/* -------------------------------------------------------------------------- */

function guardedTripId(req: AgencyAccessRequest): string {
  if (!req.trip) {
    throw new AppError(
      'Route is missing its agency trip guard. This is a server bug.',
      500
    );
  }
  return String(req.trip._id);
}

function agencyTermsDefaults(agency: any) {
  return {
    inclusions: [...(agency?.defaultTerms?.inclusions ?? [])],
    exclusions: [...(agency?.defaultTerms?.exclusions ?? [])],
    terms: [...(agency?.defaultTerms?.terms ?? [])],
  };
}

export const getAgencyQuoteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const quote = await getLatestQuote(String(agency._id), guardedTripId(req));
    res.json({
      success: true,
      quote: quote ? projectQuote(quote, role) : null,
    });
  }
);

export const saveAgencyQuoteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const quote = await saveQuote({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      userId: req.userId!,
      role,
      agencyDefaultTerms: agencyTermsDefaults(agency),
      clientId: req.body?.clientId,
      client: req.body?.client,
      currency: req.body?.currency,
      lineItems: req.body?.lineItems,
      markupPct: req.body?.markupPct,
      taxPct: req.body?.taxPct,
      discount: req.body?.discount,
      validUntil: req.body?.validUntil,
      inclusions: req.body?.inclusions,
      exclusions: req.body?.exclusions,
      terms: req.body?.terms,
      preparedBy: req.body?.preparedBy,
    });
    res.json({ success: true, quote: projectQuote(quote, role) });
  }
);

export const sendAgencyQuoteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const quote = await sendQuote({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      role,
    });
    res.json({ success: true, quote: projectQuote(quote, role) });
  }
);

export const acceptAgencyQuoteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const quote = await acceptQuote({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      role,
    });
    res.json({ success: true, quote: projectQuote(quote, role) });
  }
);

export const cancelAgencyQuoteHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const quote = await cancelQuote({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      role,
    });
    res.json({ success: true, quote: projectQuote(quote, role) });
  }
);

export const listAgencyQuoteVersionsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const versions = await listQuoteVersions(
      String(agency._id),
      guardedTripId(req)
    );
    res.json({
      success: true,
      versions: versions.map((quote) => projectQuote(quote, role)),
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Exports (A5)                                                              */
/* -------------------------------------------------------------------------- */

export const listAgencyTemplatesHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    // Managed templates are seeded per tenant on first use. `createdBy` points
    // at the agency owner so the seed has a stable, non-spoofable author.
    await ensureBuiltinTemplates(
      String(agency._id),
      String(agency.createdBy ?? req.userId)
    );
    const audience =
      req.query.audience === 'client' || req.query.audience === 'internal'
        ? req.query.audience
        : undefined;
    const status =
      req.query.status === 'draft' ||
      req.query.status === 'archived' ||
      req.query.status === 'all'
        ? req.query.status
        : 'active';
    const templates = await listAgencyTemplates({
      agencyId: String(agency._id),
      role,
      audience,
      status,
    });
    res.json({ success: true, templates });
  }
);

function parseTemplateAssetSelection(
  value: unknown
): AgencyTemplateAssetSelection {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') {
    throw new AppError('The asset choices are not valid.', 400);
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as AgencyTemplateAssetSelection;
  } catch {
    throw new AppError('The asset choices are not valid.', 400);
  }
}

export const createAgencyTemplateHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.file) {
      throw new AppError('Choose an HTML template file to upload.', 400);
    }
    const result = await createAgencyTemplate({
      agency,
      actorId: req.userId!,
      role,
      name: req.body?.name,
      description: req.body?.description,
      audience: req.body?.audience,
      buffer: req.file.buffer,
      assets: parseTemplateAssetSelection(req.body?.assets),
    });
    res.status(201).json({
      success: true,
      message: 'Template uploaded as a draft. Preview it before activating.',
      template: result.template,
      version: result.version,
    });
  }
);

export const addAgencyTemplateVersionHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.file) {
      throw new AppError('Choose an HTML template file to upload.', 400);
    }
    const result = await addAgencyTemplateVersion({
      agency,
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
      buffer: req.file.buffer,
      assets: parseTemplateAssetSelection(req.body?.assets),
    });
    res.status(201).json({
      success: true,
      message: 'Version uploaded as a draft. Preview it before activating.',
      template: result.template,
      version: result.version,
    });
  }
);

export const listAgencyTemplateVersionsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const result = await listAgencyTemplateVersions({
      agencyId: String(agency._id),
      role,
      templateId: String(req.params.templateId || ''),
    });
    res.json({ success: true, ...result });
  }
);

export const previewAgencyTemplateVersionHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const preview = await previewAgencyTemplateVersion({
      agency,
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
      version: req.params.version,
      tripId: req.body?.tripId,
      quoteId: req.body?.quoteId,
    });
    res.json({ success: true, preview });
  }
);

export const activateAgencyTemplateVersionHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const template = await activateAgencyTemplateVersion({
      agencyId: String(agency._id),
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
      version: req.params.version,
    });
    res.json({
      success: true,
      message: 'Template activated for new exports.',
      template,
    });
  }
);

export const archiveAgencyTemplateHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const template = await archiveAgencyTemplate({
      agencyId: String(agency._id),
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
    });
    res.json({
      success: true,
      message: 'Template archived. Existing exports keep their pinned version.',
      template,
    });
  }
);

export const setDefaultAgencyTemplateHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const template = await setDefaultAgencyTemplate({
      agencyId: String(agency._id),
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
    });
    res.json({
      success: true,
      message: 'Template set as the default for new exports.',
      template,
    });
  }
);

export const updateAgencyTemplateHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const template = await updateAgencyTemplateDetails({
      agencyId: String(agency._id),
      actorId: req.userId!,
      role,
      templateId: String(req.params.templateId || ''),
      name: req.body?.name,
      description: req.body?.description,
    });
    res.json({ success: true, template });
  }
);

export const listAgencyExportsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const exports = await listAgencyExports({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      role,
    });
    res.json({ success: true, exports });
  }
);

export const previewAgencyExportHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.trip) {
      throw new AppError(
        'Route is missing its agency trip guard. This is a server bug.',
        500
      );
    }
    const preview = await previewAgencyExport({
      agencyId: String(agency._id),
      role,
      trip: req.trip,
      templateId: req.body?.templateId,
      quoteId: req.body?.quoteId,
    });
    res.json({ success: true, preview });
  }
);

export const createAgencyExportHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    if (!req.trip) {
      throw new AppError(
        'Route is missing its agency trip guard. This is a server bug.',
        500
      );
    }
    const job = await createAgencyExport({
      agencyId: String(agency._id),
      actorId: req.userId!,
      role,
      trip: req.trip,
      templateId: req.body?.templateId,
      quoteId: req.body?.quoteId,
    });
    res.status(202).json({
      success: true,
      message: 'Your export is being prepared.',
      export: projectAgencyExport(job),
    });
  }
);

export const retryAgencyExportHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const job = await retryAgencyExport({
      agencyId: String(agency._id),
      tripId: guardedTripId(req),
      exportId: String(req.params.exportId || ''),
      role,
      actorId: req.userId!,
    });
    res.json({
      success: true,
      message: 'Retrying your export.',
      export: projectAgencyExport(job),
    });
  }
);

/**
 * Signed, staff-authenticated download. The signature is bound to
 * `(agencyId, exportId)` and expires after ten minutes; the tenant guard has
 * already proved membership, and the service re-scopes the row by agencyId.
 */
export const downloadAgencyExportHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const expiresRaw = Number(req.query.expires);
    const signature =
      typeof req.query.signature === 'string' ? req.query.signature : '';

    const { job, buffer } = await readAgencyExportDownload({
      agencyId: String(agency._id),
      exportId: String(req.params.exportId || ''),
      expiresAt: Number.isFinite(expiresRaw) ? Math.trunc(expiresRaw) : 0,
      signature,
      actorId: req.userId!,
      role,
    });

    const base = job.quoteNumber
      ? `${job.quoteNumber}-v${job.quoteVersion ?? 1}`
      : `itinerary-${String(job.tripId)}`;
    const filename = `${base.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
);
