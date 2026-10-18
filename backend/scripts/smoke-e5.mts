/**
 * Live smoke test for Milestone 6 sprint E5 (hardening).
 * Run with the API server up:
 *   npm start        (any port; respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-e5.mts
 *
 * Covers: F11 (128-bit, rate-limited public endpoint), F7 (revoke + rotation),
 * F14 (public allow-list projection), F16 (lean list rows + full fetch on
 * open), F17 (insights track membership-ownership). Throwaway users
 * `smoke-e5-*@example.com` and one marker trip are deleted at the end.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-e5-owner@example.com';
const GUEST_EMAIL = 'smoke-e5-stranger@example.com';
const PASSWORD = 'Smoke-E5-Password!123';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
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
      : {
          'content-type': 'application/json',
          ...authHeader(opts.email || ''),
        },
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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const owner = await User.findOneAndUpdate(
    { email: OWNER_EMAIL },
    { email: OWNER_EMAIL, password: passwordHash },
    { upsert: true, new: true }
  );
  const stranger = await User.findOneAndUpdate(
    { email: GUEST_EMAIL },
    { email: GUEST_EMAIL, password: passwordHash },
    { upsert: true, new: true }
  );

  await Trip.deleteMany({ 'tripDetails.smoke_e5': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_e5: true,
      trip_title: 'E5 Smoke Trip',
      duration_days: 3,
      budget_per_person: 15000,
      group_type: 'solo',
      season: 'winter',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'E5 Smoke Trip',
    status: 'planned',
    members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
    participants: [{ name: 'owner', isMe: true }],
    customRoutes: [{ name: 'daytrip', day: 1, points: [] }],
    generationMeta: { provider: 'smoke', costUsd: 0.01 },
  });

  // A stray trip owned by the stranger so their insights are not empty-vacuous.
  const strangerTrip = await Trip.create({
    userId: stranger._id,
    tripDetails: { smoke_e5: true, trip_title: 'E5 Stranger Trip' },
    members: [{ userId: stranger._id, role: 'owner', joinedAt: new Date() }],
  });

  await mongoose.disconnect();
  const tripId = String(trip._id);
  console.log(`seeded trip ${tripId}\n`);

  await signin(OWNER_EMAIL);
  await signin(GUEST_EMAIL);

  /* ------------------------ F11: share-link mint ------------------------- */
  const share = await api('POST', `/itinerary/${tripId}/share`, { email: OWNER_EMAIL });
  check('owner can share the trip', share.status === 200, share.body);
  const shareId = share.body?.shareId ?? '';
  check('new shareId carries 128 bits (32 hex chars)', /^[0-9a-f]{32}$/.test(shareId), shareId);

  /* ------------------------ F14: public projection ------------------------ */
  const publicRead = await fetch(`${BASE}/itinerary/shared/${shareId}`);
  const publicBody = await publicRead.json().catch(() => null);
  check('anonymous read of the share link works', publicRead.status === 200, publicRead.status);
  check(
    'public payload is the exact allow-list',
    publicBody &&
      Object.keys(publicBody).sort().join(',') ===
        '_id,createdAt,customRoutes,status,title,tripDetails',
    publicBody && Object.keys(publicBody)
  );
  check(
    'public payload includes the drawn route (E5 addition)',
    Array.isArray(publicBody?.customRoutes) && publicBody.customRoutes.length === 1,
    publicBody?.customRoutes
  );

  /* ------------------------ F16: lean list rows --------------------------- */
  const list = await api('GET', '/itinerary', { email: OWNER_EMAIL });
  const row = (list.body || []).find((t: any) => t._id === tripId);
  check('list row exists', Boolean(row), tripId);
  check(
    'list row is a summary (no expenses/participants/versions/generationMeta)',
    row && !('expenses' in row) && !('participants' in row) && !('versions' in row) &&
      !('generationMeta' in row),
    row && Object.keys(row).join(',')
  );
  check('list row keeps the card fields (title/budget/days/rev/role)', row?.rev >= 1 && 'role' in row && row?.tripDetails?.budget_per_person === 15000, row);
  const full = await api('GET', `/itinerary/${tripId}`, { email: OWNER_EMAIL });
  check('full fetch still carries the ledger + meta', Array.isArray(full.body?.expenses) && 'generationMeta' in full.body, Object.keys(full.body || {}));

  /* ---------------- F17: insights follow membership-ownership -------------- */
  // Direct role surgery (transfer semantics are covered by the E2 smoke): the
  // original owner is demoted to editor, the stranger is promoted to owner.
  const beforeOwner = await api('GET', '/itinerary/insights', { email: OWNER_EMAIL });
  const beforeStranger = await api('GET', '/itinerary/insights', { email: GUEST_EMAIL });
  const inOwnerBefore = (beforeOwner.body?.topDestinations || []).some(
    (d: any) => d.name === 'E5 Smoke Trip'
  );
  const inStrangerBefore = (beforeStranger.body?.topDestinations || []).some(
    (d: any) => d.name === 'E5 Smoke Trip'
  );
  check('insights aggregate surfaces the trip for its owner', inOwnerBefore, beforeOwner.body);
  check('insights aggregate hides the trip from a non-owner', !inStrangerBefore, beforeStranger.body);

  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.updateOne(
    { _id: tripId, 'members.userId': owner._id },
    { $set: { 'members.$.role': 'editor' } }
  );
  await Trip.updateOne(
    { _id: tripId, 'members.userId': { $ne: stranger._id } },
    { $push: { members: { userId: stranger._id, role: 'owner', joinedAt: new Date() } } }
  );
  await mongoose.disconnect();

  const afterOwner = await api('GET', '/itinerary/insights', { email: OWNER_EMAIL });
  const afterStranger = await api('GET', '/itinerary/insights', { email: GUEST_EMAIL });
  const inOwnerAfter = (afterOwner.body?.topDestinations || []).some(
    (d: any) => d.name === 'E5 Smoke Trip'
  );
  const inStrangerAfter = (afterStranger.body?.topDestinations || []).some(
    (d: any) => d.name === 'E5 Smoke Trip'
  );
  check(
    'insights follow membership: demoted owner loses the trip, promoted one gains it',
    !inOwnerAfter && inStrangerAfter,
    { inOwnerAfter, inStrangerAfter }
  );

  /* ------------------------ F7: revoke + rotation ------------------------- */
  const latest = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  const revoked = await api('DELETE', `/itinerary/${tripId}/share`, {
    email: GUEST_EMAIL,
    body: {},
  });
  check('new owner can revoke the public link', revoked.status === 200, revoked.body);
  const deadLink = await fetch(`${BASE}/itinerary/shared/${shareId}`);
  check('the old share URL is dead after revoke', deadLink.status === 404, deadLink.status);
  const afterRevoke = await api('GET', `/itinerary/${tripId}`, { email: GUEST_EMAIL });
  check('shareId is cleared after revoke', !afterRevoke.body?.shareId, afterRevoke.body?.shareId);

  // Rotation: re-sharing mints a different id than the first one.
  const reshare = await api('POST', `/itinerary/${tripId}/share`, { email: GUEST_EMAIL });
  check(
    're-share mints a fresh 128-bit id (rotation)',
    reshare.status === 200 &&
      /^[0-9a-f]{32}$/.test(reshare.body?.shareId ?? '') &&
      reshare.body?.shareId !== shareId,
    shareId === reshare.body?.shareId
  );
  const freshReviewer = await api('GET', `/itinerary/shared/${reshare.body?.shareId}`, {
    anonymous: true,
  } as any);
  check(
    'the rotated link resolves publicly',
    freshReviewer.status === 200,
    freshReviewer.status
  );
  void strangerTrip;

  /* ------------------------------ cleanup -------------------------------- */
  await mongoose.connect(process.env.MONGODB_URI as string);
  await Trip.deleteMany({ 'tripDetails.smoke_e5': true });
  await User.deleteMany({ email: { $in: [OWNER_EMAIL, GUEST_EMAIL] } });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('smoke-e5 crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
