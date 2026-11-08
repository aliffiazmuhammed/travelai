import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import EmailOutbox from '../../models/EmailOutbox.js';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { env } from '../../config/env.js';
import { MailSendError, mailIsConfigured, sendEmailWithProvider } from './mailer.js';
import {
  enqueueEmail,
  replyDedupeKey,
  retryDelayMs,
} from './outbox.js';
import {
  agencyTeamRecipients,
  platformAdminRecipients,
  recipientForAddress,
  travellerRecipientForEnquiry,
} from './recipients.js';
import {
  enquiryPartyLabel,
  latestMessageBody,
  notifyAgencyApplicationApproved,
  notifyAgencyApplicationReceived,
  notifyAgencyApplicationRejected,
  notifyAgencyInvite,
  notifyAgencyNewEnquiry,
  notifyAgencyOwnerCredentials,
  notifyAgencyPasswordReset,
  notifyPasswordReset,
  notifyTravellerAgencyReply,
  notifyTripInvite,
} from './notify.js';
import {
  formatDateRange,
  formatMoney,
  renderAgencyApplicationApproved,
  renderAgencyApplicationReceived,
  renderAgencyApplicationRejected,
  renderAgencyCredentials,
  renderAgencyEventInterest,
  renderAgencyInvite,
  renderAgencyNewEnquiry,
  renderAgencyProposalAccepted,
  renderAgencyProposalDeclined,
  renderPasswordReset,
  renderPlatformApplicationReceived,
  renderTravellerAgencyReply,
  renderTravellerEventDecision,
  renderTravellerProposalShared,
  renderTravellerQuoteSent,
  renderTripInvite,
} from './templates.js';

/**
 * P0 transactional email.
 *
 * These tests pin the parts that decide whether a real person gets the right
 * message: recipient selection, template escaping and links, the dedupe window
 * and the retry policy. Provider calls and model writes are stubbed; the suite
 * never touches the network or a database.
 */

const AGENCY_A = '64e000000000000000000c01';
const ENQUIRY_A = '64e000000000000000000d01';

function chain(result: any) {
  const builder: any = {
    select: () => builder,
    lean: async () => result,
  };
  return builder;
}

const originals = {
  agencyFindById: Agency.findById,
  memberFind: AgencyMember.find,
  tripFindById: Trip.findById,
  userFind: User.find,
  userFindOne: User.findOne,
  userFindById: User.findById,
  outboxCreate: EmailOutbox.create,
  outboxFindOneAndUpdate: EmailOutbox.findOneAndUpdate,
  emailEnabled: env.EMAIL_ENABLED,
  resendKey: env.RESEND_API_KEY,
};

const created: any[] = [];

function setMailOn(value: boolean) {
  (env as any).EMAIL_ENABLED = value;
  (env as any).RESEND_API_KEY = value ? 'test-key' : undefined;
}

function resetMail() {
  created.length = 0;
  (env as any).EMAIL_ENABLED = originals.emailEnabled;
  (env as any).RESEND_API_KEY = originals.resendKey;
}

test.after(() => {
  (Agency as any).findById = originals.agencyFindById;
  (AgencyMember as any).find = originals.memberFind;
  (Trip as any).findById = originals.tripFindById;
  (User as any).find = originals.userFind;
  (User as any).findOne = originals.userFindOne;
  (User as any).findById = originals.userFindById;
  (EmailOutbox as any).create = originals.outboxCreate;
  (EmailOutbox as any).findOneAndUpdate = originals.outboxFindOneAndUpdate;
  resetMail();
});

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

test('templates escape visitor text and keep the link intact', () => {
  const email = renderAgencyNewEnquiry({
    agencyName: 'Blue Horizon',
    travellerName: '<script>alert(1)</script>',
    message: 'We are six friends & two kids <b>hoping</b> for Ladakh.',
    dates: '10 Feb 2027 – 14 Feb 2027',
    party: '6 adults, 2 children',
    budgetBand: '25k_50k',
    inboxUrl: 'http://localhost:8080/agency/enquiries',
  });

  assert.match(email.subject, /^New enquiry from /);
  assert.ok(email.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!email.html.includes('<script>alert(1)</script>'));
  assert.ok(email.html.includes('friends &amp; two kids'));
  assert.ok(email.html.includes('http://localhost:8080/agency/enquiries'));
  assert.ok(email.text.includes('Budget: ₹25,000–₹50,000 per person'));
  assert.ok(!email.subject.includes('\n'));
});

