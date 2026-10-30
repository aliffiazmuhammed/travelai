import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry, { AGENCY_ENQUIRY_LIMITS } from '../../models/AgencyEnquiry.js';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import {
  createAgencyEnquirySchema,
  updateAgencyEnquirySchema,
} from '../../schemas/agencyEnquiry.schema.js';
import {
  agencyChannel,
  openStream,
  resetForTests as resetBus,
  userChannel,
  type EnquiryEvent,
} from '../realtime/enquiryEvents.js';
import {
  buildAgencyEnquiryFields,
  convertAgencyEnquiry,
  decodeEnquiryCursor,
  encodeEnquiryCursor,
  getAgencyEnquiry,
  getAgencyEnquirySummary,
  getOwnEnquirySummary,
  listAgencyEnquiries,
  listOwnEnquiries,
  markEnquiryQuotedByProposal,
  markEnquiryWonByAcceptance,
  normalizeEnquiryDates,
  startTripFromEnquiry,
  submitAgencyEnquiry,
  updateAgencyEnquiry,
} from './enquiries.js';

/**
 * Milestone 9 D5/D6 — public enquiry intake, the two read models and the
 * agency's inbox actions.
 *
 * Model calls are stubbed (the same style as the D1/D4 suites), so these tests
 * pin the rules rather than the query syntax: consent is mandatory, dates are
 * future-or-flexible calendar days, the party is capped, a package must belong
 * to the same published agency, both inbox reads are tenant/owner scoped, a
 * claim race has exactly one winner, and conversion is idempotent.
 */

const AGENCY_ID = '64c000000000000000000601';
const OTHER_AGENCY_ID = '64c000000000000000000602';
const PROFILE_ID = '64c000000000000000000603';
const PACKAGE_ID = '64c000000000000000000604';
const FOREIGN_PACKAGE_ID = '64c000000000000000000605';
const ENQUIRY_ID = '64c000000000000000000606';
const OTHER_ENQUIRY_ID = '64c000000000000000000607';
const USER_ID = '64c000000000000000000608';
const ACTOR_ID = '64c000000000000000000609';
const ADMIN_ID = '64c00000000000000000060a';
const OTHER_MEMBER_ID = '64c00000000000000000060b';
const CLIENT_ID = '64c00000000000000000060c';
const TRIP_ID = '64c00000000000000000060d';
const QUOTE_ID = '64c00000000000000000060e';

let agencyRow: any = null;
let agencyProfileRow: any = null;
let packageRows: any[] = [];
let enquiryRows: any[] = [];
let createdEnquiries: any[] = [];
let clientRows: any[] = [];
let quoteRows: any[] = [];
let proposalLinkRows: any[] = [];
let userRows: any[] = [];
let memberIds: string[] = [];
let auditRows: any[] = [];
let savedTrips: any[] = [];
let lastEnquiryFilter: any = null;
let lastEnquiryCount: any = null;
let lastPackageFilter: any = null;
let agencyFindResults: any[][] = [];

const original = {
  agencyFindOne: Agency.findOne,
  agencyFind: Agency.find,
  profileFindOne: AgencyProfile.findOne,
  packageFindOne: AgencyPackage.findOne,
  packageFind: AgencyPackage.find,
  enquiryCreate: AgencyEnquiry.create,
  enquiryFind: AgencyEnquiry.find,
  enquiryFindOne: AgencyEnquiry.findOne,
  enquiryFindOneAndUpdate: AgencyEnquiry.findOneAndUpdate,
  enquiryCount: AgencyEnquiry.countDocuments,
  clientFind: AgencyClient.find,
  clientFindOne: AgencyClient.findOne,
  clientCreate: AgencyClient.create,
  clientUpdateOne: AgencyClient.updateOne,
  memberExists: AgencyMember.exists,
  userFind: User.find,
  tripExists: Trip.exists,
  tripSave: Trip.prototype.save,
  auditCreate: AgencyAudit.create,
  quoteFind: AgencyQuote.find,
  proposalLinkFind: AgencyProposalLink.find,
};

function thenable(value: any): any {
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return chain;
}

function queryChain(rows: any[]): any {
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => rows,
    then: (resolve: any) => resolve(rows),
  };
  return chain;
}

function leanResult(value: any): any {
  return { lean: async () => value };
}

/**
 * A tiny Mongo-shaped matcher: enough for the filters these services build
 * (`$and`/`$or`, equality, `$gte`/`$lt`, `$exists`). Keeping it generic means a
 * test failure points at the rule, not at a hand-written per-query stub.
 */
function matchesFilter(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter.$and)) {
    if (!filter.$and.every((part: any) => matchesFilter(row, part))) return false;
  }
  if (Array.isArray(filter.$or)) {
    if (!filter.$or.some((part: any) => matchesFilter(row, part))) return false;
  }
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') continue;
    const value = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      const cond = expected as any;
      if ('$gte' in cond && !(value && new Date(value) >= new Date(cond.$gte))) {
        return false;
      }
      if ('$lt' in cond && !(value && new Date(value) < new Date(cond.$lt))) {
        return false;
      }
      if ('$gt' in cond && !(value && new Date(value) > new Date(cond.$gt))) {
        return false;
      }
      if ('$in' in cond) {
        const allowed = (cond.$in ?? []).map((entry: any) => String(entry));
        if (!allowed.includes(String(value ?? ''))) return false;
      }
      if ('$elemMatch' in cond) {
        const entries = Array.isArray(value) ? value : [];
        if (!entries.some((entry: any) => matchesFilter(entry, cond.$elemMatch))) {
          return false;
        }
      }
      if ('$exists' in cond) {
        const exists = value !== undefined && value !== null;
        if (cond.$exists !== exists) return false;
      }
      continue;
    }
    if (String(value ?? '') !== String(expected ?? '')) return false;
  }
  return true;
}

(Agency as any).findOne = () => thenable(agencyRow);
(Agency as any).find = () => thenable(agencyFindResults.shift() ?? []);
(AgencyProfile as any).findOne = () => thenable(agencyProfileRow);
(AgencyPackage as any).findOne = (filter: any) => {
  lastPackageFilter = filter;
  return thenable(
    packageRows.find(
      (pkg) =>
        String(pkg._id) === String(filter._id) &&
        String(pkg.agencyId) === String(filter.agencyId)
    ) ?? null
  );
};
(AgencyPackage as any).find = () => queryChain(packageRows);
(AgencyEnquiry as any).create = async (doc: any) => {
  const row = {
    _id: ENQUIRY_ID,
    createdAt: new Date('2026-10-27T09:00:00.000Z'),
    updatedAt: new Date('2026-10-27T09:00:00.000Z'),
    ...doc,
  };
  createdEnquiries.push(row);
  return row;
};
(AgencyEnquiry as any).find = (filter: any) => {
  lastEnquiryFilter = filter;
  return queryChain(enquiryRows);
};
(AgencyEnquiry as any).findOne = (filter: any) =>
  thenable(enquiryRows.find((row) => matchesFilter(row, filter)) ?? null);
