import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../config/env.js';
import {
  changeAgencyPlan,
  monthStart,
  planLimitsFor,
  planTier,
  usageLevel,
} from './plan.js';

/**
 * Pure A8 plan mechanics. The DB-backed enforcement points (seat/export/
 * storage 409s, live usage counts, ops plan PATCH) are exercised by the local
 * smoke run against a real database; these tests pin tier resolution, override
 * precedence, the warning/over thresholds and the ops-secret gate.
 */

test('the default tier table carries the locked starter/pro limits', () => {
  assert.deepEqual(planTier('starter'), {
    seats: 3,
    monthlyExports: 10,
    storageMb: 100,
  });
  assert.deepEqual(planTier('pro'), {
    seats: 15,
    monthlyExports: 100,
    storageMb: 1024,
  });
});

test('an unknown tier id fails closed with a 500', () => {
  assert.throws(
    () => planTier('super-vip'),
    (error: any) =>
      error?.statusCode === 500 &&
      error.message === 'The plan configuration is invalid.'
  );
});

test('limits resolve from the tier and per-field overrides win', () => {
  const defaults = planLimitsFor({});
  assert.equal(defaults.tierId, env.AGENCY_PLAN_DEFAULT);
  assert.equal(defaults.seats, planTier(env.AGENCY_PLAN_DEFAULT).seats);

  const pro = planLimitsFor({ plan: { tierId: 'pro' } });
  assert.equal(pro.tierId, 'pro');
  assert.equal(pro.seats, 15);

  const overridden = planLimitsFor({
    plan: { tierId: 'starter', seats: 1, monthlyExports: 2, storageMb: 5 },
  });
  assert.deepEqual(
    { seats: overridden.seats, monthlyExports: overridden.monthlyExports, storageMb: overridden.storageMb },
    { seats: 1, monthlyExports: 2, storageMb: 5 }
  );

  // A null plan reads exactly like a missing plan.
  assert.deepEqual(planLimitsFor({ plan: null }), defaults);
});

test('an override referencing an unknown tier fails closed', () => {
  assert.throws(
    () => planLimitsFor({ plan: { tierId: 'ghost-tier' } }),
    (error: any) => error?.statusCode === 500
  );
});

test('usage level thresholds: ok under 80%, warning at 80%, over at 100%', () => {
  assert.equal(usageLevel(0, 10), 'ok');
  assert.equal(usageLevel(7, 10), 'ok', '70% is still ok');
  assert.equal(usageLevel(8, 10), 'warning', '80% warns');
  assert.equal(usageLevel(9, 10), 'warning', '99% still warns');
  assert.equal(usageLevel(10, 10), 'over', '100% is over');
  assert.equal(usageLevel(12, 10), 'over', 'past the cap is over');
  assert.equal(usageLevel(0, 0), 'over', 'a zero cap is immediately over');
});

test('monthStart is the UTC first of the current month', () => {
  const start = monthStart();
  const now = new Date();
  assert.equal(start.getUTCDate(), 1);
  assert.equal(start.getUTCMonth(), now.getUTCMonth());
  assert.equal(start.getUTCFullYear(), now.getUTCFullYear());
  assert.equal(start.getUTCHours(), 0);
});

test('plan changes without the ops secret answer 403 before any DB call', async () => {
  await assert.rejects(
    changeAgencyPlan({
      agencyId: 'not-a-real-agency',
      opsKey: 'definitely-not-the-ops-key',
      plan: { tierId: 'pro' },
    }),
    (error: any) =>
      error?.statusCode === 403 &&
      error.message === 'Plan changes require TravelAI ops access.'
  );
});
