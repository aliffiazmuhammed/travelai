import { Request, Response } from 'express';
import crypto from 'crypto';
import { generateWithFallback, generateStreamWithFallback } from '../services/ai/index.js';
import {
  PROMPT_VERSION,
  buildPromptText,
  buildDayAlternativePrompt,
  computeInterestWeights,
  adaptPromptForSeason,
  assignVariant,
  resolveLanguage,
} from '../services/ai/prompt.js';
import { scoreItinerary } from '../services/ai/quality.js';
import { buildTripHistorySummary } from '../services/itinerary/context.js';
import { isValidCoord } from '../services/geo/distance.js';
import { DailyWeather, getWeatherForecast } from '../services/geo/weather.js';
import { RoutingDayInput, analyzeWeatherRouting } from '../services/geo/weatherRouting.js';
import {
  isValidPermutation,
  applyOrder,
  moveItem,
  renumberDays,
  updateActivityInDays,
} from '../services/itinerary/editing.js';
import Trip from '../models/Trip.js';
import { Types } from 'mongoose';
import { catchAsync } from '../utils/catchAsync.js';
import { sanitizeTripFor } from '../utils/sanitizeTrip.js';
import { roleOf } from '../services/collab/access.js';
import { tripContext } from '../middleware/tripAccess.middleware.js';
import { findPublicSharedTrip, projectPublicTrip } from '../services/collab/publicTrip.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

function parseItineraryJson(rawResponse: string): Record<string, any> {
  const cleaned = rawResponse
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract JSON between first '{' and last '}'
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const extracted = cleaned.substring(startIdx, endIdx + 1);
      return JSON.parse(extracted);
    }
    throw new AppError('We were unable to format your travel itinerary. Please try generating again.', 500);
  }
}

// Maximum number of historical version snapshots retained per trip (F13) —
// configurable so deployments trade document size against undo depth.
const MAX_VERSIONS = env.VERSIONS_MAX;

/**
 * Pushes a snapshot of the trip's *current* state into its version history.
 * Must be called BEFORE mutating tripDetails so the snapshot captures the
 * pre-change state. Trims history to the most recent MAX_VERSIONS entries.
 */
function snapshotCurrent(trip: any, note?: string): void {
  if (!Array.isArray(trip.versions)) {
    trip.versions = [];
  }
  trip.versions.push({
    version: trip.version ?? 1,
    title: trip.title,
    tripDetails: JSON.parse(JSON.stringify(trip.tripDetails || {})),
    savedAt: new Date(),
    note,
  });
  if (trip.versions.length > MAX_VERSIONS) {
    trip.versions = trip.versions.slice(trip.versions.length - MAX_VERSIONS);
  }
}

/** Extracts the editable day-by-day array from a trip, or throws a friendly error. */
function getItineraryDays(trip: any): any[] {
  const itinerary = trip?.tripDetails?.day_by_day_itinerary;
  if (!Array.isArray(itinerary)) {
    throw new AppError('This trip does not contain a day-by-day itinerary to edit.', 400);
  }
  return itinerary;
}

/** Finds the array index of a day by its (1-based) day number. */
function findDayIndex(itinerary: any[], day: number): number {
  const index = itinerary.findIndex((d) => Number(d?.day) === Number(day));
  if (index === -1) {
    throw new AppError(`Day ${day} was not found in this itinerary.`, 404);
  }
  return index;
}

interface GenerateBody {
  destination: string;
  days: number;
  budget: number;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
  language?: string;
  preferences?: Record<string, any>;
}

/** Normalizes the `interests` field (array or comma-separated string) to a clean array. */
function normalizeInterests(interests: string[] | string): string[] {
  return (Array.isArray(interests) ? interests : String(interests || '').split(','))
    .map((i) => String(i).trim())
    .filter(Boolean);
}

/** Parses an optional `YYYY-MM-DD`-style value into a Date (or undefined). */
function parseTripDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Resolves the planned trip window persisted on the trip. When the user only
 * supplied a start date, the end date is derived from the trip length. The
 * window drives per-day weather forecasts (Milestone 4).
 */
