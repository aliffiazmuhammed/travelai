import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import {
  acceptAgencyProposalForUser,
  declineAgencyProposalForUser,
} from './proposals.js';
import {
  agencyChannel,
  openStream,
  resetForTests as resetBus,
  userChannel,
  type EnquiryEvent,
} from '../realtime/enquiryEvents.js';

/**
 * R6: the traveller's two in-app answers.
 *
 * The acceptance core is shared with the token page, so these tests pin the
 * parts the personal surface adds — ownership, the declined-blocks-accept rule
 * and the fact that a decline touches only the link — with the model calls
 * stubbed. The real lifecycle runs in the browser smoke.
 */

const AGENCY_ID = '64d000000000000000000b01';
const TRIP_ID = '64d000000000000000000b02';
const EXPORT_ID = '64d000000000000000000b03';
const QUOTE_ID = '64d000000000000000000b04';
const ENQUIRY_ID = '64d000000000000000000b05';
const USER_ID = '64d000000000000000000b06';
const LINK_ID = '64d000000000000000000b07';
const OTHER_USER_ID = '64d000000000000000000b08';
const OTHER_TRIP_ID = '64d000000000000000000b09';
const OTHER_QUOTE_ID = '64d000000000000000000b0a';

let linkRow: any = null;
let quoteRow: any = null;
let enquiryRow: any = null;
/** Accepted quotes elsewhere, for the duplicate-trip guard (R7). */
let siblingQuotes: any[] = [];
let audits: any[] = [];
let linkUpdates: any[] = [];

function chain(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    sort: () => wrapped,
    lean: async () => value,
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  return wrapped;
}

const original = {
  agencyFindById: Agency.findById,
  tripFindOne: Trip.findOne,
  quoteFindOne: AgencyQuote.findOne,
  quoteFindOneAndUpdate: AgencyQuote.findOneAndUpdate,
  exportFindOne: AgencyExport.findOne,
  linkFindById: AgencyProposalLink.findById,
  linkFindOneAndUpdate: AgencyProposalLink.findOneAndUpdate,
  linkUpdateOne: AgencyProposalLink.updateOne,
  enquiryFind: AgencyEnquiry.find,
  enquiryFindOne: AgencyEnquiry.findOne,
  enquiryFindOneAndUpdate: AgencyEnquiry.findOneAndUpdate,
  clientFind: AgencyClient.find,
  auditCreate: AgencyAudit.create,
};

(Agency as any).findById = async () => ({
  _id: AGENCY_ID,
  name: 'Test Agency',
  status: 'active',
});
(Trip as any).findOne = async () => ({
  _id: TRIP_ID,
  title: 'Kerala backwaters',
  tripDetails: { trip_title: 'Kerala backwaters' },
});
(AgencyExport as any).findOne = async () => ({
  _id: EXPORT_ID,
  status: 'ready',
  outputKey: `exports/${EXPORT_ID}.pdf`,
  templateId: null,
  templateName: 'Classic',
  quoteNumber: 'QT-2026-0100',
  quoteVersion: 1,
});

(AgencyQuote as any).findOne = (filter: any) => {
  // R7's duplicate-trip guard excludes the link's own quote and matches on
  // agency, trip and the accepted status.
  if (filter?._id?.$ne !== undefined) {
    const match = siblingQuotes.find(
      (row) =>
        (filter.agencyId === undefined ||
          String(row.agencyId) === String(filter.agencyId)) &&
        (filter.tripId === undefined ||
          String(row.tripId) === String(filter.tripId)) &&
        (filter.status === undefined || row.status === filter.status) &&
        String(row._id) !== String(filter._id.$ne)
    );
    return chain(match ?? null);
  }
  if (!quoteRow) return chain(null);
  if (String(filter?._id) !== String(QUOTE_ID)) return chain(null);
  // The ownership read selects only clientId; loadPinnedRows takes the row.
  return chain(quoteRow);
};
// Only the acceptance CAS matches; reconcileQuoteExpiry never runs while the
// quote is valid.
(AgencyQuote as any).findOneAndUpdate = (filter: any, update: any) => {
  const matches =
    quoteRow &&
    String(quoteRow._id) === String(filter._id) &&
    (filter.status === undefined || filter.status === quoteRow.status);
  if (!matches) return chain(null);
  if (update?.$set) Object.assign(quoteRow, update.$set);
  return chain({ ...quoteRow });
};

(AgencyProposalLink as any).findById = (id: any) =>
  linkRow && String(linkRow._id) === String(id) ? chain(linkRow) : null;
(AgencyProposalLink as any).findOneAndUpdate = (filter: any, update: any) => {
  const matches =
    linkRow &&
    String(linkRow._id) === String(filter._id) &&
    (filter.acceptedAt !== null || linkRow.acceptedAt == null) &&
    (filter.declinedAt !== null || linkRow.declinedAt == null);
  if (!matches) return chain(null);
  if (update?.$set) Object.assign(linkRow, update.$set);
  return chain({ ...linkRow });
};
(AgencyProposalLink as any).updateOne = async (filter: any, update: any) => {
  linkUpdates.push({ filter, update });
  if (update?.$set) Object.assign(linkRow, update.$set);
  return { acknowledged: true };
};

