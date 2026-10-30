import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import {
  buildPublicEventFilter,
  decodePublicEventCursor,
  encodePublicEventCursor,
  listPublicEvents,
  loadPublicEvent,
  loadPublicEventCover,
  publicEventDetailClauses,
  publicEventListingClauses,
} from './publicEvents.js';

/**
 * Milestone 10 E1 — which events the public may see, and through what.
 *
 * Model calls are stubbed, so these tests pin the two eligibility layers
 * (the row's window and the host's public profile), the `(startDate, _id)`
 * cursor, the grouped confirmed-spot count, and that a closed event keeps a
 * readable page while leaving the listing.
 */

const AGENCY_A = '64e000000000000000000c01';
const EVENT_A = '64e000000000000000000a01';
const EVENT_B = '64e000000000000000000a02';

let eventFilter: any = null;
let lastSort: any = null;
let lastLimit: number | null = null;
let currentRows: any[] = [];
let currentTotal = 0;
let findOneResult: any = null;
let eligibleProfiles: any[] = [];
let hostProfiles: any[] = [];
let activeAgencies: any[] = [];
let hostAgencies: any[] = [];
let hostProfile: any = null;
let countRows: any[] = [];
let slugAgency: any = null;
let slugFilter: any = null;

const originals = {
  eventFind: AgencyEvent.find,
  eventFindOne: AgencyEvent.findOne,
  eventCount: AgencyEvent.countDocuments,
  interestAggregate: AgencyEventInterest.aggregate,
  agencyFind: Agency.find,
  agencyFindOne: Agency.findOne,
  profileFind: AgencyProfile.find,
  profileFindOne: AgencyProfile.findOne,
};

function chain(result: any) {
  const builder: any = {
    select: () => builder,
    sort: (value: any) => {
      lastSort = value;
      return builder;
    },
    limit: (value: number) => {
      lastLimit = value;
      return builder;
    },
    lean: async () => result,
  };
  return builder;
}

(AgencyEvent as any).find = (filter: any) => {
  eventFilter = filter;
  return chain(currentRows);
};
(AgencyEvent as any).findOne = (filter: any) => {
  eventFilter = filter;
  return chain(findOneResult);
};
(AgencyEvent as any).countDocuments = async () => currentTotal;

(AgencyEventInterest as any).aggregate = async () => countRows;

(Agency as any).find = (filter: any) => chain(filter?._id ? hostAgencies : activeAgencies);
(Agency as any).findOne = (filter: any) => {
  if (filter?.slug === undefined) return chain(hostAgencies[0] ?? null);
  slugFilter = filter;
  return chain(slugAgency);
};

(AgencyProfile as any).find = (filter: any) =>
  chain(filter?.agencyId ? hostProfiles : eligibleProfiles);
(AgencyProfile as any).findOne = () => chain(hostProfile);

test.after(() => {
  (AgencyEvent as any).find = originals.eventFind;
  (AgencyEvent as any).findOne = originals.eventFindOne;
  (AgencyEvent as any).countDocuments = originals.eventCount;
  (AgencyEventInterest as any).aggregate = originals.interestAggregate;
  (Agency as any).find = originals.agencyFind;
  (Agency as any).findOne = originals.agencyFindOne;
  (AgencyProfile as any).find = originals.profileFind;
  (AgencyProfile as any).findOne = originals.profileFindOne;
});

const AGENCY_DOC = {
  _id: AGENCY_A,
  slug: 'wildroot',
  name: 'Wildroot Trails',
  branding: { logoUrl: `/api/agency/${AGENCY_A}/assets/64e000000000000000000d01/content` },
};

