import mongoose, { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyPackage, { type AgencyPackageState } from '../../models/AgencyPackage.js';
import AgencyProfile, { type AgencyProfileState } from '../../models/AgencyProfile.js';
import { AppError } from '../../utils/AppError.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { recordPlatformAudit } from './audit.js';
import { directoryReadiness } from '../directory/profile.js';
import { agencyReplyTimeHours } from '../directory/insights.js';

/**
 * Platform ops tooling for the public directory (Milestone 9 D7).
 *
 * Two rules shape this module:
 *
 * 1. **Ops acts on the directory row, not on tenant intent.** Hide stamps
 *    `moderation` (and, for a profile, the `hidden` state) without deleting the
 *    agency's publish date; restore returns a profile to `published` when it
 *    had a date, otherwise `draft`. A package keeps its own `draft`/`published`
 *    state throughout, so a takedown and a restore never overwrite a decision
 *    the agency made.
 * 2. **Every decision is accountable.** Each mutation writes one platform audit
 *    row (authoritative) and one tenant audit row (best effort, shown to the
 *    agency), and returns the refreshed directory view so the console can
 *    update without re-reading usage.
 */

export interface DirectoryAdminProfileRow {
  state: AgencyProfileState;
  publishedAt: string | null;
  verifiedAt: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  ready: boolean;
  missing: string[];
  /** Median first-response hours, or null below the public threshold. */
  replyTimeHours: number | null;
}

export interface DirectoryAdminPackageRow {
  id: string;
  title: string;
  state: AgencyPackageState;
  pricePerPerson: number | null;
  currency: string;
  publishedAt: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

export interface DirectoryAdminView {
  slug: string;
  profile: DirectoryAdminProfileRow | null;
  packages: DirectoryAdminPackageRow[];
}

export interface DirectoryMutationResult {
  changed: boolean;
  directory: DirectoryAdminView;
}

export interface DirectoryClientContext {
  ip?: string;
  userAgent?: string;
}

interface DirectoryMutationInput {
  actorId: string;
  agencyId: string;
  client?: DirectoryClientContext;
}

function assertAgencyId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Agency not found.', 404);
  }
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The takedown note is optional but always bounded and trimmed. */
function normalizeReason(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 500) : undefined;
}

async function profileAudit(input: {
  agencyId: string;
  actorId: string;
  action: string;
  slug: string;
  metadata?: Record<string, unknown>;
  client?: DirectoryClientContext;
}): Promise<void> {
  await recordPlatformAudit({
    actorId: input.actorId,
    action: `directory.${input.action}`,
    targetType: 'agency',
    targetId: input.agencyId,
    metadata: { slug: input.slug, ...input.metadata },
    ip: input.client?.ip,
    userAgent: input.client?.userAgent,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: input.action,
    targetType: 'profile',
    metadata: { source: 'platform', ...input.metadata },
  });
}

/** The console's directory section: profile state, readiness and packages. */
export async function loadDirectoryAdminView(
  agencyId: string
): Promise<DirectoryAdminView> {
  assertAgencyId(agencyId);

  const [agency, profile, packages] = await Promise.all([
    Agency.findById(agencyId).select('slug branding').lean(),
    AgencyProfile.findOne({ agencyId }).lean(),
    AgencyPackage.find({ agencyId })
      .sort({ order: 1, createdAt: -1 })
      .select('title state fromPricePerPerson currency publishedAt moderation')
      .lean(),
  ]);
  if (!agency) throw new AppError('Agency not found.', 404);

  const rows = (packages as any[]) ?? [];
  const replyTimeHours = profile ? await agencyReplyTimeHours(agencyId) : null;

  return {
    slug: String((agency as any).slug ?? ''),
    profile: profile
      ? {
          state: (profile.state ?? 'draft') as AgencyProfileState,
          publishedAt: iso(profile.publishedAt),
          verifiedAt: iso(profile.verifiedAt),
          hiddenAt: iso(profile.moderation?.hiddenAt),
          hiddenReason: profile.moderation?.reason
            ? String(profile.moderation.reason)
            : null,
          ...directoryReadiness(profile, agency),
          replyTimeHours,
        }
      : null,
    packages: rows.map((pkg) => ({
      id: String(pkg._id),
      title: String(pkg.title ?? ''),
      state: (pkg.state ?? 'draft') as AgencyPackageState,
      pricePerPerson:
        pkg.fromPricePerPerson === null || pkg.fromPricePerPerson === undefined
          ? null
          : Number(pkg.fromPricePerPerson),
      currency: String(pkg.currency ?? 'INR'),
      publishedAt: iso(pkg.publishedAt),
      hiddenAt: iso(pkg.moderation?.hiddenAt),
      hiddenReason: pkg.moderation?.reason ? String(pkg.moderation.reason) : null,
    })),
  };
}

