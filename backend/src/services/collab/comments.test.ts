import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  assertCommentAuthor,
  assertCommentCap,
  assertCommentRemoval,
  buildCursorFilter,
  dayCountsFrom,
  emailLabel,
  parseCursor,
  projectComment,
  resolveLimit,
} from './comments.js';
import { createCommentSchema, updateCommentSchema } from '../../schemas/comments.schema.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

/**
 * Pure-rule tests for trip comments (F6a, `docs/roadmap-milestone-6-collaboration.md`
 * §19.5). Database-backed listing/creation is covered by the live `smoke-e6.mts`
 * run; what must hold *structurally* — cursor determinism, cap arithmetic, the
 * author/moderation matrix, tombstone projection and schema bounds — is asserted
 * here so a regression fails in CI, not in production.
 */

/* -------------------------------------------------------------------------- */
/*  Schemas (schemas/comments.schema.ts)                                       */
/* -------------------------------------------------------------------------- */

test('comment schema: empty and whitespace-only bodies are rejected', () => {
  assert.equal(createCommentSchema.safeParse({ body: '' }).success, false);
  assert.equal(createCommentSchema.safeParse({ body: '   ' }).success, false);
  assert.equal(createCommentSchema.safeParse({ body: '\n\t ' }).success, false);
  assert.equal(createCommentSchema.safeParse({ body: 'Looks great!' }).success, true);
});

test('comment schema: the length cap is the configured value (inclusive)', () => {
  const atMax = 'x'.repeat(env.COMMENT_MAX_LEN);
  const overMax = 'x'.repeat(env.COMMENT_MAX_LEN + 1);
  assert.equal(createCommentSchema.safeParse({ body: atMax }).success, true);
  assert.equal(createCommentSchema.safeParse({ body: overMax }).success, false);
  assert.equal(updateCommentSchema.safeParse({ body: overMax }).success, false);
});

test('comment schema: a day anchor is optional but bounded (1..999, integer)', () => {
  assert.equal(createCommentSchema.safeParse({ body: 'hi' }).success, true);
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: 1 }).success, true);
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: 999 }).success, true);
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: 0 }).success, false);
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: 1000 }).success, false);
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: 2.5 }).success, false);
  // `day` is coerced, so the SPA's string query value is accepted.
  assert.equal(createCommentSchema.safeParse({ body: 'hi', day: '3' }).success, true);
});

/* -------------------------------------------------------------------------- */
/*  Cursor parsing + pagination filter                                         */
/* -------------------------------------------------------------------------- */

test('parseCursor: malformed cursors degrade to "no cursor" (never a 400)', () => {
  assert.equal(parseCursor(undefined), null);
  assert.equal(parseCursor(null), null);
  assert.equal(parseCursor(''), null);
  assert.equal(parseCursor('   '), null);
  assert.equal(parseCursor('not-a-date'), null);
  assert.equal(parseCursor(42 as unknown), null);
});

test('parseCursor: an ObjectId cursor carries an exact (createdAt, _id) tie-break', () => {
  const id = new Types.ObjectId().toString();
  const parsed = parseCursor(id);
  assert.ok(parsed);
  assert.equal(parsed!.id, id);
  assert.equal(parsed!.createdAt instanceof Date, true);
});

test('parseCursor: the canonical "ISO|_id" cursor is exact (millisecond + id)', () => {
  const id = new Types.ObjectId().toString();
  const parsed = parseCursor(`2026-01-02T03:04:05.678Z|${id}`);
  assert.ok(parsed);
  assert.equal(parsed!.id, id);
  assert.equal(parsed!.createdAt.toISOString(), '2026-01-02T03:04:05.678Z');
  // Malformed halves are rejected outright.
  assert.equal(parseCursor(`not-a-date|${id}`), null);
  assert.equal(parseCursor('2026-01-02T03:04:05.678Z|not-an-id'), null);
});

test('parseCursor: an ISO timestamp cursor has no tie-break id', () => {
  const parsed = parseCursor('2026-01-02T03:04:05.000Z');
  assert.ok(parsed);
  assert.equal(parsed!.id, undefined);
  assert.equal(parsed!.createdAt.toISOString(), '2026-01-02T03:04:05.000Z');
});

test('buildCursorFilter: ObjectId builds the total (createdAt, _id) comparison', () => {
  const id = new Types.ObjectId().toString();
  const filter = buildCursorFilter(id) as { $or: any[] };
  assert.ok(filter.$or, 'expected an $or tie-break');
  assert.equal(filter.$or.length, 2);
  assert.equal(filter.$or[0].createdAt.$lt instanceof Date, true);
  assert.equal(String(filter.$or[1]._id.$lt), id);
});

test('buildCursorFilter: the composite cursor preserves millisecond precision', () => {
  const id = new Types.ObjectId().toString();
  const filter = buildCursorFilter(`2026-01-02T03:04:05.678Z|${id}`) as { $or: any[] };
  assert.ok(filter.$or);
  assert.equal(filter.$or[0].createdAt.$lt.toISOString(), '2026-01-02T03:04:05.678Z');
  assert.equal(filter.$or[1].createdAt.toISOString(), '2026-01-02T03:04:05.678Z');
  assert.equal(String(filter.$or[1]._id.$lt), id);
});

