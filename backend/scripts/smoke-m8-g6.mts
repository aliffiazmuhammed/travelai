/**
 * Live smoke test for Milestone 8 G6 (reporting, auto-hide, admin moderation),
 * covering the whole gallery happy path on the same seeded data:
 * publish -> browse -> clone -> join request -> approve -> report x3 -> admin.
 *
 * Run with the API server up (default port 5000) and the platform console
 * enabled, because the last stage drives the real admin routes:
 *
 *   $env:PLATFORM_ADMIN_ENABLED='true'; npx tsx src/index.ts
 *   npx tsx scripts/smoke-m8-g6.mts
 *
 * Accounts are seeded straight into the database so the smoke does not burn the
 * 10-attempts/15-minutes signin limiter, and every account, trip, report and
 * join request it creates is removed in `cleanup()`, which runs even when an
 * assertion fails.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripJoinRequest from '../src/models/TripJoinRequest.js';
import TripReport from '../src/models/TripReport.js';
import UserBlock from '../src/models/UserBlock.js';
import PlatformAudit from '../src/models/PlatformAudit.js';

const PORT = process.env.SMOKE_PORT || '5000';
const BASE = `http://127.0.0.1:${PORT}/api`;
const STAMP = Date.now();
const PASSWORD = 'Smoke-M8-G6-Pass!123';
const PREFIX = `smoke-m8-g6-${STAMP}`;

const OWNER_EMAIL = `${PREFIX}-owner@example.test`;
const CLONER_EMAIL = `${PREFIX}-cloner@example.test`;
const REQUESTER_EMAIL = `${PREFIX}-requester@example.test`;
const REPORT_A_EMAIL = `${PREFIX}-report-a@example.test`;
const REPORT_B_EMAIL = `${PREFIX}-report-b@example.test`;
const REPORT_C_EMAIL = `${PREFIX}-report-c@example.test`;
const ADMIN_EMAIL = `${PREFIX}-admin@example.test`;
const OWNER_HANDLE = `g6owner${STAMP}`;

const EMAILS = [
  OWNER_EMAIL,
  CLONER_EMAIL,
  REQUESTER_EMAIL,
  REPORT_A_EMAIL,
  REPORT_B_EMAIL,
  REPORT_C_EMAIL,
  ADMIN_EMAIL,
];

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

function skip(label: string) {
  console.log(`SKIP ${label}`);
}

/* ------------------------------ HTTP helpers ------------------------------ */

const cookies = new Map<string, string>();
/** One signin per account: the auth limiter is 10 attempts / 15 minutes / IP. */
const tokens = new Map<string, string>();

