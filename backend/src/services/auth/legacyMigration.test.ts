import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findAgencyMembershipViolations,
  findDuplicateMembershipUserIds,
  legacyUserBackfill,
  type LegacyMembershipRow,
  type LegacyUserRow,
} from './legacyMigration.js';

/**
 * PA0 migration fixtures. These run without MongoDB: the script's decisions
 * (what to backfill, which memberships block the unique index) are pure, so a
 * bad fixture fails here before anyone touches a database.
 */

const PERSONAL = 'p1';
const AGENCY_A = 'a1';
const AGENCY_B = 'a2';
const ACCOUNT_IN_A = 'u1';
const ACCOUNT_IN_B = 'u2';

function legacyFixture() {
  const users: LegacyUserRow[] = [
    { _id: PERSONAL, email: 'owner@example.com' },
    { _id: ACCOUNT_IN_A, email: 'owner@example.com', accountType: 'agency', agencyId: AGENCY_A },
    { _id: ACCOUNT_IN_B, email: 'owner@example.com', accountType: 'agency', agencyId: AGENCY_B },
  ];
  const memberships: LegacyMembershipRow[] = [
    { _id: 'm1', userId: PERSONAL, agencyId: AGENCY_A },
    { _id: 'm2', userId: ACCOUNT_IN_A, agencyId: AGENCY_A },
    { _id: 'm3', userId: ACCOUNT_IN_B, agencyId: AGENCY_B },
  ];
  return { users, memberships };
}

test('legacy users are backfilled as active personal accounts', () => {
  assert.deepEqual(legacyUserBackfill({ _id: 'u1' }), {
    accountType: 'personal',
    status: 'active',
    mustChangePassword: false,
    tokenVersion: 0,
  });
});

test('the backfill never overwrites an existing realm or status', () => {
  assert.deepEqual(
    legacyUserBackfill({
      _id: 'u1',
      accountType: 'agency',
      agencyId: AGENCY_A,
      status: 'disabled',
      mustChangePassword: true,
      tokenVersion: 3,
    }),
    {}
  );
});

test('a personal account referenced by agency membership is rejected', () => {
  const { users, memberships } = legacyFixture();
  const violations = findAgencyMembershipViolations(memberships, users);

  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    membershipId: 'm1',
    userId: PERSONAL,
    agencyId: AGENCY_A,
    reason: 'personal_account',
  });
});

test('the fixture passes once legacy personal memberships are removed', () => {
  const { users, memberships } = legacyFixture();
  const remaining = memberships.filter((row) => row.userId !== PERSONAL);

  assert.deepEqual(findAgencyMembershipViolations(remaining, users), []);
  assert.deepEqual(findDuplicateMembershipUserIds(remaining), []);
});

test('platform, missing and cross-tenant accounts are violations too', () => {
  const users: LegacyUserRow[] = [
    { _id: 'platform-1', accountType: 'platform' },
    { _id: ACCOUNT_IN_A, accountType: 'agency', agencyId: AGENCY_A },
  ];
  const memberships: LegacyMembershipRow[] = [
    { _id: 'm1', userId: 'platform-1', agencyId: AGENCY_A },
    { _id: 'm2', userId: 'missing', agencyId: AGENCY_A },
    { _id: 'm3', userId: ACCOUNT_IN_A, agencyId: AGENCY_B },
  ];

  const reasons = findAgencyMembershipViolations(memberships, users).map(
    (violation) => violation.reason
  );
  assert.deepEqual(reasons, ['platform_account', 'missing_account', 'tenant_mismatch']);
});

test('one agency account in two memberships is detected', () => {
  assert.deepEqual(
    findDuplicateMembershipUserIds([
      { _id: 'm1', userId: ACCOUNT_IN_A, agencyId: AGENCY_A },
      { _id: 'm2', userId: ACCOUNT_IN_A, agencyId: AGENCY_B },
      { _id: 'm3', userId: ACCOUNT_IN_B, agencyId: AGENCY_B },
    ]),
    [ACCOUNT_IN_A]
  );
});
