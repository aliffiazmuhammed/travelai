import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Zod schemas for the trip-comment endpoints (Milestone 6 §19.3 / sprint F6a).
 *
 * `.trim()` before `.min(1)` is what rejects whitespace-only bodies — a body of
 * `"   "` fails validation with the friendly message instead of persisting an
 * invisible comment. `validate()` strips anything not declared here.
 */

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something before posting.')
    .max(env.COMMENT_MAX_LEN, `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`),
  /** Optional day anchor. The UI validates against real days; this is a bound. */
  day: z.coerce.number().int().min(1).max(999).optional(),
});

export const updateCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something before saving.')
    .max(env.COMMENT_MAX_LEN, `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`),
});
