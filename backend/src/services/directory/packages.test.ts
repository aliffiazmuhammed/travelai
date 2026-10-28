import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyAsset from '../../models/AgencyAsset.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import Trip from '../../models/Trip.js';
import {
  buildPackageFields,
  createAgencyPackage,
  deleteAgencyPackage,
  listAgencyPackages,
  loadPublicPackages,
  lowestPackagePrices,
  packageReadiness,
  publishAgencyPackage,
  snapshotFromTrip,
  unpublishAgencyPackage,
  updateAgencyPackage,
  viewOwnPackage,
} from './packages.js';

/**
 * Milestone 9 D4 — package snapshots. Model calls are stubbed, so these tests
 * pin the two promises the feature makes: a package never reads its source trip
 * again, and only a ready package can go public.
 */

const AGENCY_A = '507f1f77bcf86cd799439011';
const AGENCY_B = '507f1f77bcf86cd799439012';
const TRIP_A = '507f1f77bcf86cd799439031';
const PACKAGE_A = '507f1f77bcf86cd799439041';
const ASSET_A = '507f1f77bcf86cd799439051';

const originals = {
  tripFindOne: Trip.findOne,
  assetFindOne: AgencyAsset.findOne,
  packageCreate: AgencyPackage.create,
  packageFindOne: AgencyPackage.findOne,
  packageFind: AgencyPackage.find,
  packageDeleteOne: AgencyPackage.deleteOne,
  auditCreate: AgencyAudit.create,
};

test.after(() => {
  (Trip as any).findOne = originals.tripFindOne;
  (AgencyAsset as any).findOne = originals.assetFindOne;
  (AgencyPackage as any).create = originals.packageCreate;
  (AgencyPackage as any).findOne = originals.packageFindOne;
  (AgencyPackage as any).find = originals.packageFind;
  (AgencyPackage as any).deleteOne = originals.packageDeleteOne;
  (AgencyAudit as any).create = originals.auditCreate;
});

function chain(result: any) {
  const builder = {
    select: () => builder,
    sort: () => builder,
    lean: async () => result,
  };
  return builder;
}

