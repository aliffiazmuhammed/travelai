/**
 * Live smoke test for Milestone 7 sprint F12a (@TravelAI assistant).
 * Run with the API server up — IDEALLY with a tight daily budget so the cap
 * is exercised live without provider spend:
 *   $env:BOT_DAILY_LIMIT='1'; npm start        (respects SMOKE_PORT=5059)
 *   npx tsx scripts/smoke-f12a.mts
 *
 * NOTE: the auth limiter is 10 signins / 15 min / IP and lives IN MEMORY —
 * restart the API server between runs (like smoke-f10).
 *
 * Covers: the mention gate (missing mention → 400), shape walls (over-cap
 * prompt, >8 context lines, >500-char context line), a non-member 404, the
 * viewer rank floor, TWO real provider calls (per-user daily buckets: alice
 * burns the limit of 1, her second ask 429s, bob's own bucket still works),
 * and bot-flagged comment rows round-tripping (post → GET → projected).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const ALICE_EMAIL = 'smoke-f12a-alice@example.com';
const BOB_EMAIL = 'smoke-f12a-bob@example.com'; // viewer rank — the floor
const EVE_EMAIL = 'smoke-f12a-eve@example.com'; // never a member
const PASSWORD = 'Smoke-F12A-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', JSON.stringify(detail)?.slice(0, 300));
  }
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
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  const tokenCookie = (Array.isArray(setCookies) ? setCookies : []).find((c: string) =>
    String(c).startsWith('token=')
  );
  if (tokenCookie) jars.set(opts.email || '', String(tokenCookie).split(';')[0].split('=')[1]);
  return { status: res.status, body };
}

async function signin(email: string): Promise<void> {
  const res = await api('POST', '/auth/signin', { email, body: { email, password: PASSWORD } });
  check(`signin ${email}`, res.status === 200, res.body);
}

const ask = (email: string, payload: Record<string, unknown>) =>
  api('POST', `/itinerary/${tripId}/chat/assistant`, { email, body: payload });

/* --------------------------------- main ---------------------------------- */

let tripId = '';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const upsert = (email: string) =>
    User.findOneAndUpdate({ email }, { email, password: passwordHash }, { upsert: true, new: true });
  const alice = await upsert(ALICE_EMAIL);
  const bob = await upsert(BOB_EMAIL);
  await upsert(EVE_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_f12a': true });
  const trip = await Trip.create({
    userId: alice._id,
    tripDetails: {
      smoke_f12a: true,
      trip_title: 'F12 Assistant Smoke',
      duration_days: 2,
      budget_per_person: 9000,
      group_type: 'friends',
      season: 'summer',
      day_by_day_itinerary: [
        { day: 1, title: 'Arrive & seafood' },
        { day: 2, title: 'Scooters day' },
      ],
    },
    title: 'F12 Assistant Smoke',
    status: 'planned',
    members: [
      { userId: alice._id, role: 'owner', joinedAt: new Date() },
      { userId: bob._id, role: 'viewer', joinedAt: new Date() }, // viewer CAN ask
    ],
  });
  await TripComment.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();
  tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  await signin(ALICE_EMAIL);
  await signin(BOB_EMAIL);
  await signin(EVE_EMAIL);

  /* ------------------------------- walls ---------------------------------- */
  const stranger = await ask(EVE_EMAIL, { prompt: '@TravelAI hi' });
  check('a stranger cannot ask (404)', stranger.status === 404, stranger.status);

  const noMention = await ask(ALICE_EMAIL, { prompt: 'eat where?' });
  check('asking WITHOUT the @TravelAI mention is a 400 (primary brake)', noMention.status === 400, noMention.body);

  const longPrompt = await ask(ALICE_EMAIL, { prompt: `@TravelAI ${'x'.repeat(500)}` });
  check('a prompt over 500 chars is a 400', longPrompt.status === 400, longPrompt.status);

  const nineLines = Array.from({ length: 9 }, (_, i) => ({ label: `m${i}`, text: 'hi' }));
  const tooManyLines = await ask(ALICE_EMAIL, { prompt: '@TravelAI hi', context: nineLines });
  check('more than 8 context lines is a 400', tooManyLines.status === 400, tooManyLines.status);

  const longLine = await ask(ALICE_EMAIL, { prompt: '@TravelAI hi', context: [{ label: 'bob', text: 'x'.repeat(501) }] });
  check('a context line over 500 chars is a 400', longLine.status === 400, longLine.status);

  /* --------------------- live provider calls (budgeted) -------------------- */
  const dailyLimit = Number(process.env.BOT_DAILY_LIMIT || 0);
  if (dailyLimit === 1) {
    const good = await ask(ALICE_EMAIL, {
      prompt: '@TravelAI what should we eat on day 1?',
      context: [{ label: 'bob', text: 'I love seafood but not too spicy' }],
    });
    check('the happy-path ask returns a clamped answer (200)', good.status === 200 && typeof good.body?.reply === 'string' && good.body.reply.length > 0, good.body);
    check('the answer fits the reply cap (≤800)', typeof good.body?.reply === 'string' && good.body.reply.length <= 800, good.body?.reply?.length);
    check('the provider is named', ['gemini', 'groq', 'cache'].includes(good.body?.provider), good.body?.provider);

    const second = await ask(ALICE_EMAIL, { prompt: '@TravelAI again?' });
    check('a second ask same user+trip+day hits the daily budget (429)', second.status === 429, second.status);

    const bobAsk = await ask(BOB_EMAIL, {
      prompt: '@travelai any cheap breakfast near the hotel?',
    });
    check('another user has their OWN bucket (bob, a viewer, asks fine)', bobAsk.status === 200, bobAsk.body);
  } else {
    check(`daily budget not set to 1 (got ${dailyLimit || 'default'}) — cap scenario SKIPPED (unit-covered)`, true);
  }

  /* ----------------- bot-flagged comment rows (persona flag) ---------------- */
  // Simulates the asker's client: it encrypts the answer with the trip
  // conversation key and posts it as a bot:true e2ee row.
  const fakeCipher = Buffer.from('0123456789abcdef').toString('base64');
  const row = await api('POST', `/itinerary/${tripId}/comments`, {
    email: ALICE_EMAIL,
    body: { body: `${fakeCipher}.${fakeCipher}`, e2ee: true, bot: true, day: 1 },
  });
  check('the encrypted bot answer posts like any comment (201)', row.status === 201 && row.body?.comment?.e2ee === true && row.body?.comment?.bot === true, row.body?.comment);
  check('a bot row without member context is NOT spoofable into plaintext', Boolean(row.body?.comment?.body?.includes('.')), row.body?.comment?.body?.slice(0, 24));

  const view = await api('GET', `/itinerary/${tripId}/comments`, { email: BOB_EMAIL });
  const seen = view.body?.comments?.find((c: any) => String(c._id) === String(row.body?.comment?._id));
  check('the bot flag + e2ee travel to other members via projection', Boolean(seen?.bot) && Boolean(seen?.e2ee), seen);

  /* --------------------------------- cleanup -------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripComment.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_f12a': true });
  await User.deleteMany({ email: { $in: [ALICE_EMAIL, BOB_EMAIL, EVE_EMAIL] } });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-f12a crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
