import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Zod schemas for the poll endpoints (Milestone 7, F13a).
 *
 * The server cannot read a poll: `body` is the sealed `{ q, o[] }` payload and
 * `choice` is a sealed option index. What it CAN check is shape — a payload
 * without its iv is undecryptable by everyone including its author, so it is
 * refused at the door rather than stored as a card nobody can open.
 */

export const createPollSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Write a question before starting the poll.')
      .max(env.COMMENT_MAX_LEN * 2, 'That poll is too large to store.'),
    /** E2EE marker — cosmetic here (the service always stores a sealed body). */
    e2ee: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.body.includes('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'A poll must be sealed before it is sent.',
      });
    }
  });

export const votePollSchema = z.object({
  /** Sealed option index; the cap is a flood brake, the shape is the rule. */
  choice: z.string().trim().min(1, 'That vote could not be recorded.').max(400),
});
