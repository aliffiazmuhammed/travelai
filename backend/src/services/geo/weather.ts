/**
 * Weather advisories (Milestone 4 — Map & Geo, sub-milestone 4.4).
 *
 * Provider: Open-Meteo (free, no API key). Forecasts cover roughly the next 16
 * days; for trips further out (or when the provider is unavailable) we fall back
 * to deterministic **seasonal normals** so the UI always has an advisory instead
 * of an error. Results are cached in memory for `WEATHER_CACHE_TTL_MS`.
 *
 * All risk mapping and advisory copy is pure and unit-tested; thresholds are
 * tuned for Indian travel (monsoon, landslides, heat, hill-road wind).
 */

import { haversineKm, LatLng } from './distance.js';

export type WeatherRiskLevel = 'none' | 'low' | 'moderate' | 'high';

export interface DailyWeather {
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  windKph: number | null;
  weatherCode: number | null;
  riskLevel: WeatherRiskLevel;
  advisories: string[];
  source: 'forecast' | 'seasonal';
}

export interface WeatherForecast {
  days: DailyWeather[];
  provider: 'open-meteo' | 'seasonal';
  cached?: boolean;
  /** Set when the forecast was degraded to seasonal normals. */
  note?: string;
}

const RISK_ORDER: Record<WeatherRiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

/** Returns the more severe of two risk levels. */
export function maxRisk(a: WeatherRiskLevel, b: WeatherRiskLevel): WeatherRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const MONSOON_MONTHS = new Set([5, 6, 7, 8]); // Jun–Sep

/** Month (0-based) for an ISO `YYYY-MM-DD` date. */
function monthOf(date: string): number {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date().getUTCMonth() : parsed.getUTCMonth();
}

export interface WeatherDayInput {
  precipitationMm?: number | null;
  precipitationProbability?: number | null;
  tempMax?: number | null;
  tempMin?: number | null;
  windKph?: number | null;
  date?: string;
}

/**
 * Maps raw weather values to a travel risk level. Rain dominates, then extreme
 * heat, then wind (boat rides / cable cars / ghat roads).
 */
export function classifyRisk(day: WeatherDayInput): WeatherRiskLevel {
  const mm = num(day.precipitationMm) ?? 0;
  const prob = num(day.precipitationProbability) ?? 0;
  const tempMax = num(day.tempMax);
  const wind = num(day.windKph);

  let risk: WeatherRiskLevel = 'none';

  if (mm >= 20 || prob >= 80) risk = maxRisk(risk, 'high');
  else if (mm >= 5 || prob >= 60) risk = maxRisk(risk, 'moderate');
  else if (mm >= 1 || prob >= 40) risk = maxRisk(risk, 'low');

  if (tempMax != null && tempMax >= 40) risk = maxRisk(risk, 'high');
  else if (tempMax != null && tempMax >= 36) risk = maxRisk(risk, 'moderate');

  if (wind != null && wind >= 60) risk = maxRisk(risk, 'high');
  else if (wind != null && wind >= 45) risk = maxRisk(risk, 'moderate');

  return risk;
}

