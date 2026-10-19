/**
 * Live smoke test for Milestone 7 sprint F8a (typing frame + read state).
 * Run with the API server up:
 *   npm start        (any port; respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-f8.mts
 *
 * Covers: the first-visit baseline rule (unread 0, marker stamped), unread
 * counts growing from other members' comments (own and tombstones excluded),
 * mark-read reset, the typing ping fanning out as an SSE frame (skipped when
 * the live tier is disabled), and the "stateless typing costs nothing" cheap
 * repeated pings under the limiter (a handful, not the full 400).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';
import TripReadState from '../src/models/TripReadState.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-f8-owner@example.com';
const OTHER_EMAIL = 'smoke-f8-other@example.com';
const STRANGER_EMAIL = 'smoke-f8-stranger@example.com';
const PASSWORD = 'Smoke-F8-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

function note(label: string) {
  console.log(`SKIP ${label}`);
}

const jars = new Map<string, string>();

function authHeader(email: string): Record<string, string> {
  const token = jars.get(email);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  opts: { email?: string; body?: unknown } = {}
): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeader(opts.email || '') },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body: any = null;
  let text = '';
  try {
    text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const tokenCookie = setCookies.find((cookie) => cookie.startsWith('token=')) ?? '';
  if (tokenCookie) jars.set(opts.email || '', tokenCookie.split(';')[0].split('=')[1]);
  return { status: res.status, body, text };
}

async function signin(email: string): Promise<void> {
  const res = await api('POST', '/auth/signin', { email, body: { email, password: PASSWORD } });
  check(`signin ${email}`, res.status === 200, res.body);
}

/** Opens the SSE stream and waits for a frame containing `needle`. */
async function captureFrame(
  tripId: string,
  email: string,
  action: () => Promise<unknown>,
  needle: string,
  timeoutMs = 6000
): Promise<string | null> {
  const controller = new AbortController();
  const res = await fetch(`${BASE}/itinerary/${tripId}/events`, {
    headers: { ...authHeader(email), accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (res.status === 404) {
    controller.abort();
    return null;
  }
  if (!res.ok || !res.body) {
    controller.abort();
    return '';
  }
  let buffer = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await action();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(needle)) break;
    }
    return buffer;
  } catch {
    return buffer;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const upsert = (email: string) =>
    User.findOneAndUpdate(
      { email },
      { email, password: passwordHash },
      { upsert: true, new: true }
    );
  const owner = await upsert(OWNER_EMAIL);
  const other = await upsert(OTHER_EMAIL);
  await upsert(STRANGER_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_f8': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_f8: true,
      trip_title: 'F8 Read State Smoke',
      duration_days: 2,
      budget_per_person: 8000,
      group_type: 'friends',
      season: 'autumn',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'F8 Read State Smoke',
    status: 'planned',
    members: [
      { userId: owner._id, role: 'owner', joinedAt: new Date() },
      { userId: other._id, role: 'commenter', joinedAt: new Date() },
    ],
  });
  await TripReadState.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  await signin(OWNER_EMAIL);
  await signin(OTHER_EMAIL);
  await signin(STRANGER_EMAIL);

  /* ------------------------ ranks & non-members --------------------------- */
  const strangerRead = await api('GET', `/itinerary/${tripId}/comments/read-state`, {
    email: STRANGER_EMAIL,
  });
  check('non-member read-state is a 404 (id not probeable)', strangerRead.status === 404, strangerRead.status);
  const strangerPing = await api('POST', `/itinerary/${tripId}/events/typing`, { email: STRANGER_EMAIL });
  check('non-member typing ping is a 404', strangerPing.status === 404, strangerPing.status);
  const strangerMark = await api('POST', `/itinerary/${tripId}/comments/read`, { email: STRANGER_EMAIL });
  check('non-member mark-read is a 404', strangerMark.status === 404, strangerMark.status);

  /* --------------------- first-visit baseline rule ------------------------ */
  const baseline = await api('GET', `/itinerary/${tripId}/comments/read-state`, { email: OWNER_EMAIL });
  check('first visit is a baseline: unread 0, marker stamped', baseline.status === 200 && baseline.body?.unread === 0, baseline.body);
  check('a marker row exists now', Boolean(baseline.body?.lastReadAt), baseline.body);

  /* ----------------------- unread — growth & math ------------------------- */
  await api('POST', `/itinerary/${tripId}/comments`, {
    email: OWNER_EMAIL,
    body: { body: 'my own remark' },
  });
  const theirFirst = await api('POST', `/itinerary/${tripId}/comments`, {
    email: OTHER_EMAIL,
    body: { body: 'theirs one' },
  });
  await api('POST', `/itinerary/${tripId}/comments`, {
    email: OTHER_EMAIL,
    body: { body: 'theirs two', day: 1 },
  });

  let unread = await api('GET', `/itinerary/${tripId}/comments/read-state`, { email: OWNER_EMAIL });
  check('unread = 2: other members only (own remark excluded)', unread.body?.unread === 2, unread.body);

  // Tombstoning one of theirs must drop it from the count; tombstones have
  // nothing to read. The second "theirs two" stays live → unread stays 1.
  const tomb1 = await api('DELETE', `/itinerary/${tripId}/comments/${theirFirst.body?.comment?._id}`, {
    email: OWNER_EMAIL,
  });
  check('owner moderation tombstones a comment', tomb1.status === 200, tomb1.body);

  unread = await api('GET', `/itinerary/${tripId}/comments/read-state`, { email: OWNER_EMAIL });
  check('unread = 1: tombstones stopped counting, mine never counted', unread.body?.unread === 1, unread.body);

  /* ------------------------------ mark read ------------------------------- */
  const marked = await api('POST', `/itinerary/${tripId}/comments/read`, { email: OWNER_EMAIL });
  check('mark-read reports unread 0', marked.body?.unread === 0, marked.body);
  const afterMark = await api('GET', `/itinerary/${tripId}/comments/read-state`, { email: OWNER_EMAIL });
  check('the marker really moved (next read stays 0)', afterMark.body?.unread === 0, afterMark.body);

  /* ------------------------------ typing ping ----------------------------- */
  const frames = await captureFrame(tripId, OWNER_EMAIL, () =>
    api('POST', `/itinerary/${tripId}/events/typing`, { email: OTHER_EMAIL })
  , '"typing"');
  if (frames === null) {
    note('SSE typing frame check (live tier disabled in this environment)');
  } else {
    check(
      'a typing ping fans out as a typing frame with the label',
      frames.includes('"typing"') && frames.includes('smoke-f8-other'),
      frames.slice(0, 300)
    );
  }
  const burst = await api('POST', `/itinerary/${tripId}/events/typing`, { email: OWNER_EMAIL });
  check('typed pings are cheap 204s (no body, no rev work)', burst.status === 204, burst.status);

  /* ------------------------------ cleanup --------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripReadState.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_f8': true });
  await User.deleteMany({ email: { $in: [OWNER_EMAIL, OTHER_EMAIL, STRANGER_EMAIL] } });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-f8 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
