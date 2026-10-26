import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Agency, { type IAgency, type IAgencyBilling } from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import User, { type IUser } from '../../models/User.js';
import { env, type AgencyPlanTier } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import {
  allocateAgencySlug,
  isValidAgencySlug,
  AGENCY_SLUG_MAX,
} from '../agency/slug.js';
import { planLimitsFor } from '../agency/plan.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { generateTemporaryPassword } from './accounts.js';
import { recordPlatformAudit } from './audit.js';

/**
 * Platform-side agency provisioning (PA3).
 *
 * Creating a tenant is one operation with three durable rows: the Agency, the
 * owner's *agency-realm* account, and the owner membership. There is no public
 * signup and no conversion: a personal or platform account with the same email
 * is left untouched, and an email already attached to another workspace is
 * rejected because an agency account belongs to exactly one tenant.
 *
 * MongoDB here is a standalone/local deployment, so the write sequence uses
 * compensating cleanup rather than transactions: on any failure the rows this
 * call created are removed in reverse order and the caller sees the original
 * error.
 */

export interface AgencyPlanTierOption extends AgencyPlanTier {
  tierId: string;
  isDefault: boolean;
}

/** Plan catalog for the provisioning wizard (limits only, no secrets). */
export function listAgencyPlanTiers(): AgencyPlanTierOption[] {
  return Object.entries(env.AGENCY_PLAN_TIERS)
    .map(([tierId, tier]) => ({
      tierId,
      seats: tier.seats,
      monthlyExports: tier.monthlyExports,
      storageMb: tier.storageMb,
      isDefault: tierId === env.AGENCY_PLAN_DEFAULT,
    }))
    .sort((a, b) => a.tierId.localeCompare(b.tierId));
}

/** Rejects an unknown tier with a 400 instead of writing an unusable plan. */
export function normalizePlanTierId(value?: string): string {
  const tierId = String(value ?? env.AGENCY_PLAN_DEFAULT).trim();
  if (!env.AGENCY_PLAN_TIERS[tierId]) {
    throw new AppError('Choose a valid plan tier.', 400);
  }
  return tierId;
}

export interface AgencyOwnerAccountSummary {
  accountType: 'personal' | 'agency' | 'platform';
  agency?: { name: string; slug: string };
}

export interface AgencyOwnerPreview {
  email: string;
  personalAccount: boolean;
  platformAccount: boolean;
  /** An agency account for this email already belongs to another workspace. */
  otherAgency?: { name: string; workspace: string };
  /** True when provisioning must not proceed; `blockedReason` explains why. */
  blocked: boolean;
  blockedReason?: string;
  warnings: string[];
}

/**
 * Pure preview builder: the wizard calls this before submit so the operator sees
 * exactly what will happen to an existing email. Blocker and warnings are
 * derived from account rows only — never tenant content.
 */
export function buildAgencyOwnerPreview(
  email: string,
  accounts: AgencyOwnerAccountSummary[]
): AgencyOwnerPreview {
  const personalAccount = accounts.some((row) => row.accountType === 'personal');
  const platformAccount = accounts.some((row) => row.accountType === 'platform');
  const otherAgencyRow = accounts.find(
    (row) => row.accountType === 'agency' && Boolean(row.agency)
  );

  const warnings: string[] = [];
  if (personalAccount) {
    warnings.push(
      'A personal TravelAI account already uses this email. It stays separate and keeps its own password and trips.'
    );
  }
  if (platformAccount) {
    warnings.push(
      'A platform admin account uses this email. The new agency account is a separate identity.'
    );
  }

  const preview: AgencyOwnerPreview = {
    email,
    personalAccount,
    platformAccount,
    blocked: false,
    warnings,
  };

  if (otherAgencyRow?.agency) {
    preview.otherAgency = {
      name: otherAgencyRow.agency.name,
      workspace: otherAgencyRow.agency.slug,
    };
    preview.blocked = true;
    preview.blockedReason = `This email already belongs to the ${otherAgencyRow.agency.slug} workspace. An agency account can only belong to one workspace; use a different owner email.`;
  }

  return preview;
}

export interface ProvisioningCleanupStep {
  kind: 'membership' | 'user' | 'agency';
  id: string;
}

/**
 * Reverse-order compensation plan. Only rows created by the current call are
 * listed, so a reused owner account or a pre-existing agency is never deleted.
 */
export function provisioningCleanupPlan(created: {
  membershipId?: string | null;
  userId?: string | null;
  agencyId?: string | null;
}): ProvisioningCleanupStep[] {
  const steps: ProvisioningCleanupStep[] = [];
  if (created.membershipId) {
    steps.push({ kind: 'membership', id: String(created.membershipId) });
  }
  if (created.userId) {
    steps.push({ kind: 'user', id: String(created.userId) });
  }
  if (created.agencyId) {
    steps.push({ kind: 'agency', id: String(created.agencyId) });
  }
  return steps;
}

