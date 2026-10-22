import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectReceiptUrls, deletedOwnerFilter } from './trash.js';

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
