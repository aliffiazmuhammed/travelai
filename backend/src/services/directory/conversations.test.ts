import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import AgencyEnquiry, { AGENCY_ENQUIRY_THREAD_LIMITS } from '../../models/AgencyEnquiry.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import User from '../../models/User.js';
import { hashToken } from '../collab/invites.js';
import {
  appendAgencyMessage,
  appendGuestMessage,
  appendOwnMessage,
  conversationMeta,
  conversationTokenIsValid,
  conversationUrl,
  getConversationByToken,
  getOwnConversation,
  markAgencyConversationRead,
  mintConversationToken,
  projectConversationMessage,
} from './conversations.js';

/**
 * Milestone 9 D8 — the two-way enquiry thread.
 *
 * Model calls are stubbed (the D5/D6 style), so these tests pin the rules:
 * the guest token is a hashed capability with an expiry, every read/write is
 * scoped to one enquiry (owner or tenant), receipts are derived from the
 * messages themselves, and the first agency reply moves `new → replied`.
 */

const AGENCY_ID = '64c000000000000000000701';
const OTHER_AGENCY_ID = '64c000000000000000000702';
const ENQUIRY_ID = '64c000000000000000000703';
const OTHER_ENQUIRY_ID = '64c000000000000000000704';
const USER_ID = '64c000000000000000000705';
const OTHER_USER_ID = '64c000000000000000000706';
const ACTOR_ID = '64c000000000000000000707';
const PACKAGE_ID = '64c000000000000000000708';

let agencyRow: any = null;
let userRow: any = null;
let packageRow: any = null;
let enquiryRows: any[] = [];
let auditRows: any[] = [];
let lastUpdateOne: any = null;
let lastFindOneAndUpdate: any = null;

const original = {
  agencyFindById: Agency.findById,
  packageFindOne: AgencyPackage.findOne,
  enquiryFindOne: AgencyEnquiry.findOne,
  enquiryFindOneAndUpdate: AgencyEnquiry.findOneAndUpdate,
  enquiryUpdateOne: AgencyEnquiry.updateOne,
  userFindById: User.findById,
  auditCreate: AgencyAudit.create,
};

function thenable(value: any): any {
  const chain: any = {
    select: () => chain,
    lean: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return chain;
}

function leanChain(getValue: () => any): any {
  const chain: any = {
    select: () => chain,
    lean: async () => getValue(),
    then: (resolve: any) => resolve(getValue()),
  };
  return chain;
}

/** The subset of Mongo filters this service builds: equality and `$in`. */
function matchesFilter(row: any, filter: any): boolean {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$or') continue;
    const value = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      const cond = expected as any;
      if (Array.isArray(cond.$in)) {
        if (!cond.$in.some((entry: any) => String(entry) === String(value))) {
          return false;
        }
        continue;
      }
      if ('$gt' in cond) {
        if (!(value && new Date(value) > new Date(cond.$gt))) return false;
        continue;
      }
      if ('$exists' in cond) {
        const exists = value !== undefined && value !== null;
        if (cond.$exists !== exists) return false;
        continue;
      }
      continue;
    }
    if (String(value ?? '') !== String(expected ?? '')) return false;
  }
  return true;
}

(Agency as any).findById = () => thenable(agencyRow);
(AgencyPackage as any).findOne = (filter: any) =>
  thenable(
    packageRow &&
      String(packageRow._id) === String(filter._id) &&
      String(packageRow.agencyId) === String(filter.agencyId)
      ? packageRow
      : null
  );

(AgencyEnquiry as any).findOne = (filter: any) =>
  leanChain(() => enquiryRows.find((row) => matchesFilter(row, filter)) ?? null);

