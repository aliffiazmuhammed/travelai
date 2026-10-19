import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Zod schema for `POST /api/itinerary/:id/chat/assistant` (Milestone 7, F12a).
 *
 * The @TravelAI context is FED BY THE CLIENT: end-to-end chat (F10) means the
 * server cannot read message bodies, so the asker's browser decrypts the last
 * few messages locally and ships them here as `context`. This is the only
 * plaintext path an asker's words ever take — disclosed in the SPA composer.
 *
 * Caps protect the provider spend, not privacy: the *destinations* of this
 * payload are the AI provider anyway. Keep limits tight so a buggy loop
 * cannot bill an afternoon in one burst.
 */

/** One decrypted "recent message" line the client chose to include. */
export const assistantContextItemSchema = z.object({
  /** Display label the asker saw (email local-part) — no raw emails. */
  label: z.string().trim().min(1, 'A context label is required.').max(32),
  /** Decrypted message text (or an excerpt of it), ≤500 chars. */
  text: z.string().trim().min(1, 'A context line is required.').max(500),
});

export const assistantRequestSchema = z.object({
  /** The asker's question INCLUDING the @TravelAI mention (server re-checks). */
  prompt: z
    .string()
    .trim()
    .min(1, 'Say something before asking TravelAI.')
    .max(500, 'Questions are limited to 500 characters.'),
  /** The decrypted recent messages — most recent FIRST from the client. */
  context: z.array(assistantContextItemSchema).max(8, 'At most 8 context messages.').optional(),
});

/** Wire budget: the total plaintext the provider ever sees from one ask. */
export const ASSISTANT_WIRE_BUDGET = 6000;
