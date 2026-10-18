import { AppError } from '../../utils/AppError.js';
import { ROLE_RANK, can, type TripRole } from './access.js';
import User from '../../models/User.js';
import Trip from '../../models/Trip.js';
import { Types } from 'mongoose';

/**
 * Member management rules (Milestone 6 §1.3 / §3.9, sprint E2).
 *
 * Pure decision helpers + the participant plumbing. The guard already
 * guarantees rank (these functions only run under `requireTripRole('owner')`
 * for management endpoints), so the rules below handle the *invariants beyond
 * rank*: no trip is ever left without an owner, ownership changes hands only
 * through transfer, and the expense ledger never loses its people.
 */

export interface MemberRow {
  userId: string;
  role: TripRole;
  joinedAt: Date;
  /** Email — owner's view only (F6: member emails are owner-only). */
  email?: string;
  /** Convenience flag for the caller's own row. */
  isYou?: boolean;
}

/** Builds the members list for a response; emails only for the owner. */
export async function projectMembers(
  trip: any,
  viewerId: string,
  viewerRole: TripRole
): Promise<MemberRow[]> {
  const memberList: Array<any> = trip.members || [];
  const emails = new Map<string, string>();

  if (viewerRole === 'owner' && memberList.length > 0) {
    const users = await User.find({
      _id: { $in: memberList.map((m) => m.userId) },
    })
      .select('_id email')
      .lean();
    for (const user of users) {
      emails.set(String(user._id), String(user.email));
    }
  }

  return memberList.map((member) => {
    const row: MemberRow = {
      userId: String(member.userId),
      role: member.role,
      joinedAt: member.joinedAt,
    };
    const email = emails.get(String(member.userId));
    if (email) row.email = email;
    if (String(member.userId) === String(viewerId)) row.isYou = true;
    return row;
  });
}

/**
 * Role changes through `PATCH /members/:userId`. Ownership is set exclusively
 * by transfer, so `owner` is never a valid PATCH target — and the members list
 * therefore cannot lose its last owner through a demotion.
 */
export function assertRoleChange(trip: any, targetUserId: string, nextRole: TripRole): void {
  if (nextRole === 'owner') {
    throw new AppError('Ownership is transferred, not assigned. Use the transfer action.', 400);
  }

  const member = (trip.members || []).find(
    (entry: any) => String(entry?.userId) === String(targetUserId)
  );
  if (!member) {
    throw new AppError('That member is not part of this trip.', 404);
  }
  if (member.role === 'owner') {
    throw new AppError('Ownership is transferred, not changed. Use the transfer action.', 409);
  }
}

/** Guard for removing a member: owners must transfer (or leave) instead. */
export function assertMemberRemoval(trip: any, targetUserId: string): void {
  const member = (trip.members || []).find(
    (entry: any) => String(entry?.userId) === String(targetUserId)
  );
  if (!member) {
    throw new AppError('That member is not part of this trip.', 404);
  }
  if (member.role === 'owner') {
    throw new AppError(
      'An owner cannot be removed. Transfer ownership first, then remove the member.',
      409
    );
  }
}

/** Leaving: an owner must transfer first (a trip can never be left ownerless). */
export function assertLeave(trip: any, userId: string): void {
  const members = (trip.members || []) as Array<any>;
  const me = members.find((entry) => String(entry?.userId) === String(userId));
  if (me?.role === 'owner') {
    throw new AppError('Transfer ownership to someone else before leaving the trip.', 409);
  }
}

export interface TransferInput {
  trip: any;
  fromUserId: string;
  toUserId: string;
}

/**
 * Validates an ownership transfer and returns both member entries.
 * Recipients must already be members (an invite is the way in).
 */
export function resolveTransfer(trip: any, input: TransferInput): { current: any; next: any } {
  const members = (trip.members || []) as Array<any>;
  const current = members.find((entry) => String(entry?.userId) === String(input.fromUserId));
  const next = members.find((entry) => String(entry?.userId) === String(input.toUserId));

  if (!current || !next) {
    throw new AppError('Ownership can only be transferred to an existing member of the trip.', 404);
  }
  if (String(input.fromUserId) === String(input.toUserId)) {
    throw new AppError('You already own this trip.', 400);
  }
  return { current, next };
}

/**
 * Performs the validated transfer. Promote first, then demote: a transient
 * window of two owners is safe, one of zero owners is not. Each write rides the
 * mongoose update hooks, so `rev` bumps and other members observe the change.
 * Returns the refreshed document for the response.
 */
export async function performTransfer(
  trip: any,
  fromUserId: string,
  toUserId: string
): Promise<any> {
  await Trip.updateOne(
    { _id: trip._id, 'members.userId': new Types.ObjectId(toUserId) },
    { $set: { 'members.$.role': 'owner' } }
  );
  await Trip.updateOne(
    { _id: trip._id, 'members.userId': new Types.ObjectId(fromUserId) },
    { $set: { 'members.$.role': 'editor' } }
  );

  return Trip.findById(trip._id);
}

/* -------------------------------------------------------------------------- */
/*  Participant linking (§3.9)                                                  */
/* -------------------------------------------------------------------------- */

/** Best-effort display hint for linking: the email local-part. */
export function emailLocalPart(email?: string): string {
  return String(email || '').split('@')[0] ?? '';
}

/**
 * Links the new member to an existing unlinked participant by name. We do NOT
 * create a participant when nothing matches — inventing ledger rows nobody
 * entered would corrupt counts nobody asked for (recorded as a deviation).
 * Returns true when the trip was mutated (caller must save).
 */
export function linkParticipant(trip: any, userId: string, emailHint?: string): boolean {
  if (!userId) return false;
  const alreadyLinked = (trip.participants || []).some(
    (participant: any) => participant?.userId && String(participant.userId) === String(userId)
  );
  if (alreadyLinked) return false;

  const candidates = [emailLocalPart(emailHint)].map((s) => s.toLowerCase()).filter(Boolean);
  const target = (trip.participants || []).find(
    (participant: any) =>
      attendeeIsUnlinked(participant) &&
      candidates.includes(String(participant.name || '').trim().toLowerCase())
  );
  if (target) {
    target.userId = userId;
    trip.markModified('participants');
    return true;
  }
  return false;
}

function attendeeIsUnlinked(participant: any): boolean {
  return participant && !participant.userId;
}

/**
 * Member removal **unlinks** the participant (keeps the row) so the historical
 * expenses and settlement stay valid.
 */
export function unlinkParticipant(trip: any, userId: string): void {
  let changed = false;
  for (const participant of trip.participants || []) {
    if (participant?.userId && String(participant.userId) === String(userId)) {
      participant.userId = undefined;
      changed = true;
    }
  }
  if (changed) trip.markModified('participants');
}
