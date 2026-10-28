/**
 * Launch seeding for the public gallery (Milestone 8 G3 gate).
 *
 * The Explore entry in the navbar stays hidden until at least five trips are
 * publicly listed, so a fresh deployment looks like the feature does not exist.
 * This script turns `services/gallery/seedContent.ts` into real accounts and
 * published trips through the same `setTripPublication` path the app uses —
 * no hand-written `visibility` flags, so the seeded rows obey every gallery
 * invariant (owner handle required, agency rows refused, metadata normalized).
 *
 * Idempotent: curator accounts are matched by their deterministic `.invalid`
 * email, and every seeded trip carries `generationMeta.seedBatch`, so a re-run
 * replaces its own trips and leaves real content untouched. Dates are computed
 * from the run date (`--base-date` pins them for tests/reproducibility).
 *
 * Usage:
 *   npm run seed:gallery -- --dry-run
 *   npm run seed:gallery
 *   npm run seed:gallery -- --base-date=2026-11-01
 *   npm run seed:gallery -- --cleanup --dry-run
 *   npm run seed:gallery -- --cleanup
 *
 * Curator passwords are random and never printed or stored in plaintext, so no
 * one can sign into a seed account. Cleanup refuses to delete a curator who
 * owns any non-seed trip.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripJoinRequest from '../src/models/TripJoinRequest.js';
import TripReport from '../src/models/TripReport.js';
import { env } from '../src/config/env.js';
import { setTripPublication } from '../src/services/gallery/publish.js';
import {
  SEED_BATCH,
  SEED_CURATORS,
  buildSeedTrips,
  seedTripTags,
  startOfUtcDay,
  type SeedCurator,
} from '../src/services/gallery/seedContent.js';
import { assertHandleAllowed } from '../src/services/user/profile.js';

const DRY_RUN = process.argv.includes('--dry-run');
const CLEANUP = process.argv.includes('--cleanup');

function log(message: string): void {
  console.log(`seed:gallery — ${message}`);
}

function fail(message: string): never {
  console.error(`seed:gallery — ${message}`);
  process.exit(1);
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseBaseDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail('--base-date must look like 2026-11-01.');
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) fail(`--base-date is not a real date: ${raw}`);
  return date;
}

/** Deletes a set of trips plus the rows that point at them (requests/reports). */
async function purgeTrips(tripIds: string[], curatorIds: string[]): Promise<void> {
  if (tripIds.length === 0) return;

  await TripJoinRequest.deleteMany({ tripId: { $in: tripIds } });
  const reportFilters: Record<string, unknown>[] = [
    { targetType: 'trip', targetId: { $in: tripIds } },
  ];
  if (curatorIds.length > 0) {
    reportFilters.push({ targetType: 'profile', targetId: { $in: curatorIds } });
  }
  await TripReport.deleteMany({ $or: reportFilters });
  await Trip.deleteMany({ _id: { $in: tripIds } });
}

/** Finds or creates the deterministic curator account; returns its user id. */
async function ensureCurator(
  curator: SeedCurator,
  dryRun: boolean
): Promise<string | null> {
  assertHandleAllowed(curator.handle);

  const existing = await User.findOne({
    email: curator.email,
    accountType: 'personal',
  });

  if (existing) {
    const currentHandle = String(existing.profile?.handle ?? '');
    if (currentHandle && currentHandle !== curator.handle) {
      fail(
        `${curator.email} already holds @${currentHandle}; refusing to steal its identity.`
      );
    }
    const clash = await User.exists({
      accountType: 'personal',
      'profile.handle': curator.handle,
      _id: { $ne: existing._id },
    });
    if (clash) {
      fail(`handle @${curator.handle} is already taken by a real account.`);
    }

    if (dryRun) {
      log(`would reuse ${curator.email} (@${curator.handle})`);
      return String(existing._id);
    }

    if (
      existing.name !== curator.name ||
      existing.profile?.handle !== curator.handle ||
      existing.profile?.bio !== curator.bio
    ) {
      existing.name = curator.name;
      existing.profile = { handle: curator.handle, bio: curator.bio };
      await existing.save();
      log(`updated curator @${curator.handle}`);
    } else {
      log(`reusing curator @${curator.handle}`);
    }
    return String(existing._id);
  }

  const clash = await User.exists({
    accountType: 'personal',
    'profile.handle': curator.handle,
  });
  if (clash) {
    fail(`handle @${curator.handle} is already taken by a real account.`);
  }

  if (dryRun) {
    log(`would create ${curator.email} (@${curator.handle})`);
    return null;
  }

  // Random and unrecorded: the account can be displayed but never signed into.
  const password = await bcrypt.hash(
    `Tv!${crypto.randomBytes(18).toString('base64url')}`,
    12
  );
  const created = await User.create({
    email: curator.email,
    password,
    accountType: 'personal',
    status: 'active',
    name: curator.name,
    profile: { handle: curator.handle, bio: curator.bio },
  });
  log(`created curator @${curator.handle}`);
  return String(created._id);
}

