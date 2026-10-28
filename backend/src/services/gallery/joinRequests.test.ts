import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import UserBlock from '../../models/UserBlock.js';
import TripJoinRequest from '../../models/TripJoinRequest.js';
import itineraryRouter from '../../routes/itinerary.routes.js';
import blocksRouter from '../../routes/blocks.routes.js';
import { AUTH_GUARD_TAG } from '../../middleware/auth.middleware.js';
import { TRIP_GUARD_TAG } from '../../middleware/tripAccess.middleware.js';
import {
  JOIN_REQUEST_DAILY_LIMIT,
  joinRequestLimiter,
} from '../../middleware/rateLimiter.middleware.js';
import { env } from '../../config/env.js';
import {
  approveJoinRequest,
  blockFromJoinRequest,
  blockUser,
  declineJoinRequest,
  getJoinRequestState,
  listBlocks,
  listJoinRequests,
  requestToJoin,
  unblockUser,
  withdrawJoinRequest,
} from './joinRequests.js';

/**
 * Milestone 8 G5 — join requests and blocks.
 *
 * These are service-level pins against stubbed models (the same style as
 * `clone.test.ts`), because the properties worth guaranteeing are decisions,
 * not persistence: approval is commenter-only, a blocked account is refused
 * server-side, one pending request per person, and eligibility is exactly the
 * gallery's public-trip filter.
 */

const TRIP_ID = '64b000000000000000000201';
const OWNER_ID = '64b0000000000000000000a1';
const REQUESTER_ID = '64b0000000000000000000c3';
const REQUEST_ID = '64b000000000000000000301';

let tripRow: any = null;
let lastTripFilter: any = null;
let requests: any[] = [];
let created: any[] = [];
let createError: any = null;
let blockExists = false;
let blockRows: any[] = [];
let blockTarget: any = null;
let blockUpserts: any[] = [];
let membershipPushes: any[] = [];
let membershipModified = 1;
let declinedMany: any[] = [];
let ownedTrips: any[] = [];
let people: any[] = [];
let rollbacks: any[] = [];

const original = {
  tripFindOne: Trip.findOne,
  tripFind: Trip.find,
  tripUpdateOne: Trip.updateOne,
  userFind: User.find,
  userFindOne: User.findOne,
  requestCreate: TripJoinRequest.create,
  requestFind: TripJoinRequest.find,
  requestFindOne: TripJoinRequest.findOne,
  requestFindOneAndUpdate: TripJoinRequest.findOneAndUpdate,
  requestUpdateOne: TripJoinRequest.updateOne,
  requestUpdateMany: TripJoinRequest.updateMany,
  blockExists: UserBlock.exists,
  blockFind: UserBlock.find,
  blockFindOne: UserBlock.findOne,
  blockFindOneAndUpdate: UserBlock.findOneAndUpdate,
  blockDeleteOne: UserBlock.deleteOne,
};

function thenable(value: any): any {
  const chain: any = {
    sort: () => chain,
    limit: () => chain,
    select: () => chain,
    lean: async () => value,
    then: (resolve: any) => resolve(value),
  };
  return chain;
}

function matching(filter: any): any {
  return (
    requests.find((row) => {
      if (filter?._id && String(row._id) !== String(filter._id)) return false;
      if (filter?.tripId && String(row.tripId) !== String(filter.tripId)) return false;
      if (
        filter?.requesterId &&
        String(row.requesterId) !== String(filter.requesterId)
      ) {
        return false;
      }
      if (filter?.status && row.status !== filter.status) return false;
      return true;
    }) ?? null
  );
}

(Trip as any).findOne = (filter: any) => {
  lastTripFilter = filter;
  return thenable(tripRow);
};
(Trip as any).find = () => thenable(ownedTrips);
(Trip as any).updateOne = async (_filter: any, update: any) => {
  membershipPushes.push(update);
  return { modifiedCount: membershipModified };
};

(User as any).find = () => thenable(people);
(User as any).findOne = () => thenable(blockTarget);

(TripJoinRequest as any).create = async (doc: any) => {
  if (createError) throw createError;
  const row = {
    _id: REQUEST_ID,
    status: 'pending',
    createdAt: new Date(),
    ...doc,
  };
  created.push(row);
  return row;
};
(TripJoinRequest as any).find = () => thenable(requests);
(TripJoinRequest as any).findOne = (filter: any) => thenable(matching(filter));
(TripJoinRequest as any).findOneAndUpdate = async (filter: any, update: any) => {
  const row = matching(filter);
  if (!row) return null;
  if (update?.$set) Object.assign(row, update.$set);
  if (update?.$unset) {
    for (const key of Object.keys(update.$unset)) delete row[key];
  }
  return row;
};
(TripJoinRequest as any).updateOne = async (filter: any) => {
  rollbacks.push(filter);
  return { modifiedCount: 1 };
};
(TripJoinRequest as any).updateMany = async (filter: any, update: any) => {
  declinedMany.push({ filter, update });
  return { modifiedCount: 1 };
};

