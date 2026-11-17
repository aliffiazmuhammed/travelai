import { gcm } from '@noble/ciphers/aes.js';

import { base64ToBytes, bytesToBase64, type RandomSource } from './chatCrypto';
import { encodeUtf8 } from './utf8';

export interface SealedKey {
  iv: string;
  ct: string;
}

export interface PasswordWrap extends SealedKey {
  salt: string;
}

export type AccountBackupState =
  | { v: 1; userId: string; enrolled: false; revision: 0 }
  | {
      v: 1;
      userId: string;
      enrolled: true;
      generation: string;
      revision: number;
      password: PasswordWrap | null;
      recovery: SealedKey;
    };

export interface TripKeyBackup extends SealedKey {
  v: 1;
  userId: string;
  tripId: string;
  epoch: number;
  generation: string;
  rowRevision: number;
}

const P = 'waytowalk.trip-key-backup';
const KEY_BYTES = 32;
const GENERATION_BYTES = 16;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const SEALED_BYTES = KEY_BYTES + 16;
const ITERATIONS = 600_000;
// Matches the existing chat epoch schema, not a server-selected KDF parameter.
const MAX_EPOCH = 1_000_000_000;
const CODE_PREFIX = 'WTK1-';

function invalid(): never {
  // Never include passwords, recovery codes, keys or supplied wire data in errors.
  throw new Error('Invalid key backup data.');
}

function bytes(value: unknown, length: number): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) invalid();
}

export function encodeKey(value: Uint8Array): string {
  if (!(value instanceof Uint8Array)) invalid();
  return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeKey(text: string, expectedBytes: number): Uint8Array {
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 0 ||
    typeof text !== 'string' ||
    text.length !== Math.ceil((expectedBytes * 8) / 6) ||
    !/^[A-Za-z0-9_-]*$/.test(text)
  ) invalid();
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
  const decoded = base64ToBytes(padded);
  // Round-trip checks otherwise ignored pad bits (e.g. AB instead of AA).
  if (decoded.length !== expectedBytes || encodeKey(decoded) !== text) invalid();
  return decoded;
}

function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object') invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    invalid();
  }
  // Accept JSON data, not accessors whose values could change after validation.
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !('value' in descriptor)) invalid();
  }
  return value as Record<string, unknown>;
}

function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(value)) invalid();
}

function integer(value: unknown, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) invalid();
}

function generation(value: unknown): asserts value is string {
  if (typeof value !== 'string') invalid();
  decodeKey(value, GENERATION_BYTES);
}

function context(userId: string, accountGeneration: string): void {
  id(userId);
  generation(accountGeneration);
}

function sealedFields(value: Record<string, unknown>): SealedKey {
  if (typeof value.iv !== 'string' || typeof value.ct !== 'string') invalid();
  decodeKey(value.iv, IV_BYTES);
  decodeKey(value.ct, SEALED_BYTES);
  return { iv: value.iv, ct: value.ct };
}

function sealed(value: unknown): SealedKey {
  return sealedFields(object(value, ['iv', 'ct']));
}

function passwordWrap(value: unknown): PasswordWrap {
  const data = object(value, ['salt', 'iv', 'ct']);
  if (typeof data.salt !== 'string') invalid();
  decodeKey(data.salt, SALT_BYTES);
  return { salt: data.salt, ...sealedFields(data) };
}

/** Shape/identity validation is not authentication; callers must still open the wrappers. */
export function validateAccountBackup(state: unknown, expectedUserId: string): AccountBackupState {
  id(expectedUserId);
  if (!state || typeof state !== 'object') invalid();
  const enrolled = Object.getOwnPropertyDescriptor(state, 'enrolled')?.value;
  const data = object(state, enrolled === false
    ? ['v', 'userId', 'enrolled', 'revision']
    : ['v', 'userId', 'enrolled', 'generation', 'revision', 'password', 'recovery']);
  if (data.v !== 1 || data.userId !== expectedUserId) invalid();
  if (data.enrolled === false) {
    if (data.revision !== 0 || Object.is(data.revision, -0)) invalid();
    return { v: 1, userId: expectedUserId, enrolled: false, revision: 0 };
  }
  if (data.enrolled !== true) invalid();
  generation(data.generation);
  integer(data.revision, Number.MAX_SAFE_INTEGER);
  return {
    v: 1,
    userId: expectedUserId,
    enrolled: true,
    generation: data.generation,
    revision: data.revision,
    password: data.password === null ? null : passwordWrap(data.password),
    recovery: sealed(data.recovery),
  };
}

