/**
 * Pure budget/expense helpers (Milestone 5 — Budget & Financial).
 *
 * Kept dependency-free so the planned-vs-actual maths can be unit-tested and
 * mirrored on the frontend.
 */

export const EXPENSE_CATEGORIES = [
  'accommodation',
  'food_and_drinks',
  'activities_and_entry',
  'local_transport',
  'miscellaneous_buffer',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseSplitMode = 'none' | 'equal' | 'custom';

export interface ExpenseLike {
  amountInBase: number;
  category: string;
  day?: number;
}

export interface ExpenseShare {
  participantId: string;
  amount: number;
}

export interface CategoryBreakdown {
  id: ExpenseCategory;
  planned: number;
  actual: number;
  variance: number;
  /** Percentage overspend/underspend vs planned (null when no plan). */
  variancePct: number | null;
}

export interface ExpenseSummary {
  totalPlanned: number;
  totalActual: number;
  remaining: number;
  variancePct: number | null;
  byCategory: CategoryBreakdown[];
  byDay: { day: number; actual: number }[];
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Converts an amount into the trip's base currency. */
export function computeAmountInBase(amount: number, exchangeRate = 1): number {
  const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  return round2((Number(amount) || 0) * rate);
}

/**
 * Splits an amount equally among participants, distributing the rounding
 * remainder so the shares always sum exactly to the original amount.
 */
export function computeEqualShares(
  amount: number,
  participantIds: string[]
): ExpenseShare[] {
  const ids = Array.from(new Set(participantIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const total = round2(amount);
  const base = Math.floor((total * 100) / ids.length) / 100;
  let remainder = round2(total - base * ids.length);

  return ids.map((participantId) => {
    let share = base;
    if (remainder >= 0.01) {
      share = round2(share + 0.01);
      remainder = round2(remainder - 0.01);
    }
    return { participantId, amount: share };
  });
}

/** Planned budget keyed by category (subset of the AI budget breakdown). */
export type PlannedBudget = Partial<Record<ExpenseCategory, number>>;

/**
 * Scales every stored share by a ratio. Used when an expense's base-currency
 * amount changes (e.g. the trip's base currency is switched) so custom splits
 * stay proportional to the new total.
 */
export function rescaleShares(shares: ExpenseShare[], ratio: number): ExpenseShare[] {
  if (!Array.isArray(shares) || shares.length === 0) return [];
  if (!Number.isFinite(ratio) || ratio <= 0) return shares.map((s) => ({ ...s }));
  return shares.map((share) => ({
    participantId: share.participantId,
    amount: round2((Number(share.amount) || 0) * ratio),
  }));
}

/** True when a set of custom shares sums to the expense amount (± half a cent). */
export function sharesMatchTotal(shares: ExpenseShare[], amount: number): boolean {
  const total = (Array.isArray(shares) ? shares : []).reduce(
    (sum, share) => sum + (Number(share.amount) || 0),
    0
  );
  return Math.abs(round2(total - (Number(amount) || 0))) < 0.005;
}

/**
 * Builds a planned-vs-actual summary across categories plus a per-day breakdown.
 */
export function summarizeExpenses(
  expenses: ExpenseLike[],
  planned: PlannedBudget = {}
): ExpenseSummary {
  const list = Array.isArray(expenses) ? expenses : [];

  const actualByCategory: Record<string, number> = {};
  const actualByDay: Record<number, number> = {};
  let totalActual = 0;

  for (const expense of list) {
    const amount = Number(expense.amountInBase) || 0;
    totalActual += amount;
    const category = expense.category || 'other';
    actualByCategory[category] = round2((actualByCategory[category] || 0) + amount);
    if (Number.isFinite(expense.day) && expense.day != null) {
      actualByDay[expense.day] = round2((actualByDay[expense.day] || 0) + amount);
    }
  }

  const byCategory: CategoryBreakdown[] = EXPENSE_CATEGORIES.map((id) => {
    const plannedValue = round2(planned[id] || 0);
    const actualValue = round2(actualByCategory[id] || 0);
    const variance = round2(actualValue - plannedValue);
    return {
      id,
      planned: plannedValue,
      actual: actualValue,
      variance,
      variancePct: plannedValue > 0 ? Math.round((variance / plannedValue) * 100) : null,
    };
  });

  const totalPlanned = round2(
    EXPENSE_CATEGORIES.reduce((sum, id) => sum + (planned[id] || 0), 0)
  );

  return {
    totalPlanned,
    totalActual: round2(totalActual),
    remaining: round2(totalPlanned - totalActual),
    variancePct:
      totalPlanned > 0 ? Math.round(((totalActual - totalPlanned) / totalPlanned) * 100) : null,
    byCategory,
    byDay: Object.entries(actualByDay)
      .map(([day, actual]) => ({ day: Number(day), actual }))
      .sort((a, b) => a.day - b.day),
  };
}
