import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_RULES,
  MENTION_RE,
  assertAssistantInputs,
  buildAssistantPrompt,
  clampReply,
  consumeDailyQuota,
  dayKeyFor,
  assistantTaskFrom,
  labelMatches,
  parseAssistantAnswer,
  proposalFitsTrip,
  quotaKey,
  stripMention,
  tripFactsFrom,
  validateAssistantProposal,
  validateAssistantProposals,
  type QuotaMap,
} from './assistant.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

/**
 * Pure-rule tests for the @waytowalk assistant (F12a). The provider spend is
 * the thing protected: mention gating (the primary brake), tight context
 * caps, the wire budget, the bubble-sized reply clamp, and the per user ×
 * trip × day quota. The AI + DB paths ride the live `smoke-f12a.mts` run.
 */

const statusOf = (error: unknown): number =>
  error instanceof AppError ? error.statusCode : -1;

/* ------------------------------- the mention gate ------------------------- */

test('assertAssistantInputs: any casing of @waytowalk gates the ask', () => {
  for (const prompt of ['@waytowalk eat where?', '@travelai eat where?', 'so... @waytowalk should we rent scooters?']) {
    const { prompt: cleaned } = assertAssistantInputs(prompt, []);
    assert.ok(!MENTION_RE.test(cleaned), 'mention is stripped from the composed question');
    assert.ok(cleaned.length > 0);
  }
});

test('assertAssistantInputs: a missing mention is a 400 (primary cost brake)', () => {
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('eat where?', []))), 400);
});

test('assertAssistantInputs: empty and over-cap prompts are 400s', () => {
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('', []))), 400);
  assert.equal(
    statusOf(rewrite(() => assertAssistantInputs(`@waytowalk ${'x'.repeat(500)}`, []))),
    400
  );
  assert.doesNotThrow(() =>
    assertAssistantInputs(`@waytowalk ${'x'.repeat(489)}`, [])
  );
});

/* ------------------------------- context caps ----------------------------- */

test('assertAssistantInputs: over the 8-line context cap is a 400', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ label: `m${i}`, text: 'hi' }));
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('@waytowalk q', nine))), 400);
});

test('assertAssistantInputs: junk context lines are dropped, not rejected', () => {
  const { context } = assertAssistantInputs('@waytowalk q', [
    { label: '', text: 'no label — dropped' },
    { label: 'alice', text: '' }, // dropped
    { label: 'alice', text: 'I love seafood' },
    'not an object', // dropped
  ]);
  assert.equal(context.length, 1);
  assert.deepEqual(context[0], { label: 'alice', text: 'I love seafood' });
});

test('assertAssistantInputs: labels and texts clamp to their caps', () => {
  const { context } = assertAssistantInputs('@waytowalk q', [
    { label: 'L'.repeat(64), text: 'T'.repeat(900) },
  ]);
  assert.equal(context[0].label.length, ASSISTANT_RULES.CONTEXT_LABEL_MAX);
  assert.equal(context[0].text.length, ASSISTANT_RULES.CONTEXT_TEXT_MAX);
});

test('assertAssistantInputs: the wire budget rejects runaway payloads (bypassing zod)', () => {
  // Measured on the RAW payload before clamping — the backstop for a caller
  // that reached the service without the zod layer's 500-char line caps.
  const hostile = Array.from({ length: 8 }, () => ({
    label: 'L'.repeat(32),
    text: 'T'.repeat(900),
  }));
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('@waytowalk q', hostile))), 400);
  // The zod-legal maximum (8 × 532 + prompt ≤ 500) must always fit.
  const legal = Array.from({ length: 8 }, () => ({ label: 'l'.repeat(32), text: 't'.repeat(500) }));
  assert.doesNotThrow(() => assertAssistantInputs(`@waytowalk ${'q'.repeat(420)}`, legal));
});

test('assertAssistantInputs: spoofed labels fall out when member labels provided', () => {
  const { context } = assertAssistantInputs(
    '@waytowalk q',
    [
      { label: 'alice', text: 'real member line' },
      { label: 'stranger', text: 'not a member' },
    ],
    new Set(['alice'])
  );
  assert.equal(context.length, 1);
  assert.equal(context[0].label, 'alice');
});

/* --------------------------------- the prompt -------------------------------- */