function resolveTripWindow(startdate?: string, enddate?: string, days?: number) {
  const startDate = parseTripDate(startdate);
  let endDate = parseTripDate(enddate);
  if (!endDate && startDate && Number(days) > 0) {
    endDate = new Date(startDate.getTime() + (Number(days) - 1) * 24 * 60 * 60 * 1000);
  }
  return { startDate, endDate };
}

/**
 * Assembles the rich generation metadata persisted on every trip (Milestone 2).
 * Captures the prompt version, A/B variant, language, season, interest weights,
 * provider/cache status, quality score and an echo of the request so future
 * generations can be personalized and analysed.
 */
function buildGenerationMeta(opts: {
  body: GenerateBody;
  variant: 'A' | 'B';
  parsedItinerary: Record<string, any>;
  historyUsed: boolean;
  provider: string;
  cached: boolean;
}): Record<string, any> {
  const { body, variant, parsedItinerary, historyUsed, provider, cached } = opts;
  const interests = normalizeInterests(body.interests);
  const season = adaptPromptForSeason(body.startdate, body.destination);
  const language = resolveLanguage(body.language).code;
  const quality = scoreItinerary(parsedItinerary, {
    expectedDays: Number(body.days),
    interests,
  });

  return {
    promptVersion: PROMPT_VERSION,
    variant,
    language,
    season: season.name,
    interestWeights: computeInterestWeights(interests),
    historyUsed,
    provider,
    cached,
    qualityScore: quality.score,
    qualityGrade: quality.grade,
    qualityIssues: quality.issues.map((issue) => issue.code),
    request: {
      destination: body.destination,
      days: Number(body.days),
      budget: Number(body.budget),
      startdate: body.startdate,
      enddate: body.enddate,
      interests,
      groupType: body.groupType,
      language,
      preferences: body.preferences || {},
    },
    generatedAt: new Date(),
  };
}

export const generateItinerary = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as GenerateBody;
    const { destination, days, budget, startdate, enddate, interests, groupType, language, preferences } =
      body;

    const variant = assignVariant(req.userId);
    const history = await buildTripHistorySummary(req.userId);

    const promptText = buildPromptText({
      destination,
      days,
      budget,
      startdate,
      enddate,
      interests,
      groupType,
      language,
      preferences,
      history,
      variant,
    });

    const result = await generateWithFallback(promptText);
    const parsedItinerary = parseItineraryJson(result.text);

    const generationMeta = buildGenerationMeta({
      body,
      variant,
      parsedItinerary,
      historyUsed: Boolean(history),
      provider: result.provider,
      cached: result.cached,
    });

    const trip = new Trip({
      userId: req.userId,
      title: parsedItinerary.trip_title,
      status: 'planned',
      isDeleted: false,
      tripDetails: parsedItinerary,
      promptVersion: PROMPT_VERSION,
      generationMeta,
      ...resolveTripWindow(startdate, enddate, days),
    });
    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, 'owner'), role: 'owner' as const });
  }
);