/** Verify or unverify a published profile (the badge only). */
export async function setProfileVerification(
  input: DirectoryMutationInput & { verified: boolean }
): Promise<DirectoryMutationResult> {
  assertAgencyId(input.agencyId);
  const profile = await AgencyProfile.findOne({ agencyId: input.agencyId });
  if (!profile) {
    throw new AppError('This agency has no public profile yet.', 404);
  }

  const agency = await Agency.findById(input.agencyId).select('slug').lean();
  const slug = String((agency as any)?.slug ?? '');

  if (Boolean(profile.verifiedAt) === input.verified) {
    return {
      changed: false,
      directory: await loadDirectoryAdminView(input.agencyId),
    };
  }

  profile.verifiedAt = input.verified ? new Date() : null;
  await profile.save();

  await profileAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    slug,
    action: input.verified ? 'profile.verified' : 'profile.unverified',
    client: input.client,
  });

  return {
    changed: true,
    directory: await loadDirectoryAdminView(input.agencyId),
  };
}

/**
 * Hide or restore a profile. Hide keeps `publishedAt` so a restore can put the
 * agency back exactly where it was; restore never republishes a draft.
 */
export async function setProfileHidden(
  input: DirectoryMutationInput & { hidden: boolean; reason?: unknown }
): Promise<DirectoryMutationResult> {
  assertAgencyId(input.agencyId);
  const profile = await AgencyProfile.findOne({ agencyId: input.agencyId });
  if (!profile) {
    throw new AppError('This agency has no public profile yet.', 404);
  }

  const agency = await Agency.findById(input.agencyId).select('slug').lean();
  const slug = String((agency as any)?.slug ?? '');

  if (Boolean(profile.moderation?.hiddenAt) === input.hidden) {
    return {
      changed: false,
      directory: await loadDirectoryAdminView(input.agencyId),
    };
  }

  const reason = normalizeReason(input.reason);

  if (input.hidden) {
    profile.moderation = {
      hiddenAt: new Date(),
      hiddenBy: new Types.ObjectId(input.actorId),
      ...(reason ? { reason } : {}),
    };
    profile.state = 'hidden';
  } else {
    profile.moderation = { hiddenAt: null };
    profile.state = profile.publishedAt ? 'published' : 'draft';
  }
  await profile.save();

  await profileAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    slug,
    action: input.hidden ? 'profile.hidden' : 'profile.restored',
    // The reason matters on the way in; restore records that the note cleared.
    metadata: input.hidden
      ? { reason: reason ?? '', state: profile.state }
      : { state: profile.state },
    client: input.client,
  });

  return {
    changed: true,
    directory: await loadDirectoryAdminView(input.agencyId),
  };
}

/**
 * Hide or restore one package. The package's `draft`/`published` state is never
 * rewritten here; public reads simply exclude a hidden row.
 */
export async function setPackageHidden(
  input: DirectoryMutationInput & {
    packageId: string;
    hidden: boolean;
    reason?: unknown;
  }
): Promise<DirectoryMutationResult> {
  assertAgencyId(input.agencyId);
  if (!mongoose.isValidObjectId(input.packageId)) {
    throw new AppError('Package not found.', 404);
  }

  const pkg = await AgencyPackage.findOne({
    _id: input.packageId,
    agencyId: input.agencyId,
  });
  if (!pkg) throw new AppError('Package not found.', 404);

  const agency = await Agency.findById(input.agencyId).select('slug').lean();
  const slug = String((agency as any)?.slug ?? '');

  if (Boolean(pkg.moderation?.hiddenAt) === input.hidden) {
    return {
      changed: false,
      directory: await loadDirectoryAdminView(input.agencyId),
    };
  }

  const reason = normalizeReason(input.reason);
  const action = input.hidden
    ? 'directory.package.hidden'
    : 'directory.package.restored';

  if (input.hidden) {
    pkg.moderation = {
      hiddenAt: new Date(),
      hiddenBy: new Types.ObjectId(input.actorId),
      ...(reason ? { reason } : {}),
    };
  } else {
    pkg.moderation = { hiddenAt: null };
  }
  await pkg.save();

  await recordPlatformAudit({
    actorId: input.actorId,
    action,
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: {
      agencyId: input.agencyId,
      slug,
      title: pkg.title,
      ...(input.hidden ? { reason: reason ?? '', state: pkg.state } : {}),
    },
    ip: input.client?.ip,
    userAgent: input.client?.userAgent,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: input.hidden ? 'package.hidden' : 'package.restored',
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: {
      source: 'platform',
      title: pkg.title,
      ...(input.hidden ? { reason: reason ?? '' } : {}),
    },
  });

  return {
    changed: true,
    directory: await loadDirectoryAdminView(input.agencyId),
  };
}
