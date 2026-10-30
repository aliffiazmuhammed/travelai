import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventDateLabel,
  projectPublicEventDetail,
  projectPublicEventSummary,
  PUBLIC_EVENT_AGENCY_KEYS,
  PUBLIC_EVENT_CARD_KEYS,
  PUBLIC_EVENT_DATE_KEYS,
  PUBLIC_EVENT_DETAIL_KEYS,
} from './projection.js';

/**
 * Milestone 10 E1 — what a public event payload may contain.
 *
 * The key sets are pinned whole, like the gallery and directory projections:
 * adding a field is a deliberate edit to the allow-list, never a side effect of
 * selecting one more column.
 */

const EVENT_ID = '64e000000000000000000a01';
const COVER_ID = '64e000000000000000000b01';

const AGENCY = {
  _id: '64e000000000000000000c01',
  slug: 'wildroot',
  name: 'Wildroot Trails',
  branding: { logoUrl: '/api/agency/64e000000000000000000c01/assets/64e000000000000000000d01/content' },
};
const PROFILE = { verifiedAt: new Date('2026-02-01T00:00:00.000Z') };

function event(overrides: Record<string, unknown> = {}): any {
  return {
    _id: EVENT_ID,
    agencyId: AGENCY._id,
    title: 'Monsoon nature camp',
    summary: 'Three days of forest walks and river dips.',
    kind: 'camp',
    destination: 'Coorg',
    venue: 'Kaveri riverside',
    startDate: new Date('2027-06-12T00:00:00.000Z'),
    endDate: new Date('2027-06-15T00:00:00.000Z'),
    capacity: 20,
    pricePerPerson: 8500,
    currency: 'INR',
    coverAssetId: COVER_ID,
    highlights: ['Guided night walk', 'River dip'],
    state: 'published',
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    closedAt: null,
    moderation: { hiddenAt: null, reason: 'internal note' },
    ...overrides,
  };
}

const NOW = new Date('2026-10-30T09:00:00.000Z');

test('a card carries exactly the public allow-list', () => {
  const card = projectPublicEventSummary({
    event: event(),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 3,
    now: NOW,
  });

  assert.deepEqual(Object.keys(card).sort(), [...PUBLIC_EVENT_CARD_KEYS].sort());
  assert.deepEqual(Object.keys(card.agency).sort(), [...PUBLIC_EVENT_AGENCY_KEYS].sort());
  assert.deepEqual(Object.keys(card.dates).sort(), [...PUBLIC_EVENT_DATE_KEYS].sort());
  assert.equal('agencyId' in card, false, 'the tenant id never reaches a public payload');
  assert.equal('state' in card, false);
  assert.equal('moderation' in card, false);
  assert.equal(card.agency.logoUrl, '/api/agencies/wildroot/logo');
  assert.equal(card.coverUrl, `/api/events/${EVENT_ID}/cover`);
});

test('an event page adds only the detail fields', () => {
  const detail = projectPublicEventDetail({
    event: event(),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 3,
    now: NOW,
  });

  assert.deepEqual(Object.keys(detail).sort(), [...PUBLIC_EVENT_DETAIL_KEYS].sort());
  assert.deepEqual(detail.highlights, ['Guided night walk', 'River dip']);
  assert.equal(detail.closed, false);
  assert.equal(detail.ended, false);
  assert.equal(detail.publishedAt, '2026-10-01T00:00:00.000Z');
});

test('spots left and accepting interest follow the roster and the window', () => {
  const open = projectPublicEventSummary({
    event: event({ capacity: 20 }),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 5,
    now: NOW,
  });
  assert.equal(open.spotsLeft, 15);
  assert.equal(open.acceptingInterest, true);

  const full = projectPublicEventSummary({
    event: event({ capacity: 20 }),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 20,
    now: NOW,
  });
  assert.equal(full.spotsLeft, 0);
  assert.equal(full.acceptingInterest, false, 'a full camp cannot take more interest');

  const uncapped = projectPublicEventSummary({
    event: event({ capacity: null }),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 31,
    now: NOW,
  });
  assert.equal(uncapped.spotsLeft, null);
  assert.equal(uncapped.capacity, null);
  assert.equal(uncapped.acceptingInterest, true);

  const closed = projectPublicEventSummary({
    event: event({ closedAt: new Date('2026-10-20T00:00:00.000Z') }),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 1,
    now: NOW,
  });
  assert.equal(closed.acceptingInterest, false);
});

test('an event past its end date is marked ended and takes no interest', () => {
  const detail = projectPublicEventDetail({
    event: event({
      startDate: new Date('2026-10-24T00:00:00.000Z'),
      endDate: new Date('2026-10-26T00:00:00.000Z'),
    }),
    agency: AGENCY,
    profile: PROFILE,
    confirmedCount: 5,
    now: NOW,
  });

  assert.equal(detail.ended, true);
  assert.equal(detail.acceptingInterest, false);
  assert.equal(
    detail.spotsLeft,
    null,
    'a finished event has no spots left to advertise'
  );
  assert.equal(detail.capacity, 20, 'the group size it ran with is still shown');
});

test('unknown kinds fall back to other and blanks stay blank', () => {
  const card = projectPublicEventSummary({
    event: event({
      kind: 'expedition',
      pricePerPerson: null,
      currency: '',
      destination: null,
      venue: undefined,
      coverAssetId: null,
    }),
    agency: AGENCY,
    profile: PROFILE,
    now: NOW,
  });

  assert.equal(card.kind, 'other');
  assert.equal(card.pricePerPerson, null);
  assert.equal(card.currency, 'INR');
  assert.equal(card.destination, '');
  assert.equal(card.venue, '');
  assert.equal(card.coverUrl, null);
});

test('date labels are stable UTC windows', () => {
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

  assert.equal(eventDateLabel(day('2027-06-12'), day('2027-06-15')), '12–15 Jun 2027');
  assert.equal(eventDateLabel(day('2027-11-28'), day('2027-12-03')), '28 Nov – 3 Dec 2027');
  assert.equal(
    eventDateLabel(day('2027-12-28'), day('2028-01-03')),
    '28 Dec 2027 – 3 Jan 2028'
  );
  assert.equal(eventDateLabel(day('2027-06-12'), day('2027-06-12')), '12 Jun 2027');
  assert.equal(eventDateLabel(day('2027-06-12'), null), '12 Jun 2027');
  assert.equal(
    eventDateLabel(day('2027-06-12'), day('2027-06-10')),
    '12 Jun 2027',
    'an end before the start reads as a one-day event'
  );
});