function packageDoc(overrides: Record<string, unknown> = {}): any {
  return {
    _id: PACKAGE_A,
    agencyId: AGENCY_A,
    tripId: null,
    title: 'Western ghats in the monsoon',
    summary: 'Five nights of waterfalls and slow roads.',
    nights: 5,
    fromPricePerPerson: null,
    currency: 'INR',
    coverAssetId: null,
    highlights: [],
    inclusions: [],
    state: 'draft',
    order: 0,
    publishedAt: null,
    saved: false,
    async save() {
      this.saved = true;
      return this;
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

test('a package is ready only with a title and a summary', () => {
  assert.deepEqual(packageReadiness(null), {
    ready: false,
    missing: ['Give the package a title.', 'Write a one-line summary for the card.'],
  });
  assert.deepEqual(packageReadiness(packageDoc({ summary: '   ' })), {
    ready: false,
    missing: ['Write a one-line summary for the card.'],
  });
  assert.deepEqual(packageReadiness(packageDoc()), { ready: true, missing: [] });
});

test('the write wall trims, ignores unknown keys and clears the price', () => {
  const fields = buildPackageFields({
    title: '  Western ghats  ',
    summary: '  Five nights.  ',
    nights: '5',
    fromPricePerPerson: '',
    currency: 'INR',
    highlights: [' Kaas ', 'kaas', 'Lonavala', ''],
    inclusions: ['Stay', ' Breakfast '],
    agencyId: AGENCY_B,
    state: 'published',
  });

  assert.deepEqual(fields, {
    title: 'Western ghats',
    summary: 'Five nights.',
    nights: 5,
    fromPricePerPerson: null,
    currency: 'INR',
    highlights: ['Kaas', 'Lonavala'],
    inclusions: ['Stay', 'Breakfast'],
  });
});

test('the write wall rejects empty titles, odd nights, foreign currency and typo prices', () => {
  assert.throws(() => buildPackageFields({ title: '   ' }), /title/i);
  assert.throws(() => buildPackageFields({ title: 'x'.repeat(121) }), /title/i);
  assert.throws(() => buildPackageFields({ nights: 1.5 }), /whole number/i);
  assert.throws(() => buildPackageFields({ nights: 61 }), /whole number/i);
  assert.throws(() => buildPackageFields({ currency: 'USD' }), /rupees/i);
  assert.throws(
    () => buildPackageFields({ fromPricePerPerson: 10_000_001 }),
    /whole rupees/i
  );
  assert.throws(
    () => buildPackageFields({ fromPricePerPerson: 42.5 }),
    /whole rupees/i
  );
});

test('the snapshot copies the trip title, nights and highlights, never money', () => {
  const snapshot = snapshotFromTrip({
    title: '  Monsoon in the ghats  ',
    tripDetails: {
      duration_days: 5,
      highlights: ['Kaas plateau', `  ${'x'.repeat(90)}  `],
      total_budget: 42000,
      price: 42000,
    },
  });

  assert.equal(snapshot.title, 'Monsoon in the ghats');
  assert.equal(snapshot.nights, 4);
  assert.equal(snapshot.highlights[0], 'Kaas plateau');
  assert.equal(snapshot.highlights[1].length, 80);
  assert.deepEqual(Object.keys(snapshot).sort(), ['highlights', 'nights', 'title']);
});

test('the snapshot falls back to the itinerary, dates and the trip title field', () => {
  const fromItinerary = snapshotFromTrip({
    tripDetails: { day_by_day_itinerary: [{}, {}, {}] },
  });
  assert.equal(fromItinerary.nights, 2);
  assert.equal(fromItinerary.title, '');

  const fromDates = snapshotFromTrip({
    tripDetails: { trip_title: 'Backup title' },
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2026-11-03T00:00:00.000Z',
  });
  assert.equal(fromDates.nights, 2);
  assert.equal(fromDates.title, 'Backup title');

  const noDates = snapshotFromTrip({});
  assert.equal(noDates.nights, 0);
});

test('creating from a trip copies the snapshot and never carries the trip price', async () => {
  const audits = captureAudit();
  let tripFilter: any = null;
  let created: any = null;

  (Trip as any).findOne = (filter: unknown) => {
    tripFilter = filter;
    return {
      lean: async () => ({
        _id: TRIP_A,
        title: 'Monsoon in the ghats',
        tripDetails: {
          duration_days: 6,
          highlights: ['Kaas plateau', 'Lonavala'],
          total_budget: 50000,
        },
      }),
    };
  };
  (AgencyPackage as any).findOne = () => chain(null);
  (AgencyPackage as any).create = async (payload: unknown) => {
    created = payload;
    return packageDoc(payload as any);
  };

  const result = await createAgencyPackage({
    agencyId: AGENCY_A,
    actorId: 'user-1',
    tripId: TRIP_A,
    fields: {},
  });

  assert.deepEqual(tripFilter, {
    _id: TRIP_A,
    workspace: 'agency',
    agencyId: AGENCY_A,
    isDeleted: { $ne: true },
  });
  assert.equal(created.title, 'Monsoon in the ghats');
  assert.equal(created.summary, '');
  assert.equal(created.nights, 5);
  assert.equal(created.fromPricePerPerson, null);
  assert.equal(created.state, 'draft');
  assert.deepEqual(created.highlights, ['Kaas plateau', 'Lonavala']);
  assert.equal(String(created.tripId), TRIP_A);
  assert.equal(result.saved, false);

  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'package.created');
  assert.equal(audits[0].targetType, 'package');
  assert.equal(audits[0].actorId, 'user-1');
  assert.deepEqual(audits[0].metadata, {
    title: 'Monsoon in the ghats',
    source: 'trip',
  });
});

test('a trip that is missing, personal or foreign is a 404', async () => {
  (Trip as any).findOne = () => ({ lean: async () => null });

  await assert.rejects(
    () =>
      createAgencyPackage({
        agencyId: AGENCY_A,
        tripId: TRIP_A,
        fields: {},
      }),
    (error: any) => error.statusCode === 404
  );

  await assert.rejects(
    () =>
      createAgencyPackage({
        agencyId: AGENCY_A,
        tripId: 'not-an-id',
        fields: {},
      }),
    (error: any) => error.statusCode === 404
  );
});

test('one trip cannot produce two packages', async () => {
  (Trip as any).findOne = () => ({
    lean: async () => ({ _id: TRIP_A, title: 'Trip', tripDetails: {} }),
  });
  (AgencyPackage as any).findOne = () => chain({ _id: PACKAGE_A });

  await assert.rejects(
    () =>
      createAgencyPackage({
        agencyId: AGENCY_A,
        tripId: TRIP_A,
        fields: {},
      }),
    (error: any) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test('a scratch package starts as a draft with the price on request', async () => {
  let created: any = null;
  (AgencyPackage as any).create = async (payload: unknown) => {
    created = payload;
    return packageDoc(payload as any);
  };
  captureAudit();

  await createAgencyPackage({
    agencyId: AGENCY_A,
    fields: { title: 'Goa long weekend' },
  });

  assert.equal(created.title, 'Goa long weekend');
  assert.equal(created.summary, '');
  assert.equal(created.nights, 1);
  assert.equal(created.fromPricePerPerson, null);
  assert.equal(created.tripId, null);
  assert.equal(created.state, 'draft');
});

test('a cover must be an image from the same agency', async () => {
  let assetFilter: any = null;
  (AgencyAsset as any).findOne = (filter: unknown) => {
    assetFilter = filter;
    return chain({ _id: ASSET_A });
  };
  (AgencyPackage as any).create = async (payload: unknown) =>
    packageDoc(payload as any);
  captureAudit();

  await createAgencyPackage({
    agencyId: AGENCY_A,
    fields: { title: 'With cover', coverAssetId: ASSET_A },
  });

  assert.deepEqual(assetFilter, { _id: ASSET_A, agencyId: AGENCY_A, kind: 'image' });

  (AgencyAsset as any).findOne = () => chain(null);
  await assert.rejects(
    () =>
      createAgencyPackage({
        agencyId: AGENCY_A,
        fields: { title: 'Foreign cover', coverAssetId: ASSET_A },
      }),
    /asset library/i
  );

  await assert.rejects(
    () =>
      createAgencyPackage({
        agencyId: AGENCY_A,
        fields: { title: 'Bad cover', coverAssetId: 'nope' },
      }),
    /asset library/i
  );
});

function stubPackageLookup(doc: any) {
  let captured: any = null;
  (AgencyPackage as any).findOne = (filter: unknown) => {
    captured = { filter };
    return doc;
  };
  return () => captured;
}

test('an update is scoped to the tenant and normalises the payload', async () => {
  const audits = captureAudit();
  const doc = packageDoc();
  const getFilter = stubPackageLookup(doc);

  const updated = await updateAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    actorId: 'user-1',
    fields: {
      title: '  New title  ',
      fromPricePerPerson: 42000,
      nights: '6',
      inclusions: ['Stay', 'stay', 'Breakfast'],
    },
  });

  assert.deepEqual(getFilter().filter, { _id: PACKAGE_A, agencyId: AGENCY_A });
  assert.equal(updated.title, 'New title');
  assert.equal(updated.fromPricePerPerson, 42000);
  assert.equal(updated.nights, 6);
  assert.deepEqual(updated.inclusions, ['Stay', 'Breakfast']);
  assert.equal(updated.saved, true);
  assert.equal(audits[0].action, 'package.updated');
});

test('an update can clear the price and the cover', async () => {
  const doc = packageDoc({ fromPricePerPerson: 42000, coverAssetId: ASSET_A });
  stubPackageLookup(doc);
  captureAudit();

  const updated = await updateAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    fields: { fromPricePerPerson: null, coverAssetId: null },
  });

  assert.equal(updated.fromPricePerPerson, null);
  assert.equal(updated.coverAssetId, null);
});

test('an empty update and an unknown package are both refused', async () => {
  stubPackageLookup(packageDoc());
  await assert.rejects(
    () =>
      updateAgencyPackage({
        agencyId: AGENCY_A,
        packageId: PACKAGE_A,
        fields: {},
      }),
    /package change/i
  );

  (AgencyPackage as any).findOne = async () => null;
  await assert.rejects(
    () =>
      updateAgencyPackage({
        agencyId: AGENCY_A,
        packageId: PACKAGE_A,
        fields: { title: 'Nope' },
      }),
    (error: any) => error.statusCode === 404
  );

  await assert.rejects(
    () =>
      updateAgencyPackage({
        agencyId: AGENCY_A,
        packageId: 'not-an-id',
        fields: { title: 'Nope' },
      }),
    (error: any) => error.statusCode === 404
  );
});

test('publishing refuses an unready package and never saves it', async () => {
  const doc = packageDoc({ summary: '' });
  stubPackageLookup(doc);
  captureAudit();

  await assert.rejects(
    () => publishAgencyPackage({ agencyId: AGENCY_A, packageId: PACKAGE_A }),
    (error: any) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /summary/i);
      return true;
    }
  );
  assert.equal(doc.saved, false);
  assert.equal(doc.state, 'draft');
});