(AgencyEnquiry as any).findOneAndUpdate = (filter: any, update: any) => {
  const row = enquiryRows.find((entry) => matchesFilter(entry, filter));
  if (!row) return leanResult(null);
  if (update?.$set) Object.assign(row, update.$set);
  if (update?.$unset) {
    for (const key of Object.keys(update.$unset)) delete row[key];
  }
  row.updatedAt = new Date();
  return leanResult({ ...row });
};
(AgencyEnquiry as any).countDocuments = async (filter: any) => {
  lastEnquiryCount = filter;
  return enquiryRows.filter((row) => matchesFilter(row, filter)).length;
};
// D8 read receipts: the only update this suite needs is "mark the other side's
// messages read", so the stub understands that one array-filter shape.
(AgencyEnquiry as any).updateOne = async (filter: any, update: any) => {
  const row = enquiryRows.find((entry) => matchesFilter(entry, filter));
  if (!row) return { matchedCount: 0, modifiedCount: 0 };
  const field = Object.keys(update?.$set ?? {}).find((key) =>
    key.startsWith('messages.$[')
  );
  if (field && Array.isArray(row.messages)) {
    const path = field.slice('messages.$[m].'.length);
    const other = path === 'readByAgencyAt' ? 'traveller' : 'agency';
    for (const message of row.messages) {
      if (message.author === other && !message[path]) {
        message[path] = update.$set[field];
      }
    }
  }
  return { matchedCount: 1, modifiedCount: 1 };
};

(AgencyClient as any).find = (filter: any) =>
  queryChain(clientRows.filter((row) => matchesFilter(row, filter)));
(AgencyClient as any).findOne = async (filter: any) =>
  clientRows.find((row) => matchesFilter(row, filter)) ?? null;
(AgencyClient as any).create = async (doc: any) => {
  const row = {
    _id: CLIENT_ID,
    createdAt: new Date('2026-10-28T09:00:00.000Z'),
    updatedAt: new Date('2026-10-28T09:00:00.000Z'),
    ...doc,
  };
  clientRows.push(row);
  return row;
};
(AgencyClient as any).updateOne = async (filter: any, update: any) => {
  const row = clientRows.find((entry) => matchesFilter(entry, filter));
  if (!row) return { matchedCount: 0, modifiedCount: 0 };
  if (update?.$set) Object.assign(row, update.$set);
  return { matchedCount: 1, modifiedCount: 1 };
};
(AgencyClient as any).exists = async (filter: any) =>
  clientRows.some((row) => matchesFilter(row, filter))
    ? { _id: CLIENT_ID }
    : null;

// R5: the enquiry hand-off opens a trip. Saving it is all this suite needs to
// observe; the trip's own rules are pinned elsewhere.
(Trip as any).exists = async (filter: any) =>
  savedTrips.some((row) => matchesFilter(row, filter))
    ? { _id: filter?._id }
    : null;
(Trip.prototype as any).save = async function (this: any) {
  savedTrips.push(this);
  return this;
};

(AgencyMember as any).exists = async (filter: any) =>
  memberIds.includes(String(filter?.userId)) ? { _id: 'member' } : null;

(User as any).find = (filter: any) => {
  const ids = (filter?._id?.$in ?? []).map(String);
  return queryChain(userRows.filter((row) => ids.includes(String(row._id))));
};

(AgencyAudit as any).create = async (doc: any) => {
  auditRows.push(doc);
  return doc;
};

(AgencyQuote as any).find = (filter: any) =>
  queryChain(quoteRows.filter((row) => matchesFilter(row, filter)));
(AgencyProposalLink as any).find = (filter: any) =>
  queryChain(proposalLinkRows.filter((row) => matchesFilter(row, filter)));

function reset() {
  agencyRow = { _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails', status: 'active' };
  agencyProfileRow = { _id: PROFILE_ID, agencyId: AGENCY_ID, state: 'published' };
  packageRows = [
    { _id: PACKAGE_ID, agencyId: AGENCY_ID, title: 'Spiti Loop' },
    { _id: FOREIGN_PACKAGE_ID, agencyId: OTHER_AGENCY_ID, title: 'Someone else' },
  ];
  enquiryRows = [];
  createdEnquiries = [];
  clientRows = [];
  quoteRows = [];
  proposalLinkRows = [];
  userRows = [
    { _id: ACTOR_ID, name: 'Asha Planner', email: 'asha@agency.test' },
    { _id: ADMIN_ID, name: 'Owner One', email: 'owner@agency.test' },
    { _id: OTHER_MEMBER_ID, name: 'Ravi Planner', email: 'ravi@agency.test' },
  ];
  memberIds = [ACTOR_ID, ADMIN_ID, OTHER_MEMBER_ID];
  auditRows = [];
  savedTrips = [];
  lastEnquiryFilter = null;
  lastEnquiryCount = null;
  lastPackageFilter = null;
  agencyFindResults = [];
}

test.beforeEach(() => resetBus());

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Asha Rao',
    email: 'Asha@Example.COM',
    adults: 2,
    children: 1,
    startDate: '2027-01-10',
    endDate: '2027-01-18',
    message: 'We would like a slow week in the mountains with two easy hikes.',
    consent: true,
    ...overrides,
  };
}

