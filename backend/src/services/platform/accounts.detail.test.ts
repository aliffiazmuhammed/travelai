import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import PlatformAudit from '../../models/PlatformAudit.js';
import User from '../../models/User.js';
import { getAccountDetail } from './accounts.js';

/**
 * PA2 account detail: the same email can exist in several realms/tenants, so
 * the drawer must link the sibling rows without merging them into one record.
 */

const accountId = '507f1f77bcf86cd799439011';
const agencyAccountId = '507f1f77bcf86cd799439012';
const platformAccountId = '507f1f77bcf86cd799439013';
const agencyId = '507f1f77bcf86cd799439014';

const account = {
  _id: new mongoose.Types.ObjectId(accountId),
  email: 'owner@example.com',
  name: 'Personal Owner',
  accountType: 'personal',
  status: 'active',
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const related = [
  {
    _id: new mongoose.Types.ObjectId(agencyAccountId),
    email: 'owner@example.com',
    accountType: 'agency',
    agencyId: new mongoose.Types.ObjectId(agencyId),
    status: 'active',
    mustChangePassword: true,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId(platformAccountId),
    email: 'owner@example.com',
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
    mustChangePassword: false,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  },
];

const agency = {
  _id: new mongoose.Types.ObjectId(agencyId),
  name: 'Pilot Travel',
  slug: 'pilot-travel',
  status: 'active',
};

let relatedQuery: Record<string, unknown> | null = null;

const originalUserFindById = User.findById;
const originalUserFind = User.find;
const originalMemberFind = AgencyMember.find;
const originalAuditFind = PlatformAudit.find;
const originalAgencyFind = Agency.find;

(User as any).findById = () => ({
  select: () => ({ lean: async () => account }),
});
(User as any).find = (query: Record<string, unknown>) => {
  relatedQuery = query;
  return {
    sort: () => ({
      select: () => ({ lean: async () => related }),
    }),
    select: () => ({ lean: async () => [] }),
  };
};
(AgencyMember as any).find = () => ({
  select: () => ({ lean: async () => [] }),
});
(PlatformAudit as any).find = () => ({
  sort: () => ({
    limit: () => ({
      select: () => ({ lean: async () => [] }),
    }),
  }),
});
(Agency as any).find = () => ({
  select: () => ({ lean: async () => [agency] }),
});

test.after(() => {
  (User as any).findById = originalUserFindById;
  (User as any).find = originalUserFind;
  (AgencyMember as any).find = originalMemberFind;
  (PlatformAudit as any).find = originalAuditFind;
  (Agency as any).find = originalAgencyFind;
});

test('account detail returns same-email rows from other realms without merging', async () => {
  const detail = await getAccountDetail(accountId);

  assert.equal(detail.email, 'owner@example.com');
  assert.equal(detail.relatedAccounts.length, 2);
  assert.deepEqual(
    detail.relatedAccounts.map((row) => row.accountType),
    ['agency', 'platform']
  );
  assert.equal(detail.relatedAccounts[0].agency?.slug, 'pilot-travel');
  assert.equal(detail.relatedAccounts[1].agency, undefined);
  assert.equal(
    (relatedQuery as any)._id.$ne.toString(),
    accountId,
    'the account itself must be excluded from its sibling list'
  );
  assert.equal((relatedQuery as any).email, 'owner@example.com');
});
