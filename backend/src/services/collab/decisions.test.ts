import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  assertDecisionCap,
  assertDecisionPromotion,
  assertDecisionRemoval,
  decisionBodyFrom,
  inferDecisionE2ee,
  projectDecision,
} from './decisions.js';
import { AppError } from '../../utils/AppError.js';
import TripDecision from '../../models/TripDecision.js';

/**
 * Pure-rule tests for decisions (F9). The snapshot semantics, the promoter
 * eligibility (author-or-owner), the unmark eligibility (promoter-or-owner),
 * the cap, the body clamp, and the projection shape — the DB paths ride the
 * live `smoke-f9.mts` run.
 */

test('assertDecisionPromotion: the comment author may promote their own remark', () => {
  const userId = new Types.ObjectId().toString();
  assert.doesNotThrow(() =>
    assertDecisionPromotion({ userId }, userId, 'viewer')
  );
});

test("assertDecisionPromotion: the owner may promote anyone else's remark", () => {
  const author = new Types.ObjectId().toString();
  const owner = new Types.ObjectId().toString();
  assert.doesNotThrow(() =>
    assertDecisionPromotion({ userId: author }, owner, 'owner')
  );
});

test('assertDecisionPromotion: a non-author non-owner is a 403', () => {
  const author = new Types.ObjectId().toString();
  const promoter = new Types.ObjectId().toString();
  assert.throws(
    () => assertDecisionPromotion({ userId: author }, promoter, 'commenter'),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  );
});

test('assertDecisionPromotion: a tombstoned comment cannot be decided (409)', () => {
  const userId = new Types.ObjectId().toString();
  assert.throws(
    () => assertDecisionPromotion({ userId, deletedAt: new Date() }, userId, 'owner'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('assertDecisionPromotion: a missing comment is a 404, not a leak', () => {
  const userId = new Types.ObjectId().toString();
  assert.throws(
    () => assertDecisionPromotion(null, userId, 'owner'),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});

test('assertDecisionRemoval: promoter or owner; never a bystander', () => {
  const promoter = new Types.ObjectId().toString();
  const bystander = new Types.ObjectId().toString();
  const row = { createdBy: promoter };
  assert.doesNotThrow(() => assertDecisionRemoval(row, promoter, 'viewer'));
  assert.doesNotThrow(() => assertDecisionRemoval(row, bystander, 'owner'));
  assert.throws(
    () => assertDecisionRemoval(row, bystander, 'editor'),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  );
  assert.throws(
    () => assertDecisionRemoval(null, promoter, 'owner'),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});

test('assertDecisionCap: below-limit passes, at-limit is a 409', () => {
  assert.doesNotThrow(() => assertDecisionCap(0));
  assert.throws(
    () => assertDecisionCap(Number.MAX_SAFE_INTEGER),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('decisionBodyFrom: trims and clamps to the comment body cap', () => {
  assert.equal(decisionBodyFrom('  pinned '), 'pinned');
  const fat = 'x'.repeat(5000);
  assert.ok(decisionBodyFrom(fat).length <= 2000);
  assert.equal(decisionBodyFrom(undefined), '');
});

test('projectDecision: snapshot projection — labels in, ids out, isYou by promoter', () => {
  const promoter = new Types.ObjectId().toString();
  const someoneElse = new Types.ObjectId().toString();
  const row = {
    _id: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    commentId: new Types.ObjectId(),
    createdBy: promoter,
    body: 'take the morning train',
    day: 2,
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
  };
  const mine = projectDecision(row, promoter, 'kiran', 'kiran') as any;
  assert.equal(mine.label, 'kiran');
  assert.equal(mine.markedByLabel, 'kiran');
  assert.equal(mine.body, 'take the morning train');
  assert.equal(mine.day, 2);
  assert.equal(mine.isYou, true);
  assert.ok(!('userId' in mine) && !('createdBy' in mine));

  const theirs = projectDecision(row, someoneElse, 'kiran', 'kiran') as any;
  assert.equal(theirs.isYou, false);
});

test('projectDecision: a tombstone keeps its slot but loses the body', () => {
  const promoter = new Types.ObjectId().toString();
  const row = {
    _id: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    commentId: new Types.ObjectId(),
    createdBy: promoter,
    body: 'gone',
    createdAt: new Date(),
    deletedAt: new Date(),
  };
  const projected = projectDecision(row, promoter, 'a', 'b') as any;
  assert.equal(projected.body, '');
  assert.ok(projected.deletedAt);
  assert.ok(!('day' in projected));
});

test('projectDecision: an encrypted snapshot keeps its flag; a tombstone does not', () => {
  const promoter = new Types.ObjectId().toString();
  const row = {
    _id: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    commentId: new Types.ObjectId(),
    createdBy: promoter,
    body: 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA',
    e2ee: true,
    createdAt: new Date(),
  };
  assert.equal((projectDecision(row, promoter, 'a', 'b') as any).e2ee, true);
  assert.equal(
    (projectDecision({ ...row, deletedAt: new Date() }, promoter, 'a', 'b') as any).e2ee,
    undefined
  );
});

test('inferDecisionE2ee: both signals must agree before an old row is re-labelled', () => {
  const ciphertext = 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA';
  // The pair the repair is for: an encrypted comment promoted before the flag existed.
  assert.equal(inferDecisionE2ee(ciphertext, true), true);
  // A plaintext remark may contain a dot — the body alone never decides.
  assert.equal(inferDecisionE2ee('meet at 9.30', true), false);
  assert.equal(inferDecisionE2ee(ciphertext, false), false);
  assert.equal(inferDecisionE2ee(ciphertext, undefined), false);
  assert.equal(inferDecisionE2ee('', true), false);
  // The empty ciphertext is not a shape the client ever writes.
  assert.equal(inferDecisionE2ee('AAAAAAAAAAAAAAAA.', true), false);
});

test('TripDecision schema persists the e2ee flag (strict mode must not drop it)', () => {
  const base = {
    tripId: new Types.ObjectId(),
    commentId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    createdBy: new Types.ObjectId(),
  };
  const encrypted = new TripDecision({ ...base, body: 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA', e2ee: true });
  assert.equal((encrypted.toObject() as any).e2ee, true);

  // Legacy/plaintext shape: absent, not false — the repair scan keys on this.
  const plain = new TripDecision({ ...base, body: 'take the morning train' });
  assert.ok(!('e2ee' in (plain.toObject() as any)));
});
