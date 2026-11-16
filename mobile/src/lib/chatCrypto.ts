import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { decodeUtf8, encodeUtf8 } from './utf8';

/**
 * The trip chat's end-to-end crypto, ported byte-for-byte from the web client
 * (`frontend/src/lib/chatCryptoCore.ts`) so a phone joins the same sealed
 * conversation as a browser.
 *
 * Do not "simplify" the wire format:
 * - identity public keys are base64 SPKI (91 bytes of the fixed P-256 DER
 *   prefix plus the uncompressed point) — exactly what WebCrypto publishes;
 * - the shared secret is WebCrypto's `deriveBits(…, 256)`, i.e. the X
 *   coordinate only, then HKDF-SHA-256 with the `travelai-chat-key-v1` info;
 * - envelopes are base64 JSON v2 with the wrapper's device key bound into the
 *   AES-GCM associated data;
 * - messages are `base64(iv12).base64(ciphertext||tag)`.
 *
 * The server sees public keys, opaque envelopes and ciphertext only. A
 * malicious server can still route a wrong key (see the web core's header);
 * this keeps content out of a curious server's reach, not a hostile one's.
 *
 * Pure JS (noble) rather than WebCrypto: Hermes has no `crypto.subtle`, and a
 * native module would take the app out of Expo Go. The factory takes its
 * randomness as an argument so the same code is exercised by Node probes.
 */

export type RandomSource = (length: number) => Uint8Array;

export interface ChatIdentity {
  /** Raw 32-byte ECDH private scalar. Never leaves the device. */
  secretKey: Uint8Array;
  /** Base64 SPKI — the only half that is published. */
  pubKey: string;
}

export interface EnvelopeSlot {
  pub: string;
  wrapper?: string | null;
  wrapperPub?: string | null;
}

export type MemberKeyMap = Record<string, string>;
export type MemberKeyMapMulti = Record<string, string[]>;

/** Matches the web client's HKDF info string. */
const HKDF_INFO = encodeUtf8('travelai-chat-key-v1');
const ENVELOPE_AAD_PREFIX = 'travelai-chat-envelope-v2';
const EMPTY = new Uint8Array(0);
const IV_BYTES = 12;

/** `30 59 30 13 06 07 2A8648CE3D0201 06 08 2A8648CE3D030107 03 42 00` + 65-byte point. */
const SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
  0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);
const RAW_PUBLIC_BYTES = 65;
const SECRET_BYTES = 32;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    out += BASE64_ALPHABET[first >> 2];
    out += BASE64_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    out += second === undefined ? '=' : BASE64_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    out += third === undefined ? '=' : BASE64_ALPHABET[third & 63];
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('Malformed base64.');
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const values = [0, 1, 2, 3].map((slot) => {
      const char = clean[index + slot];
      if (char === '=') return 0;
      const value = BASE64_ALPHABET.indexOf(char);
      if (value === -1) throw new Error('Malformed base64.');
      return value;
    });
    out[offset++] = (values[0] << 2) | (values[1] >> 4);
    if (offset < out.length) out[offset++] = ((values[1] & 15) << 4) | (values[2] >> 2);
    if (offset < out.length) out[offset++] = ((values[2] & 3) << 6) | values[3];
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function spkiFromRaw(raw: Uint8Array): string {
  return bytesToBase64(concatBytes(SPKI_PREFIX, raw));
}

function rawFromSpki(spkiB64: string): Uint8Array {
  const spki = base64ToBytes(spkiB64);
  const expected = SPKI_PREFIX.length + RAW_PUBLIC_BYTES;
  if (spki.length !== expected) throw new Error('That chat key is not a P-256 public key.');
  for (let index = 0; index < SPKI_PREFIX.length; index += 1) {
    if (spki[index] !== SPKI_PREFIX[index]) {
      throw new Error('That chat key is not a P-256 public key.');
    }
  }
  return spki.subarray(SPKI_PREFIX.length);
}

function envelopeAad(wrapperId: string, wrapperPub: string, recipientPub: string): Uint8Array {
  return encodeUtf8(`${ENVELOPE_AAD_PREFIX}|${wrapperId}|${wrapperPub}|${recipientPub}`);
}

