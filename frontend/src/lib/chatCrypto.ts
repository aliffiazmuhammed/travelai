/**
 * Browser-side end-to-end chat crypto (Milestone 7, F10).
 *
 * THE SERVER-SEES-NOTHING CONTRACT: the server only ever receives
 * - a public ECDH key half (`pubKey`),
 * - an envelope: the per-trip conversation key wrapped pairwise to one
 *   member's public key, opaque base64 —
 *     blob = base64(JSON { v:1, w: <wrapper userId>, iv, d })… expanded below,
 * - and message bodies as AES-GCM ciphertext, `<b64(iv)>.<b64(ct)>`.
 *
 * The private identity key NEVER leaves this browser except as a backup code
 * the user copies by hand. The conversation key is minted in the browser and
 * only ever travels inside envelopes.
 *
 * Envelope wire format (v1): the envelope value is base64 of a compact JSON
 * string `{ v: 1, w: <wrapper's userId>, iv: <b64>, d: <b64(ct)> }`. The
 * wrapper id rides INSIDE the envelope because the same recipient envelope
 * may be re-wrapped later by a different member (self-healing); the recipient
 * needs the *wrapper's* public key to rebuild the ECDH shared secret, and
 * wrappers can leave the trip — which is why member public keys are also
 * cached per-trip in localStorage (MEMBER_KEYS_CACHE) and merged with the
 * live member list on every fetch.
 */

import { api } from '@/services/api';

/* -------------------------------------------------------------------------- */
/*  Constants + tiny helpers                                                   */
/* -------------------------------------------------------------------------- */

const IDENTITY_STORE = 'chatai.identity.v1';
const MEMBER_KEYS_CACHE = (tripId: string) => `chatai.trip.${tripId}.memberkeys.v1`;
const HKDF_INFO = new TextEncoder().encode('travelai-chat-key-v1');
export const BACKUP_CODE_PREFIX = 'TAI1.';

const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function unb64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function isCryptoAvailable(): boolean {
  return Boolean(subtle) && typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined';
}

/* -------------------------------------------------------------------------- */
/*  Identity: one browser = one ECDH P-256 keypair                             */
/* -------------------------------------------------------------------------- */

export interface ChatIdentity {
  /** Non-extractable ECDH private half (for deriveBits). */
  priv: CryptoKey;
  /** Base64 SPKI — the only half that goes to the server. */
  pubKey: string;
}

interface IdentityJwk {
  priv: JsonWebKey;
  pubKey: string;
}

