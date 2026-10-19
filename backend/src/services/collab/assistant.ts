import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { generateWithFallback, type AIProvider } from '../ai/index.js';
import {
  ASSISTANT_PROPOSAL_JSON_MAX,
  assistantProposalSchema,
  type AssistantProposal,
} from '../../schemas/assistant.schema.js';

/**
 * The @TravelAI participant (Milestone 7, F12a) — answer-only assistant.
 *
 * THE F10 SHAPE OF THIS SERVICE: end-to-end chat means the server cannot read
 * message bodies, so all chat grounding arrives CLIENT-FED (`context` = the
 * asker's decrypted recent messages). What the server adds for free is the
 * trip document itself (title, days, budget, day titles) — the itinerary the
 * group is planning IS visible to the server by design.
 *
 * Reply handling (user-confirmed): the answer comes back to the asker's
 * browser, which ENCRYPTS it with the trip conversation key and posts it as a
 * normal comment flagged `bot: true`. The server stores ciphertext; the
 * provider only ever saw the ask's plaintext once. Disclosure lives in the
 * composer ("sending N recent messages…").
 *
 * Split like every collab service: pure rules below are unit-tested; the DB +
 * AI glue is covered by the live `smoke-f12a.mts` run.
 */

/* -------------------------------------------------------------------------- */
/*  Caps                                                                       */
/* -------------------------------------------------------------------------- */

export const ASSISTANT_RULES = {
  /** Question text cap (chars) — mirrored in the zod layer. */
  PROMPT_MAX: 500,
  /** Context lines accepted per ask. */
  CONTEXT_ITEMS_MAX: 8,
  /** Per-line context text/label caps. */
  CONTEXT_TEXT_MAX: 500,
  CONTEXT_LABEL_MAX: 32,
  /** The answer is clamped before it turns into an encrypted comment. */
  REPLY_MAX: 800,
  /** Hard cap on the total plaintext an ask may ship to the provider. */
  WIRE_BUDGET: 6000,
} as const;

export interface AssistantContextItem {
  label: string;
  text: string;
}

export interface TripFacts {
  title: string;
  days?: number;
  budget?: string;
  season?: string;
  groupType?: string;
  /** "Day N: title" lines — server-owned itinerary titles, capped. */
  dayTitles: string[];
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in assistant.test.ts)                              */
/* -------------------------------------------------------------------------- */

export const MENTION_RE = /@travelai/i;

/**
 * F12c: the ask's TASK, inferred from the question the asker typed (it is
 * plaintext to the server by design — the provider call needs it). A summary
 * ask wants the group's conclusions, not a routing recommendation. The
 * composer mirrors this regex client-side so the grounding can include the
 * decrypted decision cards; the two lists stay roughly aligned on purpose.
 */
export const BOT_TASK_SUMMARY_RE =
  /(summari[sz]e|recap|catch (me|us) up|what (did|have) we (decide[ds]?|agree[ds]?|settle[ds]?)|bring (me|us) up to speed)/i;

export type AssistantTask = 'answer' | 'summary';

export function assistantTaskFrom(question: string): AssistantTask {
  return BOT_TASK_SUMMARY_RE.test(question) ? 'summary' : 'answer';
}

