import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import TripPoll from '../../models/TripPoll.js';
import User from '../../models/User.js';
import { isObjectId, emailLabel } from './comments.js';
import { emitPollEvent } from './presence.js';
import type { TripRole } from './access.js';

/**
 * Group polls (Milestone 7, F13a) — created from the chat, voted on in the chat.
 *
 * **The server is a blind carrier**, exactly like chat: the poll payload
 * (question + option labels) and every vote arrive as ciphertext sealed with
 * the trip's conversation key. This service therefore validates *shape and
 * size*, never content, and never verifies that a vote's sealed index falls
 * inside the option list — it cannot read either one. The client refuses such
 * a vote visually (an index it cannot map is simply not shown as a choice).
 *
 * Same split as every collab service: the pure rules are unit-tested
 * (`polls.test.ts`), the DB glue rides the live `smoke-f13.mts` run.
 */

/**
 * What a client receives. User ids ride along on purpose: membership is not
 * content (presence frames already publish ids to members), and a stable id is
 * what lets the SPA compute `isYou` correctly from a broadcast frame as well as
 * from its own HTTP response.
 */
export interface PollVoteRow {
  userId: string;
  label: string;
  /** Sealed option index (opaque to the server and to this projection). */
  choice: string;
  at: Date;
}

export interface PollRow {
  _id: string;
  tripId: string;
  createdBy: string;
  /** Display label of whoever started the poll (the email local part). */
  createdByLabel: string;
  /** True for the caller's own poll; computed per viewer. */
  isYou: boolean;
  /** Sealed `{ q, o[] }`. */
  body: string;
  e2ee: boolean;
  votes: PollVoteRow[];
  createdAt: Date;
  closedAt?: Date;
  deletedAt?: Date;
}

/** One vote is a sealed index: base64 iv (16) + dot + base64 ciphertext. */
const SEALED_CHOICE = /^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/;

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in polls.test.ts)                                  */
/* -------------------------------------------------------------------------- */

/** 409s when the trip has hit its poll ceiling (closed polls still count). */
export function assertPollCap(activeCount: number): void {
  if (activeCount >= env.POLL_MAX_PER_TRIP) {
    throw new AppError(
      'This trip has reached its poll limit. Remove an old poll to start another.',
      409
    );
  }
}

/** The sealed payload is a small JSON blob — bounded so a client cannot flood. */
export function pollBodyFrom(body: unknown): string {
  const value = String(body || '').trim();
  if (!value) {
    throw new AppError('That poll has no content.', 409);
  }
  if (value.length > env.COMMENT_MAX_LEN * 2) {
    throw new AppError('That poll is too large to store.', 409);
  }
  // A sealed payload without its iv is not decryptable by anyone — refuse it
  // here rather than storing a card nobody can open.
  if (!value.includes('.')) {
    throw new AppError('A poll must be sealed before it is sent.', 409);
  }
  return value;
}

/** A vote is one sealed index — same shape rule as the payload, much smaller. */
export function assertChoiceShape(choice: unknown): string {
  const value = String(choice || '').trim();
  if (value.length > 400 || !SEALED_CHOICE.test(value)) {
    throw new AppError('That vote could not be recorded.', 409);
  }
  return value;
}

/** Closed and removed polls both refuse votes, with different words. */
export function assertPollOpen(row: { closedAt?: unknown; deletedAt?: unknown } | null | undefined): void {
  if (!row || row.deletedAt) {
    throw new AppError('That poll no longer exists.', 404);
  }
  if (row.closedAt) {
    throw new AppError('This poll is closed — no more votes can be cast.', 409);
  }
}

/** Close/remove: the poll's creator or the trip owner (moderation). */
export function assertPollManagement(
  row: { createdBy?: unknown } | null | undefined,
  userId: string,
  role: TripRole
): void {
  if (!row) {
    throw new AppError('That poll no longer exists.', 404);
  }
  const isCreator = String(row.createdBy) === String(userId);
  if (!isCreator && role !== 'owner') {
    throw new AppError('Only whoever started this poll or the trip owner can change it.', 403);
  }
}

/**
 * One vote per member: a new vote replaces the old one (people change their
 * mind), and re-sending the same choice is a no-op the caller can detect by the
 * returned flag — the route then skips the save and the broadcast.
 */
export function upsertVote(
  votes: Array<{ userId: unknown; choice: string; at: Date }>,
  userId: string,
  choice: string,
  at: Date
): { votes: Array<{ userId: unknown; choice: string; at: Date }>; changed: boolean } {
  const index = votes.findIndex((vote) => String(vote.userId) === String(userId));
  if (index === -1) {
    return { votes: [...votes, { userId, choice, at }], changed: true };
  }
  if (votes[index].choice === choice) {
    return { votes, changed: false };
  }
  const next = [...votes];
  next[index] = { userId: votes[index].userId, choice, at };
  return { votes: next, changed: true };
}

