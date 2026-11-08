import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { generateWithFallback, type AIProvider } from '../ai/index.js';
import {
  ASSISTANT_PROPOSALS_MAX,
  ASSISTANT_PROPOSAL_JSON_MAX,
  assistantProposalSchema,
  type AssistantProposal,
} from '../../schemas/assistant.schema.js';

/**
 * The @waytowalk participant (Milestone 7, F12a) — answer-only assistant.
 *
 * THE F10 SHAPE OF THIS SERVICE: end-to-end chat means the server cannot read
 * message bodies, so all chat grounding arrives CLIENT-FED (`context` = the
 * asker's decrypted recent messages). What the server adds for free is the
 * trip document itself (title, days, budget, day titles, activity labels) —
 * the itinerary the group is planning IS visible to the server by design.
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
  /** F12d: itinerary shape shown to the model (bounded like every section). */
  DAY_PLANS_MAX: 20,
  ACTIVITIES_PER_DAY_MAX: 6,
  ACTIVITY_LABEL_MAX: 60,
  /** F12f: the stays the model may point an add/replace at. */
  STAYS_PER_DAY_MAX: 4,
  STAY_LABEL_MAX: 60,
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
  /**
   * F12d: the activity labels per day with stable 0-based positions. This is
   * what lets the model aim `move_activity` / `update_activity` — and what
   * `proposalFitsTrip` validates `expect` against before a card ever ships.
   * F12f adds the stay names, which is what `add_stay` / `stay_choices` point
   * at when they replace rather than add.
   */
  dayPlans: Array<{ day: number; activities: string[]; stays: string[] }>;
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in assistant.test.ts)                              */
/* -------------------------------------------------------------------------- */

