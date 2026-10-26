import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { parseQuery } from '../utils/parseQuery.js';
import {
  agencyListQuerySchema,
  agencyMemberInviteSchema,
  agencyMemberRoleSchema,
  agencyOwnerPreviewQuerySchema,
  agencyOwnerTransferSchema,
  agencyPlanChangeSchema,
  agencyStatusSchema,
  createAgencyTenantSchema,
  platformAuditQuerySchema,
} from '../schemas/platformAgencies.schema.js';
import { linkOriginHints } from '../services/collab/invites.js';
import * as agencies from '../services/platform/agencies.js';
import * as provisioning from '../services/platform/provisioning.js';

/**
 * Platform agency provisioning (PA3), mounted at `/api/admin`.
 *
 * These handlers run behind `PLATFORM_ADMIN_ENABLED`, `protectPlatform` and the
 * forced-password gate. They create identity/tenant metadata only; no personal
 * account is converted and no tenant content is read.
 */

function clientContext(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  };
}

/** GET /api/admin/agencies/plans — plan tiers from the environment config. */
export const agencyPlans = catchAsync(
  async (_req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      success: true,
      tiers: provisioning.listAgencyPlanTiers(),
    });
  }
);

/** GET /api/admin/agencies/owner-preview?email= — realm/tenant warning. */
export const agencyOwnerPreview = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(agencyOwnerPreviewQuerySchema, req.query);
    res.status(200).json({
      success: true,
      preview: await provisioning.previewAgencyOwner(query.email),
    });
  }
);

/** POST /api/admin/agencies — provision tenant + owner account + membership. */
export const createAgencyTenant = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = createAgencyTenantSchema.parse(req.body);
    const result = await provisioning.provisionAgency({
      actorId: String(req.userId),
      name: body.name,
      slug: body.slug,
      planTierId: body.planTierId,
      billing: body.billing,
      ownerEmail: body.ownerEmail,
      ownerName: body.ownerName,
      client: clientContext(req),
    });

    res.status(201).json({
      success: true,
      message: result.temporaryPassword
        ? 'Agency provisioned. The owner temporary password is shown once; share it securely.'
        : 'Agency provisioned and the existing workspace account was attached as owner.',
      ...result,
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  PA4 lifecycle and access operations                                        */
/* -------------------------------------------------------------------------- */

/** GET /api/admin/agencies?q=&status=&planTierId=&page=&limit= */
export const listAgencies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(agencyListQuerySchema, req.query);
    const result = await agencies.listAgencies(query);
    res.status(200).json({ success: true, ...result });
  }
);

/** GET /api/admin/agencies/:id — plan, usage, billing, owners and members. */
export const agencyDetail = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const agency = await agencies.getAgencyDetail(String(req.params.id));
    res.status(200).json({ success: true, agency });
  }
);

/** PATCH /api/admin/agencies/:id/status — suspend or reactivate a tenant. */
export const updateAgencyStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = agencyStatusSchema.parse(req.body);
    const result = await agencies.setAgencyStatus({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      status: body.status,
      client: clientContext(req),
    });
    res.status(200).json({ success: true, ...result });
  }
);

/** PATCH /api/admin/agencies/:id/plan — tier plus optional overrides. */
export const updateAgencyPlan = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = agencyPlanChangeSchema.parse(req.body);
    const result = await agencies.changeAgencyPlanAsAdmin({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      plan: body,
      client: clientContext(req),
    });
    res.status(200).json({
      success: true,
      message: 'Plan updated. Live usage now reflects the new limits.',
      ...result,
    });
  }
);

/** POST /api/admin/agencies/:id/members/invite — email or link invite. */
export const inviteAgencyMember = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = agencyMemberInviteSchema.parse(req.body);
    const result = await agencies.inviteAgencyMember({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      invite: body,
      linkOrigins: linkOriginHints(req),
      client: clientContext(req),
    });
    res.status(201).json({
      success: true,
      message: 'Invitation created. The link is shown once; share it securely.',
      ...result,
    });
  }
);

/** PATCH /api/admin/agencies/:id/members/:userId — change one role. */
export const updateAgencyMemberRole = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = agencyMemberRoleSchema.parse(req.body);
    const agency = await agencies.changeAgencyMemberRoleAsAdmin({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      targetUserId: String(req.params.userId),
      role: body.role,
      client: clientContext(req),
    });
    res.status(200).json({ success: true, agency });
  }
);

/** DELETE /api/admin/agencies/:id/members/:userId — remove a membership. */
export const removeAgencyMember = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const agency = await agencies.removeAgencyMemberAsAdmin({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      targetUserId: String(req.params.userId),
      client: clientContext(req),
    });
    res.status(200).json({ success: true, agency });
  }
);

/**
 * POST /api/admin/agencies/:id/members/:userId/transfer-owner
 *
 * Promotes the path member to owner and demotes the current owner named in the
 * body (default: the earliest owner). Promotion happens first, so the tenant is
 * never ownerless.
 */
export const transferAgencyOwner = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = agencyOwnerTransferSchema.parse(req.body ?? {});
    const agency = await agencies.transferAgencyOwner({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      toUserId: String(req.params.userId),
      fromUserId: body.fromUserId,
      client: clientContext(req),
    });
    res.status(200).json({
      success: true,
      message: 'Ownership transferred. The previous owner is now an admin.',
      agency,
    });
  }
);

/** POST /api/admin/agencies/:id/members/:userId/reset-password */
export const resetAgencyMemberPassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await agencies.resetAgencyMemberPassword({
      actorId: String(req.userId),
      agencyId: String(req.params.id),
      userId: String(req.params.userId),
      client: clientContext(req),
    });
    res.status(200).json({
      success: true,
      message:
        'Temporary workspace password issued. Share it securely; it can only be shown once.',
      ...result,
    });
  }
);

/** GET /api/admin/audit?q=&action=&targetType=&from=&to=&page=&limit= */
export const platformAudit = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(platformAuditQuerySchema, req.query);
    const result = await agencies.listPlatformAudit(query);
    res.status(200).json({ success: true, ...result });
  }
);
