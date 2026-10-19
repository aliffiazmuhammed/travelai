import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import TripComment from '../../models/TripComment.js';
import User from '../../models/User.js';
import { emitCommentEvent } from './presence.js';
import type { TripRole } from './access.js';

/**
 * Trip comments — decision rules and data access (Milestone 6 §19.5, F6a).
 *
 * Split by design: the **pure** helpers (cursor parsing, limit clamping, cap
 * arithmetic, author/moderation decisions, projection) carry every rule worth
 * testing and are exercised by `comments.test.ts` without a database; the
 * DB-backed functions below are thin glue over them, verified by the live
 * `smoke-e6.mts` run.
 *
 * Author-vs-rank is a **two-layer check**, exactly like member management: the
 * router declares the *rank* floor (`commenter` to post, `viewer` for the
 * author/owner routes), and the helpers here decide *authorship*. An ex-editor
 * demoted to viewer still owns the words they wrote, so edit/delete rights bind
 * to `userId`, never to the current rank.
 */

/** What a client receives — `userId` is intentionally not published (§19.5). */
export interface CommentRow {
  _id: string;
  tripId: string;
  /** Display label (email local-part, the E2 pattern). */
  label: string;
  /** Empty string on a tombstone; base64 `iv.ct` ciphertext when `e2ee` (F10). */
  body: string;
  /** F10: true → `body` is end-to-end ciphertext only members can decrypt. */
  e2ee?: boolean;
  day?: number;
  /** True for the caller's own comments; computed per viewer. */
  isYou: boolean;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}

export interface CommentCursor {
  createdAt: Date;
  /** Present when the cursor carried an id (the exact tie-break). */
  id?: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in comments.test.ts)                               */
/* -------------------------------------------------------------------------- */

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export function isObjectId(value: unknown): boolean {
  return typeof value === 'string' && OBJECT_ID_RE.test(value);
}

/** Display label from an email address — the exact E2 members pattern. */
export function emailLabel(email?: string | null): string {
  const local = String(email || '').split('@')[0]?.trim();
  return local || 'Traveler';
}

/**
 * Parses a pagination cursor. The canonical form the server mints is
 * `"<createdAt ISO>|<_id>"` — full-millisecond time plus an exact tie-break, so
 * two comments inserted in the same millisecond still page deterministically.
 * For leniency it also accepts a bare ObjectId (time derived from the id) or a
 * bare ISO timestamp. Returns `null` for anything malformed — callers fall back
 * to "no cursor" rather than erroring, so a mangled query string degrades to the
 * first page instead of a 400.
 */
export function parseCursor(raw: unknown): CommentCursor | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();

  const [timePart, idPart] = value.split('|');
  if (idPart !== undefined) {
    const createdAt = new Date(timePart);
    if (Number.isNaN(createdAt.getTime()) || !isObjectId(idPart)) return null;
    return { createdAt, id: idPart };
  }

  if (isObjectId(value)) {
    // Bare ObjectId: its embedded timestamp is only second-resolution, so this
    // form is a coarse fallback — the minted `ISO|_id` form is exact.
    const seconds = parseInt(value.slice(0, 8), 16);
    return { createdAt: new Date(seconds * 1000), id: value };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { createdAt: parsed };
}

/**
 * The Mongo filter for "strictly older than this cursor". With an id the
 * comparison is `(createdAt, _id) < (cursor.createdAt, cursor._id)`, which is
 * total — two comments inserted in the same millisecond can never be skipped or
 * repeated across pages.
 */
export function buildCursorFilter(raw: unknown): Record<string, unknown> | null {
  const cursor = parseCursor(raw);
  if (!cursor) return null;
  if (!cursor.id) return { createdAt: { $lt: cursor.createdAt } };
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new Types.ObjectId(cursor.id) } },
    ],
  };
}

