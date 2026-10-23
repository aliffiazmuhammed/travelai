import Trip from '../../models/Trip.js';
import type { TripHistorySummary } from '../ai/prompt.js';

const MAX_HISTORY_TRIPS = 12;
const MAX_RECENT_DESTINATIONS = 6;

/**
 * Derives a lightweight personalization summary from a user's recent trips.
 * Falls back to `null` when the user is new or has no usable history so the
 * prompt stays clean for first-time travellers.
 */
export async function buildTripHistorySummary(
  userId?: string
): Promise<TripHistorySummary | null> {
  if (!userId) return null;

  const trips = await Trip.find({
    userId,
    isDeleted: { $ne: true },
    // Personalization history is personal-only; agency trips are tenant data.
    workspace: { $ne: 'agency' },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_TRIPS)
    .select('title tripDetails generationMeta feedback')
    .lean<Record<string, any>[]>();

  if (!trips || trips.length === 0) return null;

  const recentDestinations: string[] = [];
  const interestCounts: Record<string, number> = {};
  const budgets: number[] = [];
  const groupCounts: Record<string, number> = {};
  const likedHighlights: string[] = [];
  const likedVariants: string[] = [];

  for (const trip of trips) {
    const meta = trip.generationMeta || {};
    const request = meta.request || {};

    const destination =
      request.destination || trip.title || trip.tripDetails?.trip_title;
    if (
      destination &&
      recentDestinations.length < MAX_RECENT_DESTINATIONS &&
      !recentDestinations.includes(destination)
    ) {
      recentDestinations.push(destination);
    }

    for (const interest of request.interests || []) {
      interestCounts[interest] = (interestCounts[interest] || 0) + 1;
    }

    const budget = Number(request.budget);
    if (Number.isFinite(budget) && budget > 0) budgets.push(budget);

    if (request.groupType) {
      groupCounts[request.groupType] = (groupCounts[request.groupType] || 0) + 1;
    }

    // Positive feedback is the strongest personalization signal
    if (trip.feedback?.rating === 'up') {
      const highlights = trip.tripDetails?.highlights;
      if (Array.isArray(highlights)) likedHighlights.push(...highlights.slice(0, 3));
      if (meta.variant) likedVariants.push(meta.variant);
    }
  }

  const topInterests = Object.entries(interestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([interest]) => interest);

  const preferredGroupType = Object.entries(groupCounts).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  const avgBudgetPerPerson = budgets.length
    ? budgets.reduce((sum, b) => sum + b, 0) / budgets.length
    : undefined;

  return {
    totalTrips: trips.length,
    recentDestinations,
    topInterests,
    avgBudgetPerPerson,
    preferredGroupType,
    likedHighlights: Array.from(new Set(likedHighlights)).slice(0, 6),
    likedVariants: Array.from(new Set(likedVariants)),
  };
}
