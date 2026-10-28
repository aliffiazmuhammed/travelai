import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import {
  buildDirectoryProfileUpdate,
  directoryReadiness,
  loadPublicAgencyProfile,
  publishDirectoryProfile,
  unpublishDirectoryProfile,
  updateDirectoryProfile,
  viewOwnDirectoryProfile,
} from './profile.js';

/**
 * Milestone 9 D1 — profile lifecycle. Model calls are stubbed, so these tests
 * pin the rules (readiness, normalisation, tenant scope, publish guards) with
 * no database.
 */

const originals = {
  agencyFindById: Agency.findById,
  agencyFindOne: Agency.findOne,
  profileFindOne: AgencyProfile.findOne,
  profileFindOneAndUpdate: AgencyProfile.findOneAndUpdate,
  auditCreate: AgencyAudit.create,
  packageFind: AgencyPackage.find,
};

test.after(() => {
  (Agency as any).findById = originals.agencyFindById;
  (Agency as any).findOne = originals.agencyFindOne;
  (AgencyProfile as any).findOne = originals.profileFindOne;
  (AgencyProfile as any).findOneAndUpdate = originals.profileFindOneAndUpdate;
  (AgencyAudit as any).create = originals.auditCreate;
  (AgencyPackage as any).find = originals.packageFind;
});

function packageChain(result: any[]) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    lean: async () => result,
  };
  return chain;
}

// Every public read joins published packages; individual tests override this.
(AgencyPackage as any).find = () => packageChain([]);

const READY_ABOUT =
  'We plan small-group treks and slow road trips across the western ghats for curious travellers.';

function completeProfile(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'profile-id',
    agencyId: 'agency-a',
    state: 'draft',
    about: READY_ABOUT,
    baseCity: 'Pune',
    destinations: ['Maharashtra'],
    specialties: ['Western ghats'],
    services: ['custom_itineraries'],
    languages: ['en'],
    showPhone: false,
    showGstin: false,
    publishedAt: null,
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

function activeAgency(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'agency-a',
    slug: 'hills-and-horizons',
    name: 'Hills & Horizons Travel',
    status: 'active',
    gstin: '27AABCH1234C1Z5',
    branding: {
      logoUrl: 'https://cdn.example.com/logo.png',
      contactPhone: '+91 98765 43210',
    },
    ...overrides,
  };
}

function captureAudit(): any[] {
  const audits: any[] = [];
  (AgencyAudit as any).create = async (payload: unknown) => {
    audits.push(payload);
    return payload;
  };
  return audits;
}

test('readiness names every missing publish requirement', () => {
  const result = directoryReadiness(null, { branding: {} });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, [
    'Write at least 80 characters about your agency.',
    'Add the city you plan trips from.',
    'List at least one destination you cover.',
    'Choose at least one service you offer.',
    'Upload a logo in Agency settings.',
  ]);
});

test('readiness passes only with description, city, destination, service and logo', () => {
  const result = directoryReadiness(completeProfile(), activeAgency());
  assert.deepEqual(result, { ready: true, missing: [] });

  const noLogo = directoryReadiness(completeProfile(), { branding: {} });
  assert.deepEqual(noLogo.missing, ['Upload a logo in Agency settings.']);
});

test('a save normalises lists and keeps the canonical service order', () => {
  const update = buildDirectoryProfileUpdate({
    destinations: ['  Goa ', 'goa', '', 'Kerala'],
    services: ['adventure', 'custom_itineraries'],
    languages: ['hi', 'en'],
    specialties: ['Coast', 'coast', 'Hills'],
  });

  assert.deepEqual(update.$unset, {});
  assert.deepEqual(update.$set.destinations, ['Goa', 'Kerala']);
  assert.deepEqual(update.$set.specialties, ['Coast', 'Hills']);
  assert.deepEqual(update.$set.services, ['custom_itineraries', 'adventure']);
  assert.deepEqual(update.$set.languages, ['en', 'hi']);
});

test('a save rejects unknown services, oversized lists and empty changes', () => {
  assert.throws(
    () => buildDirectoryProfileUpdate({ services: ['teleportation'] }),
    /Choose services from the list/
  );
  assert.throws(
    () =>
      buildDirectoryProfileUpdate({
        destinations: Array.from({ length: 13 }, (_, index) => `Place ${index}`),
      }),
    /at most 12 destinations/
  );
  assert.throws(
    () => buildDirectoryProfileUpdate({ destinations: 'Goa' }),
    /destinations must be a list/
  );
  assert.throws(() => buildDirectoryProfileUpdate({}), /Provide a profile change/);
});

