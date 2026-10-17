import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAmountInBase,
  computeEqualShares,
  rescaleShares,
  sharesMatchTotal,
  summarizeExpenses,
} from './expenses.js';

test('computeAmountInBase multiplies by a rate and rounds to 2dp', () => {
  assert.equal(computeAmountInBase(100, 1), 100);
  assert.equal(computeAmountInBase(100, 83.25), 8325);
  assert.equal(computeAmountInBase(10.555, 1), 10.56);
  // Invalid rate falls back to 1
  assert.equal(computeAmountInBase(100, 0), 100);
  assert.equal(computeAmountInBase(100, NaN), 100);
});

test('computeEqualShares distributes the remainder so shares sum exactly', () => {
  const shares = computeEqualShares(10, ['a', 'b', 'c']);
  const total = shares.reduce((sum, s) => sum + s.amount, 0);
  assert.equal(Number(total.toFixed(2)), 10);
  assert.equal(shares.length, 3);
  // No participant can appear twice
  const ids = new Set(shares.map((s) => s.participantId));
  assert.equal(ids.size, 3);
});

test('computeEqualShares handles empty input', () => {
  assert.deepEqual(computeEqualShares(100, []), []);
});

test('summarizeExpenses computes planned vs actual and variance', () => {
  const summary = summarizeExpenses(
    [
      { amountInBase: 5000, category: 'accommodation', day: 1 },
      { amountInBase: 1500, category: 'food_and_drinks', day: 1 },
      { amountInBase: 700, category: 'food_and_drinks', day: 2 },
      { amountInBase: 300, category: 'other' },
    ],
    {
      accommodation: 6000,
      food_and_drinks: 2000,
      activities_and_entry: 1000,
      local_transport: 1000,
      miscellaneous_buffer: 1000,
    }
  );

  assert.equal(summary.totalActual, 7500);
  assert.equal(summary.totalPlanned, 11000);
  assert.equal(summary.remaining, 3500);

  const food = summary.byCategory.find((c) => c.id === 'food_and_drinks')!;
  assert.equal(food.actual, 2200);
  assert.equal(food.variance, 200); // 2200 spent vs 2000 planned
  assert.equal(food.variancePct, 10);

  // Spread across two days
  assert.deepEqual(summary.byDay, [
    { day: 1, actual: 6500 },
    { day: 2, actual: 700 },
  ]);
});

test('summarizeExpenses handles an empty ledger', () => {
  const summary = summarizeExpenses([], { accommodation: 5000 });
  assert.equal(summary.totalActual, 0);
  assert.equal(summary.totalPlanned, 5000);
  assert.equal(summary.remaining, 5000);
  assert.equal(summary.variancePct, -100);
});

test('rescaleShares keeps splits proportional and rounds to 2dp', () => {
  const scaled = rescaleShares(
    [
      { participantId: 'a', amount: 200 },
      { participantId: 'b', amount: 300 },
    ],
    1.5
  );
  assert.deepEqual(scaled, [
    { participantId: 'a', amount: 300 },
    { participantId: 'b', amount: 450 },
  ]);
  // Empty / invalid input is safe
  assert.deepEqual(rescaleShares([], 2), []);
  assert.deepEqual(
    rescaleShares([{ participantId: 'a', amount: 100 }], 0),
    [{ participantId: 'a', amount: 100 }]
  );
});

test('sharesMatchTotal validates custom split sums', () => {
  assert.equal(
    sharesMatchTotal(
      [
        { participantId: 'a', amount: 250 },
        { participantId: 'b', amount: 250 },
      ],
      500
    ),
    true
  );
  assert.equal(
    sharesMatchTotal([{ participantId: 'a', amount: 250 }], 500),
    false
  );
  assert.equal(sharesMatchTotal([], 0), true);
});
