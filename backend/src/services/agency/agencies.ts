import Agency, { IAgency } from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import { AppError } from '../../utils/AppError.js';
import type { AgencyRole } from './access.js';

/** Public agency projection. Internal fields (createdBy) stay server-side. */
export interface AgencySummary {
  _id: string;
  name: string;
  branding: Record<string, unknown>;
  gstin?: string;
  defaultTerms: {
    inclusions: string[];
    exclusions: string[];
    terms: string[];
  };
  role: AgencyRole;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function termsList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
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
    gstin: agency.gstin ?? undefined,
    defaultTerms: {
      inclusions: termsList(agency.defaultTerms?.inclusions),
      exclusions: termsList(agency.defaultTerms?.exclusions),
      terms: termsList(agency.defaultTerms?.terms),
    },
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
  gstin?: string;
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
  const gstin = String(input.gstin ?? '').trim().toUpperCase();

  const agency = await Agency.create({
    name,
    ...(gstin ? { gstin } : {}),
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
  gstin?: string;
  branding?: Record<string, unknown>;
  defaultTerms?: {
    inclusions?: unknown;
    exclusions?: unknown;
    terms?: unknown;
  };
}

/**
 * Branding is a fixed set of fields. The request validator checks their shape,
 * but `req.body` is not replaced by the parsed value, so the service repeats
 * the allow-list: an unknown key can never be written into the tenant document.
 */
const BRANDING_KEYS = [
  'logoUrl',
  'mascotUrl',
  'primaryColor',
  'accentColor',
  'fontHeading',
  'fontBody',
  'contactEmail',
  'contactPhone',
  'website',
  'address',
] as const;

export interface AgencyUpdate {
  $set: Record<string, unknown>;
  $unset: Record<string, 1>;
}

const TERMS_KEYS = ['inclusions', 'exclusions', 'terms'] as const;
export const AGENCY_TERMS_MAX_ITEMS = 30;
export const AGENCY_TERMS_MAX_LENGTH = 300;

function normalizeTerms(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new AppError(`Quote ${label} must be a list.`, 400);
  }
  if (value.length > AGENCY_TERMS_MAX_ITEMS) {
    throw new AppError(
      `Add at most ${AGENCY_TERMS_MAX_ITEMS} ${label} lines.`,
      400
    );
  }
  return value.map((entry) => {
    if (typeof entry !== 'string') {
      throw new AppError(`Quote ${label} must be text.`, 400);
    }
    const line = entry.trim();
    if (!line) {
      throw new AppError(`Remove the empty ${label} line.`, 400);
    }
    if (line.length > AGENCY_TERMS_MAX_LENGTH) {
      throw new AppError(
        `Keep each ${label} line under ${AGENCY_TERMS_MAX_LENGTH} characters.`,
        400
      );
    }
    return line;
  });
}

/** Builds a partial update; empty strings mean "remove this value". */
export function buildAgencyUpdate(updates: UpdateAgencyInput): AgencyUpdate {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (updates.name !== undefined) {
    const name = String(updates.name).trim();
    if (name.length < 2) {
      throw new AppError('Agency name must be at least 2 characters.', 400);
    }
    $set.name = name;
  }

  if (updates.gstin !== undefined) {
    const gstin = String(updates.gstin).trim().toUpperCase();
    if (gstin) $set.gstin = gstin;
    else $unset.gstin = 1;
  }

  if (updates.branding) {
    for (const key of BRANDING_KEYS) {
      const value = updates.branding[key];
      if (value === undefined || typeof value !== 'string') continue;
      const normalized = value.trim();
      if (!normalized) {
        $unset[`branding.${key}`] = 1;
        continue;
      }
      $set[`branding.${key}`] =
        key === 'contactEmail' ? normalized.toLowerCase() : normalized;
    }
  }

  if (updates.defaultTerms) {
    for (const key of TERMS_KEYS) {
      const value = updates.defaultTerms[key];
      if (value === undefined) continue;
      // An empty array is meaningful: the agency cleared its default lines.
      $set[`defaultTerms.${key}`] = normalizeTerms(value, key);
    }
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    throw new AppError('Provide a name, branding or quote-default change.', 400);
  }

  return { $set, $unset };
}

export async function updateAgencyDetails(
  agencyId: string,
  updates: UpdateAgencyInput
): Promise<IAgency> {
  const { $set, $unset } = buildAgencyUpdate(updates);
  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const agency = await Agency.findByIdAndUpdate(agencyId, update, {
    new: true,
    runValidators: true,
  });
  if (!agency) {
    throw new AppError('Agency not found', 404);
  }
  return agency;
}
