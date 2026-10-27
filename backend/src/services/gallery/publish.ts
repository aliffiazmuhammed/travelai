import Trip, { type TripVisibility } from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import {
  GALLERY_MAX_TAGS,
  GALLERY_SUMMARY_MAX_LEN,
  GALLERY_TAG_MAX_LEN,
} from '../../schemas/gallery.schema.js';

/**
 * Publishing contract (Milestone 8 G1).
 *
 * Three structural refusals live here, not only in the route guard:
 * - agency rows can never be published (the model also rejects `public`);
 * - only an owner may publish/unpublish;
 * - a publisher must have claimed a traveler handle first, because the gallery
 *   payload always carries a `/travelers/:handle` link.
 */

export interface SetPublicationInput {
  tripId: string;
  published: boolean;
  hideExactDates?: unknown;
  summary?: unknown;
  tags?: unknown;
}

export interface PublicationState {
  visibility: TripVisibility;
  publishedAt: string | null;
  gallery: { hideExactDates: boolean; summary: string; tags: string[] };
}

export function isTripOwner(trip: any, userId: string): boolean {
  return (Array.isArray(trip?.members) ? trip.members : []).some(
    (member: any) =>
      String(member?.userId) === String(userId) && String(member?.role) === 'owner'
  );
}

/** Single-spaced, trimmed summary; an empty string clears it. */
export function normalizeGallerySummary(raw: unknown): string {
  const summary = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (summary.length > GALLERY_SUMMARY_MAX_LEN) {
    throw new AppError(
      `Keep the summary to ${GALLERY_SUMMARY_MAX_LEN} characters or fewer.`,
      400
    );
  }
  return summary;
}

/** Lowercased, hyphen-separated, deduped tag list. */
export function normalizeGalleryTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new AppError('Tags must be a list.', 400);
  }
  if (raw.length > GALLERY_MAX_TAGS) {
    throw new AppError(`Add ${GALLERY_MAX_TAGS} tags or fewer.`, 400);
  }

  const tags: string[] = [];
  for (const entry of raw) {
    const tag = String(entry ?? '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > GALLERY_TAG_MAX_LEN) {
      throw new AppError(`Tags can be ${GALLERY_TAG_MAX_LEN} characters or fewer.`, 400);
    }
    if (!/^[a-z0-9_-]+$/.test(tag)) {
      throw new AppError('Tags can use letters, numbers, hyphens and underscores only.', 400);
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function publicationState(trip: any): PublicationState {
  return {
    visibility: (trip.visibility ?? 'private') as TripVisibility,
    publishedAt: trip.publishedAt ? new Date(trip.publishedAt).toISOString() : null,
    gallery: {
      hideExactDates: trip.gallery?.hideExactDates === true,
      summary: String(trip.gallery?.summary ?? ''),
      tags: Array.isArray(trip.gallery?.tags) ? trip.gallery.tags.map(String) : [],
    },
  };
}

export async function setTripPublication(
  userId: string,
  input: SetPublicationInput
): Promise<PublicationState> {
  const trip: any = await Trip.findOne({
    _id: input.tripId,
    isDeleted: { $ne: true },
  });
  if (!trip) {
    throw new AppError('Trip not found.', 404);
  }
  if (trip.workspace === 'agency' || trip.agencyId) {
    throw new AppError('Agency trips cannot be published to the gallery.', 403);
  }
  if (!isTripOwner(trip, userId)) {
    throw new AppError('Only the trip owner can publish it.', 403);
  }

  if (!input.published) {
    // Unpublishing is immediate: public routes require `visibility: 'public'`.
    // An active share link stays usable as `unlisted`.
    trip.visibility = trip.isPublic && trip.shareId ? 'unlisted' : 'private';
    trip.publishedAt = undefined;
    await trip.save();
    return publicationState(trip);
  }

  const publisher = await User.findById(userId).select('profile.handle');
  if (!publisher?.profile?.handle) {
    throw new AppError('Choose your traveler handle before publishing a trip.', 400);
  }

  const current = trip.gallery ?? {};
  const gallery: { hideExactDates: boolean; summary?: string; tags: string[] } = {
    hideExactDates:
      input.hideExactDates === undefined
        ? current.hideExactDates === true
        : Boolean(input.hideExactDates),
    tags:
      input.tags === undefined
        ? Array.isArray(current.tags)
          ? current.tags.map(String)
          : []
        : normalizeGalleryTags(input.tags),
  };

  if (input.summary === undefined) {
    if (current.summary) gallery.summary = String(current.summary);
  } else {
    const summary = normalizeGallerySummary(input.summary);
    if (summary) gallery.summary = summary;
  }

  if (trip.visibility !== 'public') {
    trip.publishedAt = new Date();
  }
  trip.visibility = 'public';
  trip.gallery = gallery;
  await trip.save();
  return publicationState(trip);
}