test('a subject collapses newlines from a visitor-supplied name', () => {
  const email = renderTravellerAgencyReply({
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    message: 'Hi',
    threadUrl: 'http://localhost:8080/enquiry/abc',
  });
  assert.ok(!email.subject.includes('\n'));
  assert.match(email.subject, /^Blue Horizon replied to your enquiry$/);
});

test('quote and proposal templates carry the number, total and destination link', () => {
  const quote = renderTravellerQuoteSent({
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    quoteNumber: 'Q-2026-0042',
    total: formatMoney(120000, 'INR'),
    validUntil: formatDateRange('2027-02-01'),
    threadUrl: 'http://localhost:8080/enquiry/abc',
  });
  assert.equal(formatMoney(120000, 'INR'), '₹1,20,000');
  assert.ok(quote.html.includes('Q-2026-0042'));
  assert.ok(quote.html.includes('₹1,20,000'));
  assert.ok(quote.html.includes('1 Feb 2027'));

  const shared = renderTravellerProposalShared({
    agencyName: 'Blue Horizon',
    clientName: 'Meera',
    quoteNumber: 'Q-2026-0042',
    total: '₹1,20,000',
    expiresOn: '3 Mar 2027',
    proposalUrl: 'https://travelai.example/proposal/token',
  });
  assert.ok(shared.html.includes('https://travelai.example/proposal/token'));
  assert.equal(shared.subject, 'Blue Horizon sent you a proposal');
});

test('accepted and declined templates say different things', () => {
  const base = {
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    quoteNumber: 'Q-2026-0042',
    total: '₹1,20,000',
    inboxUrl: 'http://localhost:8080/agency/enquiries',
  };
  const accepted = renderAgencyProposalAccepted({ ...base, answer: 'accepted' });
  const declined = renderAgencyProposalDeclined({ ...base, answer: 'declined' });

  assert.match(accepted.subject, /accepted proposal Q-2026-0042/);
  assert.match(declined.subject, /declined proposal Q-2026-0042/);
  assert.ok(accepted.text.includes('said yes'));
  assert.ok(declined.text.includes('open'));
});

test('event templates link the roster and the public page', () => {
  const interest = renderAgencyEventInterest({
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    eventTitle: 'Winter Spiti Camp',
    eventDates: '4 Mar 2027 – 9 Mar 2027',
    note: 'Two of us, happy to share a tent.',
    rosterUrl: 'http://localhost:8080/agency/events',
  });
  assert.ok(interest.html.includes('http://localhost:8080/agency/events'));
  assert.ok(interest.html.includes('Winter Spiti Camp'));

  const confirmed = renderTravellerEventDecision({
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    eventTitle: 'Winter Spiti Camp',
    status: 'confirmed',
    eventUrl: 'http://localhost:8080/explore/events/e1',
  });
  const declined = renderTravellerEventDecision({
    agencyName: 'Blue Horizon',
    travellerName: 'Meera',
    eventTitle: 'Winter Spiti Camp',
    status: 'declined',
    eventUrl: 'http://localhost:8080/explore/events/e1',
  });
  assert.match(confirmed.subject, /confirmed/);
  assert.ok(!declined.subject.includes('confirmed'));
  assert.ok(declined.text.includes('could not offer you a spot'));
});

test('invite templates name the inviter, the role and the way in', () => {
  const trip = renderTripInvite({
    inviterName: 'Asha',
    tripTitle: 'Ladakh in February',
    destination: 'Ladakh',
    role: 'planner',
    expiresOn: '11 Nov 2026',
    inviteUrl: 'https://travelai.example/invite/abc',
  });
  assert.equal(trip.subject, 'Asha invited you to Ladakh in February');
  assert.ok(trip.html.includes('https://travelai.example/invite/abc'));
  assert.ok(trip.text.includes('Your role: planner'));
  assert.ok(trip.text.includes('Destination: Ladakh'));

  const agency = renderAgencyInvite({
    agencyName: 'Blue Horizon',
    role: 'editor',
    inviteUrl: 'https://travelai.example/agency/invite/abc',
  });
  assert.equal(agency.subject, "You're invited to the Blue Horizon workspace");
  assert.ok(agency.html.includes('https://travelai.example/agency/invite/abc'));
  assert.ok(agency.text.includes('Your role: editor'));
});