/** Clamps a requested page size to the configured server maximum. */
export function resolveLimit(requested: unknown): number {
  const parsed = Number(requested);
  if (!Number.isFinite(parsed) || parsed <= 0) return env.COMMENTS_PAGE_SIZE;
  return Math.min(Math.floor(parsed), env.COMMENTS_PAGE_SIZE);
}

/** Per-trip write cap. Throws 409 when the trip is full. */
export function assertCommentCap(activeCount: number): void {
  if (activeCount >= env.COMMENT_MAX_PER_TRIP) {
    throw new AppError(
      'This trip has reached its comment limit. Remove some older comments to continue.',
      409
    );
  }
}

/** 404s for a missing/wrong-trip comment; 403s when the caller is not the author. */
export function assertCommentAuthor(row: { userId?: unknown } | null | undefined, userId: string): void {
  if (!row) {
    throw new AppError('That comment no longer exists.', 404);
  }
  if (String(row.userId) !== String(userId)) {
    throw new AppError('You can only edit your own comments.', 403);
  }
}

/**
 * Removal is **author-or-owner**: the author may always delete their own words,
 * and an owner moderates anyone else's (§19.3). Both paths soft-delete.
 */
export function assertCommentRemoval(
  row: { userId?: unknown } | null | undefined,
  userId: string,
  role: TripRole
): void {
  if (!row) {
    throw new AppError('That comment no longer exists.', 404);
  }
  const isAuthor = String(row.userId) === String(userId);
  if (!isAuthor && role !== 'owner') {
    throw new AppError('Only the author or the trip owner can remove this comment.', 403);
  }
}

/** Shapes one row for the client. Tombstones keep their slot but lose the body. */
export function projectComment(
  row: any,
  viewerId: string,
  label: string
): CommentRow {
  const deleted = Boolean(row.deletedAt);
  const projected: CommentRow = {
    _id: String(row._id),
    tripId: String(row.tripId),
    label: label || 'Traveler',
    body: deleted ? '' : String(row.body || ''),
    isYou: String(row.userId) === String(viewerId),
    createdAt: row.createdAt,
  };
  // F10: the flag travels with the ciphertext (legacy rows simply omit it).
  if (!deleted && row.e2ee) projected.e2ee = true;
  if (row.day !== undefined && row.day !== null) projected.day = Number(row.day);
  if (row.editedAt) projected.editedAt = row.editedAt;
  if (row.deletedAt) projected.deletedAt = row.deletedAt;
  return projected;
}

/** Turns the day aggregation rows into `{ [day]: count }` for the UI badges. */
export function dayCountsFrom(rows: Array<{ _id: number; count: number }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row && row._id !== undefined && row._id !== null) {
      counts[String(row._id)] = Number(row.count) || 0;
    }
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Data access (thin glue over the rules above)                               */
/* -------------------------------------------------------------------------- */

/** Hydrates `userId → label` for a page of rows in one query (§19.5). */
async function labelsFor(rows: Array<{ userId: unknown }>): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (rows.length === 0) return labels;

  const ids = [...new Set(rows.map((row) => String(row.userId)))].filter(isObjectId);
  if (ids.length === 0) return labels;

  const users = await User.find({ _id: { $in: ids } })
    .select('_id email')
    .lean();
  for (const user of users as Array<{ _id: unknown; email?: string }>) {
    labels.set(String(user._id), emailLabel(user.email));
  }
  return labels;
}

export interface ListCommentsResult {
  comments: CommentRow[];
  nextCursor: string | null;
  dayCounts: Record<string, number>;
}

/**
 * One page of the comment stream, newest first, plus the per-day counts that
 * drive the day filter chips. Tombstones are included so a moderated thread
 * still reads coherently.
 */
