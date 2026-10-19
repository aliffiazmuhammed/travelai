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
 *   shape walls (base64, member/device-only envelope targets, epoch
 *   monotonicity), bootstrap → decrypt roundtrip → ciphertext-on-the-wire →
 *   full-history self-heal for a late joiner → multi-device slots (F10d) →
 *   rotation rules.
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

async function wrapEnvelope(
  wrapperId: string,
  from: Identity,
  toPubB64: string,
  conv: CryptoKey
): Promise<string> {
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
  // Envelope wire format — THE SPA's contract (chatCrypto.ts): base64 of a
  // compact JSON `{ v, w, iv, d }`. The wrapper id rides inside because a
  // recipient may need a member's public key who has since LEFT the trip.
  const envelope = {
    v: 1,
    w: wrapperId,
    iv: Buffer.from(iv).toString('base64'),
    d: b64(ct),
  };
  return b64(new TextEncoder().encode(JSON.stringify(envelope)));
}

async function unwrapEnvelope(mine: Identity, envelope: string): Promise<CryptoKey> {
  // ECDH is symmetric about the PAIR, not about one party: to rebuild the same
  // shared secret the recipient derives with the SENDER's public key. The
  // pessimist's helper below exists only so the smoke states that explicitly.
  void mine;
  void envelope;
  throw new Error('unused — recipients use openEnvelopeAs(senderDeviceKeys, …)');
}

