/**
 * Public gallery projections (Milestone 8 G1).
 *
 * These are exact allow-lists, deliberately separate from the unlisted share
 * payload (`collab/publicTrip.ts`). Nothing monetary, membership- or
 * session-related is reachable from here because it is never selected:
 * `budget_per_person`, `budget_breakdown`, activity/stay costs, expenses,
 * finance, members, participants, generationMeta, shareId and internal notes
 * are structurally absent.
 */

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

export interface GalleryPublisher {
  handle: string;
  name: string;
  avatarUrl?: string;
}

export interface GalleryProfileSource {
  name?: string;
  avatarUrl?: string;
  profile?: { handle?: string; bio?: string };
}

/** A public window. Hidden dates never carry the concrete dates at all. */
export interface GalleryDates {
  exact: boolean;
  startDate?: string;
  endDate?: string;
  label: string;
}

export interface GalleryActivity {
  name: string;
  time?: string;
  description?: string;
  location?: string;
  coordinates?: [number, number];
}

export interface GalleryStay {
  name: string;
  location?: string;
  description?: string;
  vibe?: string;
  coordinates?: [number, number];
}

export interface GalleryDay {
  day: number;
  title: string;
  activities: GalleryActivity[];
  stay_recommendations: GalleryStay[];
  transport: string[];
  food_spots: string[];
  pro_tip: string[];
  permit_required: boolean;
}

export interface GalleryItinerary {
  trip_title: string;
  duration_days: number;
  season: string;
  group_type: string;
  highlights: string[];
  weather_advisory?: Record<string, unknown>;
  day_by_day_itinerary: GalleryDay[];
  local_transport?: Record<string, unknown>;
  footnotes_safety_tips?: Record<string, unknown>;
}

export interface GalleryRoute {
  name: string;
  day: number | null;
  color: string;
  mode: string;
  points: [number, number][];
  distanceKm: number;
}

export interface GalleryTripSummary {
  _id: string;
  title: string;
  destination: string;
  summary: string;
  tags: string[];
  dates: GalleryDates;
  durationDays: number;
  season: string;
  groupType: string;
  publisher: GalleryPublisher;
  publishedAt: string | null;
}

export interface GalleryTrip extends GalleryTripSummary {
  itinerary: GalleryItinerary;
  customRoutes: GalleryRoute[];
}

export interface GalleryTravelerProfile {
  handle: string;
  name: string;
  bio: string;
  avatarUrl?: string;
  trips: GalleryTripSummary[];
}

/* -------------------------------------------------------------------------- */
/*  Scalar helpers                                                             */
/* -------------------------------------------------------------------------- */

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => asText(entry)).filter((entry) => entry.length > 0)
    : [];
}

function asPositiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function asIsoDay(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function isCoord(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                      */
/* -------------------------------------------------------------------------- */

function durationOf(trip: any): number {
  const declared = asPositiveInt(trip?.tripDetails?.duration_days);
  if (declared) return declared;

  const days = trip?.tripDetails?.day_by_day_itinerary;
  if (Array.isArray(days) && days.length > 0) return days.length;

  const start = trip?.startDate ? new Date(trip.startDate) : null;
  const end = trip?.endDate ? new Date(trip.endDate) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (span > 0) return span;
  }
  return 1;
}

function dateLabel(start: Date, durationDays: number): string {
  const unit = durationDays === 1 ? 'day' : 'days';
  return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()} · ${durationDays} ${unit}`;
}

/**
 * Hidden mode returns a month + duration label with **no** start/end dates on
 * the object, so the concrete window can never be read off the payload.
 */
export function buildGalleryDates(trip: any, hideExactDates: boolean): GalleryDates {
  const durationDays = durationOf(trip);
  const start = trip?.startDate ? new Date(trip.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { exact: false, label: 'Dates flexible' };
  }

  const label = dateLabel(start, durationDays);
  if (hideExactDates) return { exact: false, label };

  const end = trip?.endDate ? new Date(trip.endDate) : null;
  const endIso =
    end && !Number.isNaN(end.getTime())
      ? asIsoDay(end)
      : asIsoDay(new Date(start.getTime() + (durationDays - 1) * 86_400_000));

  return {
    exact: true,
    startDate: asIsoDay(start),
    endDate: endIso,
    label,
  };
}

/* -------------------------------------------------------------------------- */
/*  Itinerary                                                                  */
/* -------------------------------------------------------------------------- */

function projectActivity(raw: unknown): GalleryActivity | null {
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name } : null;
  }
  if (!raw || typeof raw !== 'object') return null;

  const activity = raw as Record<string, unknown>;
  const name = asText(activity.name) || asText(activity.title);
  if (!name) return null;

  const projected: GalleryActivity = { name };
  const time = asText(activity.time);
  const description = asText(activity.description);
  const location = asText(activity.location) || asText(activity.location_name);
  if (time) projected.time = time;
  if (description) projected.description = description;
  if (location) projected.location = location;
  if (isCoord(activity.coordinates)) {
    projected.coordinates = [Number(activity.coordinates[0]), Number(activity.coordinates[1])];
  }
  return projected;
}

function projectStay(raw: unknown): GalleryStay | null {
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name } : null;
  }
  if (!raw || typeof raw !== 'object') return null;

  const stay = raw as Record<string, unknown>;
  const name = asText(stay.name);
  if (!name) return null;

  const projected: GalleryStay = { name };
  const location = asText(stay.location);
  const description = asText(stay.description);
  const vibe = asText(stay.vibe);
  if (location) projected.location = location;
  if (description) projected.description = description;
  if (vibe) projected.vibe = vibe;
  if (isCoord(stay.coordinates)) {
    projected.coordinates = [Number(stay.coordinates[0]), Number(stay.coordinates[1])];
  }
  return projected;
}

function projectDay(raw: any): GalleryDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const day = asPositiveInt(raw.day);
  if (!day) return null;

  const activities = Array.isArray(raw.activities)
    ? raw.activities
        .map(projectActivity)
        .filter((entry: GalleryActivity | null): entry is GalleryActivity => entry !== null)
    : [];
  const stays = Array.isArray(raw.stay_recommendations)
    ? raw.stay_recommendations
        .map(projectStay)
        .filter((entry: GalleryStay | null): entry is GalleryStay => entry !== null)
    : [];

  return {
    day,
    title: asText(raw.title),
    activities,
    stay_recommendations: stays,
    transport: asTextList(raw.transport),
    food_spots: asTextList(raw.food_spots),
    pro_tip: asTextList(raw.pro_tip),
    permit_required: raw.permit_required === true,
  };
}

/**
 * A sanitized `ItineraryData` subset: renderable by the existing itinerary
 * components, with every price-bearing field dropped.
 */
export function projectGalleryItinerary(tripDetails: any): GalleryItinerary {
  const details = tripDetails && typeof tripDetails === 'object' ? tripDetails : {};

  const days = Array.isArray(details.day_by_day_itinerary)
    ? details.day_by_day_itinerary
        .map(projectDay)
        .filter((entry: GalleryDay | null): entry is GalleryDay => entry !== null)
    : [];

  const itinerary: GalleryItinerary = {
    trip_title: asText(details.trip_title),
    duration_days: asPositiveInt(details.duration_days) ?? days.length,
    season: asText(details.season),
    group_type: asText(details.group_type),
    highlights: asTextList(details.highlights),
    day_by_day_itinerary: days,
  };

  if (details.weather_advisory && typeof details.weather_advisory === 'object') {
    const weather = details.weather_advisory;
    itinerary.weather_advisory = {
      expected_weather: asText(weather.expected_weather),
      packing_tips: asTextList(weather.packing_tips),
      risks: asTextList(weather.risks),
      seasonal_highlights: asTextList(weather.seasonal_highlights),
    };
  }
  if (details.local_transport && typeof details.local_transport === 'object') {
    const transport = details.local_transport;
    itinerary.local_transport = {
      walking: asText(transport.walking),
      auto_rickshaw: asText(transport.auto_rickshaw),
      local_buses: asText(transport.local_buses),
      shared_cabs: asText(transport.shared_cabs),
      tips: asTextList(transport.tips),
    };
  }
  if (details.footnotes_safety_tips && typeof details.footnotes_safety_tips === 'object') {
    const notes = details.footnotes_safety_tips;
    const payment = notes.payment ?? {};
    const permits = notes.permits ?? {};
    const connectivity = notes.connectivity ?? {};
    itinerary.footnotes_safety_tips = {
      cultural_etiquette: asTextList(notes.cultural_etiquette),
      safety: asTextList(notes.safety),
      payment: { upi: asText(payment.upi), cash: asText(payment.cash) },
      permits: {
        rohtang_pass_required: permits.rohtang_pass_required === true,
        apply_online: asText(permits.apply_online),
      },
      connectivity: {
        wifi: asText(connectivity.wifi),
        mobile_networks: asText(connectivity.mobile_networks),
      },
    };
  }
  return itinerary;
}

/* -------------------------------------------------------------------------- */
/*  Routes and publisher                                                       */
/* -------------------------------------------------------------------------- */

function projectRoute(raw: any): GalleryRoute | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = asText(raw.name);
  if (!name) return null;

  const points = Array.isArray(raw.points)
    ? raw.points.filter(isCoord).map((point: [number, number]) => [Number(point[0]), Number(point[1])] as [number, number])
    : [];

  return {
    name,
    day: asPositiveInt(raw.day) ?? null,
    color: asText(raw.color) || '#0ea5e9',
    mode: asText(raw.mode) || 'drive',
    points,
    distanceKm: Number.isFinite(Number(raw.distanceKm)) ? Number(raw.distanceKm) : 0,
  };
}

export function projectPublisher(user: GalleryProfileSource | null | undefined): GalleryPublisher {
  const handle = asText(user?.profile?.handle);
  const publisher: GalleryPublisher = {
    handle,
    name: asText(user?.name) || handle,
  };
  if (user?.avatarUrl) publisher.avatarUrl = String(user.avatarUrl);
  return publisher;
}

/* -------------------------------------------------------------------------- */
/*  Trip and traveler                                                          */
/* -------------------------------------------------------------------------- */

function destinationOf(trip: any): string {
  return (
    asText(trip?.generationMeta?.request?.destination) ||
    asText(trip?.tripDetails?.trip_title) ||
    asText(trip?.title)
  );
}

function titleOf(trip: any): string {
  return asText(trip?.title) || asText(trip?.tripDetails?.trip_title) || 'Untitled trip';
}

/** Card-sized projection — the gallery listing and traveler page use this. */
export function projectGalleryTripSummary(
  trip: any,
  publisher: GalleryPublisher
): GalleryTripSummary {
  const itinerary = trip?.tripDetails ?? {};
  return {
    _id: String(trip?._id ?? ''),
    title: titleOf(trip),
    destination: destinationOf(trip),
    summary: asText(trip?.gallery?.summary),
    tags: asTextList(trip?.gallery?.tags),
    dates: buildGalleryDates(trip, trip?.gallery?.hideExactDates === true),
    durationDays: durationOf(trip),
    season: asText(itinerary.season),
    groupType: asText(itinerary.group_type),
    publisher,
    publishedAt: trip?.publishedAt ? new Date(trip.publishedAt).toISOString() : null,
  };
}

/** Full public trip page payload. Never includes `shareId` or member data. */
export function projectGalleryTrip(trip: any, publisher: GalleryPublisher): GalleryTrip {
  const detail = trip && typeof trip === 'object' ? trip : {};
  return {
    ...projectGalleryTripSummary(detail, publisher),
    itinerary: projectGalleryItinerary(detail.tripDetails),
    customRoutes: Array.isArray(detail.customRoutes)
      ? detail.customRoutes
          .map(projectRoute)
          .filter((entry: GalleryRoute | null): entry is GalleryRoute => entry !== null)
      : [],
  };
}

export function projectTravelerProfile(
  user: GalleryProfileSource,
  trips: any[]
): GalleryTravelerProfile {
  const publisher = projectPublisher(user);
  const profile: GalleryTravelerProfile = {
    handle: publisher.handle,
    name: publisher.name,
    bio: asText(user?.profile?.bio),
    trips: (Array.isArray(trips) ? trips : []).map((trip) =>
      projectGalleryTripSummary(trip, publisher)
    ),
  };
  if (user?.avatarUrl) profile.avatarUrl = String(user.avatarUrl);
  return profile;
}
