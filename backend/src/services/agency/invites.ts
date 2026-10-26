import bcrypt from 'bcryptjs';
import Agency from '../../models/Agency.js';
import AgencyInvite, { IAgencyInvite } from '../../models/AgencyInvite.js';
import AgencyMember from '../../models/AgencyMember.js';
import User, { type IUser } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import {
  hashToken,
  linkOriginHints,
  mintInviteToken,
  pickLinkOrigin,
  resolveMaxUses,
  resolveTtlHours,
  tokenHint,
  type LinkOriginHints,
} from '../collab/invites.js';
import {
  AGENCY_ROLE_RANK,
  agencyInvitableRoleSchema,
  type AgencyInvitableRole,
  type AgencyRole,
} from './access.js';
import { publicTenantLogo, type AgencySession } from './auth.js';
import { signSessionForAccount } from '../auth/realm.js';
import { assertSeatAvailable } from './plan.js';

/**
 * Agency invitation mechanics (Agency Workspace A1).
 *
 * We reuse the trip-invite token primitives on purpose: 256-bit URL-safe
 * tokens, sha256-at-rest, generic 404s, TTL indexes and an atomic usage ledger.
 * The only agency-specific parts are the tenant id, the role set (never owner)
 * and the `/agency/invite/:token` landing page.
 */

const sha256 = hashToken;

export function agencyInviteLinkFor(
  rawToken: string,
  hints: LinkOriginHints = {}
): string {
  return `${pickLinkOrigin(hints)}/agency/invite/${rawToken}`;
}

/**
 * Public preview payload (PA0 §4.3). A token holder learns only which tenant
 * invited them, the role and the expiry — never the bound email or inviter.
 */
export interface AgencyInvitePreview {
  agency: { _id: string; name: string; slug: string; logoUrl?: string };
  role: AgencyInvitableRole;
  expiresAt: Date;
}

export interface CreateAgencyInviteInput {
  agencyId: string;
  createdBy: string;
  role: unknown;
  kind: unknown;
  email?: unknown;
  maxUses?: unknown;
  ttlHours?: unknown;
  linkOrigins?: LinkOriginHints;
}

export interface CreateAgencyInviteResult {
  invite: IAgencyInvite;
  link: string;
}

export function projectAgencyInvite(invite: IAgencyInvite) {
  return {
    _id: String(invite._id),
    role: invite.role,
    kind: invite.kind,
    email: invite.email ?? null,
    tokenHint: invite.tokenHint,
    expiresAt: invite.expiresAt,
    maxUses: invite.maxUses,
    usedCount: (invite.acceptedBy || []).length,
    revokedAt: invite.revokedAt ?? null,
    createdAt: invite.createdAt,
  };
}

export interface AgencyInviteRedeemabilityShape {
  expiresAt?: Date | string;
  maxUses?: number;
  acceptedBy?: unknown[];
  revokedAt?: Date | null;
}

/** Pure expiry/revocation/exhaustion predicate, shared with the tests. */
export function agencyInviteIsRedeemable(
  invite: AgencyInviteRedeemabilityShape | null | undefined,
  now: Date = new Date()
): boolean {
  if (!invite || invite.revokedAt) return false;
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt).getTime() : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  const used = Array.isArray(invite.acceptedBy) ? invite.acceptedBy.length : 0;
  return used < Number(invite.maxUses ?? 0);
}

export async function createAgencyInvite(
  input: CreateAgencyInviteInput
): Promise<CreateAgencyInviteResult> {
  const parsedRole = agencyInvitableRoleSchema.safeParse(input.role);
  if (!parsedRole.success) {
    throw new AppError(
      'Choose a role of admin, planner or viewer for the invitation.',
      400
    );
  }

  const kind = input.kind === 'email' ? 'email' : 'link';
  let email: string | undefined;
  if (kind === 'email') {
    email = String(input.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(
        'Enter the email address this invitation should be bound to.',
        400
      );
    }
  }

  const rawToken = mintInviteToken();
  await assertSeatAvailable(input.agencyId);
  const invite = await AgencyInvite.create({
    agencyId: input.agencyId,
    tokenHash: sha256(rawToken),
    tokenHint: tokenHint(rawToken),
    role: parsedRole.data,
    kind,
    email,
    createdBy: input.createdBy,
    expiresAt: new Date(
      Date.now() + resolveTtlHours(input.ttlHours) * 60 * 60 * 1000
    ),
    maxUses: kind === 'email' ? 1 : resolveMaxUses(input.maxUses),
    acceptedBy: [],
  });

  return {
    invite,
    link: agencyInviteLinkFor(rawToken, input.linkOrigins),
  };
}