(UserBlock as any).exists = async () => (blockExists ? { _id: 'block' } : null);
(UserBlock as any).find = () => thenable(blockRows);
(UserBlock as any).findOne = () => thenable(blockRows[0] ?? null);
(UserBlock as any).findOneAndUpdate = async (_filter: any, update: any) => {
  blockUpserts.push(update);
  return { _id: 'block', createdAt: new Date() };
};
(UserBlock as any).deleteOne = async () => ({ deletedCount: 1 });

test.after(() => {
  (Trip as any).findOne = original.tripFindOne;
  (Trip as any).find = original.tripFind;
  (Trip as any).updateOne = original.tripUpdateOne;
  (User as any).find = original.userFind;
  (User as any).findOne = original.userFindOne;
  (TripJoinRequest as any).create = original.requestCreate;
  (TripJoinRequest as any).find = original.requestFind;
  (TripJoinRequest as any).findOne = original.requestFindOne;
  (TripJoinRequest as any).findOneAndUpdate = original.requestFindOneAndUpdate;
  (TripJoinRequest as any).updateOne = original.requestUpdateOne;
  (TripJoinRequest as any).updateMany = original.requestUpdateMany;
  (UserBlock as any).exists = original.blockExists;
  (UserBlock as any).find = original.blockFind;
  (UserBlock as any).findOne = original.blockFindOne;
  (UserBlock as any).findOneAndUpdate = original.blockFindOneAndUpdate;
  (UserBlock as any).deleteOne = original.blockDeleteOne;
});

function reset(): void {
  tripRow = {
    _id: TRIP_ID,
    members: [{ userId: OWNER_ID, role: 'owner' }],
  };
  lastTripFilter = null;
  requests = [];
  created = [];
  createError = null;
  blockExists = false;
  blockRows = [];
  blockTarget = { _id: REQUESTER_ID, name: 'Sam', profile: { handle: 'sam' } };
  blockUpserts = [];
  membershipPushes = [];
  membershipModified = 1;
  declinedMany = [];
  ownedTrips = [{ _id: TRIP_ID }];
  people = [
    { _id: REQUESTER_ID, name: 'Sam', profile: { handle: 'sam' }, avatarUrl: 'a.png' },
  ];
  rollbacks = [];
}

function pendingRequest(overrides: Record<string, unknown> = {}): any {
  return {
    _id: REQUEST_ID,
    tripId: TRIP_ID,
    requesterId: REQUESTER_ID,
    message: 'Can I come along?',
    status: 'pending',
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    ...overrides,
  };
}

test('join eligibility reuses the gallery public-trip filter', async () => {
  reset();
  await requestToJoin(TRIP_ID, REQUESTER_ID, 'hi');

  const clauses = lastTripFilter.$and as any[];
  assert.ok(clauses.some((clause) => clause.visibility === 'public'));
  assert.ok(clauses.some((clause) => clause.workspace?.$ne === 'agency'));
  assert.ok(clauses.some((clause) => clause.isDeleted?.$ne === true));
  assert.ok(clauses.some((clause) => clause.publishedAt?.$ne === null));
  assert.ok(clauses.some((clause) => Array.isArray(clause.$or)));
});

test('a request is stored pending with a trimmed message', async () => {
  reset();

  const view = await requestToJoin(TRIP_ID, REQUESTER_ID, '   Can I come?   ');

  assert.equal(created.length, 1);
  assert.equal(view.status, 'pending');
  assert.equal(created[0].message, 'Can I come?');
});

test('an unpublished, expired or agency trip cannot be requested (404)', async () => {
  reset();
  tripRow = null;

  await assert.rejects(() => requestToJoin(TRIP_ID, REQUESTER_ID), /Trip not found/);
  assert.equal(created.length, 0);
});

test('the owner and existing members cannot request to join', async () => {
  reset();
  tripRow.members.push({ userId: REQUESTER_ID, role: 'commenter' });

  await assert.rejects(
    () => requestToJoin(TRIP_ID, REQUESTER_ID),
    /already a member/
  );
  assert.equal(created.length, 0);
});

