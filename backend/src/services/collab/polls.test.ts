import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  assertChoiceShape,
  assertPollCap,
  assertPollManagement,
  assertPollOpen,
  pollBodyFrom,
  projectPoll,
  upsertVote,
} from './polls.js';
import { createPollSchema, votePollSchema } from '../../schemas/polls.schema.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Pure-rule tests for polls (F13a). The server cannot read a poll or a vote, so
 * what is worth testing is exactly what it CAN enforce: size/shape walls, the
 * one-vote-per-member rule, close/remove rights, and the projection contract
 * (ids in, labels out, tombstones emptied). The DB paths ride `smoke-f13.mts`.
 */

const CIPHERTEXT = 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA'; // iv(16).ct — the client's shape

test('assertPollCap: below-limit passes, at-limit is a 409', () => {
  assert.doesNotThrow(() => assertPollCap(0));
  assert.throws(
    () => assertPollCap(Number.MAX_SAFE_INTEGER),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('assertChoiceShape: only a sealed index passes', () => {
  assert.equal(assertChoiceShape(`  ${CIPHERTEXT}  `), CIPHERTEXT);
  // A plaintext index is exactly what the server must never accept.
  assert.throws(
    () => assertChoiceShape('1'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  assert.throws(
    () => assertChoiceShape('x'.repeat(401)),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  assert.throws(
    () => assertChoiceShape(undefined),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('pollBodyFrom: trims, requires an iv, and bounds the payload', () => {
  assert.equal(pollBodyFrom(`  ${CIPHERTEXT}  `), CIPHERTEXT);
  assert.throws(
    () => pollBodyFrom('plain question?'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  assert.throws(
    () => pollBodyFrom(''),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  assert.throws(
    () => pollBodyFrom(`AAAA.${'x'.repeat(5000)}`),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('assertPollOpen: removed/missing is a 404, closed is a 409', () => {
  assert.doesNotThrow(() => assertPollOpen({}));
  assert.throws(
    () => assertPollOpen(null),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
  assert.throws(
    () => assertPollOpen({ deletedAt: new Date() }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
  assert.throws(
    () => assertPollOpen({ closedAt: new Date() }),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('assertPollManagement: creator or owner, never a bystander', () => {
  const creator = new Types.ObjectId().toString();
  const bystander = new Types.ObjectId().toString();
  const row = { createdBy: creator };
  assert.doesNotThrow(() => assertPollManagement(row, creator, 'commenter'));
  assert.doesNotThrow(() => assertPollManagement(row, bystander, 'owner'));
  assert.throws(
    () => assertPollManagement(row, bystander, 'editor'),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  );
  assert.throws(
    () => assertPollManagement(null, creator, 'owner'),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});

test('upsertVote: one vote per member; changing replaces, repeating is a no-op', () => {
  const anna = new Types.ObjectId().toString();
  const ben = new Types.ObjectId().toString();
  const at = new Date('2026-10-20T10:00:00.000Z');

  const first = upsertVote([], anna, 'sealed-0', at);
  assert.equal(first.changed, true);
  assert.equal(first.votes.length, 1);

  const second = upsertVote(first.votes, anna, 'sealed-1', at);
  assert.equal(second.changed, true);
  assert.equal(second.votes.length, 1, 'a change must not add a second row');
  assert.equal(second.votes[0].choice, 'sealed-1');

  const repeat = upsertVote(second.votes, anna, 'sealed-1', at);
  assert.equal(repeat.changed, false, 'same choice must not trigger a save/broadcast');

  const both = upsertVote(repeat.votes, ben, 'sealed-0', at);
  assert.equal(both.votes.length, 2, 'a different member adds a row');
  assert.equal(both.votes.filter((vote) => String(vote.userId) === anna).length, 1);
});

test('projectPoll: payload + votes out, isYou per viewer, tombstone emptied', () => {
  const creator = new Types.ObjectId();
  const voter = new Types.ObjectId();
  const row = {
    _id: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    createdBy: creator,
    body: CIPHERTEXT,
    e2ee: true,
    votes: [{ userId: voter, choice: 'sealed-1', at: new Date() }],
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
  };
  const labels = new Map([
    [String(creator), 'anna'],
    [String(voter), 'ben'],
  ]);

  const mine = projectPoll(row, String(creator), labels);
  assert.equal(mine.isYou, true);
  assert.equal(mine.body, CIPHERTEXT, 'the sealed payload travels verbatim');
  assert.equal(mine.votes.length, 1);
  assert.equal(mine.votes[0].label, 'ben');
  assert.equal(mine.votes[0].choice, 'sealed-1');
  assert.equal(mine.votes[0].userId, String(voter), 'ids travel so isYou survives a frame');
  assert.equal(projectPoll(row, String(voter), labels).isYou, false);

  const closed = projectPoll({ ...row, closedAt: new Date() }, String(creator), labels);
  assert.ok(closed.closedAt, 'a closed poll keeps its tally');

  const removed = projectPoll({ ...row, deletedAt: new Date() }, String(creator), labels);
  assert.equal(removed.body, '');
  assert.deepEqual(removed.votes, [], 'a removed poll leaks no votes');
});

test('poll schemas: a sealed payload is required, a plaintext index is not a vote', () => {
  assert.equal(createPollSchema.safeParse({ body: CIPHERTEXT }).success, true);
  assert.equal(createPollSchema.safeParse({ body: 'Who pays?' }).success, false);
  assert.equal(createPollSchema.safeParse({ body: '   ' }).success, false);
  assert.equal(votePollSchema.safeParse({ choice: CIPHERTEXT }).success, true);
  assert.equal(votePollSchema.safeParse({ choice: '' }).success, false);
  assert.equal(votePollSchema.safeParse({}).success, false);
});