export const generateItineraryStream = async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as GenerateBody;
  const { destination, days, budget, startdate, enddate, interests, groupType, language, preferences } =
    body;

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (eventData: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  try {
    sendEvent({
      type: 'progress',
      stage: 1,
      progress: 15,
      message: `Analyzing ${destination} weather, seasonal highlights & travel advisory...`,
    });

    const variant = assignVariant(req.userId);
    const history = await buildTripHistorySummary(req.userId);

    const promptText = buildPromptText({
      destination,
      days,
      budget,
      startdate,
      enddate,
      interests,
      groupType,
      language,
      preferences,
      history,
      variant,
    });

    let totalCharsReceived = 0;
    let currentStage = 1;

    const result = await generateStreamWithFallback(promptText, (chunk) => {
      totalCharsReceived += chunk.length;

      if (totalCharsReceived > 600 && currentStage < 2) {
        currentStage = 2;
        sendEvent({
          type: 'progress',
          stage: 2,
          progress: 40,
          message: `Planning ${days}-day detailed activities & optimal timing for ${groupType}...`,
        });
      } else if (totalCharsReceived > 1600 && currentStage < 3) {
        currentStage = 3;
        sendEvent({
          type: 'progress',
          stage: 3,
          progress: 65,
          message: `Discovering authentic local food spots, dhabas & recommended stays...`,
        });
      } else if (totalCharsReceived > 2800 && currentStage < 4) {
        currentStage = 4;
        sendEvent({
          type: 'progress',
          stage: 4,
          progress: 85,
          message: `Optimizing â‚¹${budget} budget allocation, transport routes & permit notes...`,
        });
      }
    });

    sendEvent({
      type: 'progress',
      stage: 5,
      progress: 95,
      message: 'Validating itinerary structure and formatting...',
    });

    const parsedItinerary = parseItineraryJson(result.text);

    const generationMeta = buildGenerationMeta({
      body,
      variant,
      parsedItinerary,
      historyUsed: Boolean(history),
      provider: result.provider,
      cached: result.cached,
    });

    const trip = new Trip({
      userId: req.userId,
      title: parsedItinerary.trip_title,
      status: 'planned',
      isDeleted: false,
      tripDetails: parsedItinerary,
      promptVersion: PROMPT_VERSION,
      generationMeta,
      ...resolveTripWindow(startdate, enddate, days),
    });
    await trip.save();

    sendEvent({
      type: 'complete',
      progress: 100,
      message: 'Your personalized itinerary is ready!',
      trip: trip,
    });

    res.end();
  } catch (error: any) {
    console.error('Streaming generation error:', error);
    const isProd = process.env.NODE_ENV === 'production';
    const friendlyMsg = isProd
      ? 'Unable to complete your travel plan at this moment. Please try generating again.'
      : error.message || 'Failed to generate itinerary. Please try again.';

    sendEvent({
      type: 'error',
      message: friendlyMsg,
    });
    res.end();
  }
};

export const getUserTrips = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { search, status, scope: rawScope } = req.query as Record<string, unknown>;

    // Milestone 6 (F9): the dashboard lists trips the user owns OR belongs to.
    // Scoped on the members list, which makes membership authoritative while
    // the creator's `userId` keeps legacy documents listing correctly.
    const scope = rawScope === 'owned' || rawScope === 'shared' ? rawScope : 'all';
    const memberId = new Types.ObjectId(String(req.userId));
    const memberMatcher = { 'members.userId': memberId };

    const query: Record<string, any> = {
      isDeleted: { $ne: true },
    };
    // Search and membership scope each need their own `$or`, so they compose
    // under `$and` instead of one clobbering the other.
    const andConditions: Record<string, any>[] = [];

    if (scope === 'owned') {
      query.userId = req.userId;
    } else if (scope === 'shared') {
      Object.assign(query, memberMatcher);
    } else {
      andConditions.push({ $or: [{ userId: req.userId }, memberMatcher] });
    }

    if (status && typeof status === 'string' && status !== 'all') {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      andConditions.push({
        $or: [{ title: searchRegex }, { 'tripDetails.trip_title': searchRegex }],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // F16 (E5): list rows are trip **summaries** — the dashboard renders
    // cards (title, status, days, budget, group, role, rev), never the ledger
    // or the whole itinerary. Opening a trip fetches the full document at
    // `GET /:id`, so detail views are unaffected.
    const trips = await Trip.find(query)
      .sort({ createdAt: -1 })
      .select(
        'title status version hasEdited rev startDate endDate createdAt updatedAt members tripDetails.trip_title tripDetails.duration_days tripDetails.budget_per_person tripDetails.group_type tripDetails.season'
      );

    // Annotate each row with the caller's role and project owner-only fields
    // accordingly (`sanitizeTripFor`). The row shape stays additive.
    const rows = trips.map((trip: any) => {
      const role = roleOf(trip, String(req.userId));
      return { ...sanitizeTripFor(trip, role), role };
    });

    res.status(200).json(rows);
  }
);

export const getTripById = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);

    // `role` annotates the payload so the SPA can gate its controls (cosmetic
    // only â€” the server enforces everything). Absent `role` reads as "owner"
    // for legacy single-user payloads.
    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

export const updateTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, status, tripDetails } = req.body;
    const { trip, role } = tripContext(req);

    const detailsChanged =
      tripDetails !== undefined &&
      JSON.stringify(tripDetails) !== JSON.stringify(trip.tripDetails || {});

    // Only snapshot when the actual itinerary content changed (metadata edits
    // like title/status should not flood the version history).
    if (detailsChanged) {
      snapshotCurrent(trip, 'Edited itinerary details');
      trip.version = (trip.version ?? 1) + 1;
      trip.hasEdited = true;
    }

    if (title !== undefined) trip.title = title;
    if (status !== undefined) trip.status = status;
    if (tripDetails !== undefined) {
      trip.tripDetails = tripDetails;
      trip.markModified('tripDetails');
    }

    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

