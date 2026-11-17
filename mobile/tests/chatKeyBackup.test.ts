/// <reference types="node" />

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { base64ToBytes, bytesToBase64, createChatCrypto } from '../src/lib/chatCrypto';
import {
  createKeyBackupCrypto,
  decodeKey,
  encodeKey,
  validateAccountBackup,
  validateTripBackup,
  type PasswordWrap,
  type SealedKey,
} from '../src/lib/chatKeyBackupCrypto';

// Independent native oracle: no production encoders, AAD builders or KDF helpers.
const subtle = webcrypto.subtle;
const utf8 = new TextEncoder();
const nativeEncode = (value: Uint8Array) => Buffer.from(value).toString('base64url');
const nativeDecode = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));
const sequence = (length: number, start = 0) => Uint8Array.from({ length }, (_, i) => (start + i) % 256);
const USER = '0123456789abcdef01234567';
const OTHER_USER = '1123456789abcdef01234567';
const TRIP = 'abcdef0123456789abcdef01';
const OTHER_TRIP = 'bbcdef0123456789abcdef01';
const ABK = sequence(32);
const TRIP_KEY = sequence(32, 128);
const GENERATION = 'ICEiIyQlJicoKSorLC0uLw';
const OTHER_GENERATION = nativeEncode(sequence(16, 33));
const SALT = 'MDEyMzQ1Njc4OTo7PD0-Pw';
const IV = 'QEFCQ0RFRkdISUpL';
const CODE = `WTK1-${nativeEncode(sequence(32, 96))}`;
const PASSWORD = ' \tCaf\u00e9 \u65c5\u884c\r\n';
// Frozen, synthetic WebCrypto vectors for Phase 2; never real account secrets.
const PASSWORD_CT = 'Udv2-d-CmoZxBQHibg4KqKCbuVqsxtX6Ru-oE-yjjlE3lffr5BKBQdu29p8twAsf';
const RECOVERY_CT = 'usLucLad03qds0B_FEYFnxW-yp2g1dlQ0qpItcNZuVa1NckTJhhbbba6ahqHnxWG';
const TRIP_CT = 'YjgsoKK5AYRFTZ29F-md1OlXwM8joJm0797UfguOc0S06L5tzJAWXLp8x94M-YvB';
const PASSWORD_WRAP: PasswordWrap = { salt: SALT, iv: IV, ct: PASSWORD_CT };
const RECOVERY_WRAP: SealedKey = { iv: IV, ct: RECOVERY_CT };
const TRIP_WRAP: SealedKey = { iv: IV, ct: TRIP_CT };

function deterministicRandom(start = 0) {
  let offset = start;
  return (length: number) => {
    const result = sequence(length, offset);
    offset += length;
    return result;
  };
}

function nativeAad(...parts: (string | number)[]) {
  return utf8.encode(JSON.stringify(['waytowalk.trip-key-backup', 1, ...parts]));
}
const passwordAad = (salt = SALT) => nativeAad('password', USER, GENERATION, 'PBKDF2-HMAC-SHA256', 600000, salt);
const recoveryAad = () => nativeAad('recovery', USER, GENERATION);
const tripAad = () => nativeAad('trip', USER, GENERATION, TRIP, 7);

async function nativeDerive(password: string, salt = SALT, iterations = 600000) {
  const base = await subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations, salt: nativeDecode(salt),
  }, base, 256));
}

async function nativeSeal(key: Uint8Array, plaintext: Uint8Array, additionalData: Uint8Array, iv = IV): Promise<SealedKey> {
  const nativeKey = await subtle.importKey('raw', new Uint8Array(key), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({
    name: 'AES-GCM', iv: nativeDecode(iv), additionalData: new Uint8Array(additionalData), tagLength: 128,
  }, nativeKey, new Uint8Array(plaintext)));
  return { iv, ct: nativeEncode(ct) };
}