test('buildAssistantPrompt: trip facts, client context and question, nothing else', () => {
  const facts = tripFactsFrom({
    tripDetails: {
      trip_title: 'F12 Smoke',
      duration_days: 2,
      budget_per_person: 9000,
      season: 'summer',
      group_type: 'friends',
      day_by_day_itinerary: [
        { day: 1, title: 'Arrive & grub' },
        { day: 2, title: 'Scooters day' },
      ],
    },
    title: 'F12 Smoke',
  });
  const composed = buildAssistantPrompt(facts, 'eat where?', [
    { label: 'bob', text: 'I love seafood' },
  ]);
  assert.ok(composed.includes('Trip: F12 Smoke'));
  assert.ok(composed.includes('2 days'));
  assert.ok(composed.includes('9000'));
  assert.ok(composed.includes('Day 1: Arrive & grub'));
  assert.ok(composed.includes('bob: I love seafood'));
  assert.ok(composed.trim().endsWith('Question: eat where?'));
  // The server section NEVER fabricates chat content that no one sent.
  const factsOnly = buildAssistantPrompt(facts, 'solo', []);
  assert.ok(!/Recent messages/.test(factsOnly));
});

/* --------------------------------- the reply -------------------------------- */

test('clampReply: shrinks to the bubble cap and unwraps code fences', () => {
  const long = clampReply('a'.repeat(2000));
  assert.equal(long.length, ASSISTANT_RULES.REPLY_MAX);
  assert.equal(clampReply('```text\nKYRA says hi\n```'), 'KYRA says hi');
});

test('clampReply: an empty provider answer is a 502, not a crash', () => {
  assert.equal(statusOf(rewrite(() => clampReply('   '))), 502);
  assert.equal(statusOf(rewrite(() => clampReply('```'))), 502);
});

/* --------------------------------- trip facts ------------------------------- */

test('tripFactsFrom: reads the nested details shape and tolerates drafts', () => {
  const facts = tripFactsFrom({
    tripDetails: { trip_title: 'T', duration_days: '3', day_by_day_itinerary: [{ day: 1 }, {}] },
  });
  assert.equal(facts.title, 'T');
  assert.equal(facts.days, 3);
  assert.equal(facts.dayTitles.length, 0); // title-less days produce no lines
  assert.equal(tripFactsFrom(null).title, '');
});

/* ------------------------------- daily budget ------------------------------- */

test("consumeDailyQuota: the day's asks count up to env.BOT_DAILY_LIMIT then 429", () => {
  const quotas: QuotaMap = new Map();
  const now = new Date('2026-10-19T10:00:00Z');
  for (let i = 0; i < env.BOT_DAILY_LIMIT; i += 1) {
    assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripX', 'userA', now));
  }
  assert.equal(statusOf(rewrite(() => consumeDailyQuota(quotas, 'tripX', 'userA', now))), 429);
});

test('consumeDailyQuota: buckets ARE per trip and per user', () => {
  const quotas: QuotaMap = new Map();
  const now = new Date('2026-10-19T10:00:00Z');
  for (let i = 0; i < env.BOT_DAILY_LIMIT; i += 1) {
    assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripX', 'userA', now));
  }
  assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripX', 'userB', now)); // other user
  assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripY', 'userA', now)); // other trip
});

test('consumeDailyQuota: the next day resets the bucket', () => {
  const quotas: QuotaMap = new Map();
  const day1 = new Date('2026-10-19T10:00:00Z');
  const day2 = new Date('2026-10-20T10:00:00Z');
  for (let i = 0; i < env.BOT_DAILY_LIMIT; i += 1) {
    assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripX', 'userA', day1));
  }
  assert.equal(statusOf(rewrite(() => consumeDailyQuota(quotas, 'tripX', 'userA', day1))), 429);
  assert.doesNotThrow(() => consumeDailyQuota(quotas, 'tripX', 'userA', day2));
});

test('dayKeyFor + quotaKey build stable bucket keys', () => {
  assert.equal(dayKeyFor(new Date('2026-10-19T23:59:59Z')), '2026-10-19');
  assert.equal(quotaKey('t1', 'u1'), 't1:u1');
});

/* --------------------------------- helpers ---------------------------------- */

