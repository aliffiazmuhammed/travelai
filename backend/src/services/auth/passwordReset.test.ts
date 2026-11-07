import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../../models/User.js';
import PasswordResetToken from '../../models/PasswordResetToken.js';
import { env } from '../../config/env.js';
import {
  PASSWORD_RESET_TTL_MINUTES,
  mintResetToken,
  resetLinkFor,
  resetPasswordWithToken,
  resetTokenHash,
  requestPersonalPasswordReset,
} from './passwordReset.js';

/**
 * P1 self-service reset.
 *
 * The tests pin the parts a person depends on: one hashed single-use token, a
 * generic answer for unknown addresses, and a claim that happens before the
 * password write so two requests can never both succeed. Models are stubbed;
 * no database or mail provider is touched.
 */

const INVALID_LINK = 'This reset link is invalid or has expired.';

const originals = {
  userFindOne: User.findOne,
  tokenCreate: PasswordResetToken.create,
  tokenDeleteMany: PasswordResetToken.deleteMany,
  tokenFindOne: PasswordResetToken.findOne,
  tokenFindOneAndUpdate: PasswordResetToken.findOneAndUpdate,
  emailEnabled: env.EMAIL_ENABLED,
  resendKey: env.RESEND_API_KEY,
};

test.before(() => {
  // Reset mail is fire-and-forget and stays dark when no provider is set.
  (env as any).EMAIL_ENABLED = false;
  (env as any).RESEND_API_KEY = undefined;
});

test.after(() => {
  (User as any).findOne = originals.userFindOne;
  (PasswordResetToken as any).create = originals.tokenCreate;
  (PasswordResetToken as any).deleteMany = originals.tokenDeleteMany;
  (PasswordResetToken as any).findOne = originals.tokenFindOne;
  (PasswordResetToken as any).findOneAndUpdate = originals.tokenFindOneAndUpdate;
  (env as any).EMAIL_ENABLED = originals.emailEnabled;
  (env as any).RESEND_API_KEY = originals.resendKey;
});

test('reset tokens are random, URL-safe and stored only as a hash', () => {
  const first = mintResetToken();
  const second = mintResetToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(resetTokenHash(first), /^[a-f0-9]{64}$/);
  assert.notEqual(resetTokenHash(first), first);
  assert.ok(resetLinkFor(first).endsWith(`/reset-password/${first}`));
});

test('an unknown address is a silent no-op', async () => {
  let writes = 0;
  (User as any).findOne = async () => null;
  (PasswordResetToken as any).deleteMany = async () => {
    writes += 1;
  };
  (PasswordResetToken as any).create = async () => {
    writes += 1;
  };

  await requestPersonalPasswordReset('  Nobody@Example.com ');

  assert.equal(writes, 0);
});

test('a personal account gets one fresh token that expires in an hour', async () => {
  const filters: any[] = [];
  let created: any = null;
  const userId = '64e000000000000000000f01';

  (User as any).findOne = async (filter: any) => {
    assert.deepEqual(filter, {
      email: 'meera@example.com',
      accountType: 'personal',
      status: 'active',
    });
    return { _id: userId, email: 'meera@example.com', name: 'Meera Nair' };
  };
  (PasswordResetToken as any).deleteMany = async (filter: any) => {
    filters.push(filter);
    return {};
  };
  (PasswordResetToken as any).create = async (payload: any) => {
    created = payload;
    return { _id: 'tok-new' };
  };

  const before = Date.now();
  await requestPersonalPasswordReset('Meera@Example.com');

  assert.deepEqual(filters[0], { userId, usedAt: null });
  assert.equal(created.userId, userId);
  assert.match(created.tokenHash, /^[a-f0-9]{64}$/);
  const ttl = created.expiresAt.getTime() - before;
  assert.ok(ttl > (PASSWORD_RESET_TTL_MINUTES - 1) * 60_000);
  assert.ok(ttl <= PASSWORD_RESET_TTL_MINUTES * 60_000 + 5_000);
});

test('a short new password never burns the link', async () => {
  let lookedUp = false;
  (PasswordResetToken as any).findOne = async () => {
    lookedUp = true;
    return null;
  };

  await assert.rejects(
    () => resetPasswordWithToken('a'.repeat(43), 'short'),
    (error: any) => error.statusCode === 400 && /at least 6 characters/.test(error.message)
  );
  assert.equal(lookedUp, false);
});