function enquiryRow(overrides: Record<string, any> = {}) {
  return {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    packageId: null,
    userId: null,
    contact: { name: 'Asha Rao', email: 'asha@example.com' },
    party: { adults: 2, children: 1 },
    dates: { start: new Date('2027-01-10T00:00:00.000Z'), end: null, flexible: false },
    budgetBand: '25k_50k',
    message: 'We would like a slow week in the mountains with two easy hikes.',
    source: 'profile',
    status: 'new',
    consentAt: new Date('2026-10-27T09:00:00.000Z'),
    createdAt: new Date('2026-10-27T09:00:00.000Z'),
    updatedAt: new Date('2026-10-27T09:00:00.000Z'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Date rules                                                                */
/* -------------------------------------------------------------------------- */

test('dates are future-or-flexible calendar days', () => {
  const now = new Date('2026-10-28T12:00:00.000Z');

  const flexible = normalizeEnquiryDates({ flexible: true }, now);
  assert.equal(flexible.start, null);
  assert.equal(flexible.flexible, true);

  const dated = normalizeEnquiryDates(
    { startDate: '2026-10-28', endDate: '2026-11-02' },
    now
  );
  assert.equal(dated.start?.toISOString(), '2026-10-28T00:00:00.000Z');
  assert.equal(dated.end?.toISOString(), '2026-11-02T00:00:00.000Z');

  assert.throws(
    () => normalizeEnquiryDates({ flexible: false }, now),
    /Choose a start date/
  );
  assert.throws(
    () => normalizeEnquiryDates({ startDate: '2026-10-27' }, now),
    /future start date/
  );
  assert.throws(
    () => normalizeEnquiryDates({ startDate: '2026-10-28', endDate: '2026-10-01' }, now),
    /on or after/
  );
  assert.throws(
    () => normalizeEnquiryDates({ startDate: '2026-11-01', endDate: '2027-06-01' }, now),
    new RegExp(String(AGENCY_ENQUIRY_LIMITS.dateSpanDays))
  );
  assert.throws(
    () => normalizeEnquiryDates({ startDate: '2026-02-31' }, now),
    /valid start date/
  );
  assert.throws(
    () => normalizeEnquiryDates({ endDate: '2027-01-01' }, now),
    /start date along with/
  );
});

/* -------------------------------------------------------------------------- */
/*  Allow-list builder                                                        */
/* -------------------------------------------------------------------------- */

test('consent is mandatory and the contact block is normalised', () => {
  assert.throws(
    () => buildAgencyEnquiryFields(validBody({ consent: false })),
    /agree to share/
  );

  const fields = buildAgencyEnquiryFields(
    validBody({ phone: '  ', email: '  Asha@Example.COM ', budgetBand: '25k_50k' })
  );
  assert.equal(fields.contact.name, 'Asha Rao');
  assert.equal(fields.contact.email, 'asha@example.com');
  assert.equal('phone' in fields.contact, false, 'a blank phone is omitted, not stored empty');
  assert.deepEqual(fields.party, { adults: 2, children: 1 });
  assert.equal(fields.budgetBand, '25k_50k');
  assert.ok(fields.consentAt instanceof Date);
});

test('the party, message and budget caps are enforced server-side', () => {
  assert.throws(
    () => buildAgencyEnquiryFields(validBody({ adults: 0 })),
    /Adults/
  );
  assert.throws(
    () =>
      buildAgencyEnquiryFields(
        validBody({ adults: AGENCY_ENQUIRY_LIMITS.adults, children: 20 })
      ),
    new RegExp(String(AGENCY_ENQUIRY_LIMITS.party))
  );
  assert.throws(
    () => buildAgencyEnquiryFields(validBody({ message: 'too short' })),
    /at least 20 characters/
  );
  assert.throws(
    () =>
      buildAgencyEnquiryFields(
        validBody({ message: 'x'.repeat(AGENCY_ENQUIRY_LIMITS.message + 1) })
      ),
    new RegExp(String(AGENCY_ENQUIRY_LIMITS.message))
  );
  assert.throws(
    () => buildAgencyEnquiryFields(validBody({ budgetBand: 'luxury' })),
    /budget from the list/
  );
  assert.throws(
    () => buildAgencyEnquiryFields(validBody({ email: 'not-an-email' })),
    /email address/
  );
});

test('the request schema rejects unknown keys and a missing consent', () => {
  assert.throws(() => createAgencyEnquirySchema.parse(validBody({ admin: true })));
  assert.throws(() => createAgencyEnquirySchema.parse(validBody({ consent: false })));
  assert.throws(() =>
    createAgencyEnquirySchema.parse(validBody({ startDate: '10/01/2027' }))
  );
});

/* -------------------------------------------------------------------------- */
/*  Submission                                                                */
/* -------------------------------------------------------------------------- */

test('an enquiry writes one row attributed to the signed-in traveller', async () => {
  reset();

  const ack = await submitAgencyEnquiry({
    slug: 'Himalaya-Trails',
    body: validBody(),
    userId: USER_ID,
  });

  assert.equal(ack.id, ENQUIRY_ID);
  assert.equal(ack.status, 'new');
  assert.equal(createdEnquiries.length, 1);

  const row = createdEnquiries[0];
  assert.equal(String(row.agencyId), AGENCY_ID);
  assert.equal(String(row.userId), USER_ID);
  assert.equal(row.packageId, null);
  assert.equal(row.source, 'profile');
  assert.equal(row.status, 'new');
  assert.equal(row.contact.email, 'asha@example.com');
  assert.ok(row.consentAt instanceof Date);
  // Only a signed-in traveller can enquire, so no guest capability is minted.
  assert.equal(row.conversationTokenHash, undefined);
  assert.equal(row.conversationTokenExpiresAt, undefined);
});

test('a signed-in visitor is attributed, and a package enquiry keeps the card', async () => {
  reset();

  const ack = await submitAgencyEnquiry({
    slug: 'himalaya-trails',
    body: validBody({ packageId: PACKAGE_ID }),
    userId: USER_ID,
  });

  assert.equal(ack.id, ENQUIRY_ID);
  assert.equal(String(createdEnquiries[0].userId), USER_ID);
  assert.equal(String(createdEnquiries[0].packageId), PACKAGE_ID);
  assert.equal(createdEnquiries[0].source, 'package');
  assert.equal(lastPackageFilter.state, 'published');
  assert.deepEqual(lastPackageFilter.publishedAt, { $ne: null });
});

test('an unpublished agency, draft profile or foreign package is a 404', async () => {
  reset();
  agencyRow = null;
  await assert.rejects(
    () =>
      submitAgencyEnquiry({
        slug: 'himalaya-trails',
        body: validBody(),
        userId: USER_ID,
      }),
    /not accepting enquiries/
  );

  reset();
  agencyProfileRow = null;
  await assert.rejects(
    () =>
      submitAgencyEnquiry({
        slug: 'himalaya-trails',
        body: validBody(),
        userId: USER_ID,
      }),
    /not accepting enquiries/
  );

  reset();
  await assert.rejects(
    () =>
      submitAgencyEnquiry({
        slug: 'himalaya-trails',
        body: validBody({ packageId: FOREIGN_PACKAGE_ID }),
        userId: USER_ID,
      }),
    /no longer available/
  );
  assert.equal(createdEnquiries.length, 0, 'a rejected package writes nothing');
});

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

test('the tenant inbox is always scoped by agencyId and joins package titles', async () => {
  reset();
  enquiryRows = [
    enquiryRow({ packageId: PACKAGE_ID, source: 'package' }),
    enquiryRow({ _id: OTHER_ENQUIRY_ID }),
  ];

  const page = await listAgencyEnquiries({ agencyId: AGENCY_ID });

  assert.equal(page.enquiries.length, 2);
  assert.equal(page.enquiries[0].package?.title, 'Spiti Loop');
  assert.equal(page.enquiries[1].package, null);
  assert.deepEqual(lastEnquiryFilter, { $and: [{ agencyId: AGENCY_ID }] });
  assert.deepEqual(lastEnquiryCount, { $and: [{ agencyId: AGENCY_ID }] });
  // The inbox never carries the agency block; that belongs to the traveller view.
  assert.equal('agency' in page.enquiries[0], false);
});

test('a foreign or malformed enquiry id is a 404', async () => {
  reset();
  enquiryRows = [enquiryRow()];

  await assert.rejects(() => getAgencyEnquiry(OTHER_AGENCY_ID, ENQUIRY_ID), /not found/);
  await assert.rejects(() => getAgencyEnquiry(AGENCY_ID, 'not-an-id'), /not found/);

  const row = await getAgencyEnquiry(AGENCY_ID, ENQUIRY_ID);
  assert.equal(row.id, ENQUIRY_ID);
  assert.equal(row.contact.email, 'asha@example.com');
});

test('own history filters by the verified user and names each agency', async () => {
  reset();
  enquiryRows = [
    enquiryRow({ userId: USER_ID, packageId: PACKAGE_ID }),
    enquiryRow({ _id: OTHER_ENQUIRY_ID, userId: USER_ID, agencyId: OTHER_AGENCY_ID }),
  ];
  agencyFindResults = [
    [
      { _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails' },
      { _id: OTHER_AGENCY_ID, name: 'Coast & Co', slug: 'coast-and-co' },
    ],
  ];

  const page = await listOwnEnquiries({ userId: USER_ID });

  assert.equal(page.enquiries.length, 2);
  assert.equal(page.enquiries[0].agency?.slug, 'himalaya-trails');
  assert.equal(page.enquiries[1].agency?.name, 'Coast & Co');
  assert.deepEqual(lastEnquiryFilter, {
    $and: [{ userId: USER_ID }],
  });
  assert.deepEqual(lastEnquiryCount, { userId: USER_ID });
});

test('own history counts only the live proposals still waiting on an answer', async () => {
  reset();
  const OPEN_QUOTE = '64c000000000000000000b01';
  const DECLINED_QUOTE = '64c000000000000000000b02';
  const SENT_UNTIL = new Date('2027-01-01T00:00:00.000Z');

  enquiryRows = [
    enquiryRow({ userId: USER_ID, status: 'replied' }),
    enquiryRow({ _id: OTHER_ENQUIRY_ID, userId: USER_ID, agencyId: OTHER_AGENCY_ID, clientId: CLIENT_ID }),
  ];
  agencyFindResults = [
    [
      { _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails' },
      { _id: OTHER_AGENCY_ID, name: 'Coast & Co', slug: 'coast-and-co' },
    ],
  ];
  quoteRows = [
    {
      _id: OPEN_QUOTE,
      clientId: CLIENT_ID,
      status: 'sent',
      tripId: null,
      validUntil: SENT_UNTIL,
    },
    {
      _id: DECLINED_QUOTE,
      clientId: CLIENT_ID,
      status: 'sent',
      tripId: null,
      validUntil: SENT_UNTIL,
    },
  ];
  proposalLinkRows = [
    {
      _id: 'link-open',
      enquiryId: ENQUIRY_ID,
      quoteId: OPEN_QUOTE,
      expiresAt: SENT_UNTIL,
      createdAt: new Date('2026-10-28T10:00:00.000Z'),
    },
    // Live in the thread, but the traveller already said no: the row must not
    // keep reading "Proposal ready" just because the link has not expired.
    {
      _id: 'link-declined',
      enquiryId: ENQUIRY_ID,
      quoteId: DECLINED_QUOTE,
      expiresAt: SENT_UNTIL,
      createdAt: new Date('2026-10-28T12:00:00.000Z'),
      declinedAt: new Date('2026-10-28T12:30:00.000Z'),
    },
    // Minted before the enquiry id was stamped: reachable through the quote's client.
    {
      _id: 'link-3',
      enquiryId: null,
      quoteId: OPEN_QUOTE,
      expiresAt: SENT_UNTIL,
      createdAt: new Date('2026-10-27T08:00:00.000Z'),
    },
    {
      _id: 'revoked',
      enquiryId: ENQUIRY_ID,
      quoteId: OPEN_QUOTE,
      expiresAt: SENT_UNTIL,
      revokedAt: new Date('2026-10-28T13:00:00.000Z'),
      createdAt: new Date('2026-10-28T13:00:00.000Z'),
    },
    {
      _id: 'expired',
      enquiryId: ENQUIRY_ID,
      quoteId: OPEN_QUOTE,
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ];

  const page = await listOwnEnquiries({ userId: USER_ID });

  assert.deepEqual(page.enquiries[0].proposals, {
    count: 1,
    lastAt: '2026-10-28T10:00:00.000Z',
    lastDeclinedAt: null,
  });
  assert.deepEqual(page.enquiries[1].proposals, {
    count: 1,
    lastAt: '2026-10-27T08:00:00.000Z',
    lastDeclinedAt: null,
  });
});

test('an inbox row carries the latest share’s decline until a new version is sent', async () => {
  reset();
  enquiryRows = [enquiryRow({ clientId: CLIENT_ID })];
  const expiresAt = new Date('2027-01-01T00:00:00.000Z');
  proposalLinkRows = [
    {
      _id: 'link-old',
      enquiryId: ENQUIRY_ID,
      quoteId: QUOTE_ID,
      expiresAt,
      createdAt: new Date('2026-10-27T08:00:00.000Z'),
      declinedAt: new Date('2026-10-27T09:00:00.000Z'),
    },
    {
      _id: 'link-declined',
      enquiryId: ENQUIRY_ID,
      quoteId: QUOTE_ID,
      expiresAt,
      createdAt: new Date('2026-10-28T12:00:00.000Z'),
      declinedAt: new Date('2026-10-28T12:30:00.000Z'),
    },
  ];

  let inbox = await listAgencyEnquiries({ agencyId: AGENCY_ID });
  assert.equal(
    inbox.enquiries[0].proposals?.lastDeclinedAt,
    '2026-10-28T12:30:00.000Z'
  );

  // Sending a new version mints a newer open share: the badge clears itself.
  proposalLinkRows.push({
    _id: 'link-open',
    enquiryId: ENQUIRY_ID,
    quoteId: QUOTE_ID,
    expiresAt,
    createdAt: new Date('2026-10-29T08:00:00.000Z'),
  });
  inbox = await listAgencyEnquiries({ agencyId: AGENCY_ID });
  assert.equal(inbox.enquiries[0].proposals?.lastDeclinedAt, null);
  assert.equal(inbox.enquiries[0].proposals?.count, 3);
});

test('own history reports no proposals when none answer an enquiry', async () => {
  reset();
  enquiryRows = [enquiryRow({ userId: USER_ID })];
  agencyFindResults = [
    [{ _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails' }],
  ];

  const page = await listOwnEnquiries({ userId: USER_ID });

  assert.deepEqual(page.enquiries[0].proposals, {
    count: 0,
    lastAt: null,
    lastDeclinedAt: null,
  });
});

test('cursors round-trip and garbage is a friendly 400', () => {
  const cursor = encodeEnquiryCursor({
    _id: ENQUIRY_ID,
    createdAt: new Date('2026-10-27T09:00:00.000Z'),
  });
  const decoded = decodeEnquiryCursor(cursor);
  assert.equal(decoded.id, ENQUIRY_ID);
  assert.equal(decoded.createdAt.toISOString(), '2026-10-27T09:00:00.000Z');

  assert.throws(() => decodeEnquiryCursor('not-a-cursor'), /cursor is not valid/);
  assert.throws(
    () =>
      decodeEnquiryCursor(
        Buffer.from(JSON.stringify({ t: '2026-10-27T09:00:00.000Z', i: 'nope' })).toString(
          'base64url'
        )
      ),
    /cursor is not valid/
  );
});

test('the model stores only the allow-listed enquiry shape', () => {
  const paths = Object.keys(AgencyEnquiry.schema.paths);
  for (const field of [
    'agencyId',
    'packageId',
    'userId',
    'contact',
    'party',
    'dates',
    'budgetBand',
    'message',
    'source',
    'status',
    'consentAt',
  ]) {
    assert.ok(paths.includes(field), `${field} must exist on the enquiry model`);
  }
  assert.equal(AGENCY_ENQUIRY_LIMITS.party, 30);
});

/* -------------------------------------------------------------------------- */
/*  Inbox actions (D6)                                                        */
/* -------------------------------------------------------------------------- */

test('the update schema is strict and needs at least one change', () => {
  assert.throws(() => updateAgencyEnquirySchema.parse({}));
  assert.throws(() => updateAgencyEnquirySchema.parse({ status: 'new', admin: true }));
  assert.throws(() =>
    updateAgencyEnquirySchema.parse({
      lostReason: 'x'.repeat(AGENCY_ENQUIRY_LIMITS.lostReason + 1),
    })
  );
  assert.deepEqual(updateAgencyEnquirySchema.parse({ assigneeId: null }), {
    assigneeId: null,
  });
  assert.deepEqual(updateAgencyEnquirySchema.parse({ status: 'quoted' }), {
    status: 'quoted',
  });
});

test('a claim is atomic, and a second planner loses it with a 409', async () => {
  reset();
  enquiryRows = [enquiryRow()];

  const first = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    assigneeId: ACTOR_ID,
  });
  assert.equal(first.claimed, true);
  assert.equal(first.enquiry.assignedTo, ACTOR_ID);
  assert.equal(first.enquiry.assignee?.name, 'Asha Planner');
  assert.equal(auditRows.at(-1)?.action, 'enquiry.updated');

  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: OTHER_MEMBER_ID,
        actorRole: 'planner',
        assigneeId: OTHER_MEMBER_ID,
      }),
    (error: any) => error.statusCode === 409
  );

  // A planner can release their own lead, but not someone else's.
  const released = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    assigneeId: null,
  });
  assert.equal(released.enquiry.assignedTo, null);

  await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: OTHER_MEMBER_ID,
    actorRole: 'planner',
    assigneeId: OTHER_MEMBER_ID,
  });
  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'planner',
        assigneeId: null,
      }),
    (error: any) => error.statusCode === 403
  );
});