/**
 * Updates a single activity inside a specific day of the itinerary.
 * PUT /api/itinerary/:id/activities
 */
export const updateTripActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { day, activityIndex, activity } = req.body;
    const { trip, role } = tripContext(req);

    const itinerary = getItineraryDays(trip);

    let nextDays: any[];
    try {
      nextDays = updateActivityInDays(itinerary, day, activityIndex, activity);
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : 'Unable to update the activity.',
        400
      );
    }

    snapshotCurrent(trip, `Edited an activity on Day ${day}`);
    trip.tripDetails.day_by_day_itinerary = nextDays;
    trip.markModified('tripDetails');
    trip.version = (trip.version ?? 1) + 1;
    trip.hasEdited = true;
    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

/**
 * Reorders the activities within a single day.
 * PUT /api/itinerary/:id/activities/reorder
 * `order` must be a permutation of the existing activity indices.
 */
export const reorderActivities = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { day, order } = req.body;
    const { trip, role } = tripContext(req);

    const itinerary = getItineraryDays(trip);
    const dayIndex = findDayIndex(itinerary, day);
    const activities = itinerary[dayIndex].activities;

    if (!Array.isArray(activities)) {
      throw new AppError('This day does not contain any activities to reorder.', 400);
    }

    const isPermutation = isValidPermutation(order, activities.length);

    if (!isPermutation) {
      throw new AppError('The requested activity order is invalid. Please refresh and try again.', 400);
    }

    snapshotCurrent(trip, `Reordered activities on Day ${day}`);
    trip.tripDetails.day_by_day_itinerary[dayIndex].activities = applyOrder(
      activities,
      order
    );
    trip.markModified('tripDetails');
    trip.version = (trip.version ?? 1) + 1;
    trip.hasEdited = true;
    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

/**
 * Moves an entire day to a new position and renumbers the days sequentially.
 * PUT /api/itinerary/:id/days/reorder
 */
export const moveTripDay = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { fromIndex, toIndex } = req.body;
    const { trip, role } = tripContext(req);

    const itinerary = getItineraryDays(trip);
    if (itinerary.length < 2) {
      throw new AppError('There is only one day in this itinerary, so it cannot be reordered.', 400);
    }
    if (fromIndex >= itinerary.length || toIndex >= itinerary.length) {
      throw new AppError('The requested day position is out of range.', 400);
    }
    if (fromIndex === toIndex) {
      return res.status(200).json({ ...sanitizeTripFor(trip, role), role });
    }

    snapshotCurrent(trip, 'Reordered trip days');
    trip.tripDetails.day_by_day_itinerary = renumberDays(
      moveItem(itinerary, fromIndex, toIndex)
    );
    trip.markModified('tripDetails');
    trip.version = (trip.version ?? 1) + 1;
    trip.hasEdited = true;
    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

/**
 * Lists lightweight summaries of a trip's version history (newest first).
 * GET /api/itinerary/:id/versions
 */
export const getTripVersions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    const versions = ((trip.versions || []) as any[])
      .map((v: any) => ({
        version: v.version,
        title: v.title,
        note: v.note,
        savedAt: v.savedAt,
        days: Array.isArray(v.tripDetails?.day_by_day_itinerary)
          ? v.tripDetails.day_by_day_itinerary.length
          : 0,
        budget: v.tripDetails?.budget_breakdown?.total ?? null,
      }))
      .sort((a: any, b: any) => b.version - a.version);

    res.status(200).json({
      success: true,
      currentVersion: trip.version ?? 1,
      hasEdited: Boolean(trip.hasEdited),
      versions,
    });
  }
);

/**
 * Returns the full details of one historical version (for previewing before restore).
 * GET /api/itinerary/:id/versions/:version
 */
export const getTripVersionDetails = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { version } = req.params;
    const { trip } = tripContext(req);

    const target = (trip.versions || []).find((v: any) => v.version === Number(version));
    if (!target) {
      throw new AppError('That version could not be found.', 404);
    }

    res.status(200).json({
      success: true,
      version: target.version,
      title: target.title,
      note: target.note,
      savedAt: target.savedAt,
      tripDetails: target.tripDetails,
    });
  }
);

