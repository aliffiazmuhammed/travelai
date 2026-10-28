import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import {
  agencyIdsMatchingName,
  buildDirectoryFilter,
  decodeDirectoryCursor,
  encodeDirectoryCursor,
  listDirectoryAgencies,
  tallyDirectoryFacets,
} from './listing.js';

/**
 * Milestone 9 D3 — the public listing. Model calls are stubbed, so these tests
 * pin the query shape (eligibility, search, facet filters, cursor), the
 * page/card behaviour and the facet tally without a database.
 */

const AGENCY_A = '507f1f77bcf86cd799439011';
const AGENCY_B = '507f1f77bcf86cd799439012';
const AGENCY_C = '507f1f77bcf86cd799439013';

const originals = {
  agencyFind: Agency.find,
  profileFind: AgencyProfile.find,
  profileCount: AgencyProfile.countDocuments,
  packageFind: AgencyPackage.find,
};

test.after(() => {
  (Agency as any).find = originals.agencyFind;
  (AgencyProfile as any).find = originals.profileFind;
  (AgencyProfile as any).countDocuments = originals.profileCount;
  (AgencyPackage as any).find = originals.packageFind;
});

function packageChain(result: any[]) {
  const chain = {
    select: () => chain,
    lean: async () => result,
  };
  return chain;
}

// Every page asks for the lowest published price; individual tests override it.
(AgencyPackage as any).find = () => packageChain([]);

function queryChain(result: any[]) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => result,
  };
  return chain;
}

function profileRow(overrides: Record<string, unknown> = {}): any {
  return {
    _id: '507f1f77bcf86cd799439021',
    agencyId: AGENCY_A,
    state: 'published',
    about: 'Small-group treks and slow road trips across the western ghats.',
    baseCity: 'Pune',
    specialties: ['Western ghats'],
    services: ['adventure'],
    languages: ['en'],
    publishedAt: new Date('2026-11-02T09:30:00.000Z'),
    verifiedAt: null,
    ...overrides,
  };
}

test('the listing filter always applies the public profile clauses', () => {
  const filter = buildDirectoryFilter({});
  assert.deepEqual(filter.$and, [
    { state: 'published', publishedAt: { $ne: null }, 'moderation.hiddenAt': null },
  ]);
});

test('free-text search covers profile prose plus name-matched agencies', () => {
  const withoutNames = buildDirectoryFilter({ q: 'hills' });
  const search = (withoutNames.$and as any[]).find((clause) => clause.$or)?.$or;
  assert.equal(search.length, 4);
  assert.ok(search[0].about instanceof RegExp);
  assert.equal(search[0].about.test('Hills & Horizons'), true);
  assert.equal(search[0].about.test('hills & horizons'), true);

  const withNames = buildDirectoryFilter({ q: 'hills' }, [AGENCY_A]);
  const branches = (withNames.$and as any[]).find((clause) => clause.$or)?.$or;
  assert.deepEqual(branches.at(-1), { agencyId: { $in: [AGENCY_A] } });
});

test('facet filters are exact, case-insensitive and never regex-injected', () => {
  const filter = buildDirectoryFilter({
    city: 'Pune',
    destination: 'Goa',
    specialty: 'Treks (western)',
    language: 'HI',
  });
  const [, city, destination, specialty, language] = filter.$and as any[];

  assert.equal(city.baseCity.test('PUNE'), true);
  assert.equal(city.baseCity.test('Pune City'), false);
  assert.equal(destination.destinations.test('goa'), true);
  // Parentheses stay literal: the pattern matches its own text only.
  assert.equal(specialty.specialties.test('Treks (western)'), true);
  assert.deepEqual(language, { languages: 'hi' });
});

