import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import TripReport, {
  AUTO_HIDE_REPORT_THRESHOLD,
} from '../../models/TripReport.js';
import reportsRouter from '../../routes/reports.routes.js';
import { AUTH_GUARD_TAG } from '../../middleware/auth.middleware.js';
import {
  REPORT_DAILY_LIMIT,
  reportCreateLimiter,
} from '../../middleware/rateLimiter.middleware.js';
import { createReport } from './reports.js';

/**
 * Milestone 8 G6 — reporting and auto-hide.
 *
 * Service-level pins against stubbed models (the same style as the G4/G5
 * tests). The properties worth guaranteeing are the moderation decisions:
 * only public personal content is reportable, reporting yourself is refused,
 * the unique index is the duplicate brake, and exactly three distinct open
 * reports flip the trip out of every public read.
 */

const TRIP_ID = '64b000000000000000000401';
const PROFILE_ID = '64b0000000000000000004a1';
const REPORTER_ID = '64b0000000000000000004c3';
const OWNER_ID = '64b0000000000000000004d5';

let tripRow: any = null;
let profileRow: any = null;
let lastTripFilter: any = null;
let lastProfileFilter: any = null;
let distinctCount = 0;
let createError: any = null;
let created: any[] = [];
let tripUpdates: Array<{ filter: any; update: any }> = [];

const original = {
  tripFindOne: Trip.findOne,
  tripUpdateOne: Trip.updateOne,
  userFindOne: User.findOne,
  reportCreate: TripReport.create,
  reportDistinct: TripReport.distinct,
};

function thenable(value: any): any {
  const chain: any = {
    select: () => chain,
    lean: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return chain;
}

(Trip as any).findOne = (filter: any) => {
  lastTripFilter = filter;
  return thenable(tripRow);
};
(Trip as any).updateOne = async (filter: any, update: any) => {
  tripUpdates.push({ filter, update });
  return { modifiedCount: 1 };
};
(User as any).findOne = (filter: any) => {
  lastProfileFilter = filter;
  return thenable(profileRow);
};
(TripReport as any).create = async (doc: any) => {
  if (createError) throw createError;
  const row = {
    _id: '64b0000000000000000004e7',
    createdAt: new Date('2026-10-27T00:00:00.000Z'),
    ...doc,
  };
  created.push(row);
  return row;
};
(TripReport as any).distinct = async () =>
  Array.from({ length: distinctCount }, (_, index) => `reporter-${index}`);

function reset() {
  tripRow = {
    _id: TRIP_ID,
    members: [{ userId: OWNER_ID, role: 'owner' }],
  };
  profileRow = { _id: PROFILE_ID };
  lastTripFilter = null;
  lastProfileFilter = null;
  distinctCount = 0;
  createError = null;
  created = [];
  tripUpdates = [];
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    reporterId: REPORTER_ID,
    targetType: 'trip' as const,
    targetId: TRIP_ID,
    reason: 'spam' as const,
    ...overrides,
  };
}

test('only public, personal, non-owner content is reportable', async () => {
  reset();
  await createReport(baseInput());

  assert.equal(lastTripFilter.visibility, 'public');
  assert.equal(lastTripFilter.isDeleted.$ne, true);
  assert.equal(lastTripFilter.workspace.$ne, 'agency');

  tripRow = null;
  await assert.rejects(() => createReport(baseInput()), /could not be found/);

  reset();
  tripRow.members = [{ userId: REPORTER_ID, role: 'owner' }];
  await assert.rejects(() => createReport(baseInput()), /your own trip/);
});

test('self-reporting a profile is refused', async () => {
  reset();
  profileRow = { _id: REPORTER_ID };
  await assert.rejects(
    () =>
      createReport({
        reporterId: REPORTER_ID,
        targetType: 'profile',
        targetId: REPORTER_ID,
        reason: 'harassment',
      }),
    /your own profile/
  );
});

test('a duplicate report is a friendly 409 and writes no second row', async () => {
  reset();
  createError = { code: 11000 };

  await assert.rejects(() => createReport(baseInput()), /already reported/);
  assert.equal(created.length, 0);
});

test('notes are trimmed and the reason vocabulary is preserved', async () => {
  reset();
  const result = await createReport(
    baseInput({ reason: 'privacy', note: '  exact address posted  ' })
  );

  assert.equal(created.length, 1);
  assert.equal(created[0].note, 'exact address posted');
  assert.equal(result.report.reason, 'privacy');
  assert.equal(result.report.status, 'open');
});

test('two open reports do not hide a trip', async () => {
  reset();
  distinctCount = AUTO_HIDE_REPORT_THRESHOLD - 1;

  const result = await createReport(baseInput());

  assert.equal(result.hidden, false);
  assert.equal(tripUpdates.length, 0);
});

test('the third distinct open report hides the trip from every public read', async () => {
  reset();
  distinctCount = AUTO_HIDE_REPORT_THRESHOLD;

  const result = await createReport(baseInput());

  assert.equal(result.hidden, true);
  assert.equal(tripUpdates.length, 1);
  assert.equal(String(tripUpdates[0].filter._id), TRIP_ID);
  assert.equal(tripUpdates[0].filter['moderation.hiddenAt'], null);
  assert.equal(tripUpdates[0].update.$set.moderation.source, 'auto_report');
});

test('a profile report by handle resolves to the user id and never auto-hides', async () => {
  reset();
  distinctCount = 99;

  const result = await createReport({
    reporterId: REPORTER_ID,
    targetType: 'profile',
    targetId: '@Explorer_Sam',
    reason: 'other',
  });

  assert.equal(result.hidden, false);
  assert.equal(tripUpdates.length, 0);
  assert.equal(lastProfileFilter.accountType, 'personal');
  // The public page only ever knows the handle, so the service must resolve it
  // and persist the internal id the admin queue joins on.
  assert.equal(lastProfileFilter['profile.handle'], 'explorer_sam');
  assert.equal(String(created[0].targetId), PROFILE_ID);
  assert.equal(result.report.targetId, PROFILE_ID);
});

test('the report model pins one row per reporter+target and the 3-report threshold', () => {
  assert.equal(AUTO_HIDE_REPORT_THRESHOLD, 3);

  const unique = TripReport.schema.indexes().find(([fields]) => {
    return (
      fields.reporterId === 1 &&
      fields.targetType === 1 &&
      fields.targetId === 1
    );
  });
  assert.ok(unique, 'the reporter+target index must exist');
  assert.equal(unique[1].unique, true);
});

test('the report route is a personal, daily-limited write', () => {
  const layers = reportsRouter.stack.filter((layer: any) => layer.route);
  assert.equal(layers.length, 1);

  const handlers = layers[0].route.stack.map((layer: any) => layer.handle);
  const guard = handlers.find((handler: any) => handler?.[AUTH_GUARD_TAG]);
  assert.equal(guard?.[AUTH_GUARD_TAG]?.realm, 'personal');
  assert.ok(handlers.includes(reportCreateLimiter), 'reports need the daily brake');
  assert.equal(REPORT_DAILY_LIMIT, 10);
});

test.after(() => {
  (Trip as any).findOne = original.tripFindOne;
  (Trip as any).updateOne = original.tripUpdateOne;
  (User as any).findOne = original.userFindOne;
  (TripReport as any).create = original.reportCreate;
  (TripReport as any).distinct = original.reportDistinct;
});
