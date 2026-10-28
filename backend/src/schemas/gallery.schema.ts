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

/**
 * Join-request walls (Milestone 8 G5). Shape only: eligibility, blocks, the
 * pending duplicate and the commenter-only approval all live in
 * `services/gallery/joinRequests.ts`.
 */
export const joinRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .max(280, 'Keep your message to 280 characters or fewer.')
    .optional(),
});

export const blockUserSchema = z.object({
  reason: z.string().trim().max(200, 'That note is too long.').optional(),
});

/**
 * Report walls (Milestone 8 G6). Shape only: whether the target exists and is
 * reportable, self-reports, duplicate reports and the auto-hide threshold live
 * in `services/gallery/reports.ts`.
 *
 * `targetId` is intentionally not an ObjectId pattern: a trip is addressed by
 * id, but a profile is addressed by its public handle (the only identifier the
 * public page receives). The service resolves either form.
 */
export const REPORT_NOTE_MAX = 500;
export const REPORT_TARGET_REF_MAX = 40;

export const createReportSchema = z
  .object({
    targetType: z.enum(['trip', 'profile']),
    targetId: z
      .string()
      .trim()
      .min(1, 'That content could not be found.')
      .max(
        REPORT_TARGET_REF_MAX,
        'That target is not valid.'
      ),
    reason: z.enum(['spam', 'harassment', 'scam', 'privacy', 'other']),
    note: z
      .string()
      .trim()
      .max(REPORT_NOTE_MAX, `Keep your note to ${REPORT_NOTE_MAX} characters or fewer.`)
      .optional(),
  })
  .strict();