export interface ProvisionAgencyInput {
  actorId: string;
  name: string;
  /** Optional explicit slug; omitted means allocate from the name. */
  slug?: string;
  planTierId?: string;
  billing?: {
    contactName?: string;
    contactEmail?: string;
    renewalDate?: string;
    notes?: string;
  };
  ownerEmail: string;
  ownerName?: string;
  client?: { ip?: string; userAgent?: string };
}

export interface ProvisionedAgencySummary {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: {
    tierId: string;
    seats: number;
    monthlyExports: number;
    storageMb: number;
  };
  billing?: IAgencyBilling;
  provisionedAt: string;
}

export interface ProvisionAgencyResult {
  agency: ProvisionedAgencySummary;
  owner: {
    accountId: string;
    email: string;
    name?: string;
    created: boolean;
    mustChangePassword: boolean;
    workspace: string;
  };
  /** Present only when this call created the account. Shown once. */
  temporaryPassword?: string;
  warnings: string[];
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Explicit slugs are validated, not silently rewritten. */
export function normalizeRequestedAgencySlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase();
  if (!slug) throw new AppError('Enter a workspace slug.', 400);
  if (!isValidAgencySlug(slug)) {
    throw new AppError(
      `Use ${AGENCY_SLUG_MAX} characters or fewer: lowercase letters, numbers and single dashes.`,
      400
    );
  }
  return slug;
}

export function normalizeAgencyBilling(
  input: ProvisionAgencyInput['billing']
): IAgencyBilling | undefined {
  if (!input) return undefined;

  const billing: IAgencyBilling = {};
  const contactName = String(input.contactName ?? '').trim();
  const contactEmail = normalizeEmail(input.contactEmail);
  const notes = String(input.notes ?? '').trim();

  if (contactName) billing.contactName = contactName.slice(0, 120);
  if (contactEmail) billing.contactEmail = contactEmail.slice(0, 160);
  if (notes) billing.notes = notes.slice(0, 2000);
  if (input.renewalDate) {
    const renewalDate = new Date(input.renewalDate);
    if (Number.isNaN(renewalDate.getTime())) {
      throw new AppError('Enter a valid renewal date.', 400);
    }
    billing.renewalDate = renewalDate;
  }

  return Object.keys(billing).length > 0 ? billing : undefined;
}

function projectProvisionedAgency(agency: IAgency): ProvisionedAgencySummary {
  const limits = planLimitsFor(agency);
  return {
    _id: String(agency._id),
    name: String(agency.name),
    slug: String(agency.slug),
    status: agency.status,
    plan: limits,
    ...(agency.billing && Object.keys(agency.billing).length > 0
      ? { billing: agency.billing }
      : {}),
    provisionedAt: (
      agency.provisionedAt ??
      agency.createdAt ??
      new Date()
    ).toISOString(),
  };
}

/** Loads the tenant label for the owner email's agency rows (preview only). */
async function loadOwnerAccountSummaries(
  email: string
): Promise<AgencyOwnerAccountSummary[]> {
  const rows = (await User.find({ email })
    .select('accountType agencyId')
    .lean()) as unknown as Array<{
    accountType: 'personal' | 'agency' | 'platform';
    agencyId?: mongoose.Types.ObjectId;
  }>;

  const agencyIds = [
    ...new Set(
      rows
        .map((row) => row.agencyId)
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
        .map((id) => String(id))
    ),
  ];

  const agencies =
    agencyIds.length > 0
      ? ((await Agency.find({ _id: { $in: agencyIds } })
          .select('name slug')
          .lean()) as unknown as Array<{
          _id: mongoose.Types.ObjectId;
          name: string;
          slug: string;
        }>)
      : [];
  const byId = new Map(
    agencies.map((agency) => [
      String(agency._id),
      { name: String(agency.name), slug: String(agency.slug) },
    ])
  );

  return rows.map((row) => ({
    accountType: row.accountType,
    ...(row.agencyId && byId.get(String(row.agencyId))
      ? { agency: byId.get(String(row.agencyId)) }
      : {}),
  }));
}

/** Pre-submit owner lookup for the provisioning wizard. */
export async function previewAgencyOwner(
  email: unknown
): Promise<AgencyOwnerPreview> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new AppError('Enter the owner email address.', 400);
  return buildAgencyOwnerPreview(
    normalized,
    await loadOwnerAccountSummaries(normalized)
  );
}

async function writeProvisioningAudits(input: {
  actorId: string;
  agency: IAgency;
  owner: IUser;
  accountCreated: boolean;
  temporaryPasswordIssued: boolean;
  warnings: string[];
  client?: ProvisionAgencyInput['client'];
}): Promise<void> {
  const { actorId, agency, owner } = input;

  await recordPlatformAudit({
    actorId,
    action: 'agency.created',
    targetType: 'agency',
    targetId: String(agency._id),
    metadata: {
      name: agency.name,
      workspace: agency.slug,
      planTierId: planLimitsFor(agency).tierId,
    },
    ...input.client,
  });

  await recordPlatformAudit({
    actorId,
    action: 'agency.owner_assigned',
    targetType: 'account',
    targetId: String(owner._id),
    metadata: {
      email: owner.email,
      workspace: agency.slug,
      accountCreated: input.accountCreated,
      temporaryPasswordIssued: input.temporaryPasswordIssued,
    },
    ...input.client,
  });

  // Tenant-visible audit rows. Secrets never enter metadata.
  await recordAgencyAudit({
    agencyId: String(agency._id),
    actorId,
    action: 'agency.created',
    targetType: 'Agency',
    targetId: String(agency._id),
    metadata: { name: agency.name, workspace: agency.slug },
  });
  await recordAgencyAudit({
    agencyId: String(agency._id),
    actorId,
    action: 'agency.owner_assigned',
    targetType: 'User',
    targetId: String(owner._id),
    metadata: {
      role: 'owner',
      accountCreated: input.accountCreated,
    },
  });
}