function rewrite(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

/* ---------------------------- F12b answer envelope -------------------------- */

test('parseAssistantAnswer: plain prose degrades to a text-only answer (F12a replies stay valid)', () => {
  const { text, proposal } = parseAssistantAnswer('Seafood at the night market, hands down.');
  assert.equal(text, 'Seafood at the night market, hands down.');
  assert.equal(proposal, null);
});

test('parseAssistantAnswer: the JSON envelope parses with or without fences', () => {
  const envelope = '{"text":"Day 2 could breathe more.","proposal":{"kind":"day_title","day":2,"value":"Free afternoon"}}';
  const fenced = '```json\n' + envelope + '\n```';
  for (const raw of [envelope, fenced]) {
    const parsed = parseAssistantAnswer(raw);
    assert.equal(parsed.text, 'Day 2 could breathe more.');
    assert.deepEqual(parsed.proposal, { kind: 'day_title', day: 2, value: 'Free afternoon' });
  }
});

test('parseAssistantAnswer: prose that merely looks like JSON stays prose', () => {
  const raw = '{Hello, this is not JSON';
  const parsed = parseAssistantAnswer(raw);
  assert.equal(parsed.text, raw);
  assert.equal(parsed.proposal, null);
});

test('parseAssistantAnswer: a malformed proposal is dropped, the text survives', () => {
  const parsed = parseAssistantAnswer(
    '{"text":"Maybe this?","proposal":{"kind":"explode_everything","boom":true}}'
  );
  assert.equal(parsed.text, 'Maybe this?');
  assert.equal(parsed.proposal, null);
});

test('parseAssistantAnswer: an empty text with a valid proposal gets a template line', () => {
  const parsed = parseAssistantAnswer('{"text":"","proposal":{"kind":"title","value":"Goa Sunrise"}}');
  assert.ok(parsed.text.length > 0, 'a proposal-only answer still shows something');
  assert.deepEqual(parsed.proposal, { kind: 'title', value: 'Goa Sunrise' });
});

test('parseAssistantAnswer: a truncated JSON envelope degrades to prose, not a crash', () => {
  const truncated = '{"text":"","proposal":{"kind":"title","value":"Goa Sunrise"}';
  const parsed = parseAssistantAnswer(truncated);
  assert.equal(parsed.proposal, null);
  assert.ok(parsed.text.length > 0);
});

test('validateAssistantProposal: caps and shape — junk drops', () => {
  assert.equal(validateAssistantProposal(null), null);
  assert.equal(validateAssistantProposal('title'), null);
  assert.equal(validateAssistantProposal({ kind: 'unkind' }), null);
  assert.equal(validateAssistantProposal({ kind: 'day_title', day: 99, value: '' }), null); // empty value
});

test('validateAssistantProposal: budget accepts numeric strings through coerce', () => {
  assert.deepEqual(validateAssistantProposal({ kind: 'budget', value: '15000' }), {
    kind: 'budget',
    value: 15000,
  });
  assert.equal(validateAssistantProposal({ kind: 'budget', value: 0 }), null);
  assert.equal(validateAssistantProposal({ kind: 'budget', value: -5 }), null);
});

test('validateAssistantProposal: the serialized backstop keeps proposals inside one comment', () => {
  // 200 code points fit; ~800 chars of JSON do not.
  assert.ok(validateAssistantProposal({ kind: 'day_tip', day: 3, value: 't'.repeat(200) }));
  assert.equal(
    validateAssistantProposal({ kind: 'title', value: 'a'.repeat(400) }),
    null,
    'an over-cap title is rejected by zod before the size backstop'
  );
});

test('proposalFitsTrip: day-anchored proposals need a day the trip actually has', () => {
  const facts = tripFactsFrom({
    tripDetails: { trip_title: 'T', duration_days: 2 },
  });
  assert.equal(proposalFitsTrip({ kind: 'day_title', day: 2, value: 'x' }, facts), true);
  assert.equal(proposalFitsTrip({ kind: 'day_title', day: 3, value: 'x' }, facts), false);
  assert.equal(proposalFitsTrip({ kind: 'title', value: 'x' }, facts), true);
  assert.equal(
    proposalFitsTrip({ kind: 'day_tip', day: 1, value: 'x' }, { title: 'No day count', dayTitles: [], dayPlans: [] }),
    false
  );
});

test('buildAssistantPrompt: the JSON protocol is compiled into the prompt', () => {
  const facts = tripFactsFrom({ tripDetails: { trip_title: 'T', duration_days: 2 } });
  const composed = buildAssistantPrompt(facts, 'q', []);
  assert.ok(composed.includes('"proposal"'));
  assert.ok(composed.includes('"day_title"'));
  assert.ok(composed.includes('day numbers ONLY from the planned days'));
});

/* ------------------------ F12d: activity-level edits ------------------------ */

const planFacts = () =>
  tripFactsFrom({
    tripDetails: {
      trip_title: 'T',
      duration_days: 3,
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive',
          activities: [{ title: 'Beach walk', time: '9am' }, { name: 'Night market' }],
          stay_recommendations: [{ name: 'Casa Anjuna' }, 'Beach hut'],
        },
        {
          day: 2,
          title: 'Scooters',
          activities: ['Temple run'],
          stay_recommendations: [{ name: 'Palm Lodge' }],
        },
        { day: 3, title: 'Fly home', activities: [] },
      ],
    },
  });

