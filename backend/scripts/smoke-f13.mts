/**
 * Live smoke test for Milestone 7 sprint F13a (encrypted polls).
 * Run with the API server up:
 *   npm start        (respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-f13.mts
 *
 * Covers the walls that matter for a server that cannot read the object it is
 * storing: non-members 404, viewers cannot create or vote, a sealed payload is
 * required, a vote must be a sealed index (a plaintext "1" is refused), one
 * vote per member (repeat = no-op, change = replace), close rights
 * (creator/owner only), votes refused after close, removal hiding the poll and
 * its votes, and the `poll:new` / `poll:update` frames on the SSE bus.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';
import TripDecision from '../src/models/TripDecision.js';
import TripPoll from '../src/models/TripPoll.js';
import { env } from '../src/config/env.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-f13-owner@example.com';
const AUTHOR_EMAIL = 'smoke-f13-author@example.com';
const BYSTANDER_EMAIL = 'smoke-f13-bystander@example.com';
const VIEWER_EMAIL = 'smoke-f13-viewer@example.com';
const STRANGER_EMAIL = 'smoke-f13-stranger@example.com';
const PASSWORD = 'Smoke-F13-Password!123';

/** The client's wire shape: 16-char base64 iv (12 bytes), a dot, base64 ct. */
const SEALED_POLL = 'AAAAAAAAAAAAAAAA.cG9sbC1wYXlsb2FkLWNpcGhlcnRleHQ=';
const SEALED_CHOICE_A = 'AAAAAAAAAAAAAAAA.b3B0aW9uLWE=';
const SEALED_CHOICE_B = 'BBBBBBBBBBBBBBBB.b3B0aW9uLWI=';

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
    User.findOneAndUpdate({ email }, { email, password: passwordHash }, { upsert: true, new: true });

  const owner = await upsert(OWNER_EMAIL);
  const author = await upsert(AUTHOR_EMAIL);
  const bystander = await upsert(BYSTANDER_EMAIL);
  const viewer = await upsert(VIEWER_EMAIL);
  await upsert(STRANGER_EMAIL);

  await Trip.deleteMany({ 'tripDetails.smoke_f13': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_f13: true,
      trip_title: 'F13 Polls Smoke',
      duration_days: 2,
      budget_per_person: 9000,
      group_type: 'friends',
      season: 'summer',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'F13 Polls Smoke',
    status: 'planned',
    members: [
      { userId: owner._id, role: 'owner', joinedAt: new Date() },
      { userId: author._id, role: 'commenter', joinedAt: new Date() },
      { userId: bystander._id, role: 'commenter', joinedAt: new Date() },
      { userId: viewer._id, role: 'viewer', joinedAt: new Date() },
    ],
  });
  await TripPoll.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await TripDecision.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId} (poll cap: ${env.POLL_MAX_PER_TRIP})\n`);

  await signin(OWNER_EMAIL);
  await signin(AUTHOR_EMAIL);
  await signin(BYSTANDER_EMAIL);
  await signin(VIEWER_EMAIL);
  await signin(STRANGER_EMAIL);

  /* ------------------------------ membership walls ------------------------- */
  const strangerList = await api('GET', `/itinerary/${tripId}/polls`, { email: STRANGER_EMAIL });
  check('non-member poll list is a 404', strangerList.status === 404, strangerList.status);

  const strangerCreate = await api('POST', `/itinerary/${tripId}/polls`, {
    email: STRANGER_EMAIL,
    body: { body: SEALED_POLL },
  });
  check('non-member create is a 404 (the trip is not probeable)', strangerCreate.status === 404, strangerCreate.status);

  const viewerCreate = await api('POST', `/itinerary/${tripId}/polls`, {
    email: VIEWER_EMAIL,
    body: { body: SEALED_POLL },
  });
  check('a viewer cannot start a poll (403)', viewerCreate.status === 403, viewerCreate.status);

  /* -------------------------------- shape walls ---------------------------- */
  const plainCreate = await api('POST', `/itinerary/${tripId}/polls`, {
    email: AUTHOR_EMAIL,
    body: { body: 'Where should we eat on Friday?' },
  });
  check('a PLAINTEXT poll body is refused (400)', plainCreate.status === 400, plainCreate.body);

  const emptyCreate = await api('POST', `/itinerary/${tripId}/polls`, {
    email: AUTHOR_EMAIL,
    body: { body: '   ' },
  });
  check('an empty poll body is refused (400)', emptyCreate.status === 400, emptyCreate.body);

  /* ------------------------------ create + frame --------------------------- */
  const frames = await captureFrame(
    tripId,
    OWNER_EMAIL,
    () =>
      api('POST', `/itinerary/${tripId}/polls`, {
        email: AUTHOR_EMAIL,
        body: { body: SEALED_POLL },
      }),
    '"poll:new"'
  );

  const created = await api('POST', `/itinerary/${tripId}/polls`, {
    email: AUTHOR_EMAIL,
    body: { body: SEALED_POLL },
  });
  check('a member starts a poll (201)', created.status === 201, created.body);
  const pollId = String(created.body?.poll?._id);

  check(
    'the sealed payload travels verbatim and is flagged e2ee',
    created.body?.poll?.body === SEALED_POLL && created.body?.poll?.e2ee === true,
    created.body?.poll
  );
  check(
    'the creator sees their own poll as theirs, with their label',
    created.body?.poll?.isYou === true &&
      created.body?.poll?.createdByLabel === 'smoke-f13-author',
    created.body?.poll
  );
  check('a new poll has no votes yet', Array.isArray(created.body?.poll?.votes) && created.body.poll.votes.length === 0, created.body?.poll);

  if (frames === null) {
    note('SSE poll:new frame (live tier disabled in this environment)');
  } else {
    check(
      'creating a poll fans out as poll:new with the sealed body',
      frames.includes('"poll:new"') && frames.includes(SEALED_POLL),
      frames.slice(0, 300)
    );
  }

  /* ------------------------------ list + isYou ----------------------------- */
  const list = await api('GET', `/itinerary/${tripId}/polls`, { email: OWNER_EMAIL });
  const listed = (list.body?.polls as any[] | undefined)?.find((row) => row._id === pollId);
  check('the poll is listed for every member', Boolean(listed), list.body);
  check(
    'a broadcast-style row is NOT "yours" for another member',
    listed?.isYou === false && listed?.createdByLabel === 'smoke-f13-author',
    listed
  );

  /* --------------------------------- voting -------------------------------- */
  const plainVote = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: AUTHOR_EMAIL,
    body: { choice: '1' },
  });
  check('a PLAINTEXT vote index is refused (409)', plainVote.status === 409, plainVote.body);

  const viewerVote = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: VIEWER_EMAIL,
    body: { choice: SEALED_CHOICE_A },
  });
  check('a viewer cannot vote (403)', viewerVote.status === 403, viewerVote.status);

  const voteFrames = await captureFrame(
    tripId,
    OWNER_EMAIL,
    () =>
      api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
        email: AUTHOR_EMAIL,
        body: { choice: SEALED_CHOICE_A },
      }),
    '"poll:update"'
  );

  let afterVote = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: AUTHOR_EMAIL,
    body: { choice: SEALED_CHOICE_A },
  });
  check('a member votes (200)', afterVote.status === 200, afterVote.body);
  check(
    'the vote stores the sealed choice next to the voter id and label',
    afterVote.body?.poll?.votes?.length === 1 &&
      afterVote.body?.poll?.votes?.[0]?.choice === SEALED_CHOICE_A &&
      afterVote.body?.poll?.votes?.[0]?.label === 'smoke-f13-author',
    afterVote.body?.poll
  );

  if (voteFrames === null) {
    note('SSE poll:update frame (live tier disabled in this environment)');
  } else {
    check(
      'a vote fans out as poll:update carrying the sealed choice',
      voteFrames.includes('"poll:update"') && voteFrames.includes(SEALED_CHOICE_A),
      voteFrames.slice(0, 300)
    );
  }

  const repeat = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: AUTHOR_EMAIL,
    body: { choice: SEALED_CHOICE_A },
  });
  check(
    'voting the same way twice does not add a second row (one vote per member)',
    repeat.body?.poll?.votes?.length === 1,
    repeat.body?.poll
  );

  const changed = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: AUTHOR_EMAIL,
    body: { choice: SEALED_CHOICE_B },
  });
  check(
    'changing a vote REPLACES it (still one row, new choice)',
    changed.body?.poll?.votes?.length === 1 &&
      changed.body?.poll?.votes?.[0]?.choice === SEALED_CHOICE_B,
    changed.body?.poll
  );

  const second = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: BYSTANDER_EMAIL,
    body: { choice: SEALED_CHOICE_A },
  });
  check(
    'a second member adds a second vote row',
    second.body?.poll?.votes?.length === 2,
    second.body?.poll
  );

  /* ------------------------------ close rights ----------------------------- */
  const bystanderClose = await api('POST', `/itinerary/${tripId}/polls/${pollId}/close`, {
    email: BYSTANDER_EMAIL,
  });
  check('a non-creator member cannot close the poll (403)', bystanderClose.status === 403, bystanderClose.status);

  const closed = await api('POST', `/itinerary/${tripId}/polls/${pollId}/close`, {
    email: AUTHOR_EMAIL,
  });
  check(
    'the creator closes the poll (200, closedAt set)',
    closed.status === 200 && Boolean(closed.body?.poll?.closedAt),
    closed.body?.poll
  );

  const voteAfterClose = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: BYSTANDER_EMAIL,
    body: { choice: SEALED_CHOICE_B },
  });
  check('voting after close is a 409', voteAfterClose.status === 409, voteAfterClose.body);

  const reopen = await api('POST', `/itinerary/${tripId}/polls/${pollId}/close`, {
    email: OWNER_EMAIL,
  });
  check(
    'closing twice is idempotent (owner may close anyone\'s poll)',
    reopen.status === 200 && Boolean(reopen.body?.poll?.closedAt),
    reopen.body?.poll
  );

  /* -------------------------------- removal -------------------------------- */
  const bystanderRemove = await api('DELETE', `/itinerary/${tripId}/polls/${pollId}`, {
    email: BYSTANDER_EMAIL,
  });
  check('a non-creator member cannot remove the poll (403)', bystanderRemove.status === 403, bystanderRemove.status);

  const removed = await api('DELETE', `/itinerary/${tripId}/polls/${pollId}`, {
    email: AUTHOR_EMAIL,
  });
  check(
    'the creator removes the poll and the payload is emptied',
    removed.status === 200 && removed.body?.poll?.body === '' && removed.body?.poll?.votes?.length === 0,
    removed.body?.poll
  );

  const afterRemove = await api('GET', `/itinerary/${tripId}/polls`, { email: OWNER_EMAIL });
  check(
    'a removed poll disappears from the list',
    !((afterRemove.body?.polls as any[] | undefined) || []).some((row) => row._id === pollId),
    afterRemove.body
  );

  const voteRemoved = await api('POST', `/itinerary/${tripId}/polls/${pollId}/votes`, {
    email: AUTHOR_EMAIL,
    body: { choice: SEALED_CHOICE_A },
  });
  check('voting on a removed poll is a 404', voteRemoved.status === 404, voteRemoved.status);

  /* ------------------------------- cleanup --------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await TripPoll.deleteMany({ tripId: trip._id });
  await TripComment.deleteMany({ tripId: trip._id });
  await TripDecision.deleteMany({ tripId: trip._id });
  await Trip.deleteMany({ 'tripDetails.smoke_f13': true });
  await User.deleteMany({
    email: {
      $in: [OWNER_EMAIL, AUTHOR_EMAIL, BYSTANDER_EMAIL, VIEWER_EMAIL, STRANGER_EMAIL],
    },
  });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-f13 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
