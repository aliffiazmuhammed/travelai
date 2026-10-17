import { z } from 'zod';
import {
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  NEARBY_CATEGORIES,
} from '../services/geo/nearby.js';

export const travelModeSchema = z.enum(['walk', 'bike', 'drive']);

/** Validates a list of `[lat, lng]` points plus an optional travel mode. */
export const computeRouteSchema = z.object({
  points: z
    .array(
      z.tuple([
        z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90),
        z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180),
      ])
    )
    .min(2, 'At least two points are required to compute a route')
    .max(50, 'Too many points to compute a route'),
  mode: travelModeSchema.optional(),
});

const latSchema = z.coerce
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

const lngSchema = z.coerce
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use the YYYY-MM-DD format');

/** Query params for the per-day weather forecast. */
export const weatherQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  start: isoDateSchema,
  end: isoDateSchema,
});

/** Query params for nearby search. */
export const nearbyQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  category: z.enum(NEARBY_CATEGORIES),
  radius: z.coerce
    .number()
    .min(MIN_RADIUS_M, `Radius must be at least ${MIN_RADIUS_M} m`)
    .max(MAX_RADIUS_M, `Radius cannot exceed ${MAX_RADIUS_M} m`)
    .optional(),
});