test('tripFactsFrom: activity labels become positional server facts', () => {
  // `title` wins over `name` (the timeline's own display order); string
  // activities (legacy payloads) pass through; empty days keep their line.
  assert.deepEqual(planFacts().dayPlans, [
    { day: 1, activities: ['Beach walk', 'Night market'], stays: ['Casa Anjuna', 'Beach hut'] },
    { day: 2, activities: ['Temple run'], stays: ['Palm Lodge'] },
    { day: 3, activities: [], stays: [] },
  ]);
});

test('tripFactsFrom: activity facts cap per day and per label', () => {
  const facts = tripFactsFrom({
    tripDetails: {
      day_by_day_itinerary: [
        { day: 1, activities: Array.from({ length: 10 }, () => ({ title: 'L'.repeat(200) })) },
      ],
    },
  });
  assert.equal(facts.dayPlans[0].activities.length, ASSISTANT_RULES.ACTIVITIES_PER_DAY_MAX);
  assert.equal(facts.dayPlans[0].activities[0].length, ASSISTANT_RULES.ACTIVITY_LABEL_MAX);
});

test('tripFactsFrom: stay names cap per day and per label', () => {
  const facts = tripFactsFrom({
    tripDetails: {
      day_by_day_itinerary: [
        {
          day: 1,
          stay_recommendations: Array.from({ length: 6 }, () => ({ name: 'S'.repeat(120) })),
        },
        { day: 2, stay_recommendations: [{}, '  ', null] },
      ],
    },
  });
  assert.equal(facts.dayPlans[0].stays.length, ASSISTANT_RULES.STAYS_PER_DAY_MAX);
  assert.equal(facts.dayPlans[0].stays[0].length, ASSISTANT_RULES.STAY_LABEL_MAX);
  assert.deepEqual(facts.dayPlans[1].stays, [], 'nameless stays and junk drop out');
});

test('validateAssistantProposal: swap/move/update shapes coerce numbers, reject junk', () => {
  assert.deepEqual(validateAssistantProposal({ kind: 'swap_days', from_day: '1', to_day: 2 }), {
    kind: 'swap_days',
    from_day: 1,
    to_day: 2,
  });
  assert.deepEqual(
    validateAssistantProposal({
      kind: 'move_activity',
      day: '1',
      index: '0',
      to_day: 2,
      to_index: '1',
      expect: 'Beach walk',
    }),
    { kind: 'move_activity', day: 1, index: 0, to_day: 2, to_index: 1, expect: 'Beach walk' }
  );
  assert.equal(
    validateAssistantProposal({ kind: 'move_activity', day: 1, index: -1, to_day: 2, to_index: 0, expect: 'x' }),
    null,
    'negative positions are rejected'
  );
  assert.equal(
    validateAssistantProposal({ kind: 'update_activity', day: 1, index: 0, value: 'x' }),
    null,
    'the drift guard is mandatory on an update'
  );
  assert.equal(validateAssistantProposal({ kind: 'swap_days', from_day: 0, to_day: 2 }), null);
});

test('proposalFitsTrip: swap_days needs two distinct days the itinerary has', () => {
  const facts = planFacts();
  assert.equal(proposalFitsTrip({ kind: 'swap_days', from_day: 1, to_day: 2 }, facts), true);
  assert.equal(proposalFitsTrip({ kind: 'swap_days', from_day: 1, to_day: 9 }, facts), false);
  assert.equal(proposalFitsTrip({ kind: 'swap_days', from_day: 2, to_day: 2 }, facts), false);
  assert.equal(
    proposalFitsTrip(
      { kind: 'swap_days', from_day: 1, to_day: 2 },
      { title: 'T', dayTitles: [], dayPlans: [] }
    ),
    false,
    'no itinerary → nothing to swap'
  );
});

