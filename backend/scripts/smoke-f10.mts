/**
 * Live smoke test for Milestone 7 sprint F10 (end-to-end chat encryption).
 * Run with the API server up:
 *   npm start        (respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-f10.mts
 *
 * NOTE: the auth limiter is 10 signins / 15 min / IP and lives IN MEMORY —
 * several smoke runs in a row (e.g. after a crash) exhaust it; restart the
 * API server between runs or wait out the window.
 *
 * Simulates REAL browser clients over Node WebCrypto (the SPA will run the
 * same flow): each user mints an ECDH P-256 keypair and publishes only the
 * public half; the trip's conversation key is generated client-side and
 * enveloped pairwise (ECDH → HKDF → AES-GCM). The server must behave like a
 * blind carrier end to end:
 *   shape walls (base64, member-only envelope targets, epoch monotonicity),
 *   bootstrap → decrypt roundtrip → ciphertext-on-the-wire → full-history
 *   self-heal for a late joiner → rotation rules.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';
import TripChatKey from '../src/models/TripChatKey.js';
import type { ChatKeyState } from '../src/services/collab/chatKeys.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const ALICE_EMAIL = 'smoke-f10-alice@example.com';
const BOB_EMAIL = 'smoke-f10-bob@example.com';
const CAROL_EMAIL = 'smoke-f10-carol@example.com'; // joins later — the full-history case
const EVE_EMAIL = 'smoke-f10-eve@example.com'; // never a member
const PASSWORD = 'Smoke-F10-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

const b64 = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes as Uint8Array).toString('base64');
const unb64 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64'));
const subtle = globalThis.crypto.subtle;
const HKDF_INFO = new TextEncoder().encode('travelai-chat-key-v1');

/** A simulated browser identity: raw crypto handles + the published public SPKI. */
interface Identity {
  priv: CryptoKey;
  pub: CryptoKey;
  pubB64: string;
}

async function mintIdentity(): Promise<Identity> {
  const pair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const spki = await subtle.exportKey('spki', pair.publicKey);
  return {
    priv: pair.privateKey,
    pub: pair.publicKey,
    pubB64: b64(spki),
  };
}

const ids = new Map<string, Map<string, CryptoKey>>(); // email → (epoch → conv key)

async function wrapEnvelope(from: Identity, toPubB64: string, conv: CryptoKey): Promise<string> {
  const toPub = await subtle.importKey(
    'spki',
    unb64(toPubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = await subtle.deriveBits({ name: 'ECDH', public: toPub }, from.priv, 256);
  const hkdfSeed = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const wrapKeyBytes = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfSeed,
    256
  );
  const wrapKey = await subtle.importKey('raw', wrapKeyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const raw = await subtle.exportKey('raw', conv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, raw);
  // Envelope wire format (the SPA owns the same convention): ONE base64 blob
  // of `iv ‖ ciphertext` — recipients split at the fixed 12-byte nonce.
  const blob = new Uint8Array(12 + ct.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ct), 12);
  return b64(blob);
}

async function unwrapEnvelope(mine: Identity, envelope: string): Promise<CryptoKey> {
  // ECDH is symmetric about the PAIR, not about one party: to rebuild the same
  // shared secret the recipient derives with the SENDER's public key. The
  // pessimist's helper below exists only so the smoke states that explicitly.
  void mine;
  void envelope;
  throw new Error('unused — recipients use decryptWithPair(senderPubB64, …)');
}

/** Wraps symmetrically: sender priv × recipient pub. */
async function decryptWithPair(
  recipient: Identity,
  senderPubB64: string,
  envelope: string
): Promise<CryptoKey> {
  const blob = unb64(envelope);
  const iv = blob.slice(0, 12); // the fixed nonce prefix (see wrapEnvelope)
  const ct = blob.slice(12);
  const senderPub = await subtle.importKey(
    'spki',
    unb64(senderPubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = await subtle.deriveBits({ name: 'ECDH', public: senderPub }, recipient.priv, 256);
  const hkdfSeed = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const wrapKeyBytes = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfSeed,
    256
  );
  const wrapKey = await subtle.importKey('raw', wrapKeyBytes, 'AES-GCM', false, ['decrypt']);
  const raw = await subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, ct);
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptBody(conv: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    conv,
    new TextEncoder().encode(plaintext)
  );
  return `${b64(iv)}.${b64(ct)}`;
}

async function decryptBody(conv: CryptoKey, body: string): Promise<string> {
  const [ivB64, ctB64] = body.split('.');
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, conv, unb64(ctB64));
  return new TextDecoder().decode(plain);
}

