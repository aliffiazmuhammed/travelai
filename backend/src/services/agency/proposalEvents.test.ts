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
import {
  acceptAgencyProposal,
  createAgencyProposalLink,
} from './proposals.js';
import { acceptQuote } from './quotes.js';
import {
  openStream,
  resetForTests as resetBus,
  userChannel,
  type EnquiryEvent,
} from '../realtime/enquiryEvents.js';

/**
 * Milestone 9 R1/R5 — the proposal emit point and its funnel write-back.
 *
 * Sending a proposal is the one agency action whose traveller-side frame has to
 * be addressed from the *enquiry* row, not the quote: the quote's client is the
 * bridge, and the account id lives on the enquiry. These tests pin that hop,
 * the "quoted" status the share writes first, and the quiet path for an ad-hoc
 * client with no enquiry behind it.
 */

const AGENCY_ID = '64c000000000000000000a01';
const TRIP_ID = '64c000000000000000000a02';
const EXPORT_ID = '64c000000000000000000a03';
const QUOTE_ID = '64c000000000000000000a04';
const CLIENT_ID = '64c000000000000000000a05';
const ENQUIRY_ID = '64c000000000000000000a06';
const USER_ID = '64c000000000000000000a07';
const LINK_ID = '64c000000000000000000a08';
const ACTOR_ID = '64c000000000000000000a09';

let clientRow: any = null;
let enquiryRow: any = null;
let linkRow: any = null;
let quoteRow: any = null;

const original = {
  exportFindOne: AgencyExport.findOne,
  quoteFindOne: AgencyQuote.findOne,
  quoteFindOneAndUpdate: AgencyQuote.findOneAndUpdate,
  clientFindOne: AgencyClient.findOne,
  enquiryFindOne: AgencyEnquiry.findOne,
  enquiryFindOneAndUpdate: AgencyEnquiry.findOneAndUpdate,
  linkCreate: AgencyProposalLink.create,
  linkFindOne: AgencyProposalLink.findOne,
  linkUpdateOne: AgencyProposalLink.updateOne,
  agencyFindById: Agency.findById,
  tripFindOne: Trip.findOne,
  auditCreate: AgencyAudit.create,
};

function chain(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    sort: () => wrapped,
    lean: async () => value,
  };
  return wrapped;
}

/** Quotes are read both directly and through `.sort()` (latest-first). */
function quoteQuery(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    sort: () => wrapped,
    lean: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return wrapped;
}