function applySetCookies(res: Response) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(): string {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function call(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any; text: string }> {
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set('cookie', cookieHeader());
  if (init.body) headers.set('content-type', 'application/json');
  const csrf = cookies.get('csrf');
  if (csrf && init.method && init.method !== 'GET') headers.set('x-csrf-token', csrf);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  applySetCookies(res);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

/** The personal and platform realms use different cookie names; keep both. */
function clearSession() {
  cookies.delete('token');
  cookies.delete('platform_token');
}

/** Switches the cookie jar to an account, signing in only the first time. */
async function useAccount(email: string): Promise<boolean> {
  const cached = tokens.get(email);
  if (cached) {
    cookies.set('token', cached);
    return true;
  }

  clearSession();
  await call('/auth/csrf');
  const res = await call('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const token = cookies.get('token');
  if (res.status === 200 && token) {
    tokens.set(email, token);
    return true;
  }
  return false;
}

async function useAdmin(email: string): Promise<boolean> {
  const cached = tokens.get(email);
  if (cached) {
    cookies.set('platform_token', cached);
    return true;
  }

  clearSession();
  const csrf = await call('/admin/auth/csrf');
  if (csrf.status === 404) return false;
  const res = await call('/admin/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const token = cookies.get('platform_token');
  if (res.status === 200 && token) {
    tokens.set(email, token);
    return true;
  }
  return false;
}

/* --------------------------------- Fixture -------------------------------- */

const createdTripIds: string[] = [];
const createdUserIds: string[] = [];
let ownerHandle = OWNER_HANDLE;
let adminEnabled = true;

function futureWindow(days: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return { start, end };
}

async function seedTrip(ownerId: mongoose.Types.ObjectId, title: string) {
  const { start, end } = futureWindow(5);
  const trip = await Trip.create({
    userId: ownerId,
    title,
    // A private draft: the publish endpoint under test is what takes it public.
    visibility: 'private',
    status: 'planned',
    startDate: start,
    endDate: end,
    tripDetails: {
      trip_title: title,
      destination: 'Kochi',
      duration_days: 5,
      group_type: 'friends',
      season: 'winter',
      budget_per_person: 24000,
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Fort Kochi',
          activities: [{ name: 'Chinese fishing nets', time: '17:30' }],
        },
      ],
    },
    members: [{ userId: ownerId, role: 'owner' }],
    generationMeta: { request: { destination: 'Kochi' } },
  });
  createdTripIds.push(String(trip._id));
  return String(trip._id);
}

/* ---------------------------------- Flow ---------------------------------- */

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const seedUser = async (
    email: string,
    extra: Record<string, unknown> = {}
  ): Promise<any> => {
    const user = await User.create({
      email,
      password: passwordHash,
      name: email.split('@')[0],
      accountType: 'personal',
      status: 'active',
      ...extra,
    });
    createdUserIds.push(String(user._id));
    return user;
  };

  /* 1. Synthetic accounts -------------------------------------------------- */
  const owner = await seedUser(OWNER_EMAIL, {
    name: 'G6 Smoke Owner',
    profile: { handle: OWNER_HANDLE, bio: 'Synthetic G6 smoke owner.' },
  });
  const cloner = await seedUser(CLONER_EMAIL);
  const requester = await seedUser(REQUESTER_EMAIL);

  for (const email of [REPORT_A_EMAIL, REPORT_B_EMAIL, REPORT_C_EMAIL]) {
    await seedUser(email);
  }

  // The admin row is seeded directly: the bootstrap CLI owns real provisioning,
  // and this account is deleted before the script exits.
  const admin = await User.create({
    email: ADMIN_EMAIL,
    password: passwordHash,
    name: 'Smoke G6 Admin',
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
    mustChangePassword: false,
  });
  createdUserIds.push(String(admin._id));

  const primaryTripId = await seedTrip(owner._id, 'G6 Smoke — Kochi Backwaters');
  const secondTripId = await seedTrip(owner._id, 'G6 Smoke — Munnar Hills');

  /* 2. Publish (owner) ----------------------------------------------------- */
  check('owner signs in', await useAccount(OWNER_EMAIL));

  const publishPrimary = await call(`/itinerary/${primaryTripId}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({
      published: true,
      hideExactDates: false,
      summary: 'Five slow days around the backwaters.',
      tags: ['kerala', 'slow-travel'],
    }),
  });
  check('publish primary trip (200)', publishPrimary.status === 200, publishPrimary.body);
  check(
    'publish records visibility=public and publishedAt',
    publishPrimary.body?.publication?.visibility === 'public' &&
      Boolean(publishPrimary.body?.publication?.publishedAt),
    publishPrimary.body?.publication
  );

  const publishSecond = await call(`/itinerary/${secondTripId}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({
      published: true,
      summary: 'Tea country in three days.',
      tags: ['kerala'],
    }),
  });
  check('publish second trip (200)', publishSecond.status === 200, publishSecond.body);

  /* 3. Browse (anonymous) -------------------------------------------------- */
  clearSession();
  const listing = await call('/explore?q=Kochi');
  const listingIds = (listing.body?.trips ?? []).map((trip: any) => trip._id);
  check(
    'anonymous listing returns the published trips',
    listing.status === 200 && listingIds.includes(primaryTripId),
    listing.body
  );
  check(
    'listing never carries budget, expenses, members or email',
    !/budget_per_person|expenses|members|@example\.test/.test(listing.text),
    listing.text.slice(0, 400)
  );

  const publicPage = await call(`/explore/${primaryTripId}`);
  check('public trip page loads (200)', publicPage.status === 200, publicPage.body);
  check(
    'public page is an allow-listed projection',
    publicPage.body?.trip?.publisher?.handle === ownerHandle &&
      !/budget_per_person|expenses|members|@example\.test/.test(publicPage.text),
    publicPage.text.slice(0, 400)
  );

  const traveler = await call(`/travelers/${ownerHandle}`);
  check(
    'traveler page lists both published trips',
    traveler.status === 200 &&
      (traveler.body?.traveler?.trips ?? []).filter((trip: any) =>
        [primaryTripId, secondTripId].includes(trip._id)
      ).length === 2,
    traveler.body
  );

  /* 4. Clone --------------------------------------------------------------- */
  check('cloner signs in', await useAccount(CLONER_EMAIL));
  const clone = await call(`/itinerary/${primaryTripId}/clone`, { method: 'POST' });
  check('clone creates a personal draft (201)', clone.status === 201, clone.body);
  const cloneId = String(clone.body?._id ?? '');
  if (cloneId) createdTripIds.push(cloneId);
  check(
    'clone is private, owned by the cloner, and attributes the source handle',
    clone.body?.visibility === 'private' &&
      String(clone.body?.userId) === String(cloner._id) &&
      clone.body?.clonedFrom?.ownerHandle === ownerHandle,
    { visibility: clone.body?.visibility, clonedFrom: clone.body?.clonedFrom }
  );
  check(
    'clone never copies money, other members or the source share link',
    !clone.body?.expenses?.length &&
      !clone.body?.shareId &&
      !clone.body?.generationMeta &&
      (clone.body?.members ?? []).every(
        (member: any) => String(member.userId) !== String(owner._id)
      ),
    {
      expenses: clone.body?.expenses,
      shareId: clone.body?.shareId,
      members: clone.body?.members,
    }
  );

  /* 5. Join request -> owner approval -------------------------------------- */
  check('requester signs in', await useAccount(REQUESTER_EMAIL));
  const join = await call(`/itinerary/${primaryTripId}/join-request`, {
    method: 'POST',
    body: JSON.stringify({ message: 'I would love to join and can help with the drive.' }),
  });
  check('requester creates a pending request (201)', join.status === 201, join.body);
  const requestId = String(join.body?.request?._id ?? '');
  check('request starts pending', join.body?.request?.status === 'pending', join.body?.request);

  const duplicate = await call(`/itinerary/${primaryTripId}/join-request`, {
    method: 'POST',
    body: JSON.stringify({ message: 'Again?' }),
  });
  check('a second pending request is refused (409)', duplicate.status === 409, duplicate.status);

  check('owner signs in', await useAccount(OWNER_EMAIL));
  const queue = await call(`/itinerary/${primaryTripId}/join-requests`);
  check(
    'owner sees exactly the pending request',
    queue.status === 200 &&
      (queue.body?.requests ?? []).length === 1 &&
      queue.body.requests[0]._id === requestId,
    queue.body
  );

  const approve = await call(`/itinerary/${primaryTripId}/join-requests/${requestId}/approve`, {
    method: 'POST',
  });
  check('owner approves the request (200)', approve.status === 200, approve.body);
  check(
    'approval status is approved',
    approve.body?.request?.status === 'approved',
    approve.body?.request
  );

  const ownerTrip = await call(`/itinerary/${primaryTripId}`);
  const requesterMember = (ownerTrip.body?.members ?? []).find(
    (member: any) => String(member.userId) === String(requester._id)
  );
  check(
    'approval grants a commenter seat — never editor',
    requesterMember?.role === 'commenter',
    requesterMember
  );

  check('requester signs back in', await useAccount(REQUESTER_EMAIL));
  const memberView = await call(`/itinerary/${primaryTripId}/join-request`);
  check(
    'requester sees the approved request and membership',
    memberView.status === 200 &&
      memberView.body?.isMember === true &&
      memberView.body?.request?.status === 'approved',
    memberView.body
  );

  /* 6. Reporting and auto-hide --------------------------------------------- */
  const reporters = [REPORT_A_EMAIL, REPORT_B_EMAIL, REPORT_C_EMAIL];
  for (const [index, email] of reporters.entries()) {
    check(`reporter ${index + 1} signs in`, await useAccount(email));
    const report = await call('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'trip',
        targetId: primaryTripId,
        reason: index === 0 ? 'spam' : 'other',
        note: `Smoke report ${index + 1}`,
      }),
    });
    check(`report ${index + 1} accepted (201)`, report.status === 201, report.body);
    if (index < 2) {
      check(`report ${index + 1} does not hide yet`, report.body?.hidden === false, report.body);
    } else {
      check('the third distinct report hides the trip', report.body?.hidden === true, report.body);
    }
  }

  const duplicateReport = await call('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType: 'trip', targetId: primaryTripId, reason: 'spam' }),
  });
  check('re-reporting the same trip is a 409', duplicateReport.status === 409, duplicateReport.status);

  clearSession();
  const hiddenPage = await call(`/explore/${primaryTripId}`);
  check('hidden trip leaves the public page (404)', hiddenPage.status === 404, hiddenPage.status);
  const hiddenListing = await call('/explore?q=Kochi');
  check(
    'hidden trip leaves the listing, sibling stays',
    !(hiddenListing.body?.trips ?? []).some((trip: any) => trip._id === primaryTripId) &&
      (hiddenListing.body?.trips ?? []).some((trip: any) => trip._id === secondTripId),
    hiddenListing.body?.trips?.map((trip: any) => trip._id)
  );
  const hiddenTraveler = await call(`/travelers/${ownerHandle}`);
  check(
    'hidden trip leaves the traveler page too',
    !(hiddenTraveler.body?.traveler?.trips ?? []).some(
      (trip: any) => trip._id === primaryTripId
    ),
    hiddenTraveler.body?.traveler?.trips?.map((trip: any) => trip._id)
  );

  check('owner signs in to see the banner state', await useAccount(OWNER_EMAIL));
  const hiddenOwnerTrip = await call(`/itinerary/${primaryTripId}`);
  check(
    'owner payload carries moderation.hiddenAt for the banner',
    hiddenOwnerTrip.status === 200 && Boolean(hiddenOwnerTrip.body?.moderation?.hiddenAt),
    hiddenOwnerTrip.body?.moderation
  );

  /* 7. Profile report by handle -------------------------------------------- */
  check('reporter 1 signs in', await useAccount(REPORT_A_EMAIL));
  const profileReport = await call('/reports', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'profile',
      targetId: `@${ownerHandle}`,
      reason: 'other',
      note: 'Smoke profile report.',
    }),
  });
  check(
    'a profile report resolves the public handle',
    profileReport.status === 201 &&
      profileReport.body?.hidden === false &&
      profileReport.body?.report?.targetId === String(owner._id),
    profileReport.body
  );

  /* 8. Admin moderation ---------------------------------------------------- */
  if (!(await useAdmin(ADMIN_EMAIL))) {
    adminEnabled = false;
  }
  if (!adminEnabled) {
    skip('admin routes (PLATFORM_ADMIN_ENABLED is off on this server)');
  } else {
    const queueAdmin = await call('/admin/reports?status=open');
    const tripGroup = (queueAdmin.body?.groups ?? []).find(
      (group: any) => group.targetType === 'trip' && group.targetId === primaryTripId
    );
    check(
      'admin queue groups the three trip reports and shows the auto-hide',
      queueAdmin.status === 200 &&
        Boolean(tripGroup) &&
        tripGroup.reportCount === 3 &&
        tripGroup.hidden === true,
      queueAdmin.body?.groups?.map((group: any) => [group.targetId, group.reportCount])
    );
    check(
      'queue reasons are aggregate counts, not reporter identities',
      Array.isArray(tripGroup?.reasons) &&
        tripGroup.reasons.every(
          (entry: any) => typeof entry.count === 'number' && entry.reporter === undefined
        ),
      tripGroup?.reasons
    );

    const dismiss = await call(`/admin/reports/trip/${primaryTripId}/dismiss`, { method: 'POST' });
    check('admin dismisses the reports (200)', dismiss.status === 200, dismiss.body);
    check('dismiss restores the listing', dismiss.body?.hidden === false, dismiss.body);

    clearSession();
    const restored = await call(`/explore/${primaryTripId}`);
    check('restored trip is public again (200)', restored.status === 200, restored.status);

    check('admin signs back in', await useAdmin(ADMIN_EMAIL));
    const profileDismiss = await call(
      `/admin/reports/profile/${String(owner._id)}/dismiss`,
      { method: 'POST' }
    );
    check('admin dismisses the profile report', profileDismiss.status === 200, profileDismiss.body);

    const profileHide = await call(`/admin/reports/profile/${String(owner._id)}/hide`, {
      method: 'POST',
    });
    check(
      'profiles cannot be de-listed from the queue (400)',
      profileHide.status === 400,
      profileHide.status
    );

    const hide = await call(`/admin/reports/trip/${secondTripId}/hide`, { method: 'POST' });
    check(
      'admin de-lists a reported trip',
      hide.status === 200 && hide.body?.hidden === true,
      hide.body
    );

    clearSession();
    const delisted = await call(`/explore/${secondTripId}`);
    check('de-listed trip is no longer public (404)', delisted.status === 404, delisted.status);

    check('admin signs back in to restore', await useAdmin(ADMIN_EMAIL));
    const restore = await call(`/admin/reports/trip/${secondTripId}/dismiss`, { method: 'POST' });
    check(
      'admin restores a de-listed trip',
      restore.status === 200 && restore.body?.hidden === false,
      restore.body
    );

    const hiddenQueue = await call('/admin/reports?status=hidden');
    check(
      'restored reports leave the de-listed tab',
      !(hiddenQueue.body?.groups ?? []).some(
        (group: any) => group.targetId === secondTripId
      ),
      hiddenQueue.body?.groups?.map((group: any) => group.targetId)
    );

    clearSession();
    const restoredAgain = await call(`/explore/${secondTripId}`);
    check('restored trip is public again (200)', restoredAgain.status === 200, restoredAgain.status);
  }

  console.log(`\n${failures === 0 ? 'PASS' : `${failures} FAILURE(S)`}`);
  if (failures > 0) process.exitCode = 1;
}

