/**
 * Shared budget/expense metadata + planned-vs-actual helpers (Milestone 5).
 *
 * Mirrors `backend/src/services/finance/expenses.ts` so the UI can render the
 * same category breakdown without a round trip.
 */

import type { ExpenseCategory, ItineraryData } from "@/types/trip";

export interface ExpenseCategoryMeta {
  id: ExpenseCategory;
  label: string;
  /** Key in `ItineraryData["budget_breakdown"]` (null for the catch-all). */
  plannedKey: keyof ItineraryData["budget_breakdown"] | null;
  color: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  { id: "accommodation", label: "Accommodation", plannedKey: "accommodation", color: "#3b82f6" },
  { id: "food_and_drinks", label: "Food & Drinks", plannedKey: "food_and_drinks", color: "#f97316" },
  {
    id: "activities_and_entry",
    label: "Activities & Entry",
    plannedKey: "activities_and_entry",
    color: "#10b981",
  },
  {
    id: "local_transport",
    label: "Local Transport",
    plannedKey: "local_transport",
    color: "#8b5cf6",
  },
  {
    id: "miscellaneous_buffer",
    label: "Buffer / Misc",
    plannedKey: "miscellaneous_buffer",
    color: "#f59e0b",
  },
  { id: "other", label: "Other", plannedKey: null, color: "#64748b" },
];

const CATEGORY_BY_ID = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryMeta(id: string | undefined): ExpenseCategoryMeta {
  return CATEGORY_BY_ID.get((id as ExpenseCategory) ?? "other") ?? EXPENSE_CATEGORIES[5];
}

/** Derives the per-category planned budget from the AI budget breakdown. */
export function plannedByCategory(
  budget: ItineraryData["budget_breakdown"] | undefined
): Partial<Record<ExpenseCategory, number>> {
  const planned: Partial<Record<ExpenseCategory, number>> = {};
  if (!budget) return planned;
  for (const category of EXPENSE_CATEGORIES) {
    if (category.plannedKey) {
      planned[category.id] = Number(budget[category.plannedKey]) || 0;
    }
  }
  return planned;
}

// Money formatting lives with the other currency helpers; re-exported here so
// existing imports keep working.
export { formatMoney, convertToBase, currencyMeta, SUPPORTED_CURRENCIES, DEFAULT_BASE_CURRENCY } from "./currency";
