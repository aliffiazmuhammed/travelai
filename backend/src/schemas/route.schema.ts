import { z } from 'zod';
import { MAX_POINTS_PER_ROUTE } from '../services/geo/customRoute.js';

const routePointSchema = z.tuple([
  z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90),
  z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180),
]);

export const routeTravelModeSchema = z.enum(['walk', 'bike', 'drive']);

export const createRouteSchema = z.object({
  name: z.string().min(1, 'Give the route a name').max(80),
  day: z.coerce.number().int().min(1).nullable().optional(),
  color: z.string().max(20).optional(),
  mode: routeTravelModeSchema.optional(),
  points: z
    .array(routePointSchema)
    .min(2, 'A route needs at least two points')
    .max(MAX_POINTS_PER_ROUTE, 'This route has too many points'),
});

export const updateRouteSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  day: z.coerce.number().int().min(1).nullable().optional(),
  color: z.string().max(20).optional(),
  mode: routeTravelModeSchema.optional(),
  points: z
    .array(routePointSchema)
    .min(2, 'A route needs at least two points')
    .max(MAX_POINTS_PER_ROUTE, 'This route has too many points')
    .optional(),
});
