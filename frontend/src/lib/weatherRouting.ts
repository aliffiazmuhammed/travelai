/**
 * Weather-aware routing helpers (Milestone 4.6).
 *
 * The analysis itself is computed by the backend (`GET
 * /api/itinerary/:id/weather-routing`) so there is a single implementation;
 * what lives here is the tiny bit of logic the UI needs to *apply* a
 * suggestion locally. `swapDayPlans` mirrors the backend copy in
 * `backend/src/services/geo/weatherRouting.ts`.
 */

import type {
  WeatherRiskLevel,
  WeatherRoutingSuggestion,
  WeatherRoutingSuggestionType,
} from "@/types/trip";

const RISK_ORDER: Record<WeatherRiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

/** Sort helper: most severe risk first, then earliest day. */
export function compareByRisk(
  a: { riskLevel: WeatherRiskLevel; day: number },
  b: { riskLevel: WeatherRiskLevel; day: number }
): number {
  return RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel] || a.day - b.day;
}

export const SUGGESTION_LABELS: Record<WeatherRoutingSuggestionType, string> = {
  swap_days: "Reorder days",
  indoor_swap: "Go indoors",
  buffer_time: "Add buffer",
};

/** Short action label for a suggestion's button (or null when it is advisory). */
export function suggestionActionLabel(suggestion: WeatherRoutingSuggestion): string | null {
  if (suggestion.action?.kind === "swap_days") {
    return `Swap Day ${suggestion.action.fromDay} ↔ Day ${suggestion.action.toDay}`;
  }
  if (suggestion.action?.kind === "indoor_swap") {
    return `Suggest indoor Day ${suggestion.action.day}`;
  }
  return null;
}

/**
 * Exchanges the plans of two itinerary days, returning a new array renumbered
 * so days stay contiguous (`1..n` in display order). Returns the input array
 * unchanged when either day is missing — callers can safely no-op.
 */
export function swapDayPlans<T extends { day: number }>(
  days: T[],
  fromDay: number,
  toDay: number
): T[] {
  const fromIndex = days.findIndex((day) => Number(day.day) === Number(fromDay));
  const toIndex = days.findIndex((day) => Number(day.day) === Number(toDay));
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return days;

  const next = [...days];
  const fromPlan = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = fromPlan;

  return next.map((day, index) => ({ ...day, day: index + 1 }));
}