async function nativeOpen(key: Uint8Array, wrap: SealedKey, additionalData: Uint8Array) {
  const nativeKey = await subtle.importKey('raw', new Uint8Array(key), 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({
    name: 'AES-GCM', iv: nativeDecode(wrap.iv), additionalData: new Uint8Array(additionalData), tagLength: 128,
  }, nativeKey, nativeDecode(wrap.ct)));
}

function tamper(text: string, index = 0) {
  const value = nativeDecode(text);
  value[index] ^= 1;
  return nativeEncode(value);
}

const crypto = createKeyBackupCrypto(deterministicRandom(160));
const enrolled = () => ({
  v: 1, userId: USER, enrolled: true, generation: GENERATION, revision: 1,
  password: { ...PASSWORD_WRAP }, recovery: { ...RECOVERY_WRAP },
});
const tripRow = () => ({
  v: 1, userId: USER, tripId: TRIP, epoch: 7, generation: GENERATION, rowRevision: 1, ...TRIP_WRAP,
});

test('canonical unpadded base64url matches native encoding for every byte and length', () => {
  for (const length of [0, 1, 2, 3, 12, 16, 32, 48, 256]) {
    const value = sequence(length, 240);
    assert.equal(encodeKey(value), nativeEncode(value));
    assert.deepEqual(decodeKey(nativeEncode(value), length), value);
  }
  for (const [text, length] of [
    ['AA=', 1], ['AA==', 1], ['AB', 1], ['AAB', 2], ['A', 1], ['AA\n', 1],
    [' AA', 1], ['A A', 1], ['+w', 1], ['/w', 1], ['\uFF21A', 1], ['AA', 2], ['', 32],
    ['AA', -1], ['AA', 1.5], ['AA', NaN], ['AA', Infinity], ['AA', Number.MAX_SAFE_INTEGER + 1],
  ] as const) assert.throws(() => decodeKey(text, length), /Invalid key backup data/);
  assert.throws(() => decodeKey(null as unknown as string, 32));
  assert.throws(() => decodeKey('AA', '1' as unknown as number));
  assert.throws(() => encodeKey([1] as unknown as Uint8Array));
  // Changing backup encoding must not change legacy chat's padded base64.
  assert.equal(bytesToBase64(new Uint8Array([255])), '/w==');
  assert.deepEqual(base64ToBytes('/w=='), new Uint8Array([255]));
});

test('generators use injected randomness with exact lengths and independent buffers', () => {
  const requests: number[] = [];
  const rand = deterministicRandom();
  const core = createKeyBackupCrypto((n) => { requests.push(n); return rand(n); });
  assert.deepEqual(core.generateAccountKey(), sequence(32));
  assert.equal(core.generateGeneration(), GENERATION);
  assert.equal(core.generateRecoveryCode(), `WTK1-${nativeEncode(sequence(32, 48))}`);
  assert.deepEqual(requests, [32, 16, 32]);
  assert.notEqual(core.generateRecoveryCode(), core.generateRecoveryCode());
  const source = sequence(32);
  const independent = createKeyBackupCrypto(() => source).generateAccountKey();
  source.fill(0);
  assert.deepEqual(independent, ABK);
  for (const bad of [(n: number) => sequence(n - 1), () => [] as unknown as Uint8Array]) {
    const invalid = createKeyBackupCrypto(bad);
    assert.throws(() => invalid.generateAccountKey());
    assert.throws(() => invalid.generateGeneration());
    assert.throws(() => invalid.generateRecoveryCode());
    assert.throws(() => invalid.wrapRecovery(USER, GENERATION, CODE, ABK));
  }
});

