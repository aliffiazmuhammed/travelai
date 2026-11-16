import type { GalleryTripSummary } from './explore';
import { apiRequest } from './client';

/**
 * Public discovery profiles, mirrored from the backend allow-lists:
 * `services/gallery/projection.ts` (traveller) and
 * `services/directory/projection.ts` (agency). Both reads are anonymous and
 * carry no contact, member or money fields beyond what the agency published.
 */

export interface TravelerProfile {
  handle: string;
  name: string;
  bio: string;
  avatarUrl?: string;
  trips: GalleryTripSummary[];
}

export interface AgencyService {
  id: string;
  label: string;
}

export interface AgencyLanguage {
  code: string;
  label: string;
}

export interface AgencyPackage {
  id: string;
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  /** Site-relative path handled by `assetUrl`. */
  coverUrl: string | null;
  highlights: string[];
  inclusions: string[];
}

export interface AgencyProfile {
  slug: string;
  name: string;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: AgencyService[];
  languages: AgencyLanguage[];
  logoUrl: string | null;
  website: string | null;
  contactPhone: string | null;
  gstin: string | null;
  verified: boolean;
  publishedAt: string | null;
  replyTimeHours: number | null;
  packages: AgencyPackage[];
}

/** GET /api/travelers/:handle — public portfolio; 404 for an unknown handle. */
export function fetchTravelerProfile(handle: string): Promise<TravelerProfile> {
  return apiRequest<{ success: true; traveler: TravelerProfile }>(
    `/travelers/${encodeURIComponent(handle)}`,
    { auth: false }
  ).then((response) => response.traveler);
}

/** GET /api/agencies/:slug — public directory profile; 404 when unpublished. */
export function fetchAgencyProfile(slug: string): Promise<AgencyProfile> {
  return apiRequest<{ success: true; profile: AgencyProfile }>(
    `/agencies/${encodeURIComponent(slug)}`,
    { auth: false }
  ).then((response) => response.profile);
}
