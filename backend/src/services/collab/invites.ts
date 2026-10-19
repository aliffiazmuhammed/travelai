import crypto from 'crypto';
import TripInvite, { ITripInvite } from '../../models/TripInvite.js';
import Trip, { ITrip } from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { ROLE_RANK, can, invitableRoleSchema, type TripRole } from './access.js';
import { emitTripUpdated } from './presence.js';
import User from '../../models/User.js';

/**
 * Invitation mechanics (Milestone 6 §3.5, sprint E2).
 *
 * Token lifecycle: the raw token exists only at mint time and in the link the
 * owner shares; from then on only `sha256(token)` is stored. Redemption paths
 * fail **safe**: an unknown/expired/revoked token is always the same generic
 * 404, and consumption happens *after* membership so the bounded failure mode
 * is "member added but a use not counted" (owner-revocable, harmless).
 */

export type InvitableRole = Exclude<TripRole, 'owner'>;

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/** 256-bit random token, URL-safe. Never persisted in this form. */
export function mintInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(rawToken: string): string {
  return sha256(String(rawToken || ''));
}

/** First characters of the raw token — safe enough to show to its owner. */
export function tokenHint(rawToken: string): string {
  return String(rawToken || '').slice(0, 6);
}

/** Where the invitee's browser should land. Derived per request, never guessed. */
export interface LinkOriginHints {
  /** The page the owner is actually on (`Origin` header) — strongest signal. */
  browserOrigin?: string | null;
  /** `X-Forwarded-Proto` + host of this very request (same-origin deploys). */
  sameOrigin?: string | null;
  /** `RENDER_EXTERNAL_URL`, the platform's own public URL, when present. */
  renderUrl?: string | null;
}

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const cleanOrigin = (value?: string | null): string => {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
};

/**
 * The single base an invite link may use. **Pure** so the precedence is
 * testable: a non-loopback browser origin always wins, because that is
 * literally the page the owner is looking at. Only when no real origin can be
 * observed do we fall back to configuration, and only then to localhost.
 *
 * This is what keeps production from handing out `http://localhost:8080/invite/…`
 * when `FRONTEND_URL` is unset (or left at its local-dev value) on Render.
 */
export function pickLinkOrigin(hints: LinkOriginHints = {}, configuredOrigin?: string): string {
  const browserOrigin = cleanOrigin(hints.browserOrigin);
  const sameOrigin = cleanOrigin(hints.sameOrigin);
  const renderUrl = cleanOrigin(hints.renderUrl);
  const configured = cleanOrigin(
    configuredOrigin === undefined ? (env.FRONTEND_URL || '').split(',')[0] : configuredOrigin
  );

  return (
    (browserOrigin && !LOOPBACK_ORIGIN.test(browserOrigin) ? browserOrigin : '') ||
    (configured && !LOOPBACK_ORIGIN.test(configured) ? configured : '') ||
    (sameOrigin && !LOOPBACK_ORIGIN.test(sameOrigin) ? sameOrigin : '') ||
    renderUrl ||
    configured ||
    browserOrigin ||
    sameOrigin ||
    'http://localhost:8080'
  );
}

/** The browser URL an invitee opens. Base is the deployed SPA. */
export function inviteLinkFor(rawToken: string, hints: LinkOriginHints = {}): string {
  return `${pickLinkOrigin(hints)}/invite/${rawToken}`;
}

/** The slice of an Express request needed to observe where it came from. */
export interface OriginCarrier {
  get(name: string): string | undefined;
  protocol?: string;
}

/**
 * Reads the origins a request exposes. `req.protocol` is proxy-aware because
 * `app.set('trust proxy', 1)` is on, and Render also sets the forwarding
 * headers explicitly.
 */
export function linkOriginHints(req: OriginCarrier): LinkOriginHints {
  const first = (value?: string) => String(value || '').split(',')[0].trim();
  const host = first(req.get('x-forwarded-host') || req.get('host'));
  const proto = first(req.get('x-forwarded-proto') || req.protocol).toLowerCase();
  return {
    browserOrigin: req.get('origin') || null,
    sameOrigin: host && (proto === 'http' || proto === 'https') ? `${proto}://${host}` : null,
    renderUrl: process.env.RENDER_EXTERNAL_URL || null,
  };
}