(AgencyEnquiry as any).findOneAndUpdate = (filter: any, update: any) => {
  lastFindOneAndUpdate = { filter, update };
  const row = enquiryRows.find((entry) => matchesFilter(entry, filter));
  if (!row) return { lean: async () => null };
  if (update?.$set) Object.assign(row, update.$set);
  const push = update?.$push?.messages;
  if (push?.$each) {
    row.messages = [...(row.messages ?? []), ...push.$each];
    if (typeof push.$slice === 'number' && push.$slice < 0) {
      row.messages = row.messages.slice(push.$slice);
    }
  }
  row.updatedAt = new Date();
  return {
    lean: async () => ({
      ...row,
      messages: (row.messages ?? []).map((message: any) => ({ ...message })),
    }),
  };
};

(AgencyEnquiry as any).updateOne = async (filter: any, update: any) => {
  lastUpdateOne = { filter, update };
  const row = enquiryRows.find((entry) => matchesFilter(entry, filter));
  if (!row) return { matchedCount: 0, modifiedCount: 0 };
  const field = Object.keys(update?.$set ?? {}).find((key) =>
    key.startsWith('messages.$[')
  );
  if (field && Array.isArray(row.messages)) {
    const path = field.slice('messages.$[m].'.length);
    const other = path === 'readByAgencyAt' ? 'traveller' : 'agency';
    for (const message of row.messages) {
      if (message.author === other && !message[path]) {
        message[path] = update.$set[field];
      }
    }
  }
  return { matchedCount: 1, modifiedCount: 1 };
};

(User as any).findById = () => thenable(userRow);
(AgencyAudit as any).create = async (doc: any) => {
  auditRows.push(doc);
  return doc;
};

const HOUR = 3_600_000;

function message(overrides: any = {}): any {
  return {
    _id: `64c0000000000000000007${String(10 + enquiryRows.length).padStart(2, '0')}`,
    author: 'traveller',
    authorName: 'Asha',
    body: 'Hello',
    createdAt: new Date('2026-10-28T09:00:00.000Z'),
    readByAgencyAt: null,
    readByTravellerAt: null,
    ...overrides,
  };
}

function row(overrides: any = {}): any {
  return {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
    packageId: null,
    userId: USER_ID,
    status: 'new',
    source: 'profile',
    contact: { name: 'Asha Rao', email: 'asha@example.com', phone: null },
    party: { adults: 2, children: 0 },
    dates: { start: null, end: null, flexible: true },
    budgetBand: 'mid',
    message: 'We want to see Spiti.',
    messages: [],
    lastMessageAt: null,
    lastMessageBy: null,
    repliedAt: null,
    conversationTokenHash: null,
    conversationTokenHint: null,
    conversationTokenExpiresAt: null,
    createdAt: new Date('2026-10-27T09:00:00.000Z'),
    updatedAt: new Date('2026-10-27T09:00:00.000Z'),
    ...overrides,
  };
}

function reset() {
  agencyRow = {
    _id: AGENCY_ID,
    name: 'Himalaya Trails',
    slug: 'himalaya-trails',
    status: 'active',
  };
  userRow = { _id: ACTOR_ID, name: 'Ravi Planner', email: 'ravi@trail.example' };
  packageRow = { _id: PACKAGE_ID, agencyId: AGENCY_ID, title: 'Spiti Loop' };
  enquiryRows = [];
  auditRows = [];
  lastUpdateOne = null;
  lastFindOneAndUpdate = null;
}

/* -------------------------------------------------------------------------- */
/*  Token capability                                                          */
/* -------------------------------------------------------------------------- */

test('a minted conversation token is random, hashed and expires in the TTL', () => {
  const now = new Date('2026-10-29T00:00:00.000Z');
  const token = mintConversationToken(now);

  assert.equal(token.hash, hashToken(token.raw));
  assert.equal(token.hash.length, 64, 'sha256 hex');
  assert.equal(token.hint.length, 6);
  assert.notEqual(token.raw, token.hash, 'the raw token is never the stored value');
  assert.equal(
    token.expiresAt.getTime(),
    now.getTime() + AGENCY_ENQUIRY_THREAD_LIMITS.tokenTtlDays * 86_400_000
  );
});

