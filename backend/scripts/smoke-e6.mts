/**
 * Live smoke test for Milestone 6 sprint F6a (trip comments).
 * Run with the API server up:
 *   npm start        (any port; respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-e6.mts
 *
 * Covers: the rank floor (viewer reads, commenter posts, 403 below), 404 for
 * non-members, the author/owner edit+moderation matrix (including authorship
 * surviving demotion), tombstones, day anchors + `dayCounts`, the `(createdAt,
 * _id)` pagination cursor, schema bounds, the "comments never bump Trip.rev"
 * invariant, and the `comment:new` SSE frame when the live tier is enabled.
 * Throwaway `smoke-e6-*@example.com` users and one marker trip are deleted.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-e6-owner@example.com';
const COMMENTER_EMAIL = 'smoke-e6-commenter@example.com';
const VIEWER_EMAIL = 'smoke-e6-viewer@example.com';
const STRANGER_EMAIL = 'smoke-e6-stranger@example.com';
const PASSWORD = 'Smoke-E6-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

function note(label: string, detail?: unknown) {
  console.log(`SKIP ${label}`);
  if (detail !== undefined) console.log('     detail:', detail);
}

const jars = new Map<string, string>();

function authHeader(email: string): Record<string, string> {
  const token = jars.get(email);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { email?: string; body?: unknown; anonymous?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: opts.anonymous
      ? { 'content-type': 'application/json' }
      : { 'content-type': 'application/json', ...authHeader(opts.email || '') },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
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

/**
 * Opens the trip SSE stream, runs `action`, and returns the buffered frames (or
 * `null` when the live tier is disabled in this environment — the route then
 * answers 404 before any stream opens).
 */
