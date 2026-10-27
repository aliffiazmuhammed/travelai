import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBioAllowed,
  assertHandleAllowed,
  assertNameAllowed,
  checkHandleAvailability,
  normalizeBio,
  normalizeHandle,
  normalizeName,
  publicUser,
  RESERVED_HANDLES,
} from './profile.js';
import {
  avatarExtensionForMime,
  avatarFilenameFromUrl,
  avatarMaxBytes,
  avatarMaxMb,
  buildAvatarFilename,
  assertAvatarBytes,
  DEFAULT_AVATAR_MAX_MB,
  isAllowedAvatarMime,
  isManagedAvatarUrl,
} from './avatar.js';
import { userLabel, projectComment, LABEL_MAX_LEN } from '../collab/comments.js';
import User from '../../models/User.js';
import { changePasswordSchema, updateProfileSchema, agencyProfileSchema } from '../../schemas/profile.schema.js';

/**
 * Pure-rule tests for profile editing (F14). The live flows — a name reaching
 * another member's chat label, a photo landing in storage, a password actually
 * changing the hash — are covered by `scripts/smoke-f14.mts`; what must hold
 * structurally (label precedence, name normalization, schema bounds, the file
 * allow-list and the "only managed URLs" projection) is asserted here.
 */

/* -------------------------------------------------------------------------- */
/*  Labels (F14): display name wins, email local part is the fallback           */
/* -------------------------------------------------------------------------- */

test('userLabel: a display name wins over the email local part', () => {
  assert.equal(userLabel({ name: 'Ada Lovelace', email: 'ada@example.com' }), 'Ada Lovelace');
});

test('userLabel: falls back to the email local part, then to Traveler', () => {
  assert.equal(userLabel({ email: 'kiran@example.com' }), 'kiran');
  assert.equal(userLabel({ name: '   ', email: 'kiran@example.com' }), 'kiran');
  assert.equal(userLabel({}), 'Traveler');
  assert.equal(userLabel(null), 'Traveler');
});

test('userLabel: clamps an overlong legacy name at the label cap', () => {
  const long = 'x'.repeat(LABEL_MAX_LEN + 20);
  assert.equal(userLabel({ name: long }).length, LABEL_MAX_LEN);
});

test('projectComment: carries a live avatar and never one on a tombstone', () => {
  const row = { _id: 'c1', tripId: 't1', userId: 'u1', body: 'hi', createdAt: new Date() };
  const live = projectComment(row, 'u1', 'Ada', 'https://cdn.test/avatar-u1.png');
  assert.equal(live.avatarUrl, 'https://cdn.test/avatar-u1.png');

  const tombstone = projectComment(
    { ...row, body: '', deletedAt: new Date() },
    'u1',
    'Ada',
    'https://cdn.test/avatar-u1.png'
  );
  assert.equal('avatarUrl' in tombstone, false);
});

/* -------------------------------------------------------------------------- */
/*  Name normalization                                                         */
/* -------------------------------------------------------------------------- */

test('normalizeName: trims and collapses internal whitespace', () => {
  assert.equal(normalizeName('  Ada   Lovelace \n'), 'Ada Lovelace');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(null), '');
});

test('assertNameAllowed: 40 characters pass, 41 do not', () => {
  assert.doesNotThrow(() => assertNameAllowed('a'.repeat(LABEL_MAX_LEN)));
  assert.throws(() => assertNameAllowed('a'.repeat(LABEL_MAX_LEN + 1)), /40 characters/);
  assert.doesNotThrow(() => assertNameAllowed(''), 'empty clears the name');
});

test('updateProfileSchema: rejects a name that normalizes over the cap', () => {
  assert.equal(updateProfileSchema.safeParse({ name: 'Ada Lovelace' }).success, true);
  assert.equal(updateProfileSchema.safeParse({ name: '' }).success, true);
  assert.equal(
    updateProfileSchema.safeParse({ name: 'a'.repeat(LABEL_MAX_LEN + 1) }).success,
    false
  );
  assert.equal(updateProfileSchema.safeParse({ name: 42 }).success, false);
});

/* -------------------------------------------------------------------------- */
/*  Traveler handle (Milestone 8 G1)                                           */
/* -------------------------------------------------------------------------- */

const originalUserExists = User.exists;

test.after(() => {
  (User as any).exists = originalUserExists;
});

