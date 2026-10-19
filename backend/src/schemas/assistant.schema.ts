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

/* -------------------------------------------------------------------------- */
/*  F12b proposals — ONE typed itinerary change the assistant may suggest      */
/* -------------------------------------------------------------------------- */

/**
 * A proposal is the model's SUGGESTION, never an applied edit: it rides back
 * to the asker's browser, gets encrypted into the thread as part of the bot
 * bubble, and a human contributor taps Apply — which goes through the normal
 * `PUT /:id` update endpoint (editor floor, required `baseRev`, snapshotted
 * like any other edit). Kinds are deliberately bounded to fields the client
 * can patch non-destructively; structural reshuffles (move/add/remove days,
 * destination swaps) stay future work.
 */
export const assistantProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('title'),
    /** New `tripDetails.trip_title`. */
    value: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal('budget'),
    /** New `tripDetails.budget_per_person`. */
    value: z.coerce.number().positive().max(99999999),
  }),
  z.object({
    kind: z.literal('day_title'),
    /** Existing day number (checked against the trip's duration before use). */
    day: z.coerce.number().int().min(1).max(999),
    value: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal('day_tip'),
    day: z.coerce.number().int().min(1).max(999),
    /** Adds one entry to that day's `pro_tip` list. */
    value: z.string().trim().min(1).max(200),
  }),
]);

export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

/** Serialized-proposal backstop: reply (≤800) + proposal must fit one comment. */
export const ASSISTANT_PROPOSAL_JSON_MAX = 800;