interface EnvelopeV1 {
  v: 1;
  w: string;
  iv: string;
  d: string;
}

interface EnvelopeV2 {
  v: 2;
  w: string;
  wk: string;
  iv: string;
  d: string;
}

type Envelope = EnvelopeV1 | EnvelopeV2;

/** This device's identity, minted once and stored by the caller. */
function mintIdentity(random: RandomSource): ChatIdentity {
  const seed = random(SECRET_BYTES + 16);
  const secretKey = p256.utils.randomSecretKey(seed);
  const raw = p256.getPublicKey(secretKey, false);
  return { secretKey, pubKey: spkiFromRaw(raw) };
}

function identityFromStored(secretB64: string, pubB64: string): ChatIdentity {
  const secretKey = base64ToBytes(secretB64);
  if (secretKey.length !== SECRET_BYTES || !p256.utils.isValidSecretKey(secretKey)) {
    throw new Error('Stored chat identity is not a valid P-256 secret key.');
  }
  const raw = p256.getPublicKey(secretKey, false);
  if (spkiFromRaw(raw) !== pubB64) {
    throw new Error('Stored chat identity does not match its public key.');
  }
  return { secretKey, pubKey: pubB64 };
}

/**
 * ECDH + HKDF exactly like the browser: the shared secret is the X coordinate
 * (`deriveBits(…, 256)`), not the encoded point, and HKDF uses an empty salt.
 */
function deriveWrapKey(secretKey: Uint8Array, theirPubSpkiB64: string): Uint8Array {
  const raw = rawFromSpki(theirPubSpkiB64);
  const sharedPoint = p256.getSharedSecret(secretKey, raw, false);
  const sharedX = sharedPoint.subarray(1, 1 + SECRET_BYTES);
  return hkdf(sha256, sharedX, EMPTY, HKDF_INFO, SECRET_BYTES);
}

/** v2 envelope: self-describing wrapper key, slot-bound AEAD. */
function wrapConversationKey(
  random: RandomSource,
  wrapperId: string,
  identity: ChatIdentity,
  memberPubB64: string,
  conversationKey: Uint8Array
): string {
  const wrapKey = deriveWrapKey(identity.secretKey, memberPubB64);
  const iv = random(IV_BYTES);
  const sealed = gcm(wrapKey, iv, envelopeAad(wrapperId, identity.pubKey, memberPubB64)).encrypt(
    conversationKey
  );
  const envelope: EnvelopeV2 = {
    v: 2,
    w: wrapperId,
    wk: identity.pubKey,
    iv: bytesToBase64(iv),
    d: bytesToBase64(sealed),
  };
  return bytesToBase64(encodeUtf8(JSON.stringify(envelope)));
}

function wrapperPubKeysFor(
  envelope: EnvelopeV1,
  memberPubs: MemberKeyMap,
  cachedPubs: MemberKeyMap,
  devicePubs?: MemberKeyMapMulti
): string[] {
  const keys: string[] = [];
  const add = (value?: string) => {
    if (value && !keys.includes(value)) keys.push(value);
  };
  add(memberPubs[envelope.w]);
  add(cachedPubs[envelope.w]);
  for (const key of devicePubs?.[envelope.w] || []) add(key);
  return keys;
}

/**
 * Opens the envelope addressed to this device. v2 names its wrapper key and is
 * bound to this recipient's slot; v1 only names the wrapper's user, so every
 * published key of theirs is tried (legacy rows still in older trips).
 */
