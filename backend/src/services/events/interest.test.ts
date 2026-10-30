import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import { submitEventInterest } from './interest.js';

/**
 * Milestone 10 E2 — the guest "I'm interested" write.
 *
 * These tests pin the write-side eligibility (published, hosted, open, not
 * full), the contact normalisation, the honeypot's silent success and the
 * unique-index translation. Model calls are stubbed; no database is touched.
 */

const AGENCY_A = '64e000000000000000000c01';
const EVENT_A = '64e000000000000000000a01';

let eventRow: any = null;
let hostAgency: any = null;
let hostProfile: any = null;
let confirmedCount = 0;
let createError: any = null;
let created: any[] = [];

function chain(result: any) {
  const builder: any = {
    select: () => builder,
    lean: async () => result,
  };
  return builder;
}

const originals = {
  eventFindOne: AgencyEvent.findOne,
  interestCreate: AgencyEventInterest.create,
  interestCount: AgencyEventInterest.countDocuments,
  agencyFindOne: Agency.findOne,
  profileFindOne: AgencyProfile.findOne,
};

(AgencyEvent as any).findOne = () => chain(eventRow);
(AgencyEventInterest as any).countDocuments = async () => confirmedCount;
(AgencyEventInterest as any).create = async (payload: any) => {
  if (createError) throw createError;
  created.push(payload);
  return {
    ...payload,
    _id: '64e000000000000000000b01',
    createdAt: new Date('2026-10-30T09:00:00.000Z'),
  };
};
(Agency as any).findOne = () => chain(hostAgency);
(AgencyProfile as any).findOne = () => chain(hostProfile);

test.after(() => {
  (AgencyEvent as any).findOne = originals.eventFindOne;
  (AgencyEventInterest as any).create = originals.interestCreate;
  (AgencyEventInterest as any).countDocuments = originals.interestCount;
  (Agency as any).findOne = originals.agencyFindOne;
  (AgencyProfile as any).findOne = originals.profileFindOne;
});

function event(overrides: Record<string, unknown> = {}): any {
  return {
    _id: EVENT_A,
    agencyId: AGENCY_A,
    capacity: 20,
    closedAt: null,
    startDate: new Date('2027-06-12T00:00:00.000Z'),
    endDate: new Date('2027-06-15T00:00:00.000Z'),
    ...overrides,
  };
}

const BODY = {
  name: '  Meera Nair ',
  email: '  Meera@Example.COM ',
  phone: ' +91 98450 11111 ',
  note: '  Two of us, happy to share a tent. ',
};

function reset() {
  eventRow = event();
  hostAgency = { _id: AGENCY_A, slug: 'wildroot', name: 'Wildroot Trails' };
  hostProfile = { verifiedAt: new Date() };
  confirmedCount = 0;
  createError = null;
  created = [];
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

test('a filled honeypot succeeds silently and writes nothing', async () => {
  reset();
  const result = await submitEventInterest({
    eventId: EVENT_A,
    body: { ...BODY, website: 'https://spam.example' },
  });
  assert.equal(result, null);
  assert.equal(created.length, 0);
});

test('unknown, draft or host-less events all answer 404', async () => {
  reset();
  eventRow = null;
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    404,
    /Event not found/
  );

  reset();
  hostAgency = null;
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    404,
    /Event not found/
  );

  reset();
  hostProfile = null;
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    404,
    /Event not found/
  );
});

test('a closed window refuses new interest', async () => {
  reset();
  eventRow = event({ closedAt: new Date('2026-10-01T00:00:00.000Z') });
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    409,
    /closed/
  );
});

test('a finished event refuses new interest', async () => {
  reset();
  eventRow = event({
    startDate: new Date('2020-06-12T00:00:00.000Z'),
    endDate: new Date('2020-06-15T00:00:00.000Z'),
  });
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    409,
    /finished/
  );
});

test('a full event refuses new interest', async () => {
  reset();
  eventRow = event({ capacity: 2 });
  confirmedCount = 2;
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    409,
    /Every spot is taken/
  );
  assert.equal(created.length, 0);
});

test('an uncapped event accepts interest without counting spots', async () => {
  reset();
  eventRow = event({ capacity: null });
  confirmedCount = 99;
  const result = await submitEventInterest({ eventId: EVENT_A, body: BODY });
  assert.equal(result?.status, 'pending');
  assert.equal(created.length, 1);
});

test('contact details are normalised before the write', async () => {
  reset();
  const result = await submitEventInterest({ eventId: EVENT_A, body: BODY });

  assert.deepEqual(result, {
    id: '64e000000000000000000b01',
    status: 'pending',
    createdAt: '2026-10-30T09:00:00.000Z',
  });
  assert.deepEqual(created[0], {
    eventId: EVENT_A,
    agencyId: AGENCY_A,
    name: 'Meera Nair',
    email: 'meera@example.com',
    phone: '+91 98450 11111',
    note: 'Two of us, happy to share a tent.',
    status: 'pending',
  });
});

test('a repeated live interest maps the unique index to a friendly 409', async () => {
  reset();
  createError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: BODY }),
    409,
    /already on the list/
  );
});

test('bad contact details are rejected before any lookup', async () => {
  reset();
  eventRow = null;
  await rejectsWith(
    submitEventInterest({
      eventId: EVENT_A,
      body: { ...BODY, email: 'not-an-email' },
    }),
    400,
    /valid email/
  );
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: { ...BODY, name: 'M' } }),
    400,
    /your name/
  );
  await rejectsWith(
    submitEventInterest({ eventId: EVENT_A, body: { ...BODY, phone: '1' } }),
    400,
    /phone number/
  );
});