/* -------------------------------- Cleanup --------------------------------- */

async function cleanup() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI as string);
    }

    const users = await User.find({ email: { $in: EMAILS } }).select('_id').lean();
    const userIds = users.map((user: any) => user._id);
    const trips = await Trip.find({
      $or: [
        {
          _id: {
            $in: createdTripIds.filter((id) => mongoose.isValidObjectId(id)),
          },
        },
        { userId: { $in: userIds } },
      ],
    })
      .select('_id')
      .lean();
    const tripIds = trips.map((trip: any) => trip._id);

    await Promise.all([
      TripJoinRequest.deleteMany({
        $or: [{ tripId: { $in: tripIds } }, { requesterId: { $in: userIds } }],
      }),
      TripReport.deleteMany({
        $or: [
          { targetId: { $in: [...tripIds, ...userIds] } },
          { reporterId: { $in: userIds } },
        ],
      }),
      UserBlock.deleteMany({
        $or: [{ blockerId: { $in: userIds } }, { blockedId: { $in: userIds } }],
      }),
    ]);
    await Trip.deleteMany({ _id: { $in: tripIds } });
    await User.deleteMany({ _id: { $in: userIds } });

    // Moderation smoke also writes platform audit rows. Remove the ones this
    // run created so a dev/staging audit console is not left with phantom
    // sign-ins and content decisions for deleted fixtures.
    await PlatformAudit.deleteMany({
      $or: [
        { actorId: { $in: userIds } },
        { targetId: { $in: [...tripIds, ...userIds].map(String) } },
      ],
    });

    const [leftUsers, leftTrips, leftReports, leftAudits] = await Promise.all([
      User.countDocuments({ email: { $in: EMAILS } }),
      Trip.countDocuments({ _id: { $in: tripIds } }),
      TripReport.countDocuments({
        $or: [
          { targetId: { $in: [...tripIds, ...userIds] } },
          { reporterId: { $in: userIds } },
        ],
      }),
      PlatformAudit.countDocuments({
        $or: [
          { actorId: { $in: userIds } },
          { targetId: { $in: [...tripIds, ...userIds].map(String) } },
        ],
      }),
    ]);
    console.log(
      `cleanup: users=${leftUsers} trips=${leftTrips} reports=${leftReports} audits=${leftAudits}`
    );
    if (
      leftUsers !== 0 ||
      leftTrips !== 0 ||
      leftReports !== 0 ||
      leftAudits !== 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main()
  .catch((error) => {
    console.error('SMOKE ERROR', error);
    process.exitCode = 1;
  })
  .finally(cleanup);
