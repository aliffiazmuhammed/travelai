/**
 * PA0 account-realm migration.
 *
 * Target state (docs/roadmap-platform-admin.md §10.4):
 * - every legacy user is backfilled as `accountType: 'personal'`;
 * - every agency gets a unique slug and `status: 'active'` (unless suspended);
 * - old agency invites are revoked because acceptance semantics changed;
 * - the global unique `email_1` index is replaced by realm/tenant-scoped
 *   partial unique indexes;
 * - `AgencyMember.userId` is unique (one agency account, one tenant);
 * - no agency membership references a personal or platform account.
 *
 * Old agency memberships point at personal accounts by definition. There are two
 * documented ways to resolve them:
 *
 * - `--preserve-legacy-memberships` (§10.3): creates one separate agency account
 *   per `{ agency, personal user }`, copies the existing bcrypt hash once and
 *   forces a password change, then repoints the membership and every
 *   agency-owned actor reference. Nothing is deleted.
 * - `--purge-legacy-memberships` (§10.2 reset path): deletes the memberships and
 *   expects the tenant to be re-provisioned. Destructive; pilot only.
 *
 * Without either flag the script stops and lists the violations instead of
 * guessing.
 *
 * Usage:
 *   npm run migrate:account-realms -- --dry-run
 *   npm run migrate:account-realms -- --preserve-legacy-memberships [--dry-run]
 *   npm run migrate:account-realms -- --purge-legacy-memberships [--dry-run]
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  findAgencyMembershipViolations,
  findDuplicateMembershipUserIds,
  legacyUserBackfill,
  type LegacyMembershipRow,
  type LegacyUserRow,
  type MembershipViolation,
} from '../src/services/auth/legacyMigration.js';
import {
  AGENCY_SLUG_MAX,
  AGENCY_SLUG_MIN,
  allocateAgencySlug,
} from '../src/services/agency/slug.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI ?? '';
const DRY_RUN = process.argv.includes('--dry-run');
const PURGE_LEGACY_MEMBERSHIPS = process.argv.includes(
  '--purge-legacy-memberships'
);
const PRESERVE_LEGACY_MEMBERSHIPS = process.argv.includes(
  '--preserve-legacy-memberships'
);

const AGENCY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(value: string): boolean {
  return (
    value.length >= AGENCY_SLUG_MIN &&
    value.length <= AGENCY_SLUG_MAX &&
    AGENCY_SLUG_PATTERN.test(value)
  );
}

function log(message: string): void {
  console.log(`migrate:account-realms — ${message}`);
}

async function dropIndexIfExists(
  collection: mongoose.mongo.Collection,
  name: string
): Promise<boolean> {
  const existing = (await collection.indexes()).find((index) => index.name === name);
  if (!existing) return false;
  if (DRY_RUN) {
    log(`would drop index ${collection.collectionName}.${name}`);
    return true;
  }
  await collection.dropIndex(name);
  log(`dropped index ${collection.collectionName}.${name}`);
  return true;
}

/** Drops a legacy index matched by its key, regardless of its generated name. */
async function dropIndexByKey(
  collection: mongoose.mongo.Collection,
  keys: Record<string, number>
): Promise<boolean> {
  let dropped = false;
  for (const index of await collection.indexes()) {
    if (!index.key || !index.name || index.name === '_id_') continue;
    const matches = Object.entries(keys).every(
      ([field, order]) => (index.key as Record<string, number>)[field] === order
    );
    if (!matches) continue;
    if (DRY_RUN) {
      log(`would drop index ${collection.collectionName}.${index.name}`);
    } else {
      await collection.dropIndex(index.name);
      log(`dropped index ${collection.collectionName}.${index.name}`);
    }
    dropped = true;
  }
  return dropped;
}

async function ensureIndex(
  collection: mongoose.mongo.Collection,
  keys: Record<string, number>,
  options: {
    name: string;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
  }
): Promise<void> {
  const existing = (await collection.indexes()).find(
    (index) => index.name === options.name
  );
  if (existing) {
    const sameKey = JSON.stringify(existing.key) === JSON.stringify(keys);
    const sameUnique = Boolean(existing.unique) === Boolean(options.unique);
    const samePartial =
      JSON.stringify(existing.partialFilterExpression ?? null) ===
      JSON.stringify(options.partialFilterExpression ?? null);
    if (sameKey && sameUnique && samePartial) {
      log(`index ${collection.collectionName}.${options.name} already current`);
      return;
    }
    if (DRY_RUN) {
      log(`would recreate index ${collection.collectionName}.${options.name}`);
      return;
    }
    await collection.dropIndex(String(options.name));
  }
  if (DRY_RUN) {
    log(`would create index ${collection.collectionName}.${options.name}`);
    return;
  }
  await collection.createIndex(keys, options);
  log(`created index ${collection.collectionName}.${options.name}`);
}