test('normalizeHandle: trims, drops a leading @ and lowercases', () => {
  assert.equal(normalizeHandle('  @Ada_2026 '), 'ada_2026');
  assert.equal(normalizeHandle(undefined), '');
  assert.equal(normalizeHandle('@@ada'), 'ada');
});

test('assertHandleAllowed: 3–24 lowercase letters, digits and underscores', () => {
  assert.doesNotThrow(() => assertHandleAllowed('abc'));
  assert.doesNotThrow(() => assertHandleAllowed('ada_2026'));
  assert.doesNotThrow(() => assertHandleAllowed('a'.repeat(24)));
  assert.throws(() => assertHandleAllowed('ab'), /3–24 characters/);
  assert.throws(() => assertHandleAllowed('a'.repeat(25)), /3–24 characters/);
  assert.throws(() => assertHandleAllowed('ada-lovelace'), /lowercase letters/);
  assert.throws(() => assertHandleAllowed('Ada'), /lowercase letters/);
  assert.throws(() => assertHandleAllowed('ada lovelace'), /lowercase letters/);
});

test('reserved handles are refused and cover the public app routes', () => {
  for (const reserved of ['explore', 'travelers', 'admin', 'settings', 'trips']) {
    assert.equal(RESERVED_HANDLES.has(reserved), true, `${reserved} must stay reserved`);
    assert.throws(() => assertHandleAllowed(reserved), /reserved/);
  }
});

test('checkHandleAvailability: invalid/reserved/taken/free, never throwing', async () => {
  (User as any).exists = async () => null;
  assert.deepEqual(await checkHandleAvailability('@Ada_2026'), {
    handle: 'ada_2026',
    available: true,
  });
  assert.deepEqual(await checkHandleAvailability('ab'), {
    handle: 'ab',
    available: false,
    reason: 'invalid',
  });
  assert.deepEqual(await checkHandleAvailability('admin'), {
    handle: 'admin',
    available: false,
    reason: 'reserved',
  });

  (User as any).exists = async () => ({ _id: 'someone' });
  assert.deepEqual(await checkHandleAvailability('ada'), {
    handle: 'ada',
    available: false,
    reason: 'taken',
  });
});

test('updateProfileSchema: any single profile field is enough, empty is not', () => {
  assert.equal(updateProfileSchema.safeParse({ handle: 'ada' }).success, true);
  assert.equal(updateProfileSchema.safeParse({ bio: 'Slow travel' }).success, true);
  assert.equal(updateProfileSchema.safeParse({ name: '' }).success, true);
  assert.equal(updateProfileSchema.safeParse({}).success, false);
  assert.equal(updateProfileSchema.safeParse({ handle: 'Ada Lovelace' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ handle: 'ab' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ bio: 'x'.repeat(281) }).success, false);
});

test('agencyProfileSchema: name only — handle and bio are stripped', () => {
  const parsed = agencyProfileSchema.safeParse({
    name: 'Ada',
    handle: 'ada',
    bio: 'Not an agency concept',
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? Object.keys(parsed.data) : [], ['name']);
  assert.equal(agencyProfileSchema.safeParse({}).success, false);
});

test('normalizeBio/assertBioAllowed: single-spaced and capped at 280', () => {
  assert.equal(normalizeBio('  Slow\n travel  '), 'Slow travel');
  assert.equal(normalizeBio(undefined), '');
  assert.doesNotThrow(() => assertBioAllowed('x'.repeat(280)));
  assert.throws(() => assertBioAllowed('x'.repeat(281)), /280 characters/);
});

test('changePasswordSchema: 6+ characters, and the new one must differ', () => {
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: 'old-pass', newPassword: 'new-pass' }).success,
    true
  );
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: 'old-pass', newPassword: 'old-pass' }).success,
    false
  );
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: 'old-pass', newPassword: 'short' }).success,
    false
  );
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'new-pass' }).success,
    false
  );
});

/* -------------------------------------------------------------------------- */
/*  Avatar storage rules                                                       */
/* -------------------------------------------------------------------------- */

// A 1x1 PNG — enough to exercise the magic-byte check.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('isAllowedAvatarMime: images only, never a PDF', () => {
  assert.equal(isAllowedAvatarMime('image/png'), true);
  assert.equal(isAllowedAvatarMime('image/jpeg'), true);
  assert.equal(isAllowedAvatarMime('image/webp'), true);
  assert.equal(isAllowedAvatarMime('application/pdf'), false);
  assert.equal(isAllowedAvatarMime('text/html'), false);
});

