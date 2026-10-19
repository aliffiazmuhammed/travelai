import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Zod schemas for the trip-comment endpoints (Milestone 6 §19.3 / sprint F6a,
 * extended for F10 end-to-end encryption).
 *
 * `.trim()` before `.min(1)` is what rejects whitespace-only bodies — a body of
 * `"   "` fails validation with the friendly message instead of persisting an
 * invisible comment. `validate()` strips anything not declared here.
 *
 * F10: when `e2ee` is true the body is base64 ciphertext (AES-GCM → base64 →
 * `iv.ct`), so the cap doubles to absorb the encoding overhead — the *meaning*
 * cap is still `COMMENT_MAX_LEN` characters of plaintext. Plaintext rows keep
 * the original cap exactly.
 */

export const createCommentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Write something before posting.')
      .max(env.COMMENT_MAX_LEN * 2, `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`),
    /** Optional day anchor. The UI validates against real days; this is a bound. */
    day: z.coerce.number().int().min(1).max(999).optional(),
    /** F10: body is end-to-end ciphertext; `iv.iv` prefix carries the nonce. */
    e2ee: z.boolean().optional(),
    /**
     * F12a: persona flag for @TravelAI answers, posted by the asker's client.
     * Cosmetic only (no rank/moderation meaning); spoofable-but-harmless by
     * design — see the TripComment model docs.
     */
    bot: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.e2ee && value.body.length > env.COMMENT_MAX_LEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`,
      });
    }
    if (value.e2ee && !value.body.includes('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'An encrypted message must carry its iv.',
      });
    }
  });

export const updateCommentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Write something before saving.')
      .max(env.COMMENT_MAX_LEN * 2, `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`),
    e2ee: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.e2ee && value.body.length > env.COMMENT_MAX_LEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `Comments are limited to ${env.COMMENT_MAX_LEN} characters.`,
      });
    }
    if (value.e2ee && !value.body.includes('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'An encrypted message must carry its iv.',
      });
    }
  });

