import mongoose, { Types } from 'mongoose';
import TripJoinRequest, {
  type ITripJoinRequest,
  type JoinRequestStatus,
} from '../../models/TripJoinRequest.js';
import UserBlock from '../../models/UserBlock.js';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { publicTripClauses } from './explore.js';
import { emitTripUpdated } from '../collab/presence.js';

/**
 * Join requests and blocks (Milestone 8 G5).
 *
 * Two rules shape everything here:
 * - **Approval is commenter and nothing else.** There is deliberately no role
 *   parameter in this module: the only membership write it can perform is the
 *   literal `'commenter'` below, so a request can never become editor.
 * - **Eligibility is the gallery rule.** A request is accepted only for a trip
 *   that still passes `publicTripClauses()` (published, live, personal,
 *   upcoming). Unpublishing a trip therefore closes it to new requests without
 *   touching rows already queued — the owner can still clean those up.
 *
 * Blocks are one-way and silent: the blocked account is never told, and their
 * pending requests on the blocker's trips are declined when the block lands.
 */

export const JOIN_REQUEST_MESSAGE_MAX = 280;

export interface JoinRequesterView {
  id: string;
  label: string;
  handle?: string;
  avatarUrl?: string;
}

export interface JoinRequestView {
  _id: string;
  status: JoinRequestStatus;
  message?: string;
  createdAt: Date;
  decidedAt?: Date | null;
  /** Present on owner-facing rows only. */
  requester?: JoinRequesterView;
}

export interface JoinRequestState {
  request: JoinRequestView | null;
  isMember: boolean;
  isOwner: boolean;
}

export interface BlockView {
  userId: string;
  label: string;
  handle?: string;
  avatarUrl?: string;
  createdAt: Date;
}

const isObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

function ownerIdOf(trip: any): string | undefined {
  const owner = (Array.isArray(trip?.members) ? trip.members : []).find(
    (member: any) => String(member?.role) === 'owner'
  );
  return owner?.userId ? String(owner.userId) : undefined;
}

function isMemberOf(trip: any, userId: string): boolean {
  return (Array.isArray(trip?.members) ? trip.members : []).some(
    (member: any) => String(member?.userId) === String(userId)
  );
}

/**
 * Loads a trip that is still joinable, or throws the gallery's generic 404.
 * The public clauses are imported from `explore.ts` on purpose: "visible in
 * the gallery" and "joinable" must never drift into two definitions.
 */
async function loadJoinableTrip(
  tripId: string
): Promise<{ trip: any; ownerId: string }> {
  if (!isObjectId(tripId)) throw new AppError('Trip not found.', 404);

  const trip = await Trip.findOne({ _id: tripId, $and: publicTripClauses() })
    .select('members')
    .lean();
  if (!trip) throw new AppError('Trip not found.', 404);

  const ownerId = ownerIdOf(trip);
  if (!ownerId) throw new AppError('Trip not found.', 404);
  return { trip, ownerId };
}

/** Projects one row; `requester` is filled only for owner-facing responses. */
function projectRequest(request: ITripJoinRequest): JoinRequestView {
  return {
    _id: String(request._id),
    status: request.status,
    ...(request.message ? { message: request.message } : {}),
    createdAt: request.createdAt,
    decidedAt: request.decidedAt ?? null,
  };
}

/** Display identity for request cards and the block list — never an email. */
async function requesterMap(
  userIds: string[]
): Promise<Map<string, JoinRequesterView>> {
  const ids = [...new Set(userIds)].filter(isObjectId);
  const map = new Map<string, JoinRequesterView>();
  if (ids.length === 0) return map;

  const users = (await User.find({ _id: { $in: ids } })
    .select('_id name avatarUrl profile')
    .lean()) as any[];

  for (const user of users) {
    const handle = String(user?.profile?.handle ?? '').trim();
    const label = String(user?.name ?? '').trim() || handle || 'A traveller';
    map.set(String(user._id), {
      id: String(user._id),
      label,
      ...(handle ? { handle } : {}),
      ...(user.avatarUrl ? { avatarUrl: String(user.avatarUrl) } : {}),
    });
  }
  return map;
}