async function compensate(plan: ProvisioningCleanupStep[]): Promise<void> {
  for (const step of plan) {
    try {
      if (step.kind === 'membership') {
        await AgencyMember.deleteOne({ _id: step.id });
      } else if (step.kind === 'user') {
        await User.deleteOne({ _id: step.id });
      } else {
        await Agency.deleteOne({ _id: step.id });
      }
    } catch (error) {
      // Cleanup is best-effort; the caller still receives the original error.
      console.warn(`Could not roll back ${step.kind} ${step.id}:`, error);
    }
  }
}

export async function provisionAgency(
  input: ProvisionAgencyInput
): Promise<ProvisionAgencyResult> {
  const name = String(input.name ?? '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new AppError('Agency name must be 2 to 80 characters.', 400);
  }

  const ownerEmail = normalizeEmail(input.ownerEmail);
  if (!ownerEmail) throw new AppError('Enter the owner email address.', 400);

  const tierId = normalizePlanTierId(input.planTierId);

  const explicitSlug = input.slug
    ? normalizeRequestedAgencySlug(input.slug)
    : undefined;

  // Block before any write: one agency account, one tenant.
  const preview = await previewAgencyOwner(ownerEmail);
  if (preview.blocked) {
    throw new AppError(preview.blockedReason ?? 'This email cannot own a new workspace.', 409);
  }

  if (explicitSlug && (await Agency.exists({ slug: explicitSlug }))) {
    throw new AppError('That workspace slug is already taken.', 409);
  }

  const slug =
    explicitSlug ??
    allocateAgencySlug(name, await Agency.distinct('slug'));
  if (await Agency.exists({ slug })) {
    throw new AppError('That workspace slug is already taken.', 409);
  }

  const billing = normalizeAgencyBilling(input.billing);
  const ownerName = String(input.ownerName ?? '').trim();

  let agency: IAgency;
  try {
    agency = await Agency.create({
      name,
      slug,
      status: 'active',
      plan: { tierId },
      ...(billing ? { billing } : {}),
      provisionedBy: input.actorId,
      provisionedAt: new Date(),
      createdBy: input.actorId,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('That workspace slug is already taken.', 409);
    }
    throw error;
  }

  let owner: IUser | null = null;
  let accountCreated = false;
  let membershipId: string | null = null;
  let temporaryPassword: string | undefined;

  try {
    // Reuse an account that already belongs to this tenant (retry / PA4 flows).
    owner = await User.findOne({
      accountType: 'agency',
      agencyId: agency._id,
      email: ownerEmail,
    });

    if (!owner) {
      temporaryPassword = generateTemporaryPassword();
      owner = await User.create({
        email: ownerEmail,
        password: await bcrypt.hash(temporaryPassword, 12),
        accountType: 'agency',
        agencyId: agency._id,
        status: 'active',
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        createdBy: input.actorId,
        ...(ownerName ? { name: ownerName } : {}),
      });
      accountCreated = true;
    }

    const existingMembership = await AgencyMember.findOne({
      agencyId: agency._id,
      userId: owner._id,
    });
    if (!existingMembership) {
      const membership = await AgencyMember.create({
        agencyId: agency._id,
        userId: owner._id,
        role: 'owner',
        invitedBy: input.actorId,
        joinedAt: new Date(),
      });
      membershipId = String(membership._id);
    }
  } catch (error: any) {
    await compensate(
      provisioningCleanupPlan({
        membershipId,
        userId: accountCreated && owner ? String(owner._id) : null,
        agencyId: String(agency._id),
      })
    );
    if (error?.code === 11000) {
      throw new AppError(
        'This owner already belongs to another workspace. Use a different owner email.',
        409
      );
    }
    throw error;
  }

  const result: ProvisionAgencyResult = {
    agency: projectProvisionedAgency(agency),
    owner: {
      accountId: String(owner._id),
      email: String(owner.email),
      ...(owner.name ? { name: String(owner.name) } : {}),
      created: accountCreated,
      mustChangePassword: owner.mustChangePassword === true,
      workspace: String(agency.slug),
    },
    warnings: preview.warnings,
    ...(temporaryPassword ? { temporaryPassword } : {}),
  };

  await writeProvisioningAudits({
    actorId: input.actorId,
    agency,
    owner,
    accountCreated,
    temporaryPasswordIssued: Boolean(temporaryPassword),
    warnings: preview.warnings,
    client: input.client,
  });

  return result;
}