(AgencyEnquiry as any).find = (filter: any) =>
  chain(
    filter?.userId === USER_ID
      ? [{ _id: ENQUIRY_ID, clientId: null }]
      : []
  );
(AgencyEnquiry as any).findOne = (filter: any) =>
  chain(
    enquiryRow && String(enquiryRow._id) === String(filter._id)
      ? enquiryRow
      : null
  );
(AgencyEnquiry as any).findOneAndUpdate = (filter: any, update: any) => {
  const matches =
    enquiryRow &&
    String(enquiryRow._id) === String(filter._id) &&
    (filter.status === undefined || filter.status === enquiryRow.status);
  if (!matches) return chain(null);
  if (update?.$set) Object.assign(enquiryRow, update.$set);
  if (update?.$unset) {
    for (const key of Object.keys(update.$unset)) delete enquiryRow[key];
  }
  return chain({ ...enquiryRow });
};

(AgencyClient as any).find = () => chain([]);
(AgencyAudit as any).create = async (doc: any) => {
  audits.push(doc);
  return doc;
};

process.on('exit', () => {
  (Agency as any).findById = original.agencyFindById;
  (Trip as any).findOne = original.tripFindOne;
  (AgencyQuote as any).findOne = original.quoteFindOne;
  (AgencyQuote as any).findOneAndUpdate = original.quoteFindOneAndUpdate;
  (AgencyExport as any).findOne = original.exportFindOne;
  (AgencyProposalLink as any).findById = original.linkFindById;
  (AgencyProposalLink as any).findOneAndUpdate = original.linkFindOneAndUpdate;
  (AgencyProposalLink as any).updateOne = original.linkUpdateOne;
  (AgencyEnquiry as any).find = original.enquiryFind;
  (AgencyEnquiry as any).findOne = original.enquiryFindOne;
  (AgencyEnquiry as any).findOneAndUpdate = original.enquiryFindOneAndUpdate;
  (AgencyClient as any).find = original.clientFind;
  (AgencyAudit as any).create = original.auditCreate;
});

function reset() {
  resetBus();
  audits = [];
  linkUpdates = [];
  siblingQuotes = [];
  linkRow = {
    _id: LINK_ID,
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quoteId: QUOTE_ID,
    exportId: EXPORT_ID,
    enquiryId: ENQUIRY_ID,
    tokenHash: 'hash',
    tokenHint: 'AbCd12',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    revokedAt: null,
    acceptedAt: null,
    declinedAt: null,
  };
  quoteRow = {
    _id: QUOTE_ID,
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    status: 'sent',
    number: 'QT-2026-0100',
    version: 1,
    currency: 'INR',
    lineItems: [],
    subtotal: 1000,
    taxPct: 5,
    taxAmount: 50,
    discount: 0,
    total: 1050,
    perPerson: 525,
    validUntil: new Date('2099-01-01T00:00:00.000Z'),
    inclusions: ['Stay'],
    exclusions: [],
    terms: [],
    sentAt: new Date('2026-10-20T00:00:00.000Z'),
    acceptedAt: null,
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
  };
  enquiryRow = {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    status: 'quoted',
    repliedAt: new Date('2026-10-21T00:00:00.000Z'),
    convertedAt: new Date('2026-10-21T00:00:00.000Z'),
  };
}

test('the owner accepts in-app: quote accepted, lead won, audits say so', async () => {
  reset();
  const result = await acceptAgencyProposalForUser(LINK_ID, USER_ID);

  assert.equal(result.status, 'accepted');
  assert.equal(quoteRow.status, 'accepted');
  assert.ok(quoteRow.acceptedAt);
  assert.ok(linkRow.acceptedAt, 'the link carries the acceptance too');
  assert.equal(enquiryRow.status, 'won', 'accepting closes the lead');

  const actions = audits.map((row) => row.action);
  assert.deepEqual(actions, ['share.accepted', 'quote.accepted']);
  assert.equal(audits[0].agencyId, AGENCY_ID);
  assert.deepEqual(audits[0].metadata, {
    tripId: TRIP_ID,
    linkId: LINK_ID,
  });
  assert.equal(
    (audits[1].metadata as any).via,
    'in-app',
    'the audit names the surface that answered'
  );
});

test('a second acceptance is idempotent, not a second quote write', async () => {
  reset();
  await acceptAgencyProposalForUser(LINK_ID, USER_ID);
  audits = [];
  const again = await acceptAgencyProposalForUser(LINK_ID, USER_ID);

  assert.equal(again.status, 'accepted');
  assert.deepEqual(audits, [], 'no duplicate audit rows');
});