/** Builds human-readable advisory strings for a day's conditions. */
export function buildAdvisories(day: WeatherDayInput): string[] {
  const advisories: string[] = [];
  const mm = num(day.precipitationMm) ?? 0;
  const prob = num(day.precipitationProbability) ?? 0;
  const tempMax = num(day.tempMax);
  const tempMin = num(day.tempMin);
  const wind = num(day.windKph);
  const risk = classifyRisk(day);

  if (mm >= 20) {
    advisories.push(
      `Heavy rain expected (~${Math.round(mm)} mm) — hill roads turn slippery and landslide-prone. Keep buffer time and avoid late-night driving.`
    );
  } else if (mm >= 5 || prob >= 60) {
    advisories.push(
      `Frequent showers likely (${Math.round(prob)}% chance) — carry rain gear and keep an indoor backup plan handy.`
    );
  } else if (mm >= 1) {
    advisories.push(
      `A little rain is possible (~${mm.toFixed(1)} mm) — a light rain jacket is worth packing.`
    );
  } else if (prob >= 40) {
    advisories.push(
      `A few showers are possible (${Math.round(prob)}% chance) — a light rain jacket is worth packing.`
    );
  }

  if (tempMax != null && tempMax >= 40) {
    advisories.push(
      `Extreme heat (~${Math.round(tempMax)}°C) — shift sightseeing to early morning/evening and carry ORS or electrolytes.`
    );
  } else if (tempMax != null && tempMax >= 36) {
    advisories.push(
      `Hot day ahead (~${Math.round(tempMax)}°C) — hydrate often and plan shade or indoor breaks.`
    );
  }

  if (tempMin != null && tempMin <= 4) {
    advisories.push(
      `Cold nights (~${Math.round(tempMin)}°C) — layer up, especially at high altitude.`
    );
  }

  if (wind != null && wind >= 60) {
    advisories.push(
      `Very strong winds (~${Math.round(wind)} km/h) — boat rides and cable cars may be suspended.`
    );
  } else if (wind != null && wind >= 45) {
    advisories.push(`Windy conditions (~${Math.round(wind)} km/h) — expect exposed ghat roads to be gusty.`);
  }

  if (risk !== 'none' && risk !== 'low' && day.date && MONSOON_MONTHS.has(monthOf(day.date))) {
    advisories.push('Monsoon season — check local landslide and road-closure advisories before setting out.');
  }

  return advisories;
}

/** Attaches risk level + advisories to a normalized day. */
export function summarizeDay(day: WeatherDayInput): {
  riskLevel: WeatherRiskLevel;
  advisories: string[];
} {
  return { riskLevel: classifyRisk(day), advisories: buildAdvisories(day) };
}

/** Normalizes an Open-Meteo `daily` payload into `DailyWeather[]`. */
export function normalizeOpenMeteoDaily(json: any): DailyWeather[] {
  const daily = json?.daily;
  const times: string[] = Array.isArray(daily?.time) ? daily.time : [];

  return times.map((date, index) => {
    const day: WeatherDayInput = {
      date,
      tempMax: num(daily?.temperature_2m_max?.[index]),
      tempMin: num(daily?.temperature_2m_min?.[index]),
      precipitationMm: num(daily?.precipitation_sum?.[index]),
      precipitationProbability: num(daily?.precipitation_probability_max?.[index]),
      windKph: num(daily?.wind_speed_10m_max?.[index]),
    };
    const { riskLevel, advisories } = summarizeDay(day);
    return {
      date,
      tempMin: day.tempMin ?? null,
      tempMax: day.tempMax ?? null,
      precipitationMm: day.precipitationMm ?? null,
      precipitationProbability: day.precipitationProbability ?? null,
      windKph: day.windKph ?? null,
      weatherCode: num(daily?.weather_code?.[index]),
      riskLevel,
      advisories,
      source: 'forecast' as const,
    };
  });
}

/**
 * Deterministic seasonal normals used for far-future dates and provider
 * outages. Approximates Indian climate zones from latitude + month.
 */
export function seasonalNormals(dates: string[], lat: number): DailyWeather[] {
  const absLat = Math.abs(Number.isFinite(lat) ? lat : 20);

  return dates.map((date) => {
    const month = monthOf(date);
    const monsoon = MONSOON_MONTHS.has(month);
    const winter = month === 11 || month === 0 || month === 1;
    const summer = month === 2 || month === 3 || month === 4;
    const tropical = absLat < 15;

    let precipitationMm = 0.5;
    let precipitationProbability = 20;
    if (monsoon) {
      precipitationMm = 12;
      precipitationProbability = 70;
    } else if (month === 9) {
      // October: retreating monsoon
      precipitationMm = 3;
      precipitationProbability = 45;
    }

    let tempMax = tropical ? 32 : 28;
    let tempMin = tropical ? 24 : 17;

    if (summer) {
      tempMax = tropical ? 38 : 34;
      tempMin = tropical ? 27 : 20;
    } else if (winter) {
      tempMax = tropical ? 30 : absLat > 28 ? 16 : 24;
      tempMin = tropical ? 22 : absLat > 28 ? 5 : 12;
    } else if (monsoon) {
      tempMax = tropical ? 31 : 26;
      tempMin = tropical ? 24 : 19;
    }

    const day: WeatherDayInput = {
      date,
      tempMax,
      tempMin,
      precipitationMm,
      precipitationProbability,
      windKph: monsoon ? 32 : 18,
    };

    const { riskLevel, advisories } = summarizeDay(day);
    return {
      date,
      tempMin,
      tempMax,
      precipitationMm,
      precipitationProbability,
      windKph: day.windKph ?? null,
      weatherCode: null,
      riskLevel,
      advisories: [
        ...advisories,
        'Seasonal outlook (not a live forecast) — re-check closer to your travel dates.',
      ],
      source: 'seasonal' as const,
    };
  });
}