test('buildAvatarFilename: derived from the account + a random suffix', () => {
  const name = buildAvatarFilename('507f1f77bcf86cd799439011', 'image/png', 'abc123');
  assert.equal(name, 'avatar-507f1f77bcf86cd799439011-abc123.png');
  assert.equal(buildAvatarFilename('u1', 'application/pdf', 'abc'), null);
  assert.equal(avatarExtensionForMime('image/webp'), 'webp');
});

test('managed avatar URLs: only this service\'s own /uploads files', () => {
  assert.equal(isManagedAvatarUrl('/uploads/avatar-u1-abc.png'), true);
  assert.equal(isManagedAvatarUrl('/uploads/receipt-123.png'), false);
  assert.equal(isManagedAvatarUrl('https://evil.test/avatar-u1.png'), false);
  assert.equal(isManagedAvatarUrl('/uploads/../avatar-u1.png'), false);
  assert.equal(avatarFilenameFromUrl('/uploads/avatar-u1-abc.png'), 'avatar-u1-abc.png');
  assert.equal(avatarFilenameFromUrl('https://evil.test/a.png'), null);
});

test('assertAvatarBytes: accepts a real PNG and rejects a renamed file', () => {
  assert.doesNotThrow(() => assertAvatarBytes('image/png', PNG_BYTES));
  assert.throws(() => assertAvatarBytes('image/jpeg', PNG_BYTES), /does not look like a photo/);
  assert.throws(() => assertAvatarBytes('application/pdf', PNG_BYTES), /JPEG, PNG or WebP/);
  assert.throws(() => assertAvatarBytes('image/png', Buffer.from('not an image')), /does not look like/);
});

test('avatar size: 2 MB default, overridable by AVATAR_MAX_MB', () => {
  const previous = process.env.AVATAR_MAX_MB;
  try {
    delete process.env.AVATAR_MAX_MB;
    assert.equal(avatarMaxMb(), DEFAULT_AVATAR_MAX_MB);
    assert.equal(avatarMaxBytes(), 2 * 1024 * 1024);

    process.env.AVATAR_MAX_MB = '3';
    assert.equal(avatarMaxMb(), 3);
    assert.equal(avatarMaxBytes(), 3 * 1024 * 1024);

    process.env.AVATAR_MAX_MB = 'nonsense';
    assert.equal(avatarMaxMb(), DEFAULT_AVATAR_MAX_MB);
  } finally {
    if (previous === undefined) delete process.env.AVATAR_MAX_MB;
    else process.env.AVATAR_MAX_MB = previous;
  }
});

/* -------------------------------------------------------------------------- */
/*  Own-account projection                                                     */
/* -------------------------------------------------------------------------- */

test('publicUser: exposes the owner\'s own fields and the effective label', () => {
  const projected = publicUser({
    _id: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    avatarUrl: '/uploads/avatar-u1.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    password: 'hash',
    chatPubKey: 'newest-key',
    chatPubKeys: ['k1'],
    googleId: 'google-123',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  assert.deepEqual(Object.keys(projected).sort(), [
    '_id',
    'avatarUrl',
    'createdAt',
    'email',
    'label',
    'name',
  ]);
  assert.equal(projected.label, 'Ada');
  assert.equal('password' in projected, false);
  assert.equal('chatPubKey' in projected, false);
  assert.equal('chatPubKeys' in projected, false);
  assert.equal('googleId' in projected, false);
  assert.equal('updatedAt' in projected, false);
});

test('publicUser: an account with no name still has a usable label', () => {
  const projected = publicUser({ _id: 'u2', email: 'kiran@example.com' });
  assert.equal(projected.label, 'kiran');
  assert.equal('name' in projected, false);
  assert.equal('avatarUrl' in projected, false);
});

test('publicUser: carries the traveler handle and bio once claimed', () => {
  const projected = publicUser({
    _id: 'u3',
    email: 'ada@example.com',
    name: 'Ada',
    profile: { handle: 'ada', bio: 'Slow travel' },
  });
  assert.deepEqual(Object.keys(projected).sort(), [
    '_id',
    'bio',
    'email',
    'handle',
    'label',
    'name',
  ]);
  assert.equal(projected.handle, 'ada');
  assert.equal(projected.bio, 'Slow travel');
});
