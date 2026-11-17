import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectReceiptUrls, deletedOwnerFilter, purgeTripCascade } from './trash.js';
import Trip from '../../models/Trip.js';
import TripChatKey from '../../models/TripChatKey.js';
import TripChatKeyBackup from '../../models/TripChatKeyBackup.js';
import TripComment from '../../models/TripComment.js';
import TripDecision from '../../models/TripDecision.js';
import TripInvite from '../../models/TripInvite.js';
import TripPoll from '../../models/TripPoll.js';
import TripReadState from '../../models/TripReadState.js';
import TripMedia from '../../models/TripMedia.js';

const USER_ID = '507f1f77bcf86cd799439011';

test('deletedOwnerFilter: deleted trips, owner membership only', () => {
  const filter = deletedOwnerFilter(USER_ID) as any;
  assert.equal(filter.isDeleted, true);
  assert.equal(filter.members.$elemMatch.role, 'owner');
  assert.equal(String(filter.members.$elemMatch.userId), USER_ID);
});

test('deletedOwnerFilter: a different user produces a different member id', () => {
  const other = '507f191e810c19729de860ea';
  const filter = deletedOwnerFilter(other) as any;
  assert.notEqual(String(filter.members.$elemMatch.userId), USER_ID);
  assert.equal(String(filter.members.$elemMatch.userId), other);
});

test('collectReceiptUrls: distinct, trimmed, managed and foreign URLs', () => {
  const trip = {
    expenses: [
      { receiptUrl: ' /uploads/receipt-a.png ' },
      { receiptUrl: '/uploads/receipt-a.png' },
      { receiptUrl: 'https://res.cloudinary.com/demo/image/upload/v1/receipt-b.jpg' },
      { receiptUrl: '' },
      { receiptUrl: '   ' },
      {},
      null,
    ],
  };

  assert.deepEqual(collectReceiptUrls(trip), [
    '/uploads/receipt-a.png',
    'https://res.cloudinary.com/demo/image/upload/v1/receipt-b.jpg',
  ]);
});

test('collectReceiptUrls: a trip with no expenses has no files to remove', () => {
  assert.deepEqual(collectReceiptUrls({}), []);
  assert.deepEqual(collectReceiptUrls(null), []);
  assert.deepEqual(collectReceiptUrls({ expenses: [] }), []);
});

test('purge cascades all backup generations/users/epochs for only the deleted trip', async (t) => {
  const tripId = '507f1f77bcf86cd799439022';
  const calls: any[] = [];
  for (const model of [TripChatKey, TripChatKeyBackup, TripComment, TripDecision, TripInvite, TripPoll, TripReadState]) {
    t.mock.method(model as any, 'deleteMany', async (filter: any) => {
      assert.deepEqual(filter, { tripId });
      calls.push(model.modelName);
      return {};
    });
  }
  t.mock.method(Trip, 'deleteOne', async (filter: any) => {
    assert.deepEqual(filter, { _id: tripId });
    assert.ok(calls.includes('TripChatKeyBackup'));
    return {} as any;
  });
  t.mock.method(TripMedia, 'find', () => ({ select: async () => [] }) as any);
  t.mock.method(TripMedia, 'deleteMany', async () => ({} as any));
  await purgeTripCascade({ _id: tripId, isDeleted: true });
  assert.equal(calls.filter((name) => name === 'TripChatKeyBackup').length, 1);
});