/**
 * Restores the trip to a previous version. The current state is first snapshotted
 * so a restore can itself be undone.
 * POST /api/itinerary/:id/versions/:version/restore
 */
export const restoreTripVersion = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id, version } = req.params;
    const { note } = req.body || {};
    const { trip, role } = tripContext(req);

    const target = (trip.versions || []).find((v: any) => v.version === Number(version));
    if (!target) {
      throw new AppError('That version could not be found.', 404);
    }

    snapshotCurrent(trip, note || `Auto-backup before restoring version ${version}`);
    trip.tripDetails = JSON.parse(JSON.stringify(target.tripDetails));
    if (target.title) trip.title = target.title;
    trip.markModified('tripDetails');
    trip.version = (trip.version ?? 1) + 1;
    trip.hasEdited = true;
    await trip.save();

    res.status(200).json({ ...sanitizeTripFor(trip, role), role });
  }
);

/**
 * Records a thumbs up/down rating for a generated itinerary. Feedback both
 * drives future personalization (see context.ts) and powers A/B insights.
 * POST /api/itinerary/:id/feedback
 */
export const submitTripFeedback = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { rating, comment } = req.body;
    const { trip } = tripContext(req);

    trip.feedback = {
      rating,
      comment,
      submittedAt: new Date(),
    };
    await trip.save();

    res.status(200).json({ success: true, feedback: trip.feedback });
  }
);

/**
 * Aggregated generation/feedback analytics for the signed-in user.
 * GET /api/itinerary/insights
 *
 * F17 (E5): scope is **trips the user owns** — this is personal generation
 * analytics, not a team dashboard. Ownership here is membership-based
 * (`$elemMatch` keeps the userId/role pair on the same member row), so a trip
 * transferred to someone else contributes to the new owner's numbers, not the
 * previous owner's. Generation metadata is owner-facing (F17 projection) and
 * editors/viewers get neither this aggregate nor the raw fields.
 */
export const getTripInsights = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const trips = await Trip.find({
      members: { $elemMatch: { userId: new Types.ObjectId(String(req.userId)), role: 'owner' } },
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('title generationMeta feedback createdAt')
      .lean<Record<string, any>[]>();

    let up = 0;
    let down = 0;
    let qualitySum = 0;
    let qualityCount = 0;
    const variantStats: Record<string, { up: number; down: number; count: number }> = {};
    const destinations: Record<string, number> = {};

    for (const trip of trips || []) {
      const meta = trip.generationMeta || {};
      const variant = meta.variant || 'A';
      variantStats[variant] = variantStats[variant] || { up: 0, down: 0, count: 0 };
      variantStats[variant].count += 1;

      if (Number.isFinite(meta.qualityScore)) {
        qualitySum += Number(meta.qualityScore);
        qualityCount += 1;
      }

      const destination = meta.request?.destination || trip.title;
      if (destination) destinations[destination] = (destinations[destination] || 0) + 1;

      if (trip.feedback?.rating === 'up') {
        up += 1;
        variantStats[variant].up += 1;
      } else if (trip.feedback?.rating === 'down') {
        down += 1;
        variantStats[variant].down += 1;
      }
    }

    res.status(200).json({
      success: true,
      totalTrips: (trips || []).length,
      feedback: { up, down, total: up + down },
      avgQualityScore: qualityCount ? Math.round(qualitySum / qualityCount) : null,
      variantStats,
      topDestinations: Object.entries(destinations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
    });
  }
);

export const deleteTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    trip.isDeleted = true;
    await trip.save();

    res.status(200).json({ success: true, message: 'Trip deleted successfully' });
  }
);