test('proposalFitsTrip: move_activity checks the source label, destination and final position', () => {
  const facts = planFacts();
  const move = (patch: Record<string, unknown> = {}) => ({
    kind: 'move_activity' as const,
    day: 1,
    index: 0,
    to_day: 2,
    to_index: 1,
    expect: 'Beach walk',
    ...patch,
  });
  assert.equal(proposalFitsTrip(move(), facts), true);
  assert.equal(proposalFitsTrip(move({ expect: 'Museum' }), facts), false, 'wrong label');
  assert.equal(proposalFitsTrip(move({ expect: 'beach WALK' }), facts), true, 'case/space tolerant');
  assert.equal(proposalFitsTrip(move({ to_day: 9 }), facts), false, 'no such destination');
  assert.equal(proposalFitsTrip(move({ to_index: 5 }), facts), false, 'destination too short');
  assert.equal(proposalFitsTrip(move({ to_index: 1 }), facts), true, 'the append position is legal');
  assert.equal(proposalFitsTrip(move({ index: 2 }), facts), false, 'no such source activity');
  assert.equal(proposalFitsTrip(move({ to_day: 1, to_index: 0 }), facts), false, 'a no-op move is not a card');
  assert.equal(proposalFitsTrip(move({ to_day: 1, to_index: 1 }), facts), true, 'reorder within a day');
});

test('proposalFitsTrip: update_activity refuses a stale label', () => {
  const facts = planFacts();
  assert.equal(
    proposalFitsTrip(
      { kind: 'update_activity', day: 2, index: 0, value: 'Temple at dawn', expect: 'Temple run' },
      facts
    ),
    true
  );
  assert.equal(
    proposalFitsTrip(
      { kind: 'update_activity', day: 2, index: 0, value: 'X', expect: 'Old label' },
      facts
    ),
    false
  );
  assert.equal(
    proposalFitsTrip({ kind: 'update_activity', day: 3, index: 0, value: 'X', expect: 'X' }, facts),
    false,
    'an empty day has no position 0'
  );
});

/* ----------------------- F12e: add + choose-one ideas ----------------------- */

test('validateAssistantProposal: add_activity and activity_choices shapes', () => {
  assert.deepEqual(
    validateAssistantProposal({ kind: 'add_activity', day: '1', value: 'Cooking class' }),
    { kind: 'add_activity', day: 1, value: 'Cooking class' }
  );
  assert.deepEqual(
    validateAssistantProposal({
      kind: 'activity_choices',
      day: '1',
      options: ['  Cooking class  ', 'Spice market walk'],
    }),
    { kind: 'activity_choices', day: 1, options: ['Cooking class', 'Spice market walk'] }
  );
  assert.equal(
    validateAssistantProposal({ kind: 'activity_choices', day: 1, options: ['Only one'] }),
    null,
    'a single option is not a choice'
  );
  assert.equal(
    validateAssistantProposal({
      kind: 'activity_choices',
      day: 1,
      options: ['Market walk', 'market WALK'],
    }),
    null,
    'near-duplicate options collapse to one and are rejected'
  );
  assert.equal(
    validateAssistantProposal({
      kind: 'activity_choices',
      day: 1,
      options: ['A', 'B', 'C', 'D'],
    }),
    null,
    'at most three options fit one card'
  );
});

test('proposalFitsTrip: add_activity needs a real day and a legal insert position', () => {
  const facts = planFacts();
  assert.equal(proposalFitsTrip({ kind: 'add_activity', day: 1, value: 'X' }, facts), true);
  assert.equal(
    proposalFitsTrip({ kind: 'add_activity', day: 1, index: 2, value: 'X' }, facts),
    true,
    'appending after the last activity is legal'
  );
  assert.equal(
    proposalFitsTrip({ kind: 'add_activity', day: 1, index: 3, value: 'X' }, facts),
    false,
    'an insert cannot skip past the end'
  );
  assert.equal(
    proposalFitsTrip({ kind: 'add_activity', day: 9, value: 'X' }, facts),
    false,
    'no such day'
  );
});

test('proposalFitsTrip: activity_choices guards a replace, allows an add', () => {
  const facts = planFacts();
  const choices = (patch: Record<string, unknown> = {}) => ({
    kind: 'activity_choices' as const,
    day: 1,
    options: ['Cooking class', 'Kerala houseboat lunch'],
    ...patch,
  });
  assert.equal(proposalFitsTrip(choices(), facts), true, 'an add-style picker is safe');
  assert.equal(
    proposalFitsTrip(choices({ index: 0, expect: 'Beach walk' }), facts),
    true,
    'a replace-style picker matches the label it saw'
  );
  assert.equal(
    proposalFitsTrip(choices({ index: 0, expect: 'Museum' }), facts),
    false,
    'a stale label is refused'
  );
  assert.equal(
    proposalFitsTrip(choices({ index: 5, expect: 'Beach walk' }), facts),
    false,
    'an out-of-range replace target is refused'
  );
  assert.equal(
    proposalFitsTrip(choices({ expect: 'Beach walk' }), facts),
    false,
    'expect without a position is ambiguous'
  );
  assert.equal(proposalFitsTrip(choices({ day: 9 }), facts), false, 'no such day');
});