(AgencyExport as any).findOne = async () => ({
  _id: EXPORT_ID,
  agencyId: AGENCY_ID,
  tripId: TRIP_ID,
  quoteId: QUOTE_ID,
  audience: 'client',
  status: 'ready',
  outputKey: `exports/${EXPORT_ID}.pdf`,
  quoteNumber: 'QT-2026-0077',
  quoteVersion: 2,
  templateName: 'Classic',
});
(AgencyQuote as any).findOne = (filter: any) => {
  if (!quoteRow) return quoteQuery(null);
  // R7 adds a sibling read (another accepted quote on the trip); honour the
  // filters so this row is never mistaken for a sibling.
  const id = filter?._id;
  const matches =
    (filter?.agencyId === undefined ||
      String(quoteRow.agencyId) === String(filter.agencyId)) &&
    (filter?.tripId === undefined ||
      String(quoteRow.tripId) === String(filter.tripId)) &&
    (filter?.status === undefined || quoteRow.status === filter.status) &&
    (id === undefined ||
      (typeof id === 'object'
        ? id.$ne === undefined || String(quoteRow._id) !== String(id.$ne)
        : String(quoteRow._id) === String(id)));
  return quoteQuery(matches ? quoteRow : null);
};
(AgencyQuote as any).findOneAndUpdate = (filter: any, update: any) => {
  const matches =
    quoteRow &&
    (filter?._id === undefined || String(quoteRow._id) === String(filter._id)) &&
    (filter?.status === undefined || quoteRow.status === filter.status);
  if (!matches) return null;
  if (update?.$set) Object.assign(quoteRow, update.$set);
  return { ...quoteRow };
};
(Agency as any).findById = async () => ({
  _id: AGENCY_ID,
  name: 'Himalaya Trails',
  status: 'active',
});
(Trip as any).findOne = async () => ({
  _id: TRIP_ID,
  agencyId: AGENCY_ID,
  workspace: 'agency',
  isDeleted: false,
  title: 'Spiti Loop',
});
(AgencyClient as any).findOne = () => chain(clientRow);
/** Whether this fixture's trip carries its own directory lead (M9 R9). */
let tripLinked = true;
(AgencyEnquiry as any).findOne = (filter: any = {}) => {
  // The trip→lead resolver reads by tripId; the funnel write-back reads by id.
  if (filter?.tripId) return chain(tripLinked ? enquiryRow : null);
  return chain(
    enquiryRow && String(enquiryRow._id) === String(filter._id) ? enquiryRow : null
  );
};
// R5: the share writes "quoted" before the proposal frame. Only the status CAS
// matters here, and a second share of a closed lead must not match it.
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
(AgencyProposalLink as any).create = async (doc: any) => ({
  _id: LINK_ID,
  createdAt: new Date('2026-10-29T09:00:00.000Z'),
  revokedAt: null,
  viewCount: 0,
  ...doc,
});
(AgencyProposalLink as any).findOne = async () => linkRow;
(AgencyProposalLink as any).updateOne = async (_filter: any, update: any) => {
  if (linkRow && update?.$set) Object.assign(linkRow, update.$set);
  return { matchedCount: 1 };
};
(AgencyAudit as any).create = async (doc: any) => doc;

function reset() {
  resetBus();
  tripLinked = true;
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: ENQUIRY_ID };
  enquiryRow = {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    status: 'replied',
  };
  linkRow = {
    _id: LINK_ID,
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    quoteId: QUOTE_ID,
    exportId: EXPORT_ID,
    enquiryId: ENQUIRY_ID,
    tokenHash: 'hashed-token',
    tokenHint: 'raw…124',
    revokedAt: null,
    acceptedAt: null,
    viewCount: 0,
    expiresAt: new Date('2099-12-31T00:00:00.000Z'),
  };
  quoteRow = {
    _id: QUOTE_ID,
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    clientId: CLIENT_ID,
    number: 'QT-2026-0077',
    version: 2,
    status: 'sent',
    currency: 'INR',
    client: { name: 'Asha Rao', email: 'asha@example.com', adults: 2, children: 0 },
    lineItems: [],
    subtotal: 0,
    taxPct: 0,
    taxAmount: 0,
    discount: 0,
    total: 0,
    perPerson: 0,
    validUntil: new Date('2099-12-31T00:00:00.000Z'),
    inclusions: [],
    exclusions: [],
    terms: [],
    sentAt: new Date('2026-10-28T09:00:00.000Z'),
    acceptedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-10-28T09:00:00.000Z'),
    updatedAt: new Date('2026-10-28T09:00:00.000Z'),
  };
}

function collect(channel: string): EnquiryEvent[] {
  const events: EnquiryEvent[] = [];
  openStream(channel, { deliver: (event) => events.push(event), close: () => {} });
  return events;
}

async function mint(): Promise<string[]> {
  const events = collect(userChannel(USER_ID));
  await createAgencyProposalLink({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    exportId: EXPORT_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });
  return events.map((event) => event.type);
}