/** Expected IDs come from authenticated/authorized caller context, never from this row. */
export function validateTripBackup(row: unknown, userId: string, tripId: string): TripKeyBackup {
  id(userId);
  id(tripId);
  const data = object(row, ['v', 'userId', 'tripId', 'epoch', 'generation', 'rowRevision', 'iv', 'ct']);
  if (data.v !== 1 || data.userId !== userId || data.tripId !== tripId) invalid();
  generation(data.generation);
  integer(data.epoch, MAX_EPOCH);
  integer(data.rowRevision, Number.MAX_SAFE_INTEGER);
  return {
    v: 1,
    userId,
    tripId,
    epoch: data.epoch,
    generation: data.generation,
    rowRevision: data.rowRevision,
    ...sealedFields(data),
  };
}

function aad(...parts: (string | number)[]): Uint8Array {
  return encodeUtf8(JSON.stringify([P, 1, ...parts]));
}

function passwordAad(userId: string, accountGeneration: string, salt: string): Uint8Array {
  return aad('password', userId, accountGeneration, 'PBKDF2-HMAC-SHA256', ITERATIONS, salt);
}

async function derivePassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (typeof password !== 'string') invalid();
  // TextEncoder/WebCrypto replace lone UTF-16 surrogates with U+FFFD. Preserve
  // valid pairs and every other byte: no trimming, Unicode normalization or cap.
  const utf8 = encodeUtf8(password.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g,
    (part) => part.length === 1 ? '\uFFFD' : part));
  try {
    // Load the async KDF lazily. Native ESM imports also avoid tsx's expensive
    // CommonJS rewrite of Noble's hash hot loop; Metro bundles these normally.
    const [{ pbkdf2Async }, { sha256 }] = await Promise.all([
      import('@noble/hashes/pbkdf2.js'),
      import('@noble/hashes/sha2.js'),
    ]);
    return await pbkdf2Async(sha256, utf8, salt, { c: ITERATIONS, dkLen: KEY_BYTES, asyncTick: 10 });
  } finally {
    utf8.fill(0);
  }
}

function recoveryKey(code: string): Uint8Array {
  if (typeof code !== 'string' || !code.startsWith(CODE_PREFIX)) invalid();
  return decodeKey(code.slice(CODE_PREFIX.length), KEY_BYTES);
}

function seal(key: Uint8Array, wrappingKey: Uint8Array, iv: Uint8Array, associatedData: Uint8Array): SealedKey {
  return { iv: encodeKey(iv), ct: encodeKey(gcm(wrappingKey, iv, associatedData).encrypt(key)) };
}

function open(wrap: SealedKey, wrappingKey: Uint8Array, associatedData: Uint8Array): Uint8Array {
  try {
    const key = gcm(wrappingKey, decodeKey(wrap.iv, IV_BYTES), associatedData)
      .decrypt(decodeKey(wrap.ct, SEALED_BYTES));
    if (key.length !== KEY_BYTES) {
      key.fill(0);
      invalid();
    }
    return key;
  } catch {
    throw new Error('Unable to open key backup.');
  }
}

/**
 * Pure Noble v1 core: no platform APIs, persistence, logging or ambient randomness.
 * The caller MUST supply a cryptographically secure RandomSource in production.
 * Best-effort buffer wiping cannot erase JS strings or guarantee memory erasure.
 */
