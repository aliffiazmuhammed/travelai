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
  parseAssistantAnswer,
  proposalFitsTrip,
  quotaKey,
  stripMention,
  tripFactsFrom,
  validateAssistantProposal,
  type QuotaMap,
} from './assistant.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

/**
 * Pure-rule tests for the @TravelAI assistant (F12a). The provider spend is
 * the thing protected: mention gating (the primary brake), tight context
 * caps, the wire budget, the bubble-sized reply clamp, and the per user ×
 * trip × day quota. The AI + DB paths ride the live `smoke-f12a.mts` run.
 */

const statusOf = (error: unknown): number =>
  error instanceof AppError ? error.statusCode : -1;

/* ------------------------------- the mention gate ------------------------- */

test('assertAssistantInputs: any casing of @TravelAI gates the ask', () => {
  for (const prompt of ['@TravelAI eat where?', '@travelai eat where?', 'so... @TravelAI should we rent scooters?']) {
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
    statusOf(rewrite(() => assertAssistantInputs(`@TravelAI ${'x'.repeat(500)}`, []))),
    400
  );
  assert.doesNotThrow(() =>
    assertAssistantInputs(`@TravelAI ${'x'.repeat(490)}`, [])
  );
});

/* ------------------------------- context caps ----------------------------- */

test('assertAssistantInputs: over the 8-line context cap is a 400', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ label: `m${i}`, text: 'hi' }));
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('@TravelAI q', nine))), 400);
});

test('assertAssistantInputs: junk context lines are dropped, not rejected', () => {
  const { context } = assertAssistantInputs('@TravelAI q', [
    { label: '', text: 'no label — dropped' },
    { label: 'alice', text: '' }, // dropped
    { label: 'alice', text: 'I love seafood' },
    'not an object', // dropped
  ]);
  assert.equal(context.length, 1);
  assert.deepEqual(context[0], { label: 'alice', text: 'I love seafood' });
});

test('assertAssistantInputs: labels and texts clamp to their caps', () => {
  const { context } = assertAssistantInputs('@TravelAI q', [
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
  assert.equal(statusOf(rewrite(() => assertAssistantInputs('@TravelAI q', hostile))), 400);
  // The zod-legal maximum (8 × 532 + prompt ≤ 500) must always fit.
  const legal = Array.from({ length: 8 }, () => ({ label: 'l'.repeat(32), text: 't'.repeat(500) }));
  assert.doesNotThrow(() => assertAssistantInputs(`@TravelAI ${'q'.repeat(420)}`, legal));
});

test('assertAssistantInputs: spoofed labels fall out when member labels provided', () => {
  const { context } = assertAssistantInputs(
    '@TravelAI q',
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
  assert.equal(proposalFitsTrip({ kind: 'day_tip', day: 1, value: 'x' }, { title: 'No day count' }), false);
});

test('buildAssistantPrompt: the JSON protocol is compiled into the prompt', () => {
  const facts = tripFactsFrom({ tripDetails: { trip_title: 'T', duration_days: 2 } });
  const composed = buildAssistantPrompt(facts, 'q', []);
  assert.ok(composed.includes('"proposal"'));
  assert.ok(composed.includes('"day_title"'));
  assert.ok(composed.includes('day numbers listed in the planned days'));
});