async function backfillUsers(users: mongoose.mongo.Collection): Promise<void> {
  const legacy = await users
    .find({
      $or: [
        { accountType: { $exists: false } },
        { status: { $exists: false } },
        { mustChangePassword: { $exists: false } },
        { tokenVersion: { $exists: false } },
      ],
    })
    .project({ accountType: 1, status: 1, mustChangePassword: 1, tokenVersion: 1 })
    .toArray();

  let updated = 0;
  for (const user of legacy as unknown as LegacyUserRow[]) {
    const patch = legacyUserBackfill(user);
    if (Object.keys(patch).length === 0) continue;
    if (!DRY_RUN) {
      await users.updateOne(
        { _id: user._id as mongoose.Types.ObjectId },
        { $set: patch }
      );
    }
    updated += 1;
  }
  log(`${DRY_RUN ? 'would backfill' : 'backfilled'} ${updated} user row(s)`);
}

interface AgencyRow {
  _id: mongoose.Types.ObjectId;
  name?: string;
  slug?: string;
  status?: string;
  createdAt?: Date;
}

async function backfillAgencies(agencies: mongoose.mongo.Collection): Promise<void> {
  const rows = (await agencies
    .find({})
    .sort({ createdAt: 1, _id: 1 })
    .project({ name: 1, slug: 1, status: 1, createdAt: 1 })
    .toArray()) as AgencyRow[];

  const taken = new Set<string>();
  const operations: mongoose.mongo.AnyBulkWriteOperation[] = [];

  for (const row of rows) {
    const current = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : '';
    const status = row.status === 'suspended' ? 'suspended' : 'active';
    const needsSlug = !isValidSlug(current) || taken.has(current);
    const slug = needsSlug ? allocateAgencySlug(row.name, taken) : current;
    taken.add(slug);

    if (needsSlug || row.slug !== slug || row.status !== status) {
      operations.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { slug, status } },
        },
      });
    }
  }

  if (!DRY_RUN && operations.length > 0) {
    await agencies.bulkWrite(operations, { ordered: false });
  }
  log(
    `${DRY_RUN ? 'would backfill' : 'backfilled'} ${operations.length} agency slug/status row(s)`
  );
}

async function revokeInvites(
  invites: mongoose.mongo.Collection
): Promise<void> {
  const filter = {
    $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }],
  };
  const count = await invites.countDocuments(filter);
  if (!DRY_RUN && count > 0) {
    await invites.updateMany(filter, { $set: { revokedAt: new Date() } });
  }
  log(`${DRY_RUN ? 'would revoke' : 'revoked'} ${count} pending agency invite(s)`);
}

async function loadMembershipState(
  memberships: mongoose.mongo.Collection,
  users: mongoose.mongo.Collection
): Promise<{ violations: MembershipViolation[]; rows: LegacyMembershipRow[] }> {
  const rows = (await memberships
    .find({})
    .project({ userId: 1, agencyId: 1 })
    .toArray()) as unknown as LegacyMembershipRow[];
  const userIds = [
    ...new Set(rows.map((row) => String(row.userId))),
  ].map((id) => new mongoose.Types.ObjectId(id));
  const userRows = (await users
    .find({ _id: { $in: userIds } })
    .project({ accountType: 1, agencyId: 1 })
    .toArray()) as unknown as LegacyUserRow[];
  return { violations: findAgencyMembershipViolations(rows, userRows), rows };
}

/**
 * §10.3 production-preserving repoint for one tenant.
 *
 * Replaces the personal account id with the agency account id in every field
 * that points at a user. Subtrees that are keyed by identity but encrypted for
 * it (chat envelopes) are deliberately left alone.
 */
