import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
  assertPasswordPolicy,
  passwordProblem,
} from './passwordPolicy.js';
import { resetPasswordSchema, signinSchema, signupSchema } from '../../schemas/auth.schema.js';
import { changePasswordSchema } from '../../schemas/profile.schema.js';

/**
 * Phase 2 password policy (AUTH-030/031/036).
 *
 * These are pure rules: the same module is used by schemas and services, so a
 * test here covers every credential-writing path. Sign-in is deliberately
 * outside the policy so accounts created before Phase 2 keep working.
 */

test('the shared policy is length-first and passphrase-friendly', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_MAX_LENGTH, 64);
  assert.match(PASSWORD_REQUIREMENTS, /at least 8 characters/);
  assert.match(PASSWORD_REQUIREMENTS, /passphrases/);
});

test('7 characters are rejected and 8 are accepted', () => {
  assert.match(String(passwordProblem('abcdefg')), /at least 8 characters/);
  assert.equal(passwordProblem('abcdefgh'), null);
});

test('spaces and long passphrases are accepted', () => {
  assert.equal(passwordProblem('correct horse battery staple'), null);
  assert.equal(passwordProblem('a slow morning in Lisbon'), null);
  assert.equal(passwordProblem('        '), 'Enter a password.');
});

test('a password over 64 characters or over bcrypt 72 bytes is rejected', () => {
  assert.match(String(passwordProblem('a'.repeat(65))), /64 characters or fewer/);
  assert.equal(passwordProblem('a'.repeat(64)), null);

  // 37 two-byte code points = 74 UTF-8 bytes, still under 64 characters.
  const wide = 'é'.repeat(37);
  assert.ok(wide.length < PASSWORD_MAX_LENGTH);
  assert.match(String(passwordProblem(wide)), /too long/);
  assert.ok(Buffer.byteLength(wide, 'utf8') > PASSWORD_MAX_BYTES);
});

test('common passwords and the account identity are rejected', () => {
  assert.match(String(passwordProblem('password123')), /too easy to guess/);
  assert.match(String(passwordProblem('PassWord123')), /too easy to guess/);

  const context = { email: 'Meera.Nair@Example.com', name: 'Meera Nair' };
  assert.match(String(passwordProblem('meera.nair@example.com', context)), /email address/);
  assert.match(String(passwordProblem('meera.nair', context)), /email address/);
  assert.match(String(passwordProblem('Meera Nair', context)), /not your name/);
  assert.equal(passwordProblem('a slow morning in Lisbon', context), null);
});

test('assertPasswordPolicy throws a 400 AppError with the same message', () => {
  assert.throws(
    () => assertPasswordPolicy('abcdefg'),
    (error: any) => error.statusCode === 400 && /at least 8 characters/.test(error.message)
  );
  assert.doesNotThrow(() => assertPasswordPolicy('correct horse battery staple'));
});

test('all credential schemas share the new floor', () => {
  const signup = { email: 'ada@example.com', password: 'abcdefgh' };
  assert.equal(signupSchema.safeParse(signup).success, true);
  assert.equal(signupSchema.safeParse({ ...signup, password: 'abcdefg' }).success, false);

  const reset = { token: 't'.repeat(24), password: 'abcdefgh' };
  assert.equal(resetPasswordSchema.safeParse(reset).success, true);
  assert.equal(resetPasswordSchema.safeParse({ ...reset, password: 'abcdefg' }).success, false);

  const change = { currentPassword: 'old-pass', newPassword: 'abcdefgh' };
  assert.equal(changePasswordSchema.safeParse(change).success, true);
  assert.equal(
    changePasswordSchema.safeParse({ ...change, newPassword: 'abcdefg' }).success,
    false
  );
});

test('sign-in still only requires a password so older accounts can get in', () => {
  const legacy = { email: 'ada@example.com', password: '123456' };
  assert.equal(signinSchema.safeParse(legacy).success, true);
  assert.equal(signinSchema.safeParse({ ...legacy, password: '' }).success, false);
});
