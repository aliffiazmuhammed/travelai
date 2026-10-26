import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyOwnerPreview,
  listAgencyPlanTiers,
  normalizeAgencyBilling,
  normalizePlanTierId,
  normalizeRequestedAgencySlug,
  provisioningCleanupPlan,
} from './provisioning.js';
import { createAgencyTenantSchema } from '../../schemas/platformAgencies.schema.js';

/**
 * PA3 provisioning rules that must not depend on a live database:
 * - the owner email is never converted; an email already in another workspace
 *   blocks creation;
 * - slugs are validated, not rewritten;
 * - a half-finished provisioning rolls back only the rows it created;
 * - the request schema rejects anything the wizard cannot mean.
 */

test('the plan catalogue exposes configured tiers and marks the default', () => {
  const tiers = listAgencyPlanTiers();
  assert.ok(tiers.length >= 2);
  assert.equal(tiers.filter((tier) => tier.isDefault).length, 1);
  assert.equal(
    tiers.some((tier) => tier.tierId === 'starter' && tier.seats > 0),
    true
  );
  assert.deepEqual(
    tiers.map((tier) => tier.tierId),
    [...tiers.map((tier) => tier.tierId)].sort()
  );
});

test('an unknown plan tier is a 400, the default is accepted', () => {
  assert.doesNotThrow(() => normalizePlanTierId(undefined));
  assert.equal(typeof normalizePlanTierId('starter'), 'string');
  assert.throws(
    () => normalizePlanTierId('platinum'),
    (error: any) => error.statusCode === 400
  );
});

test('a new owner email only produces warnings, never a conversion', () => {
  const preview = buildAgencyOwnerPreview('owner@example.com', []);
  assert.equal(preview.blocked, false);
  assert.deepEqual(preview.warnings, []);
  assert.equal(preview.personalAccount, false);
  assert.equal(preview.platformAccount, false);
});

test('a personal or platform account with the same email is a warning', () => {
  const personal = buildAgencyOwnerPreview('owner@example.com', [
    { accountType: 'personal' },
  ]);
  assert.equal(personal.personalAccount, true);
  assert.equal(personal.blocked, false);
  assert.match(personal.warnings.join(' '), /personal TravelAI account/i);
  assert.match(personal.warnings.join(' '), /keeps its own password and trips/i);

  const platform = buildAgencyOwnerPreview('owner@example.com', [
    { accountType: 'platform' },
  ]);
  assert.equal(platform.platformAccount, true);
  assert.equal(platform.blocked, false);
  assert.match(platform.warnings.join(' '), /platform admin account/i);
});

test('an agency account in another workspace blocks provisioning', () => {
  const preview = buildAgencyOwnerPreview('owner@example.com', [
    { accountType: 'personal' },
    { accountType: 'agency', agency: { name: 'Northwind Travel', slug: 'northwind' } },
  ]);

  assert.equal(preview.personalAccount, true);
  assert.equal(preview.blocked, true);
  assert.deepEqual(preview.otherAgency, {
    name: 'Northwind Travel',
    workspace: 'northwind',
  });
  assert.match(preview.blockedReason ?? '', /northwind/);
  assert.match(preview.blockedReason ?? '', /one workspace/i);
});

test('an unlabeled agency row does not block (the tenant was deleted)', () => {
  const preview = buildAgencyOwnerPreview('owner@example.com', [
    { accountType: 'agency' },
  ]);
  assert.equal(preview.blocked, false);
  assert.equal(preview.otherAgency, undefined);
});

test('slugs are validated strictly instead of being rewritten', () => {
  assert.equal(normalizeRequestedAgencySlug('  Acme-Travel '), 'acme-travel');
  assert.equal(normalizeRequestedAgencySlug('acme'), 'acme');
  for (const invalid of ['ab', 'acme travel', 'acme--travel', '-acme', 'acme-', 'acmé']) {
    assert.throws(
      () => normalizeRequestedAgencySlug(invalid),
      (error: any) => error.statusCode === 400,
      `${invalid} must be rejected`
    );
  }
});

test('billing is trimmed, the email normalized and empty fields dropped', () => {
  const billing = normalizeAgencyBilling({
    contactName: '  Priya Nair ',
    contactEmail: ' BILLING@Example.COM ',
    renewalDate: '2027-01-15',
    notes: '  Annual renewal  ',
  });

  assert.equal(billing?.contactName, 'Priya Nair');
  assert.equal(billing?.contactEmail, 'billing@example.com');
  assert.equal(billing?.notes, 'Annual renewal');
  assert.equal(billing?.renewalDate?.toISOString().startsWith('2027-01-15'), true);

  assert.equal(normalizeAgencyBilling({}), undefined);
  assert.equal(normalizeAgencyBilling(undefined), undefined);
  assert.throws(
    () => normalizeAgencyBilling({ renewalDate: 'not-a-date' }),
    (error: any) => error.statusCode === 400
  );
});

test('cleanup removes only the rows this call created, in reverse order', () => {
  assert.deepEqual(
    provisioningCleanupPlan({
      agencyId: 'agency-1',
      userId: 'user-1',
      membershipId: 'member-1',
    }),
    [
      { kind: 'membership', id: 'member-1' },
      { kind: 'user', id: 'user-1' },
      { kind: 'agency', id: 'agency-1' },
    ]
  );

  // A reused owner account (no new user/membership) must survive a failed call.
  assert.deepEqual(provisioningCleanupPlan({ agencyId: 'agency-1' }), [
    { kind: 'agency', id: 'agency-1' },
  ]);
  assert.deepEqual(provisioningCleanupPlan({}), []);
});

test('the provisioning schema accepts a minimal tenant and owner', () => {
  const parsed = createAgencyTenantSchema.parse({
    name: 'Acme Travel',
    ownerEmail: 'Owner@Example.com',
  });
  assert.equal(parsed.name, 'Acme Travel');
  assert.equal(parsed.ownerEmail, 'Owner@Example.com');
  assert.equal(parsed.slug, undefined);
});

test('the provisioning schema rejects unknown fields and bad slugs', () => {
  const base = { name: 'Acme Travel', ownerEmail: 'owner@example.com' };

  assert.throws(() => createAgencyTenantSchema.parse({ ...base, admin: true }));
  assert.throws(() =>
    createAgencyTenantSchema.parse({ ...base, slug: 'Acme Travel' })
  );
  assert.throws(() =>
    createAgencyTenantSchema.parse({ ...base, slug: 'ab' })
  );
  assert.throws(() =>
    createAgencyTenantSchema.parse({ ...base, ownerEmail: 'not-an-email' })
  );
  assert.throws(() =>
    createAgencyTenantSchema.parse({
      ...base,
      billing: { contactEmail: 'nope' },
    })
  );
  assert.throws(() =>
    createAgencyTenantSchema.parse({
      ...base,
      billing: { renewalDate: '2026-02-31' },
    })
  );
});

test('the provisioning schema accepts a full tenant payload', () => {
  const parsed = createAgencyTenantSchema.parse({
    name: 'Acme Travel',
    slug: 'acme-travel',
    planTierId: 'pro',
    ownerEmail: 'owner@example.com',
    ownerName: 'Owner',
    billing: {
      contactName: 'Accounts',
      contactEmail: 'billing@example.com',
      renewalDate: '2027-01-15',
      notes: 'Net 30',
    },
  });

  assert.equal(parsed.slug, 'acme-travel');
  assert.equal(parsed.billing?.renewalDate, '2027-01-15');
});