test('buildAssistantPrompt: activity facts and the F12d protocol render together', () => {
  const composed = buildAssistantPrompt(planFacts(), 'move the beach walk to day 2', []);
  assert.ok(composed.includes('Day 1 activities: [0] Beach walk | [1] Night market'));
  assert.ok(composed.includes('"swap_days"'));
  assert.ok(composed.includes('"move_activity"'));
  assert.ok(composed.includes('"update_activity"'));
  assert.ok(composed.includes('"add_activity"'));
  assert.ok(composed.includes('"activity_choices"'));
  assert.ok(composed.includes('Use update_activity ONLY when the asker has already stated the exact new title'));
  assert.ok(composed.includes('Copy "expect" VERBATIM'));
  assert.ok(composed.includes('never promise to do it later'), 'the no-promises rule ships');
  assert.ok(!composed.includes('Day 3 activities:'), 'days without activities add no line');
});

test('parseAssistantAnswer: an activity-edit envelope keeps its drift guard', () => {
  const parsed = parseAssistantAnswer(
    JSON.stringify({
      text: 'Moved it to Day 2.',
      proposal: {
        kind: 'move_activity',
        day: 1,
        index: 0,
        to_day: 2,
        to_index: 1,
        expect: 'Beach walk',
      },
    })
  );
  assert.equal(parsed.text, 'Moved it to Day 2.');
  assert.deepEqual(parsed.proposal, {
    kind: 'move_activity',
    day: 1,
    index: 0,
    to_day: 2,
    to_index: 1,
    expect: 'Beach walk',
  });
});

test('labelMatches: prefix, case and quote tolerant — but never empty', () => {
  assert.equal(labelMatches('Beach walk', 'beach'), true);
  assert.equal(labelMatches('"Beach walk"', 'Beach walk'), true);
  assert.equal(labelMatches('Beach  walk', 'BEACH WALK'), true);
  assert.equal(labelMatches('Beach walk', ''), false);
  assert.equal(labelMatches('Beach walk', 'Museum'), false);
});

/* ------------------------------ F12c task + day ----------------------------- */

test('assistantTaskFrom: summarize-family asks route to the summary task', () => {
  for (const askText of [
    'summarize what we have decided so far',
    'Summarize the plan, waytowalk', // mention already stripped server-side
    'can you recap the discussion?',
    'catch us up on what we agreed',
    'what did we decide about day 2?',
    'bring me up to speed please',
  ]) {
    assert.equal(assistantTaskFrom(askText), 'summary', askText);
  }
  for (const askText of ['eat where?', 'how much is the museum entry?', 'weather in Manali?']) {
    assert.equal(assistantTaskFrom(askText), 'answer', askText);
  }
});

test('buildAssistantPrompt: the summary task swaps in the decided-first instruction', () => {
  const facts = tripFactsFrom({ tripDetails: { trip_title: 'T', duration_days: 2 } });
  const composed = buildAssistantPrompt(facts, 'summarize what we agreed', [], { task: 'summary' });
  assert.ok(composed.includes('summarize the discussion for the group'));
  assert.ok(composed.includes('DECIDED'));
  assert.ok(!composed.includes('no list longer than 3 items'));
  // ...while the answer task keeps its bubble rules
  const answerComposed = buildAssistantPrompt(facts, 'eat where?', [], { task: 'answer' });
  assert.ok(answerComposed.includes('no list longer than 3 items'));
});

test('buildAssistantPrompt: a day anchor is only added when the trip describes that day', () => {
  const facts = tripFactsFrom({
    tripDetails: {
      trip_title: 'T',
      duration_days: 2,
      day_by_day_itinerary: [
        { day: 1, title: 'Arrive & seafood' },
        { day: 2, title: 'Scooters day' },
      ],
    },
  });
  const anchored = buildAssistantPrompt(facts, 'q', [], { dayAnchor: 2 });
  assert.ok(anchored.includes('The asker is asking about Day 2: Scooters day.'));
  // An out-of-range day adds NO invented structure.
  const phantom = buildAssistantPrompt(facts, 'q', [], { dayAnchor: 9 });
  assert.ok(!phantom.includes('asking about'));
});

