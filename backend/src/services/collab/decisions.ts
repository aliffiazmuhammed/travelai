import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import TripDecision from '../../models/TripDecision.js';
import TripComment from '../../models/TripComment.js';
import User from '../../models/User.js';
import { isObjectId, userLabel } from './comments.js';
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
  /** F10: true → the snapshot body is end-to-end ciphertext. */
  e2ee?: boolean;
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

/**
 * Clamps the snapshot through the same cap a live comment body carries.
 * F10: an encrypted body is base64 (`iv.ct`), so the *encoding* cap doubles —
 * the plaintext meaning cap is still COMMENT_MAX_LEN, but slicing ciphertext
 * at the flat cap would corrupt it into an undecryptable blob.
 */
export function decisionBodyFrom(commentBody: unknown, e2ee?: boolean): string {
  const cap = e2ee ? env.COMMENT_MAX_LEN * 2 : env.COMMENT_MAX_LEN;
  return String(commentBody || '')
    .trim()
    .slice(0, cap);
}

/**
 * The client's ciphertext wire format: `<b64 12-byte iv>.<b64 ct>`. The iv is
 * always 16 base64 chars (12 bytes, no padding), which makes the shape a very
 * strong signal — used only to repair rows that predate the stored flag.
 */
const ENCRYPTED_BODY = /^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/;

/**
 * F10h: did a decision written BEFORE the flag existed carry ciphertext?
 *
 * Both signals must agree — the source comment is flagged e2ee AND the
 * snapshot is shaped exactly like the client's wire format. A plaintext remark
 * can contain a dot ("meet at 9.30"), so the body alone is never trusted; and
 * the comment's flag alone is not enough either, because a remark edited from
 * plaintext to ciphertext after promotion leaves an honest plaintext snapshot.
 * Result: the repair can only ever ADD the flag where it is true, never hide a
 * readable body.
 */
export function inferDecisionE2ee(body: unknown, sourceE2ee: unknown): boolean {
  return Boolean(sourceE2ee) && ENCRYPTED_BODY.test(String(body || ''));
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
  if (!deleted && row.e2ee) projected.e2ee = true;
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
  const users = await User.find({ _id: { $in: ids } }).select('_id email name').lean();
  for (const user of users as Array<{ _id: unknown; email?: string; name?: string }>) {
    labels.set(String(user._id), userLabel(user));
  }
  return labels;
}

/**
 * F10h: backfills `e2ee` on rows written before the decision document stored
 * it. Runs on the (bounded, capped) decision list and is idempotent: only rows
 * with NO flag are considered, and the pair of signals in `inferDecisionE2ee`
 * must agree. Rows that stay un-flagged are known plaintext snapshots — they
 * keep rendering as text, which is why the schema leaves the field undefined
 * instead of defaulting to false.
 *
 * A GET may write here by design: the alternative is a migration script the
 * operator has to remember, and the affected users see base64 until it runs.
 */
async function repairDecisionFlags(rows: any[]): Promise<void> {
  const stale = rows.filter((row) => row.e2ee === undefined || row.e2ee === null);
  if (stale.length === 0) return;

  const comments = await TripComment.find({ _id: { $in: stale.map((row) => row.commentId) } })
    .select('_id e2ee')
    .lean();
  const sourceFlags = new Map(
    (comments as Array<{ _id: unknown; e2ee?: boolean }>).map((comment) => [
      String(comment._id),
      comment.e2ee,
    ])
  );

  const repairs: unknown[] = [];
  for (const row of stale) {
    if (inferDecisionE2ee(row.body, sourceFlags.get(String(row.commentId)))) {
      row.e2ee = true; // the projection below reads the repaired value
      repairs.push(row._id);
    }
  }
  if (repairs.length > 0) {
    await TripDecision.updateMany({ _id: { $in: repairs } }, { $set: { e2ee: true } });
  }
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

  await repairDecisionFlags(rows);

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

  const body = decisionBodyFrom(comment.body, Boolean(comment.e2ee));
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
      e2ee: Boolean(comment.e2ee),
      ...(comment.day !== undefined && comment.day !== null ? { day: comment.day } : {}),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('This comment is already marked as a decision.', 409);
    }
    throw error;
  }

  const [author, promoter] = await Promise.all([
    User.findOne({ _id: comment.userId }).select('email name'),
    User.findOne({ _id: promoterId }).select('email name'),
  ]);
  const decision = projectDecision(
    created,
    promoterId,
    userLabel(author),
    userLabel(promoter)
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
    User.findOne({ _id: row.userId }).select('email name'),
    User.findOne({ _id: row.createdBy }).select('email name'),
  ]);
  const decision = projectDecision(
    row,
    userId,
    userLabel(author),
    userLabel(promoter)
  );

  emitDecisionEvent(tripId, { type: 'decision:update', decision });
  return decision;
}
