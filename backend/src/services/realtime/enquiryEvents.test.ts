import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agencyChannel,
  emitEnquiryCreated,
  emitEnquiryMessage,
  emitEnquiryRead,
  emitEnquiryUpdated,
  emitProposalCreated,
  emitProposalDeclined,
  emitTo,
  isEnquirySseEnabled,
  openStream,
  resetForTests,
  streamCount,
  userChannel,
  type EnquiryEvent,
} from './enquiryEvents.js';
import { env } from '../../config/env.js';

/**
 * Milestone 9 R1 — the enquiry live bus.
 *
 * These tests pin the transport contract the SPA will code against: two channel
 * kinds, frames that are hints rather than state, fan-out that survives a dead
 * socket, and an eviction cap that never refuses the newest stream.
 */

test.beforeEach(() => resetForTests());

function collect(channel: string): { events: EnquiryEvent[]; close: () => void } {
  const events: EnquiryEvent[] = [];
  const close = openStream(channel, {
    deliver: (event) => events.push(event),
    close: () => {},
  });
  return { events, close };
}

const ENQUIRY_ID = '64c000000000000000000801';
const AGENCY_ID = '64c000000000000000000802';
const USER_ID = '64c000000000000000000803';

function row(overrides: Record<string, unknown> = {}) {
  return {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    status: 'new',
    createdAt: new Date('2026-10-29T08:00:00.000Z'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Channels                                                                  */
/* -------------------------------------------------------------------------- */

test('channel helpers namespace each audience and reject empty ids', () => {
  assert.equal(userChannel(USER_ID), `user:${USER_ID}`);
  assert.equal(agencyChannel(AGENCY_ID), `agency:${AGENCY_ID}`);
  assert.equal(userChannel('  '), '');
  assert.equal(userChannel(null), '');
  assert.equal(agencyChannel(undefined), '');
  // An empty id can never address a shared channel.
  assert.equal(streamCount(userChannel('')), 0);
});

test('the live tier is off unless ENABLE_ENQUIRY_SSE is explicitly set', () => {
  assert.equal(isEnquirySseEnabled(), env.ENABLE_ENQUIRY_SSE);
});

/* -------------------------------------------------------------------------- */
/*  Transport                                                                 */
/* -------------------------------------------------------------------------- */

test('a frame reaches only the streams on its own channel', () => {
  const mine = collect(userChannel(USER_ID));
  const theirs = collect(userChannel('someone-else'));
  const tenant = collect(agencyChannel(AGENCY_ID));

  emitTo(userChannel(USER_ID), { type: 'hello', channel: userChannel(USER_ID), at: 'now' });

  assert.equal(mine.events.length, 1);
  assert.equal(theirs.events.length, 0);
  assert.equal(tenant.events.length, 0);
});

test('unsubscribing stops delivery and leaves the channel when the last stream goes', () => {
  const { events, close } = collect(agencyChannel(AGENCY_ID));
  close();
  assert.equal(streamCount(agencyChannel(AGENCY_ID)), 0);

  emitTo(agencyChannel(AGENCY_ID), {
    type: 'enquiry:updated',
    enquiryId: ENQUIRY_ID,
    status: 'won',
    at: 'now',
  });
  assert.equal(events.length, 0);

  // Releasing twice is harmless (both `req.close` and `res.close` fire).
  close();
  assert.equal(streamCount(agencyChannel(AGENCY_ID)), 0);
});

test('a throwing stream cannot break delivery to the others', () => {
  const healthy = collect(agencyChannel(AGENCY_ID));
  openStream(agencyChannel(AGENCY_ID), {
    deliver: () => {
      throw new Error('socket died');
    },
    close: () => {},
  });

  emitTo(agencyChannel(AGENCY_ID), {
    type: 'enquiry:updated',
    enquiryId: ENQUIRY_ID,
    status: 'replied',
    at: 'now',
  });

  assert.equal(healthy.events.length, 1);
});

test('past the cap the oldest stream is closed, never the newest', () => {
  const closed: number[] = [];
  const cap = env.ENQUIRY_SSE_MAX_STREAMS;
  const channel = agencyChannel(AGENCY_ID);

  for (let index = 0; index < cap; index += 1) {
    openStream(channel, {
      deliver: () => {},
      close: () => closed.push(index),
    });
  }
  assert.equal(streamCount(channel), cap);

  let newest = 0;
  openStream(channel, {
    deliver: () => {
      newest += 1;
    },
    close: () => closed.push(cap),
  });

  assert.equal(streamCount(channel), cap);
  assert.deepEqual(closed, [0], 'only the oldest stream is evicted');

  emitTo(channel, {
    type: 'enquiry:updated',
    enquiryId: ENQUIRY_ID,
    status: 'new',
    at: 'now',
  });
  assert.equal(newest, 1, 'the stream that triggered the cap still receives');
});

/* -------------------------------------------------------------------------- */
/*  Frame contract                                                            */
/* -------------------------------------------------------------------------- */

test('a new enquiry notifies the tenant inbox only, with an exact key set', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitEnquiryCreated(row());

  assert.equal(traveller.events.length, 0, 'the submitter already answered inline');
  assert.equal(tenant.events.length, 1);
  assert.deepEqual(Object.keys(tenant.events[0]).sort(), [
    'at',
    'createdAt',
    'enquiryId',
    'status',
    'type',
  ]);
  assert.equal(tenant.events[0].type, 'enquiry:new');
  assert.equal((tenant.events[0] as any).createdAt, '2026-10-29T08:00:00.000Z');
});

test('a new reply reaches both sides with its projection and both counters', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));
  const message = {
    id: '64c000000000000000000804',
    author: 'agency' as const,
    authorName: 'Ravi',
    body: 'Sending a plan today.',
    createdAt: '2026-10-29T09:00:00.000Z',
    readByAgencyAt: '2026-10-29T09:00:00.000Z',
    readByTravellerAt: null,
  };

  emitEnquiryMessage(row({ status: 'replied' }), {
    message,
    unread: { agency: 0, traveller: 1 },
    lastMessageAt: '2026-10-29T09:00:00.000Z',
    lastMessageBy: 'agency',
  });

  assert.equal(tenant.events.length, 1);
  assert.equal(traveller.events.length, 1);
  const frame = traveller.events[0] as any;
  assert.deepEqual(Object.keys(frame).sort(), [
    'at',
    'enquiryId',
    'lastMessageAt',
    'lastMessageBy',
    'message',
    'status',
    'type',
    'unread',
  ]);
  assert.deepEqual(frame.message, message);
  assert.deepEqual(frame.unread, { agency: 0, traveller: 1 });
  assert.equal(frame.status, 'replied');
});

