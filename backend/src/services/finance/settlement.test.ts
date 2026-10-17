import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBalances,
  minimizeTransfers,
  settleUp,
  type SettlementExpense,
} from './settlement.js';

const people = [
  { id: 'a', name: 'Aarav' },
  { id: 'b', name: 'Bhavna' },
  { id: 'c', name: 'Chetan' },
];

test('equal split produces balanced nets that sum to zero', () => {
  const expenses: SettlementExpense[] = [
    {
      amountInBase: 300,
      paidBy: 'a',
      splitMode: 'equal',
      shares: [
        { participantId: 'a', amount: 100 },
        { participantId: 'b', amount: 100 },
        { participantId: 'c', amount: 100 },
      ],
    },
  ];

  const balances = computeBalances(expenses, people);
  const total = balances.reduce((sum, b) => sum + b.net, 0);
  assert.equal(Number(total.toFixed(2)), 0);

  const a = balances.find((b) => b.participantId === 'a')!;
  assert.equal(a.paid, 300);
  assert.equal(a.share, 100);
  assert.equal(a.net, 200);

  const transfers = minimizeTransfers(balances);
  assert.equal(transfers.length, 2);
  assert.deepEqual(
    transfers.map((t) => `${t.from}->${t.to}:${t.amount}`).sort(),
    ['b->a:100', 'c->a:100']
  );
  // At most n-1 transfers for n participants
  assert.ok(transfers.length <= people.length - 1);
});

test('unsplit expenses are attributed entirely to the payer', () => {
  const expenses: SettlementExpense[] = [
    { amountInBase: 500, paidBy: 'a', splitMode: 'none', shares: [] },
  ];
  const balances = computeBalances(expenses, people);
  assert.ok(balances.every((b) => b.net === 0));
  assert.deepEqual(minimizeTransfers(balances), []);
});

test('custom (unequal) shares are respected and singles out the payer', () => {
  const expenses: SettlementExpense[] = [
    {
      amountInBase: 1000,
      paidBy: 'b',
      splitMode: 'custom',
      shares: [
        { participantId: 'a', amount: 200 },
        { participantId: 'b', amount: 300 },
        { participantId: 'c', amount: 500 },
      ],
    },
  ];

  const balances = computeBalances(expenses, people);
  assert.equal(balances.find((b) => b.participantId === 'b')!.net, 700);
  assert.equal(balances.find((b) => b.participantId === 'a')!.net, -200);
  assert.equal(balances.find((b) => b.participantId === 'c')!.net, -500);
  assert.equal(
    Number(balances.reduce((sum, b) => sum + b.net, 0).toFixed(2)),
    0
  );
});

test('multiple expenses with different payers net out correctly', () => {
  const expenses: SettlementExpense[] = [
    {
      amountInBase: 900,
      paidBy: 'a',
      splitMode: 'equal',
      shares: [
        { participantId: 'a', amount: 300 },
        { participantId: 'b', amount: 300 },
        { participantId: 'c', amount: 300 },
      ],
    },
    {
      amountInBase: 600,
      paidBy: 'b',
      splitMode: 'equal',
      shares: [
        { participantId: 'a', amount: 200 },
        { participantId: 'b', amount: 200 },
        { participantId: 'c', amount: 200 },
      ],
    },
  ];

  const { balances, transfers } = settleUp(expenses, people);
  assert.equal(balances.find((b) => b.participantId === 'a')!.net, 400);
  assert.equal(balances.find((b) => b.participantId === 'b')!.net, 100);
  assert.equal(balances.find((b) => b.participantId === 'c')!.net, -500);

  assert.equal(transfers.length, 2);
  assert.deepEqual(
    transfers.map((t) => `${t.from}->${t.to}:${t.amount}`).sort(),
    ['c->a:400', 'c->b:100']
  );
});

test('rounding cents never leave a balance unresolved', () => {
  const expenses: SettlementExpense[] = [
    {
      amountInBase: 100,
      paidBy: 'a',
      splitMode: 'equal',
      shares: [
        { participantId: 'a', amount: 33.34 },
        { participantId: 'b', amount: 33.33 },
        { participantId: 'c', amount: 33.33 },
      ],
    },
  ];
  const { balances, transfers } = settleUp(expenses, people);
  const total = balances.reduce((sum, b) => sum + b.net, 0);
  assert.equal(Number(total.toFixed(2)), 0);

  // Applying the transfers must zero out every balance
  const settled = new Map(balances.map((b) => [b.participantId, b.net]));
  for (const transfer of transfers) {
    settled.set(transfer.from, (settled.get(transfer.from) || 0) + transfer.amount);
    settled.set(transfer.to, (settled.get(transfer.to) || 0) - transfer.amount);
  }
  for (const value of settled.values()) {
    assert.ok(Math.abs(value) < 0.011);
  }
});

test('payers missing from the traveller list are still tracked', () => {
  const expenses: SettlementExpense[] = [
    { amountInBase: 200, paidBy: 'ghost', splitMode: 'none', shares: [] },
  ];
  const balances = computeBalances(expenses, people);
  assert.equal(balances.length, 4);
  assert.equal(balances.find((b) => b.participantId === 'ghost')!.net, 0);
});
