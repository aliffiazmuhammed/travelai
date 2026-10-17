/**
 * Weather-aware routing (Milestone 4 — Map & Geo, sub-milestone 4.6).
 *
 * Cross-references the per-day weather risk from `services/geo/weather.ts` with
 * the distances between a day's located activities (`services/geo/distance.ts`)
 * to answer two questions:
 *
 *   1. which travel legs are exposed to bad weather, and
 *   2. what should the traveller do about it?
 *
 * Everything here is pure and deterministic — no network, no AI — so it can be
 * unit-tested and rendered instantly. Applying a suggestion is the client's job
 * (day swaps go through the normal itinerary edit path; "go indoors" reuses the
 * Milestone 4.4 alternative-day endpoint).
 */

import {
  LatLng,
  TravelMode,
  estimateTravelMinutes,
  formatDistance,
  isValidCoord,
  pathLengthKm,
} from './distance.js';
import { WeatherRiskLevel } from './weather.js';

export interface RoutingDayInput {
  /** Itinerary day number. */
  day: number;
  riskLevel: WeatherRiskLevel;
  advisories?: string[];
  /** `[lat, lng]` of the day's located activities, in visit order. */
  points?: LatLng[];
  /** Total activities on the day (including ones without coordinates). */
  activityCount?: number;
  /** Pre-computed travel distance for the day (from 4.2), when available. */
  totalKm?: number;
  /** Travel mode used for the day's legs. */
  mode?: TravelMode;
}

export interface RiskyLeg {
  day: number;
  /** Index of the leg within the day's located activities. */
  fromIndex: number;
  toIndex: number;
  riskLevel: WeatherRiskLevel;
  km: number;
  minutes: number;
  reason: string;
}

export interface WeatherDayFlag {
  day: number;
  riskLevel: WeatherRiskLevel;
  weatherSafe: boolean;
  travelExposureKm: number;
  riskyLegCount: number;
}

export type WeatherRoutingAction =
  | { kind: 'swap_days'; fromDay: number; toDay: number }
  | { kind: 'indoor_swap'; day: number };

export interface WeatherRoutingSuggestion {
  type: 'swap_days' | 'indoor_swap' | 'buffer_time';
  /** The day the advice is about. */
  day: number;
  /** Counterpart day for a `swap_days` suggestion. */
  withDay?: number;
  severity: WeatherRiskLevel;
  title: string;
  detail: string;
  /** Machine-readable payload so the UI can offer a one-click fix. */
  action?: WeatherRoutingAction;
}

export interface WeatherRoutingAnalysis {
  dayFlags: WeatherDayFlag[];
  riskyLegs: RiskyLeg[];
  suggestions: WeatherRoutingSuggestion[];
  summary: {
    riskyDayCount: number;
    totalRiskyLegs: number;
    exposureKm: number;
    worstDay: number | null;
    worstRiskLevel: WeatherRiskLevel;
    headline: string;
  };
}

/** Risk at or above this level makes travel worth flagging. */
const RISKY_LEVELS: WeatherRiskLevel[] = ['moderate', 'high'];
/** Days at or below this level are considered good swap targets. */
const SAFE_LEVELS: WeatherRiskLevel[] = ['none', 'low'];

const MAX_SUGGESTIONS = 4;
const BUFFER_RATIO = 0.25; // +25% travel time in the rain
const MIN_BUFFER_MINUTES = 10;
const MIN_SWAP_EXPOSURE_KM = 0.5;
const FALLBACK_REASON =
  'Rain on a moving day makes ghat roads, ferries and viewpoints slower and less predictable.';

const riskRank: Record<WeatherRiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

const isRisky = (level: WeatherRiskLevel): boolean => RISKY_LEVELS.includes(level);
const isSafe = (level: WeatherRiskLevel): boolean => SAFE_LEVELS.includes(level);

/** Normalizes a day's points, dropping malformed coordinates. */
export function candidatePoints(day: RoutingDayInput): LatLng[] {
  return (day.points || []).filter((point) => isValidCoord(point));
}

/** Travel distance for a day — the supplied total wins, else the path length. */
export function dayExposureKm(day: RoutingDayInput): number {
  const provided = Number(day.totalKm);
  if (Number.isFinite(provided) && provided > 0) return provided;
  return pathLengthKm(candidatePoints(day));
}

