import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import { sendQuote } from './quotes.js';

/**
 * M9 R8 — sending a quote is the funnel's quote step.
 *
 * The lead must not sit on "Replied" while a sent quote exists. The write-back
 * reuses the share-time rule, so a won or lost lead keeps the status its agency
 * chose.
 *
 * M9 R9 — sending is also the share: the traveller's thread gets the quote and
 * the itinerary snapshot. These tests stub the link row that already exists,
 * so the mint's own behaviour lives in `liveProposal.test.ts`.
 */

const AGENCY_ID = '64d000000000000000000b01';
const TRIP_ID = '64d000000000000000000b02';
const CLIENT_ID = '64d000000000000000000b03';
const ENQUIRY_ID = '64d000000000000000000b04';
const TRIP_ENQUIRY_ID = '64d000000000000000000b06';
const OLD_ENQUIRY_ID = '64d000000000000000000b07';

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64d000000000000000000b05',
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    clientId: CLIENT_ID,
    number: 'Q-2026-0001',
    version: 1,
    status: 'draft',
    currency: 'INR',
    lineItems: [],
    subtotal: 10000,
    total: 10000,
    perPerson: 5000,
    validUntil: new Date(Date.now() + 86_400_000),
    inclusions: [],
    exclusions: [],
    terms: [],
    createdAt: new Date('2026-10-29T09:00:00.000Z'),
    ...overrides,
  };
}

function chain(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    sort: () => wrapped,
    lean: async () => value,
  };
  return wrapped;
}

let latest = quoteRow();
let enquiryRow: any = { _id: ENQUIRY_ID, status: 'new', repliedAt: null };
/** The lead the trip itself points at, when a returning traveller has one. */
let tripLead: any = null;
let clientDoc: any = { _id: CLIENT_ID, sourceEnquiryId: ENQUIRY_ID };
let enquiryWrites = 0;
let lastEnquirySet: any = null;
let lastEnquiryFilter: any = null;
let linkError: Error | null = null;

const originals = {
  quoteFindOne: AgencyQuote.findOne,
  quoteUpdate: AgencyQuote.findOneAndUpdate,
  clientFindOne: AgencyClient.findOne,
  enquiryFindOne: AgencyEnquiry.findOne,
  enquiryUpdate: AgencyEnquiry.findOneAndUpdate,
  linkFindOne: AgencyProposalLink.findOne,
};

(AgencyQuote as any).findOne = () => ({ sort: async () => latest });
(AgencyQuote as any).findOneAndUpdate = async (filter: any) => {
  if (filter?.status !== 'draft') return null;
  return { ...latest, status: 'sent', sentAt: new Date() };
};
(AgencyClient as any).findOne = () => chain(clientDoc);
// Two callers read this model: the funnel move looks the lead up by id, and the
// trip→lead resolver looks it up by tripId. The stub has to tell them apart.
(AgencyEnquiry as any).findOne = (filter: any = {}) =>
  chain(filter?.tripId ? tripLead : enquiryRow);
(AgencyEnquiry as any).findOneAndUpdate = (filter: any, update: any) => {
  enquiryWrites += 1;
  lastEnquiryFilter = filter;
  lastEnquirySet = update.$set;
  return { lean: async () => ({ ...enquiryRow, ...update.$set }) };
};
(AgencyProposalLink as any).findOne = async () => {
  if (linkError) throw linkError;
  return { _id: '64d000000000000000000b09', kind: 'live' };
};

function reset() {
  latest = quoteRow();
  enquiryRow = { _id: ENQUIRY_ID, status: 'new', repliedAt: null };
  tripLead = null;
  clientDoc = { _id: CLIENT_ID, sourceEnquiryId: ENQUIRY_ID };
  enquiryWrites = 0;
  lastEnquirySet = null;
  lastEnquiryFilter = null;
  linkError = null;
}

test('sending a draft moves a fresh lead to quoted and stamps the reply time', async () => {
  reset();
  const { quote: sent, proposal } = await sendQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    role: 'planner',
  });

  assert.equal(sent.status, 'sent');
  assert.equal(enquiryWrites, 1);
  assert.equal(String(lastEnquiryFilter._id), ENQUIRY_ID);
  assert.equal(lastEnquirySet.status, 'quoted');
  assert.ok(lastEnquirySet.repliedAt instanceof Date);
  assert.deepEqual(proposal, { id: '64d000000000000000000b09', created: false });
});

test('a returning traveller’s newer trip moves its own lead, not the client’s first one', async () => {
  reset();
  // The shared client row still points at the first enquiry she sent.
  clientDoc = { _id: CLIENT_ID, sourceEnquiryId: OLD_ENQUIRY_ID };
  tripLead = { _id: TRIP_ENQUIRY_ID, status: 'replied', repliedAt: null };

  await sendQuote({ agencyId: AGENCY_ID, tripId: TRIP_ID, role: 'planner' });

  assert.equal(enquiryWrites, 1);
  assert.equal(String(lastEnquiryFilter._id), TRIP_ENQUIRY_ID);
  assert.equal(lastEnquirySet.status, 'quoted');
});

test('a won lead keeps the status its agency chose', async () => {
  reset();
  enquiryRow = {
    _id: ENQUIRY_ID,
    status: 'won',
    repliedAt: new Date('2026-10-28T09:00:00.000Z'),
  };

  await sendQuote({ agencyId: AGENCY_ID, tripId: TRIP_ID, role: 'planner' });

  assert.equal(enquiryWrites, 0);
});

test('a client with no directory enquiry writes nothing', async () => {
  reset();
  clientDoc = { _id: CLIENT_ID, sourceEnquiryId: null };

  await sendQuote({ agencyId: AGENCY_ID, tripId: TRIP_ID, role: 'planner' });

  assert.equal(enquiryWrites, 0);
});

test('an already-sent quote is idempotent and does not re-write the lead', async () => {
  reset();
  latest = quoteRow({ status: 'sent' });

  const { quote: sent } = await sendQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    role: 'planner',
  });

  assert.equal(sent.status, 'sent');
  assert.equal(enquiryWrites, 0);
});

test('a failed share mint never blocks the send', async () => {
  reset();
  linkError = new Error('mongo hiccup');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { quote: sent, proposal } = await sendQuote({
      agencyId: AGENCY_ID,
      tripId: TRIP_ID,
      role: 'planner',
    });
    assert.equal(sent.status, 'sent');
    assert.equal(proposal, null);
  } finally {
    console.warn = warn;
  }
});

test('sending still requires the planner role', async () => {
  reset();
  await assert.rejects(
    () => sendQuote({ agencyId: AGENCY_ID, tripId: TRIP_ID, role: 'viewer' }),
    (error: any) => {
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
  assert.equal(enquiryWrites, 0);
});

test.after(() => {
  (AgencyQuote as any).findOne = originals.quoteFindOne;
  (AgencyQuote as any).findOneAndUpdate = originals.quoteUpdate;
  (AgencyClient as any).findOne = originals.clientFindOne;
  (AgencyEnquiry as any).findOne = originals.enquiryFindOne;
  (AgencyEnquiry as any).findOneAndUpdate = originals.enquiryUpdate;
  (AgencyProposalLink as any).findOne = originals.linkFindOne;
});
