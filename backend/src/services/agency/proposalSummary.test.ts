import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import { listProposalsForEnquiry } from './proposals.js';

/**
 * M9 R7 — the comparison's settled-trip rule.
 *
 * `/proposals` and the enquiry thread render the same projection, and the card
 * is only as honest as this flag: a version of a trip that already has an
 * accepted quote must say so, because the acceptance guard refuses it. The
 * badge in `directory/enquiries.ts` applies the same rule on the counts side.
 */

const AGENCY_ID = '64d000000000000000000a01';
const TRIP_SETTLED = '64d000000000000000000a02';
const TRIP_OPEN = '64d000000000000000000a03';
const CLIENT_ID = '64d000000000000000000a04';
const ENQUIRY_ID = '64d000000000000000000a05';

const quoteRows = [
  quote('64d000000000000000000a11', TRIP_SETTLED, 'Q-2026-0001', 1, 'accepted'),
  quote('64d000000000000000000a12', TRIP_SETTLED, 'Q-2026-0002', 2, 'sent'),
  quote('64d000000000000000000a13', TRIP_OPEN, 'Q-2026-0003', 3, 'sent'),
];

const linkRows = quoteRows.map((row, index) => ({
  _id: `64d000000000000000000b0${index + 1}`,
  agencyId: AGENCY_ID,
  tripId: row.tripId,
  quoteId: row._id,
  enquiryId: ENQUIRY_ID,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-10-29T09:00:00.000Z'),
  acceptedAt: null,
  declinedAt: null,
}));

function quote(_id: string, tripId: string, number: string, version: number, status: string) {
  return {
    _id,
    agencyId: AGENCY_ID,
    tripId,
    clientId: CLIENT_ID,
    number,
    version,
    status,
    currency: 'INR',
    lineItems: [],
    subtotal: 18000,
    total: 21168,
    perPerson: 10584,
    validUntil: null,
    inclusions: ['Hotels'],
    exclusions: ['Flights'],
    terms: [],
    client: { name: 'R7 Traveller', adults: 2, children: 0 },
    createdAt: new Date('2026-10-20T09:00:00.000Z'),
    acceptedAt: status === 'accepted' ? new Date('2026-10-28T09:00:00.000Z') : null,
  };
}

function chain(value: any, project?: (projection: string) => any): any {
  let rows = value;
  const wrapped: any = {
    select: (projection: string) => {
      if (project) rows = project(projection);
      return wrapped;
    },
    sort: () => wrapped,
    limit: () => wrapped,
    lean: async () => rows,
  };
  return wrapped;
}

/** Mongoose drops unselected fields, `_id` aside; the stub does the same. */
function projectRow(row: any, projection: string) {
  const fields = new Set(projection.split(' ').filter(Boolean));
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key === '_id' || fields.has(key))
  );
}

const originals = {
  quoteFind: AgencyQuote.find,
  linkFind: AgencyProposalLink.find,
  agencyFind: Agency.find,
  tripFind: Trip.find,
  clientFind: AgencyClient.find,
};

let summaryProjection = '';

(AgencyQuote as any).find = (filter: any) => {
  if (filter?.status === 'accepted') {
    const trips = new Set((filter.tripId?.$in ?? []).map(String));
    return chain(
      quoteRows.filter((row) => row.status === 'accepted' && trips.has(String(row.tripId)))
    );
  }
  return chain(quoteRows, (projection) => {
    summaryProjection = projection;
    return quoteRows.map((row) => projectRow(row, projection));
  });
};
(AgencyProposalLink as any).find = () => chain(linkRows);
(Agency as any).find = () =>
  chain([{ _id: AGENCY_ID, name: 'R7 Travel', slug: 'r7-travel' }]);
(Trip as any).find = () =>
  chain([
    { _id: TRIP_SETTLED, title: 'R7 settled trip' },
    { _id: TRIP_OPEN, title: 'R7 open trip' },
  ]);
(AgencyClient as any).find = () =>
  chain([{ _id: CLIENT_ID, sourceEnquiryId: ENQUIRY_ID }]);

const row = { _id: ENQUIRY_ID, agencyId: AGENCY_ID, clientId: CLIENT_ID };

test('a version is settled when another quote on its trip is accepted', async () => {
  const proposals = await listProposalsForEnquiry(row);
  const byNumber = new Map(proposals.map((item) => [item.quote?.number, item]));

  assert.ok(
    summaryProjection.split(' ').includes('tripId'),
    'the quote query must project tripId or the settled rule silently disables itself'
  );
  assert.equal(proposals.length, 3);
  assert.equal(byNumber.get('Q-2026-0001')?.settledByAcceptedTrip, false);
  assert.equal(byNumber.get('Q-2026-0001')?.quote?.status, 'accepted');
  assert.equal(byNumber.get('Q-2026-0002')?.settledByAcceptedTrip, true);
  assert.equal(byNumber.get('Q-2026-0002')?.quote?.status, 'sent');
  assert.equal(byNumber.get('Q-2026-0003')?.settledByAcceptedTrip, false);
});

test('the summary keeps its exact key set', async () => {
  const [first] = await listProposalsForEnquiry(row);
  assert.deepEqual(Object.keys(first).sort(), [
    'acceptedAt',
    'agency',
    'createdAt',
    'declinedAt',
    'enquiryId',
    'expiresAt',
    'id',
    'kind',
    'quote',
    'settledByAcceptedTrip',
    'trip',
  ]);
  assert.deepEqual(Object.keys(first.quote ?? {}).sort(), [
    'createdAt',
    'currency',
    'exclusions',
    'inclusions',
    'number',
    'perPerson',
    'status',
    'total',
    'validUntil',
    'version',
  ]);
});

test.after(() => {
  (AgencyQuote as any).find = originals.quoteFind;
  (AgencyProposalLink as any).find = originals.linkFind;
  (Agency as any).find = originals.agencyFind;
  (Trip as any).find = originals.tripFind;
  (AgencyClient as any).find = originals.clientFind;
});
