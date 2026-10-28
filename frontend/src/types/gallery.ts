/**
 * Public gallery payloads (Milestone 8). These mirror the server projections in
 * `backend/src/services/gallery/projection.ts` — only what a signed-out visitor
 * may see. Budget, expenses and member data are never part of these shapes.
 */

import type { ItineraryData } from './trip';

export type TripVisibility = 'private' | 'unlisted' | 'public';

/** Per-trip gallery options the owner controls from the share modal. */
export interface TripGallery {
  hideExactDates: boolean;
  summary?: string;
  tags: string[];
}

/** What the server answers after publish / unpublish / metadata save. */
export interface TripPublicationState {
  visibility: TripVisibility;
  publishedAt: string | null;
  gallery: { hideExactDates: boolean; summary: string; tags: string[] };
}

/**
 * Owner-side prefill for the publish form. `destination` is the request's
 * destination, which is what the public card shows.
 */
export interface TripPublicationSnapshot {
  visibility: TripVisibility;
  publishedAt?: string | null;
  gallery?: Partial<TripGallery>;
  startDate?: string;
  endDate?: string;
  destination?: string;
  /** Persisted `tripDetails.duration_days`; undefined means the card uses dates. */
  durationDays?: number;
  /** G6: present when reports or an admin hid the public listing. */
  moderation?: TripModeration;
}

export interface GalleryPublisher {
  handle: string;
  name: string;
  avatarUrl?: string;
}

/** `exact: false` carries a label only — never the concrete window. */
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

/**
 * The public itinerary is an `ItineraryData` subset: budget, expenses and
 * generation metadata are absent by construction. Reusing the trip sub-types
 * keeps it assignable to the existing read-only renderers.
 */
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
  weather_advisory?: ItineraryData['weather_advisory'];
  day_by_day_itinerary: GalleryDay[];
  local_transport?: ItineraryData['local_transport'];
  footnotes_safety_tips?: ItineraryData['footnotes_safety_tips'];
}

/** A drawn route, stripped of prices and ownership. */
export interface GalleryRoute {
  name: string;
  day: number | null;
  color: string;
  mode: string;
  points: [number, number][];
  distanceKm: number;
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

/** Duration buckets understood by `GET /api/explore`. */
export type GalleryDuration = 'short' | 'week' | 'fortnight' | 'long';

export interface ExploreFilters {
  q?: string;
  duration?: GalleryDuration;
  groupType?: string;
  /** A single tag; the server also accepts a comma-separated list. */
  tag?: string;
  cursor?: string;
  limit?: number;
}

/** One public cursor page. `total` ignores the cursor. */
export interface ExplorePage {
  trips: GalleryTripSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Moderation (Milestone 8 G6)                                                */
/* -------------------------------------------------------------------------- */

/** `agency_profile` (M9 D5) is addressed by the directory slug. */
export type ReportTargetType = 'trip' | 'profile' | 'agency_profile';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'scam'
  | 'privacy'
  | 'other';
export type ReportStatus = 'open' | 'hidden' | 'dismissed';

/** Gallery moderation state on the owner's trip payload. */
export interface TripModeration {
  hiddenAt?: string;
  hiddenBy?: string;
  source?: 'auto_report' | 'admin';
}

/** The server's answer to `POST /api/reports`. */
export interface ContentReport {
  _id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string;
  status: ReportStatus;
  createdAt: string;
}

export interface ReportResult {
  success: boolean;
  report: ContentReport;
  /** True when this report pushed the trip over the auto-hide threshold. */
  hidden: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Join requests & blocks (Milestone 8 G5)                                    */
/* -------------------------------------------------------------------------- */

export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

/**
 * Requester identity as the owner sees it in the queue: public name, handle and
 * photo only — the server never sends an email on this surface.
 */
export interface JoinRequester {
  id: string;
  label: string;
  handle?: string;
  avatarUrl?: string;
}

export interface TripJoinRequest {
  _id: string;
  status: JoinRequestStatus;
  message?: string;
  createdAt: string;
  decidedAt?: string | null;
  /** Owner-facing rows only. */
  requester?: JoinRequester;
}

/** `GET /api/itinerary/:id/join-request` — enough state for the join button. */
export interface JoinRequestState {
  request: TripJoinRequest | null;
  isMember: boolean;
  isOwner: boolean;
}

export interface BlockedAccount {
  userId: string;
  label: string;
  handle?: string;
  avatarUrl?: string;
  createdAt: string;
}
