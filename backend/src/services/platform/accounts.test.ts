import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStatusChangeAllowed,
  generateTemporaryPassword,
} from './accounts.js';

/**
 * PA2 account-management policy. These are the rules the platform console must
 * never be able to talk itself into breaking: no self-disable and never zero
 * active super-admins. Everything else is ordinary status bookkeeping.
 */

test('personal and agency accounts have no platform last-admin restriction', () => {
  for (const accountType of ['personal', 'agency'] as const) {
    assert.doesNotThrow(() =>
      assertStatusChangeAllowed({
        accountType,
        accountId: 'account-1',
        actorId: 'admin-1',
        nextStatus: 'disabled',
        activePlatformAdmins: 1,
      })
    );
  }
});

test('a platform admin cannot disable their own account', () => {
  assert.throws(
    () =>
      assertStatusChangeAllowed({
        accountType: 'platform',
        accountId: 'admin-1',
        actorId: 'admin-1',
        nextStatus: 'disabled',
        activePlatformAdmins: 5,
      }),
    (error: any) => error.statusCode === 400
  );
});

test('the last active platform super-admin cannot be disabled', () => {
  assert.throws(
    () =>
      assertStatusChangeAllowed({
        accountType: 'platform',
        accountId: 'admin-2',
        actorId: 'admin-1',
        nextStatus: 'disabled',
        activePlatformAdmins: 1,
      }),
    (error: any) => error.statusCode === 409
  );
});

test('disabling one of several admins and enabling anyone is allowed', () => {
  assert.doesNotThrow(() =>
    assertStatusChangeAllowed({
      accountType: 'platform',
      accountId: 'admin-2',
      actorId: 'admin-1',
      nextStatus: 'disabled',
      activePlatformAdmins: 2,
    })
  );
  assert.doesNotThrow(() =>
    assertStatusChangeAllowed({
      accountType: 'platform',
      accountId: 'admin-1',
      actorId: 'admin-1',
      nextStatus: 'active',
      activePlatformAdmins: 1,
    })
  );
});

test('temporary passwords are unique, prefixed and long enough', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();

  assert.match(first, /^Tv![A-Za-z0-9_-]{20,}$/);
  assert.equal(first.length >= 23, true);
  assert.notEqual(first, second);
});