/* --------------------- F12f: stays + multi-edit sets ----------------------- */

test('validateAssistantProposal: add_stay and stay_choices shapes', () => {
  assert.deepEqual(
    validateAssistantProposal({
      kind: 'add_stay',
      day: '1',
      value: { name: '  Casa Anjuna  ', location: 'Anjuna', vibe: 'quiet' },
    }),
    { kind: 'add_stay', day: 1, value: { name: 'Casa Anjuna', location: 'Anjuna', vibe: 'quiet' } }
  );
  assert.deepEqual(
    validateAssistantProposal({
      kind: 'stay_choices',
      day: '2',
      options: [{ name: 'Palm Lodge' }, { name: 'Cove House', location: 'Vagator' }],
    }),
    {
      kind: 'stay_choices',
      day: 2,
      options: [{ name: 'Palm Lodge' }, { name: 'Cove House', location: 'Vagator' }],
    },
    'a stay picker needs names only — location/vibe stay optional'
  );
  assert.equal(
    validateAssistantProposal({ kind: 'stay_choices', day: 2, options: [{ name: 'One' }] }),
    null,
    'a single stay is not a choice'
  );
  assert.equal(
    validateAssistantProposal({
      kind: 'stay_choices',
      day: 2,
      options: [{ name: 'Palm Lodge' }, { name: 'palm  lodge' }],
    }),
    null,
    'near-duplicate stay names collapse to one and are rejected'
  );
  assert.equal(
    validateAssistantProposal({ kind: 'add_stay', day: 1, value: { name: '' } }),
    null,
    'an unnamed stay cannot be added'
  );
});

test('proposalFitsTrip: stays need a real day and a matching replace target', () => {
  const facts = planFacts();
  assert.equal(
    proposalFitsTrip({ kind: 'add_stay', day: 3, value: { name: 'Airport hotel' } }, facts),
    true,
    'a day with no stays can still receive one'
  );
  assert.equal(
    proposalFitsTrip({ kind: 'add_stay', day: 9, value: { name: 'X' } }, facts),
    false,
    'no such day'
  );
  assert.equal(
    proposalFitsTrip(
      { kind: 'add_stay', day: 1, value: { name: 'Cove House' }, expect: 'Beach hut' },
      facts
    ),
    true,
    'a replace target is matched case/space tolerantly'
  );
  assert.equal(
    proposalFitsTrip(
      { kind: 'add_stay', day: 1, value: { name: 'Cove House' }, expect: 'Somewhere else' },
      facts
    ),
    false,
    'a stale replace target is refused'
  );
  assert.equal(
    proposalFitsTrip(
      { kind: 'stay_choices', day: 2, options: [{ name: 'Cove House' }, { name: 'Palm Grove' }] },
      facts
    ),
    true,
    'an add-style stay picker is safe'
  );
  assert.equal(
    proposalFitsTrip(
      {
        kind: 'stay_choices',
        day: 2,
        expect: 'Palm Lodge',
        options: [{ name: 'Cove House' }, { name: 'Palm Grove' }],
      },
      facts
    ),
    true,
    'a replace-style picker finds its stay'
  );
  assert.equal(
    proposalFitsTrip(
      {
        kind: 'stay_choices',
        day: 3,
        expect: 'Palm Lodge',
        options: [{ name: 'Cove House' }, { name: 'Palm Grove' }],
      },
      facts
    ),
    false,
    'a replace target on a day without stays is refused'
  );
});

test('validateAssistantProposals: a multi-edit set must touch distinct days', () => {
  const rename = { kind: 'day_title', day: 1, value: 'Beach morning' };
  const tip = { kind: 'day_tip', day: 2, value: 'Carry cash' };
  assert.deepEqual(validateAssistantProposals([rename, tip]), [rename, tip]);

  assert.deepEqual(
    validateAssistantProposals([rename, { kind: 'day_tip', day: 1, value: 'More' }]),
    [],
    'two edits on the same day cannot apply safely'
  );
  assert.deepEqual(
    validateAssistantProposals([
      { kind: 'swap_days', from_day: 1, to_day: 2 },
      { kind: 'day_tip', day: 2, value: 'More' },
    ]),
    [],
    'a swap claims both of its days'
  );
  assert.deepEqual(
    validateAssistantProposals([
      { kind: 'move_activity', day: 1, index: 0, to_day: 2, to_index: 0, expect: 'Beach walk' },
      { kind: 'day_title', day: 2, value: 'Later' },
    ]),
    [],
    'a move claims source and destination'
  );
  assert.deepEqual(
    validateAssistantProposals([
      { kind: 'move_activity', day: 1, index: 0, to_day: 2, to_index: 0, expect: 'Beach walk' },
      { kind: 'day_title', day: 3, value: 'Home' },
    ]).length,
    2,
    'unrelated days are fine'
  );
});

