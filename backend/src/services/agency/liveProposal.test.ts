import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import {
  ensureLiveProposalForQuote,
  shareLatestQuoteWithTraveller,
} from './liveProposal.js';

/**
 * M9 R9 — sending is the share.
 *
 * The mint is idempotent per quote, carries the itinerary snapshot and never
 * needs an export job. These tests pin those rules with the models stubbed;
 * the full send-to-accept life cycle runs in the browser smoke.
 */

const AGENCY_ID = '64d000000000000000000c01';
const TRIP_ID = '64d000000000000000000c02';
const CLIENT_ID = '64d000000000000000000c03';
const ENQUIRY_ID = '64d000000000000000000c04';
const QUOTE_ID = '64d000000000000000000c05';
const LINK_ID = '64d000000000000000000c06';
const USER_ID = '64d000000000000000000c07';

function chain(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    sort: async () => value,
    lean: async () => value,
  };
  return wrapped;
}

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: QUOTE_ID,
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    clientId: CLIENT_ID,
    number: 'QT-2026-0007',
    version: 2,
    status: 'sent',
    currency: 'INR',
    lineItems: [],
    subtotal: 10000,
    total: 11800,
    perPerson: 5900,
    validUntil: new Date(Date.now() + 5 * 86_400_000),
    inclusions: ['Hotels'],
    exclusions: ['Flights'],
    terms: [],
    createdAt: new Date('2026-10-29T09:00:00.000Z'),
    ...overrides,
  };
}

let clientRow: any = {
  _id: CLIENT_ID,
  sourceEnquiryId: ENQUIRY_ID,
  name: 'R9 Traveller',
  email: 'r9@example.com',
};
let existingLink: any = null;
let agencyRow: any = {
  _id: AGENCY_ID,
  name: 'R9 Travel',
  status: 'active',
  branding: {},
};
let tripRow: any = {
  _id: TRIP_ID,
  title: 'Kerala backwaters',
  tripDetails: { trip_title: 'Kerala backwaters', duration_days: 2 },
};
let latestQuote: any = quoteRow();
let ledger: any = { _id: ENQUIRY_ID, userId: USER_ID };
let createdPayloads: any[] = [];
let audits: any[] = [];

const originals = {
  clientFindOne: AgencyClient.findOne,
  linkFindOne: AgencyProposalLink.findOne,
  linkCreate: AgencyProposalLink.create,
  agencyFindById: Agency.findById,
  tripFindOne: Trip.findOne,
  quoteFindOne: AgencyQuote.findOne,
  enquiryFindOne: AgencyEnquiry.findOne,
  auditCreate: AgencyAudit.create,
};

(AgencyClient as any).findOne = () => chain(clientRow);
(AgencyProposalLink as any).findOne = async () => existingLink;
(AgencyProposalLink as any).create = async (payload: any) => {
  createdPayloads.push(payload);
  return { _id: LINK_ID, ...payload };
};
(Agency as any).findById = async () => agencyRow;
(Trip as any).findOne = async () => tripRow;
(AgencyQuote as any).findOne = () => chain(latestQuote);
(AgencyEnquiry as any).findOne = () => chain(ledger);
(AgencyAudit as any).create = async (payload: any) => {
  audits.push(payload);
  return payload;
};

function reset() {
  clientRow = {
    _id: CLIENT_ID,
    sourceEnquiryId: ENQUIRY_ID,
    name: 'R9 Traveller',
    email: 'r9@example.com',
  };
  existingLink = null;
  agencyRow = { _id: AGENCY_ID, name: 'R9 Travel', status: 'active', branding: {} };
  tripRow = {
    _id: TRIP_ID,
    title: 'Kerala backwaters',
    tripDetails: { trip_title: 'Kerala backwaters', duration_days: 2 },
  };
  latestQuote = quoteRow();
  ledger = { _id: ENQUIRY_ID, userId: USER_ID };
  createdPayloads = [];
  audits = [];
}

function status(error: unknown): number | undefined {
  return (error as any)?.statusCode;
}

test('an ad-hoc quote (no client) has no in-app proposal', async () => {
  reset();
  const result = await ensureLiveProposalForQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quote: quoteRow({ clientId: null }),
  });
  assert.equal(result, null);
  assert.equal(createdPayloads.length, 0);
});

test('a directory client without an enquiry is served by a PDF, not a live link', async () => {
  reset();
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: null, name: 'Walk-in' };

  const result = await ensureLiveProposalForQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quote: quoteRow(),
  });
  assert.equal(result, null);
  assert.equal(createdPayloads.length, 0);
});