async function importIdentityPriv(privJwk: JsonWebKey): Promise<CryptoKey> {
  return subtle!.importKey(
    'jwk',
    privJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

/** Reads the stored identity (JWK → import). Returns null when absent/corrupt. */
export async function loadStoredIdentity(): Promise<ChatIdentity | null> {
  if (!isCryptoAvailable()) return null;
  try {
    const raw = localStorage.getItem(IDENTITY_STORE);
    if (!raw) return null;
    const stored = JSON.parse(raw) as IdentityJwk;
    if (!stored?.priv || !stored?.pubKey) return null;
    const priv = await importIdentityPriv(stored.priv);
    return { priv, pubKey: stored.pubKey };
  } catch {
    return null; // corrupt storage behaves like "no identity yet"
  }
}

/** Mints a fresh identity, stores it as a re-openable JWK, returns handles. */
export async function mintAndStoreIdentity(): Promise<ChatIdentity> {
  // extractable=true ONLY because the browser keeps a JWK snapshot for the
  // backup code; day-to-day handles below are imported non-extractable.
  const pair = (await subtle!.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair;
  const privJwk = await subtle!.exportKey('jwk', pair.privateKey);
  const spki = await subtle!.exportKey('spki', pair.publicKey);
  return persistIdentityFromPrivJwk(privJwk, b64(spki));
}

/** Backup code — base64(JSON { v, priv: JWK, pub }) with a readable prefix. */
function backupPayloadToCode(payload: unknown): string {
  return BACKUP_CODE_PREFIX + b64(new TextEncoder().encode(JSON.stringify(payload)));
}

function backupCodeToPayload(code: string): unknown | null {
  if (!code.startsWith(BACKUP_CODE_PREFIX)) return null;
  try {
    const decoded = new TextDecoder().decode(
      unb64(code.slice(BACKUP_CODE_PREFIX.length))
    );
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function persistIdentityFromPrivJwk(privJwk: JsonWebKey, pubKey: string): Promise<ChatIdentity> {
  const priv = await importIdentityPriv(privJwk);
  localStorage.setItem(
    IDENTITY_STORE,
    JSON.stringify({ v: 1, priv: privJwk, pubKey } satisfies { v: number } & IdentityJwk)
  );
  return { priv, pubKey };
}

/** One per browser: the loaded identity (kept so export/import can reach it). */
let identityPromise: Promise<ChatIdentity> | null = null;

/**
 * The module's identity: loaded from storage or minted once, and ALWAYS
 * (re-)published — publishing is idempotent for the same key and heals a
 * server-side wipe without user interaction.
 */
export async function ensureIdentity(): Promise<ChatIdentity | null> {
  if (!isCryptoAvailable()) return null;
  if (!identityPromise) {
    identityPromise = (async () => {
      const stored = await loadStoredIdentity();
      const identity = stored ?? (await mintAndStoreIdentity());
      try {
        await api.setMyChatKey(identity.pubKey);
      } catch {
        /* publication retries on the next chat open; envelopes only need it */
      }
      return identity;
    })().catch(() => {
      identityPromise = null;
      throw new Error('chat identity bootstrap failed');
    });
  }
  return identityPromise;
}

/**
 * Exports the current identity as a one-time backup code. Returns null when
 * no identity exists yet in this browser.
 */
export async function exportBackupCode(): Promise<string | null> {
  const identity = await ensureIdentity();
  if (!identity) return null;
  // Re-read the stored JWK (the CryptoKey itself is non-extractable by design).
  const raw = localStorage.getItem(IDENTITY_STORE);
  if (!raw) return null;
  const stored = JSON.parse(raw) as IdentityJwk;
  return backupPayloadToCode({ v: 1, priv: stored.priv, pub: identity.pubKey });
}

/**
 * Replaces this browser's identity with the one in a backup code. The private
 * key arrives; the public half is re-published (same value the envelopes were
 * wrapped to). Throws on any malformed code; consumers show the error.
 */
export async function importBackupCode(code: string): Promise<ChatIdentity> {
  if (!isCryptoAvailable()) throw new Error('Web crypto is unavailable in this browser.');
  const payload = backupCodeToPayload(code.trim()) as { v?: number; priv?: JsonWebKey; pub?: string } | null;
  if (!payload || payload.v !== 1 || !payload.priv || !payload.pub) {
    throw new Error('That does not look like a TravelAI chat key backup.');
  }
  // Prove the private half is usable before replacing the stored identity.
  const identity = await persistIdentityFromPrivJwk(payload.priv, payload.pub);
  // REPLACE the module memo too: it is captured for the tab's lifetime and
  // would otherwise keep handing out the freshly minted (wrong) identity, so
  // the key flow re-ran after an import still failed until a full reload.
  identityPromise = Promise.resolve(identity);
  try {
    await api.setMyChatKey(identity.pubKey);
  } catch {
    /* re-publish on next open */
  }
  return identity;
}

/* -------------------------------------------------------------------------- */
/*  Per-trip public-key cache (wrappers can leave the trip)                    */
/* -------------------------------------------------------------------------- */

export type MemberKeyMap = Record<string, string>;
/** F10d: every device key of a member (userId → published device keys). */
export type MemberKeyMapMulti = Record<string, string[]>;

export function mergeMemberKeys(tripId: string, incoming: MemberKeyMap): void {
  try {
    const raw = localStorage.getItem(MEMBER_KEYS_CACHE(tripId));
    const existing = raw ? (JSON.parse(raw) as MemberKeyMap) : {};
    localStorage.setItem(
      MEMBER_KEYS_CACHE(tripId),
      JSON.stringify({ ...existing, ...incoming })
    );
  } catch {
    /* a cache write failure never blocks chat */
  }
}

export function cachedMemberKeys(tripId: string): MemberKeyMap {
  try {
    const raw = localStorage.getItem(MEMBER_KEYS_CACHE(tripId));
    return raw ? (JSON.parse(raw) as MemberKeyMap) : {};
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/*  Envelopes: the conversation key, wrapped pairwise per member               */
/* -------------------------------------------------------------------------- */

interface EnvelopeV1 {
  v: 1;
  /** The wrapper's userId — the recipient derives against THIS public key. */
  w: string;
  /** base64 12-byte AES-GCM nonce. */
  iv: string;
  /** base64 wrapped conversation key (raw AES bytes). */
  d: string;
}

async function deriveWrapKey(myPriv: CryptoKey, theirPubB64: string): Promise<CryptoKey> {
  const theirPub = await subtle!.importKey(
    'spki',
    unb64(theirPubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = await subtle!.deriveBits({ name: 'ECDH', public: theirPub }, myPriv, 256);
  const hkdfSeed = await subtle!.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const wrapKeyBytes = await subtle!.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfSeed,
    256
  );
  return subtle!.importKey('raw', wrapKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Wraps one conversation key for one member (opaque value the server stores). */
export async function wrapEnvelope(
  wrapperId: string,
  myIdentity: ChatIdentity,
  memberPubB64: string,
  conversationKey: CryptoKey
): Promise<string> {
  const wrapKey = await deriveWrapKey(myIdentity.priv, memberPubB64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const raw = await subtle!.exportKey('raw', conversationKey);
  const wrapped = await subtle!.encrypt({ name: 'AES-GCM', iv }, wrapKey, raw);
  const envelope: EnvelopeV1 = {
    v: 1,
    w: wrapperId,
    iv: b64(iv),
    d: b64(wrapped),
  };
  return b64(new TextEncoder().encode(JSON.stringify(envelope)));
}

/** Resolves the wrapper's public key: live member list first, cache second. */
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
 * Unwraps MY envelope back into the conversation key (see EnvelopeV1).
 *
 * F10d: a wrapper may have wrapped from ANY of their devices, and the envelope
 * only records their USER id — so every published key of that user is tried
 * until one derives the right wrap key (only the actual wrapper's device key
 * can open it).
 */
export async function unwrapMyEnvelope(
  envelopeB64: string,
  myIdentity: ChatIdentity,
  memberPubs: MemberKeyMap,
  cachedPubs: MemberKeyMap,
  devicePubs?: MemberKeyMapMulti
): Promise<CryptoKey> {
  let envelope: EnvelopeV1;
  try {
    envelope = JSON.parse(new TextDecoder().decode(unb64(envelopeB64))) as EnvelopeV1;
  } catch {
    throw new Error('Corrupt envelope from the server.');
  }
  if (!envelope || envelope.v !== 1 || !envelope.w || !envelope.iv || !envelope.d) {
    throw new Error('Unsupported envelope version.');
  }
  const candidates = wrapperPubKeysFor(envelope, memberPubs, cachedPubs, devicePubs);
  if (!candidates.length) {
    throw new Error('The key wrapper is no longer a member; wait for another member to re-share.');
  }
  let lastError: unknown = null;
  for (const theirPubB64 of candidates) {
    try {
      const wrapKey = await deriveWrapKey(myIdentity.priv, theirPubB64);
      const raw = new Uint8Array(
        await subtle!.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, wrapKey, unb64(envelope.d))
      );
      return subtle!.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('This device cannot open the chat key envelope.');
}

/* -------------------------------------------------------------------------- */
/*  Messages: AES-256-GCM with the conversation key                            */
/* -------------------------------------------------------------------------- */

export async function generateConversationKey(): Promise<CryptoKey> {
  return subtle!.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** `<b64(iv)>.<b64(ct)>` — the wire format the backend stores verbatim. */
export async function encryptMessage(conversationKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await subtle!.encrypt(
    { name: 'AES-GCM', iv },
    conversationKey,
    new TextEncoder().encode(plaintext)
  );
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptMessage(conversationKey: CryptoKey, body: string): Promise<string> {
  const [ivB64, ctB64] = body.split('.');
  if (!ivB64 || !ctB64) throw new Error('Malformed ciphertext.');
  const plain = await subtle!.decrypt(
    { name: 'AES-GCM', iv: unb64(ivB64) },
    conversationKey,
    unb64(ctB64)
  );
  return new TextDecoder().decode(plain);
}