function unwrapConversationKey(
  envelopeB64: string,
  identity: ChatIdentity,
  memberPubs: MemberKeyMap,
  cachedPubs: MemberKeyMap,
  devicePubs?: MemberKeyMapMulti
): Uint8Array {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(decodeUtf8(base64ToBytes(envelopeB64))) as Envelope;
  } catch {
    throw new Error('Corrupt envelope from the server.');
  }
  if (!envelope || !envelope.iv || !envelope.d) {
    throw new Error('Unsupported envelope version.');
  }

  if (envelope.v === 2) {
    if (!envelope.w || !envelope.wk) throw new Error('This chat key envelope is incomplete.');
    const wrapKey = deriveWrapKey(identity.secretKey, envelope.wk);
    const opened = gcm(
      wrapKey,
      base64ToBytes(envelope.iv),
      envelopeAad(envelope.w, envelope.wk, identity.pubKey)
    ).decrypt(base64ToBytes(envelope.d));
    if (opened.length !== SECRET_BYTES) throw new Error('This chat key envelope is incomplete.');
    return opened;
  }

  if (envelope.v !== 1 || !envelope.w) throw new Error('Unsupported envelope version.');
  const candidates = wrapperPubKeysFor(envelope, memberPubs, cachedPubs, devicePubs);
  if (!candidates.length) {
    throw new Error(
      'The key wrapper is no longer a member; wait for another member to re-share.'
    );
  }
  let lastError: unknown = null;
  for (const theirPubB64 of candidates) {
    try {
      const wrapKey = deriveWrapKey(identity.secretKey, theirPubB64);
      const opened = gcm(wrapKey, base64ToBytes(envelope.iv)).decrypt(base64ToBytes(envelope.d));
      if (opened.length !== SECRET_BYTES) throw new Error('Invalid envelope payload.');
      return opened;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('This device cannot open the chat key envelope.');
}

function generateConversationKey(random: RandomSource): Uint8Array {
  return random(SECRET_BYTES);
}

function encryptText(random: RandomSource, conversationKey: Uint8Array, plaintext: string): string {
  const iv = random(IV_BYTES);
  const sealed = gcm(conversationKey, iv).encrypt(encodeUtf8(plaintext));
  return `${bytesToBase64(iv)}.${bytesToBase64(sealed)}`;
}

function decryptText(conversationKey: Uint8Array, body: string): string {
  const [ivB64, payloadB64] = body.split('.');
  if (!ivB64 || !payloadB64) throw new Error('Malformed ciphertext.');
  const plain = gcm(conversationKey, base64ToBytes(ivB64)).decrypt(base64ToBytes(payloadB64));
  return decodeUtf8(plain);
}

function encryptJson(random: RandomSource, conversationKey: Uint8Array, value: unknown): string {
  return encryptText(random, conversationKey, JSON.stringify(value));
}

function decryptJson<T>(conversationKey: Uint8Array, body: string): T {
  return JSON.parse(decryptText(conversationKey, body)) as T;
}

/**
 * Can the device this slot is addressed to open it? Only a provably usable slot
 * may be left alone; a filled-but-dead slot gets re-wrapped by the next
 * keyholder who opens the chat.
 */
export function slotIsUsable(
  slot: EnvelopeSlot | undefined,
  liveDeviceKeys: Set<string>,
  memberIds: Set<string>
): boolean {
  if (!slot) return false;
  if (slot.wrapperPub) return liveDeviceKeys.has(slot.wrapperPub);
  return Boolean(slot.wrapper && memberIds.has(slot.wrapper));
}

export function memberDeviceKeysOf(member: {
  pubKeys?: string[];
  pubKey?: string;
}): string[] {
  const keys: string[] = [];
  const add = (value?: string) => {
    if (value && !keys.includes(value)) keys.push(value);
  };
  if (member?.pubKeys?.length) for (const key of member.pubKeys) add(key);
  add(member?.pubKey);
  return keys;
}

export function createChatCrypto(random: RandomSource) {
  return {
    mintIdentity: () => mintIdentity(random),
    identityFromStored,
    wrapConversationKey: (
      wrapperId: string,
      identity: ChatIdentity,
      memberPubB64: string,
      conversationKey: Uint8Array
    ) => wrapConversationKey(random, wrapperId, identity, memberPubB64, conversationKey),
    unwrapConversationKey,
    generateConversationKey: () => generateConversationKey(random),
    encryptText: (conversationKey: Uint8Array, plaintext: string) =>
      encryptText(random, conversationKey, plaintext),
    decryptText,
    encryptJson: (conversationKey: Uint8Array, value: unknown) =>
      encryptJson(random, conversationKey, value),
    decryptJson,
  };
}

export type ChatCrypto = ReturnType<typeof createChatCrypto>;
