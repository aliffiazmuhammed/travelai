import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlatformAuditFilter,
  resolveOwnerTransfer,
} from './agencies.js';
import { normalizeAgencyPlanChange } from '../agency/plan.js';
import {
  agencyListQuerySchema,
  agencyMemberInviteSchema,
  agencyOwnerTransferSchema,
  agencyPlanChangeSchema,
  platformAuditQuerySchema,
} from '../../schemas/platformAgencies.schema.js';

/**
 * PA4 rules that must hold without a database:
 * - owner transfer promotes first and never targets an existing owner;
 * - plan changes use the same tier table/bounds as the ops path;
 * - the audit viewer cannot turn user input into an unbounded regex/scan;
 * - request schemas reject shapes the console cannot mean.
 */

const members = [
  { userId: 'owner-old', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
  { userId: 'owner-new', role: 'owner', joinedAt: '2026-02-01T00:00:00Z' },
  { userId: 'admin-1', role: 'admin', joinedAt: '2026-03-01T00:00:00Z' },
  { userId: 'viewer-1', role: 'viewer', joinedAt: '2026-04-01T00:00:00Z' },
];

function expectStatus(fn: () => unknown, status: number): void {
  assert.throws(fn, (error: any) => error?.statusCode === status);
}

test('owner transfer defaults to the earliest owner and a non-owner target', () => {
  assert.deepEqual(resolveOwnerTransfer(members, 'admin-1'), {
    fromUserId: 'owner-old',
    toUserId: 'admin-1',
  });
});

test('owner transfer accepts an explicit current owner', () => {
  assert.deepEqual(resolveOwnerTransfer(members, 'viewer-1', 'owner-new'), {
    fromUserId: 'owner-new',
    toUserId: 'viewer-1',
  });
});

test('owner transfer rejects missing targets, non-owner sources and existing owners', () => {
  expectStatus(() => resolveOwnerTransfer(members, 'ghost'), 404);
  expectStatus(() => resolveOwnerTransfer(members, 'viewer-1', 'admin-1'), 409);
  expectStatus(() => resolveOwnerTransfer(members, 'owner-new'), 409);
  expectStatus(() => resolveOwnerTransfer(members, 'owner-old', 'owner-old'), 400);
});

test('owner transfer fails closed when the tenant has no owner', () => {
  expectStatus(
    () => resolveOwnerTransfer([{ userId: 'admin-1', role: 'admin' }], 'admin-1'),
    409
  );
});

test('platform plan changes reuse tier validation and numeric bounds', () => {
  assert.deepEqual(normalizeAgencyPlanChange({ tierId: 'pro' }), { tierId: 'pro' });
  assert.deepEqual(
    normalizeAgencyPlanChange({
      tierId: 'starter',
      seats: 2,
      monthlyExports: 0,
      storageMb: 50,
    }),
    { tierId: 'starter', seats: 2, monthlyExports: 0, storageMb: 50 }
  );

  expectStatus(() => normalizeAgencyPlanChange({ tierId: 'platinum' }), 400);
  expectStatus(() => normalizeAgencyPlanChange({ tierId: '' }), 400);
  expectStatus(() => normalizeAgencyPlanChange({ tierId: 'pro', seats: 0 }), 400);
  expectStatus(
    () => normalizeAgencyPlanChange({ tierId: 'pro', monthlyExports: -1 }),
    400
  );
  expectStatus(
    () => normalizeAgencyPlanChange({ tierId: 'pro', storageMb: 1.5 }),
    400
  );
});

test('audit filters search safely and bound the date range', () => {
  const filter = buildPlatformAuditFilter(
    platformAuditQuerySchema.parse({
      q: 'agency.(created)',
      action: 'agency.created',
      targetType: 'agency',
      actorId: '507f1f77bcf86cd799439011',
      from: '2026-01-01',
      to: '2026-01-31',
    })
  );

  assert.equal(filter.action, 'agency.created');
  assert.equal(filter.targetType, 'agency');
  assert.equal(String(filter.actorId), '507f1f77bcf86cd799439011');
  assert.ok(filter.$or);
  const firstOr = (filter.$or as Array<Record<string, unknown>>)[0];
  assert.ok(firstOr.action instanceof RegExp);
  assert.equal((firstOr.action as RegExp).test('agency.(created)'), true);
  assert.equal((firstOr.action as RegExp).test('agencyXcreated'), false);

  const createdAt = filter.createdAt as Record<string, Date>;
  assert.equal(createdAt.$gte.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.$lte.toISOString(), '2026-01-31T23:59:59.999Z');
});

test('the agency list schema defaults to the full directory', () => {
  const parsed = agencyListQuerySchema.parse({});
  assert.deepEqual(parsed, {
    q: '',
    status: 'all',
    planTierId: 'all',
    page: 1,
    limit: 25,
  });
  assert.throws(() => agencyListQuerySchema.parse({ status: 'deleted' }));
  assert.throws(() => agencyListQuerySchema.parse({ unknown: true }));
});

test('member invites require an email only for email-bound links', () => {
  assert.equal(
    agencyMemberInviteSchema.parse({ role: 'planner', kind: 'link' }).kind,
    'link'
  );
  assert.equal(
    agencyMemberInviteSchema.parse({
      role: 'admin',
      kind: 'email',
      email: 'member@example.com',
    }).email,
    'member@example.com'
  );
  assert.throws(() =>
    agencyMemberInviteSchema.parse({ role: 'admin', kind: 'email' })
  );
  assert.throws(() =>
    agencyMemberInviteSchema.parse({ role: 'owner', kind: 'link' })
  );
});

test('plan and transfer schemas reject unknown or unsafe shapes', () => {
  assert.doesNotThrow(() =>
    agencyPlanChangeSchema.parse({ tierId: 'pro', seats: 5 })
  );
  assert.throws(() =>
    agencyPlanChangeSchema.parse({ tierId: 'pro', seats: 0 })
  );
  assert.throws(() =>
    agencyPlanChangeSchema.parse({ tierId: 'pro', negotiable: true })
  );
  assert.deepEqual(agencyOwnerTransferSchema.parse({}), {});
  assert.throws(() =>
    agencyOwnerTransferSchema.parse({ fromUserId: 'not-an-object-id' })
  );
});

test('the audit query rejects unknown filters and invalid dates', () => {
  assert.equal(platformAuditQuerySchema.parse({}).limit, 50);
  assert.throws(() => platformAuditQuerySchema.parse({ from: 'not-a-date' }));
  assert.throws(() => platformAuditQuerySchema.parse({ password: 'x' }));
  assert.throws(() => platformAuditQuerySchema.parse({ limit: 500 }));
});
