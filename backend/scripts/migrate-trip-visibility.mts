/**
 * Milestone 8 G1 — trip visibility backfill.
 *
 * Target state: every Trip carries `visibility: 'private' | 'unlisted' |
 * 'public'`. Legacy rows only have the boolean `isPublic`, which is the
 * unlisted share-link flag; nothing has ever been in the gallery.
 *
 * Mapping (idempotent — rows that already have `visibility` are never touched):
 * - `isPublic: true`  → `unlisted` (every currently shared link keeps resolving);
 * - anything else     → `private`.
 *
 * `isPublic` and `shareId` are intentionally left untouched, so revoking a
 * share after the migration keeps behaving exactly as before.
 *
 * Usage:
 *   npm run migrate:trip-visibility -- --dry-run
 *   npm run migrate:trip-visibility
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI ?? '';
const DRY_RUN = process.argv.includes('--dry-run');

function log(message: string): void {
  console.log(`migrate:trip-visibility — ${message}`);
}

async function run(): Promise<void> {
  if (!MONGODB_URI) {
    console.error(
      'migrate:trip-visibility — MONGODB_URI is not set. Aborting (nothing was changed).'
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  log(`connected${DRY_RUN ? ' (dry run: no writes)' : ''}`);

  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle.');

  const trips = db.collection('trips');
  const legacy = {
    $or: [{ visibility: { $exists: false } }, { visibility: null }],
  };

  const sharedFilter = { ...legacy, isPublic: true };
  const privateFilter = { ...legacy, isPublic: { $ne: true } };

  const sharedCount = await trips.countDocuments(sharedFilter);
  const privateCount = await trips.countDocuments(privateFilter);

  if (!DRY_RUN) {
    if (sharedCount > 0) {
      await trips.updateMany(sharedFilter, { $set: { visibility: 'unlisted' } });
    }
    if (privateCount > 0) {
      await trips.updateMany(privateFilter, { $set: { visibility: 'private' } });
    }
  }

  log(
    `${DRY_RUN ? 'would map' : 'mapped'} ${sharedCount} shared trip(s) to unlisted ` +
      `and ${privateCount} other trip(s) to private`
  );

  const remaining = await trips.countDocuments(legacy);
  if (DRY_RUN) {
    log(`dry run complete: ${remaining} trip(s) would be backfilled.`);
    return;
  }
  if (remaining > 0) {
    log(`incomplete: ${remaining} trip(s) still have no visibility`);
    process.exitCode = 1;
    return;
  }
  log('migration complete.');
}

run()
  .catch((error) => {
    console.error('migrate:trip-visibility — failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
