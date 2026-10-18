import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPublicTrip } from './publicTrip.js';

/**
 * F14 (E5) — the public share payload is an exact allow-list, not a filter
 * over the full document. Nobody "adds a field for convenience" here without
 * this test forcing the decision: a new key must be added to the expected list
 * (and reviewed), otherwise the contract fails at unit-test time.
 */
const EXPECTED_PUBLIC_KEYS = ['_id', 'title', 'status', 'tripDetails', 'customRoutes', 'createdAt'];

test('the public projection exposes exactly the allowed keys (F14 allow-list)', () => {
  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Wayanad Wander',
    status: 'planned',
    tripDetails: { trip_title: 'Wayanad Wander' },
    customRoutes: [{ name: 'route' }],
    createdAt: new Date(),
  });

  assert.deepEqual(Object.keys(projection).sort(), [...EXPECTED_PUBLIC_KEYS].sort());
});

test('the public projection leaks nothing sensitive (F14 exhaustive sweep)', () => {
  // A maximal trip — every key we might accidentally publish — goes in, and
  // only the allow-list comes out.
  const maximalTrip: Record<string, unknown> = {
    ...EXPECTED_PUBLIC_KEYS.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = key === 'customRoutes' ? [] : `allowed:${key}`;
      return acc;
    }, {}),
    // Session/payment/ownership fields that exist on real documents:
    shareId: 'deadbeefdeadbeef',
    isPublic: true,
    userId: 'ownerid',
    members: [{ userId: 'u', role: 'owner', joinedAt: new Date() }],
    participants: [{ name: 'someone', isMe: true }],
    expenses: [{ title: 'hotel', amount: 100 }],
    finance: { baseCurrency: 'INR' },
    generationMeta: { provider: 'x', costUsd: 0.42 },
    versions: [{ version: 1, tripDetails: {} }],
    feedback: { rating: 'up' },
    isDeleted: false,
    hasEdited: true,
  };

  const projection = projectPublicTrip(maximalTrip as any);
  for (const leaked of [
    'shareId',
    'isPublic',
    'userId',
    'members',
    'participants',
    'expenses',
    'finance',
    'generationMeta',
    'versions',
    'feedback',
    'isDeleted',
    'hasEdited',
  ]) {
    assert.equal(leaked in projection, false, `public payload must not carry ${leaked}`);
  }
});

test('customRoutes defaults to an empty array (drafts drawn nothing yet)', () => {
  const projection = projectPublicTrip({
    _id: 'tripid',
    title: 'Early Draft',
    status: 'draft',
    tripDetails: {},
    createdAt: new Date(),
  });
  assert.deepEqual(projection.customRoutes, []);
});