test('account metadata is strict, identity-bound and snapshotted, including reset/absence', () => {
  const absent = { v: 1, userId: USER, enrolled: false, revision: 0 };
  assert.deepEqual(validateAccountBackup(absent, USER), absent);
  const source = enrolled();
  const checked = validateAccountBackup(source, USER);
  assert.deepEqual(checked, source);
  source.password.ct = 'changed';
  assert.equal(checked.enrolled && checked.password?.ct, PASSWORD_CT);
  assert.deepEqual(validateAccountBackup({ ...enrolled(), password: null, revision: 2 }, USER), {
    ...enrolled(), password: null, revision: 2,
  });
  for (const value of [
    null, undefined, true, [], {}, new Date(), Object.create(enrolled()),
    { ...enrolled(), v: 2 }, { ...enrolled(), v: '1' }, { ...enrolled(), enrolled: 'true' },
    { ...enrolled(), userId: OTHER_USER }, { ...enrolled(), generation: `${GENERATION}==` },
    { ...enrolled(), generation: nativeEncode(sequence(15)) },
    { ...enrolled(), password: undefined }, { ...enrolled(), recovery: null },
    { ...enrolled(), algorithm: 'AES-GCM' }, { ...enrolled(), revision: 0 },
    { ...enrolled(), revision: Number.MAX_SAFE_INTEGER + 1 }, { ...enrolled(), revision: 1.5 },
    { ...enrolled(), revision: '1' }, { ...enrolled(), revision: -1 },
    { ...enrolled(), recovery: { ...RECOVERY_WRAP, iv: nativeEncode(sequence(11)) } },
    { ...enrolled(), password: { ...PASSWORD_WRAP, ct: nativeEncode(sequence(47)) } },
    { ...enrolled(), recovery: { ...RECOVERY_WRAP, ct: nativeEncode(sequence(49)) } },
    { ...enrolled(), password: { ...PASSWORD_WRAP, salt: nativeEncode(sequence(17)) } },
    { ...enrolled(), recovery: { ...RECOVERY_WRAP, tagLength: 96 } },
    { ...enrolled(), [Symbol('extra')]: 1 },
    { ...absent, revision: 1 }, { ...absent, revision: -0 }, { ...absent, password: null },
  ]) assert.throws(() => validateAccountBackup(value, USER), /Invalid key backup data/);
  const accessor = { ...enrolled() };
  Object.defineProperty(accessor, 'revision', { get() { throw new Error('must not run getter'); } });
  assert.throws(() => validateAccountBackup(accessor, USER), /Invalid key backup data/);
  assert.throws(() => validateAccountBackup(enrolled(), USER.toUpperCase()));
  assert.throws(() => validateAccountBackup({ ...enrolled(), userId: '' }, ''));
});

