import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES } from '../../schemas/itinerary.schema.js';
import {
  DIRECTORY_LANGUAGE_CODES,
  DIRECTORY_LANGUAGE_LABELS,
  DIRECTORY_LIMITS,
  DIRECTORY_SERVICE_IDS,
  DIRECTORY_SERVICE_LABELS,
  directoryCatalog,
  languageViews,
  normalizeLanguageCodes,
  normalizeServiceIds,
  normalizeTextList,
  serviceViews,
} from './taxonomy.js';

test('directory languages mirror the itinerary language list', () => {
  assert.deepEqual(
    [...DIRECTORY_LANGUAGE_CODES],
    [...SUPPORTED_LANGUAGES],
    'A language the planner can write must be a language an agency can advertise'
  );
});

test('every service and language has a unique, non-empty label', () => {
  const serviceLabels = DIRECTORY_SERVICE_IDS.map(
    (id) => DIRECTORY_SERVICE_LABELS[id]
  );
  const languageLabels = DIRECTORY_LANGUAGE_CODES.map(
    (code) => DIRECTORY_LANGUAGE_LABELS[code]
  );

  for (const labels of [serviceLabels, languageLabels]) {
    assert.ok(labels.every((label) => label.trim().length > 0));
    assert.equal(new Set(labels).size, labels.length, 'labels must not repeat');
  }
  assert.equal(serviceLabels.length, DIRECTORY_SERVICE_IDS.length);
  assert.equal(languageLabels.length, DIRECTORY_LANGUAGE_CODES.length);
});

test('text lists trim, drop empties, dedupe case-insensitively and keep order', () => {
  assert.deepEqual(
    normalizeTextList(['  Ladakh ', '', 'ladakh', 'Spiti'], {
      label: 'destinations',
      maxItems: 12,
    }),
    ['Ladakh', 'Spiti']
  );
});

test('text lists reject non-text entries, long entries and overflow', () => {
  assert.throws(
    () => normalizeTextList([1], { label: 'destinations', maxItems: 12 }),
    /must be text/
  );
  assert.throws(
    () =>
      normalizeTextList(['x'.repeat(DIRECTORY_LIMITS.listItem + 1)], {
        label: 'destinations',
        maxItems: 12,
      }),
    /under 60 characters/
  );
  assert.throws(
    () =>
      normalizeTextList(['a', 'b', 'c'], { label: 'destinations', maxItems: 2 }),
    /at most 2 destinations/
  );
  assert.throws(
    () => normalizeTextList('Ladakh', { label: 'destinations', maxItems: 12 }),
    /must be a list/
  );
});

test('service and language picks normalize to canonical order', () => {
  assert.deepEqual(normalizeServiceIds(['visa_assistance', 'custom_itineraries']), [
    'custom_itineraries',
    'visa_assistance',
  ]);
  assert.deepEqual(normalizeLanguageCodes(['ml', 'EN', 'hi']), ['en', 'hi', 'ml']);
  assert.throws(() => normalizeServiceIds(['time_travel']), /Choose services/);
  assert.throws(() => normalizeLanguageCodes(['fr']), /Choose languages/);
});

test('public views drop unknown ids instead of rendering bare slugs', () => {
  assert.deepEqual(serviceViews(['honeymoons', 'time_travel']), [
    { id: 'honeymoons', label: 'Honeymoons' },
  ]);
  assert.deepEqual(languageViews(['ta', 'fr']), [{ code: 'ta', label: 'Tamil' }]);
  assert.deepEqual(serviceViews('honeymoons'), []);
  assert.deepEqual(languageViews(null), []);
});

test('the editor catalog lists every option once, in canonical order', () => {
  const catalog = directoryCatalog();

  assert.deepEqual(
    catalog.services.map((entry) => entry.id),
    [...DIRECTORY_SERVICE_IDS]
  );
  assert.deepEqual(
    catalog.services.map((entry) => entry.label),
    DIRECTORY_SERVICE_IDS.map((id) => DIRECTORY_SERVICE_LABELS[id])
  );
  assert.deepEqual(
    catalog.languages.map((entry) => entry.code),
    [...DIRECTORY_LANGUAGE_CODES]
  );
  assert.deepEqual(
    catalog.languages.map((entry) => entry.label),
    DIRECTORY_LANGUAGE_CODES.map((code) => DIRECTORY_LANGUAGE_LABELS[code])
  );
});
