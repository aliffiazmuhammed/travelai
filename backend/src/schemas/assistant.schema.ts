import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Zod schema for `POST /api/itinerary/:id/chat/assistant` (Milestone 7, F12a).
 *
 * The @waytowalk context is FED BY THE CLIENT: end-to-end chat (F10) means the
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
  /** The asker's question INCLUDING the @waytowalk mention (server re-checks). */
  prompt: z
    .string()
    .trim()
    .min(1, 'Say something before asking waytowalk.')
    .max(500, 'Questions are limited to 500 characters.'),
  /** The decrypted recent messages — most recent FIRST from the client. */
  context: z.array(assistantContextItemSchema).max(8, 'At most 8 context messages.').optional(),
  /** F12c: the asker's day anchor (1..999) — narrows the assistant's view. */
  day: z.coerce.number().int().min(1).max(999).optional(),
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
 * like any other edit).
 *
 * F12b shipped whole-field replacements (title / budget / day title / tip).
 * F12d adds the first structural edits — exchange two days' plans, move one
 * activity, rename one activity — each aimed by a day number and a 0-based
 * position in the server-owned activity list. The risky ones carry `expect`:
 * the label exactly as the model saw it. The service rejects a mismatch
 * against its own snapshot and the CLIENT re-checks against the live itinerary
 * before applying, so a card that outlived a reshuffle can never edit the
 * wrong row. F12e adds `add_activity` and `activity_choices` (a 2-3 option
 * picker), because "suggest something else for Day 1" was previously
 * unexpressible and degraded to a rename. F12f adds `add_stay` /
 * `stay_choices` (where to sleep on a day) and lets one answer carry up to
 * three edits (`proposals`), validated as a set: a picker rides alone and no
 * two edits may touch the same day, so applying them in order is safe.
 * Structural day insertion/removal stays future work.
 */
export const stayProposalSchema = z.object({
  /** Place name — what the timeline and stays panel display. */
  name: z.string().trim().min(1).max(80),
  /** Neighbourhood/city hint (the stays panel shows it under the name). */
  location: z.string().trim().min(1).max(80).optional(),
  vibe: z.string().trim().min(1).max(60).optional(),
});

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
  z.object({
    kind: z.literal('swap_days'),
    /** The two existing day numbers whose plans exchange places. */
    from_day: z.coerce.number().int().min(1).max(999),
    to_day: z.coerce.number().int().min(1).max(999),
  }),
  z.object({
    kind: z.literal('move_activity'),
    /** Source day and 0-based position in that day's activity list. */
    day: z.coerce.number().int().min(1).max(999),
    index: z.coerce.number().int().min(0).max(199),
    /** Destination day and the FINAL 0-based position there. */
    to_day: z.coerce.number().int().min(1).max(999),
    to_index: z.coerce.number().int().min(0).max(199),
    /** Drift guard: the activity label exactly as the facts listed it. */
    expect: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal('update_activity'),
    day: z.coerce.number().int().min(1).max(999),
    index: z.coerce.number().int().min(0).max(199),
    /** New activity title (the app displays `title` before `name`). */
    value: z.string().trim().min(1).max(120),
    /** Drift guard: the old label exactly as the facts listed it. */
    expect: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal('add_activity'),
    day: z.coerce.number().int().min(1).max(999),
    /** 0-based insert position; omitted = append at the end of the day. */
    index: z.coerce.number().int().min(0).max(199).optional(),
    /** The activity title to insert. */
    value: z.string().trim().min(1).max(120),
  }),
  /**
   * F12e: "suggest something else for Day N" — 2-3 distinct concrete activities
   * the group picks from. With `index` + `expect` the picked option REPLACES
   * that activity (drift-guarded like `update_activity`); without them it is
   * added to the day. The card renders one picker, never an applied edit.
   */
  z.object({
    kind: z.literal('activity_choices'),
    day: z.coerce.number().int().min(1).max(999),
    index: z.coerce.number().int().min(0).max(199).optional(),
    expect: z.string().trim().min(1).max(120).optional(),
    /** 2-3 distinct activity titles; duplicates are dropped by validation. */
    options: z.array(z.string().trim().min(1).max(100)).min(2).max(3),
  }),
  /**
   * F12f: where to sleep on Day N. `expect` names the stay this suggestion
   * replaces on that day (drift-guarded); without it the stay is added.
   */
  z.object({
    kind: z.literal('add_stay'),
    day: z.coerce.number().int().min(1).max(999),
    value: stayProposalSchema,
    expect: z.string().trim().min(1).max(80).optional(),
  }),
  /**
   * F12f: "where should we stay on Day N?" — 2-3 distinct named stays the
   * group picks from. With `expect`, the pick replaces that stay; otherwise
   * it is added to the day. Never combined with other edits.
   */
  z.object({
    kind: z.literal('stay_choices'),
    day: z.coerce.number().int().min(1).max(999),
    expect: z.string().trim().min(1).max(80).optional(),
    options: z.array(stayProposalSchema).min(2).max(3),
  }),
]);

export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

/** Serialized-proposal backstop: reply (≤800) + proposals must fit one comment. */
export const ASSISTANT_PROPOSAL_JSON_MAX = 1400;

/** F12f: one answer may carry this many independent edits. */
export const ASSISTANT_PROPOSALS_MAX = 3;

