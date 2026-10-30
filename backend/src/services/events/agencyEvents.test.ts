import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import {
  buildEventFields,
  closeAgencyEvent,
  createAgencyEvent,
  decideEventInterest,
  deleteAgencyEvent,
  eventReadiness,
  getAgencyEventInterestSummary,
  listAgencyEvents,
  listEventInterests,
  publishAgencyEvent,
  reopenAgencyEvent,
  updateAgencyEvent,
  viewOwnEvent,
} from './agencyEvents.js';

/**
 * Milestone 10 E2 — the agency event library and its roster.
 *
 * Model calls are stubbed. The tests pin the lifecycle rules (draft → publish,
 * close/reopen, draft-only delete), the readiness gate, the capacity guard on
 * confirmation and the audit trail. No database is touched.
 */

const AGENCY_A = '64e000000000000000000c01';
const EVENT_A = '64e000000000000000000a01';
const INTEREST_A = '64e000000000000000000b01';
const ACTOR_ID = '64e000000000000000000d01';

let eventRow: any = null;
let eventRows: any[] = [];
let interestRow: any = null;
let interestRows: any[] = [];
let interestQuery: any = null;
let interestSort: any = null;
let confirmedCount = 0;
let interestTotal = 0;
let countsRows: any[] = [];
let createdPayloads: any[] = [];
let deleted: any[] = [];
let audits: any[] = [];

function withSave(row: any) {
  return { saved: 0, async save() { this.saved += 1; }, ...row };
}

function eventDoc(overrides: Record<string, unknown> = {}): any {
  return withSave({
    _id: EVENT_A,
    agencyId: AGENCY_A,
    title: 'Monsoon nature camp',
    summary: 'Forest walks and river dips.',
    kind: 'camp',
    destination: 'Coorg',
    venue: 'Kaveri riverside',
    startDate: new Date('2027-06-12T00:00:00.000Z'),
    endDate: new Date('2027-06-15T00:00:00.000Z'),
    capacity: 2,
    pricePerPerson: 12000,
    currency: 'INR',
    coverAssetId: null,
    highlights: ['River walks'],
    state: 'draft',
    publishedAt: null,
    closedAt: null,
    moderation: {},
    ...overrides,
  });
}

function interestDoc(overrides: Record<string, unknown> = {}): any {
  return withSave({
    _id: INTEREST_A,
    eventId: EVENT_A,
    agencyId: AGENCY_A,
    name: 'Meera Nair',
    email: 'meera@example.com',
    phone: '+91 98450 11111',
    note: '',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date('2026-10-30T09:00:00.000Z'),
    ...overrides,
  });
}

function chain(result: any) {
  const builder: any = {
    select: () => builder,
    sort: () => builder,
    lean: async () => result,
  };
  return builder;
}

const originals = {
  eventFind: AgencyEvent.find,
  eventFindOne: AgencyEvent.findOne,
  eventCreate: AgencyEvent.create,
  eventDelete: AgencyEvent.deleteOne,
  interestAggregate: AgencyEventInterest.aggregate,
  interestCount: AgencyEventInterest.countDocuments,
  interestFind: AgencyEventInterest.find,
  interestFindOne: AgencyEventInterest.findOne,
  auditCreate: AgencyAudit.create,
};

(AgencyEvent as any).find = () => chain(eventRows);
(AgencyEvent as any).findOne = () => eventRow;
(AgencyEvent as any).create = async (payload: any) => {
  createdPayloads.push(payload);
  return eventDoc(payload);
};
(AgencyEvent as any).deleteOne = async (filter: any) => {
  deleted.push(filter);
  return { deletedCount: 1 };
};
(AgencyEventInterest as any).aggregate = async () => countsRows;
(AgencyEventInterest as any).countDocuments = async (filter: any) =>
  filter?.status === 'confirmed' ? confirmedCount : interestTotal;
(AgencyEventInterest as any).find = (query: any) => {
  interestQuery = query;
  const builder: any = {
    sort: (sort: any) => {
      interestSort = sort;
      return builder;
    },
    lean: async () => interestRows,
  };
  return builder;
};
(AgencyEventInterest as any).findOne = () => interestRow;
(AgencyAudit as any).create = async (payload: any) => {
  audits.push(payload);
  return payload;
};