function event(overrides: Record<string, unknown> = {}): any {
  return {
    _id: EVENT_A,
    agencyId: AGENCY_A,
    title: 'Monsoon nature camp',
    summary: 'Forest walks and river dips.',
    kind: 'camp',
    destination: 'Coorg',
    venue: 'Kaveri riverside',
    startDate: new Date('2027-06-12T00:00:00.000Z'),
    endDate: new Date('2027-06-15T00:00:00.000Z'),
    capacity: 20,
    pricePerPerson: 8500,
    currency: 'INR',
    coverAssetId: null,
    highlights: [],
    state: 'published',
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    closedAt: null,
    ...overrides,
  };
}

function reset(): void {
  eventFilter = null;
  lastSort = null;
  lastLimit = null;
  currentRows = [];
  currentTotal = 0;
  findOneResult = event();
  eligibleProfiles = [{ agencyId: AGENCY_A }];
  hostProfiles = [{ agencyId: AGENCY_A, verifiedAt: new Date('2026-02-01T00:00:00.000Z') }];
  activeAgencies = [{ _id: AGENCY_A }];
  hostAgencies = [AGENCY_DOC];
  hostProfile = { verifiedAt: new Date('2026-02-01T00:00:00.000Z') };
  countRows = [];
  slugAgency = { _id: AGENCY_A };
  slugFilter = null;
}

test('the listing filter requires a live window and an eligible host', () => {
  const clauses = (buildPublicEventFilter({}, [AGENCY_A]) as any).$and;

  assert.deepEqual(clauses[0], { state: 'published' });
  assert.deepEqual(clauses[1], { publishedAt: { $ne: null } });
  assert.deepEqual(clauses[2], { 'moderation.hiddenAt': null });
  assert.deepEqual(clauses[3], { closedAt: null }, 'a closed event leaves the listing');
  assert.ok(clauses[4].endDate.$gte instanceof Date, 'a finished event leaves the listing');
  assert.equal(clauses[4].endDate.$gte.getUTCHours(), 0);
  assert.deepEqual(clauses[5], { agencyId: { $in: [AGENCY_A] } });
  assert.equal(clauses.length, 6, 'no cursor means no extra clause');
});

test('the event page keeps publication rules but not the window', () => {
  assert.deepEqual(publicEventDetailClauses(), [
    { state: 'published' },
    { publishedAt: { $ne: null } },
    { 'moderation.hiddenAt': null },
  ]);
  assert.deepEqual(publicEventListingClauses()[3], { closedAt: null });
});

test('the cursor continues after the same start date', () => {
  const cursor = encodePublicEventCursor({
    _id: EVENT_B,
    startDate: new Date('2027-06-12T00:00:00.000Z'),
  });
  const decoded = decodePublicEventCursor(cursor);
  assert.equal(decoded.id, EVENT_B);
  assert.equal(decoded.startDate.toISOString(), '2027-06-12T00:00:00.000Z');

  const clauses = (buildPublicEventFilter({ cursor }, [AGENCY_A]) as any).$and;
  const continuation = clauses[clauses.length - 1];
  assert.equal(
    continuation.$or[0].startDate.$gt.toISOString(),
    '2027-06-12T00:00:00.000Z'
  );
  assert.ok(continuation.$or[1]._id.$gt instanceof mongoose.Types.ObjectId);
  assert.equal(continuation.$or[1].startDate.toISOString(), '2027-06-12T00:00:00.000Z');

  assert.throws(() => decodePublicEventCursor('not-a-cursor'), /page cursor/i);
});

test('the listing projects rows, counts confirmed spots and pages by start date', async () => {
  reset();
  currentRows = [event()];
  currentTotal = 1;
  countRows = [{ _id: EVENT_A, count: 3 }];

  const page = await listPublicEvents({ limit: 12 });

  assert.equal(page.total, 1);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].title, 'Monsoon nature camp');
  assert.equal(page.events[0].spotsLeft, 17);
  assert.equal(page.events[0].agency.name, 'Wildroot Trails');
  assert.equal(page.events[0].agency.verified, true);
  assert.deepEqual(lastSort, { startDate: 1, _id: 1 });
  assert.equal(lastLimit, 13, 'one extra row reveals whether another page exists');
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(
    (eventFilter as any).$and.slice(0, 5),
    publicEventListingClauses()
  );
});

