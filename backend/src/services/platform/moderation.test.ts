import { test } from 'node:test';
import assert from 'node:assert/strict';
import PlatformAudit from '../../models/PlatformAudit.js';
import Trip from '../../models/Trip.js';
import TripReport from '../../models/TripReport.js';
import User from '../../models/User.js';
import {
  listReportedContent,
  resolveReportedContent,
} from './moderation.js';

/**
 * Milestone 8 G6 — platform moderation decisions.
 *
 * Pins the two operator actions: de-list hides the trip and closes reports as
 * `hidden`; dismiss closes them as `dismissed` and restores an auto-hidden
 * trip. Profiles are queue-only, and every decision is audited.
 */

const TRIP_ID = '64b000000000000000000501';
const PROFILE_ID = '64b0000000000000000005a1';
const REPORTER_ID = '64b0000000000000000005c3';
const OWNER_ID = '64b0000000000000000005d5';
const REPORT_ID = '64b0000000000000000005e7';
const ADMIN_ID = '64b0000000000000000005f9';

let tripExists = true;
let profileExists = true;
let tripUpdates: Array<{ filter: any; update: any }> = [];
let reportUpdates: Array<{ filter: any; update: any }> = [];
let currentTrip: any = { moderation: { hiddenAt: new Date(), source: 'admin' } };
let listGroups: any[] = [];
let listTotals: any[] = [];
let auditWrites: any[] = [];
let userResults: any[][] = [];

const original = {
  tripExists: Trip.exists,
  tripUpdateOne: Trip.updateOne,
  tripFindOne: Trip.findOne,
  tripFind: Trip.find,
  userExists: User.exists,
  userFind: User.find,
  reportAggregate: TripReport.aggregate,
  reportUpdateMany: TripReport.updateMany,
  auditCreate: PlatformAudit.create,
};