test.after(() => {
  (AgencyEvent as any).find = originals.eventFind;
  (AgencyEvent as any).findOne = originals.eventFindOne;
  (AgencyEvent as any).create = originals.eventCreate;
  (AgencyEvent as any).deleteOne = originals.eventDelete;
  (AgencyEventInterest as any).aggregate = originals.interestAggregate;
  (AgencyEventInterest as any).countDocuments = originals.interestCount;
  (AgencyEventInterest as any).find = originals.interestFind;
  (AgencyEventInterest as any).findOne = originals.interestFindOne;
  (AgencyAudit as any).create = originals.auditCreate;
});

function reset() {
  eventRow = eventDoc();
  eventRows = [];
  interestRow = interestDoc();
  interestRows = [];
  interestQuery = null;
  interestSort = null;
  confirmedCount = 0;
  interestTotal = 1;
  countsRows = [];
  createdPayloads = [];
  deleted = [];
  audits = [];
}

async function rejectsWith(
  promise: Promise<unknown>,
  status: number,
  pattern: RegExp
): Promise<void> {
  await assert.rejects(promise, (error: any) => {
    assert.equal(error?.statusCode, status, error?.message);
    assert.match(String(error?.message), pattern);
    return true;
  });
}

test('readiness needs a title, a summary, a destination and sane dates', () => {
  assert.deepEqual(eventReadiness(null), {
    ready: false,
    missing: [
      'Give the event a title.',
      'Write a line travellers will read on the card.',
      'Add the destination.',
      "Check the dates: both are needed and the end can't come first.",
    ],
  });

  assert.equal(eventReadiness(eventDoc()).ready, true);

  const inverted = eventDoc({
    endDate: new Date('2027-06-01T00:00:00.000Z'),
  });
  assert.equal(eventReadiness(inverted).ready, false);
});

test('writes parse days in UTC and reject bad caps, prices and kinds', () => {
  const fields = buildEventFields({
    startDate: '2027-06-12',
    endDate: '2027-06-15',
    title: '  Monsoon camp ',
    capacity: 18,
    pricePerPerson: 9000,
    highlights: ['River walks', 'river walks', 'Campfire'],
  });

  assert.equal((fields.startDate as Date).toISOString(), '2027-06-12T00:00:00.000Z');
  assert.equal((fields.endDate as Date).toISOString(), '2027-06-15T00:00:00.000Z');
  assert.equal(fields.title, 'Monsoon camp');
  assert.equal(fields.capacity, 18);
  assert.equal(fields.pricePerPerson, 9000);
  assert.deepEqual(fields.highlights, ['River walks', 'Campfire']);

  assert.throws(
    () => buildEventFields({ capacity: 0 }),
    (error: any) => error.statusCode === 400
  );
  assert.throws(
    () => buildEventFields({ pricePerPerson: -1 }),
    (error: any) => error.statusCode === 400
  );
  assert.throws(
    () => buildEventFields({ kind: 'festival' }),
    (error: any) => error.statusCode === 400
  );
  assert.throws(
    () => buildEventFields({ startDate: 'next summer' }),
    (error: any) => error.statusCode === 400
  );
});

test('creating an event always starts as an INR draft and is audited', async () => {
  reset();
  const created = await createAgencyEvent({
    agencyId: AGENCY_A,
    actorId: ACTOR_ID,
    fields: {
      title: 'Monsoon nature camp',
      startDate: '2027-06-12',
      endDate: '2027-06-15',
    },
  });

  assert.equal(created.state, 'draft');
  assert.equal(createdPayloads[0].currency, 'INR');
  assert.equal(createdPayloads[0].state, 'draft');
  assert.equal(audits[0].action, 'event.created');
  assert.equal(audits[0].targetType, 'event');

  await rejectsWith(
    createAgencyEvent({
      agencyId: AGENCY_A,
      fields: { startDate: '2027-06-15', endDate: '2027-06-12' },
    }),
    400,
    /end date can't come before/
  );
});