test('application mail says what happens next without the internal reason', () => {
  const received = renderAgencyApplicationReceived({ agencyName: 'Blue Horizon' });
  assert.ok(received.text.includes('Blue Horizon'));

  const admins = renderPlatformApplicationReceived({
    agencyName: 'Blue Horizon',
    email: 'owner@example.com',
    phone: '+919876543210',
    note: 'We run Ladakh trips.',
  });
  assert.ok(admins.html.includes('/admin/applications'));
  assert.ok(admins.text.includes('+919876543210'));

  const approved = renderAgencyApplicationApproved({
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    email: 'owner@example.com',
    credentialsIssued: true,
  });
  assert.equal(approved.subject, 'Blue Horizon: your waytowalk workspace is ready');
  assert.ok(approved.text.includes('separate email'));

  const existing = renderAgencyApplicationApproved({
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    email: 'owner@example.com',
    credentialsIssued: false,
  });
  assert.ok(existing.text.includes('password you already use'));

  const rejected = renderAgencyApplicationRejected({ agencyName: 'Blue Horizon' });
  assert.equal(rejected.subject, 'An update on your waytowalk application');
  assert.ok(rejected.text.includes('not moving forward'));
  assert.ok(!rejected.html.includes('decisionNote'));
});

test('credential and reset templates carry the temporary password and expiry', () => {
  const base = {
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    email: 'owner@example.com',
    temporaryPassword: 'Temp!Pass123',
  };
  const issued = renderAgencyCredentials({ ...base, reset: false });
  assert.match(issued.subject, /sign-in details/);
  assert.ok(issued.text.includes('Temporary password: Temp!Pass123'));
  assert.ok(issued.text.includes('Workspace: blue-horizon'));

  const reset = renderAgencyCredentials({ ...base, reset: true });
  assert.match(reset.subject, /password was reset/);
  assert.ok(reset.text.includes('Temp!Pass123'));

  const passwordReset = renderPasswordReset({
    name: 'Meera',
    resetUrl: 'https://travelai.example/reset-password/tok',
    expiresMinutes: 60,
  });
  assert.equal(passwordReset.subject, 'Reset your waytowalk password');
  assert.ok(passwordReset.text.includes('Hi Meera'));
  assert.ok(passwordReset.text.includes('expires in 60 minutes'));
  assert.ok(passwordReset.html.includes('https://travelai.example/reset-password/tok'));
  assert.ok(
    renderPasswordReset({ resetUrl: 'x', expiresMinutes: 60 }).text.includes('Hi there')
  );
});

test('date ranges collapse a single day', () => {
  assert.equal(formatDateRange('2027-02-10'), '10 Feb 2027');
  assert.equal(formatDateRange('2027-02-10', '2027-02-10'), '10 Feb 2027');
  assert.equal(
    formatDateRange('2027-02-10', '2027-02-14'),
    '10 Feb 2027 – 14 Feb 2027'
  );
  assert.equal(formatDateRange(null), '');
});

/* -------------------------------------------------------------------------- */
/*  Recipients                                                                */
/* -------------------------------------------------------------------------- */

test('agency mail goes to planner and above, deduped and without viewers', async () => {
  let queriedIds: any[] = [];
  (AgencyMember as any).find = () =>
    chain([
      { userId: 'u1', role: 'owner' },
      { userId: 'u2', role: 'viewer' },
      { userId: 'u3', role: 'planner' },
      { userId: 'u4', role: 'admin' },
    ]);
  (User as any).find = (filter: any) => {
    queriedIds = filter._id.$in;
    return chain([
      { email: 'Owner@Example.com', name: 'Asha' },
      { email: 'plan@example.com', name: 'Ravi' },
      { email: 'owner@example.com', name: 'Asha again' },
    ]);
  };

  const recipients = await agencyTeamRecipients(AGENCY_A);

  assert.deepEqual(queriedIds, ['u1', 'u3', 'u4']);
  assert.deepEqual(recipients, [
    { email: 'owner@example.com', name: 'Asha' },
    { email: 'plan@example.com', name: 'Ravi' },
  ]);
});