export function createKeyBackupCrypto(random: RandomSource) {
  function fresh(length: number): Uint8Array {
    const value = random(length);
    bytes(value, length);
    return new Uint8Array(value);
  }

  return {
    generateAccountKey: (): Uint8Array => fresh(KEY_BYTES),
    generateGeneration: (): string => encodeKey(fresh(GENERATION_BYTES)),
    generateRecoveryCode: (): string => {
      const raw = fresh(KEY_BYTES);
      try {
        return CODE_PREFIX + encodeKey(raw);
      } finally {
        raw.fill(0);
      }
    },
    async wrapPassword(userId: string, accountGeneration: string, password: string, key: Uint8Array): Promise<PasswordWrap> {
      context(userId, accountGeneration);
      bytes(key, KEY_BYTES);
      if (typeof password !== 'string') invalid();
      const salt = fresh(SALT_BYTES);
      const iv = fresh(IV_BYTES);
      const encodedSalt = encodeKey(salt);
      const associatedData = passwordAad(userId, accountGeneration, encodedSalt);
      // Own a snapshot across KDF yields; never wipe/mutate the caller's ABK.
      const keyCopy = new Uint8Array(key);
      let derived: Uint8Array | undefined;
      try {
        derived = await derivePassword(password, salt);
        return { salt: encodedSalt, ...seal(keyCopy, derived, iv, associatedData) };
      } finally {
        keyCopy.fill(0);
        derived?.fill(0);
      }
    },
    async unwrapPassword(userId: string, accountGeneration: string, password: string, wrap: PasswordWrap): Promise<Uint8Array> {
      context(userId, accountGeneration);
      // Reject unknown parameters and malformed encodings before expensive work.
      const checked = passwordWrap(wrap);
      const associatedData = passwordAad(userId, accountGeneration, checked.salt);
      const derived = await derivePassword(password, decodeKey(checked.salt, SALT_BYTES));
      try {
        return open(checked, derived, associatedData);
      } finally {
        derived.fill(0);
      }
    },
    wrapRecovery(userId: string, accountGeneration: string, code: string, key: Uint8Array): SealedKey {
      context(userId, accountGeneration);
      bytes(key, KEY_BYTES);
      const derived = recoveryKey(code);
      try {
        return seal(key, derived, fresh(IV_BYTES), aad('recovery', userId, accountGeneration));
      } finally {
        derived.fill(0);
      }
    },
    unwrapRecovery(userId: string, accountGeneration: string, code: string, wrap: SealedKey): Uint8Array {
      context(userId, accountGeneration);
      const checked = sealed(wrap);
      const derived = recoveryKey(code);
      try {
        return open(checked, derived, aad('recovery', userId, accountGeneration));
      } finally {
        derived.fill(0);
      }
    },
    wrapTrip(userId: string, accountGeneration: string, tripId: string, epoch: number, key: Uint8Array, accountKey: Uint8Array): SealedKey {
      context(userId, accountGeneration);
      id(tripId);
      integer(epoch, MAX_EPOCH);
      bytes(key, KEY_BYTES);
      bytes(accountKey, KEY_BYTES);
      return seal(key, accountKey, fresh(IV_BYTES), aad('trip', userId, accountGeneration, tripId, epoch));
    },
    unwrapTrip(userId: string, accountGeneration: string, tripId: string, epoch: number, wrap: SealedKey, accountKey: Uint8Array): Uint8Array {
      context(userId, accountGeneration);
      id(tripId);
      integer(epoch, MAX_EPOCH);
      bytes(accountKey, KEY_BYTES);
      // TripKeyBackup structurally extends SealedKey. Accept a complete row only
      // after strict validation against the caller's context; never take AAD
      // identity, generation or epoch from server-selected metadata.
      let checked: SealedKey;
      if (wrap && typeof wrap === 'object' && Object.getOwnPropertyDescriptor(wrap, 'v')) {
        const row = validateTripBackup(wrap, userId, tripId);
        if (row.generation !== accountGeneration || row.epoch !== epoch) invalid();
        checked = { iv: row.iv, ct: row.ct };
      } else {
        checked = sealed(wrap);
      }
      return open(checked, accountKey, aad('trip', userId, accountGeneration, tripId, epoch));
    },
  };
}
