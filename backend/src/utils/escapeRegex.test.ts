import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeRegex } from './escapeRegex.js';

test('escapeRegex: escapes every regex metacharacter', () => {
  assert.equal(escapeRegex('.*+?^${}()|[]\\'), '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
});

test('escapeRegex: literal punctuation matches only itself', () => {
  const pattern = new RegExp(escapeRegex('a.b*c'), 'i');
  assert.equal(pattern.test('a.b*c'), true);
  assert.equal(pattern.test('axbxc'), false);
});

test('escapeRegex: a parenthesised query cannot become a group', () => {
  const pattern = new RegExp(escapeRegex('(trip)'), 'i');
  assert.equal(pattern.test('(trip)'), true);
  assert.equal(pattern.test('trip'), false);
});

test('escapeRegex: leaves ordinary words and spaces alone', () => {
  assert.equal(escapeRegex('Manali trip'), 'Manali trip');
});