test('trip metadata rejects substituted IDs, invalid epochs, revisions and unknown fields', () => {
  assert.deepEqual(validateTripBackup(tripRow(), USER, TRIP), tripRow());
  assert.equal(validateTripBackup({ ...tripRow(), epoch: 1_000_000_000 }, USER, TRIP).epoch, 1_000_000_000);
  for (const value of [null, [], {},
    { ...tripRow(), v: 2 }, { ...tripRow(), userId: OTHER_USER }, { ...tripRow(), tripId: OTHER_TRIP },
    { ...tripRow(), generation: nativeEncode(sequence(17)) }, { ...tripRow(), iv: `${IV}=` },
    { ...tripRow(), ct: nativeEncode(sequence(16)) }, { ...tripRow(), algorithm: 'AES-GCM' },
    ...[0, -0, -1, 1.5, 1_000_000_001, NaN, Infinity, '7', null].map((epoch) => ({ ...tripRow(), epoch })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map((rowRevision) => ({ ...tripRow(), rowRevision })),
  ]) assert.throws(() => validateTripBackup(value, USER, TRIP));
  for (const badId of ['', 'a'.repeat(23), 'g'.repeat(24), `${USER}\n`, ` ${USER}`]) {
    assert.throws(() => validateTripBackup({ ...tripRow(), userId: badId }, badId, TRIP));
    assert.throws(() => validateTripBackup({ ...tripRow(), tripId: badId }, USER, badId));
  }
});

test('frozen password vector: actual Noble and WebCrypto interoperate without ambient crypto/UTF8 APIs', async () => {
  const derived = await nativeDerive(PASSWORD);
  assert.equal(nativeEncode(derived), 'bWpbZlj6AHd172hi2ZUjbkfpAVGw14jAHpBFjg6z_LY');
  const native = { salt: SALT, ...await nativeSeal(derived, ABK, passwordAad()) };
  assert.deepEqual(native, PASSWORD_WRAP);
  const descriptors = ['crypto', 'TextEncoder', 'TextDecoder'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  let ticks = 0;
  const timer = setTimeout(() => { ticks++; }, 0);
  try {
    for (const [name] of descriptors) Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
    const core = createKeyBackupCrypto(deterministicRandom(48));
    const key = new Uint8Array(ABK);
    const pendingWrap = core.wrapPassword(USER, GENERATION, PASSWORD, key);
    key.fill(255); // Mutation while deriving cannot change the plaintext snapshot.
    const mobile = await pendingWrap;
    assert.deepEqual(mobile, native);
    assert.ok(ticks > 0, 'PBKDF2 must yield to the host event loop, not only microtasks');
    assert.deepEqual(await nativeOpen(derived, mobile, passwordAad()), ABK);
    const mutable = { ...native };
    const pendingOpen = core.unwrapPassword(USER, GENERATION, PASSWORD, mutable);
    mutable.ct = nativeEncode(sequence(48));
    mutable.salt = nativeEncode(sequence(16));
    assert.deepEqual(await pendingOpen, ABK);
    assert.deepEqual(core.unwrapRecovery(USER, GENERATION, CODE, RECOVERY_WRAP), ABK);
    assert.deepEqual(core.unwrapTrip(USER, GENERATION, TRIP, 7, TRIP_WRAP, ABK), TRIP_KEY);
  } finally {
    clearTimeout(timer);
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('exact password UTF8: Unicode, whitespace, NUL, long passwords and lone surrogates', async (t) => {
  const cases = [
    { label: 'empty', password: '', different: ' ' },
    { label: 'whitespace', password: ' \tsecret\r\n ', different: 'secret' },
    { label: 'Unicode composed', password: 'Caf\u00e9\u65c5\u884c\uD83D\uDE80', different: 'Cafe\u0301\u65c5\u884c\uD83D\uDE80' },
    { label: 'embedded NUL', password: 'before\0after', different: 'before' },
    { label: 'bcrypt 72-byte boundary', password: 'x'.repeat(72) + 'a', different: 'x'.repeat(72) + 'b' },
    { label: 'long multibyte', password: '\u754C'.repeat(1024) + 'a', different: '\u754C'.repeat(1024) + 'b' },
    { label: 'lone UTF16 surrogate', password: '\uD800x\uDC00\uD83D\uDE80', different: 'x\uD83D\uDE80' },
  ];
  for (const { label, password, different } of cases) await t.test(label, async () => {
    const mobile = await crypto.wrapPassword(USER, GENERATION, password, ABK);
    const derived = await nativeDerive(password, mobile.salt);
    assert.deepEqual(await nativeOpen(derived, mobile, passwordAad(mobile.salt)), ABK);
    const native = { salt: mobile.salt, ...await nativeSeal(derived, ABK, passwordAad(mobile.salt), mobile.iv) };
    assert.deepEqual(await crypto.unwrapPassword(USER, GENERATION, password, native), ABK);
    await assert.rejects(crypto.unwrapPassword(USER, GENERATION, different, native), /Unable to open key backup/);
  });
});

test('password authentication binds salt, account, generation, IV, ciphertext and tag', async () => {
  for (const [user, gen, wrap] of [
    [OTHER_USER, GENERATION, PASSWORD_WRAP],
    [USER, OTHER_GENERATION, PASSWORD_WRAP],
    [USER, GENERATION, { ...PASSWORD_WRAP, salt: tamper(SALT) }],
    [USER, GENERATION, { ...PASSWORD_WRAP, iv: tamper(IV) }],
    [USER, GENERATION, { ...PASSWORD_WRAP, ct: tamper(PASSWORD_CT) }],
    [USER, GENERATION, { ...PASSWORD_WRAP, ct: tamper(PASSWORD_CT, 47) }],
  ] as const) await assert.rejects(crypto.unwrapPassword(user, gen, PASSWORD, wrap), /Unable to open key backup/);
  // A server cannot downgrade cost or use pretty JSON/another protocol version.
  const weakKey = await nativeDerive(PASSWORD, SALT, 1);
  const wrongCost = await nativeSeal(weakKey, ABK, passwordAad());
  await assert.rejects(crypto.unwrapPassword(USER, GENERATION, PASSWORD, { salt: SALT, ...wrongCost }));
  const derived = await nativeDerive(PASSWORD);
  const pretty = utf8.encode(JSON.stringify(['waytowalk.trip-key-backup', 1, 'password', USER, GENERATION, 'PBKDF2-HMAC-SHA256', 600000, SALT], null, 2));
  await assert.rejects(crypto.unwrapPassword(USER, GENERATION, PASSWORD, { salt: SALT, ...await nativeSeal(derived, ABK, pretty) }));
});

test('unknown parameters and malformed wrappers are rejected before a KDF is scheduled', async () => {
  const timerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout')!;
  try {
    Object.defineProperty(globalThis, 'setTimeout', { ...timerDescriptor, value: () => { throw new Error('unexpected KDF scheduling'); } });
    for (const wrap of [
      null, [], {}, { ...PASSWORD_WRAP, salt: `${SALT}==` },
      { ...PASSWORD_WRAP, iv: nativeEncode(sequence(13)) }, { ...PASSWORD_WRAP, ct: nativeEncode(sequence(47)) },
      ...['v', 'algorithm', 'kdf', 'hash', 'iterations', 'c', 'dkLen', 'asyncTick', 'tagLength', 'userId', 'generation']
        .map((field) => ({ ...PASSWORD_WRAP, [field]: 1 })),
    ]) {
      await assert.rejects(crypto.unwrapPassword(USER, GENERATION, PASSWORD, wrap as PasswordWrap), /Invalid key backup data/);
      // `password: null` is the legitimate recovery-needed state, not malformed.
      if (wrap !== null) assert.throws(() => validateAccountBackup({ ...enrolled(), password: wrap }, USER), /Invalid key backup data/);
    }
    const recovering = validateAccountBackup({ ...enrolled(), password: null }, USER);
    assert.equal(recovering.enrolled && recovering.password, null);
    await assert.rejects(crypto.wrapPassword(USER, GENERATION, PASSWORD, sequence(31)), /Invalid key backup data/);
    await assert.rejects(crypto.wrapPassword(USER, GENERATION, null as unknown as string, ABK), /Invalid key backup data/);
    await assert.rejects(crypto.unwrapPassword(USER, GENERATION, null as unknown as string, PASSWORD_WRAP), /Invalid key backup data/);
    await assert.rejects(crypto.wrapPassword('', GENERATION, PASSWORD, ABK), /Invalid key backup data/);
    await assert.rejects(crypto.unwrapPassword(USER, `${GENERATION}=`, PASSWORD, PASSWORD_WRAP), /Invalid key backup data/);
  } finally {
    Object.defineProperty(globalThis, 'setTimeout', timerDescriptor);
  }
});

test('recovery and trip frozen vectors interoperate with native AES-GCM in both directions', async () => {
  const recovery = createKeyBackupCrypto(deterministicRandom(64)).wrapRecovery(USER, GENERATION, CODE, ABK);
  assert.deepEqual(recovery, RECOVERY_WRAP);
  assert.deepEqual(await nativeOpen(sequence(32, 96), recovery, recoveryAad()), ABK);
  const nativeRecovery = await nativeSeal(sequence(32, 96), ABK, recoveryAad());
  assert.deepEqual(nativeRecovery, RECOVERY_WRAP);
  assert.deepEqual(crypto.unwrapRecovery(USER, GENERATION, CODE, nativeRecovery), ABK);
  const trip = createKeyBackupCrypto(deterministicRandom(64)).wrapTrip(USER, GENERATION, TRIP, 7, TRIP_KEY, ABK);
  assert.deepEqual(trip, TRIP_WRAP);
  assert.deepEqual(await nativeOpen(ABK, trip, tripAad()), TRIP_KEY);
  const nativeTrip = await nativeSeal(ABK, TRIP_KEY, tripAad());
  assert.deepEqual(nativeTrip, TRIP_WRAP);
  assert.deepEqual(crypto.unwrapTrip(USER, GENERATION, TRIP, 7, nativeTrip, ABK), TRIP_KEY);
});

test('recovery rejects wrong/malformed codes, corrupted tags and substituted account/generation', () => {
  for (const code of [
    `WTK1-${nativeEncode(sequence(32, 97))}`, '', CODE.toLowerCase(), ` ${CODE}`, `${CODE}\n`,
    `${CODE}=`, CODE.slice(5), CODE.replace('WTK1-', 'WTK2-'), `WTK1-${nativeEncode(sequence(31))}`,
    `${CODE.slice(0, -1)}9`, // non-zero unused pad bits for the frozen code's last byte
  ]) assert.throws(() => crypto.unwrapRecovery(USER, GENERATION, code, RECOVERY_WRAP));
  assert.throws(() => crypto.unwrapRecovery(OTHER_USER, GENERATION, CODE, RECOVERY_WRAP));
  assert.throws(() => crypto.unwrapRecovery(USER, OTHER_GENERATION, CODE, RECOVERY_WRAP));
  for (const wrap of [
    { ...RECOVERY_WRAP, iv: tamper(IV) }, { ...RECOVERY_WRAP, ct: tamper(RECOVERY_CT) },
    { ...RECOVERY_WRAP, ct: tamper(RECOVERY_CT, 47) }, { ...RECOVERY_WRAP, v: 2 },
    { ...RECOVERY_WRAP, ct: nativeEncode(sequence(47)) }, { ...RECOVERY_WRAP, salt: SALT },
  ]) assert.throws(() => crypto.unwrapRecovery(USER, GENERATION, CODE, wrap));
  assert.throws(() => crypto.wrapRecovery(USER, GENERATION, CODE, sequence(31)));
});

test('trip authentication binds trusted caller context, not server-selected row context', () => {
  const completeRow = validateTripBackup(tripRow(), USER, TRIP);
  assert.deepEqual(crypto.unwrapTrip(USER, GENERATION, TRIP, 7, completeRow, ABK), TRIP_KEY);
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 8, completeRow, ABK));
  assert.throws(() => crypto.unwrapTrip(USER, OTHER_GENERATION, TRIP, 7, completeRow, ABK));
  assert.throws(() => crypto.unwrapTrip(OTHER_USER, GENERATION, TRIP, 7, completeRow, ABK));
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, OTHER_TRIP, 7, completeRow, ABK));
  const unknownParams = { ...completeRow, algorithm: 'AES-GCM' };
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 7, unknownParams, ABK));
  for (const [user, gen, trip, epoch] of [
    [OTHER_USER, GENERATION, TRIP, 7], [USER, OTHER_GENERATION, TRIP, 7],
    [USER, GENERATION, OTHER_TRIP, 7], [USER, GENERATION, TRIP, 8],
  ] as const) assert.throws(() => crypto.unwrapTrip(user, gen, trip, epoch, TRIP_WRAP, ABK));
  for (const wrap of [
    { ...TRIP_WRAP, iv: tamper(IV) }, { ...TRIP_WRAP, ct: tamper(TRIP_CT) },
    { ...TRIP_WRAP, ct: tamper(TRIP_CT, 47) }, { ...TRIP_WRAP, iterations: 600000 },
    { ...TRIP_WRAP, ct: nativeEncode(sequence(49)) }, { ...TRIP_WRAP, iv: nativeEncode(sequence(16)) },
  ]) assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 7, wrap, ABK));
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 7, TRIP_WRAP, sequence(32, 1)));
  for (const epoch of [0, -1, 1.5, 1_000_000_001, NaN, Infinity]) {
    assert.throws(() => crypto.wrapTrip(USER, GENERATION, TRIP, epoch, TRIP_KEY, ABK));
    assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, epoch, TRIP_WRAP, ABK));
  }
  for (const key of [sequence(16), sequence(24), sequence(31), sequence(33)]) {
    assert.throws(() => crypto.wrapTrip(USER, GENERATION, TRIP, 7, key, ABK));
    assert.throws(() => crypto.wrapTrip(USER, GENERATION, TRIP, 7, TRIP_KEY, key));
    assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 7, TRIP_WRAP, key));
  }
  // A syntactically valid row with rewritten generation/epoch still fails authentication.
  const rewritten = validateTripBackup({ ...tripRow(), generation: OTHER_GENERATION, epoch: 8 }, USER, TRIP);
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 8, { iv: rewritten.iv, ct: rewritten.ct }, ABK));
  const higherRevision = validateTripBackup({ ...tripRow(), rowRevision: 2 }, USER, TRIP);
  assert.deepEqual(crypto.unwrapTrip(USER, GENERATION, TRIP, 7, { iv: higherRevision.iv, ct: higherRevision.ct }, ABK), TRIP_KEY);
});