test('publishing stamps the date once and unpublishing clears it', async () => {
  const audits = captureAudit();
  const doc = packageDoc();
  stubPackageLookup(doc);

  const published = await publishAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    actorId: 'admin-1',
  });
  const firstSeen = published.publishedAt;
  assert.ok(firstSeen instanceof Date);
  assert.equal(published.state, 'published');
  assert.equal(audits.at(-1)?.action, 'package.published');

  const republished = await publishAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
  });
  assert.equal(republished.publishedAt, firstSeen);

  const draft = await unpublishAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
  });
  assert.equal(draft.state, 'draft');
  assert.equal(draft.publishedAt, null);
  assert.equal(audits.at(-1)?.action, 'package.unpublished');
});

test('deleting a package is a tenant-scoped delete and an audit event', async () => {
  const audits = captureAudit();
  let deleteFilter: any = null;
  stubPackageLookup(packageDoc());
  (AgencyPackage as any).deleteOne = async (filter: unknown) => {
    deleteFilter = filter;
    return { acknowledged: true };
  };

  const result = await deleteAgencyPackage({
    agencyId: AGENCY_A,
    packageId: PACKAGE_A,
    actorId: 'admin-1',
  });

  assert.deepEqual(result, { id: PACKAGE_A });
  assert.equal(String(deleteFilter._id), PACKAGE_A);
  assert.equal(deleteFilter.agencyId, AGENCY_A);
  assert.equal(audits.at(-1)?.action, 'package.deleted');
});