test('the cursor is a publishedAt + id tie-break, and malformed input is a 400', () => {
  const row = profileRow({ publishedAt: new Date('2026-11-02T09:30:00.000Z') });
  const cursor = encodeDirectoryCursor(row);

  const decoded = decodeDirectoryCursor(cursor);
  assert.equal(decoded.id, '507f1f77bcf86cd799439021');
  assert.equal(decoded.publishedAt.toISOString(), '2026-11-02T09:30:00.000Z');

  const filter = buildDirectoryFilter({ cursor });
  const pageClause = (filter.$and as any[]).at(-1).$or;
  assert.deepEqual(pageClause[0], {
    publishedAt: { $lt: decoded.publishedAt },
  });
  assert.deepEqual(pageClause[1].publishedAt, decoded.publishedAt);
  assert.equal(String(pageClause[1]._id.$lt), '507f1f77bcf86cd799439021');

  for (const bad of [
    'not-a-cursor',
    Buffer.from(JSON.stringify({ p: '2026-11-02T09:30:00.000Z', i: 'nope' })).toString(
      'base64url'
    ),
    Buffer.from(
      JSON.stringify({ p: '2026-11-02T09:30:00.000Z', i: AGENCY_A, extra: true })
    ).toString('base64url'),
  ]) {
    assert.throws(
      () => decodeDirectoryCursor(bad),
      (error: any) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }
});

test('agency name search only looks at active tenants', async () => {
  let captured: any = null;
  (Agency as any).find = (filter: unknown) => {
    captured = filter;
    return queryChain([{ _id: AGENCY_A }]);
  };

  const ids = await agencyIdsMatchingName('hills');
  assert.equal(captured.status, 'active');
  assert.equal(captured.name.test('Hills & Horizons Travel'), true);
  assert.deepEqual(ids, [AGENCY_A]);
});

test('a page drops suspended tenants, keeps the tie-break cursor and reports total', async () => {
  const rows = [
    profileRow({
      _id: '507f1f77bcf86cd799439021',
      agencyId: AGENCY_A,
      publishedAt: new Date('2026-11-03T09:00:00.000Z'),
    }),
    profileRow({
      _id: '507f1f77bcf86cd799439022',
      agencyId: AGENCY_B,
      publishedAt: new Date('2026-11-02T09:00:00.000Z'),
    }),
    profileRow({
      _id: '507f1f77bcf86cd799439023',
      agencyId: AGENCY_C,
      publishedAt: new Date('2026-11-01T09:00:00.000Z'),
    }),
  ];

  (AgencyProfile as any).find = () => queryChain(rows);
  (AgencyProfile as any).countDocuments = async () => 3;
  // Agency B is suspended, so it is absent from the active map; C has no row.
  (Agency as any).find = () =>
    queryChain([
      {
        _id: AGENCY_A,
        slug: 'hills-and-horizons',
        name: 'Hills & Horizons Travel',
        branding: { logoUrl: `/api/agency/${AGENCY_A}/assets/${AGENCY_A}/content` },
      },
    ]);
  let priceFilter: any = null;
  (AgencyPackage as any).find = (filter: unknown) => {
    priceFilter = filter;
    return packageChain([
      { agencyId: AGENCY_A, fromPricePerPerson: 52000, currency: 'INR' },
      { agencyId: AGENCY_A, fromPricePerPerson: 42000, currency: 'INR' },
    ]);
  };

  const page = await listDirectoryAgencies({ limit: 2 });

  assert.equal(page.total, 3);
  assert.equal(page.hasMore, true);
  assert.equal(page.agencies.length, 1);
  assert.equal(page.agencies[0].slug, 'hills-and-horizons');
  assert.equal(page.agencies[0].logoUrl, '/api/agencies/hills-and-horizons/logo');
  assert.equal(page.agencies[0].fromPricePerPerson, 42000);

  assert.equal(priceFilter.state, 'published');
  assert.deepEqual(priceFilter.publishedAt, { $ne: null });
  assert.deepEqual(priceFilter.fromPricePerPerson, { $ne: null });
  assert.deepEqual(priceFilter.agencyId.$in, [AGENCY_A, AGENCY_B]);

  assert.ok(page.nextCursor);
  const cursor = decodeDirectoryCursor(page.nextCursor!);
  assert.equal(cursor.id, '507f1f77bcf86cd799439022');
  assert.equal(cursor.publishedAt.toISOString(), '2026-11-02T09:00:00.000Z');
});

test('a card without a published price says "on request"', async () => {
  (AgencyProfile as any).find = () => queryChain([profileRow()]);
  (AgencyProfile as any).countDocuments = async () => 1;
  (Agency as any).find = () =>
    queryChain([{ _id: AGENCY_A, slug: 'hills-and-horizons', name: 'Hills' }]);
  (AgencyPackage as any).find = () => packageChain([]);

  const page = await listDirectoryAgencies({ limit: 12 });
  assert.equal(page.agencies.length, 1);
  assert.equal(page.agencies[0].fromPricePerPerson, null);
  assert.equal(page.agencies[0].currency, 'INR');
});

test('the last page has no cursor and clamps the requested limit', async () => {
  (AgencyProfile as any).find = () => queryChain([]);
  (AgencyProfile as any).countDocuments = async () => 0;

  const page = await listDirectoryAgencies({ limit: 500 });
  assert.deepEqual(page, {
    agencies: [],
    nextCursor: null,
    hasMore: false,
    total: 0,
  });
});

test('facets count agencies, ignore case and labels language codes', () => {
  const facets = tallyDirectoryFacets([
    {
      baseCity: 'Pune',
      destinations: ['Goa', 'Kerala'],
      specialties: ['Treks'],
      languages: ['en', 'hi'],
    },
    {
      baseCity: 'pune',
      destinations: ['goa', 'Ladakh'],
      specialties: ['treks', 'Coast'],
      languages: ['hi', 'xx'],
    },
  ]);

  assert.deepEqual(facets.destinations, [
    { value: 'Goa', label: 'Goa', count: 2 },
    { value: 'Kerala', label: 'Kerala', count: 1 },
    { value: 'Ladakh', label: 'Ladakh', count: 1 },
  ]);
  assert.deepEqual(facets.cities, [{ value: 'Pune', label: 'Pune', count: 2 }]);
  assert.deepEqual(facets.specialties, [
    { value: 'Treks', label: 'Treks', count: 2 },
    { value: 'Coast', label: 'Coast', count: 1 },
  ]);
  assert.deepEqual(facets.languages, [
    { value: 'hi', label: 'Hindi', count: 2 },
    { value: 'en', label: 'English', count: 1 },
  ]);
});