test('sending a proposal moves the lead to quoted, then notifies the traveller', async () => {
  reset();
  const events = collect(userChannel(USER_ID));

  await createAgencyProposalLink({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    exportId: EXPORT_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  // The status frame comes first so every screen resyncs to "quoted".
  assert.deepEqual(
    events.map((event) => event.type),
    ['enquiry:updated', 'proposal:new']
  );
  assert.equal((events[0] as any).status, 'quoted');
  assert.equal(enquiryRow.status, 'quoted');
  assert.ok(enquiryRow.repliedAt, 'the first proposal counts as the reply time');

  assert.deepEqual(Object.keys(events[1]).sort(), [
    'at',
    'enquiryId',
    'linkId',
    'type',
  ]);
  assert.equal((events[1] as any).enquiryId, ENQUIRY_ID);
  assert.equal((events[1] as any).linkId, LINK_ID);
});

test('a won lead keeps its status when another proposal goes out', async () => {
  reset();
  enquiryRow.status = 'won';
  const events = collect(userChannel(USER_ID));

  await createAgencyProposalLink({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    exportId: EXPORT_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  assert.equal(enquiryRow.status, 'won');
  assert.deepEqual(
    events.map((event) => event.type),
    ['proposal:new']
  );
});

test('an ad-hoc client with no enquiry behind it notifies nobody', async () => {
  reset();
  tripLinked = false;
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: null };

  assert.deepEqual(await mint(), []);
  assert.equal(enquiryRow.status, 'replied', 'no enquiry means no funnel write');
  assert.equal(enquiryRow.repliedAt, undefined);
});

test('a legacy guest enquiry has no personal channel, but the funnel still moves', async () => {
  reset();
  enquiryRow = {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    userId: null,
    status: 'replied',
  };

  assert.deepEqual(await mint(), []);
  assert.equal(enquiryRow.status, 'quoted');
});

/* -------------------------------------------------------------------------- */
/*  Acceptance closes the lead (R5)                                           */
/* -------------------------------------------------------------------------- */

test('the traveller accepting a proposal wins the lead behind it', async () => {
  reset();
  enquiryRow.status = 'quoted';
  const events = collect(userChannel(USER_ID));

  const result = await acceptAgencyProposal('raw-token');

  assert.equal(result.status, 'accepted');
  assert.equal(quoteRow.status, 'accepted');
  assert.equal(enquiryRow.status, 'won');
  assert.ok(enquiryRow.convertedAt, 'a booking counts as the conversion');
  assert.deepEqual(
    events.map((event) => event.type),
    ['enquiry:updated']
  );
  assert.equal((events[0] as any).status, 'won');

  // A retry returns the same accepted row and does not re-emit.
  await acceptAgencyProposal('raw-token');
  assert.equal(events.length, 1);
});

test('a quote accepted on the phone closes the lead its client came from', async () => {
  reset();
  enquiryRow.status = 'quoted';
  const events = collect(userChannel(USER_ID));

  const accepted = await acceptQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    role: 'planner',
  });

  assert.equal(accepted.status, 'accepted');
  assert.equal(enquiryRow.status, 'won');
  assert.deepEqual(
    events.map((event) => event.type),
    ['enquiry:updated']
  );
});

test('a phone acceptance for an ad-hoc client leaves every lead alone', async () => {
  reset();
  tripLinked = false;
  enquiryRow.status = 'quoted';
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: null };

  await acceptQuote({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    role: 'planner',
  });

  assert.equal(enquiryRow.status, 'quoted');
});

process.on('exit', () => {
  (AgencyExport as any).findOne = original.exportFindOne;
  (AgencyQuote as any).findOne = original.quoteFindOne;
  (AgencyQuote as any).findOneAndUpdate = original.quoteFindOneAndUpdate;
  (AgencyClient as any).findOne = original.clientFindOne;
  (AgencyEnquiry as any).findOne = original.enquiryFindOne;
  (AgencyEnquiry as any).findOneAndUpdate = original.enquiryFindOneAndUpdate;
  (AgencyProposalLink as any).create = original.linkCreate;
  (AgencyProposalLink as any).findOne = original.linkFindOne;
  (AgencyProposalLink as any).updateOne = original.linkUpdateOne;
  (Agency as any).findById = original.agencyFindById;
  (Trip as any).findOne = original.tripFindOne;
  (AgencyAudit as any).create = original.auditCreate;
});
