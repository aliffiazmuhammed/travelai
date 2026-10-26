/**
 * Browser-side end-to-end chat crypto — the dependency-free CORE (Milestone 7,
 * F10; hardened in F10e).
 *
 * WHY NO IMPORTS: this is the security-critical half of the chat, so it must be
 * executable by the repo's live probes through `tsx` exactly as the browser
 * bundles it — the same rule `lib/proposalApply.ts` follows. `lib/chatCrypto.ts`
 * is the thin shell on top: it adds the one thing that needs the network
 * (publishing the public half) and re-exports everything here.
 *
 * THE SERVER-SEES-NOTHING CONTRACT — and its honest limit. What the server ever
 * receives: a public ECDH half (`pubKey`), an *envelope* (the per-trip
 * conversation key wrapped pairwise to one member's public key, opaque base64),
 * and message bodies as AES-GCM ciphertext, `<b64(iv)>.<b64(ct)>`. The private
 * identity key never leaves this browser at all, and the conversation key only
 * ever travels inside envelopes.
 *
 * The limit that must not be papered over: the server *routes* keys, so a
 * malicious or compromised server can hand a member the wrong public key and
 * read everything from then on, and it always sees the metadata (who wrote,
 * when, how much). This design protects content from a *curious* server and
 * from anyone who reads the database — not from a hostile one. See
 * `docs/roadmap-milestone-7-conversation.md` §12.13.
 *
 * ENVELOPE WIRE FORMAT
 * - v2 (written by this code): base64 of `{ v:2, w, wk, iv, d }` where `w` is the
 *   wrapper's userId, `wk` the *device key* that wrapped it, `iv` the 12-byte
 *   nonce and `d` the wrapped conversation key. The AEAD is bound to the slot
 *   with associated data (`ENVELOPE_AAD_PREFIX | w | wk | recipientPub`), so an
 *   envelope copied to another slot, or one whose metadata was edited in
 *   transit, fails to open deterministically instead of being "tried anyway".
 * - v1 (legacy, still readable): base64 of `{ v:1, w, iv, d }` — no `wk`, no
 *   AAD. The recipient must try every published key of the wrapper.
 */

/* -------------------------------------------------------------------------- */
/*  Constants + tiny helpers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Personal accounts keep the original storage key. Agency accounts use a
 * realm/tenant-scoped key (PA0) so a browser that holds both a personal and an
 * agency session never shares one E2EE device identity between them.
 */
const IDENTITY_STORE = (scope?: string) =>
  scope ? `chatai.identity.${scope}.v1` : 'chatai.identity.v1';
const MEMBER_KEYS_CACHE = (tripId: string) => `chatai.trip.${tripId}.memberkeys.v1`;
const HKDF_INFO = new TextEncoder().encode('travelai-chat-key-v1');
/** v2 envelopes bind their slot into the AEAD (see the header). */
const ENVELOPE_AAD_PREFIX = 'travelai-chat-envelope-v2';
/** base64 chunks fed to `String.fromCharCode` — keeps big buffers off the stack. */
const B64_CHUNK = 0x8000;

const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  // Spreading the whole array into `fromCharCode` throws RangeError on long
  // buffers, so walk it in chunks (a 2000-char message already needs ~2.7k).
  for (let i = 0; i < view.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + B64_CHUNK));
  }
  return btoa(binary);
}

function unb64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function isCryptoAvailable(): boolean {
  return Boolean(subtle) && typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined';
}

/* -------------------------------------------------------------------------- */
/*  Identity: one browser = one ECDH P-256 keypair                             */
/* -------------------------------------------------------------------------- */

export interface ChatIdentity {
  /**
   * ECDH private half (for `deriveBits`). Extractable, deliberately: it is
   * imported from the JWK snapshot this browser stores in `localStorage`, so
   * extractability adds nothing an XSS could not already reach — and a key that
   * cannot be re-exported cannot be re-wrapped, which would break self-healing
   * for everyone but the device that minted it (F10e).
   */
  priv: CryptoKey;
  /** Base64 SPKI — the only half that goes to the server. */
  pubKey: string;
}

export interface IdentityJwk {
  priv: JsonWebKey;
  pubKey: string;
}