/** The client passes the mention through as typed; the AI prefers it gone. */
export function stripMention(prompt: string): string {
  return prompt.replace(MENTION_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Mention-gating is the PRIMARY cost brake (§8): anything the endpoint can do,
 * a member could do by asking in the group — so the ask must literally contain
 * the mention. Shape caps are re-asserted here defense-in-depth (the zod layer
 * already enforces them).
 */
export function assertAssistantInputs(
  prompt: unknown,
  contextItems: unknown,
  memberLabels?: Set<string>
): { prompt: string; context: AssistantContextItem[] } {
  const rawPrompt = String(prompt || '').trim();
  if (!rawPrompt) throw new AppError('Ask a question first.', 400);
  if (!MENTION_RE.test(rawPrompt)) {
    throw new AppError('Mention @TravelAI to call the assistant.', 400);
  }
  if (rawPrompt.length > ASSISTANT_RULES.PROMPT_MAX) {
    throw new AppError(`Questions are limited to ${ASSISTANT_RULES.PROMPT_MAX} characters.`, 400);
  }

  // Labels are display-only (email local-parts). Passing them through, so the
  // model can address "who said what"; raw emails never traverse.
  const rawList = Array.isArray(contextItems) ? contextItems : [];
  if (rawList.length > ASSISTANT_RULES.CONTEXT_ITEMS_MAX) {
    throw new AppError(`At most ${ASSISTANT_RULES.CONTEXT_ITEMS_MAX} context messages.`, 400);
  }

  // The wire budget measures the RAW payload BEFORE clamping — it is the
  // service-layer backstop for a caller that bypassed the zod layer.
  const rawTotal =
    rawPrompt.length +
    rawList.reduce(
      (sum, item) =>
        sum + String((item as any)?.label || '').length + String((item as any)?.text || '').length,
      0
    );
  if (rawTotal > ASSISTANT_RULES.WIRE_BUDGET) {
    throw new AppError("That's too much context at once — mention @TravelAI again with less.", 400);
  }

  // Labels are display-only (email local-parts). Passing them through, so the
  // model can address "who said what"; raw emails never traverse.
  const context: AssistantContextItem[] = [];
  for (const item of rawList) {
    const label = String((item as any)?.label || '').trim().slice(0, ASSISTANT_RULES.CONTEXT_LABEL_MAX);
    const text = String((item as any)?.text || '').trim().slice(0, ASSISTANT_RULES.CONTEXT_TEXT_MAX);
    if (!label || !text) continue; // drop junk lines rather than reject the ask
    if (memberLabels && !memberLabels.has(label)) continue; // spoofed labels drop
    context.push({ label, text });
  }

  return { prompt: stripMention(rawPrompt), context };
}

/** Server-owned itinerary facts — the grounding the server legitimately has. */
export function tripFactsFrom(trip: any): TripFacts {
  const details = trip?.tripDetails || {};
  const days = Number(details.duration_days) || undefined;
  const budget = Number(details.budget_per_person);
  const itinerary = Array.isArray(details.day_by_day_itinerary) ? details.day_by_day_itinerary : [];
  return {
    title: String(details.trip_title || trip?.title || '').slice(0, 120),
    days,
    budget: Number.isFinite(budget) && budget > 0 ? `${budget}` : undefined,
    season: details.season ? String(details.season).slice(0, 40) : undefined,
    groupType: details.group_type ? String(details.group_type).slice(0, 40) : undefined,
    dayTitles: itinerary
      .slice(0, 20)
      .map((d: any) => `Day ${d?.day ?? '?'}: ${String(d?.title || '').slice(0, 80)}`)
      .filter((line: string) => /: .+/.test(line)),
  };
}

/**
 * Assembles the provider prompt: a persona preamble + trip facts + the
 * client-fed chat context + the question last. NOTHING server-built mentions
 * chat contents — the context block is purely what the client shipped.
 */
export function buildAssistantPrompt(
  facts: TripFacts,
  question: string,
  context: AssistantContextItem[],
  opts: { task?: AssistantTask; dayAnchor?: number } = {}
): string {
  const task = opts.task ?? assistantTaskFrom(question);
  const taskLine =
    task === 'summary'
      ? 'Task: summarize the discussion for the group in 2-5 plain sentences. Lead with what the group DECIDED (choices or commitments on record), then what is still open, then a concrete next step. Do not propose a change unless one is clearly pending agreement.'
      : 'Task: answer the question. 1-4 short, plain sentences for a chat bubble, no list longer than 3 items, concrete about the trip below. Propose a change only when the ask clearly wants one or an obvious improvement is worth offering.';
  const sections: string[] = [
    'You are TravelAI, a trip-planning assistant participating in a group chat for one trip.',
    'ALWAYS answer with ONLY one JSON object: {"text": "...", "proposal": null} or {"text": "...", "proposal": {...}}. No markdown, no code fences, no words outside the JSON. Numbers stay numbers.',
    `"text" is your chat reply. ${taskLine}`,
    '"proposal" is either null, or ONE concrete itinerary change you suggest. It must be EXACTLY one of:',
    '- {"kind":"title","value":"<new trip title, max 120 chars>"}',
    '- {"kind":"budget","value":<positive number, budget per person in the trip currency>}',
    '- {"kind":"day_title","day":<an existing day number>,"value":"<new title for that day, max 120 chars>"}',
    '- {"kind":"day_tip","day":<an existing day number>,"value":"<one practical tip for that day, max 200 chars>"}',
    'Use "day" ONLY for day numbers listed in the planned days below. Otherwise null.',
  ];
  const factsBlock: string[] = [];
  if (facts.title) factsBlock.push(`Trip: ${facts.title}`);
  if (facts.days) factsBlock.push(`Duration: ${facts.days} days`);
  if (facts.budget) factsBlock.push(`Budget/person: ${facts.budget}`);
  if (facts.season) factsBlock.push(`Season: ${facts.season}`);
  if (facts.groupType) factsBlock.push(`Group: ${facts.groupType}`);
  if (facts.dayTitles.length) factsBlock.push(`Planned days: ${facts.dayTitles.join(' | ')}`);
  // F12c: the asker's day anchor — only added when the trip actually describes
  // that day, so it never invents structure.
  if (opts.dayAnchor) {
    const anchored = facts.dayTitles.find((line) => line.startsWith(`Day ${opts.dayAnchor}: `));
    if (anchored) factsBlock.push(`The asker is asking about ${anchored}.`);
  }
  if (factsBlock.length) sections.push(factsBlock.join('\n'));
  if (context.length) {
    sections.push(
      `Recent messages from the group (most recent last):\n${[...context]
        .reverse()
        .map((item) => `${item.label}: ${item.text}`)
        .join('\n')}`
    );
  }
  sections.push(`Question: ${question}`);
  return sections.join('\n\n');
}

/** The reply becomes an (encrypted) chat bubble — keep it bubble-sized. */
export function clampReply(raw: unknown): string {
  const text = String(raw || '').trim();
  const clean = text.replace(/^```[a-z]*\n?|```$/gm, '').trim();
  if (!clean) throw new AppError('The assistant returned nothing. Try again.', 502);
  return clean.slice(0, ASSISTANT_RULES.REPLY_MAX);
}

/* -------------------------------------------------------------------------- */
/*  F12b: the answer envelope (text + optional proposal)                       */
/* -------------------------------------------------------------------------- */

/** Wipes a single leading/trailing markdown fence pair around a JSON blob. */
function stripOuterFences(raw: string): string {
  return raw
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

/** Zod-guarded import of the model's proposal — anything malformed is null. */
export function validateAssistantProposal(raw: unknown): AssistantProposal | null {
  const result = assistantProposalSchema.safeParse(raw);
  if (!result.success) return null;
  // Serialized size backstop: reply + proposal must fit inside ONE encrypted
  // comment (the meaning cap is COMMENT_MAX_LEN = 2000; see decisions doc).
  if (JSON.stringify(result.data).length > ASSISTANT_PROPOSAL_JSON_MAX) return null;
  return result.data;
}

/** A day-anchored proposal must point at a day the trip actually has. */
export function proposalFitsTrip(proposal: AssistantProposal, facts: TripFacts): boolean {
  if (!('day' in proposal)) return true;
  if (!facts.days) return false; // no duration anchored → no day is safe
  return proposal.day >= 1 && proposal.day <= facts.days;
}

/**
 * Answers arrive as a strict JSON envelope (see buildAssistantPrompt) — but
 * models drift, so EVERY failure degrades to a plain text bubble, never a
 * 5xx: an unparseable reply is prose, a bad proposal is dropped, a missing
 * text with a valid proposal gets a template line.
 */
export function parseAssistantAnswer(raw: unknown): { text: string; proposal: AssistantProposal | null } {
  const source = String(raw || '').trim();
  const unwrapped = stripOuterFences(source);
  if (unwrapped.startsWith('{')) {
    try {
      const parsed = JSON.parse(unwrapped);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const proposal = validateAssistantProposal((parsed as any).proposal);
        let text = String((parsed as any).text || '').trim();
        if (!text && proposal) text = 'Here is a proposed change for the trip.';
        return { text: clampReply(text), proposal };
      }
    } catch {
      /* the wrapper was prose that merely looked like JSON — fall through */
    }
  }
  return { text: clampReply(source), proposal: null };
}

/* -------------------------------------------------------------------------- */
/*  Daily budget (per user × trip × calendar day)                              */
/* -------------------------------------------------------------------------- */

export type QuotaMap = Map<string, { dayKey: string; count: number }>;

/** UTC day key — a restart resets counts (honest, documented cost brake). */
export function dayKeyFor(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function quotaKey(tripId: string, userId: string): string {
  return `${tripId}:${userId}`;
}

/**
 * Consumes one ask from the (trip, user, day) bucket. Throws 429 once
 * `env.BOT_DAILY_LIMIT` is exhausted. Pure so the suite can rotate days.
 */
export function consumeDailyQuota(
  quotas: QuotaMap,
  tripId: string,
  userId: string,
  now: Date = new Date()
): void {
  const key = quotaKey(tripId, userId);
  const dayKey = dayKeyFor(now);
  const bucket = quotas.get(key);
  if (!bucket || bucket.dayKey !== dayKey) {
    quotas.set(key, { dayKey, count: 1 });
    return;
  }
  if (bucket.count >= env.BOT_DAILY_LIMIT) {
    throw new AppError(
      `You've reached today's ask limit for this trip (${env.BOT_DAILY_LIMIT}). Try again tomorrow.`,
      429
    );
  }
  bucket.count += 1;
}

/* -------------------------------------------------------------------------- */
/*  Data + AI glue (live-verified by smoke-f12a.mts)                           */
/* -------------------------------------------------------------------------- */

/**
 * Answers one @TravelAI ask. The reply text returns ONLY to the caller's
 * browser, where the F10 client encrypts it into the trip thread — the server
 * neither stores nor reads back any chat plaintext it does not have to.
 */
export async function answerTravelAI(
  trip: any,
  callerId: string,
  payload: { prompt: unknown; contextItems: unknown; dayAnchor?: number },
  memberLabels?: Set<string>,
  quotas: QuotaMap = dailyQuotas
): Promise<{ reply: string; provider: AIProvider; cached: boolean; proposal: AssistantProposal | null }> {
  const tripId = String((trip as any)._id);

  // Shape first (a rejected ask costs the provider nothing, so it also costs
  // no budget), THEN consume the daily ask.
  const { prompt: question, context } = assertAssistantInputs(payload.prompt, payload.contextItems, memberLabels);
  consumeDailyQuota(quotas, tripId, callerId);
  const facts = tripFactsFrom(trip);
  const composed = buildAssistantPrompt(facts, question, context, {
    task: assistantTaskFrom(question),
    dayAnchor: payload.dayAnchor,
  });

  const result = await generateWithFallback(composed); // Gemini → GROQ → cache
  const { text, proposal } = parseAssistantAnswer(result.text);
  // A proposal pointing past the itinerary is as good as malformed — drop it
  // rather than hand the client a card that cannot apply.
  const fits = proposal && proposalFitsTrip(proposal, facts) ? proposal : null;

  // Day anchoring of the answer bubble is the client's call (it posts the
  // reply row itself, encrypted); the server stays out of chat layout.
  return { reply: text, proposal: fits, provider: result.provider, cached: result.cached };
}

/** Process-wide budget buckets — restart resets them by design. */
const dailyQuotas: QuotaMap = new Map();