test('a hidden package refuses publishing and is never saved', async () => {
  const doc = packageDoc({ moderation: { hiddenAt: new Date() } });
  stubPackageLookup(doc);
  captureAudit();

  await assert.rejects(
    () => publishAgencyPackage({ agencyId: AGENCY_A, packageId: PACKAGE_A }),
    (error: any) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /under review/);
      return true;
    }
  );
  assert.equal(doc.saved, false);
});

test('the tenant view reports an ops hide without changing agency intent', () => {
  const view = viewOwnPackage(
    packageDoc({
      state: 'published',
      publishedAt: new Date('2026-11-04T08:00:00.000Z'),
      moderation: {
        hiddenAt: new Date('2026-11-05T09:00:00.000Z'),
        reason: 'Complaint under review',
      },
    }),
    AGENCY_A
  );

  assert.equal(view.hidden, true);
  assert.equal(view.hiddenAt, '2026-11-05T09:00:00.000Z');
  assert.equal(view.hiddenReason, 'Complaint under review');
  assert.equal(view.state, 'published');
});

test('the tenant view exposes provenance and an authenticated cover URL', () => {
  const view = viewOwnPackage(
    packageDoc({
      tripId: TRIP_A,
      coverAssetId: ASSET_A,
      state: 'published',
      publishedAt: new Date('2026-11-04T08:00:00.000Z'),
      highlights: ['Kaas plateau'],
    }),
    AGENCY_A
  );

  assert.equal(view.tripId, TRIP_A);
  assert.equal(view.coverUrl, `/api/agency/${AGENCY_A}/assets/${ASSET_A}/content`);
  assert.equal(view.state, 'published');
  assert.equal(view.publishedAt, '2026-11-04T08:00:00.000Z');
  assert.equal(view.readiness.ready, true);
  assert.deepEqual(view.highlights, ['Kaas plateau']);

  const empty = viewOwnPackage(null, AGENCY_A);
  assert.equal(empty.tripId, null);
  assert.equal(empty.coverUrl, null);
  assert.equal(empty.readiness.ready, false);
});