test('validateAssistantProposals: a picker is always alone and the set is capped', () => {
  const picker = {
    kind: 'activity_choices',
    day: 1,
    options: ['Cooking class', 'Spice market walk'],
  };
  const tip = { kind: 'day_tip', day: 2, value: 'Carry cash' };
  assert.deepEqual(validateAssistantProposals([picker, tip]), [picker], 'the picker survives alone');

  const stayPicker = {
    kind: 'stay_choices',
    day: 2,
    options: [{ name: 'Cove House' }, { name: 'Palm Grove' }],
  };
  assert.deepEqual(validateAssistantProposals([stayPicker, tip]), [stayPicker]);

  const four = [
    { kind: 'day_title', day: 1, value: 'A' },
    { kind: 'day_title', day: 2, value: 'B' },
    { kind: 'day_title', day: 3, value: 'C' },
    { kind: 'day_title', day: 4, value: 'D' },
  ];
  assert.deepEqual(
    validateAssistantProposals(four),
    [],
    'more than three edits is the whole answer, not a truncated set'
  );

  assert.deepEqual(validateAssistantProposals([]), []);
  assert.deepEqual(validateAssistantProposals('nope'), []);
  assert.deepEqual(
    validateAssistantProposals([{ kind: 'unknown' }, tip]),
    [tip],
    'junk items drop, the valid ones stay'
  );
});

test('parseAssistantAnswer: a proposals array becomes one multi-edit answer', () => {
  const parsed = parseAssistantAnswer(
    JSON.stringify({
      text: 'Shuffled Day 1 and retitled Day 2.',
      proposals: [
        { kind: 'day_title', day: 1, value: 'Beach morning' },
        { kind: 'day_tip', day: 2, value: 'Carry cash' },
      ],
    })
  );
  assert.equal(parsed.text, 'Shuffled Day 1 and retitled Day 2.');
  assert.equal(parsed.proposal, null, 'a set is not a single proposal');
  assert.deepEqual(parsed.proposals, [
    { kind: 'day_title', day: 1, value: 'Beach morning' },
    { kind: 'day_tip', day: 2, value: 'Carry cash' },
  ]);
});

test('parseAssistantAnswer: a one-item array collapses to a normal card', () => {
  const parsed = parseAssistantAnswer(
    '{"text":"","proposals":[{"kind":"day_tip","day":1,"value":"Carry cash"}]}'
  );
  assert.deepEqual(parsed.proposal, { kind: 'day_tip', day: 1, value: 'Carry cash' });
  assert.equal(parsed.proposals.length, 1);
  assert.ok(parsed.text.length > 0);
});

test('parseAssistantAnswer: an empty text with several edits gets a template line', () => {
  const parsed = parseAssistantAnswer(
    '{"text":"","proposals":[{"kind":"day_tip","day":1,"value":"A"},{"kind":"day_tip","day":2,"value":"B"}]}'
  );
  assert.equal(parsed.text, 'Here are the proposed changes for the trip.');
  assert.equal(parsed.proposals.length, 2);
});

test('buildAssistantPrompt: stays, multi-edit protocol and routing rules ship', () => {
  const composed = buildAssistantPrompt(planFacts(), 'where should we stay on day 1?', []);
  assert.ok(composed.includes('Day 1 stays: “Casa Anjuna” | “Beach hut”'));
  assert.ok(composed.includes('Day 2 stays: “Palm Lodge”'));
  assert.ok(!composed.includes('Day 3 stays:'), 'days without stays add no line');
  assert.ok(composed.includes('"add_stay"'));
  assert.ok(composed.includes('"stay_choices"'));
  assert.ok(composed.includes('"proposals"'));
  assert.ok(composed.includes('never more than three'));
  assert.ok(composed.includes('a picker (activity_choices/stay_choices) must be the ONLY item'));
  assert.ok(composed.includes('swap_days'), 'day swaps are routed explicitly');
  assert.ok(composed.includes('rename a day with day_title'));
});
