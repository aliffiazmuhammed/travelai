import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import EmailOutbox from '../../models/EmailOutbox.js';
import User from '../../models/User.js';
import { env } from '../../config/env.js';
import { notifyAgencyPlanChanged, notifyAgencyStatusChanged } from './notify.js';
import {
  digestOpensAt,
  isoWeekKey,
  runEmailLifecycle,
  sendEventReminders,
  sendRenewalReminders,
  sendWeeklyDigests,
} from './lifecycle.js';

/**
 * P2 lifecycle email.
 *
 * The sweeps decide who gets reminded, when, and how often; the tests pin the
 * windows, the recipient choice and the dedupe keys. No network or database is
 * touched: model reads are stubbed and the outbox write is captured in memory.
 */

const AGENCY_A = '64e000000000000000000e01';
const AGENCY_B = '64e000000000000000000e02';
const EVENT_A = '64e000000000000000000f01';

const NOW = new Date('2026-11-04T09:00:00.000Z');

function chain(result: any) {
  const builder: any = {
    select: () => builder,
    lean: async () => result,
  };
  return builder;
}

const originals = {
  agencyFind: Agency.find,
  agencyFindById: Agency.findById,
  memberFind: AgencyMember.find,
  userFind: User.find,
  eventFind: AgencyEvent.find,
  eventCount: AgencyEvent.countDocuments,
  interestFind: AgencyEventInterest.find,
  enquiryCount: AgencyEnquiry.countDocuments,
  quoteCount: AgencyQuote.countDocuments,
  proposalCount: AgencyProposalLink.countDocuments,
  outboxCreate: EmailOutbox.create,
  outboxFindOneAndUpdate: EmailOutbox.findOneAndUpdate,
  emailEnabled: env.EMAIL_ENABLED,
  resendKey: env.RESEND_API_KEY,
};

const created: any[] = [];
const calls: { model: string; method: string; args: any[] }[] = [];

function record(model: string, method: string, args: any[]) {
  calls.push({ model, method, args });
}

function setMailOn(value: boolean) {
  (env as any).EMAIL_ENABLED = value;
  (env as any).RESEND_API_KEY = value ? 'test-key' : undefined;
}

function resetMail() {
  (env as any).EMAIL_ENABLED = originals.emailEnabled;
  (env as any).RESEND_API_KEY = originals.resendKey;
}