/**
 * Picks the most useful advisory line for a rainy travel day, preferring one
 * that talks about roads/landslides and falling back to a generic explanation.
 */
export function pickTravelReason(advisories: string[] | undefined): string {
  const lines = (advisories || []).filter((line) => Boolean(line));
  if (lines.length === 0) return FALLBACK_REASON;

  const roadRelated = lines.find((line) =>
    /road|landslide|drive|traffic|cable|ferry|boat/i.test(line)
  );
  return roadRelated || lines[0];
}

/** Flags every leg that sits on a weather-risky day. */
export function buildRiskyLegs(days: RoutingDayInput[]): RiskyLeg[] {
  const legs: RiskyLeg[] = [];

  for (const day of days) {
    if (!isRisky(day.riskLevel)) continue;

    const points = candidatePoints(day);
    if (points.length < 2) continue;

    const reason = pickTravelReason(day.advisories);
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const km = pathLengthKm([from, to]);
      legs.push({
        day: day.day,
        fromIndex: index,
        toIndex: index + 1,
        riskLevel: day.riskLevel,
        km: Math.round(km * 100) / 100,
        minutes: estimateTravelMinutes(km, day.mode || 'drive'),
        reason,
      });
    }
  }

  return legs;
}

/** Per-day summary used to render flags/badges. */
export function buildDayFlags(days: RoutingDayInput[], riskyLegs: RiskyLeg[]): WeatherDayFlag[] {
  return days.map((day) => ({
    day: day.day,
    riskLevel: day.riskLevel,
    weatherSafe: !isRisky(day.riskLevel),
    travelExposureKm: Math.round(dayExposureKm(day) * 100) / 100,
    riskyLegCount: riskyLegs.filter((leg) => leg.day === day.day).length,
  }));
}

/**
 * Builds the actionable suggestions.
 *
 * - `swap_days`: move a rainy day's plan onto a dry day (structurally safe —
 *   it only reshuffles existing content, no new data needed).
 * - `indoor_swap`: on `high`-risk days, rebuild the day around indoor options.
 * - `buffer_time`: when a risky day still involves a real drive, pad the travel
 *   time rather than pretending the schedule holds.
 */
