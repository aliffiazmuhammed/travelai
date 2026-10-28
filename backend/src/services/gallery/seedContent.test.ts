import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_BATCH,
  SEED_CURATORS,
  SEED_MIN_DAYS_AHEAD,
  SEED_TRIPS,
  addUtcDays,
  buildSeedTrips,
  nextUtcMonthDay,
  seedTripTags,
  startOfUtcDay,
} from './seedContent.js';
import { RESERVED_HANDLES } from '../user/profile.js';
import { normalizeGalleryTags } from './publish.js';

/**
 * Launch seed content (Milestone 8 G3 gate). The gallery nav entry unlocks at
 * five public trips, so the seed is a product requirement, not sample data:
 * these tests pin the invariants the seed script relies on before it touches
 * the database.
 */

const HANDLE_PATTERN = /^[a-z0-9_]+$/;

test('the seed ships at least the five trips the gallery gate needs', () => {
  assert.ok(SEED_TRIPS.length >= 5, `expected >= 5 trips, got ${SEED_TRIPS.length}`);
});

test('curators are unique, addressable and safe to publish under', () => {
  const keys = new Set<string>();
  const handles = new Set<string>();
  const emails = new Set<string>();

  for (const curator of SEED_CURATORS) {
    assert.ok(curator.key, 'curator key is required');
    assert.ok(!keys.has(curator.key), `duplicate curator key: ${curator.key}`);
    keys.add(curator.key);

    assert.match(curator.handle, HANDLE_PATTERN);
    assert.ok(curator.handle.length >= 3 && curator.handle.length <= 24);
    assert.ok(!RESERVED_HANDLES.has(curator.handle), `${curator.handle} is reserved`);
    assert.ok(!handles.has(curator.handle), `duplicate handle: ${curator.handle}`);
    handles.add(curator.handle);

    assert.match(curator.email, /@gallery-seed\.travelai\.invalid$/);
    assert.ok(!emails.has(curator.email), `duplicate email: ${curator.email}`);
    emails.add(curator.email);

    assert.ok(curator.name.trim().length > 0);
    assert.ok(curator.bio.trim().length <= 280);
    assert.match(curator.bio, /Curated by the TravelAI team/);
  }
});

test('every trip is fully formed and inside the publish limits', () => {
  const tripKeys = new Set<string>();
  const curatorKeys = new Set(SEED_CURATORS.map((curator) => curator.key));
  const usedCurators = new Set<string>();

  for (const trip of SEED_TRIPS) {
    assert.ok(!tripKeys.has(trip.key), `duplicate trip key: ${trip.key}`);
    tripKeys.add(trip.key);

    assert.ok(curatorKeys.has(trip.curatorKey), `${trip.key} names an unknown curator`);
    usedCurators.add(trip.curatorKey);

    assert.ok(trip.title.trim().length > 0);
    assert.ok(trip.destination.trim().length > 0);

    const summary = trip.summary.trim();
    assert.ok(summary.length > 0, `${trip.key} needs a summary`);
    assert.ok(summary.length <= 280, `${trip.key} summary exceeds 280 characters`);

    const tags = seedTripTags(trip);
    assert.ok(tags.length >= 1 && tags.length <= 6, `${trip.key} must carry 1–6 tags`);
    assert.deepEqual(tags, normalizeGalleryTags(trip.tags));
  }

  assert.deepEqual(
    [...usedCurators].sort(),
    [...curatorKeys].sort(),
    'every curator should own at least one trip'
  );
});

test('itineraries match their declared duration and flow day by day', () => {
  for (const trip of SEED_TRIPS) {
    const details = trip.tripDetails;
    const days = details.day_by_day_itinerary;

    assert.equal(details.duration_days, days.length, `${trip.key} duration mismatch`);
    assert.ok(details.duration_days >= 3, `${trip.key} is too short to be a gallery trip`);
    assert.ok(details.trip_title.trim().length > 0);
    assert.ok(details.destination.trim().length > 0);
    assert.ok(details.highlights.length > 0);

    days.forEach((day, index) => {
      assert.equal(day.day, index + 1, `${trip.key} day numbering drifts at index ${index}`);
      assert.ok(day.title.trim().length > 0, `${trip.key} day ${day.day} needs a title`);
      assert.ok(day.activities.length >= 1, `${trip.key} day ${day.day} has no activities`);
      for (const entry of day.activities) {
        assert.ok(entry.name.trim().length > 0);
      }
    });
  }
});

