import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import PlatformAudit from '../../models/PlatformAudit.js';
import {
  loadDirectoryAdminView,
  setPackageHidden,
  setProfileHidden,
  setProfileVerification,
} from './directoryAdmin.js';

/**
 * Milestone 9 D7 — ops verification and delisting. Model calls are stubbed, so
 * these tests pin the promises: a hide is effective on every public read, a
 * restore respects the agency's own draft/published choice, and every action is
 * audited on both the platform and tenant sides.
 */

const AGENCY_A = '507f1f77bcf86cd799439011';
const AGENCY_B = '507f1f77bcf86cd799439012';
const ACTOR = '507f1f77bcf86cd799439099';
const PACKAGE_A = '507f1f77bcf86cd799439041';
const PROFILE_A = '507f1f77bcf86cd799439021';

const originals = {
  agencyFindById: Agency.findById,
  profileFindOne: AgencyProfile.findOne,
  packageFind: AgencyPackage.find,
  packageFindOne: AgencyPackage.findOne,
  auditCreate: AgencyAudit.create,
  platformAuditCreate: PlatformAudit.create,
  enquiryFind: AgencyEnquiry.find,
};

test.after(() => {
  (Agency as any).findById = originals.agencyFindById;
  (AgencyProfile as any).findOne = originals.profileFindOne;
  (AgencyPackage as any).find = originals.packageFind;
  (AgencyPackage as any).findOne = originals.packageFindOne;
  (AgencyAudit as any).create = originals.auditCreate;
  (PlatformAudit as any).create = originals.platformAuditCreate;
  (AgencyEnquiry as any).find = originals.enquiryFind;
});

/** A thenable with `.select()` and `.lean()`, the ways this module consumes a query. */
function query<T>(value: T): any {
  const builder: any = {
    select: () => builder,
    lean: async () => value,
    then: (resolve: (value: T) => unknown) => Promise.resolve(value).then(resolve),
    catch: (reject: (error: unknown) => unknown) =>
      Promise.resolve(value).catch(reject),
  };
  return builder;
}

function profileDoc(overrides: Record<string, unknown> = {}): any {
  return {
    _id: PROFILE_A,
    agencyId: AGENCY_A,
    state: 'published',
    about:
      'We plan small-group treks and slow road trips across the western ghats for curious travellers.',
    baseCity: 'Pune',
    destinations: ['Maharashtra'],
    specialties: ['Western ghats'],
    services: ['custom_itineraries'],
    languages: ['en'],
    showPhone: false,
    showGstin: false,
    publishedAt: new Date('2026-11-01T00:00:00.000Z'),
    verifiedAt: null,
    moderation: { hiddenAt: null },
    saved: false,
    async save() {
      this.saved = true;
      return this;
    },
    ...overrides,
  };
}

function packageDoc(overrides: Record<string, unknown> = {}): any {
  return {
    _id: PACKAGE_A,
    agencyId: AGENCY_A,
    title: 'Western ghats in the monsoon',
    state: 'published',
    fromPricePerPerson: 42000,
    currency: 'INR',
    publishedAt: new Date('2026-11-02T00:00:00.000Z'),
    moderation: { hiddenAt: null },
    saved: false,
    async save() {
      this.saved = true;
      return this;
    },
    ...overrides,
  };
}

function captureAudits(): { platform: any[]; tenant: any[] } {
  const platform: any[] = [];
  const tenant: any[] = [];
  (PlatformAudit as any).create = async (payload: unknown) => {
    platform.push(payload);
    return payload;
  };
  (AgencyAudit as any).create = async (payload: unknown) => {
    tenant.push(payload);
    return payload;
  };
  return { platform, tenant };
}

function stubAgency(): void {
  (Agency as any).findById = () =>
    query({
      _id: AGENCY_A,
      slug: 'hills-and-horizons',
      branding: { logoUrl: 'https://cdn.example.com/logo.png' },
    });
}

