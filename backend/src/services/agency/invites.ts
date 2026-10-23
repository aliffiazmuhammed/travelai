import Agency from '../../models/Agency.js';
import AgencyInvite, { IAgencyInvite } from '../../models/AgencyInvite.js';
import AgencyMember from '../../models/AgencyMember.js';
import User from '../../models/User.js';
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

export interface AgencyInvitePreview {
  agency: { _id: string; name: string };
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  invitedBy?: string;
  expiresAt: Date;
  emailBoundTo?: string;
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

export async function previewAgencyInvite(
  rawToken: string
): Promise<AgencyInvitePreview> {
  const invite = await AgencyInvite.findOne({
    tokenHash: sha256(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite || !agencyInviteIsRedeemable(invite)) {
    throw new AppError('This invitation is invalid or has expired.', 404);
  }

  const agency = await Agency.findById(invite.agencyId).select('name').lean();
  if (!agency) {
    throw new AppError('This invitation is invalid or has expired.', 404);
  }

  let invitedBy: string | undefined;
  try {
    const creator = await User.findById(invite.createdBy).select('name email').lean();
    invitedBy =
      String(creator?.name || '').trim() ||
      String(creator?.email || '').split('@')[0] ||
      undefined;
  } catch {
    /* the name hint is best-effort */
  }

  return {
    agency: { _id: String(agency._id), name: String(agency.name) },
    role: invite.role,
    kind: invite.kind,
    invitedBy,
    expiresAt: invite.expiresAt,
    emailBoundTo: invite.email,
  };
}

export interface RedeemAgencyInviteResult {
  agencyId: string;
  role: AgencyInvitableRole;
  alreadyMember: boolean;
}

/**
 * Accepts an invitation for the signed-in user.
 *
 * Order matters for the "accepted once" guarantee: the usage slot is claimed
 * atomically *before* the membership row is inserted. A crash between the two
 * loses one invitation use (owner-recoverable); it can never add two people to
 * a single-use link.
 */
export async function redeemAgencyInvite(
  rawToken: string,
  user: { id: string; email?: string }
): Promise<RedeemAgencyInviteResult> {
  const invite = await AgencyInvite.findOne({
    tokenHash: sha256(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite || !agencyInviteIsRedeemable(invite)) {
    throw new AppError('This invitation is invalid or has expired.', 404);
  }

  if (
    invite.email &&
    invite.email !== String(user.email || '').trim().toLowerCase()
  ) {
    throw new AppError(
      'This invitation was sent to a different email address.',
      403
    );
  }

  const agency = await Agency.findById(invite.agencyId).select('_id').lean();
  if (!agency) {
    throw new AppError('This invitation is invalid or has expired.', 404);
  }

  const existing = await AgencyMember.findOne({
    agencyId: invite.agencyId,
    userId: user.id,
  });
  if (existing) {
    // Re-accepting is idempotent. An invite can upgrade a role, never downgrade.
    const inviteRank = AGENCY_ROLE_RANK[invite.role as AgencyRole] ?? -1;
    const currentRank = AGENCY_ROLE_RANK[existing.role as AgencyRole] ?? -1;
    if (inviteRank > currentRank) {
      existing.role = invite.role;
      await existing.save();
    }
    return {
      agencyId: String(invite.agencyId),
      role: existing.role as AgencyInvitableRole,
      alreadyMember: true,
    };
  }

  // Claim the use first. Losing the race means the link is exhausted.
  // The seat check is best-effort: two concurrent redeems can overshoot by
  // one seat, and the next invite re-checks the count.
  await assertSeatAvailable(String(invite.agencyId));
  const claimed = await AgencyInvite.findOneAndUpdate(
    {
      _id: invite._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: [{ $size: '$acceptedBy' }, '$maxUses'] },
    },
    { $addToSet: { acceptedBy: user.id } },
    { new: true }
  );
  if (!claimed) {
    throw new AppError('This invitation link is no longer valid.', 410);
  }

  try {
    await AgencyMember.create({
      agencyId: invite.agencyId,
      userId: user.id,
      role: invite.role,
      invitedBy: invite.createdBy,
      joinedAt: new Date(),
    });
  } catch (error: any) {
    // A concurrent accept by the same user created the membership first.
    // Return the use so the link is not burned by a harmless duplicate.
    await AgencyInvite.updateOne(
      { _id: invite._id },
      { $pull: { acceptedBy: user.id } }
    ).catch(() => undefined);

    if (error?.code === 11000) {
      const current = await AgencyMember.findOne({
        agencyId: invite.agencyId,
        userId: user.id,
      });
      return {
        agencyId: String(invite.agencyId),
        role: (current?.role ?? invite.role) as AgencyInvitableRole,
        alreadyMember: true,
      };
    }
    throw error;
  }

  return {
    agencyId: String(invite.agencyId),
    role: invite.role,
    alreadyMember: false,
  };
}

// Re-exported for callers that build origin hints from an Express request.
export { linkOriginHints };
