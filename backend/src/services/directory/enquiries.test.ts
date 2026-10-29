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
  normalizeEnquiryDates,
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

test('own history counts only the live proposals answering each enquiry', async () => {
  reset();
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
  quoteRows = [{ _id: QUOTE_ID, clientId: CLIENT_ID }];
  const expiresAt = new Date('2027-01-01T00:00:00.000Z');
  proposalLinkRows = [
    { _id: 'link-1', enquiryId: ENQUIRY_ID, quoteId: null, expiresAt, createdAt: new Date('2026-10-28T10:00:00.000Z') },
    { _id: 'link-2', enquiryId: ENQUIRY_ID, quoteId: null, expiresAt, createdAt: new Date('2026-10-28T12:00:00.000Z') },
    // Minted before the enquiry id was stamped: reachable through the quote's client.
    { _id: 'link-3', enquiryId: null, quoteId: QUOTE_ID, expiresAt, createdAt: new Date('2026-10-27T08:00:00.000Z') },
    { _id: 'revoked', enquiryId: ENQUIRY_ID, quoteId: null, expiresAt, revokedAt: new Date('2026-10-28T13:00:00.000Z'), createdAt: new Date('2026-10-28T13:00:00.000Z') },
    { _id: 'expired', enquiryId: ENQUIRY_ID, quoteId: null, expiresAt: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-09-01T00:00:00.000Z') },
  ];

  const page = await listOwnEnquiries({ userId: USER_ID });

  assert.deepEqual(page.enquiries[0].proposals, {
    count: 2,
    lastAt: '2026-10-28T12:00:00.000Z',
  });
  assert.deepEqual(page.enquiries[1].proposals, {
    count: 1,
    lastAt: '2026-10-27T08:00:00.000Z',
  });
});

test('own history reports no proposals when none answer an enquiry', async () => {
  reset();
  enquiryRows = [enquiryRow({ userId: USER_ID })];
  agencyFindResults = [
    [{ _id: AGENCY_ID, name: 'Himalaya Trails', slug: 'himalaya-trails' }],
  ];

  const page = await listOwnEnquiries({ userId: USER_ID });

  assert.deepEqual(page.enquiries[0].proposals, { count: 0, lastAt: null });
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
  assert.equal(first.enquiry.status, 'won');
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
  assert.equal(inbox.enquiries[0].client?.name, 'Asha Rao');
  assert.equal(inbox.enquiries[0].assignee?.name, 'Asha Planner');
  assert.equal(inbox.enquiries[0].lostReason, 'Internal note');

  const own = await listOwnEnquiries({ userId: USER_ID });
  assert.equal(own.enquiries[0].package?.tripId, undefined, 'consumers never see a trip id');
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

test('converting a lead tells the traveller it was won', async () => {
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
  assert.equal((seen.get(userChannel(USER_ID))![0] as any).status, 'won');
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
  proposalLinkRows = [
    {
      _id: '64c0000000000000000006f3',
      agencyId: AGENCY_ID,
      enquiryId: OTHER_ENQUIRY_ID,
      quoteId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-28T11:00:00.000Z'),
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
