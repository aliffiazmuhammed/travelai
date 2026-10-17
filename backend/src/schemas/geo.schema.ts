import { z } from 'zod';

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