test('purpose separation and revision changes leave only intended wrappers usable', async () => {
  const sameKeyCode = `WTK1-${nativeEncode(ABK)}`;
  const recovery = crypto.wrapRecovery(USER, GENERATION, sameKeyCode, TRIP_KEY);
  assert.throws(() => crypto.unwrapTrip(USER, GENERATION, TRIP, 7, recovery, ABK));
  assert.throws(() => crypto.unwrapRecovery(USER, GENERATION, sameKeyCode, TRIP_WRAP));
  const derived = await nativeDerive(PASSWORD);
  const wrongPurpose = await nativeSeal(derived, ABK, recoveryAad());
  await assert.rejects(crypto.unwrapPassword(USER, GENERATION, PASSWORD, { salt: SALT, ...wrongPurpose }));
  const revised = validateAccountBackup({ ...enrolled(), revision: 99 }, USER);
  assert.ok(revised.enrolled && revised.password);
  assert.deepEqual(await crypto.unwrapPassword(USER, GENERATION, PASSWORD, revised.password), ABK);
  assert.deepEqual(crypto.unwrapRecovery(USER, GENERATION, CODE, revised.recovery), ABK);
});

test('roundtrip enrollment, fresh salts/IVs, password change and replacement recovery code', async () => {
  const core = createKeyBackupCrypto(deterministicRandom());
  const key = core.generateAccountKey();
  const gen = core.generateGeneration();
  const code = core.generateRecoveryCode();
  const password = await core.wrapPassword(USER, gen, 'old password', key);
  const recovery = core.wrapRecovery(USER, gen, code, key);
  const trip = core.wrapTrip(USER, gen, TRIP, 1, TRIP_KEY, key);
  assert.deepEqual(core.unwrapTrip(USER, gen, TRIP, 1, trip, await core.unwrapPassword(USER, gen, 'old password', password)), TRIP_KEY);
  const newPassword = await core.wrapPassword(USER, gen, 'new password', key);
  assert.notEqual(newPassword.salt, password.salt);
  assert.notEqual(newPassword.iv, password.iv);
  assert.notEqual(core.wrapRecovery(USER, gen, code, key).iv, recovery.iv);
  assert.notEqual(core.wrapTrip(USER, gen, TRIP, 1, TRIP_KEY, key).iv, trip.iv);
  assert.deepEqual(core.unwrapTrip(USER, gen, TRIP, 1, trip, await core.unwrapPassword(USER, gen, 'new password', newPassword)), TRIP_KEY);
  const replacementCode = core.generateRecoveryCode();
  const replacement = core.wrapRecovery(USER, gen, replacementCode, core.unwrapRecovery(USER, gen, code, recovery));
  assert.throws(() => core.unwrapRecovery(USER, gen, code, replacement));
  assert.deepEqual(core.unwrapRecovery(USER, gen, replacementCode, replacement), key);
  // Replacement is not retroactive revocation of an old code + old wrapper.
  assert.deepEqual(core.unwrapRecovery(USER, gen, code, recovery), key);
  assert.deepEqual(key, ABK, 'caller-owned keys must not be wiped');
});

