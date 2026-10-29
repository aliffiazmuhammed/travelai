import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import { createAgencyProposalLink } from './proposals.js';
import {
  openStream,
  resetForTests as resetBus,
  userChannel,
  type EnquiryEvent,
} from '../realtime/enquiryEvents.js';

/**
 * Milestone 9 R1 — the proposal emit point.
 *
 * Sending a proposal is the one agency action whose traveller-side frame has to
 * be addressed from the *enquiry* row, not the quote: the quote's client is the
 * bridge, and the account id lives on the enquiry. These tests pin that hop and
 * the quiet path for an ad-hoc client with no enquiry behind it.
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

const original = {
  exportFindOne: AgencyExport.findOne,
  quoteFindOne: AgencyQuote.findOne,
  clientFindOne: AgencyClient.findOne,
  enquiryFindOne: AgencyEnquiry.findOne,
  linkCreate: AgencyProposalLink.create,
  auditCreate: AgencyAudit.create,
};

function chain(value: any): any {
  const wrapped: any = {
    select: () => wrapped,
    lean: async () => value,
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
(AgencyQuote as any).findOne = async () => ({ _id: QUOTE_ID, clientId: CLIENT_ID });
(AgencyClient as any).findOne = () => chain(clientRow);
(AgencyEnquiry as any).findOne = (filter: any) =>
  chain(enquiryRow && String(enquiryRow._id) === String(filter._id) ? enquiryRow : null);
(AgencyProposalLink as any).create = async (doc: any) => ({
  _id: LINK_ID,
  createdAt: new Date('2026-10-29T09:00:00.000Z'),
  revokedAt: null,
  viewCount: 0,
  ...doc,
});
(AgencyAudit as any).create = async (doc: any) => doc;

function reset() {
  resetBus();
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: ENQUIRY_ID };
  enquiryRow = { _id: ENQUIRY_ID, userId: USER_ID };
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

test('sending a proposal notifies the traveller’s channel', async () => {
  reset();
  const events = collect(userChannel(USER_ID));

  await createAgencyProposalLink({
    agencyId: AGENCY_ID,
    tripId: TRIP_ID,
    exportId: EXPORT_ID,
    actorId: ACTOR_ID,
    role: 'planner',
  });

  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), [
    'at',
    'enquiryId',
    'linkId',
    'type',
  ]);
  assert.equal(events[0].type, 'proposal:new');
  assert.equal((events[0] as any).enquiryId, ENQUIRY_ID);
  assert.equal((events[0] as any).linkId, LINK_ID);
});

test('an ad-hoc client with no enquiry behind it notifies nobody', async () => {
  reset();
  clientRow = { _id: CLIENT_ID, sourceEnquiryId: null };

  assert.deepEqual(await mint(), []);
});

test('a legacy guest enquiry has no personal channel, so nothing is sent', async () => {
  reset();
  enquiryRow = { _id: ENQUIRY_ID, userId: null };

  assert.deepEqual(await mint(), []);
});

process.on('exit', () => {
  (AgencyExport as any).findOne = original.exportFindOne;
  (AgencyQuote as any).findOne = original.quoteFindOne;
  (AgencyClient as any).findOne = original.clientFindOne;
  (AgencyEnquiry as any).findOne = original.enquiryFindOne;
  (AgencyProposalLink as any).create = original.linkCreate;
  (AgencyAudit as any).create = original.auditCreate;
});