export function resolveTtlHours(requested?: unknown): number {
  const value = Number(requested);
  if (Number.isFinite(value) && value > 0) return value;
  return env.INVITE_TTL_HOURS;
}

export function resolveMaxUses(requested?: unknown): number {
  const value = Number(requested);
  if (Number.isFinite(value) && value >= 1) return Math.floor(value);
  return env.INVITE_DEFAULT_MAX_USES;
}

export interface CreateInviteInput {
  tripId: string;
  createdBy: string;
  role: unknown;
  kind: unknown;
  email?: unknown;
  maxUses?: unknown;
  ttlHours?: unknown;
  /** Where to point the invite link (see {@link pickLinkOrigin}). */
  linkOrigins?: LinkOriginHints;
}

export interface CreateInviteResult {
  invite: ITripInvite;
  /** The shared-once token, already embedded in the link. */
  link: string;
}

/** Creates the invite row and returns the raw link exactly once. */
export async function createTripInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const parsedRole = invitableRoleSchema.safeParse(input.role);
  if (!parsedRole.success) {
    throw new AppError('Choose a role of editor, commenter or viewer for the invitation.', 400);
  }

  const kind = input.kind === 'email' ? 'email' : 'link';
  let email: string | undefined;
  if (kind === 'email') {
    email = String(input.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Enter the email address this invitation should be bound to.', 400);
    }
  }

  // An email-bound invite is single-use by definition — it names one person.
  const maxUses = kind === 'email' ? 1 : resolveMaxUses(input.maxUses);

  const rawToken = mintInviteToken();
  const invite = await TripInvite.create({
    tripId: input.tripId,
    tokenHash: hashToken(rawToken),
    tokenHint: tokenHint(rawToken),
    role: parsedRole.data,
    kind,
    email,
    createdBy: input.createdBy,
    expiresAt: new Date(Date.now() + resolveTtlHours(input.ttlHours) * 60 * 60 * 1000),
    maxUses,
    acceptedBy: [],
  });

  return { invite, link: inviteLinkFor(rawToken, input.linkOrigins) };
}