async function repointAgencyReferences(
  db: mongoose.mongo.Db,
  agencyId: mongoose.Types.ObjectId,
  from: mongoose.Types.ObjectId,
  to: mongoose.Types.ObjectId
): Promise<void> {
  let touched = 0;
  const swap = async (
    collectionName: string,
    filter: Record<string, unknown>,
    fields: string[]
  ): Promise<void> => {
    const result = await db.collection(collectionName).updateMany(
      { ...filter, $or: fields.map((field) => ({ [field]: from })) },
      { $set: Object.fromEntries(fields.map((field) => [field, to])) }
    );
    touched += result.modifiedCount;
  };

  await swap('agencies', { _id: agencyId }, ['createdBy', 'provisionedBy']);
  await swap('agencyassets', { agencyId }, ['createdBy']);
  await swap('agencyclients', { agencyId }, ['createdBy']);
  await swap('agencyexports', { agencyId }, ['requestedBy']);
  await swap('agencyinvites', { agencyId }, ['createdBy']);
  await swap('agencyproposallinks', { agencyId }, ['createdBy']);
  await swap('agencyquotes', { agencyId }, ['createdBy']);
  await swap('agencytemplates', { agencyId }, ['createdBy']);
  await swap('agencytemplateversions', { agencyId }, ['createdBy', 'previewedBy']);
  await swap('agencyaudits', { agencyId }, ['actorId']);
  await swap('agencymembers', { agencyId }, ['invitedBy']);

  const trips = await db.collection('trips').find({ agencyId }).toArray();
  for (const trip of trips) {
    const patch: Record<string, unknown> = {};
    if (String(trip.userId) === String(from)) patch.userId = to;
    if (String(trip.assignedTo) === String(from)) patch.assignedTo = to;

    const members = Array.isArray(trip.members)
      ? trip.members.map((member: Record<string, unknown>) => {
          const next = { ...member };
          if (String(next.userId) === String(from)) next.userId = to;
          if (String(next.invitedBy) === String(from)) next.invitedBy = to;
          return next;
        })
      : [];
    if (JSON.stringify(members) !== JSON.stringify(trip.members ?? [])) {
      patch.members = members;
    }

    const participants = Array.isArray(trip.participants)
      ? trip.participants.map((participant: Record<string, unknown>) => {
          const next = { ...participant };
          if (String(next.userId) === String(from)) next.userId = to;
          return next;
        })
      : [];
    if (JSON.stringify(participants) !== JSON.stringify(trip.participants ?? [])) {
      patch.participants = participants;
    }

    if (Object.keys(patch).length > 0) {
      await db.collection('trips').updateOne({ _id: trip._id }, { $set: patch });
      touched += 1;
    }
  }

  const tripIds = trips.map((trip) => trip._id);
  if (tripIds.length > 0) {
    const scoped = { tripId: { $in: tripIds } };
    await swap('tripcomments', scoped, ['userId']);
    await swap('tripdecisions', scoped, ['userId', 'createdBy']);
    await swap('trippolls', scoped, ['createdBy']);
    await swap('tripreadstates', scoped, ['userId']);
    await swap('tripinvites', scoped, ['createdBy']);
    await swap('tripchatkeys', scoped, ['createdBy']);

    const pollVotes = await db.collection('trippolls').updateMany(
      { tripId: { $in: tripIds }, 'votes.userId': from },
      { $set: { 'votes.$[vote].userId': to } },
      { arrayFilters: [{ 'vote.userId': from }] }
    );
    touched += pollVotes.modifiedCount;

    // Envelopes in `tripchatkeys` are wrapped for a specific identity. Rewriting
    // the key would silently point at ciphertext the new account cannot open.
    const keyRows = await db
      .collection('tripchatkeys')
      .find({ tripId: { $in: tripIds } })
      .project({ envelopes: 1 })
      .toArray();
    const staleKeys = keyRows.filter(
      (row) =>
        row.envelopes &&
        Object.prototype.hasOwnProperty.call(row.envelopes, String(from))
    ).length;
    if (staleKeys > 0) {
      log(
        `warning: ${staleKeys} agency chat key row(s) hold an envelope for the ` +
          'personal account; that history needs a re-key or an accepted loss (§10.3)'
      );
    }
  }

  log(`repointed ${touched} agency-owned reference(s) for agency ${agencyId}`);
}

/**
 * Creates one agency account per legacy membership, keeping the email and
 * copying the bcrypt hash once so the owner can sign in at the workspace URL
 * and is then forced to choose a new password (§10.3).
 */
