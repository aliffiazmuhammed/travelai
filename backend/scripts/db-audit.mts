/**
 * Read-only: lists databases on the cluster and counts trips / legacy trips
 * (missing members[]) in each — used to pick the right db before migrating.
 */
import mongoose from 'mongoose';

const uri = process.env.AUDIT_URI as string;
if (!uri) throw new Error('set AUDIT_URI');

const conn = await mongoose.createConnection(uri).asPromise();
const admin = conn.db!.admin();
const { databases } = await admin.listDatabases();

for (const { name } of databases) {
  if (['admin', 'local', 'config'].includes(name)) continue;
  const db = conn.useDb(name, { useCache: true });
  // useDb() yields a Mongoose Connection — drop to the raw driver for listing.
  const raw = db.db!;
  const collections = await raw.listCollections().toArray();
  const names = collections.map((c) => c.name);
  const hasTrips = names.includes('trips');
  let total = 0;
  let legacy = 0;
  if (hasTrips) {
    const col = raw.collection('trips');
    total = await col.countDocuments({ isDeleted: { $ne: true } });
    legacy = await col.countDocuments({ isDeleted: { $ne: true }, 'members.0': { $exists: false } });
  }
  console.log(
    `${name.padEnd(20)} collections=${String(names.join(',') || '(none)').slice(0, 60)} trips=${total} legacyNoMembers=${legacy}`
  );
}

await conn.close();
