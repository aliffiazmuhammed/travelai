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
      branding: req.body?.branding,
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