async function preserveLegacyMemberships(
  db: mongoose.mongo.Db,
  violations: MembershipViolation[]
): Promise<boolean> {
  const users = db.collection('users');
  const memberships = db.collection('agencymembers');
  const now = new Date();

  const plans: Array<{
    violation: MembershipViolation;
    personalUserId: mongoose.Types.ObjectId;
    agencyId: mongoose.Types.ObjectId;
    accountId: mongoose.Types.ObjectId;
  }> = [];

  for (const violation of violations) {
    if (violation.reason !== 'personal_account') {
      log(
        `cannot preserve membership ${violation.membershipId}: ` +
          `${violation.reason} needs manual resolution`
      );
      return false;
    }

    const personalUserId = new mongoose.Types.ObjectId(violation.userId);
    const agencyId = new mongoose.Types.ObjectId(violation.agencyId);
    const personal = await users.findOne({ _id: personalUserId });
    if (!personal?.email || !personal.password) {
      log(
        `cannot preserve membership ${violation.membershipId}: the personal ` +
          'account has no email/password to carry over'
      );
      return false;
    }

    let account = await users.findOne({
      email: personal.email,
      accountType: 'agency',
      agencyId,
    });
    const reused = Boolean(account);
    if (!account) {
      account = {
        _id: new mongoose.Types.ObjectId(),
        email: personal.email,
        password: personal.password,
        accountType: 'agency',
        agencyId,
        status: 'active',
        mustChangePassword: true,
        tokenVersion: 0,
        name: personal.name,
        createdAt: now,
        updatedAt: now,
      };
      if (!DRY_RUN) await users.insertOne(account);
    }

    plans.push({
      violation,
      personalUserId,
      agencyId,
      accountId: account._id as mongoose.Types.ObjectId,
    });
    log(
      `${DRY_RUN ? 'would create' : reused ? 'reused' : 'created'} agency ` +
        `account ${personal.email} in agency ${violation.agencyId}` +
        (reused ? '' : ' (existing password hash copied once, change forced)')
    );
  }

  if (DRY_RUN) {
    log(
      `would repoint ${plans.length} membership(s) and their agency-owned ` +
        'references (no deletes)'
    );
    return true;
  }

  for (const plan of plans) {
    await memberships.updateOne(
      { _id: new mongoose.Types.ObjectId(plan.violation.membershipId) },
      { $set: { userId: plan.accountId } }
    );
    await repointAgencyReferences(
      db,
      plan.agencyId,
      plan.personalUserId,
      plan.accountId
    );
  }
  log(`repointed ${plans.length} membership(s); no rows were deleted`);

  const { violations: remaining } = await loadMembershipState(memberships, users);
  if (remaining.length > 0) {
    log(
      `preserve incomplete: ${remaining.length} membership(s) still violate ` +
        'the tenant invariant'
    );
    for (const violation of remaining.slice(0, 20)) {
      log(
        `  membership ${violation.membershipId}: user ${violation.userId} ` +
          `-> agency ${violation.agencyId} (${violation.reason})`
      );
    }
    return false;
  }
  return true;
}

async function migrateMemberships(
  memberships: mongoose.mongo.Collection,
  users: mongoose.mongo.Collection,
  db: mongoose.mongo.Db
): Promise<boolean> {
  let { violations, rows: membershipRows } = await loadMembershipState(
    memberships,
    users
  );

  const isPurgeable = (violation: MembershipViolation): boolean =>
    ['personal_account', 'platform_account', 'missing_account'].includes(
      violation.reason
    );

  let purgeable = violations.filter(isPurgeable);
  let purgeIds = new Set(purgeable.map((violation) => violation.membershipId));

  if (purgeable.length > 0 && PRESERVE_LEGACY_MEMBERSHIPS) {
    const preserved = await preserveLegacyMemberships(db, purgeable);
    if (!preserved) return false;
    if (DRY_RUN) return true;

    ({ violations, rows: membershipRows } = await loadMembershipState(
      memberships,
      users
    ));
    purgeable = violations.filter(isPurgeable);
    purgeIds = new Set(purgeable.map((violation) => violation.membershipId));
  }

  if (purgeable.length > 0) {
    if (!PURGE_LEGACY_MEMBERSHIPS) {
      log(
        `${purgeable.length} membership(s) reference a non-agency account. ` +
          'Re-run with --preserve-legacy-memberships to repoint them (§10.3), ' +
          'or with --purge-legacy-memberships to remove them (reset path).'
      );
      for (const violation of purgeable.slice(0, 20)) {
        log(
          `  membership ${violation.membershipId}: user ${violation.userId} ` +
            `-> agency ${violation.agencyId} (${violation.reason})`
        );
      }
      return false;
    }

    const rawIds = membershipRows
      .filter((row) => purgeIds.has(String(row._id)))
      .map((row) => new mongoose.Types.ObjectId(String(row._id)));
    if (!DRY_RUN) {
      await memberships.deleteMany({ _id: { $in: rawIds } });
    }
    log(
      `${DRY_RUN ? 'would remove' : 'removed'} ${rawIds.length} legacy membership(s)`
    );
  }

  const remaining = violations.filter(
    (violation) => !purgeIds.has(violation.membershipId)
  );
  if (remaining.length > 0) {
    log(`${remaining.length} membership(s) still violate the tenant invariant:`);
    for (const violation of remaining.slice(0, 20)) {
      log(
        `  membership ${violation.membershipId}: user ${violation.userId} ` +
          `-> agency ${violation.agencyId} (${violation.reason})`
      );
    }
    return false;
  }

  const effectiveRows =
    purgeIds.size > 0
      ? membershipRows.filter((row) => !purgeIds.has(String(row._id)))
      : membershipRows;
  const duplicates = findDuplicateMembershipUserIds(effectiveRows);
  if (duplicates.length > 0) {
    log(
      `${duplicates.length} user(s) belong to more than one agency and block the ` +
        'unique AgencyMember.userId index:'
    );
    for (const userId of duplicates.slice(0, 20)) log(`  user ${userId}`);
    return false;
  }

  return true;
}