function stubPackages(rows: any[]): void {
  const chain = {
    sort: () => chain,
    select: () => chain,
    lean: async () => rows,
  };
  (AgencyPackage as any).find = () => chain;
}

function stubReplyTime(rows: any[] = []): void {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => rows,
  };
  (AgencyEnquiry as any).find = () => chain;
}

test('verification stamps the badge and audits both sides', async () => {
  const profile = profileDoc();
  (AgencyProfile as any).findOne = () => query(profile);
  stubAgency();
  stubPackages([]);
  stubReplyTime();
  const audits = captureAudits();

  const result = await setProfileVerification({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    verified: true,
  });

  assert.equal(result.changed, true);
  assert.ok(profile.verifiedAt instanceof Date);
  assert.equal(profile.saved, true);
  assert.equal(audits.platform[0].action, 'directory.profile.verified');
  assert.equal(audits.platform[0].targetType, 'agency');
  assert.equal(audits.platform[0].targetId, AGENCY_A);
  assert.equal(audits.tenant[0].action, 'profile.verified');
  assert.equal(audits.tenant[0].targetType, 'profile');

  // A second click is idempotent and writes no second audit row.
  const again = await setProfileVerification({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    verified: true,
  });
  assert.equal(again.changed, false);
  assert.equal(audits.platform.length, 1);
});

test('unverifying clears the date without unpublishing', async () => {
  const profile = profileDoc({ verifiedAt: new Date('2026-11-03T00:00:00Z') });
  (AgencyProfile as any).findOne = () => query(profile);
  stubAgency();
  stubPackages([]);
  stubReplyTime();
  const audits = captureAudits();

  const result = await setProfileVerification({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    verified: false,
  });

  assert.equal(result.changed, true);
  assert.equal(profile.verifiedAt, null);
  assert.equal(profile.state, 'published');
  assert.equal(audits.platform[0].action, 'directory.profile.unverified');
});

test('hiding a profile marks moderation and state, and restore returns it to published', async () => {
  const profile = profileDoc();
  (AgencyProfile as any).findOne = () => query(profile);
  stubAgency();
  stubPackages([]);
  stubReplyTime();
  const audits = captureAudits();

  const hidden = await setProfileHidden({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    hidden: true,
    reason: '  Adult content in the description.  ',
  });

  assert.equal(hidden.changed, true);
  assert.equal(profile.state, 'hidden');
  assert.ok(profile.moderation.hiddenAt instanceof Date);
  assert.equal(String(profile.moderation.hiddenBy), ACTOR);
  assert.equal(profile.moderation.reason, 'Adult content in the description.');
  assert.ok(profile.publishedAt instanceof Date);
  assert.equal(audits.platform[0].action, 'directory.profile.hidden');
  assert.equal(audits.platform[0].metadata.reason, 'Adult content in the description.');
  assert.equal(audits.tenant[0].action, 'profile.hidden');

  const restored = await setProfileHidden({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    hidden: false,
  });

  assert.equal(restored.changed, true);
  assert.equal(profile.state, 'published');
  assert.equal(profile.moderation.hiddenAt, null);
  assert.equal(profile.moderation.reason, undefined);
  assert.equal(audits.platform.at(-1)?.action, 'directory.profile.restored');
});

test('restoring a never-published profile returns it to draft', async () => {
  const profile = profileDoc({ state: 'hidden', publishedAt: null, moderation: { hiddenAt: new Date() } });
  (AgencyProfile as any).findOne = () => query(profile);
  stubAgency();
  stubPackages([]);
  stubReplyTime();
  captureAudits();

  await setProfileHidden({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    hidden: false,
  });

  assert.equal(profile.state, 'draft');
});

test('a profile without a row is a 404 for verification and hiding', async () => {
  (AgencyProfile as any).findOne = () => query(null);

  for (const action of [
    () => setProfileVerification({ actorId: ACTOR, agencyId: AGENCY_A, verified: true }),
    () => setProfileHidden({ actorId: ACTOR, agencyId: AGENCY_A, hidden: true, reason: 'x' }),
  ]) {
    await assert.rejects(action, (error: any) => error.statusCode === 404);
  }
});

