import { Types } from 'mongoose';
import TripReadState from '../../models/TripReadState.js';
import TripComment from '../../models/TripComment.js';
import { isObjectId } from './comments.js';

/**
 * Read-state for the trip discussion (Milestone 7, F8a) — the "unread badge".
 *
 * Split like every collab service: the pure helper carries the rule worth
 * testing (exactly WHAT counts as unread), the two DB functions are thin glue
 * covered by the live smoke run.
 *
 * Semantics:
 * - A trip member's marker lives in `TripReadState` (its own collection — see
 *   the model note: reads must never touch `Trip.rev`).
 * - **First visit is a baseline, not a backlog**: a member with no marker sees
 *   unread 0 and a marker stamped now. Unread starts growing only from real
 *   new activity subsequent to that first open — nobody is punished with a
 *   wall of history on day one.
 * - Own comments never count as unread (you wrote them — you have read them).
 * - Tombstones never count as unread (nothing to read).
 */

/**
 * The Mongo predicate for "unread": active rows strictly newer than the
 * marker, authored by someone else.
 */
export function computeUnreadFilter(
  lastReadAt: Date | null,
  userId: string
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    deletedAt: { $exists: false },
    userId: { $ne: new Types.ObjectId(userId) },
  };
  if (lastReadAt) {
    filter.createdAt = { $gt: lastReadAt };
  }
  return filter;
}

export interface ReadStateRow {
  lastReadAt: Date;
  unread: number;
}

/**
 * Reads the member's marker. On the very first open it stamps one now (the
 * baseline rule above) instead of counting the whole existing stream.
 */
export async function resolveReadState(tripId: string, userId: string): Promise<ReadStateRow> {
  if (!isObjectId(tripId) || !isObjectId(userId)) {
    return { lastReadAt: new Date(0), unread: 0 };
  }

  const marker = await TripReadState.findOne({
    tripId: new Types.ObjectId(tripId),
    userId: new Types.ObjectId(userId),
  });

  if (!marker) {
    const created = await TripReadState.findOneAndUpdate(
      { tripId: new Types.ObjectId(tripId), userId: new Types.ObjectId(userId) },
      { $setOnInsert: { lastReadAt: new Date() } },
      { upsert: true, new: true }
    );
    return { lastReadAt: created.lastReadAt, unread: 0 };
  }

  const unread = await TripComment.countDocuments({
    tripId: new Types.ObjectId(tripId),
    ...computeUnreadFilter(marker.lastReadAt, userId),
  });
  return { lastReadAt: marker.lastReadAt, unread };
}

/**
 * Marks everything as read up to now. `createdAt <= marker` in the unread
 * predicate is strict-greater, so in-flight comments that land within the
 * same millisecond are not silently swallowed by the next read.
 */
export async function markTripRead(tripId: string, userId: string): Promise<ReadStateRow> {
  const marker = new Date();
  const doc = await TripReadState.findOneAndUpdate(
    { tripId: new Types.ObjectId(tripId), userId: new Types.ObjectId(userId) },
    { $set: { lastReadAt: marker } },
    { upsert: true, new: true }
  );
  return { lastReadAt: doc.lastReadAt, unread: 0 };
}