test('editing a closed event is refused; open edits are saved', async () => {
  reset();
  eventRow = eventDoc({ closedAt: new Date('2026-10-01T00:00:00.000Z') });
  await rejectsWith(
    updateAgencyEvent({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      fields: { title: 'New title' },
    }),
    409,
    /Reopen this event/
  );

  reset();
  const updated = await updateAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
    fields: { title: 'Monsoon camp, second batch' },
  });
  assert.equal(updated.title, 'Monsoon camp, second batch');
  assert.equal(audits[0].action, 'event.updated');

  await rejectsWith(
    updateAgencyEvent({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      fields: { endDate: '2027-06-01' },
    }),
    400,
    /end date can't come before/
  );
  await rejectsWith(
    updateAgencyEvent({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      fields: {},
    }),
    400,
    /Provide an event change/
  );
});

test('capacity cannot drop below the confirmed headcount', async () => {
  reset();
  eventRow = eventDoc({ capacity: 5 });
  confirmedCount = 3;

  await rejectsWith(
    updateAgencyEvent({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      fields: { capacity: 2 },
    }),
    409,
    /3 confirmed travellers/
  );
  assert.equal(eventRow.capacity, 5, 'a refused write leaves the event alone');
  assert.equal(audits.length, 0);

  confirmedCount = 2;
  const updated = await updateAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
    fields: { capacity: 2 },
  });
  assert.equal(updated.capacity, 2);
});

test('publishing enforces moderation and readiness, then stamps publishedAt', async () => {
  reset();
  eventRow = eventDoc({ moderation: { hiddenAt: new Date() } });
  await rejectsWith(
    publishAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A }),
    409,
    /under review/
  );

  reset();
  eventRow = eventDoc({ summary: '' });
  await rejectsWith(
    publishAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A }),
    400,
    /Finish these first/
  );

  reset();
  const published = await publishAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
  });
  assert.equal(published.state, 'published');
  assert.ok(published.publishedAt instanceof Date);
  assert.equal(audits[0].action, 'event.published');
});

test('publishing refuses an event whose last day has passed', async () => {
  reset();
  eventRow = eventDoc({
    startDate: new Date('2026-01-10T00:00:00.000Z'),
    endDate: new Date('2026-01-12T00:00:00.000Z'),
  });
  await rejectsWith(
    publishAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A, actorId: ACTOR_ID }),
    409,
    /already finished/
  );
  assert.equal(eventRow.state, 'draft', 'a refused publish leaves the draft alone');
  assert.equal(audits.length, 0);

  // A past start with a future end is still running: travellers can join it.
  reset();
  eventRow = eventDoc({
    startDate: new Date('2026-01-10T00:00:00.000Z'),
    endDate: new Date('2027-01-12T00:00:00.000Z'),
  });
  const ongoing = await publishAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
  });
  assert.equal(ongoing.state, 'published');
  assert.equal(audits[0].action, 'event.published');
});

test('closing needs a published event and reopening restores interest', async () => {
  reset();
  await rejectsWith(
    closeAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A }),
    409,
    /Publish the event before closing/
  );

  reset();
  eventRow = eventDoc({ state: 'published', publishedAt: new Date() });
  const closed = await closeAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
  });
  assert.ok(closed.closedAt instanceof Date);
  assert.equal(audits[0].action, 'event.closed');

  const reopened = await reopenAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
  });
  assert.equal(reopened.closedAt, null);
  assert.equal(audits[1].action, 'event.reopened');
});

test('only an empty draft can be deleted', async () => {
  reset();
  eventRow = eventDoc({ state: 'published' });
  await rejectsWith(
    deleteAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A }),
    409,
    /Unpublish the event before deleting/
  );

  reset();
  interestTotal = 2;
  await rejectsWith(
    deleteAgencyEvent({ agencyId: AGENCY_A, eventId: EVENT_A }),
    409,
    /Close it instead of deleting/
  );

  reset();
  interestTotal = 0;
  const result = await deleteAgencyEvent({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    actorId: ACTOR_ID,
  });
  assert.equal(result.id, EVENT_A);
  assert.deepEqual(deleted[0], { _id: EVENT_A, agencyId: AGENCY_A });
  assert.equal(audits[0].action, 'event.deleted');
});