export async function listTripComments(
  tripId: string,
  options: { before?: unknown; limit?: unknown },
  viewerId: string
): Promise<ListCommentsResult> {
  const limit = resolveLimit(options.limit);
  const cursorFilter = buildCursorFilter(options.before);

  const filter: Record<string, unknown> = { tripId: new Types.ObjectId(tripId) };
  if (cursorFilter) filter.$and = [cursorFilter];

  // Fetch one extra row to know whether another page follows, without a count.
  const rows = await TripComment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const labels = await labelsFor(page as Array<{ userId: unknown }>);
  const comments = page.map((row) =>
    projectComment(row, viewerId, labels.get(String(row.userId)) || 'Traveler')
  );

  const dayAggregation = await TripComment.aggregate<{ _id: number; count: number }>([
    { $match: { tripId: new Types.ObjectId(tripId), deletedAt: { $exists: false }, day: { $exists: true } } },
    { $group: { _id: '$day', count: { $sum: 1 } } },
  ]);

  return {
    comments,
    nextCursor: hasMore ? `${page[page.length - 1].createdAt.toISOString()}|${String(page[page.length - 1]._id)}` : null,
    dayCounts: dayCountsFrom(dayAggregation),
  };
}

/**
 * Creates a comment and broadcasts it. Never touches the `Trip` document, so no
 * `rev` bump and no `trip:updated` frame — a remark cannot break an open edit.
 */
export async function createTripComment(
  trip: any,
  userId: string,
  input: { body: string; day?: number; e2ee?: boolean }
): Promise<CommentRow> {
  const tripId = String(trip._id);

  const activeCount = await TripComment.countDocuments({
    tripId: new Types.ObjectId(tripId),
    deletedAt: { $exists: false },
  });
  assertCommentCap(activeCount);

  const created = await TripComment.create({
    tripId: new Types.ObjectId(tripId),
    userId: new Types.ObjectId(userId),
    body: input.body,
    day: input.day,
    // F10: the server stores ciphertext as-is — it cannot read it, ever.
    e2ee: Boolean(input.e2ee),
  });

  const user = await User.findOne({ _id: userId }).select('email');
  const comment = projectComment(created, userId, emailLabel(user?.email));

  emitCommentEvent(tripId, { type: 'comment:new', comment });
  return comment;
}

/** Loads a comment **scoped to its trip** — a foreign id is a 404, not a leak. */
export async function loadTripComment(tripId: string, commentId: string): Promise<any> {
  if (!isObjectId(commentId)) {
    throw new AppError('That comment no longer exists.', 404);
  }
  const row = await TripComment.findOne({
    _id: new Types.ObjectId(commentId),
    tripId: new Types.ObjectId(tripId),
  });
  if (!row) {
    throw new AppError('That comment no longer exists.', 404);
  }
  return row;
}

/** Author-only edit; stamps `editedAt` and broadcasts the patched row. */
export async function editTripComment(
  row: any,
  userId: string,
  body: string,
  e2ee?: boolean
): Promise<CommentRow> {
  assertCommentAuthor(row, userId);

  row.body = body;
  // F10: each edit carries its own scheme (an author may re-encrypt a legacy
  // row; the flag is authoritative with the body it arrived alongside).
  if (e2ee !== undefined) row.e2ee = Boolean(e2ee);
  row.editedAt = new Date();
  await row.save();

  const user = await User.findOne({ _id: userId }).select('email');
  const comment = projectComment(row, userId, emailLabel(user?.email));

  emitCommentEvent(String(row.tripId), { type: 'comment:update', comment });
  return comment;
}

/**
 * Author-or-owner removal. Soft-delete only: the row keeps `userId` + timing as
 * an audit trail while the body is emptied for every reader.
 */
export async function removeTripComment(
  row: any,
  userId: string,
  role: TripRole
): Promise<CommentRow> {
  assertCommentRemoval(row, userId, role);

  row.deletedAt = row.deletedAt ?? new Date();
  row.body = '';
  await row.save();

  const user = await User.findOne({ _id: String(row.userId) }).select('email');
  const comment = projectComment(row, userId, emailLabel(user?.email));

  // `isYou` is viewer-specific on a broadcast frame: the SPA recomputes it from
  // the row it already holds, so the frame is safe to fan out as-is.
  emitCommentEvent(String(row.tripId), { type: 'comment:update', comment });
  return comment;
}
