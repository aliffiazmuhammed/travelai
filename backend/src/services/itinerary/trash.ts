import { Types } from 'mongoose';
import Trip from '../../models/Trip.js';
import TripChatKey from '../../models/TripChatKey.js';
import TripComment from '../../models/TripComment.js';
import TripDecision from '../../models/TripDecision.js';
import TripInvite from '../../models/TripInvite.js';
import TripPoll from '../../models/TripPoll.js';
import TripReadState from '../../models/TripReadState.js';
import { deleteReceiptFile } from '../finance/receipt.js';

/**
 * Recently deleted trips (Milestone 7, M7.7).
 *
 * Deletion has always been a soft delete (`Trip.isDeleted`), but until now there
 * was no way to see or recover the row. These helpers keep the trash scoped to
 * current owners and make permanent deletion a cascade rather than a single
 * `deleteOne` that would strand comments, polls, keys and receipts.
 */

/** A bounded page is enough for a personal trash; no pagination UI yet. */
export const MAX_TRASH_ROWS = 100;

/**
 * Only the current owner can see or restore a deleted trip. Membership (not
 * `userId`) is authoritative, exactly like every other trip authorization path:
 * a creator who transferred ownership no longer sees the row.
 */
export function deletedOwnerFilter(userId: string): Record<string, unknown> {
  return {
    isDeleted: true,
    // Agency trash is listed through the tenant route, never the personal one.
    workspace: { $ne: 'agency' },
    members: {
      $elemMatch: {
        userId: new Types.ObjectId(userId),
        role: 'owner',
      },
    },
  };
}

/** Summary fields the dashboard needs; never the full itinerary or ledger. */
const TRASH_SELECT = [
  'title',
  'status',
  'version',
  'hasEdited',
  'rev',
  'startDate',
  'endDate',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'members',
  'tripDetails.trip_title',
  'tripDetails.duration_days',
  'tripDetails.budget_per_person',
  'tripDetails.group_type',
].join(' ');

/** Lists deleted trips the caller currently owns, newest deletion first. */
export async function listDeletedTrips(userId: string) {
  return Trip.find(deletedOwnerFilter(userId))
    .sort({ deletedAt: -1, updatedAt: -1 })
    .limit(MAX_TRASH_ROWS)
    .select(TRASH_SELECT);
}

/** Every distinct managed receipt URL embedded in the trip's expenses. */
export function collectReceiptUrls(trip: any): string[] {
  const urls = new Set<string>();
  for (const expense of trip?.expenses ?? []) {
    const url = String(expense?.receiptUrl ?? '').trim();
    if (url) urls.add(url);
  }
  return Array.from(urls);
}

/**
 * Hard-deletes a trip and every collection row that points at it. Receipt files
 * are removed after the database is gone; a storage failure leaves an orphan
 * file, never a live trip pointing at a missing row.
 */
export async function purgeTripCascade(trip: any): Promise<void> {
  const tripId = trip._id;
  const receiptUrls = collectReceiptUrls(trip);

  await Promise.all([
    TripChatKey.deleteMany({ tripId }),
    TripComment.deleteMany({ tripId }),
    TripDecision.deleteMany({ tripId }),
    TripInvite.deleteMany({ tripId }),
    TripPoll.deleteMany({ tripId }),
    TripReadState.deleteMany({ tripId }),
  ]);

  await Trip.deleteOne({ _id: tripId });

  // `deleteReceiptFile` is best-effort and already logs Cloudinary failures.
  await Promise.all(receiptUrls.map((url) => deleteReceiptFile(url)));
}
