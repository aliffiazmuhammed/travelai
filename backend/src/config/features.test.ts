import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBooleanFlag } from './features.js';

test('parseBooleanFlag: fails closed for missing, empty or false values', () => {
  for (const value of [undefined, '', ' ', 'false', 'FALSE', '0', 'no', 'off', 'random']) {
    assert.equal(parseBooleanFlag(value), false, `${String(value)} must be false`);
  }
});

test('parseBooleanFlag: accepts only explicit truthy values', () => {
  for (const value of ['true', 'TRUE', '1', 'yes', 'YES', 'on', ' on ']) {
    assert.equal(parseBooleanFlag(value), true, `${value} must be true`);
  }
});