test('a conversation link is valid only while its expiry is in the future', () => {
  const now = new Date('2026-10-29T00:00:00.000Z');
  assert.equal(
    conversationTokenIsValid({ conversationTokenExpiresAt: new Date(now.getTime() + HOUR) }, now),
    true
  );
  assert.equal(
    conversationTokenIsValid({ conversationTokenExpiresAt: new Date(now.getTime() - HOUR) }, now),
    false
  );
  assert.equal(conversationTokenIsValid({ conversationTokenExpiresAt: now }, now), false);
  assert.equal(conversationTokenIsValid({}, now), false);
  assert.equal(conversationTokenIsValid(null, now), false);
});

test('the guest URL lands on the browser that minted it, never a stale configured origin', () => {
  assert.equal(
    conversationUrl('raw-token', { browserOrigin: 'https://travelai.example' }),
    'https://travelai.example/conversation/raw-token'
  );
});

/* -------------------------------------------------------------------------- */
/*  Projections                                                               */
/* -------------------------------------------------------------------------- */

test('unread counts are derived per side from the thread itself', () => {
  const meta = conversationMeta({
    messages: [
      message({ author: 'traveller', readByAgencyAt: null }),
      message({ author: 'traveller', readByAgencyAt: new Date() }),
      message({ author: 'agency', readByTravellerAt: null }),
      message({ author: 'agency', readByTravellerAt: new Date() }),
    ],
    lastMessageAt: new Date('2026-10-29T10:00:00.000Z'),
    lastMessageBy: 'agency',
  });

  assert.equal(meta.replyCount, 4);
  assert.deepEqual(meta.unread, { agency: 1, traveller: 1 });
  assert.equal(meta.lastMessageBy, 'agency');
});

test('a message projection trims text and normalizes ISO timestamps', () => {
  const view = projectConversationMessage({
    _id: 'abc',
    author: 'agency',
    authorName: '  Ravi  ',
    body: '  Your quote is ready  ',
    createdAt: '2026-10-29T10:00:00.000Z',
    readByAgencyAt: '2026-10-29T10:01:00.000Z',
    readByTravellerAt: null,
  });

  assert.equal(view.authorName, 'Ravi');
  assert.equal(view.body, 'Your quote is ready');
  assert.equal(view.createdAt, '2026-10-29T10:00:00.000Z');
  assert.equal(view.readByTravellerAt, null);
});

/* -------------------------------------------------------------------------- */
/*  Guest access                                                              */
/* -------------------------------------------------------------------------- */

const GUEST_TOKEN = 'guest-token-6f4f2c';

test('a guest read marks the agency replies read and returns the thread', async () => {
  reset();
  enquiryRows = [
    row({
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() + HOUR),
      messages: [
        message({
          author: 'agency',
          authorName: 'Ravi',
          body: 'We can do those dates.',
          readByTravellerAt: null,
        }),
      ],
    }),
  ];

  const conversation = await getConversationByToken(GUEST_TOKEN);

  assert.equal(conversation.agency.name, 'Himalaya Trails');
  assert.equal(conversation.messages.length, 1);
  assert.ok(conversation.messages[0].readByTravellerAt, 'opening the thread is a receipt');
  assert.deepEqual(conversation.unread, { agency: 0, traveller: 0 });
  assert.ok(conversation.expiresAt);
  assert.equal(conversation.canReply, true);
  // The receipt write names the row, so a token can never mark another thread.
  assert.deepEqual(lastUpdateOne.filter, { _id: ENQUIRY_ID });
});

test('an unknown, expired or suspended-agency token answers one generic 404', async () => {
  reset();
  await assert.rejects(
    () => getConversationByToken('no-such-token'),
    /not valid/
  );

  reset();
  enquiryRows = [
    row({
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() - HOUR),
    }),
  ];
  await assert.rejects(() => getConversationByToken(GUEST_TOKEN), /not valid/);

  reset();
  enquiryRows = [
    row({
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() + HOUR),
    }),
  ];
  agencyRow = { ...agencyRow, status: 'suspended' };
  await assert.rejects(() => getConversationByToken(GUEST_TOKEN), /not valid/);
});