test('a claim or conversion answers with the thread the panel is showing', async () => {
  reset();
  enquiryRows = [
    enquiryRow({
      messages: [
        {
          _id: '64c0000000000000000006f1',
          author: 'traveller',
          authorName: 'Asha Rao',
          body: 'Hello there',
          createdAt: new Date('2026-10-28T09:00:00.000Z'),
          readByAgencyAt: null,
          readByTravellerAt: null,
        },
      ],
    }),
  ];

  const claimed = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    assigneeId: ACTOR_ID,
  });
  assert.deepEqual(
    claimed.enquiry.messages?.map((message) => message.body),
    ['Hello there'],
    'claiming must not blank the conversation the inbox is rendering'
  );

  const converted = await convertAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
  });
  assert.deepEqual(
    converted.enquiry.messages?.map((message) => message.body),
    ['Hello there']
  );
});

test('assigning a colleague is admin-only and must be a tenant member', async () => {
  reset();
  enquiryRows = [enquiryRow()];

  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'planner',
        assigneeId: OTHER_MEMBER_ID,
      }),
    (error: any) => error.statusCode === 403
  );

  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ADMIN_ID,
        actorRole: 'admin',
        assigneeId: USER_ID,
      }),
    /team member from this agency/
  );

  const assigned = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ADMIN_ID,
    actorRole: 'admin',
    assigneeId: OTHER_MEMBER_ID,
  });
  assert.equal(assigned.enquiry.assignedTo, OTHER_MEMBER_ID);
  assert.equal(assigned.enquiry.assignee?.name, 'Ravi Planner');
});

