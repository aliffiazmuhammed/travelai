/**
 * Coerces a freshly parsed itinerary into the current tripDetails contract.
 *
 * The prompt asks for structured `food_spots` objects, but models occasionally
 * answer with the previous shape (a bare string per spot). Both shapes are
 * accepted by every reader, so a string is kept as-is instead of being parsed
 * or discarded — only objects are validated and trimmed.
 */

export interface GeneratedFoodSpot {
  name: string;
  cuisine?: string;
  note?: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeFoodSpots(value: unknown): Array<string | GeneratedFoodSpot> {
  if (!Array.isArray(value)) return [];

  const spots: Array<string | GeneratedFoodSpot> = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const legacy = raw.trim();
      if (legacy) spots.push(legacy);
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;

    const record = raw as Record<string, unknown>;
    const name = asText(record.name);
    if (!name) continue;

    const spot: GeneratedFoodSpot = { name };
    const cuisine = asText(record.cuisine);
    if (cuisine) spot.cuisine = cuisine;
    const note = asText(record.note) || asText(record.description);
    if (note) spot.note = note;
    spots.push(spot);
  }
  return spots;
}

export function normalizeGeneratedItinerary<T extends Record<string, any>>(parsed: T): T {
  const days = parsed?.day_by_day_itinerary;
  if (!Array.isArray(days)) return parsed;

  return {
    ...parsed,
    day_by_day_itinerary: days.map((day) => {
      if (!day || typeof day !== 'object' || !Array.isArray(day.food_spots)) return day;
      return { ...day, food_spots: normalizeFoodSpots(day.food_spots) };
    }),
  };
}