test('an agency with no usable team address falls back to its public inbox', async () => {
  (AgencyMember as any).find = () => chain([]);
  (User as any).find = () => chain([]);

  const fallback = await agencyTeamRecipients(AGENCY_A, {
    fallbackEmail: ' Desk@BlueHorizon.example ',
  });
  assert.deepEqual(fallback, [{ email: 'desk@bluehorizon.example' }]);

  const invalid = await agencyTeamRecipients(AGENCY_A, { fallbackEmail: 'nope' });
  assert.deepEqual(invalid, []);
});

test('traveller mail prefers the account and falls back to the enquiry contact', async () => {
  (User as any).findOne = () => chain({ email: 'meera@example.com', name: 'Meera Nair' });
  const fromAccount = await travellerRecipientForEnquiry({
    userId: 'u9',
    contact: { email: 'old@example.com', name: 'Old' },
  });
  assert.deepEqual(fromAccount, { email: 'meera@example.com', name: 'Meera Nair' });

  (User as any).findOne = () => chain(null);
  const fromContact = await travellerRecipientForEnquiry({
    userId: 'u9',
    contact: { email: 'meera@example.com', name: 'Meera Nair' },
  });
  assert.deepEqual(fromContact, { email: 'meera@example.com', name: 'Meera Nair' });
});

test('a plain address is cleaned and platform admins are deduped', async () => {
  assert.deepEqual(recipientForAddress(' Owner@Example.com ', ' Asha '), {
    email: 'owner@example.com',
    name: 'Asha',
  });
  assert.equal(recipientForAddress('nope'), null);

  let captured: any = null;
  (User as any).find = (filter: any) => {
    captured = filter;
    return chain([
      { email: 'Admin@Example.com', name: 'Ops' },
      { email: 'admin@example.com' },
      { email: 'second@example.com', name: 'Second' },
    ]);
  };

  const admins = await platformAdminRecipients();
  assert.deepEqual(captured, {
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
  });
  assert.deepEqual(admins, [
    { email: 'admin@example.com', name: 'Ops' },
    { email: 'second@example.com', name: 'Second' },
  ]);
});

/* -------------------------------------------------------------------------- */
/*  Queue                                                                     */
/* -------------------------------------------------------------------------- */

test('reply emails collapse inside one 15 minute window', () => {
  const base = {
    enquiryId: ENQUIRY_A,
    direction: 'traveller' as const,
    recipient: 'owner@example.com',
  };
  const start = Date.UTC(2026, 10, 4, 9, 0, 0);

  assert.equal(
    replyDedupeKey({ ...base, now: start }),
    replyDedupeKey({ ...base, now: start + 60_000 })
  );
  assert.notEqual(
    replyDedupeKey({ ...base, now: start }),
    replyDedupeKey({ ...base, now: start + 15 * 60_000 })
  );
  assert.notEqual(
    replyDedupeKey({ ...base, now: start }),
    replyDedupeKey({ ...base, recipient: 'plan@example.com', now: start })
  );
});

test('retries back off and stop growing at an hour', () => {
  assert.equal(retryDelayMs(1), 30_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(3), 120_000);
  assert.equal(retryDelayMs(20), 3_600_000);
});

test('the queue is a no-op while email is off', async () => {
  setMailOn(false);
  let writes = 0;
  (EmailOutbox as any).create = async () => {
    writes += 1;
    return {};
  };

  assert.equal(mailIsConfigured(), false);
  assert.equal(
    await enqueueEmail({
      kind: 'enquiry.new',
      to: 'owner@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
    }),
    false
  );
  assert.equal(writes, 0);
  await assert.rejects(
    () =>
      sendEmailWithProvider({
        to: 'owner@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
        text: 'Hello',
      }),
    (error: unknown) =>
      error instanceof MailSendError && error.retryable === false
  );
  resetMail();
});