async function run(): Promise<void> {
  if (!MONGODB_URI) {
    console.error(
      'migrate:account-realms — MONGODB_URI is not set. Aborting (nothing was changed).'
    );
    process.exit(1);
  }
  if (PURGE_LEGACY_MEMBERSHIPS && PRESERVE_LEGACY_MEMBERSHIPS) {
    console.error(
      'migrate:account-realms — choose either --preserve-legacy-memberships ' +
        'or --purge-legacy-memberships, not both.'
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  log(`connected${DRY_RUN ? ' (dry run: no writes)' : ''}`);

  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle.');

  const users = db.collection('users');
  const agencies = db.collection('agencies');
  const memberships = db.collection('agencymembers');
  const invites = db.collection('agencyinvites');

  // Must run before the preserve path: the legacy global unique `email_1` index
  // forbids the same email in a second realm, which is exactly what §10.3
  // creates (personal + agency account for one person).
  await dropIndexIfExists(users, 'email_1');

  await backfillUsers(users);
  await backfillAgencies(agencies);
  await revokeInvites(invites);

  const membershipsOk = await migrateMemberships(memberships, users, db);

  await ensureIndex(
    users,
    { email: 1 },
    {
      name: 'personal_email_unique',
      unique: true,
      partialFilterExpression: { accountType: 'personal' },
    }
  );
  await ensureIndex(
    users,
    { email: 1 },
    {
      name: 'platform_email_unique',
      unique: true,
      partialFilterExpression: { accountType: 'platform' },
    }
  );
  await ensureIndex(
    users,
    { agencyId: 1, email: 1 },
    {
      name: 'agency_email_unique',
      unique: true,
      partialFilterExpression: { accountType: 'agency' },
    }
  );
  await ensureIndex(
    users,
    { accountType: 1, status: 1 },
    { name: 'account_type_status' }
  );
  await ensureIndex(
    users,
    { platformRole: 1 },
    {
      name: 'platform_super_admin',
      unique: true,
      partialFilterExpression: { platformRole: 'super_admin' },
    }
  );

  await ensureIndex(
    agencies,
    { slug: 1 },
    { name: 'slug_1', unique: true }
  );
  await ensureIndex(
    agencies,
    { status: 1, createdAt: -1 },
    { name: 'status_1_createdAt_-1' }
  );

  // The legacy A1 switcher index was `{ userId, createdAt }`; different builds
  // emitted it with either sort direction, so drop both shapes. (Mongoose will
  // not remove an index it no longer declares.)
  await dropIndexByKey(memberships, { userId: 1, createdAt: -1 });
  await dropIndexByKey(memberships, { userId: 1, createdAt: 1 });
  await ensureIndex(
    memberships,
    { userId: 1 },
    { name: 'userId_1', unique: true }
  );

  if (!membershipsOk) {
    log(
      'migration incomplete: membership violations remain. The unique ' +
        'AgencyMember.userId index was not created.'
    );
    process.exitCode = 1;
  } else {
    log('migration complete.');
  }
}

run()
  .catch((error) => {
    console.error('migrate:account-realms — failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
