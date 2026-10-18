/**
 * Backfills legacy trips for Milestone 6 (E1): every document that has no
 * `members[]` yet gets `members: [{ userId: creator, role: 'owner', joinedAt:
 * }]`, and `rev` is set to 1 when missing.
 *
 * Idempotent — re-running only touches documents still missing a member. It
 * uses the raw collection (`Trip.collection.updateMany`) with an aggregation
 * pipeline so the mongoose rev-increment hooks do NOT apply (a backfill must
 * not bump the counter it is initializing).
 *
 * Run: npm run migrate:members
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI ?? '';

async function run(): Promise<void> {
  if (!MONGODB_URI) {
    console.error('migrate:members — MONGODB_URI is not set. Aborting (nothing was changed).');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('migrate:members — connected');

  const collection = mongoose.connection.collection('trips');

  const filter = {
    $or: [{ members: { $exists: false } }, { 'members.0': { $exists: false } }],
    userId: { $exists: true },
  };

  const toBackfill = await collection.countDocuments(filter);
  console.log(`migrate:members — trips to backfill: ${toBackfill}`);
  if (toBackfill === 0) {
    console.log('migrate:members — nothing to do, already up to date.');
    return;
  }

  // Update pipeline (MongoDB 4.2+). `$createdAt` is available on MongoDB 5+;
  // on 4.x the joinedAt defaults to the backfill run time.
  const pipeline: Record<string, unknown>[] = [
    {
      $set: {
        members: [
          {
            userId: '$userId',
            role: 'owner',
            joinedAt: { $ifNull: ['$createdAt', '$$NOW'] },
          },
        ],
        rev: { $ifNull: ['$rev', 1] },
      },
    },
  ];

  try {
    const result = await collection.updateMany(filter, pipeline);
    console.log(`migrate:members — matched ${result.matchedCount}, updated ${result.modifiedCount}`);
  } catch (error: any) {
    if (String(error?.codeName || error?.message || '').includes('NOW')) {
      console.error(
        'migrate:members — this MongoDB version does not support $$NOW (< 5.0). ' +
          'Re-run with "fallback" to stamp joinedAt with the run time instead:'
      );
    }
    throw error;
  }

  const remaining = await collection.countDocuments(filter);
  console.log(`migrate:members — remaining unbackfilled: ${remaining}`);
  if (remaining > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('migrate:members — failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