/** Opens one envelope with ONE candidate sender device key (null = cannot). */
async function openEnvelopeAs(
  recipient: Identity,
  senderKeyB64: string,
  envelope: string
): Promise<CryptoKey | null> {
  try {
    const env = JSON.parse(new TextDecoder().decode(unb64(envelope))) as {
      v: number;
      w: string;
      iv: string;
      d: string;
    };
    const senderPub = await subtle.importKey(
      'spki',
      unb64(senderKeyB64),
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
    const raw = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, wrapKey, unb64(env.d));
    return await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

/**
 * The SPA's F10d rule: try EVERY envelope the server handed over (this account
 * may have several devices) against every device key of the wrapper until one
 * opens — exactly what `unwrapMyEnvelope` does in the browser.
 */
async function openAny(
  recipient: Identity,
  senderDeviceKeys: string[],
  envelopes: string[]
): Promise<CryptoKey | null> {
  for (const envelope of envelopes) {
    for (const key of senderDeviceKeys) {
      const opened = await openEnvelopeAs(recipient, key, envelope);
      if (opened) return opened;
    }
  }
  return null;
}

/** Opens an envelope the way the SPA used to: wrapper id inside, pubKey map outside. */
async function decryptWithPair(
  recipient: Identity,
  memberPubs: Map<string, string>,
  envelope: string
): Promise<CryptoKey> {
  const env = JSON.parse(new TextDecoder().decode(unb64(envelope))) as { w: string };
  const senderPubB64 = memberPubs.get(env.w);
  if (!senderPubB64) throw new Error(`no pubkey for wrapper ${env.w}`);
  const opened = await openEnvelopeAs(recipient, senderPubB64, envelope);
  if (!opened) throw new Error('envelope did not open with the given sender key');
  return opened;
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
    const selfRound = await decryptWithPair(
      bobId,
      pubsMap({ [String(alice._id)]: aliceId.pubB64 }),
      await wrapEnvelope(String(alice._id), aliceId, bobId.pubB64, conv)
    );
    check('smoke crypto self-test: wrap(alice→bob) opens as bob', Boolean(selfRound), null);
  } catch (error) {
    check('smoke crypto self-test: wrap(alice→bob) opens as bob', false, String(error));
  }

  const aliceEnvelope = await wrapEnvelope(String(alice._id), aliceId, alicePub!, conv);
  const bobEnvelope = await wrapEnvelope(String(alice._id), aliceId, bobPub!, conv);
  const bootstrap = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: ALICE_EMAIL,
    body: {
      epoch: 1,
      // F10d: one slot per DEVICE public key (a plain member id is the legacy
      // form and stays valid — see the 409 race below).
      envelopes: {
        [alicePub!]: aliceEnvelope,
        [bobPub!]: bobEnvelope,
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
  check('bob sees epoch 1 and HIS OWN envelope (never alice\u2019s)', bobKeys.body?.epoch === 1 && typeof bobKeys.body?.mine === 'string', { mine: String(bobKeys.body?.mine).slice(0, 16) });
  check(
    'bob\u2019s candidate list is exactly his own slots',
    Array.isArray(bobKeys.body?.mineAll) && bobKeys.body.mineAll.length === 1 && bobKeys.body.mineAll[0] === bobEnvelope,
    { count: bobKeys.body?.mineAll?.length }
  );

  const bobConv = await openAny(bobId, [alicePub!], bobKeys.body.mineAll || []);
  check('bob opens the envelope addressed to HIS device key', Boolean(bobConv));
  if (!bobConv) throw new Error('cannot continue without bob\u2019s conversation key');

  /* ------------- F10d: a SECOND device of the same account unlocks ---------- */
  // The second browser mints its own identity and publishes it: the envelope
  // wrapped for the FIRST browser cannot open on it — it must wait for a slot.
  const aliceLaptop = await mintIdentity();
  const laptopPublish = await api('PUT', '/auth/chat-key', {
    email: ALICE_EMAIL,
    body: { pubKey: aliceLaptop.pubB64 },
  });
  check(
    'the second device published its key (200)',
    laptopPublish.status === 200,
    { status: laptopPublish.status, body: laptopPublish.body, tail: aliceLaptop.pubB64.slice(-8) }
  );
  const laptopState0 = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: ALICE_EMAIL });
  const laptopRow = laptopState0.body.members.find((m: any) => m.userId === String(alice._id));
  const aliceDeviceKeys = [laptopRow?.pubKey, aliceId.pubB64].filter(Boolean);
  check(
    'the second device is listed as its own envelope slot',
    Array.isArray(laptopRow?.pubKeys) && laptopRow.pubKeys.includes(aliceLaptop.pubB64),
    { pubKeys: laptopRow?.pubKeys, laptopTail: aliceLaptop.pubB64.slice(-8), desktopTail: aliceId.pubB64.slice(-8) }
  );
  check(
    'the second device is a visible heal gap (no slot yet)',
    !(laptopRow?.envelopedPubKeys || []).includes(aliceLaptop.pubB64),
    laptopRow?.envelopedPubKeys
  );
  const laptopBefore = await openAny(
    aliceLaptop,
    [aliceId.pubB64, aliceLaptop.pubB64],
    laptopState0.body.mineAll || []
  );
  check('without a slot the new device opens NOTHING (honest keyless)', laptopBefore === null);

  // The holder (alice\u2019s first browser) heals the gap — exactly what the SPA's
  // ready-state poll does. No user action, no backup code.
  const laptopHeal = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: {
      envelopes: {
        [aliceLaptop.pubB64]: await wrapEnvelope(String(alice._id), aliceId, aliceLaptop.pubB64, conv),
      },
    },
  });
  check('the holder heals the second device\u2019s slot (200)', laptopHeal.status === 200, laptopHeal.body);
  const laptopState1 = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: ALICE_EMAIL });
  check(
    'both of the account\u2019s devices are now covered',
    (laptopState1.body.members.find((m: any) => m.userId === String(alice._id))?.envelopedPubKeys || []).length === 2,
    laptopState1.body.members.find((m: any) => m.userId === String(alice._id))?.envelopedPubKeys
  );
  const laptopConv = await openAny(aliceLaptop, aliceDeviceKeys, laptopState1.body.mineAll || []);
  check('the second device opens the SAME conversation key (multi-device)', Boolean(laptopConv));
  if (laptopConv) {
    const laptopPlain = 'Laptop screen works too \u2014 same key, no backup code.';
    const laptopRead = await decryptBody(laptopConv, await encryptBody(bobConv, laptopPlain));
    check('and it decrypts what the first device\u2019s key produced', laptopRead === laptopPlain, laptopRead);
  }


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
  const aliceConv = await openAny(aliceId, [aliceId.pubB64, aliceLaptop.pubB64], bootstrap.body.mineAll || []);
  check('alice opens her own device envelope', Boolean(aliceConv));
  const roundtrip = row && aliceConv ? await decryptBody(aliceConv, row.body) : null;
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
    body: {
      envelopes: {
        // F10d: the slot is carol\u2019s DEVICE key, not her member id.
        [carolPubFromState!]: await wrapEnvelope(String(alice._id), aliceId, carolPubFromState, conv),
      },
    },
  });
  check('alice self-heals an envelope for carol into epoch 1 (200)', heal.status === 200, heal.body);

  const carolKeys = await api('GET', `/itinerary/${tripId}/chat/keys`, { email: CAROL_EMAIL });
  const carolConv = await openAny(carolId, [aliceId.pubB64, aliceLaptop.pubB64], carolKeys.body.mineAll || []);
  check('carol opens her device envelope', Boolean(carolConv));
  const carolReads = carolConv ? await decryptBody(carolConv, ciphertext) : null;
  check('carol decrypts the HISTORICAL message (full-history decision)', carolReads === bobPlain, carolReads);

  /* ------------------------ envelope + epoch walls --------------------------- */
  const foreignTarget = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { [String(eve._id)]: validB64Envelope() } },
  });
  check('envelope to a NON-MEMBER is rejected', foreignTarget.status === 400, foreignTarget.status);

  const eveDeviceKey = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { 'STRANGER-DEVICE-KEY=': validB64Envelope() } },
  });
  check('envelope to a non-member DEVICE key is rejected (F10d wall)', eveDeviceKey.status === 400, eveDeviceKey.status);

  const junkPayload = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: ALICE_EMAIL,
    body: { envelopes: { [bobPub!]: '!!! junk !!!' } },
  });
  check('a non-base64 envelope payload is a 400', junkPayload.status === 400, junkPayload.status);

  const eveEnvelope = await api('POST', `/itinerary/${tripId}/chat/envelopes`, {
    email: EVE_EMAIL,
    body: { envelopes: { [bobPub!]: validB64Envelope() } },
  });
  check('a stranger cannot inject envelopes (404)', eveEnvelope.status === 404, eveEnvelope.status);

  const rotateHigher = await api('PUT', `/itinerary/${tripId}/chat/keys`, {
    email: BOB_EMAIL,
    body: {
      epoch: 2,
      envelopes: {
        [alicePub!]: validB64Envelope(),
        [bobPub!]: validB64Envelope(),
        [carolPubFromState!]: validB64Envelope(),
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
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const d = new Uint8Array(60);
  globalThis.crypto.getRandomValues(d);
  const envelope = {
    v: 1,
    w: 'ffffffffffffffffffffffff', // opaque fake wrapper id (shape test only)
    iv: Buffer.from(iv).toString('base64'),
    d: b64(d),
  };
  return b64(new TextEncoder().encode(JSON.stringify(envelope)));
}

/** Builds the envelope-title→pubkey map decryptWithPair consumes. */
function pubsMap(pairs: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(pairs));
}

main().catch(async (error) => {
  console.error('smoke-f10 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

// keep the unused helper referenced (it documents why pairwise is required)
void unwrapEnvelope;
