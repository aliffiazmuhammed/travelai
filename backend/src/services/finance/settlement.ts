/**
 * Bill splitting & settlement maths (Milestone 5 — Budget & Financial).
 *
 * Pure and dependency-free. All monetary values are in the trip's base
 * currency. Internally works in integer cents to avoid floating-point drift,
 * and every public value is rounded back to 2 decimal places.
 */

export type SettlementSplitMode = 'none' | 'equal' | 'custom';

export interface SettlementExpense {
  amountInBase: number;
  paidBy?: string;
  splitMode: SettlementSplitMode;
  shares: { participantId: string; amount: number }[];
}

export interface SettlementPerson {
  id: string;
  name?: string;
}

export interface PersonBalance {
  participantId: string;
  name?: string;
  /** Total this traveller paid out of pocket. */
  paid: number;
  /** Total this traveller is responsible for. */
  share: number;
  /** `paid - share` — positive means they are owed money. */
  net: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

const toCents = (n: number): number => Math.round((Number(n) || 0) * 100);
const fromCents = (n: number): number => Math.round(n) / 100;

/**
 * Computes each traveller's paid / share / net balance across a ledger.
 *
 * - `equal` and `custom` splits use the stored `shares` (the API keeps them in
 *   sync), so the maths here stays a pure aggregation.
 * - `none` (unsplit) expenses are attributed entirely to the payer, which keeps
 *   balances zero-sum for solo ledgers.
 * - Payers that are not in the traveller list are still included so nothing is
 *   silently dropped.
 */
export function computeBalances(
  expenses: SettlementExpense[],
  participants: SettlementPerson[] = []
): PersonBalance[] {
  const paidCents = new Map<string, number>();
  const shareCents = new Map<string, number>();
  const names = new Map<string, string | undefined>();

  for (const participant of participants) {
    names.set(participant.id, participant.name);
    if (!paidCents.has(participant.id)) paidCents.set(participant.id, 0);
    if (!shareCents.has(participant.id)) shareCents.set(participant.id, 0);
  }

  for (const expense of expenses || []) {
    const amountCents = toCents(expense.amountInBase);
    const payer = expense.paidBy;

    if (payer) {
      paidCents.set(payer, (paidCents.get(payer) || 0) + amountCents);
      if (!shareCents.has(payer)) shareCents.set(payer, 0);
    }

    const shares = Array.isArray(expense.shares) ? expense.shares : [];
    if (expense.splitMode === 'none' || shares.length === 0) {
      // Unsplit (or un-splittable) spends are borne by whoever paid.
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
    .map((participantId) => {
      const paid = fromCents(paidCents.get(participantId) || 0);
      const share = fromCents(shareCents.get(participantId) || 0);
      return {
        participantId,
        name: names.get(participantId),
        paid,
        share,
        net: fromCents((paidCents.get(participantId) || 0) - (shareCents.get(participantId) || 0)),
      };
    })
    .sort((a, b) => b.net - a.net);
}

/**
 * Greedy debt simplification: repeatedly settles the largest debtor against the
 * largest creditor. Produces at most `participants - 1` transfers and always
 * zeroes every balance.
 */
export function minimizeTransfers(balances: PersonBalance[]): Transfer[] {
  const creditors = (balances || [])
    .filter((b) => toCents(b.net) > 0)
    .map((b) => ({ id: b.participantId, cents: toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);

  const debtors = (balances || [])
    .filter((b) => toCents(b.net) < 0)
    .map((b) => ({ id: b.participantId, cents: -toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.cents, creditor.cents);

    if (amount > 0) {
      transfers.push({
        from: debtor.id,
        to: creditor.id,
        amount: fromCents(amount),
      });
    }

    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents <= 0) i += 1;
    if (creditor.cents <= 0) j += 1;
  }

  return transfers;
}

/** Convenience wrapper returning both balances and the minimal transfer list. */
export function settleUp(
  expenses: SettlementExpense[],
  participants: SettlementPerson[] = []
): { balances: PersonBalance[]; transfers: Transfer[] } {
  const balances = computeBalances(expenses, participants);
  return { balances, transfers: minimizeTransfers(balances) };
}
