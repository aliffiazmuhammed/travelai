import { test } from 'node:test';
import assert from 'node:assert/strict';
import AccountDeletionRequest from '../../models/AccountDeletionRequest.js';
import User from '../../models/User.js';
import PlatformAudit from '../../models/PlatformAudit.js';
import {
  getOpenAccountDeletionRequest,
  requestAccountDeletion,
} from './deletionRequests.js';

/**
 * C-08 / D-F: account deletion is a support-queue request.
 *
 * These pin the promise made on Profile: one open request per account, an
 * audit row for operators, and no write path that removes data on a click.
 * Models are stubbed; no database is touched.
 */

const query = (value: any): any => Object.assign(Promise.resolve(value), {
  select: () => query(value), lean: () => Promise.resolve(value),
});

const originals = {
  requestFindOne: AccountDeletionRequest.findOne,
  requestCreate: AccountDeletionRequest.create,
  userFindOne: User.findOne,
  auditCreate: PlatformAudit.create,
};

let audits: any[] = [];

test.beforeEach(() => {
  audits = [];
  (AccountDeletionRequest as any).findOne = () => query(null);
  (User as any).findOne = () => query({
    _id: 'user-1',
    accountType: 'personal',
    status: 'active',
    email: ' Traveler@Example.com ',
    name: 'Sam',
  });
  (AccountDeletionRequest as any).create = async (input: any) => ({
    ...input,
    requestedAt: new Date('2026-11-18T10:00:00.000Z'),
  });
  (PlatformAudit as any).create = async (input: any) => {
    audits.push(input);
    return input;
  };
});

test.after(() => {
  (AccountDeletionRequest as any).findOne = originals.requestFindOne;
  (AccountDeletionRequest as any).create = originals.requestCreate;
  (User as any).findOne = originals.userFindOne;
  (PlatformAudit as any).create = originals.auditCreate;
});

test('a first request is queued with the account snapshot and an audit row', async () => {
  let created: any;
  (AccountDeletionRequest as any).create = async (input: any) => {
    created = input;
    return { ...input, requestedAt: new Date('2026-11-18T10:00:00.000Z') };
  };

  const result = await requestAccountDeletion('user-1', '  Moving on  ');

  assert.equal(result.alreadyRequested, false);
  assert.equal(result.request.status, 'pending');
  assert.equal(created.email, 'traveler@example.com');
  assert.equal(created.name, 'Sam');
  assert.equal(created.reason, 'Moving on');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'account.deletion_requested');
  assert.equal(audits[0].targetId, 'user-1');
});

test('a reason is trimmed and capped at the model limit', async () => {
  let created: any;
  (AccountDeletionRequest as any).create = async (input: any) => {
    created = input;
    return { ...input, requestedAt: new Date('2026-11-18T10:00:00.000Z') };
  };

  await requestAccountDeletion('user-1', 'x'.repeat(900));

  assert.equal(created.reason.length, 500);
});

test('a second request reuses the open one instead of queueing another', async () => {
  const open = {
    status: 'pending',
    requestedAt: new Date('2026-11-17T09:00:00.000Z'),
    reason: 'Already asked',
  };
  (AccountDeletionRequest as any).findOne = () => query(open);
  let creates = 0;
  (AccountDeletionRequest as any).create = async () => {
    creates += 1;
    return open;
  };

  const result = await requestAccountDeletion('user-1', 'Again');

  assert.equal(result.alreadyRequested, true);
  assert.equal(result.request.reason, 'Already asked');
  assert.equal(creates, 0);
  assert.equal(audits.length, 0, 'no duplicate audit row for the same open request');
});

test('a duplicate-key race returns the request that won', async () => {
  const winner = {
    status: 'pending',
    requestedAt: new Date('2026-11-18T10:00:01.000Z'),
  };
  let lookups = 0;
  (AccountDeletionRequest as any).findOne = () => {
    lookups += 1;
    return query(lookups === 1 ? null : winner);
  };
  (AccountDeletionRequest as any).create = async () => {
    const error: any = new Error('E11000 duplicate key');
    error.code = 11000;
    throw error;
  };

  const result = await requestAccountDeletion('user-1');

  assert.equal(result.alreadyRequested, true);
  assert.equal(result.request.status, 'pending');
});

test('only an active personal account can request deletion', async () => {
  (User as any).findOne = () => query(null);

  await assert.rejects(
    () => requestAccountDeletion('user-1'),
    (error: any) => error.statusCode === 404
  );
  assert.equal(audits.length, 0);
});

test('the open request projection exposes status, date and reason only', async () => {
  (AccountDeletionRequest as any).findOne = () => query({
    status: 'pending',
    requestedAt: new Date('2026-11-18T10:00:00.000Z'),
    reason: 'Because',
    email: 'private@example.com',
    userId: 'user-1',
  });

  const request = await getOpenAccountDeletionRequest('user-1');

  assert.deepEqual(Object.keys(request ?? {}).sort(), ['reason', 'requestedAt', 'status']);
});

test('no open request answers null, so Profile can show the button', async () => {
  assert.equal(await getOpenAccountDeletionRequest('user-1'), null);
});
