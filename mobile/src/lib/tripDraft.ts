import type { GalleryActivity } from '@/api/explore';
import type { MediaRef } from '@/api/media';
import type { TripDay } from '@/api/trips';

export type DraftActivity = GalleryActivity & { title?: string; location_name?: string };
export type ActivityEntry = string | DraftActivity;

export interface ActivityFields {
  name: string;
  time: string;
  description: string;
  location: string;
  image?: MediaRef;
}

/** Legacy string entries and full objects read the same to the editor. */
export function activityFields(entry: ActivityEntry): ActivityFields {
  if (typeof entry === 'string') {
    return { name: entry.trim(), time: '', description: '', location: '' };
  }
  return {
    name: (entry.name || entry.title || '').trim(),
    time: entry.time ?? '',
    description: entry.description ?? '',
    location: entry.location ?? entry.location_name ?? '',
    image: entry.image,
  };
}

export function activityName(entry: ActivityEntry): string {
  return activityFields(entry).name;
}

/** Shared fields replace; coordinates, photos and anything else ride along. */
function applyFields(entry: ActivityEntry, fields: ActivityFields): DraftActivity {
  const base: DraftActivity = typeof entry === 'string' ? { name: entry } : { ...entry };
  // Generated plans carry the old aliases; drop them so one field is the truth.
  delete base.title;
  delete base.location_name;
  return {
    ...base,
    name: fields.name.trim(),
    time: fields.time.trim() || undefined,
    description: fields.description.trim() || undefined,
    location: fields.location.trim() || undefined,
    image: fields.image,
  };
}

function editDay(days: TripDay[], dayIndex: number, edit: (day: TripDay) => TripDay): TripDay[] {
  return days.map((day, index) => (index === dayIndex ? edit(day) : day));
}

function editActivities(
  days: TripDay[],
  dayIndex: number,
  edit: (entries: ActivityEntry[]) => ActivityEntry[]
): TripDay[] {
  return editDay(days, dayIndex, (day) => ({
    ...day,
    activities: edit(day.activities ?? []),
  }));
}

export function setDayTitle(days: TripDay[], dayIndex: number, title: string): TripDay[] {
  return editDay(days, dayIndex, (day) => ({ ...day, title: title.trim() || undefined }));
}

export function setDayImage(
  days: TripDay[],
  dayIndex: number,
  image: MediaRef | undefined
): TripDay[] {
  return editDay(days, dayIndex, (day) => ({ ...day, image }));
}

export function addActivity(days: TripDay[], dayIndex: number, fields: ActivityFields): TripDay[] {
  return editActivities(days, dayIndex, (entries) => [
    ...entries,
    applyFields({ name: '' }, fields),
  ]);
}

export function editActivity(
  days: TripDay[],
  dayIndex: number,
  activityIndex: number,
  fields: ActivityFields
): TripDay[] {
  return editActivities(days, dayIndex, (entries) =>
    entries.map((entry, index) => (index === activityIndex ? applyFields(entry, fields) : entry))
  );
}

export function removeActivity(
  days: TripDay[],
  dayIndex: number,
  activityIndex: number
): TripDay[] {
  return editActivities(days, dayIndex, (entries) =>
    entries.filter((_, index) => index !== activityIndex)
  );
}

/** Swaps with a neighbour; out-of-range moves return the list untouched. */
export function moveActivity(
  days: TripDay[],
  dayIndex: number,
  activityIndex: number,
  delta: -1 | 1
): TripDay[] {
  return editActivities(days, dayIndex, (entries) => {
    const target = activityIndex + delta;
    if (target < 0 || target >= entries.length) return entries;
    const next = [...entries];
    [next[activityIndex], next[target]] = [next[target], next[activityIndex]];
    return next;
  });
}