export const duplicateTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    const clonedDetails = JSON.parse(JSON.stringify(trip.tripDetails));
    const originalTitle = trip.title || clonedDetails.trip_title || 'Trip';
    const clonedTitle = `${originalTitle} (Copy)`;
    clonedDetails.trip_title = clonedTitle;

    const newTrip = new Trip({
      userId: req.userId,
      title: clonedTitle,
      status: 'draft',
      isDeleted: false,
      tripDetails: clonedDetails,
      // Drawn routes are part of the plan, so they carry over to the copy
      customRoutes: ((trip.customRoutes || []) as any[]).map((route: any) => ({
        name: route.name,
        day: route.day,
        color: route.color,
        mode: route.mode,
        points: route.points,
        distanceKm: route.distanceKm,
      })),
    });

    await newTrip.save();

    res.status(201).json({ ...sanitizeTripFor(newTrip, 'owner'), role: 'owner' as const });;
  }
);

/**
 * Creates or refreshes the public share link (F7/F11/F20).
 *
 * - New links carry 128 bits of entropy (F11); every historical 48-bit id
 *   keeps resolving unchanged because lookup is by exact string.
 * - A duplicate-key race on `shareId` (F20 — 128 bits makes it theoretical,
 *   "rare but not impossible") is retried by minting a fresh id.
 */
export const shareTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    if (!trip.shareId) {
      const mintNewShareId = () => crypto.randomBytes(16).toString('hex'); // 128 bits
      let minted = mintNewShareId();
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          trip.shareId = minted;
          trip.isPublic = true;
          await trip.save();
          break;
        } catch (error: any) {
          // Mongo duplicate-key → the impossible-but-planned collision (F20).
          const isDupKey = error?.code === 11000 || /duplicate key/i.test(String(error?.message));
          if (!isDupKey || attempt === 5) throw error;
          minted = mintNewShareId();
        }
      }
    } else {
      trip.isPublic = true;
      await trip.save();
    }

    res.status(200).json({
      success: true,
      shareId: trip.shareId,
      message: 'Share link generated successfully',
    });
  }
);

/**
 * Revokes the public share link (F7, E5). Flips `isPublic` off **and** clears
 * `shareId`, so even someone who scrubbed the old URL from history gets the
 * 404 — the share link is dead permanently, not just paused. Re-sharing later
 * mints a completely different link, which is the safe default.
 * DELETE /api/itinerary/:id/share
 */
export const revokeShareTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);

    trip.isPublic = false;
    trip.shareId = undefined;
    await trip.save();

    res.status(200).json({
      success: true,
      message: 'Share link revoked',
      trip: { ...sanitizeTripFor(trip, role), role },
    });
  }
);

export const getSharedTrip = catchAsync(
  async (req: Request, res: Response) => {
    const { shareId } = req.params;

    const trip = await findPublicSharedTrip(String(shareId));

    if (!trip) {
      throw new AppError('Shared itinerary not found or has been revoked', 404);
    }

    // Exact allow-list (F14) — `projectPublicTrip` decrees the shape and the
    // contract test pins the key set. `customRoutes` was added in E5: drawn
    // routes are part of the plan and are not sensitive.
    res.status(200).json(projectPublicTrip(trip));
  }
);

/* -------------------------------------------------------------------------- */
/*  Weather-aware day alternative (Milestone 4.4)                              */
/* -------------------------------------------------------------------------- */

/** Formats a Date as `YYYY-MM-DD` (UTC). */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns a copy of `date` advanced by `offsetDays`. */
function addDays(date: Date, offsetDays: number): Date {
  return new Date(date.getTime() + offsetDays * 24 * 60 * 60 * 1000);
}

/** Collects every valid activity coordinate in an itinerary, in day order. */
function collectItineraryCoordinates(days: any[]): [number, number][] {
  const coordinates: [number, number][] = [];
  for (const day of days || []) {
    for (const activity of day?.activities || []) {
      if (activity && typeof activity === 'object' && isValidCoord(activity.coordinates)) {
        coordinates.push([
          Number((activity.coordinates as any)[0]),
          Number((activity.coordinates as any)[1]),
        ]);
      }
    }
  }
  return coordinates;
}

/**
 * Suggests a weather-aware replacement for a single day (Milestone 4.4).
 *
 * Only returns the proposal â€” the client applies it through the normal
 * granular edit endpoints, so version history and undo keep working.
 * POST /api/itinerary/:id/days/:day/indoor-alternative
 */