test('a used or expired token is rejected with the generic message', async () => {
  let captured: any = null;
  (PasswordResetToken as any).findOne = async (filter: any) => {
    captured = filter;
    return null;
  };

  const raw = mintResetToken();
  await assert.rejects(
    () => resetPasswordWithToken(raw, 'brand-new-secret'),
    (error: any) => error.statusCode === 400 && error.message === INVALID_LINK
  );

  assert.equal(captured.tokenHash, resetTokenHash(raw));
  assert.equal(captured.usedAt, null);
  assert.ok(captured.expiresAt.$gt instanceof Date);
});

test('a token that belongs to a closed account is rejected', async () => {
  let claimed = false;
  (PasswordResetToken as any).findOne = async () => ({ _id: 'tok-1', userId: 'u-closed' });
  (User as any).findOne = async () => null;
  (PasswordResetToken as any).findOneAndUpdate = async () => {
    claimed = true;
    return null;
  };

  await assert.rejects(
    () => resetPasswordWithToken(mintResetToken(), 'brand-new-secret'),
    (error: any) => error.statusCode === 400 && error.message === INVALID_LINK
  );
  assert.equal(claimed, false);
});

test('reusing the current password is refused before the token is claimed', async () => {
  const currentHash = await bcrypt.hash('current-secret', 4);
  let claimed = false;
  let saved = false;
  const user: any = {
    _id: 'u1',
    password: currentHash,
    tokenVersion: 2,
    mustChangePassword: true,
    save: async () => {
      saved = true;
    },
  };

  (PasswordResetToken as any).findOne = async () => ({ _id: 'tok-1', userId: 'u1' });
  (User as any).findOne = async () => user;
  (PasswordResetToken as any).findOneAndUpdate = async () => {
    claimed = true;
    return null;
  };

  await assert.rejects(
    () => resetPasswordWithToken(mintResetToken(), 'current-secret'),
    (error: any) => error.statusCode === 400 && /not used on this account/.test(error.message)
  );
  assert.equal(claimed, false);
  assert.equal(saved, false);
});

test('a lost claim race leaves the password untouched', async () => {
  const currentHash = await bcrypt.hash('current-secret', 4);
  let saved = false;
  const user: any = {
    _id: 'u1',
    password: currentHash,
    tokenVersion: 2,
    save: async () => {
      saved = true;
    },
  };

  (PasswordResetToken as any).findOne = async () => ({ _id: 'tok-1', userId: 'u1' });
  (User as any).findOne = async () => user;
  (PasswordResetToken as any).findOneAndUpdate = async () => null;

  await assert.rejects(
    () => resetPasswordWithToken(mintResetToken(), 'brand-new-secret'),
    (error: any) => error.statusCode === 400 && error.message === INVALID_LINK
  );
  assert.equal(saved, false);
});

test('a valid reset claims, saves and invalidates every other session', async () => {
  const currentHash = await bcrypt.hash('current-secret', 4);
  const order: string[] = [];
  const user: any = {
    _id: 'u1',
    email: 'meera@example.com',
    password: currentHash,
    tokenVersion: 2,
    mustChangePassword: true,
    passwordChangedAt: null,
    save: async () => {
      order.push('save');
    },
  };

  (PasswordResetToken as any).findOne = async () => ({ _id: 'tok-1', userId: 'u1' });
  (User as any).findOne = async (filter: any) => {
    assert.deepEqual(filter, { _id: 'u1', accountType: 'personal', status: 'active' });
    return user;
  };
  (PasswordResetToken as any).findOneAndUpdate = async (filter: any) => {
    assert.deepEqual(filter._id, 'tok-1');
    assert.equal(filter.usedAt, null);
    assert.ok(filter.expiresAt.$gt instanceof Date);
    order.push('claim');
    return { _id: 'tok-1' };
  };
  (PasswordResetToken as any).deleteMany = async (filter: any) => {
    assert.deepEqual(filter, { userId: 'u1', _id: { $ne: 'tok-1' } });
    order.push('cleanup');
    return {};
  };

  const result = await resetPasswordWithToken(mintResetToken(), 'brand-new-secret');

  assert.equal(result, user);
  assert.deepEqual(order, ['claim', 'save', 'cleanup']);
  assert.equal(user.tokenVersion, 3);
  assert.equal(user.mustChangePassword, false);
  assert.ok(user.passwordChangedAt instanceof Date);
  assert.ok(await bcrypt.compare('brand-new-secret', user.password));
});