test('a new enquiry queues one row per team member with a stable dedupe key', async () => {
  setMailOn(true);
  (Agency as any).findById = () =>
    chain({ name: 'Blue Horizon', branding: { contactEmail: 'desk@example.com' } });
  (AgencyMember as any).find = () =>
    chain([
      { userId: 'u1', role: 'owner' },
      { userId: 'u3', role: 'planner' },
    ]);
  (User as any).find = () =>
    chain([
      { email: 'owner@example.com', name: 'Asha' },
      { email: 'plan@example.com', name: 'Ravi' },
    ]);
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  // The dispatcher finds nothing to claim; delivery is tested by the provider
  // contract above, not here.
  (EmailOutbox as any).findOneAndUpdate = () => chain(null);

  await notifyAgencyNewEnquiry({
    _id: ENQUIRY_A,
    agencyId: AGENCY_A,
    contact: { name: 'Meera Nair', email: 'meera@example.com' },
    party: { adults: 2, children: 0 },
    dates: { start: '2027-02-10', end: '2027-02-14', flexible: false },
    budgetBand: '50k_1l',
    message: 'Thinking of Ladakh in February.',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 2);
  assert.deepEqual(
    created.map((row) => row.recipient).sort(),
    ['owner@example.com', 'plan@example.com']
  );
  assert.ok(created.every((row) => row.kind === 'enquiry.new'));
  assert.ok(created.every((row) => row.subject === 'New enquiry from Meera Nair'));
  assert.ok(
    created.every((row) => row.dedupeKey === `enquiry:${ENQUIRY_A}:new:${row.recipient}`)
  );
  assert.ok(created[0].text.includes('2 adults'));
  assert.ok(created[0].text.includes('₹50,000–₹1,00,000 per person'));

  resetMail();
});

test('a guest thread with no account is not mailed a dead link', async () => {
  setMailOn(true);
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  (EmailOutbox as any).findOneAndUpdate = () => chain(null);

  await notifyTravellerAgencyReply({
    enquiry: {
      _id: ENQUIRY_A,
      agencyId: AGENCY_A,
      userId: null,
      contact: { name: 'Guest', email: 'guest@example.com' },
    },
    messageBody: 'Hello there',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 0);
  resetMail();
});

test('an emailed trip invite is queued for its named recipient only', async () => {
  setMailOn(true);
  created.length = 0;
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  (EmailOutbox as any).findOneAndUpdate = () => chain(null);
  (Trip as any).findById = () =>
    chain({
      title: 'Ladakh in February',
      generationMeta: { request: { destination: 'Ladakh' } },
    });
  (User as any).findById = () => chain({ name: 'Asha Rao', email: 'asha@example.com' });

  await notifyTripInvite({
    invite: {
      _id: 'inv-1',
      kind: 'email',
      email: 'Meera@Example.com',
      role: 'planner',
      tripId: 'trip-1',
      createdBy: 'u1',
      expiresAt: '2026-11-11T00:00:00.000Z',
    },
    link: 'https://travelai.example/invite/raw',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 1);
  assert.equal(created[0].kind, 'trip.invite');
  assert.equal(created[0].recipient, 'meera@example.com');
  assert.equal(created[0].dedupeKey, 'trip-invite:inv-1:sent:meera@example.com');
  assert.equal(created[0].subject, 'Asha Rao invited you to Ladakh in February');
  assert.ok(created[0].text.includes('Destination: Ladakh'));

  // A copy-link invite has no address to send to.
  await notifyTripInvite({
    invite: { _id: 'inv-2', kind: 'link', role: 'viewer' },
    link: 'https://travelai.example/invite/raw',
  });
  await notifyAgencyInvite({
    invite: { _id: 'inv-3', kind: 'link', role: 'viewer' },
    link: 'https://travelai.example/agency/invite/raw',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(created.length, 1);

  resetMail();
});

test('an emailed agency invite carries the workspace and its tenant', async () => {
  setMailOn(true);
  created.length = 0;
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  (Agency as any).findById = () => chain({ name: 'Blue Horizon' });

  await notifyAgencyInvite({
    invite: {
      _id: 'ainv-1',
      kind: 'email',
      email: 'plan@example.com',
      role: 'editor',
      agencyId: AGENCY_A,
      expiresAt: '2026-11-11T00:00:00.000Z',
    },
    link: 'https://travelai.example/agency/invite/raw',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 1);
  assert.equal(created[0].kind, 'agency.invite');
  assert.equal(created[0].dedupeKey, 'agency-invite:ainv-1:sent:plan@example.com');
  assert.equal(created[0].agencyId, AGENCY_A);
  assert.ok(created[0].text.includes('Your role: editor'));

  resetMail();
});

test('a new application mails the applicant and every super admin', async () => {
  setMailOn(true);
  created.length = 0;
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };
  (User as any).find = () =>
    chain([
      { email: 'ops@travelai.example', name: 'Ops' },
      { email: 'second@travelai.example' },
    ]);

  await notifyAgencyApplicationReceived({
    application: {
      _id: 'app-1',
      name: 'Blue Horizon',
      email: 'Owner@Example.com',
      phone: '+919876543210',
      note: 'We run Ladakh trips.',
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 3);
  assert.deepEqual(
    created.map((row) => row.recipient).sort(),
    ['ops@travelai.example', 'owner@example.com', 'second@travelai.example']
  );
  assert.equal(
    created.filter((row) => row.kind === 'agency.application_received').length,
    1
  );
  assert.ok(
    created
      .filter((row) => row.kind === 'agency.application_received_admin')
      .every((row) => row.dedupeKey.startsWith('agency-application:app-1:admin:'))
  );

  resetMail();
});

test('each access email gets a stable key, except a fresh password reset', async () => {
  setMailOn(true);
  created.length = 0;
  (EmailOutbox as any).create = async (payload: any) => {
    created.push(payload);
    return payload;
  };

  await notifyAgencyApplicationApproved({
    applicationId: 'app-1',
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    email: 'owner@example.com',
    credentialsIssued: true,
  });
  await notifyAgencyApplicationApproved({
    applicationId: 'app-1',
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    email: 'Owner@Example.com',
    credentialsIssued: true,
  });
  await notifyAgencyApplicationRejected({
    applicationId: 'app-1',
    agencyName: 'Blue Horizon',
    email: 'owner@example.com',
  });
  await notifyAgencyOwnerCredentials({
    accountId: 'acct-1',
    email: 'owner@example.com',
    name: 'Asha',
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    temporaryPassword: 'Temp!Pass123',
  });
  await notifyAgencyPasswordReset({
    accountId: 'acct-1',
    email: 'owner@example.com',
    name: 'Asha',
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    temporaryPassword: 'Temp!Pass999',
    issuedAt: 1,
  });
  await notifyAgencyPasswordReset({
    accountId: 'acct-1',
    email: 'owner@example.com',
    name: 'Asha',
    agencyName: 'Blue Horizon',
    workspace: 'blue-horizon',
    temporaryPassword: 'Temp!Pass999',
    issuedAt: 2,
  });
  await notifyPasswordReset({
    userId: 'u1',
    email: 'meera@example.com',
    name: 'Meera',
    resetTokenId: 'tok-1',
    resetUrl: 'https://travelai.example/reset-password/raw',
    expiresMinutes: 60,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(created.length, 7);
  assert.equal(created[0].kind, 'agency.application_approved');
  assert.equal(created[1].dedupeKey, created[0].dedupeKey);
  assert.equal(created[2].kind, 'agency.application_rejected');
  assert.equal(created[3].kind, 'agency.owner_credentials');
  assert.notEqual(created[4].dedupeKey, created[5].dedupeKey);
  assert.equal(created[6].kind, 'auth.password_reset');
  assert.ok(created[6].text.includes('https://travelai.example/reset-password/raw'));
  assert.ok(created.every((row) => row.recipient === row.recipient.toLowerCase()));

  resetMail();
});

test('message helpers read the last pushed message and count the party', () => {
  assert.equal(
    latestMessageBody({
      messages: [{ body: 'first' }, { body: 'second' }],
    }),
    'second'
  );
  assert.equal(latestMessageBody({}), '');
  assert.equal(enquiryPartyLabel({ adults: 2, children: 1 }), '2 adults, 1 child');
  assert.equal(enquiryPartyLabel({ adults: 1, children: 0 }), '1 adult');
  assert.equal(enquiryPartyLabel({}), '');
});
