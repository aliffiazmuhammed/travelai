import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_INHERITED,
  ROLE_RANK,
  TRIP_CAPABILITIES,
  TRIP_ROLES,
  can,
  roleCan,
  roleOf,
} from './access.js';

const OWNER = '666f6f6f6f6f6f6f6f6f6f6f';
const OTHER = '777777777777777777777777';

const tripOf = (overrides: Record<string, unknown> = {}) => ({
  userId: OWNER,
  members: [],
  ...overrides,
});

test('roles are ranked in the documented order', () => {
  assert.ok(ROLE_RANK.viewer < ROLE_RANK.commenter);
  assert.ok(ROLE_RANK.commenter < ROLE_RANK.editor);
  assert.ok(ROLE_RANK.editor < ROLE_RANK.owner);
  assert.deepEqual(TRIP_ROLES, ['owner', 'editor', 'commenter', 'viewer']);
});

test('can(): higher ranks satisfy lower minimums', () => {
  for (const role of TRIP_ROLES) {
    assert.equal(can(role, 'viewer'), true, `${role} can view`);
  }
  assert.equal(can('viewer', 'editor'), false);
  assert.equal(can('editor', 'editor'), true);
  assert.equal(can('editor', 'owner'), false);
  assert.equal(can('owner', 'owner'), true);
});

test('can(): anonymous users never pass, even for viewer', () => {
  assert.equal(can(null, 'viewer'), false);
  assert.equal(can(null, 'owner'), false);
});

test('roleCan() matches the permission matrix (§1.3)', () => {
  // Viewers: read-only everywhere
  assert.equal(roleCan('viewer', 'view'), true);
  assert.equal(roleCan('viewer', 'viewFinances'), true);
  assert.equal(roleCan('viewer', 'editItinerary'), false);
  assert.equal(roleCan('viewer', 'editExpenses'), false);

  // Editors: may co-plan, may not administrate
  assert.equal(roleCan('editor', 'editItinerary'), true);
  assert.equal(roleCan('editor', 'editExpenses'), true);
  assert.equal(roleCan('editor', 'restoreVersion'), true);
  assert.equal(roleCan('editor', 'useAiTools'), true);
  assert.equal(roleCan('editor', 'manageTripSettings'), false);
  assert.equal(roleCan('editor', 'deleteTrip'), false);
  assert.equal(roleCan('editor', 'manageSharing'), false);
  assert.equal(roleCan('editor', 'manageMembers'), false);

  // Owner: everything
  for (const capability of Object.keys(TRIP_CAPABILITIES)) {
    assert.equal(roleCan('owner', capability as any), true, `owner can ${capability}`);
  }
});

test('declared inheritance is consistent with rank arithmetic', () => {
  for (const role of TRIP_ROLES) {
    for (const inherited of ROLE_INHERITED[role]) {
      assert.ok(ROLE_RANK[role] > ROLE_RANK[inherited], `${role} inherits ${inherited}`);
    }
  }
});

test('roleOf(): the creator is owner through the backfill fallback', () => {
  assert.equal(roleOf(tripOf(), OWNER), 'owner');
});

test('roleOf(): membership wins over the creator fallback', () => {
  const trip = tripOf({ members: [{ userId: OTHER, role: 'viewer' }] });
  assert.equal(roleOf(trip, OTHER), 'viewer');
  assert.equal(roleOf(trip, OWNER), 'owner');
});

test('roleOf(): a demoted creator keeps only the member role (§1.3)', () => {
  // Ownership transfer is done by changing BOTH: userId stays the audit trail,
  // so a transferred trip marks the original as a member.
  const transferred = tripOf({ members: [{ userId: OWNER, role: 'viewer' }] });
  assert.equal(roleOf(transferred, OWNER), 'viewer');
});

test('roleOf(): strangers and expected-noise return null', () => {
  const trip = tripOf({ members: [{ userId: OTHER, role: 'editor' }] });
  assert.equal(roleOf(trip, '888888888888888888888888'), null);
  assert.equal(roleOf(undefined, OWNER), null);
  assert.equal(roleOf(tripOf(), undefined), null);
});

test('roleOf(): a member entry with an unknown role grants nothing', () => {
  const corrupt = tripOf({ members: [{ userId: OTHER, role: 'grand-wizard' }] });
  assert.equal(roleOf(corrupt, OTHER), null);
});

test('roleOf(): string vs ObjectId ids compare by value', () => {
  const trip = tripOf({ members: [{ userId: { toString: () => OTHER }, role: 'editor' }] });
  assert.equal(roleOf(trip, OTHER), 'editor');
});
