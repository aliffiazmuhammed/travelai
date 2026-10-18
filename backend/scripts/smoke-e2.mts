/**
 * Live smoke test for Milestone 6 sprint E2 (members & invites).
 * Run with the API server up on the port below:
 *   $env:PORT = '5059'; npm start     (in a second shell / background)
 *   npx tsx scripts/smoke-e2.mts
 *
 * Creates throwaway data (users `smoke-e2-*@example.com`, one trip, invites),
 * exercises the collaboration flows through the real HTTP surface, prints a
 * checklist, and then deletes everything it created.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-e2-owner@example.com';
const GUEST_EMAIL = 'smoke-e2-guest@example.com';
const PASSWORD = 'Smoke-E2-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

const jars = new Map<string, string>(); // email -> bearer token

function authHeader(email: string): Record<string, string> {
  const token = jars.get(email);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { email?: string; body?: unknown; rawAuth?: string; rawCookie?: string } = {}
): Promise<{ status: number; body: any; rawCookie: string | undefined; setCookie: string | undefined }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...authHeader(opts.email || ''),
      ...(opts.rawAuth ? { Authorization: opts.rawAuth } : {}),
      ...(opts.rawCookie ? { Cookie: `token=${opts.rawCookie}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const tokenCookie = setCookies.find((cookie) => cookie.startsWith('token=')) ?? '';
  return {
    status: res.status,
    body,
    rawCookie: tokenCookie.split(';')[0].split('=')[1] || undefined,
    setCookie: res.headers.get('set-cookie') ?? undefined,
  };
}

async function signin(email: string): Promise<void> {
  const res = await api('POST', '/auth/signin', { body: { email, password: PASSWORD } });
  check(`signin ${email}`, res.status === 200, res.body);
  if (res.rawCookie) jars.set(email, res.rawCookie);
  if (!res.rawCookie) {
    // Bearer fallback impossible (token lives in the cookie) — fail loudly.
    throw new Error('no session cookie came back from signin');
  }
}

async function main() {
  /* ------------------------- seed throwaway data ------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const owner = await User.findOneAndUpdate(
    { email: OWNER_EMAIL },
    { email: OWNER_EMAIL, password: passwordHash },
    { upsert: true, new: true }
  );
  const guest = await User.findOneAndUpdate(
    { email: GUEST_EMAIL },
    { email: GUEST_EMAIL, password: passwordHash },
    { upsert: true, new: true }
  );

  // Remove leftovers from previous runs so the trip/invite state is clean.
  await Trip.deleteMany({ 'tripDetails.smoke_e2': true });
  await Trip.deleteMany({ 'tripDetails.smoke_e2': true, isDeleted: true }).catch(() => {});

  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: { smoke_e2: true, trip_title: 'E2 Smoke Trip' },
    title: 'E2 Smoke Trip',
    status: 'planned',
    members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
    participants: [
      { name: 'owner', isMe: true },
      { name: 'smoke-e2-guest' },
    ],
  });

  await mongoose.disconnect();
  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  /* ------------------------------- flows -------------------------------- */
  await signin(OWNER_EMAIL);
  await signin(GUEST_EMAIL);

  // (1) Owner cannot invite anyone as owner.
  const badInvite = await api('POST', `/itinerary/${tripId}/invites`, {
    email: OWNER_EMAIL,
    body: { role: 'owner' },
  });
  check('owner invite with role=owner is rejected', badInvite.status === 400, badInvite.body);

  // (2) Owner mints a multi-use editor link.
  const created = await api('POST', `/itinerary/${tripId}/invites`, {
    email: OWNER_EMAIL,
    body: { role: 'editor', kind: 'link', maxUses: 2, ttlHours: 24 },
  });
  check('owner creates editor link invite', created.status === 201, created.body);
  const link: string = created.body?.link ?? '';
  const rawToken = link.split('/invite/')[1] ?? '';
  check('returned link carries a non-empty token', rawToken.length === 43, link);
  check(
    "the invite project must not embed the raw token (only the link does)",
    !JSON.stringify(created.body?.invite).includes(rawToken)
  );

  // (3) Owner list shows the invite (hint only).
  const inviteList = await api('GET', `/itinerary/${tripId}/invites`, { email: OWNER_EMAIL });
  check(
    'owner invite list has hint + usedCount',
    inviteList.body?.invites?.[0]?.tokenHint?.length === 6 &&
      inviteList.body?.invites?.[0]?.usedCount === 0,
    inviteList.body
  );

  // (4) Guest previews (does not consume).
  const preview = await api('GET', `/invites/${rawToken}`, { email: GUEST_EMAIL });
  check('guest previews the invite', preview.status === 200, preview.body);
  check(
    'preview names the trip and role',
    preview.body?.trip?.title === 'E2 Smoke Trip' && preview.body?.role === 'editor',
    preview.body
  );

  // (5) Guest accepts — joins as editor.
  const accept1 = await api('POST', `/invites/${rawToken}/accept`, { email: GUEST_EMAIL });
  check('guest accepts', accept1.status === 200 && accept1.body?.role === 'editor', accept1.body);
  check(
    'accept reports the trip id',
    accept1.body?.tripId === tripId,
    accept1.body
  );

  // (6) Re-accept is idempotent and does not consume the second use.
  const accept2 = await api('POST', `/invites/${rawToken}/accept`, { email: GUEST_EMAIL });
  check(
    're-accept says alreadyMember without consuming',
    accept2.status === 200 && accept2.body?.alreadyMember === true,
    accept2.body
  );
  const afterReaccept = await api('GET', `/itinerary/${tripId}/invites`, { email: OWNER_EMAIL });
  check(
    'usedCount still 1 after re-accept',
    afterReaccept.body?.invites?.[0]?.usedCount === 1,
    afterReaccept.body
  );

  // (7) Guest's dashboard lists the trip with their role (F9).
  const guestList = await api('GET', '/itinerary?scope=shared', { email: GUEST_EMAIL });
  const sharedRow = (guestList.body || []).find((row: any) => String(row._id) === tripId);
  check('dashboard scope=shared lists the trip', Boolean(sharedRow), guestList.body?.length);
  check("row carries the guest's role 'editor'", sharedRow?.role === 'editor', sharedRow?.role);
  check(
    "non-owner row hides owner-side fields",
    sharedRow && !('shareId' in sharedRow) && !('generationMeta' in sharedRow),
    sharedRow ? Object.keys(sharedRow) : null
  );

  // (8) Members list: owner sees emails, guest does not (F6).
  const ownerMembers = await api('GET', `/itinerary/${tripId}/members`, { email: OWNER_EMAIL });
  check(
    'owner sees member emails',
    ownerMembers.body?.members?.some((m: any) => m.email === GUEST_EMAIL),
    ownerMembers.body
  );
  const guestMembers = await api('GET', `/itinerary/${tripId}/members`, { email: GUEST_EMAIL });
  check(
    'guest sees no member emails',
    (guestMembers.body?.members || []).every((m: any) => m.email === undefined),
    guestMembers.body
  );
  const guestSelfRow = (guestMembers.body?.members || []).find((m: any) => m.isYou);
  check("guest's own row is flaged isYou", guestSelfRow?.role === 'editor', guestMembers.body);

  // (9) Rank enforcement: the editor guest cannot manage members/invites.
  const guestInviteAttempt = await api('POST', `/itinerary/${tripId}/invites`, {
    email: GUEST_EMAIL,
    body: { role: 'viewer' },
  });
  check('editor guest cannot mint invites', guestInviteAttempt.status === 403, guestInviteAttempt.body);
  const guestRoleChange = await api('PATCH', `/itinerary/${tripId}/members/${String(owner._id)}`, {
    email: GUEST_EMAIL,
    body: { role: 'viewer' },
  });
  check('editor guest cannot change roles', guestRoleChange.status === 403, guestRoleChange.body);

  // (10) Owner role flow: viewer -> editor via PATCH.
  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.updateOne(
    { _id: tripId },
    { $set: { 'members.$[m].role': 'viewer' } },
    { arrayFilters: [{ 'm.userId': guest._id }] }
  );
  await mongoose.disconnect();
  const demote = await api('GET', `/itinerary/${tripId}/members`, { email: GUEST_EMAIL });
  const stillVisible = demote.body?.members?.find((m: any) => m.isYou);
  check('guest can read members as viewer', stillVisible?.role === 'viewer', demote.body);

  const patchBack = await api('PATCH', `/itinerary/${tripId}/members/${String(guest._id)}`, {
    email: OWNER_EMAIL,
    body: { role: 'editor' },
  });
  check(
    'owner patches viewer back to editor',
    patchBack.status === 200 && patchBack.body?.members?.find((m: any) => m.email === GUEST_EMAIL)?.role === 'editor',
    patchBack.body
  );

  // (11) Participant linking: guest's participant row picked up the userId.
  await mongoose.connect(process.env.MONGODB_URI as string);
  const linked = await Trip.findById(tripId);
  const guestParticipant = (linked?.participants || []).find(
    (p: any) => String(p.userId) === String(guest._id)
  );
  check(
    'participant link survives reconcile intact',
    Boolean(guestParticipant),
    linked?.participants
  );
  await mongoose.disconnect();

  // ------- E4: optimistic concurrency (`rev` + baseRev, 409 conflict) -------
  // Required mode without a rev: the guard refuses with the same structured
  // REV_CONFLICT 409 as a genuine stale write ("reload first" UX).
  const staleProbe = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: { participants: [{ name: 'ghost' }] },
  });
  check(
    "required rev: write without baseRev is a 409 REV_CONFLICT",
    staleProbe.status === 409 && staleProbe.body?.code === 'REV_CONFLICT',
    staleProbe.body
  );

  // A genuinely stale rev (one behind reality).
  const beforeStale = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  check('trip payload carries rev', typeof beforeStale.body?.rev === 'number', beforeStale.body?.rev);
  const participantsEcho = (beforeStale.body?.participants || []).map((p: any) => ({
    _id: p._id,
    name: p.name,
    isMe: Boolean(p.isMe),
  }));
  const staleWrite = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: {
      participants: [{ name: 'stale-writer' }],
      baseRev: Math.max(1, (beforeStale.body?.rev ?? 1) - 1),
    },
  });
  check(
    'stale baseRev is a 409 with the currentRev hint',
    staleWrite.status === 409 && staleWrite.body?.code === 'REV_CONFLICT' &&
      staleWrite.body?.currentRev === beforeStale.body?.rev,
    staleWrite.body
  );

  // Two sequential writers: the guest writes from the fresh rev, then the
  // owner writes from the rev the guest's response just published.
  const writerA = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: { participants: participantsEcho, baseRev: beforeStale.body?.rev },
  });
  check('writer A lands with a fresh baseRev', writerA.status === 200, writerA.body);
  const writerARev = writerA.body?.rev;
  const writerB = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: OWNER_EMAIL,
    body: { participants: participantsEcho, baseRev: writerARev },
  });
  check('writer B (owner) lands with the rev A published', writerB.status === 200, writerB.body);
  check(
    'rev increments across sequential writers',
    typeof writerARev === 'number' && writerB.body?.rev === writerARev + 1,
    { writerARev, writerBRev: writerB.body?.rev }
  );
  // A writer still holding writer A's rev is now the stale one:
  const leftoverStale = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: { participants: participantsEcho, baseRev: writerARev },
  });
  check(
    'an out-of-date writer is rejected after the other landed',
    leftoverStale.status === 409 && leftoverStale.body?.code === 'REV_CONFLICT',
    leftoverStale.body
  );

  // (12) Guest (editor) re-saves participants — E4: PUT /participants runs with
  // revMode 'required', so the write must carry the rev it just read
  // (re-uses `participantsEcho` from the E4 block above).
  const tripForGuest = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  const guestRev = tripForGuest.body?.rev;
  const putParticipants = await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: { participants: participantsEcho, baseRev: guestRev },
  });
  check('editor can update participants (with baseRev)', putParticipants.status === 200, putParticipants.body);
  await mongoose.connect(process.env.MONGODB_URI as string);
  const afterPut = await Trip.findById(tripId);
  const linkAfterPut = (afterPut?.participants || []).find(
    (p: any) => String(p.userId) === String(guest._id)
  );
  check('member link survives a participant re-save', Boolean(linkAfterPut), afterPut?.participants);
  await mongoose.disconnect();

  // (13) Owner cannot transfer to a stranger; transfers to the guest.
  // E4: transfer is revMode 'required' now — send a fresh baseRev.
  const badTransfer = await api('POST', `/itinerary/${tripId}/transfer`, {
    email: OWNER_EMAIL,
    body: { toUserId: 'a'.repeat(24), baseRev: (await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL })).body?.rev },
  });
  check('transfer to a non-member is refused', badTransfer.status === 404, badTransfer.body);

  const ownerTripNow = await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL });
  const transfer = await api('POST', `/itinerary/${tripId}/transfer`, {
    email: OWNER_EMAIL,
    body: { toUserId: String(guest._id), baseRev: ownerTripNow.body?.rev },
  });
  check(
    'transfer promotes the guest, demotes the owner',
    transfer.status === 200 &&
      transfer.body?.members?.find((m: any) => m.email === GUEST_EMAIL)?.role === 'owner' &&
      transfer.body?.members?.find((m: any) => m.email === OWNER_EMAIL)?.role === 'editor',
    transfer.body
  );

  // (14) The demoted owner can now leave; the new owner cannot (transfer first).
  const newOwnerLeave = await api('DELETE', `/itinerary/${tripId}/members/me`, {
    email: GUEST_EMAIL,
  });
  check('new owner cannot leave without transferring', newOwnerLeave.status === 409, newOwnerLeave.body);

  const oldOwnerLeave = await api('DELETE', `/itinerary/${tripId}/members/me`, {
    email: OWNER_EMAIL,
  });
  check('demoted owner (editor) leaves', oldOwnerLeave.status === 200, oldOwnerLeave.body);

  const goneList = await api('GET', `/itinerary/${tripId}/members`, { email: GUEST_EMAIL });
  check(
    'leaver is no longer a member',
    !(goneList.body?.members || []).some((m: any) => m.email === OWNER_EMAIL),
    goneList.body
  );

  /* -------------------- E4b: SSE live tier (presence) ------------------- */
  // Requires the server to run with ENABLE_TRIP_SSE=true. When the tier is
  // off, GET /:id/events answers 404 — which itself is a valid expectation.
  const VIEWER_EMAIL = 'smoke-e2-viewer@example.com';
  await mongoose.connect(process.env.MONGODB_URI as string);
  const viewer = await User.findOneAndUpdate(
    { email: VIEWER_EMAIL },
    { email: VIEWER_EMAIL, password: passwordHash },
    { upsert: true, new: true }
  );
  await mongoose.disconnect();

  // A third member joins as viewer (the E2 multi-use link still had a use).
  const viewerTrip = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  const viewerInvite = await api('POST', `/itinerary/${tripId}/invites`, {
    email: GUEST_EMAIL,
    body: { role: 'viewer', kind: 'link', maxUses: 1, ttlHours: 24, baseRev: viewerTrip.body?.rev },
  });
  check('SSE setup: invite mint with baseRev', viewerInvite.status === 201, viewerInvite.body);
  const viewerToken = (viewerInvite.body?.link ?? '').split('/invite/')[1] ?? '';
  await signin(VIEWER_EMAIL);
  const viewerAccept = await api('POST', `/invites/${viewerToken}/accept`, { email: VIEWER_EMAIL });
  check('SSE setup: viewer joins', viewerAccept.status === 200, viewerAccept.body);

  // The SSE stream itself is raw SSE, not JSON:
  async function collectSseFrames(email: string, ms: number): Promise<string[]> {
    const res = await fetch(`${BASE}/itinerary/${tripId}/events`, {
      headers: authHeader(email),
    });
    if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
    const frames: string[] = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const stop = setTimeout(() => void reader.cancel().catch(() => {}), ms);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (line) frames.push(line.slice(6).trim());
          split = buffer.indexOf('\n\n');
        }
      }
    } catch {
      /* the cancel lands here — that's the disconnect path */
    }
    clearTimeout(stop);
    return frames;
  }

  let sseFrames: string[] = [];
  const sseReading = collectSseFrames(VIEWER_EMAIL, 4500).then(
    (frames) => {
      sseFrames = frames;
    },
    (err) => {
      console.log('     SSE reader failed:', String(err));
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 700));

  const beat = await api('POST', `/itinerary/${tripId}/events/heartbeat`, { email: GUEST_EMAIL });
  check('presence heartbeat answers 204', beat.status === 204, beat.status);

  const freshOwnerTrip = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  await api('PUT', `/itinerary/${tripId}/participants`, {
    email: GUEST_EMAIL,
    body: { participants: participantsEcho, baseRev: freshOwnerTrip.body?.rev },
  });
  await sseReading;
  const parsedFrames = sseFrames
    .map((frame) => {
      try {
        return JSON.parse(frame);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  check(
    'SSE stream received trip:updated for the remote write',
    parsedFrames.some((frame) => frame.type === 'trip:updated'),
    parsedFrames.map((frame) => frame.type)
  );
  check(
    'SSE presence frame lists the heartbeating member',
    parsedFrames.some(
      (frame) =>
        frame.type === 'presence' &&
        (frame.users || []).some((u: any) => u.userId === String(guest._id))
    ),
    parsedFrames.find((frame) => frame.type === 'presence')
  );

  // A non-member cannot open the presence stream (404 = indistinguishable).
  const outsiderSse = await fetch(`${BASE}/itinerary/${tripId}/events`, {
    headers: authHeader(OWNER_EMAIL),
  });
  check('non-member is refused the SSE stream', outsiderSse.status === 404, outsiderSse.status);
  void outsiderSse.body?.cancel?.().catch?.(() => {});

  /* ------------------------------- cleanup ------------------------------ */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.deleteMany({ _id: tripId });
  await (await import('../src/models/TripInvite.js')).default.deleteMany({ tripId });
  await User.deleteMany({
    email: { $in: [OWNER_EMAIL, GUEST_EMAIL, VIEWER_EMAIL] },
  });
  const removed = await Trip.countDocuments({ _id: tripId });  await mongoose.disconnect();
  check('smoke data cleaned up', removed === 0);

  console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} SMOKE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('smoke run crashed:', error);
  process.exit(1);
});