test('a duplicate pending request is rejected by the unique index, not a race', async () => {
  reset();
  createError = { code: 11000 };

  await assert.rejects(
    () => requestToJoin(TRIP_ID, REQUESTER_ID),
    /already have a pending request/
  );
});

test('a blocked account is refused server-side before a row is written', async () => {
  reset();
  blockExists = true;

  await assert.rejects(
    () => requestToJoin(TRIP_ID, REQUESTER_ID),
    /cannot request to join/
  );
  assert.equal(created.length, 0, 'a blocked request never reaches the database');
});

test('join state reports my latest request and membership flags', async () => {
  reset();
  requests = [pendingRequest()];

  const state = await getJoinRequestState(TRIP_ID, REQUESTER_ID);
  assert.equal(state.request?.status, 'pending');
  assert.equal(state.isMember, false);
  assert.equal(state.isOwner, false);

  const owner = await getJoinRequestState(TRIP_ID, OWNER_ID);
  assert.equal(owner.isOwner, true);
  assert.equal(owner.isMember, true);
});

test('withdrawing only works against the caller’s own pending request', async () => {
  reset();
  requests = [pendingRequest()];

  const view = await withdrawJoinRequest(TRIP_ID, REQUESTER_ID);
  assert.equal(view.status, 'withdrawn');

  requests = [];
  await assert.rejects(
    () => withdrawJoinRequest(TRIP_ID, REQUESTER_ID),
    /no pending request/
  );
});

test('approval adds a commenter membership — never editor', async () => {
  reset();
  requests = [pendingRequest()];

  const view = await approveJoinRequest(tripRow, REQUEST_ID, OWNER_ID);

  assert.equal(view.status, 'approved');
  assert.equal(membershipPushes.length, 1);
  const member = membershipPushes[0].$push.members;
  assert.equal(member.role, 'commenter');
  assert.equal(String(member.userId), REQUESTER_ID);
  assert.equal(String(member.invitedBy), OWNER_ID);
});

test('approval refuses a full trip and rolls nothing forward', async () => {
  reset();
  tripRow.members = new Array(env.TRIP_MAX_MEMBERS).fill(0).map((_, index) => ({
    userId: `64b0000000000000000001${String(index).padStart(2, '0')}`,
    role: 'viewer',
  }));
  requests = [pendingRequest()];

  await assert.rejects(
    () => approveJoinRequest(tripRow, REQUEST_ID, OWNER_ID),
    /collaborator limit/
  );
  assert.equal(membershipPushes.length, 0);
});

test('a lost membership race rolls the claim back to pending', async () => {
  reset();
  membershipModified = 0;
  requests = [pendingRequest()];

  await assert.rejects(
    () => approveJoinRequest(tripRow, REQUEST_ID, OWNER_ID),
    /could not be added/
  );
  assert.equal(rollbacks.length, 1);
  assert.equal(rollbacks[0].status, 'approved');
});

test('declining is silent — only the row status changes', async () => {
  reset();
  requests = [pendingRequest()];

  const view = await declineJoinRequest(tripRow, REQUEST_ID, OWNER_ID);
  assert.equal(view.status, 'declined');
  assert.equal(membershipPushes.length, 0);
});

test('blocking from a request blocks the account and clears its pending rows', async () => {
  reset();
  requests = [pendingRequest()];

  const block = await blockFromJoinRequest(tripRow, REQUEST_ID, OWNER_ID);

  assert.equal(block.userId, REQUESTER_ID);
  assert.equal(blockUpserts.length, 1, 'the block is created once');
  assert.equal(declinedMany.length, 1, 'pending requests are declined');
  assert.equal(declinedMany[0].filter.requesterId, REQUESTER_ID);
  assert.equal(declinedMany[0].filter.status, 'pending');
  assert.equal(declinedMany[0].update.$set.status, 'declined');
});

test('blocking is idempotent, refuses self-blocks and needs a real account', async () => {
  reset();
  await blockUser(OWNER_ID, REQUESTER_ID);
  assert.equal(blockUpserts.length, 1);

  await assert.rejects(() => blockUser(OWNER_ID, OWNER_ID), /cannot block your own/);

  blockTarget = null;
  await assert.rejects(() => blockUser(OWNER_ID, REQUESTER_ID), /Account not found/);
});

