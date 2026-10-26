/**
 * Live smoke test for Agency Workspace A8 (operations, limits and audit).
 *
 * Unlike the unit tests, this exercises the real database and services: a
 * tiny per-agency plan override (1 seat / 2 exports / 1 MB) forces every 409,
 * usage counters read back from the actual collections, the audit list stays
 * tenant-scoped and newest-first with resolved actor labels, and trip
 * archiving behaves as a read-only state that never touches the A2 trash.
 *
 * The ops plan-change path needs the same secret the API checks, so run with:
 *   AGENCY_OPS_KEY=smoke-ops-key npx tsx scripts/smoke-a8.mts
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyAsset from '../src/models/AgencyAsset.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyMember from '../src/models/AgencyMember.js';
import Trip from '../src/models/Trip.js';
import User from '../src/models/User.js';
import { AppError } from '../src/utils/AppError.js';
import { listAgencyAudit, recordAgencyAudit } from '../src/services/agency/audit.js';
import {
  agencyUsage,
  assertExportQuota,
  assertSeatAvailable,
  assertStorageQuota,
  changeAgencyPlan,
  planLimitsFor,
} from '../src/services/agency/plan.js';
import {
  archiveAgencyTrip,
  listAgencyTrips,
  unarchiveAgencyTrip,
  updateAgencyTrip,
} from '../src/services/agency/trips.js';
import { createAgencyExport } from '../src/services/agency/exports/exports.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../src/services/agency/exports/templates.js';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

function smokeMongoUri(): string {
  const configured =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/travelai';
  const parsed = new URL(configured);
  parsed.pathname = '/travelai_a8_smoke';
  return parsed.toString();
}

async function expectAppError(
  fn: () => Promise<unknown>,
  status: number
): Promise<boolean> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError && error.statusCode === status;
  }
  return false;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A8 smoke against production.');
  }
  const opsKey = process.env.AGENCY_OPS_KEY;
  if (!opsKey) {
    throw new Error(
      'Set AGENCY_OPS_KEY (e.g. AGENCY_OPS_KEY=smoke-ops-key) before running this smoke.'
    );
  }

  await mongoose.connect(smokeMongoUri());

  try {
    const userId = new Types.ObjectId();
    const memberOne = new Types.ObjectId();
    const staffUser = await User.create({
      email: 'planner.a8@smoke.test',
      password: 'not-a-real-hash',
      name: 'Anisha Planner',
    });

    const agency = await Agency.create({ name: 'A8 Smoke Travel', slug: 'a8-smoke-travel', createdBy: userId });
    const otherAgency = await Agency.create({ name: 'A8 Other Tenant', slug: 'a8-other-tenant', createdBy: userId });
    const agencyId = String(agency._id);
    const otherAgencyId = String(otherAgency._id);

    const tripA = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      title: 'Archive me later',
      status: 'planned',
      tripDetails: { trip_title: 'Archive me later', duration_days: 1 },
    });
    const tripB = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      assignedTo: memberOne,
      title: 'Assigned to member one',
      status: 'draft',
      tripDetails: { trip_title: 'Assigned to member one', duration_days: 2 },
    });
    const tripC = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      title: 'Unassigned trip',
      status: 'planned',
      tripDetails: { trip_title: 'Unassigned trip', duration_days: 3 },
    });
    const tripAId = String(tripA._id);
    const otherTrip = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: otherAgency._id,
      title: 'Other tenant trip',
      status: 'planned',
      tripDetails: { trip_title: 'Other tenant trip', duration_days: 1 },
    });

    // 1. Ops plan changes: secret-gated, tier-validated, audited actorless.
    check(
      'a wrong ops secret answers 403',
      await expectAppError(
        () =>
          changeAgencyPlan({
            agencyId,
            opsKey: 'wrong-secret',
            plan: { tierId: 'starter' },
          }),
        403
      )
    );
    check(
      'a correct secret with an unknown agency answers 404',
      await expectAppError(
        () =>
          changeAgencyPlan({
            agencyId: String(new Types.ObjectId()),
            opsKey,
            plan: { tierId: 'starter' },
          }),
        404
      )
    );
    check(
      'a correct secret with an unknown tier fails closed',
      await expectAppError(
        () =>
          changeAgencyPlan({
            agencyId,
            opsKey,
            plan: { tierId: 'ghost-tier' },
          }),
        500
      )
    );
    const applied = await changeAgencyPlan({
      agencyId,
      opsKey,
      plan: { tierId: 'starter', seats: 1, monthlyExports: 2, storageMb: 1 },
    });
    check(
      'the tiny override applies and returns resolved limits',
      applied.seats === 1 && applied.monthlyExports === 2 && applied.storageMb === 1,
      applied
    );
    const planAudit = await AgencyAudit.findOne({ action: 'plan.changed' });
    check(
      'the plan change is audited without an actor',
      Boolean(planAudit) && planAudit?.actorId === undefined,
      planAudit?.metadata
    );
    const untouched = planLimitsFor(otherAgency.toObject());
    check(
      'a tenant without an override keeps the env default tier',
      untouched.tierId === 'starter' && untouched.seats === 3,
      untouched
    );

    // 2. Seats: the same gate the invite create/redeem paths use.
    await assertSeatAvailable(agencyId);
    await AgencyMember.create({
      agencyId: agency._id,
      userId: memberOne,
      role: 'planner',
      joinedAt: new Date(),
    });
    check(
      'the seat limit blocks the next member at 1/1',
      await expectAppError(() => assertSeatAvailable(agencyId), 409)
    );

    // 3. Export quota: rows created or touched this month count once.
    await ensureBuiltinTemplates(agencyId, String(userId));
    const seeded = await listAgencyTemplates({ agencyId, role: 'owner' });
    const internalTemplate = seeded.find((entry) => entry.audience === 'internal');
    check('a builtin internal template exists', Boolean(internalTemplate));

    const makeExport = () =>
      createAgencyExport({
        agencyId,
        actorId: String(userId),
        role: 'owner',
        trip: tripA,
        templateId: internalTemplate!._id,
        schedule: false,
      });

    const exportOne = await makeExport();
    const exportTwo = await makeExport();
    check('two queued exports fit the monthly cap of 2', Boolean(exportOne && exportTwo));
    check(
      'the third export hits the monthly quota 409',
      await expectAppError(() => makeExport(), 409)
    );
    const lastMonth = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    // Raw driver: Mongoose marks `createdAt` immutable (timestamps: true), so a
    // model updateOne silently drops it from $set and the row would still count.
    await AgencyExport.collection.updateOne(
      { _id: exportOne._id },
      { $set: { createdAt: lastMonth, updatedAt: lastMonth } }
    );
    const exportThree = await makeExport();
    check(
      'an export counted last month frees quota for a new one',
      Boolean(exportThree),
      'third export should have been created'
    );
    check(
      'the cap holds again at 2 counted rows',
      await expectAppError(() => makeExport(), 409)
    );

    // 4. Storage: live byte sums across assets/templates/exports.
    await assertStorageQuota(agencyId, 900 * 1024);
    await AgencyAsset.create({
      agencyId: agency._id,
      kind: 'logo',
      storageKey: `a8-smoke/${new Types.ObjectId()}.png`,
      mime: 'image/png',
      bytes: 900 * 1024,
      createdBy: userId,
    });
    check(
      'a push past the 1 MB cap answers 409',
      await expectAppError(() => assertStorageQuota(agencyId, 200 * 1024), 409)
    );
    await assertStorageQuota(agencyId, 50 * 1024);
    check('a push inside the cap still passes', true);

    // 5. Usage counters read back exactly what the collections hold.
    const usage = await agencyUsage(agencyId);
    check(
      'usage counts match the live rows',
      usage.seats === 1 &&
        usage.exportsThisMonth === 2 &&
        usage.storageBytes === 900 * 1024,
      usage
    );
    const limits = planLimitsFor((await Agency.findById(agency._id))?.toObject());
    check(
      'resolved limits drive warning/over styling',
      limits.seats === 1 && limits.monthlyExports === 2 && limits.storageMb === 1,
      limits
    );

    // 6. Audit list: tenant-scoped, newest first, filtered, actor-resolved.
    await recordAgencyAudit({
      agencyId: otherAgencyId,
      actorId: String(userId),
      action: 'marker.other-tenant',
      targetType: 'Agency',
      targetId: otherAgencyId,
    });
    await recordAgencyAudit({
      agencyId,
      actorId: String(staffUser._id),
      action: 'export.requested',
      targetType: 'Export',
      targetId: String(exportThree._id),
      metadata: { schedule: false },
    });
    const audit = await listAgencyAudit({ agencyId, page: 1, limit: 50 });
    check(
      'the audit list never leaks another tenant',
      audit.entries.every((entry) => entry.action !== 'marker.other-tenant'),
      audit.entries.map((entry) => entry.action)
    );
    check(
      'entries come back newest first',
      audit.entries.length >= 2 &&
        new Date(audit.entries[0].createdAt) >= new Date(audit.entries[1].createdAt)
    );
    check(
      'the export prefix filter narrows to export events',
      (await listAgencyAudit({ agencyId, page: 1, limit: 50, actionPrefix: 'export.' }))
        .entries.every((entry) => entry.action.startsWith('export.')),
      'filtered list contained a non-export action'
    );
    const pageOne = await listAgencyAudit({ agencyId, page: 1, limit: 1 });
    const pageTwo = await listAgencyAudit({ agencyId, page: 2, limit: 1 });
    check(
      'pagination walks the list',
      pageOne.entries.length === 1 &&
        pageOne.total >= 2 &&
        pageTwo.entries.length === 1 &&
        pageOne.entries[0]._id !== pageTwo.entries[0]._id
    );
    const labelled = await listAgencyAudit({
      agencyId,
      page: 1,
      limit: 50,
      actionPrefix: 'export.',
    });
    check(
      'actor ids resolve to names',
      labelled.entries.some((entry) => entry.actor === 'Anisha Planner'),
      labelled.entries.map((entry) => entry.actor)
    );
    check(
      'actorless plan rows stay actorless',
      (await listAgencyAudit({ agencyId, page: 1, limit: 50, actionPrefix: 'plan.' }))
        .entries.every((entry) => entry.actor === null)
    );
    await recordAgencyAudit({
      agencyId,
      actorId: String(new Types.ObjectId()),
      action: 'trip.ghost',
      targetType: 'Trip',
      targetId: tripAId,
    });
    const ghosted = await listAgencyAudit({
      agencyId,
      page: 1,
      limit: 50,
      actionPrefix: 'trip.ghost',
    });
    check(
      'an unknown actor resolves to Removed member',
      ghosted.entries.length === 1 && ghosted.entries[0].actor === 'Removed member'
    );

    // 7. Archive: a read-only state, distinct from the trash.
    check(
      'a viewer cannot archive',
      await expectAppError(
        () =>
          archiveAgencyTrip({
            agencyId,
            tripId: tripAId,
            role: 'viewer',
            actorId: String(userId),
          }),
        403
      )
    );
    check(
      'another tenant trip answers 404',
      await expectAppError(
        () =>
          archiveAgencyTrip({
            agencyId,
            tripId: String(otherTrip._id),
            role: 'admin',
            actorId: String(userId),
          }),
        404
      )
    );
    const archivedTrip = await archiveAgencyTrip({
      agencyId,
      tripId: tripAId,
      role: 'admin',
      actorId: String(userId),
    });
    check('an admin archives a trip', Boolean(archivedTrip.archivedAt), archivedTrip.archivedAt);
    check(
      'archiving again is a 409',
      await expectAppError(
        () =>
          archiveAgencyTrip({
            agencyId,
            tripId: tripAId,
            role: 'admin',
            actorId: String(userId),
          }),
        409
      )
    );
    const activeList = await listAgencyTrips({ agencyId, role: 'admin' });
    const archivedList = await listAgencyTrips({
      agencyId,
      role: 'admin',
      archived: true,
    });
    check(
      'the default list excludes archived trips',
      activeList.every((trip) => String(trip._id) !== tripAId) && activeList.length >= 2,
      activeList.map((trip) => trip.title)
    );
    check(
      'the archived shelf shows only archived trips',
      archivedList.length === 1 && String(archivedList[0]._id) === tripAId,
      archivedList.map((trip) => trip.title)
    );
    const freshTripA = await Trip.findById(tripA._id);
    check(
      'archived trips block metadata updates',
      await expectAppError(
        () =>
          updateAgencyTrip(freshTripA, {
            agencyId,
            role: 'admin',
            assignedTo: String(memberOne),
          }),
        409
      )
    );
    check(
      'archived trips block new exports',
      await expectAppError(
        () =>
          createAgencyExport({
            agencyId,
            actorId: String(userId),
            role: 'owner',
            trip: freshTripA,
            templateId: internalTemplate!._id,
            schedule: false,
          }),
        409
      )
    );
    const unarchived = await unarchiveAgencyTrip({
      agencyId,
      tripId: tripAId,
      role: 'admin',
      actorId: String(userId),
    });
    check('unarchive clears the flag', unarchived.archivedAt === undefined);
    check(
      'unarchiving again is a 409',
      await expectAppError(
        () =>
          unarchiveAgencyTrip({
            agencyId,
            tripId: tripAId,
            role: 'admin',
            actorId: String(userId),
          }),
        409
      )
    );
    const restoredList = await listAgencyTrips({ agencyId, role: 'admin' });
    check(
      'the trip returns to the active list',
      restoredList.some((trip) => String(trip._id) === tripAId)
    );
    const editable = await updateAgencyTrip(await Trip.findById(tripA._id), {
      agencyId,
      role: 'admin',
      assignedTo: String(memberOne),
    });
    check(
      'unarchived trips accept edits again',
      String(editable.assignedTo) === String(memberOne)
    );
    const archiveAudit = await AgencyAudit.find({
      action: { $in: ['trip.archived', 'trip.unarchived'] },
    });
    check(
      'archive and restore are audited with the actor',
      archiveAudit.length === 2 &&
        archiveAudit.every((row) => String(row.actorId) === String(userId)),
      archiveAudit.map((row) => row.action)
    );

    // 8. The assignee filter narrows the library server-side.
    const byMember = await listAgencyTrips({
      agencyId,
      role: 'admin',
      assignedTo: String(memberOne),
    });
    check(
      'the assignee filter matches assigned trips only',
      byMember.every((trip) => String(trip.assignedTo) === String(memberOne)) &&
        byMember.length === 2,
      byMember.map((trip) => trip.title)
    );
    const unassigned = await listAgencyTrips({
      agencyId,
      role: 'admin',
      assignedTo: 'unassigned',
    });
    check(
      'the unassigned filter matches the unassigned trip only',
      unassigned.length === 1 && String(unassigned[0]._id) === String(tripC._id),
      unassigned.map((trip) => trip.title)
    );
    check(
      'an invalid assignee id answers 400',
      await expectAppError(
        () => listAgencyTrips({ agencyId, role: 'admin', assignedTo: 'zzz' }),
        400
      )
    );
  } finally {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} A8 smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A8 smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