/** Builds an inclusive list of ISO dates, capped at `max` entries. */
export function dateRange(start: string, end: string, max = 16): string[] {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return [];

  const dates: string[] = [];
  const last = Number.isNaN(to.getTime()) || to < from ? from : to;
  for (
    let cursor = from.getTime();
    cursor <= last.getTime() && dates.length < max;
    cursor += 24 * 60 * 60 * 1000
  ) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

const FORECAST_HORIZON_DAYS = 16;
const FETCH_TIMEOUT_MS = 7000;
const DEFAULT_CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes

function cacheTtlMs(): number {
  const raw = Number(process.env.WEATHER_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

function openMeteoBase(): string {
  return (process.env.OPEN_METEO_BASE || 'https://api.open-meteo.com/v1/forecast').replace(
    /\/+$/,
    ''
  );
}

const weatherCache = new Map<string, { expiresAt: number; forecast: WeatherForecast }>();

/** Clears the in-memory weather cache (used by tests). */
export function clearWeatherCache(): void {
  weatherCache.clear();
}

function daysFromToday(dates: string[]): number {
  if (dates.length === 0) return 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const first = new Date(`${dates[0]}T00:00:00Z`);
  return Math.round((first.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Fetches a per-day forecast for the given window, falling back to seasonal
 * normals for far-future windows or when the provider fails.
 */
export async function getWeatherForecast(
  lat: number,
  lng: number,
  start: string,
  end: string
): Promise<WeatherForecast> {
  const dates = dateRange(start, end, FORECAST_HORIZON_DAYS);
  if (dates.length === 0) {
    return { days: [], provider: 'seasonal', note: 'No travel dates available.' };
  }

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${dates[0]}|${dates[dates.length - 1]}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.forecast, cached: true };
  }

  const offset = daysFromToday(dates);
  if (offset > FORECAST_HORIZON_DAYS || offset < -FORECAST_HORIZON_DAYS) {
    const forecast: WeatherForecast = {
      days: seasonalNormals(dates, lat),
      provider: 'seasonal',
      note: 'These dates are outside the live forecast window — showing seasonal outlook.',
    };
    weatherCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), forecast });
    return forecast;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code',
    timezone: 'auto',
    start_date: dates[0],
    end_date: dates[dates.length - 1],
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${openMeteoBase()}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Weather provider responded with ${response.status}`);

    const json: any = await response.json();
    const days = normalizeOpenMeteoDaily(json);
    if (days.length === 0) throw new Error('Weather provider returned no daily data');

    const forecast: WeatherForecast = { days, provider: 'open-meteo' };
    weatherCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), forecast });
    return forecast;
  } catch (error) {
    console.warn('Weather forecast unavailable, using seasonal outlook:', error);
    const forecast: WeatherForecast = {
      days: seasonalNormals(dates, lat),
      provider: 'seasonal',
      note: 'Live weather is unavailable right now — showing seasonal outlook.',
    };
    weatherCache.set(key, { expiresAt: Date.now() + cacheTtlMs(), forecast });
    return forecast;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Picks the best available coordinate for a set of candidate points, preferring
 * the one closest to the provided reference (or the first valid point).
 */
export function pickAnchor(candidates: LatLng[], reference?: LatLng): LatLng | null {
  const valid = (candidates || []).filter(Boolean);
  if (valid.length === 0) return null;
  if (!reference) return valid[0];

  return valid.reduce((best, candidate) =>
    haversineKm(candidate, reference) < haversineKm(best, reference) ? candidate : best
  );
}
