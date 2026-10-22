import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../utils/AppError.js';
import { createAgencyInviteSchema, changeAgencyMemberRoleSchema } from '../../schemas/agency.schema.js';
import {
  agencyCan,
  assertAgencyMemberRemoval,
  assertAgencyRoleChange,
  decideAgencyAccess,
  ownerCount,
  AGENCY_ROLE_RANK,
} from './access.js';

function members() {
  return [
    { userId: 'owner-1', role: 'owner' },
    { userId: 'owner-2', role: 'owner' },
    { userId: 'admin-1', role: 'admin' },
    { userId: 'planner-1', role: 'planner' },
    { userId: 'viewer-1', role: 'viewer' },
  ] as any[];
}

function expectStatus(fn: () => void, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

test('agency roles are ranked and inherit lower capabilities', () => {
  assert.ok(AGENCY_ROLE_RANK.owner > AGENCY_ROLE_RANK.admin);
  assert.ok(AGENCY_ROLE_RANK.admin > AGENCY_ROLE_RANK.planner);
  assert.ok(AGENCY_ROLE_RANK.planner > AGENCY_ROLE_RANK.viewer);
  assert.equal(agencyCan('owner', 'admin'), true);
  assert.equal(agencyCan('admin', 'admin'), true);
  assert.equal(agencyCan('planner', 'admin'), false);
  assert.equal(agencyCan(null, 'viewer'), false);
});

test('no membership is indistinguishable from a missing agency', () => {
  assert.deepEqual(decideAgencyAccess(null, null, 'viewer'), { status: 404 });
  assert.deepEqual(decideAgencyAccess({ _id: 'a1' }, null, 'viewer'), { status: 404 });
  assert.deepEqual(
    decideAgencyAccess({ _id: 'a1' }, { userId: 'u1', role: 'wizard' }, 'viewer'),
    { status: 404 }
  );
});

test('known members below the required rank get 403, never 404', () => {
  assert.deepEqual(
    decideAgencyAccess({ _id: 'a1' }, { userId: 'u1', role: 'viewer' }, 'admin'),
    { status: 403, role: 'viewer' }
  );
  assert.deepEqual(
    decideAgencyAccess({ _id: 'a1' }, { userId: 'u1', role: 'admin' }, 'admin'),
    { status: 200, role: 'admin' }
  );
});

test('only an owner can grant ownership', () => {
  expectStatus(
    () => assertAgencyRoleChange(members(), 'admin-1', 'owner', 'admin'),
    403
  );
  assert.doesNotThrow(() =>
    assertAgencyRoleChange(members(), 'admin-1', 'owner', 'owner')
  );
});

test('the last owner can never be demoted', () => {
  const soleOwner = [{ userId: 'owner-1', role: 'owner' }] as any[];
  expectStatus(
    () => assertAgencyRoleChange(soleOwner, 'owner-1', 'admin', 'owner'),
    409
  );
  assert.doesNotThrow(() =>
    assertAgencyRoleChange(members(), 'owner-1', 'admin', 'owner')
  );
});

test('admins cannot demote an owner', () => {
  expectStatus(
    () => assertAgencyRoleChange(members(), 'owner-1', 'admin', 'admin'),
    403
  );
});

test('role changes target an existing member', () => {
  expectStatus(
    () => assertAgencyRoleChange(members(), 'ghost', 'viewer', 'owner'),
    404
  );
});

test('the last owner can never be removed', () => {
  const soleOwner = [{ userId: 'owner-1', role: 'owner' }] as any[];
  expectStatus(
    () => assertAgencyMemberRemoval(soleOwner, 'owner-1', 'owner'),
    409
  );
  assert.doesNotThrow(() =>
    assertAgencyMemberRemoval(members(), 'owner-1', 'owner')
  );
});

test('admins cannot remove an owner', () => {
  expectStatus(
    () => assertAgencyMemberRemoval(members(), 'owner-1', 'admin'),
    403
  );
  assert.doesNotThrow(() =>
    assertAgencyMemberRemoval(members(), 'viewer-1', 'admin')
  );
});

test('ownerCount ignores malformed rows', () => {
  assert.equal(
    ownerCount([
      { userId: 'a', role: 'owner' },
      { userId: 'b', role: 'admin' },
      { userId: 'c', role: 'owner' },
      { userId: 'd', role: 'wizard' },
    ] as any[]),
    2
  );
});

test('invitation schema can never grant ownership and needs an email target', () => {
  assert.equal(createAgencyInviteSchema.safeParse({ role: 'owner' }).success, false);
  assert.equal(createAgencyInviteSchema.safeParse({ role: 'planner' }).success, true);
  assert.equal(
    createAgencyInviteSchema.safeParse({ role: 'viewer', kind: 'email' }).success,
    false
  );
  assert.equal(
    createAgencyInviteSchema.safeParse({
      role: 'viewer',
      kind: 'email',
      email: 'A@b.co',
    }).success,
    true
  );
  assert.equal(
    createAgencyInviteSchema.safeParse({ role: 'viewer', maxUses: 40 }).success,
    false
  );
});

test('member PATCH schema accepts owner as an explicit promotion target', () => {
  assert.equal(changeAgencyMemberRoleSchema.safeParse({ role: 'owner' }).success, true);
  assert.equal(changeAgencyMemberRoleSchema.safeParse({ role: 'wizard' }).success, false);
});
