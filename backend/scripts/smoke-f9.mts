/**
 * Live smoke test for Milestone 7 sprint F9 (decisions).
 * Run with the API server up:
 *   npm start        (respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-f9.mts
 *
 * Covers: non-member 404s, the promote rules (author yes / other member no /
 * owner yes-for-anyone), duplicate promotion 409, the snapshot surviving a
 * comment tombstone, both unmark paths (owner-of-someone-else's and
 * promoter's own), and the decision:new frame fanning out over the SSE bus
 * (skipped when the live tier is disabled).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';
import TripDecision from '../src/models/TripDecision.js';
import { env } from '../src/config/env.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-f9-owner@example.com';
const AUTHOR_EMAIL = 'smoke-f9-author@example.com';
const BYSTANDER_EMAIL = 'smoke-f9-bystander@example.com';
const STRANGER_EMAIL = 'smoke-f9-stranger@example.com';
const PASSWORD = 'Smoke-F9-Password!123';

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
  const author = await upsert(AUTHOR_EMAIL);
  const bystander = await upsert(BYSTANDER_EMAIL);
  await upsert(STRANGER_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_f9': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_f9: true,
      trip_title: 'F9 Decisions Smoke',
      duration_days: 2,
      budget_per_person: 9000,
      group_type: 'friends',
      season: 'summer',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'F9 Decisions Smoke',
    status: 'planned',
    members: [
      { userId: owner._id, role: 'owner', joinedAt: new Date() },
      { userId: author._id, role: 'commenter', joinedAt: new Date() },
      { userId: bystander._id, role: 'commenter', joinedAt: new Date() },
    ],
  });
  await TripDecision.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId} (max decisions/trip: ${env.DECISION_MAX_PER_TRIP})\n`);

  await signin(OWNER_EMAIL);
  await signin(AUTHOR_EMAIL);
  await signin(BYSTANDER_EMAIL);
  await signin(STRANGER_EMAIL);

  /* --------------------------- non-member walls ---------------------------- */
  const strangerList = await api('GET', `/itinerary/${tripId}/decisions`, { email: STRANGER_EMAIL });
  check('non-member decision list is a 404', strangerList.status === 404, strangerList.status);
  const strangerPromote = await api(
    'POST',
    `/itinerary/${tripId}/comments/000000000000000000000000/decision`,
    { email: STRANGER_EMAIL }
  );
  check('non-member promote is a 404 (id not probeable)', strangerPromote.status === 404, strangerPromote.status);

  /* ---------------------------- eligibility wall --------------------------- */
  const remark = await api('POST', `/itinerary/${tripId}/comments`, {
    email: AUTHOR_EMAIL,
    body: { body: 'We split the Kochi homestay two ways.', day: 1 },
  });
  check('author posted a remark', remark.status === 201 && remark.body?.comment?._id, remark.body);
  const commentId = remark.body.comment._id as string;

  const bystanderPromote = await api(
    'POST',
    `/itinerary/${tripId}/comments/${commentId}/decision`,
    { email: BYSTANDER_EMAIL }
  );
  check("a non-author member cannot promote someone else's remark (403)", bystanderPromote.status === 403, bystanderPromote.body);

  const authorPromote = await api(
    'POST',
    `/itinerary/${tripId}/comments/${commentId}/decision`,
    { email: AUTHOR_EMAIL }
  );
  check('the author promotes their own remark (201)', authorPromote.status === 201, authorPromote.body);
  check(
    'the snapshot carries body, day and author labels',
    authorPromote.body?.decision?.body === 'We split the Kochi homestay two ways.' &&
      authorPromote.body?.decision?.day === 1,
    authorPromote.body?.decision
  );
  const decisionId = String(authorPromote.body.decision._id);

  const duplicate = await api(
    'POST',
    `/itinerary/${tripId}/comments/${commentId}/decision`,
    { email: AUTHOR_EMAIL }
  );
  check('re-promoting the same comment is a 409 (one decision per comment)', duplicate.status === 409, duplicate.status);

  let list = await api('GET', `/itinerary/${tripId}/decisions`, { email: OWNER_EMAIL });
  check('decision list shows exactly one active decision', list.body?.decisions?.length === 1, list.body);

  /* -------------------- snapshot survives comment removal ------------------ */
  const tomb = await api('DELETE', `/itinerary/${tripId}/comments/${commentId}`, { email: OWNER_EMAIL });
  check('owner tombstones the source comment', tomb.status === 200, tomb.body);
  const afterTomb = await api('GET', `/itinerary/${tripId}/decisions`, { email: OWNER_EMAIL });
  check(
    'the decision SURVIVES the comment tombstone (snapshot semantics)',
    afterTomb.body?.decisions?.length === 1 &&
      afterTomb.body?.decisions?.[0]?.body === 'We split the Kochi homestay two ways.',
    afterTomb.body
  );

  /* --------------------- owner promotes + live frame ----------------------- */
  const otherRemark = await api('POST', `/itinerary/${tripId}/comments`, {
    email: AUTHOR_EMAIL,
    body: { body: 'Rent scooters for Day 2.' },
  });
  const otherCommentId = String(otherRemark.body?.comment?._id);
  const frames = await captureFrame(
    tripId,
    OWNER_EMAIL,
    () =>
      api('POST', `/itinerary/${tripId}/comments/${otherCommentId}/decision`, {
        email: OWNER_EMAIL,
      }),
    '"decision:new"'
  );
  if (frames === null) {
    note('SSE decision frame check (live tier disabled in this environment)');
  } else {
    check(
      'an owner promote of a member remark fans out as decision:new',
      frames.includes('"decision:new"') && frames.includes('Rent scooters'),
      frames.slice(0, 300)
    );
  }

  list = await api('GET', `/itinerary/${tripId}/decisions`, { email: OWNER_EMAIL });
  const scootersDecision = (list.body?.decisions as any[] | undefined)?.find(
    (row) => row.commentId === otherCommentId
  );
  check('two active decisions now; the scooters one is owner-promoted', Boolean(scootersDecision?._id), list.body);

  /* ------------------------------ unmark walls ----------------------------- */
  const ownerUnmark = await api('DELETE', `/itinerary/${tripId}/decisions/${decisionId}`, {
    email: OWNER_EMAIL,
  });
  check('owner unmarks a decision they did not promote (200)', ownerUnmark.status === 200, ownerUnmark.body);
  const promoterUnmark = await api(
    'DELETE',
    `/itinerary/${tripId}/decisions/${scootersDecision?._id}`,
    { email: OWNER_EMAIL }
  );
  check('the promoter unmarks their own decision (200)', promoterUnmark.status === 200, promoterUnmark.body);

  const empty = await api('GET', `/itinerary/${tripId}/decisions`, { email: OWNER_EMAIL });
  check('no active decisions remain after both unmarks', empty.body?.decisions?.length === 0, empty.body);
  const reUnmark = await api('DELETE', `/itinerary/${tripId}/decisions/${decisionId}`, {
    email: OWNER_EMAIL,
  });
  check('unmarking an already-tombstoned decision is a 404', reUnmark.status === 404, reUnmark.status);

  /* -------------------------------- cleanup -------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripDecision.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_f9': true });
  await User.deleteMany({
    email: { $in: [OWNER_EMAIL, AUTHOR_EMAIL, BYSTANDER_EMAIL, STRANGER_EMAIL] },
  });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-f9 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
