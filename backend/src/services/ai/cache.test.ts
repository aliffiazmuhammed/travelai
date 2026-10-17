import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCacheKey,
  getFromCache,
  setInCache,
  getCacheStats,
  clearCache,
} from './cache.js';

test('buildCacheKey normalizes whitespace and case', () => {
  assert.equal(buildCacheKey('Hello   World\n'), buildCacheKey('hello world'));
  assert.notEqual(buildCacheKey('a'), buildCacheKey('b'));
});

test('setInCache / getFromCache round-trip', () => {
  clearCache();
  const key = buildCacheKey('prompt-a');
  assert.equal(getFromCache(key), null);
  setInCache(key, 'result-a');
  assert.equal(getFromCache(key), 'result-a');
  const stats = getCacheStats();
  assert.equal(stats.size, 1);
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
});

test('cache ignores empty keys and non-string values', () => {
  clearCache();
  setInCache('', 'x');
  setInCache('k', undefined as unknown as string);
  assert.equal(getCacheStats().size, 0);
});

test('cache evicts the oldest entries beyond its capacity', () => {
  clearCache();
  const { maxEntries } = getCacheStats();
  for (let i = 0; i < maxEntries + 10; i++) {
    setInCache(`key-${i}`, `value-${i}`);
  }
  assert.ok(getCacheStats().size <= maxEntries);
});

test('clearCache resets entries and counters', () => {
  setInCache('leftover', 'x');
  clearCache();
  const stats = getCacheStats();
  assert.equal(stats.size, 0);
  assert.equal(stats.hits, 0);
  assert.equal(stats.misses, 0);
});