test('the mint is idempotent while an answerable live link exists', async () => {
  reset();
  existingLink = { _id: LINK_ID, kind: 'live' };

  const result = await ensureLiveProposalForQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quote: quoteRow(),
  });
  assert.deepEqual(result, { link: existingLink, created: false });
  assert.equal(createdPayloads.length, 0);
});

test('a first send mints a live link with the trip snapshot and no export', async () => {
  reset();
  const result = await ensureLiveProposalForQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quote: quoteRow(),
    actorId: USER_ID,
  });

  assert.equal(result?.created, true);
  assert.equal(result?.link._id, LINK_ID);
  assert.equal(createdPayloads.length, 1);

  const [payload] = createdPayloads;
  assert.equal(payload.kind, 'live');
  assert.equal(payload.exportId, null);
  assert.equal(payload.quoteNumber, 'QT-2026-0007');
  assert.equal(String(payload.quoteId), QUOTE_ID);
  assert.equal(String(payload.enquiryId), ENQUIRY_ID);
  assert.match(String(payload.tokenHash), /^[a-f0-9]{64}$/);
  assert.ok(payload.tokenHint);
  assert.ok(payload.expiresAt > new Date());

  assert.equal(payload.itinerarySnapshot.schemaVersion, 1);
  assert.equal(payload.itinerarySnapshot.quote.number, 'QT-2026-0007');
  assert.equal(payload.itinerarySnapshot.trip.title, 'Kerala backwaters');
  assert.ok(
    payload.itinerarySnapshot.trip.days.length >= 1,
    'a snapshot must carry the itinerary days the traveller was quoted'
  );

  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'share.created');
  assert.deepEqual(audits[0].metadata, {
    tripId: TRIP_ID,
    quoteId: QUOTE_ID,
    via: 'send',
  });
});

test('a suspended agency or missing trip refuses the mint', async () => {
  reset();
  agencyRow = { _id: AGENCY_ID, name: 'R9 Travel', status: 'suspended', branding: {} };

  await assert.rejects(
    () =>
      ensureLiveProposalForQuote({
        agencyId: AGENCY_ID,
        tripId: TRIP_ID,
        quote: quoteRow(),
      }),
    (error: unknown) => status(error) === 409
  );
  assert.equal(createdPayloads.length, 0);
});

test('the retry only shares a sent, unexpired quote and needs planner rank', async () => {
  reset();
  await assert.rejects(
    () =>
      shareLatestQuoteWithTraveller({
        agencyId: AGENCY_ID,
        tripId: TRIP_ID,
        actorId: USER_ID,
        role: 'viewer',
      }),
    (error: unknown) => status(error) === 403
  );

  latestQuote = quoteRow({ status: 'draft' });
  await assert.rejects(
    () =>
      shareLatestQuoteWithTraveller({
        agencyId: AGENCY_ID,
        tripId: TRIP_ID,
        actorId: USER_ID,
        role: 'planner',
      }),
    (error: unknown) =>
      status(error) === 409 && /Send this quote/.test((error as any).message)
  );

  latestQuote = quoteRow({ validUntil: new Date(Date.now() - 1000) });
  await assert.rejects(
    () =>
      shareLatestQuoteWithTraveller({
        agencyId: AGENCY_ID,
        tripId: TRIP_ID,
        actorId: USER_ID,
        role: 'planner',
      }),
    (error: unknown) =>
      status(error) === 409 && /expired/.test((error as any).message)
  );
});

test('the retry points an unlinked client at the PDF path', async () => {
  reset();
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: null, name: 'Walk-in' };

  await assert.rejects(
    () =>
      shareLatestQuoteWithTraveller({
        agencyId: AGENCY_ID,
        tripId: TRIP_ID,
        actorId: USER_ID,
        role: 'planner',
      }),
    (error: unknown) =>
      status(error) === 409 && /PDF proposal/.test((error as any).message)
  );
  assert.equal(createdPayloads.length, 0);
});

test('the retry shares the latest quote with the traveller', async () => {
  reset();
  existingLink = { _id: LINK_ID, kind: 'live' };

  const result = await shareLatestQuoteWithTraveller({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    actorId: USER_ID,
    role: 'planner',
  });

  assert.equal(result.created, false);
  assert.equal(result.link._id, LINK_ID);
});

test.after(() => {
  (AgencyClient as any).findOne = originals.clientFindOne;
  (AgencyProposalLink as any).findOne = originals.linkFindOne;
  (AgencyProposalLink as any).create = originals.linkCreate;
  (Agency as any).findById = originals.agencyFindById;
  (Trip as any).findOne = originals.tripFindOne;
  (AgencyQuote as any).findOne = originals.quoteFindOne;
  (AgencyEnquiry as any).findOne = originals.enquiryFindOne;
  (AgencyAudit as any).create = originals.auditCreate;
});
