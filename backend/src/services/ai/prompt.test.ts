import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMPT_VERSION,
  resolveLanguage,
  computeInterestWeights,
  adaptPromptForSeason,
  assignVariant,
  buildPromptText,
  buildDayAlternativePrompt,
} from './prompt.js';

test('resolveLanguage maps known codes and defaults to English', () => {
  assert.equal(resolveLanguage('hi').code, 'hi');
  assert.equal(resolveLanguage('TA').code, 'ta');
  assert.equal(resolveLanguage(undefined).code, 'en');
  assert.equal(resolveLanguage('klingon').code, 'en');
});

test('computeInterestWeights returns a weight per selected interest', () => {
  assert.deepEqual(computeInterestWeights([]), {});

  const single = computeInterestWeights(['Adventure']);
  const many = computeInterestWeights([
    'Adventure',
    'Culture',
    'Food',
    'Nature',
    'Photography',
    'Nightlife',
    'Shopping',
    'Relaxation',
  ]);

  assert.equal(Object.keys(single).length, 1);
  assert.equal(Object.keys(many).length, 8);
  // A focused selection should weight its single interest more heavily
  assert.ok(single.Adventure > many.Adventure);
  // Handles a comma separated string too
  assert.deepEqual(Object.keys(computeInterestWeights('Adventure, Food')), [
    'Adventure',
    'Food',
  ]);
});

test('adaptPromptForSeason derives the Indian season from the start date', () => {
  assert.equal(adaptPromptForSeason('2026-07-15').name, 'Monsoon');
  assert.equal(adaptPromptForSeason('2026-01-05').name, 'Winter');
  assert.equal(adaptPromptForSeason('2026-04-01').name, 'Summer / Pre-Monsoon');
  assert.equal(adaptPromptForSeason('2026-10-10').name, 'Post-Monsoon / Autumn');
  // Invalid dates fall back to the current season without throwing
  assert.ok(adaptPromptForSeason('not-a-date').name.length > 0);
});

test('assignVariant is deterministic per user id', () => {
  assert.equal(assignVariant('user-1'), assignVariant('user-1'));
  assert.equal(assignVariant(undefined), 'A');
  assert.ok(['A', 'B'].includes(assignVariant('someone')));
});

test('buildPromptText includes trip basics, season, weights and preferences', () => {
  const prompt = buildPromptText({
    destination: 'Wayanad',
    days: 4,
    budget: 20000,
    startdate: '2026-07-15',
    enddate: '2026-07-19',
    interests: ['Adventure', 'Nature'],
    groupType: 'Couple',
    preferences: { pace: 'relaxed', dietary: ['vegetarian'], avoid: ['smoking'] },
  });

  assert.ok(prompt.includes('Wayanad'));
  assert.ok(prompt.includes('Number of Days: 4'));
  assert.ok(prompt.includes('₹20000'));
  assert.ok(prompt.includes('Seasonal Context (Monsoon'));
  assert.ok(prompt.includes('Interest Focus'));
  assert.ok(prompt.includes('- Adventure:'));
  assert.ok(prompt.includes('Traveller Preferences'));
  assert.ok(prompt.includes('relaxed pace'));
  assert.ok(prompt.includes('vegetarian'));
  assert.ok(prompt.includes('Strictly avoid'));
  // JSON schema keys must remain English for downstream parsing
  assert.ok(prompt.includes('"trip_title"'));
  assert.ok(prompt.includes('"day_by_day_itinerary"'));
});

test('buildPromptText requests translated values but keeps English JSON keys', () => {
  const prompt = buildPromptText({
    destination: 'Jaipur',
    days: 3,
    budget: 15000,
    startdate: '2026-11-01',
    enddate: '2026-11-04',
    interests: 'Culture',
    groupType: 'Family',
    language: 'hi',
  });

  assert.ok(prompt.includes('Hindi'));
  assert.ok(prompt.includes('हिन्दी'));
  assert.ok(prompt.includes('Keep every JSON key exactly as written below in English'));
});

test('buildPromptText injects personalization from trip history', () => {
  const prompt = buildPromptText({
    destination: 'Coorg',
    days: 2,
    budget: 10000,
    startdate: '2026-12-01',
    enddate: '2026-12-03',
    interests: ['Food'],
    groupType: 'Solo',
    history: {
      totalTrips: 3,
      recentDestinations: ['Gokarna'],
      topInterests: ['Food', 'Nature'],
      avgBudgetPerPerson: 12000,
      preferredGroupType: 'Solo',
      likedHighlights: ['Sunset at the beach'],
    },
  });

  assert.ok(prompt.includes('Returning Traveller Personalization'));
  assert.ok(prompt.includes('Gokarna'));
  assert.ok(prompt.includes('₹12000'));
  assert.ok(prompt.includes('Sunset at the beach'));
});

test('PROMPT_VERSION is exported for storage on trips', () => {
  assert.equal(typeof PROMPT_VERSION, 'string');
  assert.ok(PROMPT_VERSION.length > 0);
});

test('buildDayAlternativePrompt asks for a weather-safe single day', () => {
  const prompt = buildDayAlternativePrompt({
    destination: 'Munnar',
    dayNumber: 3,
    dayTitle: 'Tea estate trails',
    activities: ['Sunrise trek to Top Station', 'Tea museum visit'],
    riskLevel: 'high',
    advisories: ['Heavy rain expected (~26 mm) — hill roads turn slippery.'],
    preferences: { pace: 'relaxed', dietary: ['vegetarian'] },
  });

  assert.ok(prompt.includes('Munnar'));
  assert.ok(prompt.includes('Day 3'));
  assert.ok(prompt.includes('Tea estate trails'));
  assert.ok(prompt.includes('Sunrise trek to Top Station'));
  assert.ok(prompt.includes('HIGH'));
  assert.ok(prompt.includes('Heavy rain expected'));
  assert.ok(/INDOOR/.test(prompt));
  // Preference blocks are carried through from Milestone 2
  assert.ok(prompt.includes('Traveller Preferences'));
  assert.ok(prompt.includes('vegetarian'));
  // Strict JSON contract for the parser
  assert.ok(prompt.includes('"activities"'));
  assert.ok(prompt.includes('"rationale"'));
});

test('buildDayAlternativePrompt relaxes guidance when weather is fine', () => {
  const prompt = buildDayAlternativePrompt({
    destination: 'Hampi',
    dayNumber: 1,
    activities: [],
    riskLevel: 'none',
  });

  assert.ok(prompt.includes('NONE'));
  assert.ok(prompt.includes('No significant weather risk'));
  assert.ok(!/INDOOR/.test(prompt));
  assert.ok(prompt.includes('(no activities recorded)'));
});