test('restored trip keys preserve existing chat message and device-envelope interop', async () => {
  const restored = crypto.unwrapTrip(USER, GENERATION, TRIP, 7, TRIP_WRAP, ABK);
  const chat = createChatCrypto(deterministicRandom(5));
  const message = 'Existing trip history: Caf\u00e9 \u65c5\u884c';
  const mobileBody = chat.encryptText(restored, message);
  const [iv, ct] = mobileBody.split('.');
  const rawKey = await subtle.importKey('raw', new Uint8Array(restored), 'AES-GCM', false, ['decrypt', 'encrypt']);
  const opened = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64'), tagLength: 128 }, rawKey, Buffer.from(ct, 'base64'));
  assert.equal(new TextDecoder().decode(opened), message);
  const nativeMessage = await subtle.encrypt({ name: 'AES-GCM', iv: sequence(12, 210), tagLength: 128 }, rawKey, utf8.encode(message));
  const nativeBody = `${Buffer.from(sequence(12, 210)).toString('base64')}.${Buffer.from(nativeMessage).toString('base64')}`;
  assert.equal(chat.decryptText(restored, nativeBody), message);

  const identity = chat.mintIdentity();
  const browser = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const browserPub = Buffer.from(await subtle.exportKey('spki', browser.publicKey)).toString('base64');
  const phonePub = await subtle.importKey('spki', Buffer.from(identity.pubKey, 'base64'), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: phonePub }, browser.privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const wrapKey = new Uint8Array(await subtle.deriveBits({
    name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8.encode('travelai-chat-key-v1'),
  }, hkdfKey, 256));
  const envelope = JSON.parse(Buffer.from(chat.wrapConversationKey(USER, identity, browserPub, restored), 'base64').toString('utf8'));
  assert.equal(envelope.v, 2);
  const nativeEnvelopeKey = await subtle.importKey('raw', wrapKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const unwrapped = await subtle.decrypt({
    name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64'), tagLength: 128,
    additionalData: utf8.encode(`travelai-chat-envelope-v2|${USER}|${identity.pubKey}|${browserPub}`),
  }, nativeEnvelopeKey, Buffer.from(envelope.d, 'base64'));
  assert.deepEqual(new Uint8Array(unwrapped), TRIP_KEY);
  const nativeWrapped = await subtle.encrypt({
    name: 'AES-GCM', iv: sequence(12, 222), tagLength: 128,
    additionalData: utf8.encode(`travelai-chat-envelope-v2|${OTHER_USER}|${browserPub}|${identity.pubKey}`),
  }, nativeEnvelopeKey, new Uint8Array(restored));
  const nativeEnvelope = Buffer.from(JSON.stringify({
    v: 2, w: OTHER_USER, wk: browserPub, iv: Buffer.from(sequence(12, 222)).toString('base64'),
    d: Buffer.from(nativeWrapped).toString('base64'),
  })).toString('base64');
  assert.deepEqual(chat.unwrapConversationKey(nativeEnvelope, identity, {}, {}), TRIP_KEY);
});