export const suggestDayAlternative = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const dayNumber = Number(req.params.day);
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      throw new AppError('Please provide a valid day number.', 400);
    }

    const { trip } = tripContext(req);

    const days = getItineraryDays(trip);
    const dayIndex = findDayIndex(days, dayNumber);
    if (dayIndex === -1) {
      throw new AppError(`Day ${dayNumber} was not found in this itinerary.`, 404);
    }
    const dayData = days[dayIndex];

    const activities = (dayData.activities || [])
      .map((activity: any) =>
        activity && typeof activity === 'object' ? activity.title || activity.name : activity
      )
      .map((title: any) => String(title || '').trim())
      .filter(Boolean);

    // Advisory context: prefer the trip's own coordinates + planned dates
    let weatherDay: any = null;
    const anchor = collectItineraryCoordinates(days)[0];
    if (anchor && trip.startDate) {
      const date = toIsoDate(addDays(new Date(trip.startDate), dayNumber - 1));
      const forecast = await getWeatherForecast(anchor[0], anchor[1], date, date);
      weatherDay = forecast.days[0] ?? null;
    }

    const prompt = buildDayAlternativePrompt({
      destination: trip.title || (trip.tripDetails as any)?.trip_title || 'the destination',
      dayNumber,
      dayTitle: dayData.title,
      activities,
      riskLevel: weatherDay?.riskLevel || 'none',
      advisories: weatherDay?.advisories || [],
      preferences: (trip.generationMeta as any)?.request?.preferences,
    });

    const result = await generateWithFallback(prompt);
    const parsed = parseItineraryJson(result.text);
    const suggested = Array.isArray(parsed?.activities) ? parsed.activities : [];

    res.status(200).json({
      success: true,
      day: dayNumber,
      activities: suggested,
      rationale: typeof parsed?.rationale === 'string' ? parsed.rationale : '',
      weather: weatherDay,
      provider: result.provider,
      cached: result.cached,
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Weather-aware routing (Milestone 4.6)                                      */
/* -------------------------------------------------------------------------- */

/** Collects a single day's located activity coordinates, in visit order. */
function dayActivityCoordinates(day: any): [number, number][] {
  const coordinates: [number, number][] = [];
  for (const activity of day?.activities || []) {
    if (activity && typeof activity === 'object' && isValidCoord(activity.coordinates)) {
      coordinates.push([
        Number((activity.coordinates as any)[0]),
        Number((activity.coordinates as any)[1]),
      ]);
    }
  }
  return coordinates;
}

/**
 * Cross-references the trip's per-day weather risk with the distances between
 * its activities, flagging exposed travel legs and proposing concrete fixes
 * (day swaps, indoor rebuilds, travel buffers).
 *
 * The response is advisory only â€” nothing is persisted; the client applies a
 * suggestion through the normal itinerary edit endpoints.
 * GET /api/itinerary/:id/weather-routing
 */
export const getWeatherRouting = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    const days = [...getItineraryDays(trip)].sort(
      (a, b) => (Number(a?.day) || 0) - (Number(b?.day) || 0)
    );

    // Always compute weather from the server so the client cannot fabricate it
    const start = trip.startDate ? toIsoDate(new Date(trip.startDate)) : null;
    const end = trip.endDate
      ? toIsoDate(new Date(trip.endDate))
      : start
        ? toIsoDate(addDays(new Date(start), Math.max(0, days.length - 1)))
        : null;
    const anchor = collectItineraryCoordinates(days)[0];

    let forecastDays: DailyWeather[] = [];
    let weatherProvider = 'unavailable';
    let weatherNote: string | undefined;

    if (anchor && start && end) {
      const forecast = await getWeatherForecast(anchor[0], anchor[1], start, end);
      forecastDays = forecast.days;
      weatherProvider = forecast.provider;
      weatherNote = forecast.note;
    }

    const dayInputs: RoutingDayInput[] = days.map((day, index) => ({
      day: Number(day?.day) || index + 1,
      riskLevel: forecastDays[index]?.riskLevel ?? 'none',
      advisories: forecastDays[index]?.advisories ?? [],
      points: dayActivityCoordinates(day),
      activityCount: (day?.activities || []).length,
      mode: 'drive',
    }));

    const analysis = analyzeWeatherRouting(dayInputs);

    res.status(200).json({
      success: true,
      startDate: start,
      endDate: end,
      weather: { provider: weatherProvider, days: forecastDays, note: weatherNote },
      analysis,
    });
  }
);