test('a legacy guest enquiry has no personal channel to notify', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitEnquiryMessage(row({ userId: null }), {
    message: {
      id: 'm1',
      author: 'traveller',
      authorName: 'Guest',
      body: 'Still here',
      createdAt: null,
      readByAgencyAt: null,
      readByTravellerAt: null,
    },
    unread: { agency: 1, traveller: 0 },
    lastMessageAt: null,
    lastMessageBy: 'traveller',
  });

  assert.equal(tenant.events.length, 1);
  assert.equal(traveller.events.length, 0);
});

test('a status change carries the status and never the internal assignee', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitEnquiryUpdated(row({ status: 'won', assignedTo: '64c000000000000000000805' }));

  assert.equal(tenant.events.length, 1);
  assert.equal(traveller.events.length, 1);
  assert.deepEqual(Object.keys(traveller.events[0]).sort(), [
    'at',
    'enquiryId',
    'status',
    'type',
  ]);
  assert.equal((traveller.events[0] as any).status, 'won');
  assert.equal(JSON.stringify(traveller.events[0]).includes('64c000000000000000000805'), false);
});

test('a read receipt goes to the other side only', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitEnquiryRead(row(), 'agency');
  assert.equal(traveller.events.length, 1);
  assert.equal(tenant.events.length, 0);
  assert.deepEqual(Object.keys(traveller.events[0]).sort(), [
    'at',
    'enquiryId',
    'side',
    'type',
  ]);
  assert.equal((traveller.events[0] as any).side, 'agency');

  emitEnquiryRead(row(), 'traveller');
  assert.equal(tenant.events.length, 1);
  assert.equal(traveller.events.length, 1);
  assert.equal((tenant.events[0] as any).side, 'traveller');
});

test('a read receipt for a guest row stops at the agency channel', () => {
  const traveller = collect(userChannel(USER_ID));
  emitEnquiryRead(row({ userId: null }), 'traveller');
  assert.equal(traveller.events.length, 0);
});

test('a new proposal notifies only the traveller who sent the enquiry', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitProposalCreated({
    enquiryId: ENQUIRY_ID,
    userId: USER_ID,
    linkId: '64c000000000000000000806',
  });

  assert.equal(tenant.events.length, 0);
  assert.equal(traveller.events.length, 1);
  assert.deepEqual(Object.keys(traveller.events[0]).sort(), [
    'at',
    'enquiryId',
    'linkId',
    'type',
  ]);
});

test('a declined proposal reaches the tenant only, naming the link', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  const traveller = collect(userChannel(USER_ID));

  emitProposalDeclined({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    linkId: '64c000000000000000000807',
    declinedAt: new Date('2026-10-29T10:00:00.000Z'),
  });

  assert.equal(traveller.events.length, 0, 'the traveller already answered');
  assert.equal(tenant.events.length, 1);
  assert.deepEqual(Object.keys(tenant.events[0]).sort(), [
    'at',
    'declinedAt',
    'enquiryId',
    'linkId',
    'type',
  ]);
  assert.equal((tenant.events[0] as any).declinedAt, '2026-10-29T10:00:00.000Z');
});

test('an emitter with no row id is silent instead of addressing a shared channel', () => {
  const tenant = collect(agencyChannel(AGENCY_ID));
  emitEnquiryCreated({ agencyId: AGENCY_ID });
  emitEnquiryUpdated({ userId: USER_ID });
  emitEnquiryRead({}, 'agency');
  emitProposalCreated({ enquiryId: '', userId: USER_ID, linkId: 'l1' });
  emitProposalDeclined({ agencyId: AGENCY_ID, linkId: '' });
  assert.equal(tenant.events.length, 0);
});
