import { Request, Response } from 'express';
import {
  agencyContext,
  type AgencyAccessRequest,
} from '../middleware/agencyAccess.middleware.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { parseQuery } from '../utils/parseQuery.js';
import { directoryListQuerySchema } from '../schemas/directory.schema.js';
import {
  directoryReadiness,
  loadDirectoryProfile,
  loadPublicAgencyProfile,
  publishDirectoryProfile,
  unpublishDirectoryProfile,
  updateDirectoryProfile,
  viewOwnDirectoryProfile,
} from '../services/directory/profile.js';
import { directoryCatalog } from '../services/directory/taxonomy.js';
import { loadPublicAgencyLogo } from '../services/directory/logo.js';
import { loadPublicPackageCover } from '../services/directory/packageCover.js';
import {
  createAgencyPackage,
  deleteAgencyPackage,
  listAgencyPackages,
  publishAgencyPackage,
  unpublishAgencyPackage,
  updateAgencyPackage,
  viewOwnPackage,
} from '../services/directory/packages.js';
import { extensionForAgencyAssetMime } from '../services/agency/assets.js';
import {
  listDirectoryAgencies,
  listDirectoryFacets,
} from '../services/directory/listing.js';

/** GET /api/agencies — filterable, cursor-paginated public listing (D3). */
export const listPublicAgencies = catchAsync(
  async (req: Request, res: Response) => {
    const query = parseQuery(directoryListQuerySchema, req.query);
    const page = await listDirectoryAgencies(query);
    res.json({ success: true, ...page });
  }
);

/** GET /api/agencies/facets — filter chips with counts (D3). */
export const getDirectoryFacets = catchAsync(
  async (_req: Request, res: Response) => {
    const facets = await listDirectoryFacets();
    res.json({ success: true, facets });
  }
);

/** Public directory reads (Milestone 9 D1). Anonymous, projection only. */
export const getPublicAgencyProfile = catchAsync(
  async (req: Request, res: Response) => {
    const profile = await loadPublicAgencyProfile(String(req.params.slug || ''));
    if (!profile) {
      throw new AppError('Agency not found.', 404);
    }
    res.json({ success: true, profile });
  }
);

/**
 * Public logo bytes (M9 D3). Same eligibility as the profile read, so a
 * suspended agency or an unpublished profile answers 404 here too.
 */
export const getPublicAgencyLogo = catchAsync(
  async (req: Request, res: Response) => {
    const logo = await loadPublicAgencyLogo(String(req.params.slug || ''));
    if (!logo) {
      throw new AppError('Agency not found.', 404);
    }
    const extension = extensionForAgencyAssetMime(logo.mime) || 'png';

    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Content-Length', String(logo.buffer.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="logo.${extension}"`);
    res.send(logo.buffer);
  }
);

/**
 * Public package cover bytes (M9 D4). Same eligibility as the profile read:
 * an unpublished profile or suspended agency answers 404, and only the cover
 * of a published package is served.
 */
export const getPublicPackageCover = catchAsync(
  async (req: Request, res: Response) => {
    const cover = await loadPublicPackageCover(
      String(req.params.slug || ''),
      String(req.params.packageId || '')
    );
    if (!cover) {
      throw new AppError('Package not found.', 404);
    }
    const extension = extensionForAgencyAssetMime(cover.mime) || 'jpg';

    res.setHeader('Content-Type', cover.mime);
    res.setHeader('Content-Length', String(cover.buffer.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="cover.${extension}"`);
    res.send(cover.buffer);
  }
);

/** The tenant's own profile in any state, plus what still blocks publishing. */
export const getAgencyDirectoryProfile = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const profile = await loadDirectoryProfile(String(agency._id));
    res.json({
      success: true,
      profile: viewOwnDirectoryProfile(profile),
      readiness: directoryReadiness(profile, agency),
      catalog: directoryCatalog(),
    });
  }
);

export const saveAgencyDirectoryProfile = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const profile = await updateDirectoryProfile(
      String(agency._id),
      req.body ?? {}
    );
    res.json({
      success: true,
      profile: viewOwnDirectoryProfile(profile),
      readiness: directoryReadiness(profile, agency),
    });
  }
);

export const publishAgencyDirectoryProfile = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const profile = await publishDirectoryProfile({
      agencyId: String(agency._id),
      actorId: req.userId,
    });
    res.json({
      success: true,
      profile: viewOwnDirectoryProfile(profile),
      readiness: directoryReadiness(profile, agency),
    });
  }
);

export const unpublishAgencyDirectoryProfile = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const profile = await unpublishDirectoryProfile({
      agencyId: String(agency._id),
      actorId: req.userId,
    });
    res.json({
      success: true,
      profile: viewOwnDirectoryProfile(profile),
      readiness: directoryReadiness(profile, agency),
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Trip packages (M9 D4)                                                     */
/* -------------------------------------------------------------------------- */

/** Every package the tenant owns, drafts included. Any member may read. */
export const listAgencyPackagesHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const packages = await listAgencyPackages(String(agency._id));
    res.status(200).json({ success: true, packages });
  }
);

export const createAgencyPackageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const pkg = await createAgencyPackage({
      agencyId: String(agency._id),
      actorId: req.userId,
      tripId: req.body?.tripId,
      fields: req.body ?? {},
    });
    res.status(201).json({
      success: true,
      package: viewOwnPackage(pkg, String(agency._id)),
    });
  }
);

export const updateAgencyPackageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const pkg = await updateAgencyPackage({
      agencyId: String(agency._id),
      packageId: String(req.params.packageId || ''),
      actorId: req.userId,
      fields: req.body ?? {},
    });
    res.json({
      success: true,
      package: viewOwnPackage(pkg, String(agency._id)),
    });
  }
);

export const publishAgencyPackageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const pkg = await publishAgencyPackage({
      agencyId: String(agency._id),
      packageId: String(req.params.packageId || ''),
      actorId: req.userId,
    });
    res.json({
      success: true,
      package: viewOwnPackage(pkg, String(agency._id)),
    });
  }
);

export const unpublishAgencyPackageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const pkg = await unpublishAgencyPackage({
      agencyId: String(agency._id),
      packageId: String(req.params.packageId || ''),
      actorId: req.userId,
    });
    res.json({
      success: true,
      package: viewOwnPackage(pkg, String(agency._id)),
    });
  }
);

export const deleteAgencyPackageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const deleted = await deleteAgencyPackage({
      agencyId: String(agency._id),
      packageId: String(req.params.packageId || ''),
      actorId: req.userId,
    });
    res.json({ success: true, id: deleted.id });
  }
);
