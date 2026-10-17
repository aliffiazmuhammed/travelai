/**
 * Pure, side-effect-free helpers for manipulating an itinerary's day/activity
 * structure. Kept separate from the controller so the logic can be unit tested
 * and reused without touching the database.
 */

/** A structural subset of an itinerary day that these helpers care about. */
export interface EditableDay {
  day?: number;
  activities?: any[];
  [key: string]: any;
}

/**
 * Returns true when `order` is a valid permutation of the indices
 * `0 .. length-1` (each index present exactly once).
 */
export function isValidPermutation(order: unknown, length: number): boolean {
  if (!Array.isArray(order) || order.length !== length) return false;
  const seen = new Set<number>();
  for (const value of order) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= length ||
      seen.has(value)
    ) {
      return false;
    }
    seen.add(value);
  }
  return seen.size === length;
}

/** Reorders `items` according to a permutation of their indices. */
export function applyOrder<T>(items: T[], order: number[]): T[] {
  return order.map((index) => items[index]);
}

/** Immutably moves one item from `fromIndex` to `toIndex`. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Re-numbers days sequentially starting at 1 (after a reorder). */
export function renumberDays<T extends EditableDay>(days: T[]): T[] {
  return days.map((day, index) => ({ ...day, day: index + 1 }));
}

/**
 * Immutably replaces a single activity inside a day (matched by day number).
 * Returns a new days array. Throws if the day or activity cannot be found.
 */
export function updateActivityInDays<T extends EditableDay>(
  days: T[],
  dayNumber: number,
  activityIndex: number,
  activity: any
): T[] {
  const dayIndex = days.findIndex((d) => Number(d.day) === Number(dayNumber));
  if (dayIndex === -1) {
    throw new Error(`Day ${dayNumber} was not found in this itinerary.`);
  }
  const activities = days[dayIndex].activities;
  if (!Array.isArray(activities)) {
    throw new Error('This day does not contain any activities to edit.');
  }
  if (activityIndex < 0 || activityIndex >= activities.length) {
    throw new Error('The selected activity could not be found.');
  }
  const nextActivities = [...activities];
  nextActivities[activityIndex] = activity;
  const nextDays = [...days];
  nextDays[dayIndex] = { ...days[dayIndex], activities: nextActivities };
  return nextDays;
}