test('status rules require a lost reason and stamp reply/win times once', async () => {
  reset();
  enquiryRows = [enquiryRow()];

  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'planner',
        status: 'lost',
      }),
    /reason/
  );

  const lost = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'lost',
    lostReason: '  Budget was too high  ',
  });
  assert.equal(lost.enquiry.status, 'lost');
  assert.equal(lost.enquiry.lostReason, 'Budget was too high');

  const replied = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'replied',
  });
  assert.equal(replied.enquiry.lostReason, null, 'leaving lost clears the reason');
  assert.ok(replied.enquiry.repliedAt);
  const firstReply = replied.enquiry.repliedAt;

  const quoted = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'quoted',
  });
  assert.equal(quoted.enquiry.repliedAt, firstReply, 'the first reply time is kept');

  // R5: won means booked, and a booking belongs to a client.
  await assert.rejects(
    () =>
      updateAgencyEnquiry({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'planner',
        status: 'won',
      }),
    /client/
  );
  enquiryRows[0].clientId = CLIENT_ID;

  const won = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'won',
  });
  assert.ok(won.enquiry.convertedAt);

  const reopened = await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'quoted',
  });
  assert.equal(reopened.enquiry.convertedAt, null, 'only won counts as converted');
});

test('a hand-moved lead cannot skip the funnel or reopen a win as new', async () => {
  reset();
  enquiryRows = [enquiryRow({ status: 'new' })];
  const move = (status: string) =>
    updateAgencyEnquiry({
      agencyId: AGENCY_ID,
      enquiryId: ENQUIRY_ID,
      actorId: ACTOR_ID,
      actorRole: 'planner',
      status: status as any,
    });

  // R5: the funnel is a ladder, so a leader cannot rewind a replied lead.
  enquiryRows[0].status = 'replied';
  await assert.rejects(() => move('new'), (error: any) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /cannot move straight to new/);
    return true;
  });

  // Quoting a fresh lead is the normal first move: the proposal does it.
  enquiryRows[0].status = 'new';
  const quoted = await move('quoted');
  assert.equal(quoted.enquiry.status, 'quoted');

  // "Won" means booked, and a booking belongs to a client.
  await assert.rejects(() => move('won'), /Convert this lead to a client/);

  enquiryRows[0].status = 'lost';
  enquiryRows[0].lostReason = 'Dates did not work';
  await assert.rejects(() => move('won'), /Reopen this lead/);

  enquiryRows[0].status = 'won';
  enquiryRows[0].clientId = CLIENT_ID;
  await assert.rejects(() => move('new'), /cannot move straight to new/);

  // A no-op move is not a transition and must not throw.
  enquiryRows[0].status = 'new';
  const same = await move('new');
  assert.equal(same.enquiry.status, 'new');
});