function normalizeMessage(message: unknown): string | undefined {
  const text = String(message ?? '').trim();
  if (!text) return undefined;
  if (text.length > JOIN_REQUEST_MESSAGE_MAX) {
    throw new AppError(
      `Keep your message to ${JOIN_REQUEST_MESSAGE_MAX} characters or fewer.`,
      400
    );
  }
  return text;
}

export async function isBlocked(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  if (!isObjectId(blockerId) || !isObjectId(blockedId) || blockerId === blockedId) {
    return false;
  }
  return Boolean(await UserBlock.exists({ blockerId, blockedId }));
}

/* -------------------------------------------------------------------------- */
/*  Requester side                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Creates one pending request. Duplicate-pending protection is the unique
 * partial index, not a read-then-write race: a second concurrent request
 * surfaces as `11000` and becomes the same friendly 409.
 */
export async function requestToJoin(
  tripId: string,
  requesterId: string,
  message?: unknown
): Promise<JoinRequestView> {
  const { trip, ownerId } = await loadJoinableTrip(tripId);

  if (ownerId === requesterId || isMemberOf(trip, requesterId)) {
    throw new AppError('You are already a member of this trip.', 409);
  }

  if (await isBlocked(ownerId, requesterId)) {
    // Deliberately generic: the blocked account is not told about the block.
    throw new AppError('You cannot request to join this trip.', 403);
  }

  try {
    const request = await TripJoinRequest.create({
      tripId: new Types.ObjectId(tripId),
      requesterId: new Types.ObjectId(requesterId),
      message: normalizeMessage(message),
      status: 'pending',
    });

    // Close the race where the owner blocks this account between the check
    // above and the insert: the block sweep only sees rows that already exist,
    // so a row created in that window would otherwise survive. Write first,
    // then re-check, then withdraw the row before answering 403.
    if (await isBlocked(ownerId, requesterId)) {
      await TripJoinRequest.updateOne(
        { _id: request._id, status: 'pending' },
        { $set: { status: 'declined', decidedAt: new Date() } }
      );
      throw new AppError('You cannot request to join this trip.', 403);
    }

    return projectRequest(request);
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('You already have a pending request for this trip.', 409);
    }
    throw error;
  }
}

/** The caller's latest request plus enough state to render the join button. */
export async function getJoinRequestState(
  tripId: string,
  requesterId: string
): Promise<JoinRequestState> {
  const { trip, ownerId } = await loadJoinableTrip(tripId);

  const request = await TripJoinRequest.findOne({
    tripId,
    requesterId,
  }).sort({ createdAt: -1 });

  return {
    request: request ? projectRequest(request) : null,
    isMember: isMemberOf(trip, requesterId),
    isOwner: ownerId === requesterId,
  };
}

/** Withdraws the caller's pending request. Works even after unpublishing. */
export async function withdrawJoinRequest(
  tripId: string,
  requesterId: string
): Promise<JoinRequestView> {
  if (!isObjectId(tripId)) throw new AppError('Trip not found.', 404);

  const request = await TripJoinRequest.findOneAndUpdate(
    { tripId, requesterId, status: 'pending' },
    { $set: { status: 'withdrawn', decidedAt: new Date() } },
    { new: true }
  );
  if (!request) {
    throw new AppError('You have no pending request to withdraw.', 404);
  }
  return projectRequest(request);
}

/* -------------------------------------------------------------------------- */
/*  Owner side                                                                 */
/* -------------------------------------------------------------------------- */

