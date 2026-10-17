/**
 * Bill splitting & settlement maths (mirror of
 * `backend/src/services/finance/settlement.ts`).
 *
 * Works in integer cents internally to avoid floating-point drift; all public
 * values are rounded back to 2 decimal places.
 */

import type { PersonBalance, SettlementTransfer, TripExpense, TripParticipant } from "@/types/trip";

export interface SettlementResult {
  balances: PersonBalance[];
  transfers: SettlementTransfer[];
}

const toCents = (n: number): number => Math.round((Number(n) || 0) * 100);
const fromCents = (n: number): number => Math.round(n) / 100;

/** Computes each traveller's paid / share / net balance across a ledger. */
export function computeBalances(
  expenses: TripExpense[],
  participants: TripParticipant[] = []
): PersonBalance[] {
  const paidCents = new Map<string, number>();
  const shareCents = new Map<string, number>();
  const names = new Map<string, string | undefined>();

  for (const participant of participants) {
    names.set(participant._id, participant.name);
    if (!paidCents.has(participant._id)) paidCents.set(participant._id, 0);
    if (!shareCents.has(participant._id)) shareCents.set(participant._id, 0);
  }

  for (const expense of expenses || []) {
    const amountCents = toCents(expense.amountInBase);
    const payer = expense.paidBy;

    if (payer) {
      paidCents.set(payer, (paidCents.get(payer) || 0) + amountCents);
      if (!shareCents.has(payer)) shareCents.set(payer, 0);
    }

    const shares = Array.isArray(expense.shares) ? expense.shares : [];
    if (expense.splitMode === "none" || shares.length === 0) {
      if (payer) shareCents.set(payer, (shareCents.get(payer) || 0) + amountCents);
      continue;
    }

    for (const share of shares) {
      if (!share?.participantId) continue;
      shareCents.set(
        share.participantId,
        (shareCents.get(share.participantId) || 0) + toCents(share.amount)
      );
    }
  }

  const ids = new Set<string>([...paidCents.keys(), ...shareCents.keys()]);

  return Array.from(ids)
    .map((participantId) => ({
      participantId,
      name: names.get(participantId),
      paid: fromCents(paidCents.get(participantId) || 0),
      share: fromCents(shareCents.get(participantId) || 0),
      net: fromCents((paidCents.get(participantId) || 0) - (shareCents.get(participantId) || 0)),
    }))
    .sort((a, b) => b.net - a.net);
}

/** Greedy debt simplification — at most `participants - 1` transfers. */
export function minimizeTransfers(balances: PersonBalance[]): SettlementTransfer[] {
  const creditors = (balances || [])
    .filter((b) => toCents(b.net) > 0)
    .map((b) => ({ id: b.participantId, cents: toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);

  const debtors = (balances || [])
    .filter((b) => toCents(b.net) < 0)
    .map((b) => ({ id: b.participantId, cents: -toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.cents, creditor.cents);

    if (amount > 0) {
      transfers.push({ from: debtor.id, to: creditor.id, amount: fromCents(amount) });
    }

    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents <= 0) i += 1;
    if (creditor.cents <= 0) j += 1;
  }

  return transfers;
}

export function settleUp(
  expenses: TripExpense[],
  participants: TripParticipant[] = []
): SettlementResult {
  const balances = computeBalances(expenses, participants);
  return { balances, transfers: minimizeTransfers(balances) };
}