test('budget breakdowns add up to the advertised per-person budget', () => {
  for (const trip of SEED_TRIPS) {
    const breakdown = trip.tripDetails.budget_breakdown;
    const sum =
      breakdown.accommodation +
      breakdown.food_and_drinks +
      breakdown.activities_and_entry +
      breakdown.local_transport +
      breakdown.miscellaneous_buffer;

    assert.equal(sum, breakdown.total, `${trip.key} budget parts do not sum to total`);
    assert.equal(
      breakdown.total,
      trip.tripDetails.budget_per_person,
      `${trip.key} total differs from budget_per_person`
    );
    assert.ok(breakdown.miscellaneous_buffer >= 0);
  }
});

test('the collection mixes exact, hidden and date-less listings', () => {
  assert.ok(
    SEED_TRIPS.some((trip) => trip.startMonthDay !== null && trip.hideExactDates),
    'at least one trip should hide its exact dates'
  );
  assert.ok(
    SEED_TRIPS.some((trip) => trip.startMonthDay !== null && !trip.hideExactDates),
    'at least one trip should show its exact dates'
  );
  assert.ok(
    SEED_TRIPS.some((trip) => trip.startMonthDay === null),
    'a date-less trip keeps the gallery populated between seasons'
  );
});

test('date anchors are valid, month-safe calendar days', () => {
  for (const trip of SEED_TRIPS) {
    if (!trip.startMonthDay) continue;
    const { month, day } = trip.startMonthDay;
    assert.ok(month >= 1 && month <= 12, `${trip.key} month is out of range`);
    // Capped at 28 so the anchor exists in every month, including February.
    assert.ok(day >= 1 && day <= 28, `${trip.key} day must be 1–28`);
  }
});

test('buildSeedTrips derives deterministic dates from the next month/day occurrence', () => {
  const base = new Date('2026-10-28T14:37:12.000Z');
  const built = buildSeedTrips(base);
  const again = buildSeedTrips(base);
  const midnight = startOfUtcDay(base);

  assert.equal(built.length, SEED_TRIPS.length);
  assert.equal(midnight.toISOString(), '2026-10-28T00:00:00.000Z');

  built.forEach((trip, index) => {
    const source = SEED_TRIPS[index];
    assert.equal(trip.key, source.key);
    assert.equal(String(trip.startDate ?? ''), String(again[index].startDate ?? ''));

    if (source.startMonthDay === null) {
      assert.equal(trip.startDate, undefined);
      assert.equal(trip.endDate, undefined);
      return;
    }

    assert.ok(trip.startDate instanceof Date);
    assert.ok(trip.endDate instanceof Date);
    assert.equal(trip.startDate.getUTCMonth() + 1, source.startMonthDay.month);
    assert.equal(trip.startDate.getUTCDate(), source.startMonthDay.day);
    assert.equal(trip.startDate.getUTCHours(), 0);
    assert.ok(trip.startDate.getTime() >= midnight.getTime());
    // Long enough that the seed cannot fall out of the gallery the week after.
    assert.ok(
      trip.startDate.getTime() >= addUtcDays(midnight, SEED_MIN_DAYS_AHEAD).getTime(),
      `${trip.key} starts too soon to stay listed`
    );
    assert.equal(
      trip.endDate.toISOString(),
      addUtcDays(trip.startDate, source.tripDetails.duration_days - 1).toISOString()
    );
  });
});

test('nextUtcMonthDay rolls a near anchor to next year and keeps a distant one', () => {
  const base = new Date('2026-10-28T14:37:12.000Z');

  assert.equal(
    nextUtcMonthDay(base, 10, 27).toISOString(),
    '2027-10-27T00:00:00.000Z',
    'a date earlier this year belongs to next year'
  );
  assert.equal(
    nextUtcMonthDay(base, 10, 28).toISOString(),
    '2027-10-28T00:00:00.000Z',
    'a start inside the 30-day horizon rolls to next year'
  );
  assert.equal(
    nextUtcMonthDay(base, 11, 2).toISOString(),
    '2027-11-02T00:00:00.000Z',
    'this year but too soon still rolls'
  );
  assert.equal(
    nextUtcMonthDay(base, 12, 1).toISOString(),
    '2026-12-01T00:00:00.000Z',
    'more than 30 days out stays in the current year'
  );
  assert.equal(
    nextUtcMonthDay(base, 4, 10).toISOString(),
    '2027-04-10T00:00:00.000Z'
  );
});

test('the seed batch tag is stable so a re-run replaces its own rows', () => {
  assert.equal(SEED_BATCH, 'm8-gallery-launch');
});