/** Pending (unrevoked, unexpired, not exhausted) invitations for the team screen. */
export async function listAgencyInvites(agencyId: string) {
  const invites = await AgencyInvite.find({
    agencyId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $expr: { $lt: [{ $size: '$acceptedBy' }, '$maxUses'] },
  })
    .sort({ createdAt: -1 })
    .limit(100);
  return invites.map(projectAgencyInvite);
}

export async function revokeAgencyInvite(
  agencyId: string,
  inviteId: string
): Promise<IAgencyInvite> {
  const invite = await AgencyInvite.findOneAndUpdate(
    { _id: inviteId, agencyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!invite) {
    throw new AppError(
      'That invitation was not found or is already revoked.',
      404
    );
  }
  return invite;
}

const INVALID_INVITE = 'This invitation is invalid or has expired.';
const INVALID_ACTIVATION = 'Check your email and password, then try again.';

/**
 * Public preview (PA0 §4.3). Unknown, expired, revoked and suspended-tenant
 * tokens are indistinguishable: one generic 404.
 */
export async function previewAgencyInvite(
  rawToken: string
): Promise<AgencyInvitePreview> {
  const invite = await AgencyInvite.findOne({
    tokenHash: sha256(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite || !agencyInviteIsRedeemable(invite)) {
    throw new AppError(INVALID_INVITE, 404);
  }

  const agency = await Agency.findById(invite.agencyId)
    .select('name slug branding status')
    .lean();
  if (!agency || agency.status !== 'active') {
    throw new AppError(INVALID_INVITE, 404);
  }

  return {
    agency: {
      _id: String(agency._id),
      name: String(agency.name ?? ''),
      slug: String(agency.slug ?? ''),
      logoUrl: publicTenantLogo((agency.branding as any)?.logoUrl),
    },
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

export interface ActivateAgencyInviteInput {
  email: unknown;
  password: unknown;
  name?: unknown;
}

export interface ActivateAgencyInviteResult extends AgencySession {
  token: string;
  alreadyMember: boolean;
}

async function roleUpgrade(
  membership: { role: string; save: () => Promise<unknown> },
  invitedRole: AgencyInvitableRole
): Promise<void> {
  const inviteRank = AGENCY_ROLE_RANK[invitedRole] ?? -1;
  const currentRank = AGENCY_ROLE_RANK[membership.role as AgencyRole] ?? -1;
  if (inviteRank > currentRank) {
    membership.role = invitedRole;
    await membership.save();
  }
}

function projectSession(
  user: IUser,
  agency: any,
  role: AgencyRole,
  token: string,
  alreadyMember: boolean
): ActivateAgencyInviteResult {
  return { user, agency, role, token, alreadyMember };
}

/**
 * Activates an invitation (PA0 §4.3).
 *
 * The invitee proves identity with email + password. An existing agency account
 * *for this tenant* is signed in (never re-passworded by a link); otherwise a
 * new tenant-scoped agency account is created under the invite's authorization.
 * A personal account is never attached or converted, and an agency account from
 * another tenant is never reused.
 *
 * The invitation use is claimed atomically before the membership row is
 * written. Failures after the claim pull it back, though a crash between the
 * two can still lose one use (owner-recoverable).
 */
export async function activateAgencyInvite(
  rawToken: string,
  input: ActivateAgencyInviteInput
): Promise<ActivateAgencyInviteResult> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  const displayName = String(input.name ?? '').trim();

  const invite = await AgencyInvite.findOne({
    tokenHash: sha256(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite || !agencyInviteIsRedeemable(invite)) {
    throw new AppError(INVALID_INVITE, 404);
  }

  if (invite.email && invite.email !== email) {
    throw new AppError(
      'This invitation was sent to a different email address.',
      403
    );
  }

  const agency = await Agency.findById(invite.agencyId);
  if (!agency || agency.status !== 'active') {
    throw new AppError(INVALID_INVITE, 404);
  }

  let user = await User.findOne({
    accountType: 'agency',
    agencyId: agency._id,
    email,
  });
  let createdUser = false;

  const verifyExisting = async (candidate: IUser) => {
    if (candidate.status !== 'active') {
      throw new AppError(INVALID_ACTIVATION, 401);
    }
    const matches = await bcrypt.compare(password, candidate.password);
    if (!matches) throw new AppError(INVALID_ACTIVATION, 401);
  };

  if (user) {
    await verifyExisting(user);
  } else {
    try {
      user = await User.create({
        email,
        password: await bcrypt.hash(password, 12),
        accountType: 'agency',
        agencyId: agency._id,
        status: 'active',
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        createdBy: invite.createdBy,
        ...(displayName ? { name: displayName } : {}),
      });
      createdUser = true;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      // A concurrent activation created the account first.
      user = await User.findOne({
        accountType: 'agency',
        agencyId: agency._id,
        email,
      });
      if (!user) throw error;
      await verifyExisting(user);
    }
  }

  const existingMembership = await AgencyMember.findOne({
    agencyId: agency._id,
    userId: user._id,
  });
  if (existingMembership) {
    await roleUpgrade(existingMembership, invite.role);
    return projectSession(
      user,
      agency,
      existingMembership.role as AgencyRole,
      signSessionForAccount(user, 'agency'),
      true
    );
  }

  // Seats count membership rows, so this applies to new and returning accounts.
  await assertSeatAvailable(String(agency._id));

  let addedUse = false;
  const claim = await AgencyInvite.findOneAndUpdate(
    {
      _id: invite._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      acceptedBy: { $ne: user._id },
      $expr: { $lt: [{ $size: '$acceptedBy' }, '$maxUses'] },
    },
    { $addToSet: { acceptedBy: user._id } },
    { new: true }
  );
  if (claim) {
    addedUse = true;
  } else {
    // Either the link is exhausted or this same account already holds a use
    // from a concurrent request; only the latter may continue.
    const current = await AgencyInvite.findById(invite._id)
      .select('acceptedBy revokedAt expiresAt')
      .lean();
    const holdsUse = (current?.acceptedBy ?? []).some(
      (id) => String(id) === String(user!._id)
    );
    if (!current || current.revokedAt || !holdsUse) {
      if (createdUser) {
        await User.deleteOne({ _id: user._id }).catch(() => undefined);
      }
      throw new AppError('This invitation link is no longer valid.', 410);
    }
  }

  try {
    await AgencyMember.create({
      agencyId: agency._id,
      userId: user._id,
      role: invite.role,
      invitedBy: invite.createdBy,
      joinedAt: new Date(),
    });
  } catch (error: any) {
    if (addedUse) {
      await AgencyInvite.updateOne(
        { _id: invite._id },
        { $pull: { acceptedBy: user._id } }
      ).catch(() => undefined);
    }
    if (createdUser) {
      await User.deleteOne({ _id: user._id }).catch(() => undefined);
    }

    if (error?.code === 11000) {
      const current = await AgencyMember.findOne({
        agencyId: agency._id,
        userId: user._id,
      });
      if (current) {
        return projectSession(
          user,
          agency,
          current.role as AgencyRole,
          signSessionForAccount(user, 'agency'),
          true
        );
      }
    }
    throw error;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() } }
  ).catch(() => undefined);

  return projectSession(
    user,
    agency,
    invite.role as AgencyRole,
    signSessionForAccount(user, 'agency'),
    false
  );
}

// Re-exported for callers that build origin hints from an Express request.
export { linkOriginHints };