test('an empty string clears a field and booleans set visibility', () => {
  const cleared = buildDirectoryProfileUpdate({ about: '   ', baseCity: '' });
  assert.deepEqual(cleared.$unset, { about: 1, baseCity: 1 });
  assert.deepEqual(cleared.$set, {});

  const flags = buildDirectoryProfileUpdate({ showPhone: true, showGstin: false });
  assert.deepEqual(flags.$set, { showPhone: true, showGstin: false });

  assert.throws(
    () => buildDirectoryProfileUpdate({ showPhone: 'yes' }),
    /visibility must be on or off/
  );
});

test('an update is an upsert scoped to the tenant', async () => {
  let captured: any = null;
  (AgencyProfile as any).findOneAndUpdate = (
    filter: unknown,
    update: unknown,
    options: unknown
  ) => {
    captured = { filter, update, options };
    return { lean: async () => completeProfile() };
  };

  const saved = await updateDirectoryProfile('agency-a', {
    baseCity: 'Pune',
    services: ['custom_itineraries'],
  });

  assert.deepEqual(captured.filter, { agencyId: 'agency-a' });
  assert.equal(captured.options.upsert, true);
  assert.equal(captured.options.new, true);
  assert.deepEqual(captured.update.$set.services, ['custom_itineraries']);
  assert.equal(saved.agencyId, 'agency-a');
});

test('publishing refuses an incomplete profile and never saves it', async () => {
  const incomplete = completeProfile({ about: 'Too short.', destinations: [] });
  (Agency as any).findById = () => ({ lean: async () => activeAgency() });
  (AgencyProfile as any).findOne = async () => incomplete;

  await assert.rejects(
    () => publishDirectoryProfile({ agencyId: 'agency-a', actorId: 'user-1' }),
    (error: any) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /Finish these first/);
      assert.match(error.message, /at least 80 characters/);
      assert.match(error.message, /at least one destination/);
      return true;
    }
  );
  assert.equal(incomplete.saved, false);
});

test('a profile under review cannot be republished by the agency', async () => {
  const hidden = completeProfile({ moderation: { hiddenAt: new Date() } });
  (Agency as any).findById = () => ({ lean: async () => activeAgency() });
  (AgencyProfile as any).findOne = async () => hidden;

  await assert.rejects(
    () => publishDirectoryProfile({ agencyId: 'agency-a' }),
    (error: any) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /under review/);
      return true;
    }
  );
});

test('publishing a complete profile stamps the date and writes an audit event', async () => {
  const audits = captureAudit();
  const profile = completeProfile();
  (Agency as any).findById = () => ({ lean: async () => activeAgency() });
  (AgencyProfile as any).findOne = async () => profile;

  const published = await publishDirectoryProfile({
    agencyId: 'agency-a',
    actorId: 'user-1',
  });

  assert.equal(published.state, 'published');
  assert.ok(published.publishedAt instanceof Date);
  assert.equal(published.saved, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'profile.published');
  assert.equal(audits[0].targetType, 'profile');
  assert.equal(audits[0].targetId, 'profile-id');
  assert.equal(audits[0].actorId, 'user-1');
  assert.deepEqual(audits[0].metadata, { slug: 'hills-and-horizons' });
});

test('republishing keeps the original publish date', async () => {
  captureAudit();
  const firstSeen = new Date('2026-10-01T00:00:00.000Z');
  const profile = completeProfile({ publishedAt: firstSeen });
  (Agency as any).findById = () => ({ lean: async () => activeAgency() });
  (AgencyProfile as any).findOne = async () => profile;

  const published = await publishDirectoryProfile({ agencyId: 'agency-a' });
  assert.equal(published.publishedAt, firstSeen);
});

