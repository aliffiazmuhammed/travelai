import { apiRequest } from './client';

/**
 * Public gallery payloads, mirrored from `backend/src/services/gallery/projection.ts`.
 * Everything here is anonymous: these shapes carry no budget, member or
 * private-trip data by construction.
 */

export type GalleryDuration = 'short' | 'week' | 'fortnight' | 'long';
export type ExploreWhen = 'live' | 'past';

export interface GalleryPublisher {
  handle: string;
  name: string;
  avatarUrl?: string;
}

export interface GalleryDates {
  exact: boolean;
  startDate?: string;
  endDate?: string;
  label: string;
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

export interface GalleryWeather {
  expected_weather?: string;
  packing_tips?: string[];
  risks?: string[];
  seasonal_highlights?: string[];
}

export interface GalleryLocalTransport {
  walking?: string;
  auto_rickshaw?: string;
  local_buses?: string;
  shared_cabs?: string;
  tips?: string[];
}

export interface GalleryFootnotes {
  cultural_etiquette?: string[];
  safety?: string[];
  payment?: { upi?: string; cash?: string };
  permits?: { rohtang_pass_required?: boolean; apply_online?: string };
  connectivity?: { wifi?: string; mobile_networks?: string };
}

export interface GalleryItinerary {
  trip_title: string;
  duration_days: number;
  season: string;
  group_type: string;
  highlights: string[];
  weather_advisory?: GalleryWeather;
  day_by_day_itinerary: GalleryDay[];
  local_transport?: GalleryLocalTransport;
  footnotes_safety_tips?: GalleryFootnotes;
}

export interface GalleryRoute {
  name: string;
  day: number | null;
  color: string;
  mode: string;
  points: [number, number][];
  distanceKm: number;
}

/** Full public trip page — `GET /api/explore/:tripId`. */
export interface GalleryTrip extends GalleryTripSummary {
  itinerary: GalleryItinerary;
  customRoutes: GalleryRoute[];
}

export interface ExplorePage {
  trips: GalleryTripSummary[];
  hasMore: boolean;
  total: number;
  page: number;
  pageSize: number;
}

export interface ExploreFilters {
  q?: string;
  duration?: GalleryDuration;
  groupType?: string;
  tag?: string;
  when?: ExploreWhen;
  page?: number;
  limit?: number;
}

export interface AgencyDirectoryService {
  id: string;
  label: string;
}

/** One public directory listing — `backend/src/services/directory/listing.ts`. */
export interface AgencyDirectoryCard {
  slug: string;
  name: string;
  baseCity: string;
  specialties: string[];
  services: AgencyDirectoryService[];
  /** Site-relative path handled by `assetUrl`. */
  logoUrl: string | null;
  verified: boolean;
  fromPricePerPerson: number | null;
  currency: string;
}

interface AgencyDirectoryResponse {
  agencies: AgencyDirectoryCard[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ''
  );
  if (entries.length === 0) return '';
  return `?${entries
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')}`;
}

/** GET /api/explore — anonymous, page-numbered for Previous/Next paging. */
export function fetchExplore(filters: ExploreFilters = {}): Promise<ExplorePage> {
  return apiRequest<ExplorePage>(`/explore${toQueryString({ ...filters })}`, { auth: false });
}

/** GET /api/explore/:tripId — one public itinerary; 404 once it is private. */
export function fetchGalleryTrip(tripId: string): Promise<GalleryTrip> {
  return apiRequest<{ success: true; trip: GalleryTrip }>(
    `/explore/${encodeURIComponent(tripId)}`,
    { auth: false }
  ).then((response) => response.trip);
}

/** GET /api/agencies — the public directory strip on Explore. */
export async function fetchAgencies(limit = 6): Promise<AgencyDirectoryCard[]> {
  const page = await apiRequest<AgencyDirectoryResponse>(
    `/agencies${toQueryString({ limit })}`,
    { auth: false }
  );
  return page.agencies;
}