test('sharing a proposal moves a fresh lead to quoted and leaves a closed one alone', async () => {
  reset();
  enquiryRows = [enquiryRow({ status: 'new', userId: USER_ID })];
  const seen = watchFrames(agencyChannel(AGENCY_ID), userChannel(USER_ID));

  await markEnquiryQuotedByProposal(ENQUIRY_ID);

  assert.equal(enquiryRows[0].status, 'quoted');
  assert.ok(enquiryRows[0].repliedAt, 'quoting counts as the first reply');
  for (const channel of [agencyChannel(AGENCY_ID), userChannel(USER_ID)]) {
    const frames = seen.get(channel)!;
    assert.deepEqual(
      frames.map((event) => event.type),
      ['enquiry:updated']
    );
    assert.equal((frames[0] as any).status, 'quoted');
  }

  // A won or lost lead keeps the status its agency chose.
  enquiryRows[0].status = 'won';
  await markEnquiryQuotedByProposal(ENQUIRY_ID);
  assert.equal(enquiryRows[0].status, 'won');
  assert.equal(seen.get(agencyChannel(AGENCY_ID))!.length, 1);
});

test('accepting a proposal wins the lead once, even after it was parked lost', async () => {
  reset();
  enquiryRows = [
    enquiryRow({
      status: 'lost',
      lostReason: 'Too pricey',
      lostAt: new Date('2026-10-28T09:00:00.000Z'),
      userId: USER_ID,
    }),
  ];
  const seen = watchFrames(agencyChannel(AGENCY_ID), userChannel(USER_ID));

  await markEnquiryWonByAcceptance(AGENCY_ID, ENQUIRY_ID);

  assert.equal(enquiryRows[0].status, 'won');
  assert.equal(enquiryRows[0].lostReason, undefined, 'a booking clears the parked reason');
  assert.ok(enquiryRows[0].convertedAt);
  assert.ok(enquiryRows[0].repliedAt);
  const frames = seen.get(userChannel(USER_ID))!;
  assert.deepEqual(
    frames.map((event) => event.type),
    ['enquiry:updated']
  );
  assert.equal((frames[0] as any).status, 'won');

  // Acceptance is idempotent: a second call cannot re-win or re-emit.
  await markEnquiryWonByAcceptance(AGENCY_ID, ENQUIRY_ID);
  assert.equal(seen.get(agencyChannel(AGENCY_ID))!.length, 1);
});

test('a proposal accepted for one tenant cannot close another tenant’s lead', async () => {
  reset();
  enquiryRows = [enquiryRow({ status: 'new', userId: USER_ID })];
  const seen = watchFrames(userChannel(USER_ID));

  await markEnquiryWonByAcceptance(OTHER_AGENCY_ID, ENQUIRY_ID);

  assert.equal(enquiryRows[0].status, 'new');
  assert.equal(seen.get(userChannel(USER_ID))!.length, 0);
});

test('conversion creates one tagged client and a second click reuses it', async () => {
  reset();
  enquiryRows = [enquiryRow()];

  const first = await convertAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
  });
  assert.equal(first.created, true);
  assert.equal(first.reused, false);
  assert.equal(first.client.name, 'Asha Rao');
  assert.equal(first.client.email, 'asha@example.com');
  assert.equal(
    first.enquiry.status,
    'new',
    'a client row is CRM bookkeeping, not a win'
  );
  assert.ok(first.enquiry.convertedAt);
  assert.equal(first.enquiry.client?.id, CLIENT_ID);
  assert.equal(String(clientRows[0].sourceEnquiryId), ENQUIRY_ID);
  assert.equal(clientRows[0].createdBy, ACTOR_ID);
  assert.equal(auditRows.at(-1)?.action, 'enquiry.converted');

  const second = await convertAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: OTHER_MEMBER_ID,
  });
  assert.equal(second.created, false);
  assert.equal(second.reused, true);
  assert.equal(clientRows.length, 1, 'a retry never adds a duplicate client');
});

test('conversion reuses an existing client by email and tags its source once', async () => {
  reset();
  enquiryRows = [enquiryRow()];
  clientRows = [
    {
      _id: CLIENT_ID,
      agencyId: AGENCY_ID,
      name: 'Asha Rao',
      email: 'asha@example.com',
      sourceEnquiryId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];

  const result = await convertAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
  });
  assert.equal(result.created, false);
  assert.equal(result.reused, true);
  assert.equal(clientRows.length, 1);
  assert.equal(String(clientRows[0].sourceEnquiryId), ENQUIRY_ID);
});

test('starting a trip turns the lead into a client and opens exactly one trip', async () => {
  reset();
  enquiryRows = [enquiryRow({ status: 'new', userId: USER_ID })];

  const started = await startTripFromEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  assert.equal(started.clientId, CLIENT_ID, 'a profile lead is converted on the way');
  assert.equal(clientRows.length, 1);
  assert.equal(savedTrips.length, 1);

  const trip: any = savedTrips[0];
  assert.equal(String(trip._id), started.tripId);
  assert.equal(trip.title, 'Trip for Asha Rao');
  assert.equal(String(trip.agencyId), AGENCY_ID);
  assert.equal(trip.workspace, 'agency');
  assert.equal(String(trip.clientId), CLIENT_ID);
  assert.equal(trip.startDate.toISOString(), '2027-01-10T00:00:00.000Z');

  assert.equal(String(enquiryRows[0].tripId), started.tripId, 'the lead remembers its trip');
  assert.equal(enquiryRows[0].status, 'new', 'opening a trip is not a win');
  assert.equal(started.enquiry.tripId, started.tripId);
  assert.deepEqual(
    auditRows.filter((row) => row.action === 'enquiry.trip_started').map((row) => row.metadata.tripId),
    [started.tripId]
  );

  // A double click hands back the same trip instead of opening a second one.
  const again = await startTripFromEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: OTHER_MEMBER_ID,
    role: 'planner',
  });
  assert.equal(again.tripId, started.tripId);
  assert.equal(savedTrips.length, 1);
  assert.equal(clientRows.length, 1);

  // The hand-off is tenant-scoped like every other enquiry write.
  await assert.rejects(
    () =>
      startTripFromEnquiry({
        agencyId: OTHER_AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        role: 'planner',
      }),
    (error: any) => error.statusCode === 404
  );
});

test('a lead whose trip was deleted by hand gets a new one', async () => {
  reset();
  enquiryRows = [
    enquiryRow({ status: 'replied', clientId: CLIENT_ID, tripId: TRIP_ID }),
  ];
  clientRows = [{ _id: CLIENT_ID, agencyId: AGENCY_ID, name: 'Asha Rao' }];

  const started = await startTripFromEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  assert.notEqual(started.tripId, TRIP_ID);
  assert.equal(savedTrips.length, 1);
  assert.equal(clientRows.length, 1, 'the existing client is reused, never duplicated');
});