test('unpublishing returns the profile to draft and clears the date', async () => {
  const audits = captureAudit();
  const profile = completeProfile({
    state: 'published',
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  (AgencyProfile as any).findOne = async () => profile;

  const draft = await unpublishDirectoryProfile({
    agencyId: 'agency-a',
    actorId: 'user-1',
  });

  assert.equal(draft.state, 'draft');
  assert.equal(draft.publishedAt, null);
  assert.equal(draft.saved, true);
  assert.equal(audits[0].action, 'profile.unpublished');
});

test('unpublishing without a profile is a 404', async () => {
  (AgencyProfile as any).findOne = async () => null;
  await assert.rejects(
    () => unpublishDirectoryProfile({ agencyId: 'agency-a' }),
    (error: any) => error.statusCode === 404
  );
});

test('the public read looks up an active agency by normalised slug', async () => {
  let agencyFilter: any = null;
  let profileFilter: any = null;
  (Agency as any).findOne = (filter: unknown) => {
    agencyFilter = filter;
    return { lean: async () => activeAgency() };
  };
  (AgencyProfile as any).findOne = (filter: unknown) => {
    profileFilter = filter;
    return {
      lean: async () =>
        completeProfile({ state: 'published', publishedAt: new Date() }),
    };
  };

  const view = await loadPublicAgencyProfile('  Hills-And-Horizons ');

  assert.deepEqual(agencyFilter, { slug: 'hills-and-horizons', status: 'active' });
  assert.equal(profileFilter.agencyId, 'agency-a');
  assert.equal(profileFilter.state, 'published');
  assert.deepEqual(profileFilter.publishedAt, { $ne: null });
  assert.equal(profileFilter['moderation.hiddenAt'], null);
  assert.equal(view?.slug, 'hills-and-horizons');
  assert.equal(view?.name, 'Hills & Horizons Travel');
});

test('the public read joins only published packages', async () => {
  let packageFilter: any = null;
  (Agency as any).findOne = () => ({ lean: async () => activeAgency() });
  (AgencyProfile as any).findOne = () => ({
    lean: async () =>
      completeProfile({ state: 'published', publishedAt: new Date() }),
  });
  (AgencyPackage as any).find = (filter: unknown) => {
    packageFilter = filter;
    return packageChain([
      {
        _id: 'package-id',
        title: 'Western ghats in the monsoon',
        summary: 'Five nights of waterfalls and slow roads.',
        nights: 5,
        fromPricePerPerson: null,
        currency: 'INR',
        coverAssetId: null,
        highlights: ['Kaas plateau'],
        inclusions: [],
      },
    ]);
  };

  const view = await loadPublicAgencyProfile('hills-and-horizons');

  assert.equal(packageFilter.agencyId, 'agency-a');
  assert.equal(packageFilter.state, 'published');
  assert.deepEqual(packageFilter.publishedAt, { $ne: null });
  assert.equal(view?.packages.length, 1);
  assert.equal(view?.packages[0].title, 'Western ghats in the monsoon');
  assert.equal(view?.packages[0].pricePerPerson, null);
  assert.equal(view?.packages[0].coverUrl, null);

  (AgencyPackage as any).find = () => packageChain([]);
});

test('the public read returns nothing for unknown, suspended, draft or hidden rows', async () => {
  let agencyRow: any = null;
  let profileRow: any = null;

  (Agency as any).findOne = (filter: any) => ({
    lean: async () =>
      agencyRow && filter.status === 'active' && agencyRow.status === 'active'
        ? agencyRow
        : null,
  });
  (AgencyProfile as any).findOne = (filter: any) => ({
    lean: async () => {
      if (!profileRow) return null;
      if (filter.state !== 'published' || profileRow.state !== 'published') {
        return null;
      }
      if (!profileRow.publishedAt) return null;
      if (
        filter['moderation.hiddenAt'] === null &&
        profileRow.moderation?.hiddenAt
      ) {
        return null;
      }
      return profileRow;
    },
  });

  assert.equal(await loadPublicAgencyProfile('nobody-here'), null);

  agencyRow = activeAgency({ status: 'suspended' });
  assert.equal(await loadPublicAgencyProfile('hills-and-horizons'), null);

  agencyRow = activeAgency();
  for (const row of [
    null,
    completeProfile({ state: 'draft' }),
    completeProfile({ state: 'published' }),
    completeProfile({
      state: 'published',
      publishedAt: new Date(),
      moderation: { hiddenAt: new Date() },
    }),
  ]) {
    profileRow = row;
    assert.equal(await loadPublicAgencyProfile('hills-and-horizons'), null);
  }

  profileRow = completeProfile({ state: 'published', publishedAt: new Date() });
  assert.equal(
    (await loadPublicAgencyProfile('hills-and-horizons'))?.slug,
    'hills-and-horizons'
  );
});

test('an empty or oversized slug never reaches the database', async () => {
  let queried = false;
  (Agency as any).findOne = () => {
    queried = true;
    return { lean: async () => null };
  };
  assert.equal(await loadPublicAgencyProfile('   '), null);
  assert.equal(await loadPublicAgencyProfile('x'.repeat(41)), null);
  assert.equal(queried, false);
});

test('the tenant view defaults a missing profile to an empty draft', () => {
  const view = viewOwnDirectoryProfile(null);
  assert.deepEqual(view, {
    state: 'draft',
    about: '',
    baseCity: '',
    destinations: [],
    specialties: [],
    services: [],
    languages: [],
    showPhone: false,
    showGstin: false,
    publishedAt: null,
    verified: false,
    underReview: false,
  });

  const hidden = viewOwnDirectoryProfile(
    completeProfile({ moderation: { hiddenAt: new Date() } })
  );
  assert.equal(hidden.underReview, true);
});

test('AgencyProfile has a unique tenant index and a listing index', () => {
  const indexes = AgencyProfile.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) => keys.agencyId === 1 && options?.unique === true
    ),
    'one profile per agency'
  );
  assert.ok(
    indexes.some(
      ([keys]) => keys.state === 1 && keys.publishedAt === -1 && keys._id === -1
    ),
    'the listing orders published profiles newest first with a tie-break'
  );
});
