import type {
  GalleryActivity,
  GalleryDay,
  GalleryRoute,
  GalleryStay,
} from '@/api/explore';
import type {
  MyTripSummary,
  TripCustomRoute,
  TripDay,
  TripRole,
  TripStatus,
} from '@/api/trips';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY = 24 * 60 * 60 * 1000;

/** "Jaipur, Rajasthan" from the generation request, when the payload carries it. */
export function tripDestination(trip: Pick<MyTripSummary, 'generationMeta'>): string {
  const value = trip.generationMeta?.request?.destination;
  return typeof value === 'string' ? value.trim() : '';
}

export function tripTitle(
  trip: Pick<MyTripSummary, 'title' | 'tripDetails'>
): string {
  return trip.title?.trim() || trip.tripDetails?.trip_title?.trim() || 'Untitled trip';
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Nov – 18 Nov 2026"; one date when the window is a single day. */
export function formatTripDates(startDate?: string, endDate?: string): string {
  const start = parseDate(startDate);
  if (!start) return 'Dates to be set';

  const end = parseDate(endDate);
  const dayMonth = (date: Date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;

  if (!end || start.getTime() === end.getTime()) {
    return `${dayMonth(start)} ${start.getUTCFullYear()}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${dayMonth(start)} – ${dayMonth(end)} ${end.getUTCFullYear()}`;
  }
  return `${dayMonth(start)} ${start.getUTCFullYear()} – ${dayMonth(end)} ${end.getUTCFullYear()}`;
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  ongoing: 'Happening now',
  completed: 'Completed',
};

/** Upcoming = planned or already under way. */
export type TripTab = 'upcoming' | 'drafts' | 'past';

export function matchesTripTab(status: TripStatus | undefined, tab: TripTab): boolean {
  const value = status ?? 'planned';
  if (tab === 'drafts') return value === 'draft';
  if (tab === 'past') return value === 'completed';
  return value === 'planned' || value === 'ongoing';
}

export function tripSearchText(trip: MyTripSummary): string {
  return [
    tripTitle(trip),
    tripDestination(trip),
    formatTripDates(trip.startDate, trip.endDate),
    trip.tripDetails?.group_type ?? '',
    trip.tripDetails?.season ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export const ROLE_LABEL: Record<TripRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

/** Orders upcoming trips by start date, past trips by the most recent, drafts by edits. */
export function sortMyTrips(trips: MyTripSummary[], tab: TripTab): MyTripSummary[] {
  const time = (value?: string) => {
    const date = parseDate(value);
    return date ? date.getTime() : 0;
  };

  return [...trips].sort((a, b) => {
    if (tab === 'upcoming') {
      const left = time(a.startDate);
      const right = time(b.startDate);
      // A trip without dates should not jump ahead of a scheduled one.
      if (left === right) return time(b.updatedAt) - time(a.updatedAt);
      if (left === 0) return 1;
      if (right === 0) return -1;
      return left - right;
    }
    if (tab === 'past') {
      return time(b.endDate || b.startDate) - time(a.endDate || a.startDate);
    }
    return time(b.updatedAt) - time(a.updatedAt);
  });
}

export function daysUntil(dateIso?: string): number | null {
  const date = parseDate(dateIso);
  if (!date) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / DAY);
}

function activityToGallery(
  entry: NonNullable<TripDay['activities']>[number]
): GalleryActivity | null {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name } : null;
  }
  const name = (entry.name || entry.title || '').trim();
  if (!name) return null;

  return {
    name,
    time: entry.time,
    description: entry.description,
    location: entry.location || entry.location_name,
    coordinates: entry.coordinates,
  };
}

function stayToGallery(entry: NonNullable<TripDay['stay_recommendations']>[number]): GalleryStay | null {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name } : null;
  }
  if (!entry.name?.trim()) return null;

  return {
    name: entry.name,
    location: entry.location,
    description: entry.description,
    vibe: entry.vibe,
    coordinates: entry.coordinates,
  };
}

function foodName(entry: NonNullable<TripDay['food_spots']>[number]): string | null {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name || null;
  }
  return entry.name?.trim() || null;
}

function tipText(entry: NonNullable<TripDay['pro_tip']>[number]): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  return entry.tip?.trim() || entry.text?.trim() || null;
}

/**
 * The editor lets a day hold legacy strings or full objects. DayCard speaks the
 * gallery shape, so normalize here instead of branching in the UI.
 */
export function toGalleryDays(days: TripDay[] | undefined): GalleryDay[] {
  return (days ?? [])
    .filter((day) => Number.isFinite(day.day))
    .map((day) => ({
      day: day.day,
      title: day.title ?? '',
      activities: (day.activities ?? [])
        .map(activityToGallery)
        .filter((activity): activity is GalleryActivity => activity !== null),
      stay_recommendations: (day.stay_recommendations ?? [])
        .map(stayToGallery)
        .filter((stay): stay is GalleryStay => stay !== null),
      transport: (day.transport ?? []).filter(Boolean),
      food_spots: (day.food_spots ?? [])
        .map(foodName)
        .filter((name): name is string => name !== null),
      pro_tip: (day.pro_tip ?? [])
        .map(tipText)
        .filter((tip): tip is string => tip !== null),
      permit_required: Boolean(day.permit_required),
    }))
    .sort((a, b) => a.day - b.day);
}

export function toGalleryRoutes(routes: TripCustomRoute[] | undefined): GalleryRoute[] {
  return (routes ?? []).map((route) => ({
    name: route.name,
    day: route.day ?? null,
    color: route.color,
    mode: route.mode,
    points: route.points,
    distanceKm: route.distanceKm,
  }));
}