async function seed(baseDate: Date): Promise<void> {
  log(`mode: seed${DRY_RUN ? ' (dry run)' : ''}`);
  log(`date base: ${startOfUtcDay(baseDate).toISOString().slice(0, 10)}`);

  const curatorIds = new Map<string, string | null>();
  for (const curator of SEED_CURATORS) {
    curatorIds.set(curator.key, await ensureCurator(curator, DRY_RUN));
  }

  const knownIds = [...curatorIds.values()].filter(
    (id): id is string => Boolean(id)
  );

  const previous = await Trip.find({
    'generationMeta.seedBatch': SEED_BATCH,
    ...(knownIds.length > 0 ? { userId: { $in: knownIds } } : {}),
  })
    .select('_id')
    .lean();
  const previousIds = previous.map((trip) => String(trip._id));

  if (DRY_RUN) {
    log(`would remove ${previousIds.length} previously seeded trip(s)`);
    log(`would publish ${buildSeedTrips(baseDate).length} trips`);
    return;
  }

  await purgeTrips(previousIds, knownIds);
  if (previousIds.length > 0) {
    log(`removed ${previousIds.length} previously seeded trip(s)`);
  }

  const published: Array<{ key: string; id: string; handle: string }> = [];

  for (const trip of buildSeedTrips(baseDate)) {
    const ownerId = curatorIds.get(trip.curatorKey);
    if (!ownerId) fail(`curator ${trip.curatorKey} was not created; aborting.`);

    const doc = await Trip.create({
      userId: ownerId,
      workspace: 'personal',
      title: trip.title,
      status: 'planned',
      ...(trip.startDate && trip.endDate
        ? { startDate: trip.startDate, endDate: trip.endDate }
        : {}),
      tripDetails: trip.tripDetails,
      members: [{ userId: ownerId, role: 'owner', joinedAt: new Date() }],
      generationMeta: {
        seedBatch: SEED_BATCH,
        seedKey: trip.key,
        variant: 'seed',
        request: {
          destination: trip.destination,
          days: trip.tripDetails.duration_days,
          ...(trip.startDate
            ? { start_date: trip.startDate.toISOString().slice(0, 10) }
            : {}),
        },
      },
    });

    await setTripPublication(ownerId, {
      tripId: String(doc._id),
      published: true,
      hideExactDates: trip.hideExactDates,
      summary: trip.summary,
      tags: seedTripTags(trip),
    });

    const curator = SEED_CURATORS.find((entry) => entry.key === trip.curatorKey);
    published.push({
      key: trip.key,
      id: String(doc._id),
      handle: curator?.handle ?? '',
    });
  }

  const listed = await Trip.countDocuments({
    'generationMeta.seedBatch': SEED_BATCH,
    visibility: 'public',
    publishedAt: { $ne: null },
    isDeleted: { $ne: true },
  });

  log(`published ${published.length} trips (${listed} listed in the gallery):`);
  for (const trip of published) {
    console.log(`  @${trip.handle}  /explore/${trip.id}  (${trip.key})`);
  }
  if (listed >= 5) {
    log('Explore nav gate: unlocked (>= 5 public trips).');
  } else {
    log('Explore nav gate: still hidden — fewer than 5 public trips are listed.');
  }
}

async function cleanup(): Promise<void> {
  log(`mode: cleanup${DRY_RUN ? ' (dry run)' : ''}`);

  const curators = await User.find({
    email: { $in: SEED_CURATORS.map((curator) => curator.email) },
    accountType: 'personal',
  }).select('_id profile');

  const curatorIds = curators.map((curator) => String(curator._id));
  const seeded = await Trip.find({ 'generationMeta.seedBatch': SEED_BATCH })
    .select('_id title userId')
    .lean();
  const seededIds = seeded.map((trip) => String(trip._id));

  const removable: string[] = [];
  for (const curator of curators) {
    const realTrips = await Trip.countDocuments({
      userId: curator._id,
      'generationMeta.seedBatch': { $ne: SEED_BATCH },
    });
    if (realTrips > 0) {
      log(
        `keeping @${curator.profile?.handle ?? curator._id}: it owns ${realTrips} non-seed trip(s).`
      );
    } else {
      removable.push(String(curator._id));
    }
  }

  log(`would remove ${seededIds.length} seeded trip(s) and ${removable.length} curator(s)`);
  if (DRY_RUN) return;

  await purgeTrips(seededIds, curatorIds);
  if (removable.length > 0) {
    await User.deleteMany({ _id: { $in: removable } });
  }
  log(`removed ${seededIds.length} trip(s) and ${removable.length} curator(s).`);
}

async function run(): Promise<void> {
  if (!env.MONGODB_URI) fail('MONGODB_URI is not set. Aborting (nothing was changed).');

  const baseDate = parseBaseDate(argValue('base-date'));

  await mongoose.connect(env.MONGODB_URI);
  log(`connected (${mongoose.connection.name})`);

  try {
    if (CLEANUP) {
      await cleanup();
    } else {
      await seed(baseDate);
    }
  } finally {
    await mongoose.connection.close();
  }
}

run().catch((error) => {
  console.error('seed:gallery — failed:', error);
  process.exitCode = 1;
});
