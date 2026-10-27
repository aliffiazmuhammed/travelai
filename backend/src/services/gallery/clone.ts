import { Types } from 'mongoose';
import Trip from '../../models/Trip.js';
import { loadGalleryTrip } from './explore.js';
import type { GalleryTrip } from './projection.js';

/**
 * Clone a published trip into a private draft (Milestone 8 G4).
 *
 * The source is deliberately re-read through `loadGalleryTrip`, the same
 * public projection the anonymous gallery page uses. That is the privacy
 * guarantee: a clone can only ever contain what a signed-out visitor could
 * already see — no budget, expenses, participants, finance, members, share id
 * or generation metadata. The original document is never loaded or written.
 *
 * Dates are copied only when the publisher exposed exact dates (`dates.exact`).
 * A hidden-date trip becomes "dates flexible" instead of silently resurrecting
 * the owner's real travel window.
 */

export interface ClonedTripDraft {
  userId: string;
  workspace: 'personal';
  title: string;
  status: 'draft';
  isDeleted: false;
  visibility: 'private';
  isPublic: false;
  tripDetails: Record<string, unknown>;
  customRoutes: Array<{
    name: string;
    day?: number;
    color: string;
    mode: string;
    points: [number, number][];
    distanceKm: number;
  }>;
  startDate?: Date;
  endDate?: Date;
  clonedFrom: {
    tripId: Types.ObjectId;
    ownerHandle: string;
    clonedAt: Date;
  };
}

function asDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Builds the new-trip payload. Pure, so the copy rules are directly testable. */
export function buildClonedTripDraft(
  source: GalleryTrip,
  userId: string,
  now: Date = new Date()
): ClonedTripDraft {
  const draft: ClonedTripDraft = {
    userId,
    workspace: 'personal',
    title: source.title,
    status: 'draft',
    isDeleted: false,
    // A clone always starts private. Publishing is a separate, deliberate act.
    visibility: 'private',
    isPublic: false,
    // Deep copy so later edits to the clone can never touch the source payload.
    tripDetails: JSON.parse(JSON.stringify(source.itinerary)),
    customRoutes: source.customRoutes.map((route) => ({
      name: route.name,
      ...(route.day !== null ? { day: route.day } : {}),
      color: route.color,
      mode: route.mode,
      points: route.points.map(
        (point) => [Number(point[0]), Number(point[1])] as [number, number]
      ),
      distanceKm: route.distanceKm,
    })),
    clonedFrom: {
      tripId: new Types.ObjectId(source._id),
      ownerHandle: source.publisher.handle,
      clonedAt: now,
    },
  };

  // Only an explicitly public window is copied. Hidden dates mean the clone
  // starts date-less, exactly like the public card showed it.
  if (source.dates.exact) {
    const startDate = asDate(source.dates.startDate);
    const endDate = asDate(source.dates.endDate);
    if (startDate) draft.startDate = startDate;
    if (endDate) draft.endDate = endDate;
  }

  return draft;
}

/**
 * Loads the public projection, builds a fresh private draft owned by `userId`,
 * and saves it. Throws the projection's 404 for unpublished, expired, deleted
 * or agency sources before anything is written.
 */
export async function cloneGalleryTrip(tripId: string, userId: string) {
  const source = await loadGalleryTrip(tripId);
  const trip = new Trip(buildClonedTripDraft(source, userId));
  await trip.save();
  return trip;
}