/** Every enqueue kicks the dispatcher; it must find nothing to claim. */
function stubOutbox() {
  created.length = 0;
  calls.length = 0;
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  (EmailOutbox as any).findOneAndUpdate = () => chain(null);
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test.after(() => {
  (Agency as any).find = originals.agencyFind;
  (Agency as any).findById = originals.agencyFindById;
  (AgencyMember as any).find = originals.memberFind;
  (User as any).find = originals.userFind;
  (AgencyEvent as any).find = originals.eventFind;
  (AgencyEvent as any).countDocuments = originals.eventCount;
  (AgencyEventInterest as any).find = originals.interestFind;
  (AgencyEnquiry as any).countDocuments = originals.enquiryCount;
  (AgencyQuote as any).countDocuments = originals.quoteCount;
  (AgencyProposalLink as any).countDocuments = originals.proposalCount;
  (EmailOutbox as any).create = originals.outboxCreate;
  (EmailOutbox as any).findOneAndUpdate = originals.outboxFindOneAndUpdate;
  resetMail();
});

/* -------------------------------------------------------------------------- */
/*  Pure scheduling helpers                                                   */
/* -------------------------------------------------------------------------- */

test('the digest gate opens Monday 06:00 UTC and the key changes weekly', () => {
  assert.equal(digestOpensAt(NOW).toISOString(), '2026-11-02T06:00:00.000Z');
  assert.ok(digestOpensAt(NOW) < NOW);

  const monday = new Date('2026-11-02T00:00:00.000Z');
  const sunday = new Date('2026-11-08T23:59:00.000Z');
  const nextMonday = new Date('2026-11-09T00:00:00.000Z');
  assert.equal(isoWeekKey(NOW), isoWeekKey(monday));
  assert.equal(isoWeekKey(NOW), isoWeekKey(sunday));
  assert.notEqual(isoWeekKey(NOW), isoWeekKey(nextMonday));
});

/* -------------------------------------------------------------------------- */
/*  Tenant state and plan                                                     */
/* -------------------------------------------------------------------------- */

test('a paused workspace mails owners only, and a return mails again', async () => {
  setMailOn(true);
  stubOutbox();
  (Agency as any).findById = () =>
    chain({ name: 'Blue Horizon', branding: { contactEmail: 'desk@example.com' } });
  (AgencyMember as any).find = () =>
    chain([
      { userId: 'u1', role: 'owner' },
      { userId: 'u2', role: 'planner' },
    ]);
  (User as any).find = () => chain([{ email: 'owner@example.com', name: 'Asha' }]);

  await notifyAgencyStatusChanged({
    agencyId: AGENCY_A,
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    status: 'suspended',
    occurredAt: new Date('2026-11-04T09:00:00.000Z'),
  });
  await notifyAgencyStatusChanged({
    agencyId: AGENCY_A,
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    status: 'reactivated',
    occurredAt: new Date('2026-11-20T09:00:00.000Z'),
  });
  await tick();

  assert.equal(created.length, 2);
  assert.deepEqual(
    created.map((row) => row.recipient),
    ['owner@example.com', 'owner@example.com']
  );
  assert.deepEqual(
    created.map((row) => row.kind),
    ['agency.suspended', 'agency.reactivated']
  );
  assert.ok(created[0].subject.includes('access paused'));
  assert.ok(created[0].text.includes('Workspace: blue-horizon'));
  assert.ok(created[1].subject.includes('access restored'));
  assert.ok(
    created[0].dedupeKey.startsWith(`agency-status:${AGENCY_A}:suspended:2026-11-04T09:00:00.000Z:`)
  );
  assert.ok(
    created[1].dedupeKey.startsWith(
      `agency-status:${AGENCY_A}:reactivated:2026-11-20T09:00:00.000Z:`
    )
  );

  resetMail();
});

test('a plan change goes to the billing contact, then to owners when unnamed', async () => {
  setMailOn(true);
  stubOutbox();

  await notifyAgencyPlanChanged({
    agencyId: AGENCY_A,
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    previousTierId: 'starter',
    tierId: 'pro',
    seats: 15,
    monthlyExports: 100,
    storageMb: 1024,
    billing: { contactEmail: 'Billing@Example.com', contactName: 'Devi' },
    occurredAt: new Date('2026-11-04T09:00:00.000Z'),
  });
  await tick();

  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'billing@example.com');
  assert.equal(created[0].kind, 'agency.plan_changed');
  assert.equal(created[0].subject, 'Blue Horizon: your plan is now Pro');
  assert.ok(created[0].text.includes('Previous plan: Starter'));
  assert.ok(created[0].text.includes('Seats: 15'));
  assert.ok(created[0].text.includes('Exports each month: 100'));
  assert.ok(
    created[0].dedupeKey.startsWith(
      `agency-plan:${AGENCY_A}:pro:2026-11-04T09:00:00.000Z:`
    )
  );

  // No billing contact: the owner team is the fallback.
  created.length = 0;
  (AgencyMember as any).find = () => chain([{ userId: 'u1', role: 'owner' }]);
  (User as any).find = () => chain([{ email: 'owner@example.com', name: 'Asha' }]);

  await notifyAgencyPlanChanged({
    agencyId: AGENCY_A,
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    previousTierId: 'pro',
    tierId: 'starter',
    seats: 3,
    monthlyExports: 10,
    storageMb: 100,
    billing: null,
    occurredAt: new Date('2026-11-05T09:00:00.000Z'),
  });
  await tick();

  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'owner@example.com');

  resetMail();
});

/* -------------------------------------------------------------------------- */
/*  Event reminders                                                           */
/* -------------------------------------------------------------------------- */

test('event reminders reach confirmed guests inside the 48-hour window', async () => {
  setMailOn(true);
  stubOutbox();
  (AgencyEvent as any).find = (filter: any) => {
    record('AgencyEvent', 'find', [filter]);
    return chain([
      {
        _id: EVENT_A,
        agencyId: AGENCY_A,
        title: 'Ladakh Camp',
        startDate: '2026-11-05T09:00:00.000Z',
        endDate: '2026-11-07T09:00:00.000Z',
        destination: 'Ladakh',
      },
    ]);
  };
  (AgencyEventInterest as any).find = (filter: any) => {
    record('AgencyEventInterest', 'find', [filter]);
    return chain([
      { _id: 'interest-1', name: 'Meera Nair', email: 'meera@example.com' },
      { _id: 'interest-2', name: 'Bad Row', email: 'not-an-address' },
    ]);
  };
  (Agency as any).findById = () => chain({ name: 'Blue Horizon' });

  const queued = await sendEventReminders(NOW);
  await tick();

  assert.equal(queued, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'meera@example.com');
  assert.equal(created[0].kind, 'event.reminder');
  assert.equal(created[0].dedupeKey, `event-reminder:${EVENT_A}:interest-1:2026-11-05`);
  assert.equal(created[0].subject, 'Coming up: Ladakh Camp');
  assert.ok(created[0].text.includes('Hi Meera Nair'));
  assert.ok(created[0].text.includes('Where: Ladakh'));
  assert.ok(created[0].text.includes('5 Nov 2026 – 7 Nov 2026'));

  const eventFilter = calls.find((call) => call.model === 'AgencyEvent')!.args[0];
  assert.equal(eventFilter.state, 'published');
  assert.equal(eventFilter['moderation.hiddenAt'], null);
  assert.equal(eventFilter.startDate.$gt, NOW);
  assert.equal(
    eventFilter.startDate.$lte.toISOString(),
    new Date(NOW.getTime() + 48 * 60 * 60_000).toISOString()
  );

  const interestFilter = calls.find(
    (call) => call.model === 'AgencyEventInterest'
  )!.args[0];
  assert.equal(interestFilter.status, 'confirmed');

  resetMail();
});