/* ------------------------------ HTTP helpers ------------------------------ */

const jars = new Map<string, string>();
function authHeader(email: string): Record<string, string> {
  const token = jars.get(email);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  opts: { email?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeader(opts.email || '') },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body: any = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const tokenCookie = setCookies.find((cookie) => cookie.startsWith('token=')) ?? '';
  if (tokenCookie) jars.set(opts.email || '', tokenCookie.split(';')[0].split('=')[1]);
  return { status: res.status, body };
}

async function signin(email: string): Promise<void> {
  const res = await api('POST', '/auth/signin', { email, body: { email, password: PASSWORD } });
  check(`signin ${email}`, res.status === 200, res.body);
}

async function publishKey(email: string, identity: Identity): Promise<boolean> {
  const res = await api('PUT', '/auth/chat-key', {
    email,
    body: { pubKey: identity.pubB64 },
  });
  return res.status === 200;
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const upsert = (email: string) =>
    User.findOneAndUpdate(
      { email },
      { email, password: passwordHash },
      { upsert: true, new: true }
    );
  const alice = await upsert(ALICE_EMAIL);
  const bob = await upsert(BOB_EMAIL);
  const carol = await upsert(CAROL_EMAIL);
  const eve = await upsert(EVE_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_f10': true });
  const trip = await Trip.create({
    userId: alice._id,
    tripDetails: {
      smoke_f10: true,
      trip_title: 'F10 E2EE Smoke',
      duration_days: 2,
      budget_per_person: 9000,
      group_type: 'friends',
      season: 'summer',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'F10 E2EE Smoke',
    status: 'planned',
    members: [
      { userId: alice._id, role: 'owner', joinedAt: new Date() },
      { userId: bob._id, role: 'commenter', joinedAt: new Date() },
    ],
  });
  await TripComment.deleteMany({ tripId: trip._id });
  await TripChatKey.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  await signin(ALICE_EMAIL);
  await signin(BOB_EMAIL);
  await signin(CAROL_EMAIL);
  await signin(EVE_EMAIL);

  /* ------------------- identity publishing + shape walls ------------------- */
  const aliceId = await mintIdentity();
  const bobId = await mintIdentity();

  check('alice published her chat public key', await publishKey(ALICE_EMAIL, aliceId));
  check('bob published his chat public key', await publishKey(BOB_EMAIL, bobId));

  const junkKey = await api('PUT', '/auth/chat-key', { email: CAROL_EMAIL, body: { pubKey: 'not base64!!' } });
  check('a malformed public key is a 400', junkKey.status === 400, junkKey.body);

  /* ------------------------------ non-member wall --------------------------- */
  const evePeek = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: EVE_EMAIL });
  check('a stranger cannot read the key state (404)', evePeek.status === 404, evePeek.status);

  /* -------------------------------- bootstrap ------------------------------- */
  const emptyState = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: ALICE_EMAIL });
  check('no epoch yet: members listed with no envelopes', emptyState.status === 200 && emptyState.body?.epoch === undefined, emptyState.body);

  const conv = (await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])) as CryptoKey;
  const state0: ChatKeyState = emptyState.body;
  const pubOf = (state: ChatKeyState, userId: string) =>
    state.members.find((m) => m.userId === userId)?.pubKey;
  const bobPub = pubOf(state0, String(bob._id));
  const alicePub = pubOf(state0, String(alice._id));
  check('the key state carries both members\u2019 published public keys', Boolean(bobPub) && Boolean(alicePub), state0.members);
  // Identity invariants: the served pubKey must BE each user's published one —
  // a swapped matrix would make envelopes undecryptable without any error.
  check('served pubKeys match the identities actually published', alicePub === aliceId.pubB64 && bobPub === bobId.pubB64, {
    aliceServed: (alicePub || '').slice(0, 16),
    aliceMinted: aliceId.pubB64.slice(0, 16),
    bobServed: (bobPub || '').slice(0, 16),
    bobMinted: bobId.pubB64.slice(0, 16),
  });

  // Helpers self-test: wrap from alice → bob and open it with bob, entirely
  // offline; isolates smoke-crypto bugs from server-side envelope corruption.
  try {
    const selfRound = await decryptWithPair(bobId, aliceId.pubB64, await wrapEnvelope(aliceId, bobId.pubB64, conv));
    check('smoke crypto self-test: wrap(alice→bob) opens as bob', Boolean(selfRound), null);
  } catch (error) {
    check('smoke crypto self-test: wrap(alice→bob) opens as bob', false, String(error));
  }

  const aliceEnvelope = await wrapEnvelope(aliceId, alicePub!, conv);
  const bobEnvelope = await wrapEnvelope(aliceId, bobPub!, conv);
  const bootstrap = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: ALICE_EMAIL,
    body: {
      epoch: 1,
      envelopes: {
        [String(alice._id)]: aliceEnvelope,
        [String(bob._id)]: bobEnvelope,
      },
    },
  });
  check('alice bootstraps epoch 1 with envelopes for both members (200)', bootstrap.status === 200 && bootstrap.body?.epoch === 1, bootstrap.body);

  const race = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: BOB_EMAIL,
    body: { epoch: 1, envelopes: { [String(bob._id)]: validB64Envelope() } },
  });
  check('re-requesting the same epoch is a 409 (bootstrap race guard)', race.status === 409, race.status);

  /* --------------------------- decrypt roundtrip ---------------------------- */
  const bobKeys = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: BOB_EMAIL });
  check('bob sees epoch 1 and HIS OWN envelope (never alice\u2019s)', bobKeys.body?.epoch === 1 && typeof bobKeys.body?.mine === 'string', { mine: bobKeys.body?.mine });
  check(
    'the served envelope is byte-identical to what was sent',
    bobKeys.body.mine === bobEnvelope,
    { sent: bobEnvelope.slice(0, 24), got: String(bobKeys.body?.mine || '').slice(0, 24) }
  );

  const bobConv = await decryptWithPair(bobId, alicePub!, bobKeys.body.mine);
  // The message wire format: "<b64 iv>.<b64 ct>" — Bob encrypts a Day-2 note.
  const bobPlain = 'Rent scooters for Day 2 \u2014 meet 9am at Juhu beach.';
  const ciphertext = await encryptBody(bobConv, bobPlain);
  check('ciphertext differs from plaintext (never a leak)', !ciphertext.includes('scooters'), ciphertext.slice(0, 60));

  const posted = await api('POST', `/itinerary/${tripId}/comments`, {
    email: BOB_EMAIL,
    body: { body: ciphertext, e2ee: true, day: 2 },
  });
  check('bob posts an encrypted comment (201, flagged e2ee)', posted.status === 201 && posted.body?.comment?.e2ee === true, posted.body);
  check('the stored body is opaque to the server (no plaintext round-trip)', posted.body?.comment?.body === ciphertext, posted.body?.comment?.body?.slice(0, 40));

  const aliceCommentView = await api('GET', `/itinerary/${tripId}/comments`, { email: ALICE_EMAIL });
  const row = aliceCommentView.body?.comments?.find((c: any) => String(c._id) === String(posted.body.comment._id));
  const aliceConv = await decryptWithPair(aliceId, alicePub!, (bootstrap.body.mine));
  const roundtrip = row ? await decryptBody(aliceConv, row.body) : null;
  check('alice decrypts bob\u2019s message to the exact plaintext', roundtrip === bobPlain, roundtrip);

  const bodyBounds = await api('POST', `/itinerary/${tripId}/comments`, {
    email: BOB_EMAIL,
    body: { body: 'x'.repeat(5000), e2ee: false },
  });
  check('a plaintext body over the flat cap is still a 400', bodyBounds.status === 400, bodyBounds.status);

  /* --------------------- carol joins late: FULL HISTORY --------------------- */
  const carolId = await mintIdentity();
  check('carol minted her identity before her first keys view', true);
  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.updateOne(
    { _id: trip._id },
    { $push: { members: { userId: carol._id, role: 'commenter', joinedAt: new Date() } } }
  );
  await mongoose.disconnect();

  await publishKey(CAROL_EMAIL, carolId);
  const carolKeys0 = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: CAROL_EMAIL });
  check('carol (fresh member) has NO envelope yet (self-heal gap)', carolKeys0.status === 200 && carolKeys0.body?.mine === undefined, carolKeys0.body?.members?.length);

  // Alice's open client self-heals: wraps the SAME conversation key for carol.
  const carolPubFromState = carolKeys0.body.members.find(
    (m: any) => String(m.userId) === String(carol._id)
  )?.pubKey;
  check('carol\u2019s public key is visible to members who may self-heal', Boolean(carolPubFromState));
  const heal = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { [String(carol._id)]: await wrapEnvelope(aliceId, carolPubFromState, conv) } },
  });
  check('alice self-heals an envelope for carol into epoch 1 (200)', heal.status === 200, heal.body);

  const carolKeys = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: CAROL_EMAIL });
  const carolConv = await decryptWithPair(carolId, alicePub!, carolKeys.body.mine);
  const carolReads = await decryptBody(carolConv, ciphertext);
  check('carol decrypts the HISTORICAL message (full-history decision)', carolReads === bobPlain, carolReads);

  /* ------------------------ envelope + epoch walls --------------------------- */
  const foreignTarget = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { [String(eve._id)]: validB64Envelope() } },
  });
  check('envelope to a NON-MEMBER is rejected', foreignTarget.status === 400, foreignTarget.status);

  const junkPayload = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { [String(bob._id)]: '!!! junk !!!' } },
  });
  check('a non-base64 envelope payload is a 400', junkPayload.status === 400, junkPayload.status);

  const eveEnvelope = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: EVE_EMAIL,
    body: { envelopes: { [String(bob._id)]: validB64Envelope() } },
  });
  check('a stranger cannot inject envelopes (404)', eveEnvelope.status === 404, eveEnvelope.status);

  const rotateHigher = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: BOB_EMAIL,
    body: {
      epoch: 2,
      envelopes: {
        [String(alice._id)]: validB64Envelope(),
        [String(bob._id)]: validB64Envelope(),
        [String(carol._id)]: validB64Envelope(),
      },
    },
  });
  check('a plain member may rotate to a HIGHER epoch (forward-only keys)', rotateHigher.status === 200 && rotateHigher.body?.epoch === 2, rotateHigher.body);

  const rotateStale = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: BOB_EMAIL,
    body: { epoch: 1, envelopes: { [String(bob._id)]: validB64Envelope() } },
  });
  check('predicting an OLD epoch is a 409 (monotonic epochs)', rotateStale.status === 409, rotateStale.status);

  /* --------------------------------- cleanup -------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripChatKey.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_f10': true });
  await User.deleteMany({ email: { $in: [ALICE_EMAIL, BOB_EMAIL, CAROL_EMAIL, EVE_EMAIL] } });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

function validB64Envelope(): string {
  const blob = new Uint8Array(12 + 60); // iv ‖ wrapped-key bytes, the fake shape
  globalThis.crypto.getRandomValues(blob);
  return Buffer.from(blob).toString('base64');
}

main().catch(async (error) => {
  console.error('smoke-f10 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

// keep the unused helper referenced (it documents why pairwise is required)
void unwrapEnvelope;