test('a full page sets hasMore and a cursor on the last returned row', async () => {
  reset();
  currentRows = Array.from({ length: 13 }, (_, index) =>
    event({
      _id: new mongoose.Types.ObjectId().toString(),
      startDate: new Date(Date.UTC(2027, 5, 12 + index)),
      endDate: new Date(Date.UTC(2027, 5, 14 + index)),
    })
  );
  currentTotal = 13;

  const page = await listPublicEvents({ limit: 12 });

  assert.equal(page.events.length, 12);
  assert.equal(page.hasMore, true);
  assert.equal(typeof page.nextCursor, 'string');
  const decoded = decodePublicEventCursor(page.nextCursor as string);
  assert.equal(decoded.id, String(currentRows[11]._id));
});

test('the listing can be narrowed to one agency slug', async () => {
  reset();
  currentRows = [event()];
  currentTotal = 1;

  const page = await listPublicEvents({ agency: ' Wildroot ', limit: 6 });

  assert.equal(page.total, 1);
  assert.deepEqual(slugFilter, { slug: 'wildroot', status: 'active' });
  assert.deepEqual(
    (eventFilter as any).$and[5],
    { agencyId: { $in: [AGENCY_A] } },
    'the scope narrows the eligible set instead of bypassing it'
  );
});

test('an ineligible agency slug answers an empty page without reading events', async () => {
  reset();
  currentRows = [event()];
  currentTotal = 1;
  slugAgency = null;

  const missing = await listPublicEvents({ agency: 'nobody' });

  assert.deepEqual(missing, { events: [], nextCursor: null, hasMore: false, total: 0 });
  assert.equal(eventFilter, null, 'the event query is never reached');

  reset();
  currentRows = [event()];
  currentTotal = 1;
  slugAgency = { _id: '64e000000000000000000c99' };

  const unlisted = await listPublicEvents({ agency: 'draft-agency' });

  assert.deepEqual(unlisted, { events: [], nextCursor: null, hasMore: false, total: 0 });
  assert.equal(eventFilter, null, 'an active agency outside the eligible set shows nothing');
});

test('rows whose host is no longer public are dropped from the page', async () => {
  reset();
  currentRows = [event()];
  currentTotal = 1;
  hostAgencies = [];
  hostProfiles = [];

  const page = await listPublicEvents();

  assert.deepEqual(page.events, []);
  assert.equal(page.total, 1, 'total counts the filtered set before host enrichment');
});

test('a closed event keeps a readable page but takes no interest', async () => {
  reset();
  findOneResult = event({ closedAt: new Date('2026-10-20T00:00:00.000Z') });

  const detail = await loadPublicEvent(EVENT_A);

  assert.equal(detail.closed, true);
  assert.equal(detail.acceptingInterest, false);
  assert.equal(detail.agency.slug, 'wildroot');
});

test('an unknown, unpublished or host-less event answers 404', async () => {
  reset();
  await assert.rejects(loadPublicEvent('not-an-id'), /Event not found/i);

  reset();
  findOneResult = null;
  await assert.rejects(loadPublicEvent(EVENT_A), /Event not found/i);

  reset();
  hostProfile = null;
  await assert.rejects(loadPublicEvent(EVENT_A), /Event not found/i);
});

test('cover bytes are only offered for an eligible event with a cover', async () => {
  reset();
  findOneResult = event({ coverAssetId: null });
  assert.equal(await loadPublicEventCover(EVENT_A), null);

  reset();
  findOneResult = null;
  assert.equal(await loadPublicEventCover(EVENT_A), null);

  reset();
  hostProfile = null;
  findOneResult = event({ coverAssetId: '64e000000000000000000b01' });
  assert.equal(await loadPublicEventCover(EVENT_A), null);
});
