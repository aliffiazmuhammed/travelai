import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
  passwordStrength,
} from './passwordPolicy';

/**
 * Client-side mirror of the Phase 2 password rules. The server re-checks
 * everything; these tests keep the instant feedback and the submit guard in
 * step with the backend policy.
 */

test('the client mirror uses the shared 8–64 floor and passphrase copy', () => {
  assert.equal(DEFAULT_PASSWORD_POLICY.minLength, 8);
  assert.equal(DEFAULT_PASSWORD_POLICY.maxLength, 64);
  assert.match(DEFAULT_PASSWORD_POLICY.requirements, /passphrases/);
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

test('the 64-character and 72-byte boundaries are enforced', () => {
  assert.match(String(passwordProblem('a'.repeat(65))), /64 characters or fewer/);
  assert.equal(passwordProblem('a'.repeat(64)), null);
  const wide = 'é'.repeat(37);
  assert.ok(wide.length < 64);
  assert.match(String(passwordProblem(wide)), /too long/);
});

test('common passwords and the account identity are rejected', () => {
  assert.match(String(passwordProblem('password123')), /too easy to guess/);
  const context = { email: 'meera.nair@example.com', name: 'Meera Nair' };
  assert.match(String(passwordProblem('meera.nair@example.com', DEFAULT_PASSWORD_POLICY, context)), /email address/);
  assert.match(String(passwordProblem('meera.nair', DEFAULT_PASSWORD_POLICY, context)), /email address/);
  assert.match(String(passwordProblem('Meera Nair', DEFAULT_PASSWORD_POLICY, context)), /not your name/);
});

test('strength always returns a text label, never colour alone', () => {
  assert.equal(passwordStrength(''), null);
  assert.equal(passwordStrength('short')?.label, 'Too weak');
  assert.equal(passwordStrength('abcdefgh')?.label, 'Good');
  assert.equal(passwordStrength('abcdefghijkl')?.label, 'Strong');
  assert.equal(passwordStrength('abcdefghijklmnop')?.label, 'Very strong');
  assert.equal(passwordStrength('a slow morning in Lisbon')?.label, 'Strong passphrase');
});