test('a lead whose client was deleted re-resolves the client before quoting', async () => {
  reset();
  const DELETED_CLIENT_ID = '64c0000000000000000006aa';
  enquiryRows = [enquiryRow({ status: 'replied', clientId: DELETED_CLIENT_ID })];

  const started = await startTripFromEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  assert.equal(clientRows.length, 1, 'conversion creates a fresh client');
  assert.equal(started.clientId, CLIENT_ID);
  assert.equal(String(enquiryRows[0].clientId), CLIENT_ID);
  assert.equal(savedTrips.length, 1);
});

test('the summary counts a rolling week and rounds the conversion rate', async () => {
  reset();
  const now = new Date('2026-10-28T12:00:00.000Z');
  enquiryRows = [
    enquiryRow({ _id: ENQUIRY_ID, status: 'new', createdAt: new Date('2026-10-27T09:00:00.000Z') }),
    enquiryRow({
      _id: OTHER_ENQUIRY_ID,
      status: 'replied',
      createdAt: new Date('2026-10-26T09:00:00.000Z'),
      repliedAt: new Date('2026-10-26T10:00:00.000Z'),
      // The traveller wrote back after the reply: the lead needs a person again.
      messages: [
        {
          _id: '64c0000000000000000006f2',
          author: 'traveller',
          authorName: 'Asha Rao',
          body: 'Could we shift a day later?',
          createdAt: new Date('2026-10-28T11:00:00.000Z'),
          readByAgencyAt: null,
          readByTravellerAt: new Date('2026-10-28T09:00:00.000Z'),
        },
      ],
    }),
    enquiryRow({
      _id: '64c00000000000000000060e',
      status: 'quoted',
      createdAt: new Date('2026-10-25T09:00:00.000Z'),
    }),
    enquiryRow({
      _id: '64c00000000000000000060f',
      status: 'won',
      createdAt: new Date('2026-10-24T09:00:00.000Z'),
      repliedAt: new Date('2026-10-24T10:00:00.000Z'),
      convertedAt: new Date('2026-10-25T10:00:00.000Z'),
    }),
    enquiryRow({
      _id: '64c000000000000000000610',
      status: 'lost',
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      lostReason: 'Dates did not work',
    }),
  ];

  const summary = await getAgencyEnquirySummary(AGENCY_ID, now);

  assert.deepEqual(summary.byStatus, {
    new: 1,
    replied: 1,
    quoted: 1,
    won: 1,
    lost: 1,
  });
  assert.equal(summary.total, 5);
  assert.equal(summary.open, 3);
  assert.equal(summary.receivedThisWeek, 4);
  assert.equal(summary.repliedThisWeek, 2);
  assert.equal(summary.convertedThisWeek, 1);
  assert.equal(summary.conversionRate, 0.2);
  assert.equal(
    summary.needsAttention,
    2,
    'a fresh lead plus a traveller reply nobody has opened'
  );
  assert.equal(summary.weekStart, '2026-10-21T12:00:00.000Z');
});

test('the quote hand-off trip id and the internal fields are tenant-only', async () => {
  reset();
  packageRows[0].tripId = TRIP_ID;
  enquiryRows = [
    enquiryRow({
      userId: USER_ID,
      packageId: PACKAGE_ID,
      source: 'package',
      clientId: CLIENT_ID,
      tripId: TRIP_ID,
      assignedTo: ACTOR_ID,
      lostReason: 'Internal note',
      status: 'lost',
    }),
  ];
  clientRows = [{ _id: CLIENT_ID, agencyId: AGENCY_ID, name: 'Asha Rao' }];
  agencyFindResults = [
    [{ _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails' }],
  ];

  const inbox = await listAgencyEnquiries({ agencyId: AGENCY_ID });
  assert.equal(inbox.enquiries[0].package?.tripId, TRIP_ID);
  assert.equal(inbox.enquiries[0].tripId, TRIP_ID);
  assert.equal(inbox.enquiries[0].client?.name, 'Asha Rao');
  assert.equal(inbox.enquiries[0].assignee?.name, 'Asha Planner');
  assert.equal(inbox.enquiries[0].lostReason, 'Internal note');

  const own = await listOwnEnquiries({ userId: USER_ID });
  assert.equal(own.enquiries[0].package?.tripId, undefined, 'consumers never see a trip id');
  assert.equal(own.enquiries[0].tripId, null, 'the started trip is tenant-only');
  assert.equal(own.enquiries[0].client, null);
  assert.equal(own.enquiries[0].assignedTo, null);
  assert.equal(own.enquiries[0].assignee, null);
  assert.equal(own.enquiries[0].lostReason, null);
});

/* -------------------------------------------------------------------------- */
/*  Live frames and the personal summary (R1)                                 */
/* -------------------------------------------------------------------------- */

function watchFrames(...channels: string[]): Map<string, EnquiryEvent[]> {
  const seen = new Map<string, EnquiryEvent[]>();
  for (const channel of channels) {
    const events: EnquiryEvent[] = [];
    openStream(channel, { deliver: (event) => events.push(event), close: () => {} });
    seen.set(channel, events);
  }
  return seen;
}

test('submitting an enquiry notifies the tenant inbox', async () => {
  reset();
  const seen = watchFrames(agencyChannel(AGENCY_ID), userChannel(USER_ID));

  await submitAgencyEnquiry({
    slug: 'himalaya-trails',
    body: validBody(),
    userId: USER_ID,
  });

  const tenant = seen.get(agencyChannel(AGENCY_ID))!;
  assert.deepEqual(
    tenant.map((event) => event.type),
    ['enquiry:new']
  );
  assert.equal((tenant[0] as any).enquiryId, ENQUIRY_ID);
  assert.equal((tenant[0] as any).status, 'new');
  assert.equal(
    seen.get(userChannel(USER_ID))!.length,
    0,
    'the traveller already has the acknowledgement inline'
  );
});

test('a status change fans out to both sides without the internal assignee', async () => {
  reset();
  enquiryRows = [enquiryRow({ userId: USER_ID })];
  const seen = watchFrames(agencyChannel(AGENCY_ID), userChannel(USER_ID));

  await updateAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    status: 'lost',
    lostReason: 'Budget too small',
  });

  for (const channel of [agencyChannel(AGENCY_ID), userChannel(USER_ID)]) {
    const frames = seen.get(channel)!;
    assert.deepEqual(
      frames.map((event) => event.type),
      ['enquiry:updated']
    );
    assert.equal((frames[0] as any).status, 'lost');
    assert.deepEqual(Object.keys(frames[0]).sort(), ['at', 'enquiryId', 'status', 'type']);
  }
});

test('converting a lead resyncs the traveller without moving the funnel', async () => {
  reset();
  enquiryRows = [enquiryRow({ userId: USER_ID })];
  const seen = watchFrames(userChannel(USER_ID));

  await convertAgencyEnquiry({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
  });

  assert.deepEqual(
    seen.get(userChannel(USER_ID))!.map((event) => event.type),
    ['enquiry:updated']
  );
  assert.equal((seen.get(userChannel(USER_ID))![0] as any).status, 'new');
});