test('the roster queue reads pending rows first, then new-to-old', async () => {
  reset();
  interestRows = [interestDoc()];
  const roster = await listEventInterests({ agencyId: AGENCY_A, eventId: EVENT_A });

  assert.deepEqual(interestSort, { decidedAt: 1, status: 1, createdAt: -1, _id: -1 });
  assert.equal(interestQuery.eventId, EVENT_A);
  assert.equal(interestQuery.status, undefined, 'no filter means the whole roster');
  assert.equal(roster.length, 1);
  assert.equal(roster[0].status, 'pending');

  await listEventInterests({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    status: 'declined',
  });
  assert.equal(interestQuery.status, 'declined');
});

test('confirmation is capacity-guarded and idempotent', async () => {
  reset();
  confirmedCount = 2;
  await rejectsWith(
    decideEventInterest({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      interestId: INTEREST_A,
      actorId: ACTOR_ID,
      status: 'confirmed',
    }),
    409,
    /Every spot is already confirmed/
  );

  reset();
  confirmedCount = 0;
  const confirmed = await decideEventInterest({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    interestId: INTEREST_A,
    actorId: ACTOR_ID,
    status: 'confirmed',
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.ok(confirmed.decidedAt);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'event.interest_confirmed');

  // Same status again: no second audit row, same answer.
  const again = await decideEventInterest({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    interestId: INTEREST_A,
    actorId: ACTOR_ID,
    status: 'confirmed',
  });
  assert.equal(again.status, 'confirmed');
  assert.equal(audits.length, 1);

  const declined = await decideEventInterest({
    agencyId: AGENCY_A,
    eventId: EVENT_A,
    interestId: INTEREST_A,
    actorId: ACTOR_ID,
    status: 'declined',
  });
  assert.equal(declined.status, 'declined');
  assert.equal(audits[1].action, 'event.interest_declined');
});

test('an interest from another event is a 404', async () => {
  reset();
  interestRow = null;
  await rejectsWith(
    decideEventInterest({
      agencyId: AGENCY_A,
      eventId: EVENT_A,
      interestId: INTEREST_A,
      status: 'confirmed',
    }),
    404,
    /no longer on this event/
  );
});

test('the library view carries counts, cover URL and the date label', async () => {
  reset();
  countsRows = [
    { _id: { eventId: EVENT_A, status: 'confirmed' }, count: 1 },
    { _id: { eventId: EVENT_A, status: 'pending' }, count: 2 },
  ];
  eventRows = [
    eventDoc({
      state: 'published',
      publishedAt: new Date('2026-10-01T00:00:00.000Z'),
      coverAssetId: '64e000000000000000000d02',
    }),
  ];

  const events = await listAgencyEvents(AGENCY_A);
  assert.equal(events.length, 1);
  assert.equal(events[0].dateLabel, '12–15 Jun 2027');
  assert.equal(events[0].coverUrl, `/api/agency/${AGENCY_A}/assets/64e000000000000000000d02/content`);
  assert.deepEqual(events[0].interests, {
    pending: 2,
    confirmed: 1,
    declined: 0,
  });
  assert.equal(events[0].state, 'published');
  assert.equal(events[0].readiness.ready, true);

  const view = viewOwnEvent(eventDoc(), AGENCY_A);
  assert.equal(view.coverUrl, null);
  assert.deepEqual(view.interests, { pending: 0, confirmed: 0, declined: 0 });
});

test('the tenant summary counts every roster row by status', async () => {
  reset();
  countsRows = [
    { _id: 'pending', count: 3 },
    { _id: 'declined', count: 1 },
    { _id: 'archived', count: 9 },
  ];

  assert.deepEqual(await getAgencyEventInterestSummary(AGENCY_A), {
    pending: 3,
    confirmed: 0,
    declined: 1,
  });

  countsRows = [];
  assert.deepEqual(await getAgencyEventInterestSummary(AGENCY_A), {
    pending: 0,
    confirmed: 0,
    declined: 0,
  });
});