async function captureFrame(
  tripId: string,
  email: string,
  action: () => Promise<unknown>,
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
      if (buffer.includes('"comment:new"')) break;
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
  const commenter = await upsert(COMMENTER_EMAIL);
  const viewer = await upsert(VIEWER_EMAIL);
  await upsert(STRANGER_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_e6': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_e6: true,
      trip_title: 'E6 Comments Smoke',
      duration_days: 3,
      budget_per_person: 12000,
      group_type: 'friends',
      season: 'winter',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'E6 Comments Smoke',
    status: 'planned',
    members: [
      { userId: owner._id, role: 'owner', joinedAt: new Date() },
      { userId: commenter._id, role: 'commenter', joinedAt: new Date() },
      { userId: viewer._id, role: 'viewer', joinedAt: new Date() },
    ],
  });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  await signin(OWNER_EMAIL);
  await signin(COMMENTER_EMAIL);
  await signin(VIEWER_EMAIL);
  await signin(STRANGER_EMAIL);

  /* --------------------------- ranks & membership -------------------------- */
  const viewerList = await api('GET', `/itinerary/${tripId}/comments`, { email: VIEWER_EMAIL });
  check('viewer can read the (empty) comment stream', viewerList.status === 200, viewerList.body);
  check(
    'empty stream is shaped { comments, nextCursor, dayCounts }',
    Array.isArray(viewerList.body?.comments) &&
      viewerList.body?.nextCursor === null &&
      typeof viewerList.body?.dayCounts === 'object',
    viewerList.body
  );

  const viewerPost = await api('POST', `/itinerary/${tripId}/comments`, {
    email: VIEWER_EMAIL,
    body: { body: 'viewers cannot post' },
  });
  check('viewer POST is forbidden (rank floor is commenter)', viewerPost.status === 403, viewerPost.status);

  const strangerList = await api('GET', `/itinerary/${tripId}/comments`, { email: STRANGER_EMAIL });
  const strangerPost = await api('POST', `/itinerary/${tripId}/comments`, {
    email: STRANGER_EMAIL,
    body: { body: 'nope' },
  });
  check('non-member list is a 404 (id is not probeable)', strangerList.status === 404, strangerList.status);
  check('non-member POST is a 404 too', strangerPost.status === 404, strangerPost.status);

  /* ------------------------------ schema bounds ---------------------------- */
  const blank = await api('POST', `/itinerary/${tripId}/comments`, {
    email: COMMENTER_EMAIL,
    body: { body: '   ' },
  });
  check('whitespace-only body is rejected with 400', blank.status === 400, blank.body);
  const badDay = await api('POST', `/itinerary/${tripId}/comments`, {
    email: COMMENTER_EMAIL,
    body: { body: 'out of range', day: 0 },
  });
  check('day 0 is rejected with 400', badDay.status === 400, badDay.body);

  /* -------------------------------- create --------------------------------- */
  const revBefore = (await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL })).body?.rev;

  const day2 = await api('POST', `/itinerary/${tripId}/comments`, {
    email: COMMENTER_EMAIL,
    body: { body: 'Day 2 idea: swap the museum for the fort', day: 2 },
  });
  check('commenter can post', day2.status === 201, day2.body);
  check('the author sees isYou: true', day2.body?.comment?.isYou === true, day2.body?.comment);
  check('the day anchor round-trips', day2.body?.comment?.day === 2, day2.body?.comment);
  const day2Id = day2.body?.comment?._id ?? '';

  const ownerNote = await api('POST', `/itinerary/${tripId}/comments`, {
    email: OWNER_EMAIL,
    body: { body: 'Good call — let us vote on it.' },
  });
  check('owner can post', ownerNote.status === 201, ownerNote.body);
  const ownerNoteId = ownerNote.body?.comment?._id ?? '';

  const ownerSees = await api('GET', `/itinerary/${tripId}/comments`, { email: OWNER_EMAIL });
  const commenterRow = (ownerSees.body?.comments || []).find((c: any) => c._id === day2Id);
  check(
    'another member sees isYou: false and a derived label',
    commenterRow?.isYou === false && typeof commenterRow?.label === 'string',
    commenterRow
  );
  check(
    'dayCounts counts only day-anchored comments',
    ownerSees.body?.dayCounts?.['2'] === 1 && !ownerSees.body?.dayCounts?.['1'],
    ownerSees.body?.dayCounts
  );

  /* ------------------------- author edit + moderation ---------------------- */
  const selfEdit = await api('PATCH', `/itinerary/${tripId}/comments/${day2Id}`, {
    email: COMMENTER_EMAIL,
    body: { body: 'Day 2 idea, revised' },
  });
  check('the author can edit their own comment', selfEdit.status === 200, selfEdit.body);
  check('an edit stamps editedAt', Boolean(selfEdit.body?.comment?.editedAt), selfEdit.body?.comment);

  const crossEdit = await api('PATCH', `/itinerary/${tripId}/comments/${ownerNoteId}`, {
    email: COMMENTER_EMAIL,
    body: { body: 'not mine to edit' },
  });
  check('editing someone else’s comment is 403', crossEdit.status === 403, crossEdit.status);

  const crossDelete = await api('DELETE', `/itinerary/${tripId}/comments/${ownerNoteId}`, {
    email: COMMENTER_EMAIL,
  });
  check('deleting someone else’s comment (non-owner) is 403', crossDelete.status === 403, crossDelete.status);

  const ownerModerates = await api('DELETE', `/itinerary/${tripId}/comments/${ownerNoteId}`, {
    email: OWNER_EMAIL,
  });
  check('the owner can remove another member’s comment', ownerModerates.status === 200, ownerModerates.body);
  check(
    'removal is a tombstone: body emptied, timing kept',
    ownerModerates.body?.comment?.body === '' &&
      Boolean(ownerModerates.body?.comment?.deletedAt),
    ownerModerates.body?.comment
  );

  /* --------------------- comments never bump the trip rev ------------------ */
  const revAfter = (await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL })).body?.rev;
  check('posting comments never bumps Trip.rev', revBefore === revAfter, { revBefore, revAfter });
  const fullTrip = await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL });
  check('comments live in their own collection, not on the trip', !('comments' in (fullTrip.body || {})), Object.keys(fullTrip.body || {}));

  /* ------------------------------ pagination ------------------------------- */
  for (const body of ['one', 'two', 'three']) {
    await api('POST', `/itinerary/${tripId}/comments`, { email: COMMENTER_EMAIL, body: { body } });
  }
  // Active comments now: the edited day-2 one + three fresh ones = 4.
  const page1 = await api('GET', `/itinerary/${tripId}/comments?limit=2`, { email: VIEWER_EMAIL });
  check('limit is honoured and a nextCursor is returned', page1.body?.comments?.length === 2 && Boolean(page1.body?.nextCursor), page1.body);
  check('the cursor is the exact "ISO|_id" form', String(page1.body?.nextCursor || '').includes('|'), page1.body?.nextCursor);
  const cursor = page1.body?.nextCursor ?? '';
  const page2 = await api('GET', `/itinerary/${tripId}/comments?limit=2&before=${encodeURIComponent(cursor)}`, {
    email: VIEWER_EMAIL,
  });
  const ids1 = (page1.body?.comments || []).map((c: any) => c._id);
  const ids2 = (page2.body?.comments || []).map((c: any) => c._id);
  check('the second page continues without overlap', page2.body?.comments?.length === 2 && !ids1.some((id: string) => ids2.includes(id)), { ids1, ids2 });

  /* --------------- authorship survives a rank demotion --------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.updateOne(
    { _id: tripId, 'members.userId': commenter._id },
    { $set: { 'members.$.role': 'viewer' } }
  );
  await mongoose.disconnect();

  const demotedPosts = await api('POST', `/itinerary/${tripId}/comments`, {
    email: COMMENTER_EMAIL,
    body: { body: 'demoted' },
  });
  check('a demoted ex-commenter can no longer post', demotedPosts.status === 403, demotedPosts.status);

  const demotedSelfDelete = await api('DELETE', `/itinerary/${tripId}/comments/${day2Id}`, {
    email: COMMENTER_EMAIL,
  });
  check('but they still own their words: self-delete works', demotedSelfDelete.status === 200, demotedSelfDelete.body);

  /* ------------------------------ SSE frame -------------------------------- */
  const frames = await captureFrame(tripId, VIEWER_EMAIL, () =>
    api('POST', `/itinerary/${tripId}/comments`, {
      email: OWNER_EMAIL,
      body: { body: 'live frame check' },
    })
  );
  if (frames === null) {
    note('SSE live frame check (live tier disabled in this environment)');
  } else {
    check('a posted comment fans out as a comment:new frame', frames.includes('"comment:new"'), frames.slice(0, 400));
  }

  /* ------------------------------ cleanup ---------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripComment.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_e6': true });
  await User.deleteMany({ email: { $in: [OWNER_EMAIL, COMMENTER_EMAIL, VIEWER_EMAIL, STRANGER_EMAIL] } });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-e6 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