/** Pending queue, oldest first, with the requester's public identity. */
export async function listJoinRequests(trip: any): Promise<JoinRequestView[]> {
  const requests = await TripJoinRequest.find({
    tripId: trip._id,
    status: 'pending',
  })
    .sort({ createdAt: 1 })
    .limit(100);

  const people = await requesterMap(requests.map((row) => String(row.requesterId)));
  return requests.map((request) => ({
    ...projectRequest(request),
    ...(people.get(String(request.requesterId))
      ? { requester: people.get(String(request.requesterId)) }
      : {}),
  }));
}

/** Loads one request for this trip or throws 404 (owner routes only). */
async function loadRequest(
  trip: any,
  requestId: string,
  status: JoinRequestStatus = 'pending'
): Promise<ITripJoinRequest> {
  if (!isObjectId(requestId)) {
    throw new AppError('That join request was not found.', 404);
  }
  const request = await TripJoinRequest.findOne({
    _id: requestId,
    tripId: trip._id,
    status,
  });
  if (!request) {
    throw new AppError('That join request was not found.', 404);
  }
  return request;
}

/**
 * Approve → **commenter**. The claim flips the request out of `pending`
 * atomically, so two owner clicks can never add the same person twice; the
 * membership push is guarded by `members.userId $ne` and the cap. If the push
 * loses that race the claim is rolled back to pending, keeping the queue and
 * the membership in agreement.
 */
export async function approveJoinRequest(
  trip: any,
  requestId: string,
  ownerId: string
): Promise<JoinRequestView> {
  const request = await loadRequest(trip, requestId);
  const requesterId = String(request.requesterId);

  if (await isBlocked(ownerId, requesterId)) {
    await declineJoinRequest(trip, requestId, ownerId);
    throw new AppError('You have blocked this traveller.', 403);
  }

  if (isMemberOf(trip, requesterId)) {
    throw new AppError('That person is already a member of this trip.', 409);
  }

  if ((trip.members ?? []).length >= env.TRIP_MAX_MEMBERS) {
    throw new AppError('This trip has reached its collaborator limit.', 409);
  }

  const now = new Date();
  const claimed = await TripJoinRequest.findOneAndUpdate(
    { _id: request._id, tripId: trip._id, status: 'pending' },
    { $set: { status: 'approved', decidedBy: ownerId, decidedAt: now } },
    { new: true }
  );
  if (!claimed) {
    throw new AppError('That join request was not found.', 404);
  }

  const pushed = await Trip.updateOne(
    {
      _id: trip._id,
      isDeleted: { $ne: true },
      'members.userId': { $ne: requesterId },
      $expr: {
        $lt: [{ $size: { $ifNull: ['$members', []] } }, env.TRIP_MAX_MEMBERS],
      },
    },
    {
      $push: {
        members: {
          userId: requesterId,
          // Never editor. This literal is the whole product promise of G5.
          role: 'commenter',
          invitedBy: ownerId,
          joinedAt: now,
        },
      },
    }
  );

  if (pushed.modifiedCount === 0) {
    await TripJoinRequest.updateOne(
      { _id: claimed._id, status: 'approved' },
      { $set: { status: 'pending' }, $unset: { decidedBy: '', decidedAt: '' } }
    );
    throw new AppError(
      'That person could not be added — they may already be a member, or the trip is full.',
      409
    );
  }

  // `Trip.updateOne` skips Mongoose post hooks, so the live-tier refresh is
  // emitted explicitly (same rule as the invite redemption path).
  emitTripUpdated(String(trip._id));

  const people = await requesterMap([requesterId]);
  return {
    ...projectRequest(claimed),
    ...(people.get(requesterId) ? { requester: people.get(requesterId) } : {}),
  };
}

/** Decline is silent to the requester — the row is simply no longer pending. */
export async function declineJoinRequest(
  trip: any,
  requestId: string,
  ownerId: string
): Promise<JoinRequestView> {
  const request = await loadRequest(trip, requestId);
  const declined = await TripJoinRequest.findOneAndUpdate(
    { _id: request._id, tripId: trip._id, status: 'pending' },
    { $set: { status: 'declined', decidedBy: ownerId, decidedAt: new Date() } },
    { new: true }
  );
  if (!declined) {
    throw new AppError('That join request was not found.', 404);
  }
  return projectRequest(declined);
}

