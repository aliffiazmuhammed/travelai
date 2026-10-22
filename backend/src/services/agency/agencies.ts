import Agency, { IAgency } from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import { AppError } from '../../utils/AppError.js';
import type { AgencyRole } from './access.js';

/** Public agency projection. Internal fields (createdBy) stay server-side. */
export interface AgencySummary {
  _id: string;
  name: string;
  branding: Record<string, unknown>;
  role: AgencyRole;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function projectAgency(
  agency: IAgency | any,
  role: AgencyRole,
  memberCount: number
): AgencySummary {
  return {
    _id: String(agency._id),
    name: String(agency.name),
    branding: agency.branding ?? {},
    role,
    memberCount,
    createdAt: agency.createdAt,
    updatedAt: agency.updatedAt,
  };
}

/** Every agency the caller belongs to, newest membership first. */
export async function listAgenciesForUser(userId: string): Promise<AgencySummary[]> {
  const memberships = await AgencyMember.find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  if (memberships.length === 0) return [];

  const agencyIds = memberships.map((membership) => membership.agencyId);
  const agencies = await Agency.find({ _id: { $in: agencyIds } }).lean();
  const byId = new Map(agencies.map((agency) => [String(agency._id), agency]));

  const counts = await AgencyMember.aggregate<{ _id: unknown; count: number }>([
    { $match: { agencyId: { $in: agencyIds } } },
    { $group: { _id: '$agencyId', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));

  return memberships
    .map((membership) => {
      const agency = byId.get(String(membership.agencyId));
      if (!agency) return null;
      return projectAgency(
        agency,
        membership.role as AgencyRole,
        countById.get(String(membership.agencyId)) ?? 0
      );
    })
    .filter((agency): agency is AgencySummary => agency !== null);
}

export async function agencyMemberCount(agencyId: string): Promise<number> {
  return AgencyMember.countDocuments({ agencyId });
}

export interface CreateAgencyInput {
  userId: string;
  name: string;
  branding?: Record<string, unknown>;
}

/**
 * Creates the tenant and its first owner.
 *
 * Mongo standalone does not support multi-document transactions, so the
 * compensating action is explicit: if the owner row cannot be written, the
 * orphan agency is removed. The unique (agencyId, userId) index makes a
 * duplicate owner impossible.
 */
export async function createAgencyForUser(input: CreateAgencyInput): Promise<AgencySummary> {
  const name = String(input.name || '').trim();
  if (name.length < 2) {
    throw new AppError('Agency name must be at least 2 characters.', 400);
  }

  const agency = await Agency.create({
    name,
    branding: input.branding ?? {},
    createdBy: input.userId,
  });

  try {
    await AgencyMember.create({
      agencyId: agency._id,
      userId: input.userId,
      role: 'owner',
      joinedAt: new Date(),
    });
  } catch (error) {
    await Agency.deleteOne({ _id: agency._id });
    throw error;
  }

  return projectAgency(agency, 'owner', 1);
}

export interface UpdateAgencyInput {
  name?: string;
  branding?: Record<string, unknown>;
}

export async function updateAgencyDetails(
  agencyId: string,
  updates: UpdateAgencyInput
): Promise<IAgency> {
  const set: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    set.name = updates.name;
  }
  if (updates.branding) {
    for (const [key, value] of Object.entries(updates.branding)) {
      if (value !== undefined) set[`branding.${key}`] = value;
    }
  }

  if (Object.keys(set).length === 0) {
    throw new AppError('Provide a name or a branding change.', 400);
  }

  const agency = await Agency.findByIdAndUpdate(
    agencyId,
    { $set: set },
    { new: true, runValidators: true }
  );
  if (!agency) {
    throw new AppError('Agency not found', 404);
  }
  return agency;
}