/** Owner-facing projection — no raw token ever makes it back out. */
export function projectInvite(invite: ITripInvite) {
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

export async function revokeTripInvite(tripId: string, inviteId: string): Promise<ITripInvite> {
  const invite = await TripInvite.findOneAndUpdate(
    { _id: inviteId, tripId, revokedAt: null },
    { revokedAt: new Date() },
    { new: true }
  );
  if (!invite) {
    throw new AppError('That invitation was not found or is already revoked.', 404);
  }
  return invite;
}

/* -------------------------------------------------------------------------- */
/*  Redemption                                                                  */
/* -------------------------------------------------------------------------- */

export interface InvitePreview {
  trip: { title: string; destination?: string };
  role: InvitableRole;
  kind: 'link' | 'email';
  invitedBy?: string;
  expiresAt: Date;
  emailBoundTo?: string;
}

function resolveTripHeadline(trip: any): { title: string; destination?: string } {
  const title = String(trip?.title || trip?.tripDetails?.trip_title || 'A shared trip');
  const destination = trip?.generationMeta?.request?.destination;
  return { title, destination: destination ? String(destination) : undefined };
}

/**
 * Preview: tells a signed-in user what they would join. Never consumes a use.
 */
export async function previewInvite(rawToken: string, viewerEmail?: string): Promise<InvitePreview> {
  const invite = await TripInvite.findOne({
    tokenHash: hashToken(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite) {
    throw new AppError('This invite link is invalid or has expired.', 404);
  }

  const trip = await Trip.findOne({ _id: invite.tripId, isDeleted: { $ne: true } }).select(
    'title tripDetails.trip_title generationMeta.request.destination isDeleted'
  );
  if (!trip) {
    throw new AppError('This invite link is invalid or has expired.', 404);
  }

  let invitedBy: string | undefined;
  try {
    const creator = await User.findOne({ _id: invite.createdBy }).select('email');
    invitedBy = creator?.email?.split('@')[0];
  } catch {
    /* name hint is best-effort */
  }

  return {
    trip: resolveTripHeadline(trip),
    role: invite.role,
    kind: invite.kind,
    invitedBy,
    expiresAt: invite.expiresAt,
    emailBoundTo: invite.email,
  };
}

export interface RedeemResult {
  trip: any;
  invite: ITripInvite;
  role: InvitableRole;
  /** True when the caller was already a member (no consume / idempotent). */
  alreadyMember: boolean;
}

/**
 * E-mail binding: only the invited address may accept an email invite. Returns
 * a friendly 403 (the invitee already knows the trip exists — the invite target
 * — so unlike trip probing, hiding existence would only add confusion).
 */
function assertEmailBinding(invite: ITripInvite, userEmail: string): void {
  if (invite.email && invite.email !== String(userEmail || '').toLowerCase()) {
    throw new AppError('This invitation was sent to a different email address.', 403);
  }
}

/**
 * Assumes the trip the invite points to exists (callers refresh/validate it).
 * Persists an upgraded role when the invite grants something bigger than the
 * member already has — but never *downgrades* an existing role.
 */
function ensureRoleAtLeast(trip: any, userId: string, role: InvitableRole): void {
  const member = (trip.members || []).find(
    (entry: any) => String(entry?.userId) === String(userId)
  );
  if (!member) return;
  const currentRank = ROLE_RANK[String(member.role) as TripRole] ?? -1;
  if (ROLE_RANK[role] > currentRank) {
    member.role = role;
    trip.markModified('members');
  }
}

/**
 * The redemption core (§3.5). Ordered and race-safe:
 *
 * 1. token lookup (hash + not revoked + not expired) → generic 404 otherwise;
 * 2. membership cap, before any writes;
 * 3. already-a-member short-circuit → 200 without consuming a use (upgrades
 *    the role if the invite ranks higher);
 * 4. add membership (guarded by `members.userId $ne` so it is idempotent);
 * 5. claim the use atomically with `$expr { $lt: [ { $size: acceptedBy },
 *    maxUses ] }` + `$addToSet` — losing that race returns 410, and the member
 *    added in step 4 in that window is exactly the bounded "member without a
 *    counted use" the doc accepts.
 */
export async function redeemInvite(rawToken: string, user: { id: string; email?: string }): Promise<RedeemResult> {
  const invite = await TripInvite.findOne({
    tokenHash: hashToken(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invite) {
    throw new AppError('This invite link is invalid or has expired.', 404);
  }

  assertEmailBinding(invite, String(user.email || ''));

  const trip = await Trip.findOne({ _id: invite.tripId, isDeleted: { $ne: true } });
  if (!trip) {
    throw new AppError('This invite link is invalid or has expired.', 404);
  }

  const role = invite.role as InvitableRole;

  const existingMember = (trip.members || []).find(
    (entry: any) => String(entry?.userId) === String(user.id)
  );
  if (existingMember) {
    if (can(existingMember.role as TripRole, role)) {
      // Nothing to change — idempotent re-accept.
      return { trip, invite, role: existingMember.role as InvitableRole, alreadyMember: true };
    }
    // The invite ranks higher than the member's current role: upgrade in place.
    ensureRoleAtLeast(trip, user.id, role);
    await trip.save();
    const fresh = await Trip.findById(trip._id);
    return { trip: fresh ?? trip, invite, role, alreadyMember: true };
  }

  const memberCount = (trip.members || []).length;
  if (memberCount >= env.TRIP_MAX_MEMBERS) {
    throw new AppError('This trip has reached its collaborator limit.', 409);
  }

  // (4) membership first, guarded for idempotency.
  await Trip.updateOne(
    {
      _id: trip._id,
      isDeleted: { $ne: true },
      'members.userId': { $ne: user.id },
    },
    {
      $push: {
        members: {
          userId: user.id,
          role,
          invitedBy: invite.createdBy,
          joinedAt: new Date(),
        },
      },
    }
  );

  // (5) claim the use atomically; a lost race ⇒ invite exhausted.
  const claimed = await TripInvite.findOneAndUpdate(
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
    throw new AppError('This invite link is no longer valid.', 410);
  }

  invite.acceptedBy = claimed.acceptedBy;

  const fresh: any = await Trip.findById(trip._id);
  // Direct `Trip.updateOne` does not run post hooks (mongoose limitation) —
  // the E4 change notification is emitted here explicitly (new member visible).
  emitTripUpdated(String(trip._id));
  return { trip: fresh ?? trip, invite, role, alreadyMember: false };
}