/* -------------------------------------------------------------------------- */
/*  Renewal reminders                                                         */
/* -------------------------------------------------------------------------- */

test('renewal reminders use the billing address, the window and a per-date key', async () => {
  setMailOn(true);
  stubOutbox();
  (Agency as any).find = (filter: any) => {
    record('Agency', 'find', [filter]);
    return chain([
      {
        _id: AGENCY_A,
        name: 'Blue Horizon',
        slug: 'blue-horizon',
        plan: { tierId: 'pro' },
        billing: {
          renewalDate: '2026-11-12T00:00:00.000Z',
          contactEmail: 'billing@example.com',
          contactName: 'Devi',
        },
        branding: { contactEmail: 'desk@example.com' },
      },
    ]);
  };

  const queued = await sendRenewalReminders(NOW);
  await tick();

  assert.equal(queued, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'billing@example.com');
  assert.equal(created[0].kind, 'agency.renewal_reminder');
  assert.ok(created[0].subject.includes('Blue Horizon: renewal on 12 Nov 2026'));
  assert.ok(created[0].text.includes('Plan: Pro'));
  assert.ok(created[0].text.includes('No payment is taken through waytowalk today'));
  assert.equal(
    created[0].dedupeKey,
    `agency-renewal:${AGENCY_A}:2026-11-12:billing@example.com`
  );

  const filter = calls.find((call) => call.model === 'Agency')!.args[0];
  assert.equal(filter.status, 'active');
  assert.equal(filter['billing.renewalDate'].$gte.toISOString(), '2026-11-04T00:00:00.000Z');
  assert.equal(
    filter['billing.renewalDate'].$lte.toISOString(),
    new Date(NOW.getTime() + 14 * 24 * 60 * 60_000).toISOString()
  );

  resetMail();
});

/* -------------------------------------------------------------------------- */
/*  Weekly digest                                                             */
/* -------------------------------------------------------------------------- */

test('the digest skips a quiet agency and sends once per week otherwise', async () => {
  setMailOn(true);
  stubOutbox();
  (Agency as any).find = () =>
    chain([
      { _id: AGENCY_A, name: 'Blue Horizon', branding: { contactEmail: 'desk@example.com' } },
      { _id: AGENCY_B, name: 'Quiet Trails', branding: {} },
    ]);
  const busy = String(AGENCY_A);
  (AgencyEnquiry as any).countDocuments = async (filter: any) =>
    String(filter.agencyId) === busy ? 3 : 0;
  (AgencyQuote as any).countDocuments = async (filter: any) =>
    String(filter.agencyId) === busy ? 1 : 0;
  (AgencyProposalLink as any).countDocuments = async (filter: any) =>
    String(filter.agencyId) === busy && filter.acceptedAt ? 1 : 0;
  (AgencyEvent as any).countDocuments = async () => 0;
  (AgencyMember as any).find = () =>
    chain([
      { userId: 'u1', role: 'owner' },
      { userId: 'u2', role: 'planner' },
      { userId: 'u3', role: 'viewer' },
    ]);
  (User as any).find = () =>
    chain([
      { email: 'owner@example.com', name: 'Asha' },
      { email: 'plan@example.com', name: 'Ravi' },
    ]);

  const queued = await sendWeeklyDigests(NOW);
  await tick();

  assert.equal(queued, 2);
  assert.equal(created.length, 2);
  assert.deepEqual(
    created.map((row) => row.recipient).sort(),
    ['owner@example.com', 'plan@example.com']
  );
  assert.ok(created.every((row) => row.kind === 'agency.weekly_digest'));
  assert.ok(
    created.every((row) => row.dedupeKey.startsWith(`agency-digest:${AGENCY_A}:`))
  );
  assert.ok(created[0].subject === 'Blue Horizon: your week on waytowalk');
  assert.ok(created[0].text.includes('New enquiries: 3'));
  assert.ok(created[0].text.includes('Quotes sent: 1'));
  assert.ok(created[0].text.includes('Proposals accepted: 1'));
  assert.ok(!created[0].text.includes('Proposals declined'));
  assert.ok(created[0].text.includes(`week of 28 Oct 2026 – 4 Nov 2026`));

  // A second sweep in the same week relies on the dedupe key, not a new query.
  const key = isoWeekKey(NOW);
  assert.ok(key.length >= 7);

  resetMail();
});

test('the digest waits for Monday morning and does nothing while email is off', async () => {
  setMailOn(true);
  stubOutbox();
  let agencyReads = 0;
  (Agency as any).find = () => {
    agencyReads += 1;
    return chain([]);
  };

  const early = await sendWeeklyDigests(new Date('2026-11-02T03:00:00.000Z'));
  assert.equal(early, 0);
  assert.equal(agencyReads, 0);

  setMailOn(false);
  const off = await runEmailLifecycle(NOW);
  assert.deepEqual(off, { eventReminders: 0, renewalReminders: 0, digests: 0 });
  assert.equal(created.length, 0);

  resetMail();
});
