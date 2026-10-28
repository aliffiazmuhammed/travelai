/**
 * Browser-smoke fixture for Milestone 8 G6.
 *
 * Seeds two synthetic personal accounts and two published trips so the UI can
 * be walked by hand (or by the browser tooling):
 *
 * - `<prefix>-owner`   — has a public handle and two public trips; the second
 *                        carries a moderation marker so the dashboard banner is
 *                        visible without staging three reports.
 * - `<prefix>-visitor` — a plain account used to sign in and submit a report.
 *
 *   npx tsx scripts/smoke-m8-g6-ui.mts           # seed, prints accounts + ids
 *   npx tsx scripts/smoke-m8-g6-ui.mts --cleanup # remove everything it created
 *
 * The prefix is stored in `%TEMP%/m8-g6-ui-fixture.json` so cleanup removes
 * exactly this fixture. All rows are also tagged with `smoke_m8_g6_ui` on the
 * trip details as a second safety net.
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripJoinRequest from '../src/models/TripJoinRequest.js';
import TripReport from '../src/models/TripReport.js';
import UserBlock from '../src/models/UserBlock.js';

const PASSWORD = 'Smoke-M8-G6-Ui!123';
const FIXTURE_FILE = path.join(os.tmpdir(), 'm8-g6-ui-fixture.json');

function futureWindow(offsetDays: number, days: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + offsetDays);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return { start, end };
}

function tripDetails(title: string) {
  return {
    smoke_m8_g6_ui: true,
    trip_title: title,
    destination: 'Kochi',
    duration_days: 4,
    group_type: 'friends',
    season: 'winter',
    budget_per_person: 18500,
    day_by_day_itinerary: [
      {
        day: 1,
        title: 'Fort Kochi',
        activities: [
          { name: 'Chinese fishing nets', time: '17:30' },
          { name: 'Street food walk', time: '19:00' },
        ],
      },
      {
        day: 2,
        title: 'Backwaters',
        activities: [{ name: 'Village canoe ride', time: '09:00' }],
      },
    ],
  };
}

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const emails: string[] = [];
  if (fs.existsSync(FIXTURE_FILE)) {
    try {
      const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'));
      if (Array.isArray(fixture.emails)) emails.push(...fixture.emails);
    } catch {
      /* fall through to the tag sweep */
    }
  }

  const users = await User.find({
    $or: [{ email: { $in: emails } }, { 'profile.handle': /^g6ui/ }],
  })
    .select('_id email')
    .lean();
  const userIds = users.map((user: any) => user._id);
  const trips = await Trip.find({
    $or: [{ userId: { $in: userIds } }, { 'tripDetails.smoke_m8_g6_ui': true }],
  })
    .select('_id')
    .lean();
  const tripIds = trips.map((trip: any) => trip._id);

  await Promise.all([
    TripJoinRequest.deleteMany({
      $or: [{ tripId: { $in: tripIds } }, { requesterId: { $in: userIds } }],
    }),
    TripReport.deleteMany({
      $or: [{ targetId: { $in: [...tripIds, ...userIds] } }, { reporterId: { $in: userIds } }],
    }),
    UserBlock.deleteMany({
      $or: [{ blockerId: { $in: userIds } }, { blockedId: { $in: userIds } }],
    }),
  ]);
  await Trip.deleteMany({ _id: { $in: tripIds } });
  await User.deleteMany({ _id: { $in: userIds } });

  const [leftUsers, leftTrips] = await Promise.all([
    User.countDocuments({ _id: { $in: userIds } }),
    Trip.countDocuments({ _id: { $in: tripIds } }),
  ]);
  fs.rmSync(FIXTURE_FILE, { force: true });
  console.log(`cleanup: users=${leftUsers} trips=${leftTrips} removed=${userIds.length}/${tripIds.length}`);
  if (leftUsers !== 0 || leftTrips !== 0) process.exitCode = 1;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const stamp = Date.now();
  const handle = `g6ui${stamp}`;
  const ownerEmail = `smoke-m8-g6-ui-owner-${stamp}@example.test`;
  const visitorEmail = `smoke-m8-g6-ui-visitor-${stamp}@example.test`;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const owner = await User.create({
    email: ownerEmail,
    password: passwordHash,
    name: 'G6 UI Owner',
    accountType: 'personal',
    status: 'active',
    profile: { handle, bio: 'I plan slow trips around South India.' },
  });
  const visitor = await User.create({
    email: visitorEmail,
    password: passwordHash,
    name: 'G6 UI Visitor',
    accountType: 'personal',
    status: 'active',
  });

  const { start, end } = futureWindow(25, 4);
  const visibleTitle = 'G6 UI — Kochi & the Backwaters';
  const visible = await Trip.create({
    userId: owner._id,
    title: visibleTitle,
    visibility: 'public',
    publishedAt: new Date(),
    status: 'planned',
    startDate: start,
    endDate: end,
    gallery: {
      hideExactDates: false,
      summary: 'Four slow days of fishing nets, ferries and village food.',
      tags: ['kerala', 'slow-travel'],
    },
    tripDetails: tripDetails(visibleTitle),
    members: [{ userId: owner._id, role: 'owner' }],
    generationMeta: { request: { destination: 'Kochi' } },
  });

  const hiddenTitle = 'G6 UI — Hidden After Reports';
  const hidden = await Trip.create({
    userId: owner._id,
    title: hiddenTitle,
    visibility: 'public',
    publishedAt: new Date(),
    status: 'planned',
    startDate: start,
    endDate: end,
    gallery: {
      hideExactDates: false,
      summary: 'This listing is hidden pending review so the banner can be seen.',
      tags: ['kerala'],
    },
    tripDetails: tripDetails(hiddenTitle),
    members: [{ userId: owner._id, role: 'owner' }],
    moderation: { hiddenAt: new Date(), source: 'auto_report' },
    generationMeta: { request: { destination: 'Kochi' } },
  });

  fs.writeFileSync(
    FIXTURE_FILE,
    JSON.stringify(
      {
        password: PASSWORD,
        handle,
        ownerEmail,
        visitorEmail,
        ownerId: String(owner._id),
        visitorId: String(visitor._id),
        visibleTripId: String(visible._id),
        hiddenTripId: String(hidden._id),
        emails: [ownerEmail, visitorEmail],
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        password: PASSWORD,
        handle,
        ownerEmail,
        visitorEmail,
        visibleTripId: String(visible._id),
        hiddenTripId: String(hidden._id),
        exploreUrl: `/explore/${visible._id}`,
        travelerUrl: `/travelers/${handle}`,
        fixtureFile: FIXTURE_FILE,
      },
      null,
      2
    )
  );
}

const run = process.argv.includes('--cleanup') ? cleanup : seed;
run()
  .catch((error) => {
    console.error('FIXTURE ERROR', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
