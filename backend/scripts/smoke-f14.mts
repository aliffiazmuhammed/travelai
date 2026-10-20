/**
 * Live smoke test for Milestone 7 sprint F14 (profile editing).
 * Run with the API server up:
 *   npm start        (respects SMOKE_PORT, default 5059)
 *   npx tsx scripts/smoke-f14.mts
 *
 * Covers what a unit test cannot: the name actually reaching another member's
 * chat label and the members list, the photo landing in storage and travelling
 * to another member's comment row, byte-level photo walls (a text file and a PDF
 * both refused), removal, and the password change cycle (wrong current refused,
 * too-short refused, old password stops working, new one works).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripComment from '../src/models/TripComment.js';

const PORT = process.env.SMOKE_PORT || '5059';
const BASE = `http://127.0.0.1:${PORT}/api`;
const OWNER_EMAIL = 'smoke-f14-owner@example.com';
const MEMBER_EMAIL = 'smoke-f14-member@example.com';
const OWNER_PASSWORD = 'Smoke-F14-Owner!123';
const MEMBER_PASSWORD = 'Smoke-F14-Member!123';
const NEXT_PASSWORD = 'Smoke-F14-Rotated!456';

/** A real 1x1 PNG (magic bytes included, so the server's sniff accepts it). */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { email?: string; body?: unknown; form?: FormData } = {}
): Promise<{ status: number; body: any; text: string }> {
  const headers: Record<string, string> = { ...authHeader(opts.email || '') };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  let parsed: any = null;
  let text = '';
  try {
    text = await res.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const tokenCookie = setCookies.find((cookie) => cookie.startsWith('token=')) ?? '';
  if (tokenCookie) jars.set(opts.email || '', tokenCookie.split(';')[0].split('=')[1]);
  return { status: res.status, body: parsed, text };
}

/** Sign-in that reports its own outcome instead of asserting (password tests). */
async function trySignin(
  email: string,
  password: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

async function signin(email: string, password: string): Promise<any> {
  const res = await api('POST', '/auth/signin', { email, body: { email, password } });
  check(`signin ${email}`, res.status === 200, res.body);
  return res.body?.user;
}

function avatarForm(buffer: Buffer, filename: string, type: string): FormData {
  const form = new FormData();
  form.append('avatar', new Blob([buffer], { type }), filename);
  return form;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const upsert = async (email: string, password: string) => {
    const passwordHash = await bcrypt.hash(password, 10);
    return User.findOneAndUpdate(
      { email },
      { email, password: passwordHash, $unset: { name: 1, avatarUrl: 1 } },
      { upsert: true, new: true }
    );
  };

  const owner = await upsert(OWNER_EMAIL, OWNER_PASSWORD);
  const member = await upsert(MEMBER_EMAIL, MEMBER_PASSWORD);

  await Trip.deleteMany({ 'tripDetails.smoke_f14': true });
  const trip = await Trip.create({
    userId: owner._id,
    tripDetails: {
      smoke_f14: true,
      trip_title: 'F14 Profile Smoke',
      duration_days: 1,
      budget_per_person: 5000,
      group_type: 'friends',
      season: 'summer',
      day_by_day_itinerary: [{ day: 1, title: 'Arrive', activities: [] }],
    },
    title: 'F14 Profile Smoke',
    status: 'planned',
    members: [
      { userId: owner._id, role: 'owner', joinedAt: new Date() },
      { userId: member._id, role: 'commenter', joinedAt: new Date() },
    ],
  });
  await TripComment.deleteMany({ tripId: trip._id });
  await mongoose.disconnect();

  const tripId = String(trip._id);
  console.log(
    `seeded trip ${tripId} (avatar cap: ${process.env.AVATAR_MAX_MB || 2} MB)\n`
  );

  /* -------------------------------- auth walls ----------------------------- */
  const anonymousProfile = await api('PATCH', '/auth/profile', { body: { name: 'Nope' } });
  check('profile editing requires a session (401)', anonymousProfile.status === 401, anonymousProfile.status);
  const anonymousAvatar = await api('POST', '/auth/avatar', { form: new FormData() });
  check('photo upload requires a session (401)', anonymousAvatar.status === 401, anonymousAvatar.status);

  const ownerUser = await signin(OWNER_EMAIL, OWNER_PASSWORD);
  await signin(MEMBER_EMAIL, MEMBER_PASSWORD);

  /* ------------------------------- display name ---------------------------- */
  const blank = await api('PATCH', '/auth/profile', { email: OWNER_EMAIL, body: { name: '   ' } });
  check('an empty name is accepted and clears it', blank.status === 200, blank.body);

  const tooLong = await api('PATCH', '/auth/profile', {
    email: OWNER_EMAIL,
    body: { name: 'x'.repeat(41) },
  });
  check('a 41-character name is refused (400)', tooLong.status === 400, tooLong.body);

  const named = await api('PATCH', '/auth/profile', {
    email: OWNER_EMAIL,
    body: { name: '  Ada   Lovelace  ' },
  });
  check('a name is saved (200)', named.status === 200, named.body);
  check(
    'the name is trimmed and inner whitespace collapsed',
    named.body?.user?.name === 'Ada Lovelace',
    named.body?.user
  );
  check(
    'the effective label is the display name',
    named.body?.user?.label === 'Ada Lovelace',
    named.body?.user
  );

  const me = await api('GET', '/auth/me', { email: OWNER_EMAIL });
  check('/auth/me carries the saved name', me.body?.user?.name === 'Ada Lovelace', me.body?.user);

  /* ------------------------- label ripple: chat + members ------------------ */
  const memberComment = await api('POST', `/itinerary/${tripId}/comments`, {
    email: MEMBER_EMAIL,
    body: { body: 'Hello from the member' },
  });
  check('the member can comment (201)', memberComment.status === 201, memberComment.body);

  const ownerName = await api('PATCH', '/auth/profile', {
    email: MEMBER_EMAIL,
    body: { name: 'Grace Hopper' },
  });
  check('the member sets their own name', ownerName.status === 200, ownerName.body);

  const comments = await api('GET', `/itinerary/${tripId}/comments`, { email: OWNER_EMAIL });
  const row = (comments.body?.comments as any[] | undefined)?.find(
    (entry) => entry._id === memberComment.body?.comment?._id
  );
  check(
    'another member sees the display name on the comment row',
    row?.label === 'Grace Hopper',
    row?.label
  );

  const membersAsOwner = await api('GET', `/itinerary/${tripId}/members`, { email: OWNER_EMAIL });
  const memberRowOwnerView = (membersAsOwner.body?.members as any[] | undefined)?.find(
    (entry) => entry.userId === String(member._id)
  );
  check(
    "the owner's members list shows the name and the email",
    memberRowOwnerView?.label === 'Grace Hopper' &&
      memberRowOwnerView?.email === MEMBER_EMAIL,
    memberRowOwnerView
  );

  const membersAsMember = await api('GET', `/itinerary/${tripId}/members`, { email: MEMBER_EMAIL });
  const ownerRowMemberView = (membersAsMember.body?.members as any[] | undefined)?.find(
    (entry) => entry.userId === String(owner._id)
  );
  check(
    'a non-owner sees the name but never the email',
    ownerRowMemberView?.label === 'Ada Lovelace' && !ownerRowMemberView?.email,
    ownerRowMemberView
  );

  /* ---------------------------------- photo -------------------------------- */
  const badBytes = await api('POST', '/auth/avatar', {
    email: OWNER_EMAIL,
    form: avatarForm(Buffer.from('not-really-a-photo'), 'fake.png', 'image/png'),
  });
  check('a text file renamed .png is refused (400)', badBytes.status === 400, badBytes.body);

  const pdf = await api('POST', '/auth/avatar', {
    email: OWNER_EMAIL,
    form: avatarForm(Buffer.from('%PDF-1.4 fake'), 'notes.pdf', 'application/pdf'),
  });
  check('a PDF is refused by the upload filter (400)', pdf.status === 400, pdf.body);

  const uploaded = await api('POST', '/auth/avatar', {
    email: OWNER_EMAIL,
    form: avatarForm(PNG_BYTES, 'me.png', 'image/png'),
  });
  check('a real PNG is stored (200)', uploaded.status === 200, uploaded.body);
  const storedUrl = String(uploaded.body?.user?.avatarUrl || '');
  check(
    'the stored URL is one this server manages',
    storedUrl.startsWith('/uploads/avatar-') || storedUrl.includes('res.cloudinary.com'),
    storedUrl
  );

  const ownerComment = await api('POST', `/itinerary/${tripId}/comments`, {
    email: OWNER_EMAIL,
    body: { body: 'Photo check' },
  });
  const refreshed = await api('GET', `/itinerary/${tripId}/comments`, { email: MEMBER_EMAIL });
  const ownerRow = (refreshed.body?.comments as any[] | undefined)?.find(
    (entry) => entry._id === ownerComment.body?.comment?._id
  );
  check(
    "another member's comment row carries the photo URL",
    ownerRow?.avatarUrl === storedUrl,
    ownerRow?.avatarUrl
  );

  const memberListWithPhoto = await api('GET', `/itinerary/${tripId}/members`, {
    email: MEMBER_EMAIL,
  });
  const ownerWithPhoto = (memberListWithPhoto.body?.members as any[] | undefined)?.find(
    (entry) => entry.userId === String(owner._id)
  );
  check(
    'the members list carries the photo too',
    ownerWithPhoto?.avatarUrl === storedUrl,
    ownerWithPhoto
  );

  const removed = await api('DELETE', '/auth/avatar', { email: OWNER_EMAIL });
  check('removing the photo succeeds (200)', removed.status === 200, removed.body);
  check(
    'the account no longer points at a photo',
    !removed.body?.user?.avatarUrl,
    removed.body?.user
  );

  /* -------------------------------- password ------------------------------- */
  const wrongCurrent = await api('POST', '/auth/password', {
    email: OWNER_EMAIL,
    body: { currentPassword: 'definitely-wrong', newPassword: NEXT_PASSWORD },
  });
  check('a wrong current password is refused (401)', wrongCurrent.status === 401, wrongCurrent.body);

  const shortNew = await api('POST', '/auth/password', {
    email: OWNER_EMAIL,
    body: { currentPassword: OWNER_PASSWORD, newPassword: 'short' },
  });
  check('a too-short new password is refused (400)', shortNew.status === 400, shortNew.body);

  const sameNew = await api('POST', '/auth/password', {
    email: OWNER_EMAIL,
    body: { currentPassword: OWNER_PASSWORD, newPassword: OWNER_PASSWORD },
  });
  check('reusing the current password is refused (400)', sameNew.status === 400, sameNew.body);

  const changed = await api('POST', '/auth/password', {
    email: OWNER_EMAIL,
    body: { currentPassword: OWNER_PASSWORD, newPassword: NEXT_PASSWORD },
  });
  check('the password changes (200)', changed.status === 200, changed.body);

  const oldSignin = await trySignin(OWNER_EMAIL, OWNER_PASSWORD);
  check('the old password no longer signs in (401)', oldSignin.status === 401, oldSignin.status);

  const newSignin = await trySignin(OWNER_EMAIL, NEXT_PASSWORD);
  check('the new password signs in (200)', newSignin.status === 200, newSignin.status);

  // Put the seed password back so the next run starts clean (the run itself
  // re-hashes anyway; this keeps manual sign-ins predictable).
  const restored = await api('POST', '/auth/password', {
    email: OWNER_EMAIL,
    body: { currentPassword: NEXT_PASSWORD, newPassword: OWNER_PASSWORD },
  });
  check('the seed password can be restored (200)', restored.status === 200, restored.body);

  /* ------------------------------- name clearing --------------------------- */
  const cleared = await api('PATCH', '/auth/profile', { email: OWNER_EMAIL, body: { name: '' } });
  check('clearing the name succeeds (200)', cleared.status === 200, cleared.body);
  check(
    'the label falls back to the email local part',
    cleared.body?.user?.label === 'smoke-f14-owner' && !cleared.body?.user?.name,
    cleared.body?.user
  );

  // The upload from earlier is gone; the account's display state is clean.
  console.log(`\nseed owner: ${ownerUser?._id}`);

  console.log(
    failures === 0
      ? '\nALL PASS (F14 profile smoke)'
      : `\n${failures} FAILURE(S) (F14 profile smoke)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('smoke-f14 crashed:', error);
  process.exit(1);
});
