import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import TripDecision from '../../models/TripDecision.js';
import User from '../../models/User.js';
import { isObjectId, emailLabel } from './comments.js';
import { emitDecisionEvent } from './presence.js';
import type { TripRole } from './access.js';

/**
 * Trip decisions (Milestone 7, F9) — promoting a comment into a durable
 * "what we agreed" card.
 *
 * Same split as every collab service: pure helpers carry the rules worth
 * testing (promoter eligibility, cap, projection), the DB functions below are
 * thin glue covered by `smoke-f9.mts` live.
 *
 * Authorship, not rank: **the comment's author or the trip owner** may promote
 * (a demoted ex-editor still binds their own words; an owner may log the
 * group's decision from anyone's remark) and **the promoter or owner** may
 * unmark. The route floor is `viewer` on all three routes — the checks below
 * are the real authorization, exactly like comment edit/delete (§19.5).
 */

/** What a client receives — `userId`/`createdBy` are intentionally not published. */
export interface DecisionRow {
  _id: string;
  tripId: string;
  /** The source comment; snapshot keeps the record stable if the thread moves. */
  commentId: string;
  /** Display label of the comment's author (whose words are on record). */
  label: string;
  /** Display label of whoever marked it (the decision's promoter). */
  markedByLabel: string;
  /** Snapshot of the comment body at promotion time. */
  body: string;
  day?: number;
  /** True for the caller's own promotion; computed per viewer. */
  isYou: boolean;
  createdAt: Date;
  deletedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in decisions.test.ts)                              */
/* -------------------------------------------------------------------------- */

/** 409s when the trip has hit its decision ceiling. */
export function assertDecisionCap(activeCount: number): void {
  if (activeCount >= env.DECISION_MAX_PER_TRIP) {
    throw new AppError(
      'This trip has reached its decision limit. Unmark an old decision to continue.',
      409
    );
  }
}

/**
 * Promoter eligibility: the comment's author may enshrine their own words;
 * only the owner may enshrine anyone else's. A tombstoned comment cannot be
 * promoted at all (its body is already empty).
 */
export function assertDecisionPromotion(
  comment: { userId?: unknown; deletedAt?: unknown } | null | undefined,
  promoterId: string,
  role: TripRole
): void {
  if (!comment) {
    throw new AppError('That comment no longer exists.', 404);
  }
  if (comment.deletedAt) {
    throw new AppError('A removed comment cannot be marked as a decision.', 409);
  }
  const isAuthor = String(comment.userId) === String(promoterId);
  if (!isAuthor && role !== 'owner') {
    throw new AppError(
      "Only the comment's author or the trip owner can mark it as a decision.",
      403
    );
  }
}

/** Unmark eligibility: the promoter or the owner (moderation). */
export function assertDecisionRemoval(
  row: { createdBy?: unknown } | null | undefined,
  userId: string,
  role: TripRole
): void {
  if (!row) {
    throw new AppError('That decision no longer exists.', 404);
  }
  const isPromoter = String(row.createdBy) === String(userId);
  if (!isPromoter && role !== 'owner') {
    throw new AppError('Only whoever marked this or the trip owner can unmark it.', 403);
  }
}

/** Clamps the snapshot through the same cap a live comment body carries. */
export function decisionBodyFrom(commentBody: unknown): string {
  return String(commentBody || '')
    .trim()
    .slice(0, env.COMMENT_MAX_LEN);
}

/** Shapes one row for the client — mirrors `projectComment`'s rules. */
export function projectDecision(
  row: any,
  viewerId: string,
  authorLabel: string,
  promoterLabel: string
): DecisionRow {
  const deleted = Boolean(row.deletedAt);
  const projected: DecisionRow = {
    _id: String(row._id),
    tripId: String(row.tripId),
    commentId: String(row.commentId),
    label: authorLabel || 'Traveler',
    markedByLabel: promoterLabel || 'Traveler',
    body: deleted ? '' : String(row.body || ''),
    isYou: String(row.createdBy) === String(viewerId),
    createdAt: row.createdAt,
  };
  if (row.day !== undefined && row.day !== null) projected.day = Number(row.day);
  if (row.deletedAt) projected.deletedAt = row.deletedAt;
  return projected;
}

/* -------------------------------------------------------------------------- */
/*  Data access (thin glue over the rules above)                               */
/* -------------------------------------------------------------------------- */