test('opening a lead in the inbox sends a read receipt only once', async () => {
  reset();
  enquiryRows = [
    enquiryRow({
      userId: USER_ID,
      messages: [
        {
          _id: '64c0000000000000000006f1',
          author: 'traveller',
          authorName: 'Asha Rao',
          body: 'Hello there',
          createdAt: new Date('2026-10-28T09:00:00.000Z'),
          readByAgencyAt: null,
          readByTravellerAt: null,
        },
      ],
    }),
  ];
  const seen = watchFrames(userChannel(USER_ID));

  await getAgencyEnquiry(AGENCY_ID, ENQUIRY_ID);
  await getAgencyEnquiry(AGENCY_ID, ENQUIRY_ID);

  assert.deepEqual(
    seen.get(userChannel(USER_ID))!.map((event) => event.type),
    ['enquiry:read']
  );
});

test('the personal summary counts unread replies and live proposals', async () => {
  reset();
  enquiryRows = [
    enquiryRow({
      userId: USER_ID,
      messages: [
        {
          _id: '64c0000000000000000006f2',
          author: 'agency',
          authorName: 'Ravi',
          body: 'Here is a plan',
          createdAt: new Date('2026-10-28T10:00:00.000Z'),
          readByAgencyAt: new Date('2026-10-28T10:00:00.000Z'),
          readByTravellerAt: null,
        },
      ],
      lastMessageAt: new Date('2026-10-28T10:00:00.000Z'),
      lastMessageBy: 'agency',
    }),
    enquiryRow({
      _id: OTHER_ENQUIRY_ID,
      userId: USER_ID,
      clientId: CLIENT_ID,
      messages: [],
    }),
  ];
  // The badge counts only what the traveller can still answer (R7): the pinned
  // quote decides, and one accepted version settles its whole trip.
  const TRIP_OPEN = '64c000000000000000000801';
  const TRIP_ACCEPTED = '64c000000000000000000802';
  const TRIP_LAPSED = '64c000000000000000000803';
  const TRIP_CANCELLED = '64c000000000000000000804';
  const TRIP_SETTLED = '64c000000000000000000805';
  const LIVE_QUOTE = '64c000000000000000000701';
  const ANSWERED_QUOTE = '64c000000000000000000702';
  const AGENCY_ACCEPTED_QUOTE = '64c000000000000000000703';
  const LAPSED_QUOTE = '64c000000000000000000704';
  const CANCELLED_QUOTE = '64c000000000000000000705';
  const OPEN_SIBLING_QUOTE = '64c000000000000000000706';
  const ACCEPTED_SIBLING_QUOTE = '64c000000000000000000707';
  quoteRows = [
    {
      _id: LIVE_QUOTE,
      tripId: TRIP_OPEN,
      status: 'sent',
      validUntil: new Date(Date.now() + 86_400_000),
    },
    {
      _id: ANSWERED_QUOTE,
      tripId: TRIP_OPEN,
      status: 'sent',
      validUntil: new Date(Date.now() + 86_400_000),
    },
    {
      _id: AGENCY_ACCEPTED_QUOTE,
      tripId: TRIP_ACCEPTED,
      status: 'accepted',
      validUntil: new Date(Date.now() + 86_400_000),
    },
    {
      _id: LAPSED_QUOTE,
      tripId: TRIP_LAPSED,
      status: 'sent',
      validUntil: new Date('2020-01-01T00:00:00.000Z'),
    },
    {
      _id: CANCELLED_QUOTE,
      tripId: TRIP_CANCELLED,
      status: 'cancelled',
      validUntil: new Date(Date.now() + 86_400_000),
    },
    {
      _id: OPEN_SIBLING_QUOTE,
      tripId: TRIP_SETTLED,
      status: 'sent',
      validUntil: new Date(Date.now() + 86_400_000),
    },
    {
      _id: ACCEPTED_SIBLING_QUOTE,
      tripId: TRIP_SETTLED,
      status: 'accepted',
      validUntil: new Date(Date.now() + 86_400_000),
    },
  ];
  proposalLinkRows = [
    {
      _id: '64c0000000000000000006f3',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: LIVE_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T11:00:00.000Z'),
    },
    // Answered in-app (R6): live in the thread, but not work waiting for the
    // traveller, so the nav badge must not count them.
    {
      _id: '64c0000000000000000006f4',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: ANSWERED_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: new Date('2026-10-28T12:00:00.000Z'),
      createdAt: new Date('2026-10-28T11:10:00.000Z'),
    },
    {
      _id: '64c0000000000000000006f5',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: ANSWERED_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      declinedAt: new Date('2026-10-28T12:10:00.000Z'),
      createdAt: new Date('2026-10-28T11:20:00.000Z'),
    },
    // R7: the agency accepted from its own quote screen, which never stamps the
    // link; the quote itself is the truth.
    {
      _id: '64c0000000000000000006f6',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: AGENCY_ACCEPTED_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T11:30:00.000Z'),
    },
    // R7: a lapsed or withdrawn quote leaves its link looking live.
    {
      _id: '64c0000000000000000006f7',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: LAPSED_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T11:40:00.000Z'),
    },
    {
      _id: '64c0000000000000000006f8',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: CANCELLED_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T11:50:00.000Z'),
    },
    // R7: the version itself is open, but the same trip is already accepted
    // somewhere else, so accepting this one would be refused.
    {
      _id: '64c0000000000000000006f9',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: OPEN_SIBLING_QUOTE,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T12:00:00.000Z'),
    },
  ];

  const summary = await getOwnEnquirySummary(USER_ID);

  assert.equal(summary.unread, 1);
  assert.equal(summary.liveProposals, 1);
  assert.equal(summary.lastMessageAt, '2026-10-28T10:00:00.000Z');
  assert.deepEqual(lastEnquiryFilter, { userId: USER_ID }, 'the summary stays account-scoped');
});

test.after(() => {
  (Agency as any).findOne = original.agencyFindOne;
  (Agency as any).find = original.agencyFind;
  (AgencyProfile as any).findOne = original.profileFindOne;
  (AgencyPackage as any).findOne = original.packageFindOne;
  (AgencyPackage as any).find = original.packageFind;
  (AgencyEnquiry as any).create = original.enquiryCreate;
  (AgencyEnquiry as any).find = original.enquiryFind;
  (AgencyEnquiry as any).findOne = original.enquiryFindOne;
  (AgencyEnquiry as any).findOneAndUpdate = original.enquiryFindOneAndUpdate;
  (AgencyEnquiry as any).countDocuments = original.enquiryCount;
  (AgencyClient as any).find = original.clientFind;
  (AgencyClient as any).findOne = original.clientFindOne;
  (AgencyClient as any).create = original.clientCreate;
  (AgencyClient as any).updateOne = original.clientUpdateOne;
  (AgencyMember as any).exists = original.memberExists;
  (User as any).find = original.userFind;
  (AgencyAudit as any).create = original.auditCreate;
  (AgencyQuote as any).find = original.quoteFind;
  (AgencyProposalLink as any).find = original.proposalLinkFind;
});
