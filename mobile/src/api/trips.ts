import type {
  GalleryActivity,
  GalleryFootnotes,
  GalleryLocalTransport,
  GalleryWeather,
} from '@/api/explore';
import type { TripExpense, TripFinance, TripParticipant } from '@/api/expenses';
import type { MediaRef } from '@/api/media';
import { apiRequest } from '@/api/client';

export type TripStatus = 'draft' | 'planned' | 'ongoing' | 'completed';
export type TripRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface TripMemberSummary {
  userId: string;
  role: TripRole;
  invitedBy?: string;
  joinedAt?: string;
}

/** Row shape of `GET /itinerary` — summaries only, never the whole document. */
export interface MyTripSummary {
  _id: string;
  title?: string;
  status?: TripStatus;
  role?: TripRole;
  version?: number;
  hasEdited?: boolean;
  rev?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  workspace?: 'personal' | 'agency';
  members?: TripMemberSummary[];
  /** Only present on detail payloads; the list projection leaves it out. */
  generationMeta?: { request?: { destination?: string } };
  tripDetails?: {
    trip_title?: string;
    duration_days?: number;
    budget_per_person?: number;
    group_type?: string;
    season?: string;
  };
}

export interface TripStay {
  name: string;
  location?: string;
  description?: string;
  vibe?: string;
  price_per_night?: string | number;
  coordinates?: [number, number];
  image?: MediaRef;
}

export interface TripFood {
  name: string;
  cuisine?: string;
  price?: string;
  note?: string;
  image?: MediaRef;
}

export interface TripDay {
  day: number;
  title?: string;
  image?: MediaRef;
  activities?: (string | (GalleryActivity & { title?: string; location_name?: string }))[];
  stay_recommendations?: (string | TripStay)[];
  transport?: string[];
  food_spots?: (string | TripFood)[];
  pro_tip?: (string | { tip?: string; text?: string })[];
  permit_required?: boolean;
}

export interface TripBudgetBreakdown {
  accommodation?: number;
  food_and_drinks?: number;
  activities_and_entry?: number;
  local_transport?: number;
  miscellaneous_buffer?: number;
  total?: number;
}

export interface TripItinerary {
  trip_title?: string;
  duration_days?: number;
  budget_per_person?: number;
  season?: string;
  group_type?: string;
  highlights?: string[];
  weather_advisory?: GalleryWeather;
  day_by_day_itinerary?: TripDay[];
  budget_breakdown?: TripBudgetBreakdown;
  local_transport?: GalleryLocalTransport;
  footnotes_safety_tips?: GalleryFootnotes;
}

export interface TripCustomRoute {
  _id?: string;
  name: string;
  day?: number | null;
  color: string;
  mode: string;
  points: [number, number][];
  distanceKm: number;
}

/** Full document from `GET /itinerary/:id`, role-annotated for the caller. */
export interface MyTripDetail extends Omit<MyTripSummary, 'tripDetails'> {
  tripDetails?: TripItinerary;
  customRoutes?: TripCustomRoute[];
  expenses?: TripExpense[];
  participants?: TripParticipant[];
  finance?: TripFinance;
}

export function fetchMyTrips(): Promise<MyTripSummary[]> {
  return apiRequest<MyTripSummary[]>('/itinerary');
}

export function fetchMyTrip(tripId: string): Promise<MyTripDetail> {
  return apiRequest<MyTripDetail>(`/itinerary/${encodeURIComponent(tripId)}`);
}

export interface PlanEditInput {
  /** The revision the edit started from; a stale write is rejected with 409. */
  baseRev: number;
  tripDetails: TripItinerary;
  /** Owner-only. When present, name and content save together in one write. */
  title?: string;
}

/**
 * Whole-itinerary save. A rename goes through the owner route so both land in
 * one revision; content-only edits use the editor-safe route so collaborators
 * can save from their own phones.
 */
export function savePlanChanges(tripId: string, input: PlanEditInput): Promise<MyTripDetail> {
  const id = encodeURIComponent(tripId);
  const path = input.title !== undefined ? `/itinerary/${id}` : `/itinerary/${id}/itinerary`;
  return apiRequest<MyTripDetail>(path, { method: 'PUT', body: input });
}
