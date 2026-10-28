import mongoose from 'mongoose';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';

/**
 * Public reply-time signal (Milestone 9 D7).
 *
 * The profile shows "Usually replies in about X h" only when the agency has
 * earned it: at least five replied enquiries in its recent history. A median is
 * used instead of a mean because one enquiry answered a week later must not
 * make a responsive agency look slow.
 *
 * The read is deliberately forgiving: a directory page is not worth a 500 on
 * an enquiry-collection hiccup, so any failure returns `null` (the line simply
 * does not render). Only `createdAt` and `repliedAt` are selected.
 */
export const REPLY_TIME_MIN_SAMPLES = 5;
export const REPLY_TIME_WINDOW = 20;

export interface ReplyTimeRow {
  createdAt?: Date | string | null;
  repliedAt?: Date | string | null;
}

/**
 * Median hours between creation and first reply, rounded down to a whole hour
 * with a floor of 1. Returns `null` when no row carries a usable pair. The
 * caller decides whether there are enough samples to publish.
 */
export function medianReplyHours(rows: ReplyTimeRow[]): number | null {
  const hours: number[] = [];
  for (const row of rows) {
    if (!row?.createdAt || !row?.repliedAt) continue;
    const created = new Date(row.createdAt).getTime();
    const replied = new Date(row.repliedAt).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(replied)) continue;
    const value = (replied - created) / 3_600_000;
    if (!Number.isFinite(value) || value < 0) continue;
    hours.push(value);
  }
  if (hours.length === 0) return null;

  hours.sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  const median =
    hours.length % 2 === 1
      ? hours[middle]
      : (hours[middle - 1] + hours[middle]) / 2;
  return Math.max(1, Math.round(median));
}

/**
 * The public reply-time value for one agency, or `null` when the agency has not
 * replied to at least `REPLY_TIME_MIN_SAMPLES` recent enquiries.
 */
export async function agencyReplyTimeHours(
  agencyId: string
): Promise<number | null> {
  if (!mongoose.isValidObjectId(agencyId)) return null;

  try {
    const rows = (await AgencyEnquiry.find({
      agencyId,
      repliedAt: { $type: 'date' },
    })
      .select('createdAt repliedAt')
      .sort({ repliedAt: -1, _id: -1 })
      .limit(REPLY_TIME_WINDOW)
      .lean()) as ReplyTimeRow[];

    if (rows.length < REPLY_TIME_MIN_SAMPLES) return null;
    return medianReplyHours(rows);
  } catch (error) {
    console.warn('Could not compute the agency reply time:', error);
    return null;
  }
}
