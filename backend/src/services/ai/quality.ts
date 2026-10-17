/**
 * Lightweight, deterministic quality scorer for generated itineraries.
 *
 * It is intentionally heuristic (no AI call) so it can run on every generation
 * and in unit tests. The score is stored on the trip (`generationMeta.qualityScore`)
 * and can be used to trigger regeneration or to correlate with user feedback.
 */

export interface QualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface QualityBreakdown {
  completeness: number; // 0-100
  consistency: number; // 0-100
  richness: number; // 0-100
  accuracy: number; // 0-100
}

export interface QualityReport {
  score: number; // 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  breakdown: QualityBreakdown;
  issues: QualityIssue[];
}

const VAGUE_PHRASES = [
  'explore nearby',
  'eat somewhere',
  'some restaurant',
  'local food',
  'just relax',
  'free time',
  'optional activities',
  'and more',
];

const REQUIRED_TOP_LEVEL_KEYS = [
  'trip_title',
  'duration_days',
  'budget_per_person',
  'day_by_day_itinerary',
  'budget_breakdown',
];

const KNOWN_STRAY_KEYS = ['local_transport', 'footnotes_safety_tips', 'weather_advisory', 'highlights'];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidCoordinates(coords: unknown): boolean {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [lat, lng] = coords;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export interface ScoreOptions {
  /** Number of days the traveller requested (for consistency checks). */
  expectedDays?: number;
  /** Interests the traveller selected (for personalization coverage). */
  interests?: string[];
}

/**
 * Scores an itinerary object out of 100 across four equally weighted pillars.
 */
export function scoreItinerary(
  itinerary: Record<string, any> | null | undefined,
  options: ScoreOptions = {}
): QualityReport {
  const issues: QualityIssue[] = [];

  if (!itinerary || typeof itinerary !== 'object') {
    return {
      score: 0,
      grade: 'poor',
      breakdown: { completeness: 0, consistency: 0, richness: 0, accuracy: 0 },
      issues: [{ code: 'empty', severity: 'error', message: 'No itinerary content was produced.' }],
    };
  }

  /* ------------------------------- Completeness ------------------------------ */
  let completeness = 100;
  const missingKeys = REQUIRED_TOP_LEVEL_KEYS.filter(
    (key) => itinerary[key] === undefined || itinerary[key] === null
  );
  if (missingKeys.length) {
    completeness -= missingKeys.length * 12;
    issues.push({
      code: 'missing_keys',
      severity: 'error',
      message: `Missing required sections: ${missingKeys.join(', ')}.`,
    });
  }
  for (const key of KNOWN_STRAY_KEYS) {
    if (itinerary[key] === undefined) {
      completeness -= 4;
      issues.push({ code: 'missing_optional', severity: 'warning', message: `Missing optional section: ${key}.` });
    }
  }

  const days: any[] = Array.isArray(itinerary.day_by_day_itinerary)
    ? itinerary.day_by_day_itinerary
    : [];
  if (days.length === 0) {
    completeness = 0;
    issues.push({ code: 'no_days', severity: 'error', message: 'The itinerary contains no days.' });
  }

  /* ------------------------------- Consistency ------------------------------- */
  let consistency = 100;
  const expectedDays = options.expectedDays;
  if (isFiniteNumber(expectedDays) && expectedDays > 0 && days.length > 0) {
    const diff = Math.abs(days.length - expectedDays);
    if (diff > 0) {
      consistency -= Math.min(40, diff * 15);
      issues.push({
        code: 'day_count_mismatch',
        severity: diff > 1 ? 'error' : 'warning',
        message: `Requested ${expectedDays} days but received ${days.length}.`,
      });
    }
  }

  // Budget breakdown should add up to the total (within 15%)
  const breakdown = itinerary.budget_breakdown;
  if (breakdown && typeof breakdown === 'object') {
    const total = Number(breakdown.total);
    const parts = ['accommodation', 'food_and_drinks', 'activities_and_entry', 'local_transport', 'miscellaneous_buffer']
      .map((k) => Number(breakdown[k]))
      .filter((n) => Number.isFinite(n));
    const sum = parts.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0) {
      consistency -= 30;
      issues.push({ code: 'bad_total', severity: 'error', message: 'Budget total is missing or non-positive.' });
    } else if (parts.length >= 3 && sum > 0) {
      const drift = Math.abs(sum - total) / total;
      if (drift > 0.15) {
        consistency -= 20;
        issues.push({
          code: 'budget_mismatch',
          severity: 'warning',
          message: `Budget line items (₹${Math.round(sum)}) do not sum to the total (₹${Math.round(total)}).`,
        });
      }
    }
  } else {
    consistency -= 25;
    issues.push({ code: 'no_budget', severity: 'error', message: 'Budget breakdown is missing.' });
  }

  /* --------------------------------- Richness -------------------------------- */
  let richness = 100;
  let totalActivities = 0;
  let coordCount = 0;
  let coordTotal = 0;
  let vagueHits = 0;

  for (const day of days) {
    const activities: any[] = Array.isArray(day?.activities) ? day.activities : [];
    totalActivities += activities.length;
    if (activities.length < 2) {
      richness -= 8;
    }
    for (const act of activities) {
      const text = `${act?.title || act?.name || ''} ${act?.description || ''}`.toLowerCase();
      if (VAGUE_PHRASES.some((p) => text.includes(p)) && text.length < 60) {
        vagueHits++;
      }
      if (typeof act === 'object' && act) {
        coordTotal++;
        if (hasValidCoordinates(act.coordinates)) coordCount++;
      }
    }
  }

  if (totalActivities === 0) {
    richness = 0;
    issues.push({ code: 'no_activities', severity: 'error', message: 'No activities were generated.' });
  } else {
    const avgPerDay = totalActivities / Math.max(1, days.length);
    if (avgPerDay < 2.5) {
      richness -= 15;
      issues.push({ code: 'thin_days', severity: 'warning', message: 'Some days look sparse (fewer than ~3 activities).' });
    }
  }

  if (vagueHits > 0) {
    richness -= Math.min(25, vagueHits * 6);
    issues.push({
      code: 'vague_activities',
      severity: 'warning',
      message: `${vagueHits} activity description(s) look vague.`,
    });
  }

  /* --------------------------------- Accuracy -------------------------------- */
  let accuracy = 100;
  if (coordTotal > 0) {
    const coordRatio = coordCount / coordTotal;
    accuracy = clamp(coordRatio * 100);
    if (coordRatio < 0.8) {
      issues.push({
        code: 'missing_coordinates',
        severity: coordRatio < 0.5 ? 'error' : 'warning',
        message: `Only ${Math.round(coordRatio * 100)}% of activities have valid map coordinates.`,
      });
    }
  } else {
    accuracy -= 25;
    issues.push({ code: 'no_coordinates', severity: 'warning', message: 'No activity coordinates were provided.' });
  }

  if (!itinerary.trip_title || String(itinerary.trip_title).trim().length < 3) {
    accuracy -= 15;
    issues.push({ code: 'weak_title', severity: 'warning', message: 'Trip title is missing or too short.' });
  }

  /* --------------------------------- Total ----------------------------------- */
  completeness = clamp(completeness);
  consistency = clamp(consistency);
  richness = clamp(richness);
  accuracy = clamp(accuracy);

  const score = clamp(
    completeness * 0.3 + consistency * 0.25 + richness * 0.25 + accuracy * 0.2
  );

  const grade: QualityReport['grade'] =
    score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';

  return {
    score,
    grade,
    breakdown: { completeness, consistency, richness, accuracy },
    issues,
  };
}