/** Shapes one poll for the client. Tombstones lose the payload, keep the slot. */
export function projectPoll(
  row: any,
  viewerId: string,
  voterLabels: Map<string, string>
): PollRow {
  const deleted = Boolean(row.deletedAt);
  const votes = deleted
    ? []
    : (row.votes || []).map((vote: any) => ({
        userId: String(vote.userId),
        label: voterLabels.get(String(vote.userId)) || 'Traveler',
        choice: String(vote.choice || ''),
        at: vote.at,
      }));
  const projected: PollRow = {
    _id: String(row._id),
    tripId: String(row.tripId),
    createdBy: String(row.createdBy),
    createdByLabel: voterLabels.get(String(row.createdBy)) || 'Traveler',
    isYou: String(row.createdBy) === String(viewerId),
    body: deleted ? '' : String(row.body || ''),
    e2ee: !deleted && row.e2ee !== false,
    votes,
    createdAt: row.createdAt,
  };
  if (row.closedAt) projected.closedAt = row.closedAt;
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
 * Every active poll of the trip, newest first. Closed polls stay in the list —
 * the tally is part of the record; removed ones are gone. Bounded by
 * POLL_MAX_PER_TRIP, so a full fetch is cheap by construction.
 */
export async function listTripPolls(tripId: string, viewerId: string): Promise<PollRow[]> {
  const rows = await TripPoll.find({
    tripId: new Types.ObjectId(tripId),
    deletedAt: { $exists: false },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  const userIds: string[] = [];
  for (const row of rows) {
    userIds.push(String(row.createdBy));
    for (const vote of row.votes || []) userIds.push(String(vote.userId));
  }
  const labels = await labelsFor(userIds);

  return rows.map((row) => projectPoll(row, viewerId, labels));
}

/** Loads one poll **scoped to its trip** — a foreign id is a 404, not a leak. */
export async function loadTripPoll(tripId: string, pollId: string): Promise<any> {
  if (!isObjectId(pollId)) {
    throw new AppError('That poll no longer exists.', 404);
  }
  const row = await TripPoll.findOne({
    _id: new Types.ObjectId(pollId),
    tripId: new Types.ObjectId(tripId),
  });
  if (!row || row.deletedAt) {
    throw new AppError('That poll no longer exists.', 404);
  }
  return row;
}

/** Projects one loaded row for the acting user (labels for creator + voters). */
async function projectLoaded(row: any, viewerId: string): Promise<PollRow> {
  const userIds = [String(row.createdBy), ...(row.votes || []).map((vote: any) => String(vote.userId))];
  const labels = await labelsFor(userIds);
  return projectPoll(row, viewerId, labels);
}

/** Creates a poll and broadcasts it. Never touches `Trip` (no `rev` bump). */
export async function createTripPoll(
  tripId: string,
  userId: string,
  body: string
): Promise<PollRow> {
  const activeCount = await TripPoll.countDocuments({
    tripId: new Types.ObjectId(tripId),
    deletedAt: { $exists: false },
  });
  assertPollCap(activeCount);

  const created = await TripPoll.create({
    tripId: new Types.ObjectId(tripId),
    createdBy: new Types.ObjectId(userId),
    body: pollBodyFrom(body),
    // The server stores ciphertext as-is — it cannot read the question either.
    e2ee: true,
    votes: [],
  });

  const poll = await projectLoaded(created, userId);
  emitPollEvent(tripId, { type: 'poll:new', poll });
  return poll;
}

/**
 * Casts or changes one vote. Idempotent for the same choice: nothing is saved
 * or broadcast, so a double-tap cannot spam collaborators' streams. The sealed
 * index is never inspected beyond its shape — the server cannot count options.
 */
export async function voteTripPoll(
  tripId: string,
  pollId: string,
  userId: string,
  choice: string
): Promise<PollRow> {
  const row = await loadTripPoll(tripId, pollId);
  assertPollOpen(row);

  const next = upsertVote(row.votes || [], userId, assertChoiceShape(choice), new Date());
  if (next.changed) {
    row.set('votes', next.votes);
    await row.save();
  }

  const poll = await projectLoaded(row, userId);
  if (next.changed) emitPollEvent(tripId, { type: 'poll:update', poll });
  return poll;
}

/** Closes voting (creator or owner). Idempotent: closing twice is not an error. */
export async function closeTripPoll(
  tripId: string,
  pollId: string,
  userId: string,
  role: TripRole
): Promise<PollRow> {
  const row = await loadTripPoll(tripId, pollId);
  assertPollManagement(row, userId, role);

  if (!row.closedAt) {
    row.closedAt = new Date();
    await row.save();
  }

  const poll = await projectLoaded(row, userId);
  emitPollEvent(tripId, { type: 'poll:update', poll });
  return poll;
}

/** Removes (soft-tombstones) a poll and broadcasts the emptied row. */
export async function removeTripPoll(
  tripId: string,
  pollId: string,
  userId: string,
  role: TripRole
): Promise<PollRow> {
  const row = await loadTripPoll(tripId, pollId);
  assertPollManagement(row, userId, role);

  row.deletedAt = row.deletedAt ?? new Date();
  row.body = '';
  await row.save();

  const poll = await projectLoaded(row, userId);
  emitPollEvent(tripId, { type: 'poll:update', poll });
  return poll;
}