export const MENTION_RE = /@(?:waytowalk|travelai)/i;

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
    throw new AppError('Mention @waytowalk to call the assistant.', 400);
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
    throw new AppError("That's too much context at once — mention @waytowalk again with less.", 400);
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
    // F12d: `title` is what the timeline renders first, then `name` (legacy).
    // Activities are handed to the model with their POSITION, and a day with
    // no activities still gets a plan line so "swap days" can be validated.
    dayPlans: itinerary
      .slice(0, ASSISTANT_RULES.DAY_PLANS_MAX)
      .map((d: any) => ({
        day: Number(d?.day),
        activities: (Array.isArray(d?.activities) ? d.activities : [])
          .slice(0, ASSISTANT_RULES.ACTIVITIES_PER_DAY_MAX)
          .map((a: any) =>
            String(typeof a === 'string' ? a : a?.title || a?.name || '')
              .trim()
              .slice(0, ASSISTANT_RULES.ACTIVITY_LABEL_MAX)
          )
          .filter(Boolean),
        stays: (Array.isArray(d?.stay_recommendations) ? d.stay_recommendations : [])
          .slice(0, ASSISTANT_RULES.STAYS_PER_DAY_MAX)
          .map((s: any) =>
            String(typeof s === 'string' ? s : s?.name || '')
              .trim()
              .slice(0, ASSISTANT_RULES.STAY_LABEL_MAX)
          )
          .filter(Boolean),
      }))
      .filter((plan: { day: number }) => Number.isInteger(plan.day) && plan.day >= 1),
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
    'You are waytowalk, a trip-planning assistant participating in a group chat for one trip.',
    'ALWAYS answer with ONLY one JSON object: {"text": "...", "proposal": null} or {"text": "...", "proposal": {...}}. No markdown, no code fences, no words outside the JSON.',
    `"text" is your chat reply. ${taskLine}`,
    '"proposal" is either null, or ONE concrete itinerary change you suggest. It must be EXACTLY one of:',
    '- {"kind":"title","value":"<new trip title, max 120 chars>"}',
    '- {"kind":"budget","value":<positive number, budget per person in the trip currency>}',
    '- {"kind":"day_title","day":<an existing day number>,"value":"<new title for that day, max 120 chars>"}',
    '- {"kind":"day_tip","day":<an existing day number>,"value":"<one practical tip for that day, max 200 chars>"}',
    '- {"kind":"swap_days","from_day":<an existing day>,"to_day":<another existing day>}',
    '- {"kind":"move_activity","day":<source day>,"index":<0-based position>,"to_day":<destination day>,"to_index":<final 0-based position>,"expect":"<source activity label>"}',
    '- {"kind":"update_activity","day":<day>,"index":<0-based position>,"value":"<new activity title, max 120 chars>","expect":"<old activity label>"}',
    '- {"kind":"add_activity","day":<day>,"index":<optional 0-based insert position; omit to add at the end>,"value":"<activity title, max 120 chars>"}',
    '- {"kind":"activity_choices","day":<day>,"index":<optional 0-based position to replace>,"expect":"<that activity label, required with index>","options":["<first idea>","<second idea>","<third idea>"]}',
    '- {"kind":"add_stay","day":<day>,"value":{"name":"<place name, max 80 chars>","location":"<optional area/city>","vibe":"<optional short vibe>"},"expect":"<optional existing stay name this replaces>"}',
    '- {"kind":"stay_choices","day":<day>,"options":[{"name":"<first stay>","location":"<area>","vibe":"<vibe>"},{"name":"<second stay>"}, ...],"expect":"<optional existing stay name this replaces>"}',
    'When the ask wants TWO OR THREE independent changes in one answer, return {"text":"...","proposals":[{...},{...}]} instead of "proposal" — never both, never more than three. Each item must be one of the shapes above, a picker (activity_choices/stay_choices) must be the ONLY item, and no two items may target the same day (count both days of a swap or move). Apply order is the array order.',
    'Use day numbers ONLY from the planned days below, and indices ONLY against the activities listed for that day. Otherwise null.',
    '"to_index" is the FINAL position after the move. Copy "expect" VERBATIM from the activity or stay list — the app refuses the change when the itinerary has moved on.',
    'Choosing the right change: when the asker names one extra activity to include, use add_activity. When they want ideas, alternatives, "something else", or what to do instead of an activity they dislike, use activity_choices with 2-3 DISTINCT concrete activities — never near-duplicate renames. If they point at a specific activity that should be replaced, set index and expect to it (the picked idea replaces it); otherwise omit both so the picked idea is added. Use update_activity ONLY when the asker has already stated the exact new title.',
    'Day-level asks: exchange two days\' plans with swap_days when they want Day A and Day B swapped; rename a day with day_title; add one practical note with day_tip. Those are separate kinds — never stretch update_activity into a day edit.',
    'Stays: when they ask where to stay or for hotel options on a day, use stay_choices with 2-3 DISTINCT named stays (name plus optional location/vibe) — never near-duplicate names. When they name one stay to include, use add_stay; set expect to an existing stay name only when the new stay replaces it on that day, otherwise omit it so it is added.',
    'When a proposal is included, keep "text" to 1-2 sentences: describe the suggestion in words and let the card carry the change. Do not list options or repeat every edit in "text".',
    'You never edit the trip yourself. Never say you will do something, that you have done it, or that something is arranged unless the facts above already show it. A proposal is the ONLY way a change can happen, and a human applies it — describe it as a suggestion the group can apply, never as something you are doing or will do. If the ask needs a change you cannot express with exactly these shapes, say plainly that you cannot do that yet — never promise to do it later.',
  ];
  const factsBlock: string[] = [];
  if (facts.title) factsBlock.push(`Trip: ${facts.title}`);
  if (facts.days) factsBlock.push(`Duration: ${facts.days} days`);
  if (facts.budget) factsBlock.push(`Budget/person: ${facts.budget}`);
  if (facts.season) factsBlock.push(`Season: ${facts.season}`);
  if (facts.groupType) factsBlock.push(`Group: ${facts.groupType}`);
  if (facts.dayTitles.length) factsBlock.push(`Planned days: ${facts.dayTitles.join(' | ')}`);
  // F12d: the activity lists the model may aim an edit at. Positions are the
  // 0-based indices the proposal schema expects; only days that have some.
  const activityLines = (facts.dayPlans || [])
    .filter((plan) => plan.activities.length > 0)
    .map(
      (plan) =>
        `Day ${plan.day} activities: ${plan.activities
          .map((label, index) => `[${index}] ${label}`)
          .join(' | ')}`
    );
  if (activityLines.length) factsBlock.push(activityLines.join('\n'));
  // F12f: the named stays an add_stay / stay_choices may replace.
  const stayLines = (facts.dayPlans || [])
    .filter((plan) => plan.stays.length > 0)
    .map((plan) => `Day ${plan.day} stays: ${plan.stays.map((label) => `“${label}”`).join(' | ')}`);
  if (stayLines.length) factsBlock.push(stayLines.join('\n'));
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
  let data = result.data;
  if (data.kind === 'activity_choices') {
    // Two near-identical "options" are not a choice; drop repeats and require
    // at least two distinct ideas before the card ships.
    const seen = new Set<string>();
    const options = data.options.filter((option) => {
      const key = option.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (options.length < 2) return null;
    data = { ...data, options };
  }
  if (data.kind === 'stay_choices') {
    const seen = new Set<string>();
    const options = data.options.filter((option) => {
      const key = option.name.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (options.length < 2) return null;
    data = { ...data, options };
  }
  // Serialized size backstop: reply + proposal must fit inside ONE encrypted
  // comment (the meaning cap is COMMENT_MAX_LEN = 2000; see decisions doc).
  if (JSON.stringify(data).length > ASSISTANT_PROPOSAL_JSON_MAX) return null;
  return data;
}

const isChoiceKind = (proposal: AssistantProposal): boolean =>
  proposal.kind === 'activity_choices' || proposal.kind === 'stay_choices';

/** Every day a proposal reads or writes — the multi-edit disjointness unit. */
function touchedDays(proposal: AssistantProposal): number[] {
  if (proposal.kind === 'swap_days') return [proposal.from_day, proposal.to_day];
  if (proposal.kind === 'move_activity') return [proposal.day, proposal.to_day];
  return 'day' in proposal ? [proposal.day] : [];
}

/**
 * F12f: validates the whole edit set (the legacy single is just a set of one).
 *
 * Two rules keep sequential application honest, because every index and
 * `expect` in the set was written against the itinerary BEFORE any edit ran:
 * a picker is always alone (it is a question, not a settled edit), and no two
 * edits may touch the same day (a swap/move touches both of its days).
 */
export function validateAssistantProposals(raw: unknown): AssistantProposal[] {
  if (!Array.isArray(raw) || raw.length > ASSISTANT_PROPOSALS_MAX) return [];
  const valid: AssistantProposal[] = [];
  for (const item of raw) {
    const proposal = validateAssistantProposal(item);
    if (proposal) valid.push(proposal);
  }
  if (valid.length === 0) return [];
  if (valid.some(isChoiceKind)) {
    const pickers = valid.filter(isChoiceKind);
    return pickers.length === 1 ? [pickers[0]] : [];
  }
  const seen = new Set<number>();
  for (const proposal of valid) {
    for (const day of touchedDays(proposal)) {
      if (seen.has(day)) return [];
      seen.add(day);
    }
  }
  if (JSON.stringify(valid).length > ASSISTANT_PROPOSAL_JSON_MAX) return [];
  return valid;
}

/**
 * Drift guard shared by the server (ask-time facts) and the client's copy
 * (`frontend/src/lib/proposalApply.ts`): true when `expected` is a
 * case/space-insensitive prefix of `actual`. Empty expectations never match.
 */
export function labelMatches(actual: unknown, expected: unknown): boolean {
  const normalize = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
  const want = normalize(expected);
  const have = normalize(actual);
  return Boolean(want) && (have === want || have.startsWith(want));
}

/** The server-owned plan line for one day (activity labels + positions). */
function planFor(facts: TripFacts, day: number) {
  return (facts.dayPlans || []).find((plan) => plan.day === Number(day));
}

/**
 * Every proposal must point at shape the server actually has: a real day, a
 * real activity position, and — for structural edits — the label the model
 * promised to touch. Anything else is dropped rather than handed to the
 * browser as a card that could edit the wrong row.
 */
export function proposalFitsTrip(proposal: AssistantProposal, facts: TripFacts): boolean {
  if (proposal.kind === 'swap_days') {
    if (proposal.from_day === proposal.to_day) return false;
    return Boolean(planFor(facts, proposal.from_day) && planFor(facts, proposal.to_day));
  }
  if (proposal.kind === 'move_activity' || proposal.kind === 'update_activity') {
    const source = planFor(facts, proposal.day);
    if (!source || proposal.index >= source.activities.length) return false;
    if (!labelMatches(source.activities[proposal.index], proposal.expect)) return false;
    if (proposal.kind === 'update_activity') return true;
    const target = planFor(facts, proposal.to_day);
    if (!target || proposal.to_index > target.activities.length) return false;
    return !(proposal.day === proposal.to_day && proposal.index === proposal.to_index);
  }
  if (proposal.kind === 'add_activity') {
    const day = planFor(facts, proposal.day);
    if (!day) return false;
    // Appending needs no position; an explicit insert may not skip past the end.
    return proposal.index === undefined || proposal.index <= day.activities.length;
  }
  if (proposal.kind === 'activity_choices') {
    const day = planFor(facts, proposal.day);
    if (!day) return false;
    // An add-style picker (no index/expect) is always safe; a replace-style one
    // must still find the label it promised to swap out.
    if (proposal.index === undefined && proposal.expect === undefined) return true;
    if (proposal.index === undefined || proposal.expect === undefined) return false;
    if (proposal.index >= day.activities.length) return false;
    return labelMatches(day.activities[proposal.index], proposal.expect);
  }
  if (proposal.kind === 'stay_choices') {
    const day = planFor(facts, proposal.day);
    if (!day) return false;
    // Add-style (no expect) is always safe; a replace-style picker must still
    // find the stay it promised to swap out.
    if (proposal.expect === undefined) return true;
    return day.stays.some((label) => labelMatches(label, proposal.expect));
  }
  if (proposal.kind === 'add_stay') {
    const day = planFor(facts, proposal.day);
    if (!day) return false;
    if (proposal.expect === undefined) return true;
    return day.stays.some((label) => labelMatches(label, proposal.expect));
  }
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
export function parseAssistantAnswer(raw: unknown): {
  text: string;
  proposal: AssistantProposal | null;
  proposals: AssistantProposal[];
} {
  const source = String(raw || '').trim();
  const unwrapped = stripOuterFences(source);
  if (unwrapped.startsWith('{')) {
    try {
      const parsed = JSON.parse(unwrapped);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rawList = (parsed as any).proposals;
        let proposals =
          Array.isArray(rawList) && rawList.length > 0 ? validateAssistantProposals(rawList) : [];
        if (proposals.length === 0) {
          const single = validateAssistantProposal((parsed as any).proposal);
          proposals = single ? [single] : [];
        }
        let text = String((parsed as any).text || '').trim();
        if (!text && proposals.length > 0) {
          text =
            proposals.length === 1
              ? 'Here is a proposed change for the trip.'
              : 'Here are the proposed changes for the trip.';
        }
        return {
          text: clampReply(text),
          proposal: proposals.length === 1 ? proposals[0] : null,
          proposals,
        };
      }
    } catch {
      /* the wrapper was prose that merely looked like JSON — fall through */
    }
  }
  return { text: clampReply(source), proposal: null, proposals: [] };
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
 * Answers one @waytowalk ask. The reply text returns ONLY to the caller's
 * browser, where the F10 client encrypts it into the trip thread — the server
 * neither stores nor reads back any chat plaintext it does not have to.
 */
export async function answerTravelAI(
  trip: any,
  callerId: string,
  payload: { prompt: unknown; contextItems: unknown; dayAnchor?: number },
  memberLabels?: Set<string>,
  quotas: QuotaMap = dailyQuotas
): Promise<{
  reply: string;
  provider: AIProvider;
  cached: boolean;
  proposal: AssistantProposal | null;
  proposals: AssistantProposal[];
}> {
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
  const { text, proposals } = parseAssistantAnswer(result.text);
  // A proposal pointing past the itinerary is as good as malformed — drop it
  // rather than hand the client a card that cannot apply. For a multi-edit set
  // a dropped item would silently change the ask, so an incomplete set is
  // downgraded to the reply alone.
  const fit = proposals.filter((proposal) => proposalFitsTrip(proposal, facts));
  const fits = fit.length === proposals.length ? fit : [];

  // Day anchoring of the answer bubble is the client's call (it posts the
  // reply row itself, encrypted); the server stays out of chat layout.
  return {
    reply: text,
    proposal: fits.length === 1 ? fits[0] : null,
    proposals: fits,
    provider: result.provider,
    cached: result.cached,
  };
}

/** Process-wide budget buckets — restart resets them by design. */
const dailyQuotas: QuotaMap = new Map();
