import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteAccountMismatch, resetLinkFailureState } from './authRecovery';

/**
 * C-08 recovery decisions. The pages render "expired" only on an authoritative
 * 400; a network failure offers retry instead. Invite binding is compared
 * case-insensitively because the server lowercases stored addresses.
 */

test('an authoritative 400 rejects the link before the form', () => {
  assert.equal(resetLinkFailureState(400), 'invalid');
});

test('a missing status, network failure or server error keeps the retry path', () => {
  assert.equal(resetLinkFailureState(undefined), 'retry');
  assert.equal(resetLinkFailureState(0), 'retry');
  assert.equal(resetLinkFailureState(429), 'retry');
  assert.equal(resetLinkFailureState(500), 'retry');
  assert.equal(resetLinkFailureState(503), 'retry');
});

test('a different signed-in account is a mismatch', () => {
  assert.equal(inviteAccountMismatch('meera@example.com', 'arjun@example.com'), true);
});

test('the same address matches regardless of case or surrounding space', () => {
  assert.equal(inviteAccountMismatch(' Meera@Example.com ', 'meera@example.com'), false);
  assert.equal(inviteAccountMismatch('meera@example.com', 'MEERA@EXAMPLE.COM'), false);
});

test('open link invites and a missing viewer email are never a mismatch', () => {
  assert.equal(inviteAccountMismatch(undefined, 'meera@example.com'), false);
  assert.equal(inviteAccountMismatch(null, 'meera@example.com'), false);
  assert.equal(inviteAccountMismatch('meera@example.com', undefined), false);
  assert.equal(inviteAccountMismatch('meera@example.com', null), false);
  assert.equal(inviteAccountMismatch('', 'meera@example.com'), false);
});
