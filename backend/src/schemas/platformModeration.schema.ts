import { z } from 'zod';

/**
 * Platform moderation query walls (Milestone 8 G6).
 *
 * Shape only. The service decides which targets are reportable and how an
 * action changes visibility.
 */

export const MODERATION_STATUS_FILTERS = ['open', 'hidden', 'dismissed'] as const;

export const moderationQuerySchema = z
  .object({
    status: z.enum(MODERATION_STATUS_FILTERS).optional().default('open'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export type ModerationQueryInput = z.infer<typeof moderationQuerySchema>;