/** Block straight from a request card: block + decline in one gesture. */
export async function blockFromJoinRequest(
  trip: any,
  requestId: string,
  ownerId: string
): Promise<BlockView> {
  const request = await loadRequest(trip, requestId);
  await blockUser(ownerId, String(request.requesterId));
  const person = (await requesterMap([String(request.requesterId)])).get(
    String(request.requesterId)
  );
  const block = await UserBlock.findOne({
    blockerId: ownerId,
    blockedId: request.requesterId,
  }).lean();

  return {
    userId: String(request.requesterId),
    label: person?.label ?? 'A traveller',
    ...(person?.handle ? { handle: person.handle } : {}),
    ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
    createdAt: block?.createdAt ?? new Date(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Block list                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates (or refreshes) a one-way block and declines every pending request
 * that person still has on any trip the blocker owns. Upsert + the unique pair
 * index make blocking twice harmless; the requester is never notified.
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason?: unknown
): Promise<BlockView> {
  if (!isObjectId(blockedId)) throw new AppError('Account not found.', 404);
  if (blockerId === blockedId) {
    throw new AppError('You cannot block your own account.', 400);
  }

  const target = await User.findOne({ _id: blockedId }).select('_id name avatarUrl profile').lean();
  if (!target) throw new AppError('Account not found.', 404);

  const note = String(reason ?? '').trim().slice(0, 200);

  try {
    await UserBlock.findOneAndUpdate(
      { blockerId, blockedId },
      {
        $setOnInsert: { blockerId, blockedId },
        ...(note ? { $set: { reason: note } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error: any) {
    // Two concurrent blocks on the same pair: the loser just reads the winner.
    if (error?.code !== 11000) throw error;
  }

  // A block is also a queue decision: clear the pending requests it invalidates.
  const owned = (await Trip.find({
    members: { $elemMatch: { userId: blockerId, role: 'owner' } },
  })
    .select('_id')
    .lean()) as any[];

  if (owned.length > 0) {
    await TripJoinRequest.updateMany(
      {
        tripId: { $in: owned.map((trip) => trip._id) },
        requesterId: blockedId,
        status: 'pending',
      },
      {
        $set: {
          status: 'declined',
          decidedBy: blockerId,
          decidedAt: new Date(),
        },
      }
    );
  }

  const handle = String((target as any)?.profile?.handle ?? '').trim();
  const label = String((target as any)?.name ?? '').trim() || handle || 'A traveller';
  const block = await UserBlock.findOne({ blockerId, blockedId }).lean();

  return {
    userId: blockedId,
    label,
    ...(handle ? { handle } : {}),
    ...((target as any)?.avatarUrl ? { avatarUrl: String((target as any).avatarUrl) } : {}),
    createdAt: block?.createdAt ?? new Date(),
  };
}

/** The blocker's list, newest first. Never includes the blocked person's email. */
export async function listBlocks(blockerId: string): Promise<BlockView[]> {
  const rows = await UserBlock.find({ blockerId })
    .sort({ createdAt: -1 })
    .limit(200);

  const people = await requesterMap(rows.map((row) => String(row.blockedId)));
  return rows.map((row) => {
    const person = people.get(String(row.blockedId));
    return {
      userId: String(row.blockedId),
      label: person?.label ?? 'A traveller',
      ...(person?.handle ? { handle: person.handle } : {}),
      ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
      createdAt: row.createdAt,
    };
  });
}

/** Idempotent: unblocking someone who is not blocked is still a success. */
export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ removed: boolean }> {
  if (!isObjectId(blockedId)) {
    throw new AppError('Account not found.', 404);
  }
  const result = await UserBlock.deleteOne({ blockerId, blockedId });
  return { removed: result.deletedCount === 1 };
}
