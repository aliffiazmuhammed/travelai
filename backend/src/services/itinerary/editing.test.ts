import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPermutation,
  applyOrder,
  moveItem,
  renumberDays,
  updateActivityInDays,
} from './editing.js';

test('isValidPermutation accepts a full permutation', () => {
  assert.equal(isValidPermutation([0, 1, 2], 3), true);
  assert.equal(isValidPermutation([2, 0, 1], 3), true);
  assert.equal(isValidPermutation([0], 1), true);
});

test('isValidPermutation rejects malformed orders', () => {
  assert.equal(isValidPermutation([0, 1], 3), false); // wrong length
  assert.equal(isValidPermutation([0, 0, 2], 3), false); // duplicate
  assert.equal(isValidPermutation([0, 1, 3], 3), false); // out of range
  assert.equal(isValidPermutation([0, 1, -1], 3), false); // negative
  assert.equal(isValidPermutation([0, 1, 1.5], 3), false); // non-integer
  assert.equal(isValidPermutation('nope', 3), false); // not an array
  assert.equal(isValidPermutation(null, 3), false);
});

test('applyOrder reorders items using the given index order', () => {
  const items = ['a', 'b', 'c'];
  assert.deepEqual(applyOrder(items, [2, 0, 1]), ['c', 'a', 'b']);
  assert.deepEqual(applyOrder(items, [0, 1, 2]), ['a', 'b', 'c']);
  // Original array must not be mutated
  assert.deepEqual(items, ['a', 'b', 'c']);
});

test('moveItem moves an item to a new position immutably', () => {
  const items = [1, 2, 3, 4];
  assert.deepEqual(moveItem(items, 0, 2), [2, 3, 1, 4]);
  assert.deepEqual(moveItem(items, 3, 0), [4, 1, 2, 3]);
  assert.deepEqual(items, [1, 2, 3, 4]);
});

test('renumberDays makes day numbers sequential starting at 1', () => {
  const days = [{ day: 5, title: 'x' }, { day: 2, title: 'y' }];
  assert.deepEqual(renumberDays(days), [
    { day: 1, title: 'x' },
    { day: 2, title: 'y' },
  ]);
  // Immutability
  assert.equal(days[0].day, 5);
});

test('updateActivityInDays replaces the target activity immutably', () => {
  const days = [
    { day: 1, activities: [{ title: 'A' }, { title: 'B' }] },
    { day: 2, activities: [{ title: 'C' }] },
  ];

  const next = updateActivityInDays(days, 2, 0, { title: 'C2' });
  assert.deepEqual(next[1].activities, [{ title: 'C2' }]);
  // Original untouched
  assert.deepEqual(days[1].activities, [{ title: 'C' }]);

  // Updating day 1 index 1
  const next2 = updateActivityInDays(days, 1, 1, { title: 'B2' });
  assert.deepEqual(next2[0].activities, [{ title: 'A' }, { title: 'B2' }]);
});

test('updateActivityInDays throws for unknown day or out-of-range activity', () => {
  const days = [{ day: 1, activities: [{ title: 'A' }] }];
  assert.throws(() => updateActivityInDays(days, 9, 0, { title: 'x' }), /not found/i);
  assert.throws(() => updateActivityInDays(days, 1, 5, { title: 'x' }), /could not be found/i);
  assert.throws(
    () => updateActivityInDays([{ day: 1, activities: 'oops' as any }], 1, 0, { title: 'x' }),
    /activities to edit/i
  );
});