test('a package hide is tenant-scoped, keeps its state and restores in place', async () => {
  const pkg = packageDoc();
  let filter: any = null;
  (AgencyPackage as any).findOne = (value: unknown) => {
    filter = value;
    return query(pkg);
  };
  (AgencyProfile as any).findOne = () => query(null);
  stubAgency();
  stubPackages([packageDoc()]);
  const audits = captureAudits();

  await setPackageHidden({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    hidden: true,
    reason: 'Misleading price',
  });

  assert.deepEqual(filter, { _id: PACKAGE_A, agencyId: AGENCY_A });
  assert.equal(pkg.state, 'published');
  assert.ok(pkg.moderation.hiddenAt instanceof Date);
  assert.equal(pkg.moderation.reason, 'Misleading price');
  assert.equal(audits.platform[0].action, 'directory.package.hidden');
  assert.equal(audits.platform[0].targetType, 'package');
  assert.equal(audits.platform[0].metadata.agencyId, AGENCY_A);
  assert.equal(audits.tenant[0].action, 'package.hidden');

  await setPackageHidden({
    actorId: ACTOR,
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    hidden: false,
  });

  assert.equal(pkg.state, 'published');
  assert.equal(pkg.moderation.hiddenAt, null);
  assert.equal(audits.platform.at(-1)?.action, 'directory.package.restored');
});

test('an unknown or invalid package id is a 404', async () => {
  (AgencyPackage as any).findOne = () => query(null);

  await assert.rejects(
    () =>
      setPackageHidden({
        actorId: ACTOR,
        agencyId: AGENCY_A,
        packageId: PACKAGE_A,
        hidden: true,
      }),
    (error: any) => error.statusCode === 404
  );

  await assert.rejects(
    () =>
      setPackageHidden({
        actorId: ACTOR,
        agencyId: AGENCY_A,
        packageId: 'not-an-id',
        hidden: true,
      }),
    (error: any) => error.statusCode === 404
  );
});

test('the console view exposes readiness, reply time and packages', async () => {
  (AgencyProfile as any).findOne = () => query(profileDoc());
  stubAgency();
  stubPackages([
    packageDoc(),
    packageDoc({
      _id: '507f1f77bcf86cd799439042',
      title: 'Coastal weekend',
      state: 'draft',
      fromPricePerPerson: null,
      publishedAt: null,
    }),
  ]);
  stubReplyTime([
    { createdAt: new Date('2026-11-01T00:00:00Z'), repliedAt: new Date('2026-11-01T03:00:00Z') },
    { createdAt: new Date('2026-11-02T00:00:00Z'), repliedAt: new Date('2026-11-02T03:00:00Z') },
    { createdAt: new Date('2026-11-03T00:00:00Z'), repliedAt: new Date('2026-11-03T03:00:00Z') },
    { createdAt: new Date('2026-11-04T00:00:00Z'), repliedAt: new Date('2026-11-04T03:00:00Z') },
    { createdAt: new Date('2026-11-05T00:00:00Z'), repliedAt: new Date('2026-11-05T03:00:00Z') },
  ]);

  const view = await loadDirectoryAdminView(AGENCY_A);

  assert.equal(view.slug, 'hills-and-horizons');
  assert.equal(view.profile?.ready, true);
  assert.equal(view.profile?.replyTimeHours, 3);
  assert.equal(view.packages.length, 2);
  assert.equal(view.packages[0].id, PACKAGE_A);
  assert.equal(view.packages[0].pricePerPerson, 42000);
  assert.equal(view.packages[1].state, 'draft');
  assert.equal(view.packages[1].pricePerPerson, null);
});

test('the console view answers 404 for an unknown tenant', async () => {
  (Agency as any).findById = () => query(null);
  (AgencyProfile as any).findOne = () => query(null);
  stubPackages([]);

  await assert.rejects(
    () => loadDirectoryAdminView(AGENCY_B),
    (error: any) => error.statusCode === 404
  );
});
