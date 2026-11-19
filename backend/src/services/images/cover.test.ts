import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoverSourceUrl,
  createCoverCache,
  parseCoverRequest,
  type CachedCover,
} from './cover.js';

const row = (byte: number): CachedCover => ({
  bytes: Buffer.from([byte]),
  contentType: 'image/jpeg',
  storedAt: 0,
});

test('cover request accepts only catalogue ids and known widths', () => {
  assert.deepEqual(parseCoverRequest('photo-1469854523086-cc02fe5d8800', '800'), {
    photo: 'photo-1469854523086-cc02fe5d8800',
    width: 800,
    key: 'photo-1469854523086-cc02fe5d8800@800',
  });

  assert.equal(parseCoverRequest('photo-1469854523086-cc02fe5d8800', '801'), null);
  assert.equal(parseCoverRequest('photo-1469854523086-cc02fe5d8800', ['800']), null);
  assert.equal(parseCoverRequest('../secret', '800'), null);
  assert.equal(parseCoverRequest('https://example.test/a.jpg', '800'), null);
  assert.equal(parseCoverRequest('photo-', '800'), null);
  assert.equal(parseCoverRequest(undefined, '800'), null);
});

test('cover source url stays on the photo host and carries the width', () => {
  assert.equal(
    buildCoverSourceUrl('photo-1469854523086-cc02fe5d8800', 480),
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=480&q=80'
  );
});

test('cover cache expires rows and evicts the oldest entry', () => {
  const cache = createCoverCache(2, 100);

  cache.set('a', row(1), 0);
  cache.set('b', row(2), 10);
  assert.equal(cache.get('a', 50)?.bytes[0], 1);

  cache.set('c', row(3), 20);
  assert.equal(cache.size(), 2);
  // `b` was least recently used after `a` was read.
  assert.equal(cache.get('b', 30), null);
  assert.equal(cache.get('a', 30)?.bytes[0], 1);
  assert.equal(cache.get('c', 30)?.bytes[0], 3);

  // TTL is measured from insertion: 100ms after `a` was stored it is stale.
  assert.equal(cache.get('a', 101), null);
});
