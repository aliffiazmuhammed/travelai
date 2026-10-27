import { z } from 'zod';

/**
 * Gallery publishing walls (Milestone 8 G1). Shape only — whether the caller
 * owns the trip, whether it is an agency row, and whether the publisher has a
 * handle are decided in `services/gallery/publish.ts`.
 */

export const GALLERY_SUMMARY_MAX_LEN = 280;
export const GALLERY_MAX_TAGS = 6;
export const GALLERY_TAG_MAX_LEN = 24;

export const tripPublishSchema = z.object({
  published: z.boolean(),
  hideExactDates: z.boolean().optional(),
  summary: z.string().max(2000, 'That summary is too long.').optional(),
  tags: z.array(z.string().max(200)).max(24).optional(),
});

/**
 * Anonymous gallery filters (Milestone 8 G3). Shape only; the service builds
 * the query and decides which rows are eligible. `limit` is coerced because
 * query strings are always text.
 */
export const exploreQuerySchema = z.object({
  q: z.string().trim().max(80, 'Search terms can be 80 characters or fewer.').optional(),
  duration: z.enum(['short', 'week', 'fortnight', 'long']).optional(),
  groupType: z
    .string()
    .trim()
    .max(40, 'Group type can be 40 characters or fewer.')
    .optional(),
  tags: z.union([z.string().max(200), z.array(z.string().max(200))]).optional(),
  cursor: z.string().max(400, 'That page cursor is too long.').optional(),
  limit: z.coerce
    .number()
    .int('Choose a whole number of results.')
    .min(1, 'Ask for at least one result.')
    .max(24, 'Ask for 24 results or fewer.')
    .optional(),
});

export type ExploreQueryInput = z.infer<typeof exploreQuerySchema>;
