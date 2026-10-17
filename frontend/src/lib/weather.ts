/**
 * Weather presentation helpers (Milestone 4.4).
 *
 * Pure and JSX-free so it can be imported by components without breaking React
 * Fast Refresh. Risk levels mirror `backend/src/services/geo/weather.ts`.
 */

import type { DailyWeather, ItineraryData, WeatherRiskLevel } from "@/types/trip";

export interface RiskMeta {
  label: string;
  /** Badge styling (Tailwind classes). */
  badgeClass: string;
  /** Small dot styling for compact indicators. */
  dotClass: string;
}

export const RISK_META: Record<WeatherRiskLevel, RiskMeta> = {
  none: {
    label: "Clear",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/60",
    dotClass: "bg-emerald-400",
  },
  low: {
    label: "Light rain",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300/60",
    dotClass: "bg-sky-400",
  },
  moderate: {
    label: "Showers",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/60",
    dotClass: "bg-amber-400",
  },
  high: {
    label: "Rough weather",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/40",
    dotClass: "bg-destructive",
  },
};

const RISK_ORDER: Record<WeatherRiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

export function riskMeta(level: WeatherRiskLevel | undefined): RiskMeta {
  return RISK_META[level ?? "none"] ?? RISK_META.none;
}

/** True when the day warrants steering plans indoors. */
export function hasSignificantRisk(day: DailyWeather | undefined): boolean {
  if (!day) return false;
  return RISK_ORDER[day.riskLevel] >= RISK_ORDER.moderate;
}

/**
 * Resolves the calendar date for a trip day. Day 1 is the trip's start date.
 * Returns null when the trip has no start date.
 */
export function dayDateFromStart(startDate: string | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const base = new Date(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const offset = (Number(dayNumber) || 1) - 1;
  return new Date(base.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Adds `dayCount - 1` days to a start date (for the forecast window). */
export function endDateFromStart(
  startDate: string | undefined,
  dayCount: number
): string | null {
  return dayDateFromStart(startDate, Math.max(1, Number(dayCount) || 1));
}

/** Short conditions summary, e.g. `31° / 22° · 12 mm · 70% rain`. */
export function describeWeather(day: DailyWeather | undefined): string {
  if (!day) return "";
  const parts: string[] = [];

  if (day.tempMax != null || day.tempMin != null) {
    const max = day.tempMax != null ? `${Math.round(day.tempMax)}°` : "—";
    const min = day.tempMin != null ? `${Math.round(day.tempMin)}°` : "—";
    parts.push(`${max} / ${min}`);
  }
  if (day.precipitationMm != null && day.precipitationMm >= 0.1) {
    parts.push(`${Number(day.precipitationMm).toFixed(1)} mm`);
  } else if (day.precipitationProbability != null && day.precipitationProbability >= 30) {
    parts.push(`${Math.round(day.precipitationProbability)}% rain`);
  }
  if (day.windKph != null && day.windKph >= 35) {
    parts.push(`${Math.round(day.windKph)} km/h wind`);
  }

  return parts.join(" · ");
}

/**
 * Maps a forecast onto the itinerary's day numbers.
 *
 * The forecast is requested for the trip window, so entry `i` belongs to
 * `itinerary[i]`; days that fall outside the window are simply omitted.
 */
export function zipWeatherToDays(
  days: DailyWeather[] | undefined,
  itinerary: ItineraryData["day_by_day_itinerary"]
): Record<number, DailyWeather> {
  const byDay: Record<number, DailyWeather> = {};
  if (!Array.isArray(days) || !Array.isArray(itinerary)) return byDay;

  itinerary.forEach((day, index) => {
    const weather = days[index];
    if (weather && day?.day != null) {
      byDay[Number(day.day)] = weather;
    }
  });

  return byDay;
}

/** The first usable activity coordinate of a day (weather anchor). */
export function dayAnchor(
  day: ItineraryData["day_by_day_itinerary"][number] | undefined
): [number, number] | null {
  for (const activity of day?.activities || []) {
    if (activity && typeof activity === "object" && Array.isArray(activity.coordinates)) {
      const lat = Number(activity.coordinates[0]);
      const lng = Number(activity.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        return [lat, lng];
      }
    }
  }
  return null;
}

/** The first usable coordinate anywhere in the itinerary. */
export function itineraryAnchor(
  itinerary: ItineraryData["day_by_day_itinerary"]
): [number, number] | null {
  for (const day of itinerary || []) {
    const anchor = dayAnchor(day);
    if (anchor) return anchor;
  }
  return null;
}