/** Hydrates one label per user id (one indexed query for the whole list). */
async function labelsFor(userIds: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const ids = [...new Set(userIds)].filter(isObjectId);
  if (ids.length === 0) return labels;
  const users = await User.find({ _id: { $in: ids } }).select('_id email').lean();
  for (const user of users as Array<{ _id: unknown; email?: string }>) {
    labels.set(String(user._id), emailLabel(user.email));
  }
  return labels;
}

/**
 * Every active decision of the trip, newest first. The collection is bounded
 * by DECISION_MAX_PER_TRIP, so a full fetch is cheap by construction.
 */
export async function listTripDecisions(tripId: string, viewerId: string): Promise<DecisionRow[]> {
  const rows = await TripDecision.find({
    tripId: new Types.ObjectId(tripId),
    deletedAt: { $exists: false },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  const authorLabels = await labelsFor(rows.map((row) => String(row.userId)));
  const promoterLabels = await labelsFor(rows.map((row) => String(row.createdBy)));
  return rows.map((row) =>
    projectDecision(
      row,
      viewerId,
      authorLabels.get(String(row.userId)) || 'Traveler',
      promoterLabels.get(String(row.createdBy)) || 'Traveler'
    )
  );
}

/**
 * Promotes a loaded (route-scoped, non-tombstoned) comment to a decision and
 * broadcasts it. Eligibility is author-or-owner (the pure assert above); the
 * duplicate-promotion race turns into the same 409 either way — the partial
 * unique index is the authoritative guard, the pre-check is just a kinder
 * message.
 */
export async function promoteToDecision(
  tripId: string,
  comment: any,
  promoterId: string,
  role: TripRole
): Promise<DecisionRow> {
  assertDecisionPromotion(comment, promoterId, role);

  const body = decisionBodyFrom(comment.body);
  if (!body) {
    throw new AppError('That comment has no content to record as a decision.', 409);
  }

  const existing = await TripDecision.findOne({
    commentId: comment._id,
    deletedAt: { $exists: false },
  });
  if (existing) {
    throw new AppError('This comment is already marked as a decision.', 409);
  }

  let created;
  try {
    created = await TripDecision.create({
      tripId: new Types.ObjectId(tripId),
      commentId: comment._id,
      userId: comment.userId,
      createdBy: new Types.ObjectId(promoterId),
      body,
      ...(comment.day !== undefined && comment.day !== null ? { day: comment.day } : {}),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('This comment is already marked as a decision.', 409);
    }
    throw error;
  }

  const [author, promoter] = await Promise.all([
    User.findOne({ _id: comment.userId }).select('email'),
    User.findOne({ _id: promoterId }).select('email'),
  ]);
  const decision = projectDecision(
    created,
    promoterId,
    emailLabel(author?.email),
    emailLabel(promoter?.email)
  );

  emitDecisionEvent(tripId, { type: 'decision:new', decision });
  return decision;
}

/**
 * Unmarks (soft-tombstones) a decision and broadcasts the tombstoned row.
 * Soft so the audit trail keeps who logged it and when — same reasoning as
 * comment removal.
 */
export async function removeTripDecision(
  tripId: string,
  decisionId: string,
  userId: string,
  role: TripRole
): Promise<DecisionRow> {
  if (!isObjectId(decisionId)) {
    throw new AppError('That decision no longer exists.', 404);
  }
  const row = await TripDecision.findOne({
    _id: new Types.ObjectId(decisionId),
    tripId: new Types.ObjectId(tripId),
  });
  // Missing or already-tombstoned → closed history, which from the
  // active-records perspective (and the client, which filters it out) is
  // simply gone. 404, never a leak and never a silent double-tombstone.
  if (!row || row.deletedAt) {
    throw new AppError('That decision no longer exists.', 404);
  }
  assertDecisionRemoval(row, userId, role);

  row.deletedAt = row.deletedAt ?? new Date();
  await row.save();

  const [author, promoter] = await Promise.all([
    User.findOne({ _id: row.userId }).select('email'),
    User.findOne({ _id: row.createdBy }).select('email'),
  ]);
  const decision = projectDecision(
    row,
    userId,
    emailLabel(author?.email),
    emailLabel(promoter?.email)
  );

  emitDecisionEvent(tripId, { type: 'decision:update', decision });
  return decision;
}