test('a second version of the same trip cannot be accepted', async () => {
  reset();
  siblingQuotes = [
    {
      _id: OTHER_QUOTE_ID,
      agencyId: AGENCY_ID,
      tripId: TRIP_ID,
      status: 'accepted',
      acceptedAt: new Date('2026-10-22T00:00:00.000Z'),
    },
  ];

  await assert.rejects(
    () => acceptAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      /already accepted another version/i.test(error.message)
  );

  assert.equal(quoteRow.status, 'sent', 'the open version stays open');
  assert.equal(enquiryRow.status, 'quoted');
  assert.deepEqual(audits, [], 'a refused answer writes nothing');
});

test('an accepted quote on another trip does not block this one', async () => {
  reset();
  siblingQuotes = [
    {
      _id: OTHER_QUOTE_ID,
      agencyId: AGENCY_ID,
      tripId: OTHER_TRIP_ID,
      status: 'accepted',
    },
  ];

  const result = await acceptAgencyProposalForUser(LINK_ID, USER_ID);

  assert.equal(result.status, 'accepted');
  assert.equal(quoteRow.status, 'accepted');
});

test('declining tells the agency once, and the traveller not at all', async () => {
  reset();
  const tenant: EnquiryEvent[] = [];
  const traveller: EnquiryEvent[] = [];
  openStream(agencyChannel(AGENCY_ID), {
    deliver: (event) => tenant.push(event),
    close: () => {},
  });
  openStream(userChannel(USER_ID), {
    deliver: (event) => traveller.push(event),
    close: () => {},
  });

  await declineAgencyProposalForUser(LINK_ID, USER_ID);
  await declineAgencyProposalForUser(LINK_ID, USER_ID);

  assert.equal(tenant.length, 1, 'the retry is not new information');
  assert.equal(traveller.length, 0, 'the traveller just answered');
  const frame = tenant[0] as any;
  assert.equal(frame.type, 'proposal:declined');
  assert.equal(frame.linkId, LINK_ID);
  assert.equal(frame.enquiryId, ENQUIRY_ID);
  assert.equal(frame.declinedAt, linkRow.declinedAt.toISOString());
});

test('a foreign account cannot accept or decline someone else’s proposal', async () => {
  reset();

  await assert.rejects(
    () => acceptAgencyProposalForUser(LINK_ID, OTHER_USER_ID),
    (error: any) =>
      error instanceof AppError && error.statusCode === 404
  );
  await assert.rejects(
    () => declineAgencyProposalForUser(LINK_ID, OTHER_USER_ID),
    (error: any) =>
      error instanceof AppError && error.statusCode === 404
  );

  assert.equal(quoteRow.status, 'sent');
  assert.equal(linkRow.declinedAt, null);
  assert.deepEqual(audits, [], 'a refused answer writes nothing');
});

test('declining stamps only the link and leaves the quote for a new version', async () => {
  reset();
  const result = await declineAgencyProposalForUser(LINK_ID, USER_ID);

  assert.equal(result.status, 'declined');
  assert.ok(linkRow.declinedAt);
  assert.equal(quoteRow.status, 'sent', 'the quote is not cancelled');
  assert.equal(enquiryRow.status, 'quoted', 'the lead stays open');
  assert.deepEqual(
    audits.map((row) => row.action),
    ['share.declined']
  );
  assert.equal((audits[0].metadata as any).via, 'in-app');

  audits = [];
  const again = await declineAgencyProposalForUser(LINK_ID, USER_ID);
  assert.equal(again.declinedAt, linkRow.declinedAt);
  assert.deepEqual(audits, [], 'a repeated decline is not a new answer');
});

test('a declined version cannot be accepted later', async () => {
  reset();
  await declineAgencyProposalForUser(LINK_ID, USER_ID);

  await assert.rejects(
    () => acceptAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      /declined this proposal/i.test(error.message)
  );
  assert.equal(quoteRow.status, 'sent');
  assert.equal(enquiryRow.status, 'quoted');
});

test('an accepted proposal cannot be declined', async () => {
  reset();
  await acceptAgencyProposalForUser(LINK_ID, USER_ID);

  await assert.rejects(
    () => declineAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      /already accepted/i.test(error.message)
  );
  assert.equal(linkRow.declinedAt, null);
});

test('a withdrawn or expired quote offers neither answer', async () => {
  reset();
  quoteRow.status = 'cancelled';

  await assert.rejects(
    () => acceptAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) => error instanceof AppError && /cancelled/i.test(error.message)
  );
  await assert.rejects(
    () => declineAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) => error instanceof AppError && /cancelled/i.test(error.message)
  );

  reset();
  quoteRow.validUntil = new Date('2020-01-01T00:00:00.000Z');
  await assert.rejects(
    () => acceptAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) => error instanceof AppError && /expired/i.test(error.message)
  );
  await assert.rejects(
    () => declineAgencyProposalForUser(LINK_ID, USER_ID),
    (error: any) => error instanceof AppError && /expired/i.test(error.message)
  );
});
