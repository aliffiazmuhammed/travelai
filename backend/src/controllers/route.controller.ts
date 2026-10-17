import { Response } from 'express';
import Trip from '../models/Trip.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sanitizeTrip } from '../utils/sanitizeTrip.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  MAX_ROUTES_PER_TRIP,
  normalizeRoutePoints,
  routeDistanceKm,
} from '../services/geo/customRoute.js';

/** Loads a trip owned by the current user (or throws a 404). */
async function findOwnedTrip(id: unknown, userId?: string) {
  const trip = await Trip.findOne({
    _id: String(id),
    userId,
    isDeleted: { $ne: true },
  });
  if (!trip) {
    throw new AppError('Trip not found', 404);
  }
  return trip;
}

/**
 * Adds a user-drawn route to a trip. Distances are always recomputed
 * server-side so clients cannot inject bogus lengths.
 * POST /api/itinerary/:id/routes
 */
export const addTripRoute = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const trip = await findOwnedTrip(req.params.id, req.userId);

  if ((trip.customRoutes?.length || 0) >= MAX_ROUTES_PER_TRIP) {
    throw new AppError(`You can save up to ${MAX_ROUTES_PER_TRIP} custom routes per trip.`, 400);
  }

  const body = req.body || {};
  const points = normalizeRoutePoints(body.points);
  if (points.length < 2) {
    throw new AppError('A route needs at least two valid points.', 400);
  }

  const route = {
    name: String(body.name).trim(),
    day: body.day != null ? Number(body.day) : undefined,
    color: body.color ? String(body.color) : '#0ea5e9',
    mode: body.mode || 'drive',
    points,
    distanceKm: routeDistanceKm(points),
    createdAt: new Date(),
  };

  (trip.customRoutes as any).push(route);
  await trip.save();

  res.status(201).json(sanitizeTrip(trip));
});

/**
 * Updates a saved route (name, day, colour, mode and/or points).
 * PUT /api/itinerary/:id/routes/:routeId
 */
export const updateTripRoute = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const trip = await findOwnedTrip(req.params.id, req.userId);
    const route: any = (trip.customRoutes as any).id(req.params.routeId);

    if (!route) {
      throw new AppError('Route not found', 404);
    }

    const body = req.body || {};

    if (body.name !== undefined) route.name = String(body.name).trim();
    if (body.day !== undefined) route.day = body.day == null ? undefined : Number(body.day);
    if (body.color !== undefined) route.color = String(body.color);
    if (body.mode !== undefined) route.mode = body.mode;

    if (body.points !== undefined) {
      const points = normalizeRoutePoints(body.points);
      if (points.length < 2) {
        throw new AppError('A route needs at least two valid points.', 400);
      }
      route.points = points;
      route.distanceKm = routeDistanceKm(points);
    }

    await trip.save();
    res.status(200).json(sanitizeTrip(trip));
  }
);

/**
 * Deletes a saved route.
 * DELETE /api/itinerary/:id/routes/:routeId
 */
export const deleteTripRoute = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const trip = await findOwnedTrip(req.params.id, req.userId);
    const route: any = (trip.customRoutes as any).id(req.params.routeId);

    if (!route) {
      throw new AppError('Route not found', 404);
    }

    route.deleteOne();
    await trip.save();
    res.status(200).json(sanitizeTrip(trip));
  }
);
