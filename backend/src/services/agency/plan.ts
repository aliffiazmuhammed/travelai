import crypto from 'crypto';
import { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyAsset from '../../models/AgencyAsset.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyTemplateVersion from '../../models/AgencyTemplateVersion.js';
import { env, type AgencyPlanTier } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { recordAgencyAudit } from './audit.js';

/**
 * A8 plan limits and usage (Agency Workspace).
 *
 * Limits resolve from the agency's ops-applied override (`Agency.plan`) over
 * the environment tier table. Usage is computed live from the collections —
 * no counters to drift. Enforcement happens inside the mutation services
 * (invites, exports, uploads), never in middleware, so every check can answer
 * with the exact numbers that were exceeded.
 */

export interface AgencyPlanLimits {
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
}

export interface AgencyUsage {
  seats: number;
  exportsThisMonth: number;
  storageBytes: number;
}

const MB = 1024 * 1024;

/** Start of the current calendar month (UTC), the export-quota window. */
export function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Export activity this month = rows created or touched since the 1st. A retry
 * updates `updatedAt` rather than inserting, so a retried row still counts
 * exactly once.
 */
const exportActivityThisMonthFilter = {
  $or: [
    { createdAt: { $gte: monthStart() } },
    { updatedAt: { $gte: monthStart() } },
  ],
};

export function planTier(tierId: string): AgencyPlanTier {
  const tier = env.AGENCY_PLAN_TIERS[tierId];
  if (!tier) {
    throw new AppError('The plan configuration is invalid.', 500);
  }
  return tier;
}

export function planLimitsFor(agency: {
  plan?: { tierId: string; seats?: number; monthlyExports?: number; storageMb?: number } | null;
}): AgencyPlanLimits {
  const tierId = agency.plan?.tierId || env.AGENCY_PLAN_DEFAULT;
  const tier = planTier(tierId);
  return {
    tierId,
    seats: agency.plan?.seats ?? tier.seats,
    monthlyExports: agency.plan?.monthlyExports ?? tier.monthlyExports,
    storageMb: agency.plan?.storageMb ?? tier.storageMb,
  };
}

interface AggregateModel {
  aggregate<T = unknown>(pipeline?: unknown[]): { exec(): Promise<T[]> };
}

async function sumField(
  model: AggregateModel,
  match: Record<string, unknown>,
  field: string
): Promise<number> {
  const rows = await model
    .aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ])
    .exec();
  return Number(rows[0]?.total ?? 0);
}

export async function agencyStorageBytes(agencyId: string): Promise<number> {
  const now = new Date();
  // Aggregation $match does not cast strings, so pass a real ObjectId.
  const agencyObjectId = new Types.ObjectId(agencyId);
  const [assetBytes, templateBytes, exportBytes] = await Promise.all([
    sumField(AgencyAsset, { agencyId: agencyObjectId }, 'bytes'),
    sumField(AgencyTemplateVersion, { agencyId: agencyObjectId }, 'sourceBytes'),
    sumField(
      AgencyExport,
      {
        agencyId: agencyObjectId,
        bytes: { $exists: true },
        expiresAt: { $gt: now },
      },
      'bytes'
    ),
  ]);
  return assetBytes + templateBytes + exportBytes;
}

export async function agencyUsage(agencyId: string): Promise<AgencyUsage> {
  const [seats, exportsThisMonth, storageBytes] = await Promise.all([
    AgencyMember.countDocuments({ agencyId }),
    AgencyExport.countDocuments({
      agencyId,
      ...exportActivityThisMonthFilter,
    }),
    agencyStorageBytes(agencyId),
  ]);
  return { seats, exportsThisMonth, storageBytes };
}

/** ok → warning (≥80%) → over (≥100%) for one metric. */
export function usageLevel(used: number, cap: number): 'ok' | 'warning' | 'over' {
  if (used >= cap) return 'over';
  if (cap > 0 && used >= cap * 0.8) return 'warning';
  return 'ok';
}

const loadPlanAgency = async (agencyId: string) => {
  const agency = await Agency.findById(agencyId).select('plan').lean();
  if (!agency) throw new AppError('Agency not found', 404);
  return agency;
};

export async function assertSeatAvailable(agencyId: string): Promise<void> {
  const agency = await loadPlanAgency(agencyId);
  const limits = planLimitsFor(agency);
  const used = await AgencyMember.countDocuments({ agencyId });
  if (used >= limits.seats) {
    throw new AppError(
      `Seat limit reached for this plan (${used}/${limits.seats}). Ask TravelAI to upgrade the plan before inviting more members.`,
      409
    );
  }
}

export async function assertExportQuota(agencyId: string): Promise<void> {
  const agency = await loadPlanAgency(agencyId);
  const limits = planLimitsFor(agency);
  const used = await AgencyExport.countDocuments({
    agencyId,
    ...exportActivityThisMonthFilter,
  });
  if (used >= limits.monthlyExports) {
    throw new AppError(
      `Monthly export limit reached (${used}/${limits.monthlyExports}). The counter resets on the 1st of the month.`,
      409
    );
  }
}

export async function assertStorageQuota(
  agencyId: string,
  additionalBytes: number
): Promise<void> {
  const agency = await loadPlanAgency(agencyId);
  const limits = planLimitsFor(agency);
  const usedBytes = await agencyStorageBytes(agencyId);
  const capBytes = limits.storageMb * MB;
  if (usedBytes + Math.max(0, additionalBytes) > capBytes) {
    throw new AppError(
      `Storage limit reached (${(usedBytes / MB).toFixed(1)}/${limits.storageMb} MB used). Delete unused assets or ask TravelAI to upgrade the plan.`,
      409
    );
  }
}

const opsKeyMatches = (provided: string): boolean => {
  const expected = env.AGENCY_OPS_KEY;
  if (!expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * TravelAI-ops plan change. Gated on `AGENCY_OPS_KEY` (constant-time), not on
 * agency rank — ops is not a member. Absent key = nobody can change plans via
 * the API. Audited without an actor; the viewer labels ops events from the
 * action name.
 */
export async function changeAgencyPlan(input: {
  agencyId: string;
  opsKey: string;
  plan: { tierId: string; seats?: number; monthlyExports?: number; storageMb?: number };
}): Promise<AgencyPlanLimits> {
  if (!opsKeyMatches(input.opsKey)) {
    throw new AppError('Plan changes require TravelAI ops access.', 403);
  }
  planTier(input.plan.tierId);
  const agency = await Agency.findByIdAndUpdate(
    input.agencyId,
    { $set: { plan: input.plan } },
    { new: true, runValidators: true }
  );
  if (!agency) throw new AppError('Agency not found', 404);
  await recordAgencyAudit({
    agencyId: input.agencyId,
    action: 'plan.changed',
    targetType: 'Agency',
    targetId: input.agencyId,
    metadata: { ...input.plan },
  });
  return planLimitsFor(agency);
}
