import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  ensureCreatorMembership,
  roleOf,
  type TripMembershipShape,
} from './access.js';

const OWNER = '666f6f6f6f6f6f6f6f6f6f6f';
const OTHER = '777777777777777777777777';

const creation = (overrides: TripMembershipShape = {}): TripMembershipShape => ({
  isNew: true,
  userId: OWNER,
  members: [],
  ...overrides,
});

test('ensureCreatorMembership(): a new trip gets its creator as owner', () => {
  const trip = creation();

  assert.equal(ensureCreatorMembership(trip), true);
  assert.equal(trip.members?.length, 1);
  assert.equal(String(trip.members?.[0]?.userId), OWNER);
  assert.equal(trip.members?.[0]?.role, 'owner');
  assert.ok(trip.members?.[0]?.joinedAt instanceof Date);
});

test('ensureCreatorMembership(): seeding is idempotent', () => {
  const trip = creation();

  assert.equal(ensureCreatorMembership(trip), true);
  assert.equal(ensureCreatorMembership(trip), false);
  assert.equal(trip.members?.length, 1);
});

test('ensureCreatorMembership(): existing members are preserved', () => {
  const trip = creation({
    members: [{ userId: OTHER, role: 'editor', joinedAt: new Date() }],
  });

  assert.equal(ensureCreatorMembership(trip), true);
  assert.equal(trip.members?.length, 2);
  assert.equal(String(trip.members?.[0]?.userId), OWNER);
  assert.equal(trip.members?.[0]?.role, 'owner');
  assert.equal(String(trip.members?.[1]?.userId), OTHER);
  assert.equal(trip.members?.[1]?.role, 'editor');
});

test('ensureCreatorMembership(): a weaker creator row is promoted, not duplicated', () => {
  const trip = creation({
    members: [{ userId: OWNER, role: 'viewer', joinedAt: new Date() }],
  });

  assert.equal(ensureCreatorMembership(trip), true);
  assert.equal(trip.members?.length, 1);
  assert.equal(trip.members?.[0]?.role, 'owner');
});

test('ensureCreatorMembership(): existing trips are never mutated', () => {
  // Saving a trip after an ownership transfer or a leave must not resurrect
  // the original creator's row.
  const trip: TripMembershipShape = {
    isNew: false,
    userId: OWNER,
    members: [{ userId: OTHER, role: 'owner', joinedAt: new Date() }],
  };

  assert.equal(ensureCreatorMembership(trip), false);
  assert.equal(trip.members?.length, 1);
  assert.equal(String(trip.members?.[0]?.userId), OTHER);
  assert.equal(trip.members?.[0]?.role, 'owner');
});

test('ensureCreatorMembership(): a document without a creator is untouched', () => {
  const trip: TripMembershipShape = { isNew: true, members: [] };

  assert.equal(ensureCreatorMembership(trip), false);
  assert.equal(trip.members?.length, 0);
});

test('ensureCreatorMembership(): roleOf() accepts the seeded owner', () => {
  const trip = creation();
  ensureCreatorMembership(trip);

  assert.equal(roleOf(trip, OWNER), 'owner');
  assert.equal(roleOf(trip, OTHER), null);
});

// ---------------------------------------------------------------------------
// Wiring test: prove the Mongoose hook (not just the helper) enforces the
// invariant. The model imports `config/env`, which exits on missing required
// keys, so default the three required values before the dynamic import.
// validate() runs pre('validate') without opening a database connection
// (validateSync() deliberately skips hooks).
// ---------------------------------------------------------------------------

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/travelai-membership-test';
process.env.JWT_SECRET ??= 'membership-test-secret';
process.env.GEMINI_API_KEY ??= 'membership-test-key';

const { default: Trip } = await import('../../models/Trip.js');

const newTrip = (overrides: Record<string, unknown> = {}) =>
  new Trip({
    userId: new Types.ObjectId(),
    title: 'Membership regression',
    status: 'planned',
    tripDetails: {},
    ...overrides,
  });

test('Trip validation seeds the creator as owner on every new document', async () => {
  const trip = newTrip();

  await trip.validate();
  assert.equal(trip.members.length, 1);
  assert.equal(String(trip.members[0].userId), String(trip.userId));
  assert.equal(trip.members[0].role, 'owner');
  assert.ok(trip.members[0].joinedAt instanceof Date);
});

test('Trip validation prepends the creator without dropping existing members', async () => {
  const existingMember = new Types.ObjectId();
  const trip = newTrip({
    members: [{ userId: existingMember, role: 'editor', joinedAt: new Date() }],
  });

  await trip.validate();
  assert.equal(trip.members.length, 2);
  assert.equal(String(trip.members[0].userId), String(trip.userId));
  assert.equal(trip.members[0].role, 'owner');
  assert.equal(String(trip.members[1].userId), String(existingMember));
});

test('Trip validation repairs a creator that was supplied with a weaker role', async () => {
  const trip = newTrip({
    members: [{ userId: new Types.ObjectId(), role: 'owner', joinedAt: new Date() }],
  });
  trip.members[0].userId = trip.userId;
  trip.members[0].role = 'viewer';
  trip.members[0].joinedAt = new Date();

  await trip.validate();
  assert.equal(trip.members.length, 1);
  assert.equal(trip.members[0].role, 'owner');
});