test('a guest reply lands on the thread as the traveller side', async () => {
  reset();
  enquiryRows = [
    row({
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() + HOUR),
      messages: [message({ author: 'agency', readByTravellerAt: new Date() })],
    }),
  ];

  const conversation = await appendGuestMessage(GUEST_TOKEN, '  Can we add a day?  ');

  const last = conversation.messages[conversation.messages.length - 1];
  assert.equal(last.author, 'traveller');
  assert.equal(last.body, 'Can we add a day?');
  assert.ok(last.readByTravellerAt, 'your own message is read by definition');
  assert.ok(last.readByAgencyAt === null, 'the agency has not opened it yet');
  assert.equal(conversation.lastMessageBy, 'traveller');
  assert.equal(conversation.unread.agency, 1);
});

test('a guest reply rejects an empty or oversized body', async () => {
  reset();
  enquiryRows = [
    row({
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() + HOUR),
    }),
  ];

  await assert.rejects(
    () => appendGuestMessage(GUEST_TOKEN, '   '),
    /Write a message/
  );
  assert.equal(enquiryRows[0].messages.length, 0);
  await assert.rejects(
    () =>
      appendGuestMessage(
        GUEST_TOKEN,
        'x'.repeat(AGENCY_ENQUIRY_THREAD_LIMITS.body + 1)
      ),
    /under 2000 characters/
  );
  assert.equal(enquiryRows[0].messages.length, 0);
});

/* -------------------------------------------------------------------------- */
/*  Signed-in traveller                                                       */
/* -------------------------------------------------------------------------- */

test('a signed-in read and reply are scoped to the account that sent the enquiry', async () => {
  reset();
  userRow = { _id: USER_ID, name: 'Asha Rao', email: 'asha@example.com' };
  enquiryRows = [
    row({
      messages: [
        message({ author: 'agency', authorName: 'Ravi', readByTravellerAt: null }),
      ],
    }),
  ];

  const read = await getOwnConversation(USER_ID, ENQUIRY_ID);
  assert.equal(read.unread.traveller, 0);
  assert.equal(read.messages[0].readByTravellerAt !== null, true);
  assert.equal(read.expiresAt, null, 'a signed-in thread never advertises a guest expiry');

  const conversation = await appendOwnMessage({
    userId: USER_ID,
    enquiryId: ENQUIRY_ID,
    body: 'That works, thank you.',
  });
  const last = conversation.messages[conversation.messages.length - 1];
  assert.equal(last.author, 'traveller');
  assert.equal(last.authorName, 'Asha Rao');
});

test('another account cannot read or reply to an enquiry', async () => {
  reset();
  enquiryRows = [row({ userId: USER_ID })];

  await assert.rejects(
    () => getOwnConversation(OTHER_USER_ID, ENQUIRY_ID),
    /not found/
  );
  await assert.rejects(
    () =>
      appendOwnMessage({ userId: OTHER_USER_ID, enquiryId: ENQUIRY_ID, body: 'Hi' }),
    /not found/
  );
  assert.equal(enquiryRows[0].messages.length, 0);
});

/* -------------------------------------------------------------------------- */
/*  Agency reply                                                              */
/* -------------------------------------------------------------------------- */

test('the first agency reply stamps the reply time and moves new to replied', async () => {
  reset();
  enquiryRows = [
    row({
      messages: [message({ author: 'traveller', readByAgencyAt: null })],
    }),
  ];

  const conversation = await appendAgencyMessage({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'planner',
    body: '  Thanks — sending a proposal today.  ',
  });

  const last = conversation.messages[conversation.messages.length - 1];
  assert.equal(last.author, 'agency');
  assert.equal(last.authorName, 'Ravi Planner');
  assert.equal(last.body, 'Thanks — sending a proposal today.');
  assert.ok(last.readByAgencyAt);
  assert.equal(conversation.status, 'replied');
  assert.ok(conversation.repliedAt);
  assert.equal(conversation.lastMessageBy, 'agency');
  // Replying is reading: the traveller message seen in the sheet is now read.
  assert.ok(conversation.messages[0].readByAgencyAt);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].action, 'enquiry.replied');
  assert.deepEqual(lastFindOneAndUpdate.filter, {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
  });
});