test('the block list exposes public identity only, never an email', async () => {
  reset();
  blockRows = [
    {
      blockerId: OWNER_ID,
      blockedId: REQUESTER_ID,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    },
  ];
  people = [
    {
      _id: REQUESTER_ID,
      name: 'Sam',
      email: 'sam@example.com',
      profile: { handle: 'sam' },
      avatarUrl: 'a.png',
    },
  ];

  const rows = await listBlocks(OWNER_ID);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'avatarUrl',
    'createdAt',
    'handle',
    'label',
    'userId',
  ]);
  assert.equal(JSON.stringify(rows).includes('sam@example.com'), false);
});

test('unblock is idempotent', async () => {
  reset();
  const result = await unblockUser(OWNER_ID, REQUESTER_ID);
  assert.equal(result.removed, true);
});

test('the owner queue is pending-only and carries requester identity', async () => {
  reset();
  requests = [pendingRequest()];

  const rows = await listJoinRequests(tripRow);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requester?.label, 'Sam');
  assert.equal(rows[0].requester?.handle, 'sam');
});

test('requester routes are personal + rate-limited; owner routes are owner-only', () => {
  const layers = itineraryRouter.stack.filter((layer: any) => layer.route);
  const byPath = (path: string) =>
    layers.filter((layer: any) => String(layer.route.path) === path);

  for (const path of ['/:id/join-request']) {
    const routes = byPath(path);
    assert.equal(routes.length, 3, 'GET/POST/DELETE share the requester path');
    for (const route of routes) {
      const handlers = route.route.stack.map((layer: any) => layer.handle);
      const guard = handlers.find((handler: any) => handler?.[AUTH_GUARD_TAG]);
      assert.equal(guard?.[AUTH_GUARD_TAG]?.realm, 'personal');
      const tripGuard = handlers.find(
        (handler: any) => handler?.[TRIP_GUARD_TAG] !== undefined
      );
      assert.equal(tripGuard, undefined, 'a stranger has no trip role to check');
    }
    const post = routes.find((route: any) => route.route.methods.post);
    assert.ok(
      post.route.stack.some((layer: any) => layer.handle === joinRequestLimiter),
      'the requester path must carry the daily limiter'
    );
  }

  for (const path of [
    '/:id/join-requests',
    '/:id/join-requests/:requestId/approve',
    '/:id/join-requests/:requestId/decline',
    '/:id/join-requests/:requestId/block',
  ]) {
    const route = byPath(path)[0];
    assert.ok(route, `${path} must exist`);
    const tripGuard = route.route.stack
      .map((layer: any) => layer.handle)
      .find((handler: any) => handler?.[TRIP_GUARD_TAG] !== undefined);
    assert.equal(tripGuard?.[TRIP_GUARD_TAG]?.min, 'owner', `${path} is owner-only`);
  }

  assert.equal(JOIN_REQUEST_DAILY_LIMIT, 5, '5 requests/day/account');
});

test('block routes are personal-realm only', () => {
  const layers = blocksRouter.stack.filter((layer: any) => layer.route);
  assert.equal(layers.length, 3, 'list + block + unblock');

  for (const layer of layers) {
    const handlers = layer.route.stack.map((entry: any) => entry.handle);
    const guard = handlers.find((handler: any) => handler?.[AUTH_GUARD_TAG]);
    assert.equal(guard?.[AUTH_GUARD_TAG]?.realm, 'personal');
  }
});

test('the model index allows one pending request per person per trip', () => {
  const indexes = TripJoinRequest.schema.indexes() as any[];
  const partial = indexes.find(
    (entry) => entry[1]?.partialFilterExpression?.status === 'pending'
  );
  assert.ok(partial, 'a partial unique pending index must exist');
  assert.equal(partial[1].unique, true);
  assert.deepEqual(partial[0], { tripId: 1, requesterId: 1 });
});

test('the block model keeps one row per pair and no email field', () => {
  const indexes = UserBlock.schema.indexes() as any[];
  const pair = indexes.find(
    (entry) => entry[0]?.blockerId === 1 && entry[0]?.blockedId === 1
  );
  assert.ok(pair);
  assert.equal(pair[1].unique, true);
  assert.equal(UserBlock.schema.path('email'), undefined);
});

/** Guards against a future "role" parameter quietly appearing in the service. */
test('the join-request service contains no editor grant path', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, 'joinRequests.ts'), 'utf8');
  assert.equal(
    /role:\s*'(editor|viewer)'/.test(source),
    false,
    'approval may only ever write role: commenter'
  );
  assert.equal(
    /role:\s*'commenter'/.test(source),
    true,
    'the commenter grant is the one membership write'
  );
  assert.equal(new Types.ObjectId(TRIP_ID).toHexString(), TRIP_ID);
});