export function buildSuggestions(
  days: RoutingDayInput[],
  riskyLegs: RiskyLeg[]
): WeatherRoutingSuggestion[] {
  const suggestions: WeatherRoutingSuggestion[] = [];
  const safeDays = days.filter((day) => isSafe(day.riskLevel));
  const riskyDays = days
    .filter((day) => isRisky(day.riskLevel))
    .sort((a, b) => riskRank[b.riskLevel] - riskRank[a.riskLevel] || a.day - b.day);

  const claimedSafeDays = new Set<number>();

  for (const day of riskyDays) {
    const exposure = dayExposureKm(day);
    const activityCount = Number(day.activityCount ?? candidatePoints(day).length ?? 0);

    // 1. Suggest relocating the day when it involves real outdoor travel.
    if (exposure >= MIN_SWAP_EXPOSURE_KM && safeDays.length > 0) {
      const partner = safeDays
        .filter((candidate) => !claimedSafeDays.has(candidate.day))
        // Nearest dry day first, then the fullest one (it can absorb the plan)
        .sort(
          (a, b) =>
            Math.abs(a.day - day.day) - Math.abs(b.day - day.day) ||
            Number(b.activityCount ?? 0) - Number(a.activityCount ?? 0)
        )[0];

      if (partner) {
        claimedSafeDays.add(partner.day);
        suggestions.push({
          type: 'swap_days',
          day: day.day,
          withDay: partner.day,
          severity: day.riskLevel,
          title: `Move Day ${day.day} to Day ${partner.day}`,
          detail: `Day ${day.day} covers ${formatDistance(exposure)} of travel in ${day.riskLevel === 'high' ? 'rough' : 'showery'} weather, while Day ${partner.day} is dry. Swapping the two days keeps your plan intact but moves the outdoor travel to better conditions.`,
          action: { kind: 'swap_days', fromDay: day.day, toDay: partner.day },
        });
      }
    }

    // 2. High-risk days deserve an indoor rebuild.
    if (day.riskLevel === 'high' && activityCount > 0) {
      suggestions.push({
        type: 'indoor_swap',
        day: day.day,
        severity: 'high',
        title: `Plan Day ${day.day} indoors`,
        detail: `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'} sit on your roughest weather day. Museums, cafés, cooking classes and covered markets keep the day full without depending on the sky.`,
        action: { kind: 'indoor_swap', day: day.day },
      });
    }

    // 3. Pad the travel time when a risky day still means driving.
    const dayLegs = riskyLegs.filter((leg) => leg.day === day.day);
    const legMinutes = dayLegs.reduce((total, leg) => total + leg.minutes, 0);
    const bufferMinutes = Math.max(MIN_BUFFER_MINUTES, Math.round(legMinutes * BUFFER_RATIO));

    if (dayLegs.length > 0 && legMinutes >= MIN_BUFFER_MINUTES) {
      suggestions.push({
        type: 'buffer_time',
        day: day.day,
        severity: day.riskLevel,
        title: `Add ~${bufferMinutes} min of travel buffer on Day ${day.day}`,
        detail: `${dayLegs.length} leg${dayLegs.length === 1 ? '' : 's'} (about ${formatDistance(dayExposureKm(day))}) sit in ${day.riskLevel === 'high' ? 'heavy' : 'showery'} weather. Budget roughly ${bufferMinutes} extra minutes for slow traffic, slick ghat sections and shelter stops.`,
      });
    }

    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/** Assembles the headline shown above the suggestion list. */
function buildHeadline(flags: WeatherDayFlag[], suggestions: WeatherRoutingSuggestion[]): string {
  const riskyFlags = flags.filter((flag) => !flag.weatherSafe);

  if (riskyFlags.length === 0) {
    return 'No weather conflicts — every day of this trip looks travel-friendly.';
  }

  const count = riskyFlags.length;
  const dayLabel = count === 1 ? 'day carries' : 'days carry';

  if (suggestions.length === 0) {
    return `${count} ${dayLabel} weather risk and no dry day is free to absorb the plan — keep indoor backups handy and check local advisories.`;
  }

  const swaps = suggestions.filter((item) => item.type === 'swap_days').length;
  const tips = suggestions.length - swaps;
  const bits = [
    swaps > 0 ? `${swaps} day swap${swaps === 1 ? '' : 's'}` : null,
    tips > 0 ? `${tips} scheduling tip${tips === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  return `${count} ${dayLabel} weather risk — ${bits} suggested below.`;
}

/**
 * Full weather-aware routing analysis for a trip.
 * `days` may be in any order; flags preserve the caller's order while the
 * summary picks the worst day by severity, then by exposure.
 */
export function analyzeWeatherRouting(days: RoutingDayInput[]): WeatherRoutingAnalysis {
  const safeDays = (days || []).filter((day) => day && Number.isFinite(Number(day.day)));
  const riskyLegs = buildRiskyLegs(safeDays);
  const dayFlags = buildDayFlags(safeDays, riskyLegs);
  const suggestions = buildSuggestions(safeDays, riskyLegs);

  const worst = [...dayFlags].sort(
    (a, b) =>
      riskRank[b.riskLevel] - riskRank[a.riskLevel] || b.travelExposureKm - a.travelExposureKm
  )[0];

  const worstRiskLevel: WeatherRiskLevel = worst ? worst.riskLevel : 'none';

  return {
    dayFlags,
    riskyLegs,
    suggestions,
    summary: {
      riskyDayCount: dayFlags.filter((flag) => !flag.weatherSafe).length,
      totalRiskyLegs: riskyLegs.length,
      exposureKm:
        Math.round(riskyLegs.reduce((total, leg) => total + leg.km, 0) * 100) / 100,
      worstDay: worst && isRisky(worstRiskLevel) ? worst.day : null,
      worstRiskLevel,
      headline: buildHeadline(dayFlags, suggestions),
    },
  };
}

/**
 * Swaps the plans of two itinerary days, returning a new array with the days
 * renumbered so `day` stays 1..n in display order. Used by the frontend action
 * and safe to call on the server for testing/checks.
 */
export function swapDayPlans<T extends { day: number }>(days: T[], fromDay: number, toDay: number): T[] {
  const fromIndex = days.findIndex((day) => Number(day.day) === Number(fromDay));
  const toIndex = days.findIndex((day) => Number(day.day) === Number(toDay));
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return days;

  const next = [...days];
  const fromPlan = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = fromPlan;

  return next.map((day, index) => ({ ...day, day: index + 1 }));
}
