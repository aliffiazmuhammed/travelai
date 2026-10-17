import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdvisories,
  classifyRisk,
  dateRange,
  maxRisk,
  normalizeOpenMeteoDaily,
  pickAnchor,
  seasonalNormals,
  summarizeDay,
} from './weather.js';

test('classifyRisk maps rain volume to escalating risk', () => {
  assert.equal(classifyRisk({}), 'none');
  assert.equal(classifyRisk({ precipitationMm: 0.4, precipitationProbability: 10 }), 'none');
  assert.equal(classifyRisk({ precipitationMm: 1.5 }), 'low');
  assert.equal(classifyRisk({ precipitationProbability: 65 }), 'moderate');
  assert.equal(classifyRisk({ precipitationMm: 22 }), 'high');
  assert.equal(classifyRisk({ precipitationProbability: 85 }), 'high');
});

test('classifyRisk flags heat and wind independently of rain', () => {
  assert.equal(classifyRisk({ tempMax: 36 }), 'moderate');
  assert.equal(classifyRisk({ tempMax: 41 }), 'high');
  assert.equal(classifyRisk({ windKph: 46 }), 'moderate');
  assert.equal(classifyRisk({ windKph: 64 }), 'high');
  // Severity wins when multiple factors are present
  assert.equal(classifyRisk({ precipitationMm: 22, tempMax: 30 }), 'high');
  assert.equal(classifyRisk({ tempMax: 37, windKph: 46 }), 'moderate');
});

test('maxRisk returns the more severe level', () => {
  assert.equal(maxRisk('none', 'low'), 'low');
  assert.equal(maxRisk('high', 'moderate'), 'high');
  assert.equal(maxRisk('low', 'low'), 'low');
});

test('buildAdvisories produces India-specific guidance', () => {
  const storm = buildAdvisories({ date: '2026-07-10', precipitationMm: 26, precipitationProbability: 90 });
  assert.ok(storm.some((line) => /landslide/i.test(line)));
  assert.ok(storm.some((line) => /monsoon/i.test(line)));

  const heat = buildAdvisories({ tempMax: 41 });
  assert.ok(heat.some((line) => /ORS|electrolytes/i.test(line)));

  const wind = buildAdvisories({ windKph: 62 });
  assert.ok(wind.some((line) => /cable cars/i.test(line)));

  const cold = buildAdvisories({ tempMin: 1 });
  assert.ok(cold.some((line) => /layer up/i.test(line)));

  // A calm day has no advisories at all
  assert.deepEqual(buildAdvisories({ precipitationMm: 0, tempMax: 28, tempMin: 18, windKph: 5 }), []);
});

test('summarizeDay bundles risk level and advisories', () => {
  const summary = summarizeDay({ date: '2026-08-02', precipitationMm: 9, precipitationProbability: 75 });
  assert.equal(summary.riskLevel, 'moderate');
  assert.ok(summary.advisories.length > 0);
});

test('normalizeOpenMeteoDaily maps the provider payload', () => {
  const payload = {
    daily: {
      time: ['2026-10-17', '2026-10-18'],
      temperature_2m_max: [31.4, 39.8],
      temperature_2m_min: [22.1, 25.0],
      precipitation_sum: [0.2, 24.5],
      precipitation_probability_max: [12, 88],
      wind_speed_10m_max: [14.2, null],
      weather_code: [1, 65],
    },
  };

  const days = normalizeOpenMeteoDaily(payload);
  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-10-17');
  assert.equal(days[0].tempMax, 31.4);
  assert.equal(days[0].riskLevel, 'none');
  assert.equal(days[0].source, 'forecast');
  assert.equal(days[1].riskLevel, 'high');
  assert.equal(days[1].windKph, null);
  assert.equal(days[1].weatherCode, 65);

  // Unknown/missing payloads degrade to an empty list rather than throwing
  assert.deepEqual(normalizeOpenMeteoDaily({}), []);
  assert.deepEqual(normalizeOpenMeteoDaily(null), []);
});

test('seasonalNormals reflects the Indian monsoon and winter', () => {
  const monsoon = seasonalNormals(['2026-07-15'], 11.5)[0];
  assert.equal(monsoon.source, 'seasonal');
  assert.ok(['moderate', 'high'].includes(monsoon.riskLevel));
  assert.ok(monsoon.advisories.some((line) => /seasonal outlook/i.test(line)));

  const himalayanWinter = seasonalNormals(['2026-01-20'], 32)[0];
  assert.ok(himalayanWinter.tempMin != null && himalayanWinter.tempMin <= 6);

  const drySeason = seasonalNormals(['2026-11-20'], 11.5)[0];
  assert.equal(drySeason.riskLevel, 'none');

  const tropicalSummer = seasonalNormals(['2026-04-10'], 9)[0];
  assert.ok(tropicalSummer.tempMax != null && tropicalSummer.tempMax >= 36);
});

test('dateRange is inclusive, ordered and capped', () => {
  assert.deepEqual(dateRange('2026-10-17', '2026-10-19'), [
    '2026-10-17',
    '2026-10-18',
    '2026-10-19',
  ]);
  // A single day, a reversed range and an invalid start are all handled
  assert.deepEqual(dateRange('2026-10-17', '2026-10-17'), ['2026-10-17']);
  assert.deepEqual(dateRange('2026-10-19', '2026-10-17'), ['2026-10-19']);
  assert.deepEqual(dateRange('not-a-date', '2026-10-19'), []);
  assert.equal(dateRange('2026-10-01', '2026-12-31', 16).length, 16);
});

test('pickAnchor prefers the candidate closest to the reference', () => {
  const a: [number, number] = [10, 76];
  const b: [number, number] = [12, 78];
  assert.deepEqual(pickAnchor([a, b]), a);
  assert.deepEqual(pickAnchor([a, b], [12.2, 78.2]), b);
  assert.equal(pickAnchor([], a), null);
});