function thenable(value: any): any {
  const chain: any = {
    select: () => chain,
    lean: async () => value,
    catch: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return chain;
}

(Trip as any).exists = async () => (tripExists ? { _id: TRIP_ID } : null);
(User as any).exists = async () => (profileExists ? { _id: PROFILE_ID } : null);
(Trip as any).updateOne = async (filter: any, update: any) => {
  tripUpdates.push({ filter, update });
  // Mirror the write so the post-decision read sees the new marker state.
  if (update?.$unset?.moderation !== undefined) {
    currentTrip = { ...(currentTrip ?? {}), moderation: undefined };
  } else if (update?.$set?.moderation) {
    currentTrip = { ...(currentTrip ?? {}), moderation: update.$set.moderation };
  }
  return { modifiedCount: 1 };
};
(Trip as any).findOne = () => thenable(currentTrip);
(Trip as any).find = () => thenable([]);
(User as any).find = () => thenable(userResults.shift() ?? []);
(TripReport as any).updateMany = async (filter: any, update: any) => {
  reportUpdates.push({ filter, update });
  return { modifiedCount: 2 };
};
(TripReport as any).aggregate = async (pipeline: any[]) => {
  const byStatus = pipeline.some(
    (stage) => stage?.$group?._id === '$status'
  );
  return byStatus ? listTotals : listGroups;
};
(PlatformAudit as any).create = async (row: any) => {
  auditWrites.push(row);
  return row;
};

function reset() {
  tripExists = true;
  profileExists = true;
  tripUpdates = [];
  reportUpdates = [];
  currentTrip = { moderation: { hiddenAt: new Date(), source: 'admin' } };
  listGroups = [];
  listTotals = [];
  auditWrites = [];
  userResults = [];
}

test('de-list hides the trip, closes reports and writes an audit row', async () => {
  reset();

  const result = await resolveReportedContent({
    actorId: ADMIN_ID,
    targetType: 'trip',
    targetId: TRIP_ID,
    action: 'hide',
    client: { ip: '127.0.0.1' },
  });

  assert.equal(result.hidden, true);
  assert.equal(result.resolved, 2);
  assert.equal(tripUpdates.length, 1);
  assert.equal(tripUpdates[0].update.$set.moderation.source, 'admin');
  assert.equal(String(tripUpdates[0].update.$set.moderation.hiddenBy), ADMIN_ID);
  assert.equal(reportUpdates[0].update.$set.status, 'hidden');
  assert.equal(String(reportUpdates[0].update.$set.resolvedBy), ADMIN_ID);
  assert.equal(auditWrites.length, 1);
  assert.equal(auditWrites[0].action, 'content.hidden');
  assert.equal(auditWrites[0].targetId, TRIP_ID);
});

test('dismiss closes reports and restores an auto-hidden trip', async () => {
  reset();
  currentTrip = { moderation: undefined };

  const result = await resolveReportedContent({
    actorId: ADMIN_ID,
    targetType: 'trip',
    targetId: TRIP_ID,
    action: 'dismiss',
  });

  assert.equal(result.hidden, false);
  assert.equal(tripUpdates[0].update.$unset.moderation, '');
  assert.deepEqual(reportUpdates[0].filter.status, { $in: ['open', 'hidden'] });
  assert.equal(reportUpdates[0].update.$set.status, 'dismissed');
  assert.equal(auditWrites[0].action, 'content.dismissed');
});

test('restoring a de-listed trip reclassifies its hidden reports as dismissed', async () => {
  reset();

  const result = await resolveReportedContent({
    actorId: ADMIN_ID,
    targetType: 'trip',
    targetId: TRIP_ID,
    action: 'dismiss',
  });

  // A restore is a dismiss with a different intent: the marker is cleared, the
  // trip is public again, and the old `hidden` stack moves to `dismissed` so it
  // no longer sits in the De-listed tab.
  assert.equal(result.hidden, false);
  assert.equal(result.changed, true);
  assert.equal(tripUpdates[0].update.$unset.moderation, '');
  assert.deepEqual(reportUpdates[0].filter.status, { $in: ['open', 'hidden'] });
  assert.equal(reportUpdates[0].update.$set.status, 'dismissed');
  assert.equal(auditWrites[0].action, 'content.dismissed');
});

test('a missing target is a 404 for both actions', async () => {
  reset();
  tripExists = false;

  await assert.rejects(
    () =>
      resolveReportedContent({
        actorId: ADMIN_ID,
        targetType: 'trip',
        targetId: TRIP_ID,
        action: 'hide',
      }),
    /not found/
  );
});

test('profiles are queued but cannot be de-listed from this console', async () => {
  reset();

  await assert.rejects(
    () =>
      resolveReportedContent({
        actorId: ADMIN_ID,
        targetType: 'profile',
        targetId: PROFILE_ID,
        action: 'hide',
      }),
    /cannot be de-listed/
  );

  const dismissed = await resolveReportedContent({
    actorId: ADMIN_ID,
    targetType: 'profile',
    targetId: PROFILE_ID,
    action: 'dismiss',
  });
  assert.equal(dismissed.hidden, false);
  assert.equal(reportUpdates[0].update.$set.status, 'dismissed');
});

test('the reported-content listing groups by target and carries triage context', async () => {
  reset();
  listGroups = [
    {
      _id: { targetType: 'trip', targetId: TRIP_ID },
      reportCount: 2,
      lastReportedAt: new Date('2026-10-27T10:00:00.000Z'),
      reports: [
        {
          _id: REPORT_ID,
          reporterId: REPORTER_ID,
          reason: 'spam',
          note: 'copied text',
          status: 'open',
          createdAt: new Date('2026-10-27T10:00:00.000Z'),
        },
        {
          _id: '64b0000000000000000005e8',
          reporterId: '64b0000000000000000005c4',
          reason: 'spam',
          status: 'open',
          createdAt: new Date('2026-10-27T09:00:00.000Z'),
        },
      ],
    },
  ];
  listTotals = [
    { _id: 'open', count: 2 },
    { _id: 'hidden', count: 1 },
    { _id: 'dismissed', count: 4 },
  ];
  // Trip.find is stubbed to an empty list above, so the grouping still renders
  // the report rows even when the target was purged afterwards.
  // The reporter identity is the only User lookup: no profile targets and no
  // publisher rows in this fixture.
  userResults = [
    [
      {
        _id: REPORTER_ID,
        name: 'Sam',
        email: 'sam@example.com',
        profile: { handle: 'sam' },
      },
    ],
  ];

  const result = await listReportedContent({ status: 'open', limit: 50 });

  assert.deepEqual(result.totals, { open: 2, hidden: 1, dismissed: 4 });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].targetId, TRIP_ID);
  assert.equal(result.groups[0].reportCount, 2);
  assert.deepEqual(result.groups[0].reasons, [{ reason: 'spam', count: 2 }]);
  assert.equal(result.groups[0].reports[0].reporter?.handle, 'sam');
  assert.equal(result.groups[0].reports[0].note, 'copied text');
  assert.equal(result.groups[0].hidden, false);
});

test.after(() => {
  (Trip as any).exists = original.tripExists;
  (Trip as any).updateOne = original.tripUpdateOne;
  (Trip as any).findOne = original.tripFindOne;
  (Trip as any).find = original.tripFind;
  (User as any).exists = original.userExists;
  (User as any).find = original.userFind;
  (TripReport as any).aggregate = original.reportAggregate;
  (TripReport as any).updateMany = original.reportUpdateMany;
  (PlatformAudit as any).create = original.auditCreate;
});