test('a later agency reply keeps the original reply time', async () => {
  reset();
  const repliedAt = new Date('2026-10-28T09:00:00.000Z');
  enquiryRows = [row({ status: 'replied', repliedAt })];

  const conversation = await appendAgencyMessage({
    agencyId: AGENCY_ID,
    enquiryId: ENQUIRY_ID,
    actorId: ACTOR_ID,
    actorRole: 'admin',
    body: 'One more thing: the permit is included.',
  });

  assert.equal(conversation.repliedAt, repliedAt.toISOString());
  assert.equal(lastFindOneAndUpdate.update.$set.repliedAt, undefined);
});

test('only a planner-ranked member can reply, and only inside their tenant', async () => {
  reset();
  enquiryRows = [row()];

  await assert.rejects(
    () =>
      appendAgencyMessage({
        agencyId: AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'viewer',
        body: 'Hello',
      }),
    /permission/
  );
  assert.equal(enquiryRows[0].messages.length, 0);

  await assert.rejects(
    () =>
      appendAgencyMessage({
        agencyId: OTHER_AGENCY_ID,
        enquiryId: ENQUIRY_ID,
        actorId: ACTOR_ID,
        actorRole: 'owner',
        body: 'Hello',
      }),
    /not found/
  );
  assert.equal(enquiryRows[0].messages.length, 0);
});

test('opening a lead stamps only the traveller messages the agency has not read', async () => {
  reset();
  const alreadyReadAt = new Date('2026-10-28T09:00:00.000Z');
  const traveller = message({ author: 'traveller', readByAgencyAt: null });
  const alreadyRead = message({ author: 'traveller', readByAgencyAt: alreadyReadAt });
  const agency = message({ author: 'agency', readByAgencyAt: null });
  enquiryRows = [row({ messages: [traveller, alreadyRead, agency] })];

  const now = await markAgencyConversationRead(AGENCY_ID, ENQUIRY_ID);

  assert.ok(traveller.readByAgencyAt, 'the unread traveller message is stamped');
  assert.equal(alreadyRead.readByAgencyAt, alreadyReadAt, 'an earlier receipt is preserved');
  assert.ok(now.getTime() > alreadyReadAt.getTime());
  assert.equal(agency.readByAgencyAt, null, 'the agency does not read its own reply');
  assert.deepEqual(lastUpdateOne.filter, {
    _id: ENQUIRY_ID,
    agencyId: AGENCY_ID,
  });
});

test('a package enquiry resolves its title from the same tenant', async () => {
  reset();
  enquiryRows = [
    row({
      packageId: PACKAGE_ID,
      conversationTokenHash: hashToken(GUEST_TOKEN),
      conversationTokenExpiresAt: new Date(Date.now() + HOUR),
    }),
  ];

  const conversation = await getConversationByToken(GUEST_TOKEN);
  assert.equal(conversation.enquiry.packageTitle, 'Spiti Loop');
});

/* Restore the model methods this suite replaced. */
process.on('exit', () => {
  (Agency as any).findById = original.agencyFindById;
  (AgencyPackage as any).findOne = original.packageFindOne;
  (AgencyEnquiry as any).findOne = original.enquiryFindOne;
  (AgencyEnquiry as any).findOneAndUpdate = original.enquiryFindOneAndUpdate;
  (AgencyEnquiry as any).updateOne = original.enquiryUpdateOne;
  (User as any).findById = original.userFindById;
  (AgencyAudit as any).create = original.auditCreate;
});