test('the agency library lists every package scoped to the tenant', async () => {
  let findFilter: any = null;
  let sort: any = null;
  (AgencyPackage as any).find = (filter: unknown) => {
    findFilter = filter;
    const builder = {
      sort: (value: unknown) => {
        sort = value;
        return builder;
      },
      lean: async () => [packageDoc(), packageDoc({ _id: 'other' })],
    };
    return builder;
  };

  const rows = await listAgencyPackages(AGENCY_A);
  assert.deepEqual(findFilter, { agencyId: AGENCY_A });
  assert.deepEqual(sort, { order: 1, createdAt: -1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Western ghats in the monsoon');
});

test('the public read only touches published, dated packages', async () => {
  let findFilter: any = null;
  let selected: any = null;
  (AgencyPackage as any).find = (filter: unknown) => {
    findFilter = filter;
    const builder = {
      select: (value: unknown) => {
        selected = value;
        return builder;
      },
      sort: () => builder,
      lean: async () => [packageDoc({ state: 'published', publishedAt: new Date() })],
    };
    return builder;
  };

  const rows = await loadPublicPackages(AGENCY_A);
  assert.deepEqual(findFilter, {
    agencyId: AGENCY_A,
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
  });
  assert.match(String(selected), /title/);
  assert.doesNotMatch(String(selected), /tripId/);
  assert.equal(rows.length, 1);
});

test('the listing "from" price is the lowest published number per agency', async () => {
  let priceFilter: any = null;
  (AgencyPackage as any).find = (filter: unknown) => {
    priceFilter = filter;
    return chain([
      { agencyId: AGENCY_A, fromPricePerPerson: 52000, currency: 'INR' },
      { agencyId: AGENCY_A, fromPricePerPerson: 42000, currency: 'INR' },
      { agencyId: AGENCY_B, fromPricePerPerson: 30000, currency: 'EUR' },
    ]);
  };

  const prices = await lowestPackagePrices([AGENCY_A, AGENCY_B, 'not-an-id']);

  assert.deepEqual(priceFilter, {
    agencyId: { $in: [AGENCY_A, AGENCY_B] },
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
    fromPricePerPerson: { $ne: null },
  });
  assert.deepEqual(prices.get(AGENCY_A), { price: 42000, currency: 'INR' });
  assert.deepEqual(prices.get(AGENCY_B), { price: 30000, currency: 'EUR' });

  assert.deepEqual(await lowestPackagePrices([]), new Map());
});

test('AgencyPackage enforces one package per trip and orders public reads', () => {
  const indexes = AgencyPackage.schema.indexes();

  const perTrip = indexes.find(([keys]) => keys.agencyId === 1 && keys.tripId === 1);
  assert.ok(perTrip, 'one package per source trip');
  assert.equal(perTrip![1].unique, true);
  assert.deepEqual(perTrip![1].partialFilterExpression, {
    tripId: { $type: 'objectId' },
  });

  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 &&
        keys.state === 1 &&
        keys.publishedAt === -1 &&
        keys._id === -1
    ),
    'the public read orders published packages with a tie-break'
  );
});