test('buildCursorFilter: ISO builds a plain createdAt comparison; junk is null', () => {
  const filter = buildCursorFilter('2026-01-02T03:04:05.000Z') as { createdAt: { $lt: Date } };
  assert.equal(filter.createdAt.$lt instanceof Date, true);
  assert.equal(buildCursorFilter('nope'), null);
});

/* -------------------------------------------------------------------------- */
/*  Limits + caps                                                              */
/* -------------------------------------------------------------------------- */

test('resolveLimit: defaults, clamps and rejects nonsense', () => {
  assert.equal(resolveLimit(undefined), env.COMMENTS_PAGE_SIZE);
  assert.equal(resolveLimit(0), env.COMMENTS_PAGE_SIZE);
  assert.equal(resolveLimit(-5), env.COMMENTS_PAGE_SIZE);
  assert.equal(resolveLimit('abc'), env.COMMENTS_PAGE_SIZE);
  assert.equal(resolveLimit(10), 10);
  assert.equal(resolveLimit(env.COMMENTS_PAGE_SIZE + 500), env.COMMENTS_PAGE_SIZE);
});

test('assertCommentCap: the per-trip cap throws a 409 at the boundary', () => {
  assert.doesNotThrow(() => assertCommentCap(0));
  assert.doesNotThrow(() => assertCommentCap(env.COMMENT_MAX_PER_TRIP - 1));
  assert.throws(() => assertCommentCap(env.COMMENT_MAX_PER_TRIP), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    return true;
  });
});

/* -------------------------------------------------------------------------- */
/*  Author + moderation matrix                                                 */
/* -------------------------------------------------------------------------- */

function comment(overrides: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    body: 'Original body',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('assertCommentAuthor: 404 for a missing row, 403 for a foreign author', () => {
  assert.throws(() => assertCommentAuthor(null, 'me'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 404);
    return true;
  });

  const row = comment({ userId: 'someone-else' });
  assert.throws(() => assertCommentAuthor(row, 'me'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 403);
    return true;
  });

  assert.doesNotThrow(() => assertCommentAuthor(comment({ userId: 'me' }), 'me'));
});

test('assertCommentRemoval: author always, owner for anyone, others refused', () => {
  assert.throws(() => assertCommentRemoval(null, 'me', 'viewer'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 404);
    return true;
  });

  // The author may remove their own words at any rank (even a demoted viewer).
  assert.doesNotThrow(() => assertCommentRemoval(comment({ userId: 'me' }), 'me', 'viewer'));

  // A non-author viewer may not.
  assert.throws(
    () => assertCommentRemoval(comment({ userId: 'other' }), 'me', 'viewer'),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  // A non-author editor may not (moderation is owner-only).
  assert.throws(
    () => assertCommentRemoval(comment({ userId: 'other' }), 'me', 'editor'),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  // The owner moderates anyone's.
  assert.doesNotThrow(() => assertCommentRemoval(comment({ userId: 'other' }), 'me', 'owner'));
});

/* -------------------------------------------------------------------------- */
/*  Projection + labels                                                        */
/* -------------------------------------------------------------------------- */

test('projectComment: shapes a live row and computes isYou per viewer', () => {
  const authorId = new Types.ObjectId().toString();
  const row = comment({ userId: authorId, day: 3, body: 'Day 3 idea' });

  const mine = projectComment(row, authorId, 'kiran');
  assert.equal(mine.isYou, true);
  assert.equal(mine.body, 'Day 3 idea');
  assert.equal(mine.day, 3);
  assert.equal(mine.label, 'kiran');
  assert.equal(mine.deletedAt, undefined);
  assert.equal(mine.editedAt, undefined);

  const theirs = projectComment(row, 'someone-else', 'kiran');
  assert.equal(theirs.isYou, false);
});

test('projectComment: a tombstone keeps its slot but loses the body', () => {
  const row = comment({
    body: '',
    editedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: new Date('2026-01-03T00:00:00.000Z'),
  });
  const projected = projectComment(row, 'me', 'kiran');
  assert.equal(projected.body, '');
  assert.equal(projected.deletedAt instanceof Date, true);
  assert.equal(projected.editedAt instanceof Date, true);
  assert.equal(projected.label, 'kiran', 'the tombstone still attributes to its author');
});

test('projectComment: the day anchor is omitted entirely when absent', () => {
  const projected = projectComment(comment(), 'me', 'kiran');
  assert.equal('day' in projected, false);
});

test('emailLabel: local part, with a safe fallback', () => {
  assert.equal(emailLabel('kiran@example.com'), 'kiran');
  assert.equal(emailLabel(''), 'Traveler');
  assert.equal(emailLabel(null), 'Traveler');
  assert.equal(emailLabel(undefined), 'Traveler');
});

test('dayCountsFrom: maps aggregation rows and skips empties', () => {
  const counts = dayCountsFrom([
    { _id: 1, count: 2 },
    { _id: 3, count: 5 },
  ]);
  assert.deepEqual(counts, { '1': 2, '3': 5 });
  assert.deepEqual(dayCountsFrom([]), {});
});