async function importIdentityPriv(privJwk: JsonWebKey): Promise<CryptoKey> {
  return subtle!.importKey(
    'jwk',
    privJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
}

/** Reads the stored identity (JWK → import). Returns null when absent/corrupt. */
export async function loadStoredIdentity(scope?: string): Promise<ChatIdentity | null> {
  if (!isCryptoAvailable()) return null;
  try {
    const raw = localStorage.getItem(IDENTITY_STORE(scope));
    if (!raw) return null;
    const stored = JSON.parse(raw) as IdentityJwk;
    if (!stored?.priv || !stored?.pubKey) return null;
    const priv = await importIdentityPriv(stored.priv);
    return { priv, pubKey: stored.pubKey };
  } catch {
    return null; // corrupt storage behaves like "no identity yet"
  }
}

/**
 * Stores an identity's JWK snapshot. This is the reload path only — a CryptoKey
 * handle cannot survive a page load — and it never leaves the browser.
 */
export async function persistIdentityFromPrivJwk(
  privJwk: JsonWebKey,
  pubKey: string,
  scope?: string
): Promise<ChatIdentity> {
  const priv = await importIdentityPriv(privJwk);
  localStorage.setItem(
    IDENTITY_STORE(scope),
    JSON.stringify({ v: 1, priv: privJwk, pubKey } satisfies { v: number } & IdentityJwk)
  );
  return { priv, pubKey };
}

/** Mints a fresh identity, stores it as a re-openable JWK, returns handles. */
export async function mintAndStoreIdentity(scope?: string): Promise<ChatIdentity> {
  if (!isCryptoAvailable()) throw new Error('Web crypto is unavailable in this browser.');
  const pair = (await subtle!.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair;
  const privJwk = await subtle!.exportKey('jwk', pair.privateKey);
  const spki = await subtle!.exportKey('spki', pair.publicKey);
  return persistIdentityFromPrivJwk(privJwk, b64(spki), scope);
}

/**
 * The identity is NOT portable and never leaves the browser: no export, no
 * import, no user-visible code (user call, §12.14). A new browser or a cleared
 * profile mints a fresh device key and is unlocked by the trip's healing flow
 * like any other second device — the conversation key is what the history needs,
 * and that arrives on its own.
 */

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

/** Every published device key of one member, newest first, deduped. */
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

/* -------------------------------------------------------------------------- */
/*  Envelopes: the conversation key, wrapped pairwise per member               */
/* -------------------------------------------------------------------------- */

interface EnvelopeV1 {
  v: 1;
  /** The wrapper's userId — the recipient derives against THIS user's keys. */
  w: string;
  /** base64 12-byte AES-GCM nonce. */
  iv: string;
  /** base64 wrapped conversation key (raw AES bytes). */
  d: string;
}

interface EnvelopeV2 {
  v: 2;
  /** The wrapper's userId. */
  w: string;
  /** The wrapper's DEVICE key (base64 SPKI) — exactly what derives the wrap key. */
  wk: string;
  iv: string;
  d: string;
}

/** What one envelope slot looks like from the outside (F10e). */
export interface EnvelopeSlot {
  /** The recipient device key this slot is addressed to. */
  pub: string;
  /** The wrapper's userId (`w`); null when the blob is unreadable. */
  wrapper?: string | null;
  /** The wrapper's device key (`wk`, v2 only); null for v1/unreadable blobs. */
  wrapperPub?: string | null;
}

type Envelope = EnvelopeV1 | EnvelopeV2;

function envelopeAad(wrapperId: string, wrapperPub: string, recipientPub: string): Uint8Array {
  return new TextEncoder().encode(
    `${ENVELOPE_AAD_PREFIX}|${wrapperId}|${wrapperPub}|${recipientPub}`
  );
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

/**
 * Wraps one conversation key for one member (the opaque value the server
 * stores). v2: self-describing wrapper key + slot-bound AEAD (F10e).
 */
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
  const wrapped = await subtle!.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: envelopeAad(wrapperId, myIdentity.pubKey, memberPubB64),
    },
    wrapKey,
    raw
  );
  const envelope: EnvelopeV2 = {
    v: 2,
    w: wrapperId,
    wk: myIdentity.pubKey,
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

/** Raw conversation-key bytes → the working handle used to read and write. */
async function conversationKeyFromBytes(raw: Uint8Array): Promise<CryptoKey> {
  // Extractable on purpose (F10e): every holder must be able to WRAP the key
  // again for a new device, which is the whole self-healing mechanism. Keeping
  // it non-extractable silently disabled healing for every device that adopted
  // (rather than minted) the key — i.e. for every device after a reload.
  return subtle!.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

/**
 * Unwraps MY envelope back into the conversation key (see the header for both
 * wire formats).
 *
 * v2 knows exactly which key wrapped it, so it is a single deterministic
 * attempt. v1 only records the wrapper's userId, so — F10d — every published key
 * of that user is tried until one derives the right wrap key.
 */
export async function unwrapMyEnvelope(
  envelopeB64: string,
  myIdentity: ChatIdentity,
  memberPubs: MemberKeyMap,
  cachedPubs: MemberKeyMap,
  devicePubs?: MemberKeyMapMulti
): Promise<CryptoKey> {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(unb64(envelopeB64))) as Envelope;
  } catch {
    throw new Error('Corrupt envelope from the server.');
  }
  if (!envelope || !envelope.iv || !envelope.d) {
    throw new Error('Unsupported envelope version.');
  }

  if (envelope.v === 2) {
    if (!envelope.w || !envelope.wk) throw new Error('This chat key envelope is incomplete.');
    const wrapKey = await deriveWrapKey(myIdentity.priv, envelope.wk);
    const raw = new Uint8Array(
      await subtle!.decrypt(
        {
          name: 'AES-GCM',
          iv: unb64(envelope.iv),
          additionalData: envelopeAad(envelope.w, envelope.wk, myIdentity.pubKey),
        },
        wrapKey,
        unb64(envelope.d)
      )
    );
    return conversationKeyFromBytes(raw);
  }

  if (envelope.v !== 1 || !envelope.w) {
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
      return conversationKeyFromBytes(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('This device cannot open the chat key envelope.');
}

/**
 * F10e: can the device this slot is addressed to actually OPEN it? Only a slot
 * we can prove usable may be left alone — everything else is re-wrapped by the
 * next keyholder who opens the chat, which is what makes a filled-but-dead slot
 * (its wrapper left the trip, its blob was overwritten with rubbish, or it was
 * written for a key nobody publishes any more) recoverable instead of a
 * permanent lockout.
 *
 * v2 answers this exactly: the wrapper's device key is recorded, so the slot is
 * usable while that key is still published for that member. v1 records only the
 * wrapper's userId, so membership is the best test available — the residual
 * case (a live wrapper whose key left their capped key list) is documented in
 * §12.13.
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
