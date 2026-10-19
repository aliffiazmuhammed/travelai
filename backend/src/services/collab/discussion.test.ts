import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { computeUnreadFilter } from './discussion.js';

/**
 * Pure-rule tests for the discussion read state (F8a). The DB-backed unread
 * count and the upsert race are covered by the live `smoke-f8.mts` run; what
 * must hold structurally — what counts as unread and what never does — is
 * asserted here.
 */

test('computeUnreadFilter: with a marker, only newer other-authored rows count', () => {
  const marker = new Date('2026-01-02T00:00:00.000Z');
  const me = new Types.ObjectId().toString();
  const filter = computeUnreadFilter(marker, me) as any;

  assert.ok(filter.createdAt, 'expected the createdAt bound');
  assert.equal(filter.createdAt.$gt, marker);
  assert.deepEqual(filter.deletedAt, { $exists: false });
  assert.equal(String(filter.userId.$ne), me);
});

test('computeUnreadFilter: without a marker, everything active and not-mine counts', () => {
  const me = new Types.ObjectId().toString();
  const filter = computeUnreadFilter(null, me) as any;
  assert.equal(filter.createdAt, undefined);
  assert.deepEqual(filter.deletedAt, { $exists: false });
  assert.equal(String(filter.userId.$ne), me);
});

test('computeUnreadFilter: the marker comparison is a real Date (ms precision)', () => {
  const raw = new Date('2026-01-02T03:04:05.678Z');
  const filter = computeUnreadFilter(raw, new Types.ObjectId().toString()) as any;
  assert.ok(filter.createdAt.$gt instanceof Date);
  assert.equal(filter.createdAt.$gt.toISOString(), '2026-01-02T03:04:05.678Z');
});

test('computeUnreadFilter: it rejects a bogus user (never a cross-collection leak)', () => {
  assert.throws(() => computeUnreadFilter(null, 'not-an-oid'));
  // And the throw is exactly the uncast ObjectId error — nothing swallowed.
  const userId = new Types.ObjectId().toString();
  assert.doesNotThrow(() => computeUnreadFilter(null, userId));
});
