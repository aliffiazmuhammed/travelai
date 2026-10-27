import type { GalleryDates } from '@/types/gallery';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Human date line for gallery cards. A hidden-date or date-less trip only ever
 * carries `label`, so this can never surface a window the owner hid.
 */
export function formatGalleryDates(dates: GalleryDates): string {
  if (!dates.exact || !dates.startDate) return dates.label;

  const start = new Date(dates.startDate);
  if (Number.isNaN(start.getTime())) return dates.label;

  const format = (date: Date) =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

  const end = dates.endDate ? new Date(dates.endDate) : null;
  if (!end || Number.isNaN(end.getTime()) || dates.startDate === dates.endDate) {
    return format(start);
  }
  return `${format(start)} → ${format(end)}`;
}

export const DURATION_LABELS: Record<string, string> = {
  short: '1–3 days',
  week: '4–7 days',
  fortnight: '8–14 days',
  long: '15+ days',
};
