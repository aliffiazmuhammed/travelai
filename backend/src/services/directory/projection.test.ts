import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTORY_CARD_KEYS,
  DIRECTORY_PACKAGE_KEYS,
  DIRECTORY_PROFILE_KEYS,
  projectDirectoryListingCard,
  projectDirectoryPackage,
  projectDirectoryProfile,
} from './projection.js';

/**
 * Milestone 9 D1 — the public directory payload. These assertions pin the
 * allow-list itself, so a future field can only become public by editing this
 * test on purpose.
 */

function agency(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'agency-object-id',
    slug: 'hills-and-horizons',
    name: 'Hills & Horizons Travel',
    status: 'active',
    createdBy: 'creator-user-id',
    plan: { tierId: 'pro' },
    billing: { notes: 'private billing note' },
    gstin: '27AABCH1234C1Z5',
    branding: {
      logoUrl: 'https://cdn.example.com/logo.png',
      website: 'https://hills.example.com',
      contactEmail: 'desk@hills.example.com',
      contactPhone: '+91 98765 43210',
      address: '12 Hill Road, Pune',
    },
    ...overrides,
  };
}

function profile(overrides: Record<string, unknown> = {}): any {
  return {
    agencyId: 'agency-object-id',
    state: 'published',
    about: 'Small-group treks and slow road trips across the western ghats.',
    baseCity: 'Pune',
    destinations: ['Maharashtra', 'Karnataka'],
    specialties: ['Western ghats', 'Monsoon road trips'],
    services: ['custom_itineraries', 'adventure'],
    languages: ['en', 'hi', 'mr'],
    showPhone: false,
    showGstin: false,
    publishedAt: new Date('2026-11-02T09:30:00.000Z'),
    verifiedAt: null,
    moderation: { hiddenAt: null },
    ...overrides,
  };
}

test('the public projection exposes exactly the allow-listed keys', () => {
  const view = projectDirectoryProfile({ agency: agency(), profile: profile() });
  assert.deepEqual(Object.keys(view).sort(), [...DIRECTORY_PROFILE_KEYS].sort());
});

test('tenant internals never reach the public payload', () => {
  const view = projectDirectoryProfile({ agency: agency(), profile: profile() });
  const serialized = JSON.stringify(view);

  for (const secret of [
    'agency-object-id',
    'creator-user-id',
    'private billing note',
    'desk@hills.example.com',
    '12 Hill Road',
    '27AABCH1234C1Z5',
    'moderation',
  ]) {
    assert.ok(
      !serialized.includes(secret),
      `the payload must not contain ${secret}`
    );
  }
});

test('phone and GSTIN stay hidden until the agency opts in', () => {
  const hidden = projectDirectoryProfile({ agency: agency(), profile: profile() });
  assert.equal(hidden.contactPhone, null);
  assert.equal(hidden.gstin, null);

  const shown = projectDirectoryProfile({
    agency: agency(),
    profile: profile({ showPhone: true, showGstin: true }),
  });
  assert.equal(shown.contactPhone, '+91 98765 43210');
  assert.equal(shown.gstin, '27AABCH1234C1Z5');
});

test('services and languages render labels and drop unknown ids', () => {
  const view = projectDirectoryProfile({
    agency: agency(),
    profile: profile({
      services: ['adventure', 'not_a_service', 'custom_itineraries'],
      languages: ['hi', 'en', 'xx'],
    }),
  });

  assert.deepEqual(view.services, [
    { id: 'custom_itineraries', label: 'Custom itineraries' },
    { id: 'adventure', label: 'Adventure & trekking' },
  ]);
  assert.deepEqual(view.languages, [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
  ]);
});

test('verified follows verifiedAt and dates are ISO strings', () => {
  const unverified = projectDirectoryProfile({ agency: agency(), profile: profile() });
  assert.equal(unverified.verified, false);
  assert.equal(unverified.publishedAt, '2026-11-02T09:30:00.000Z');

  const verified = projectDirectoryProfile({
    agency: agency(),
    profile: profile({ verifiedAt: new Date('2026-11-03T10:00:00.000Z') }),
  });
  assert.equal(verified.verified, true);
});

test('the reply time is withheld until a computed positive value arrives', () => {
  const hidden = projectDirectoryProfile({ agency: agency(), profile: profile() });
  assert.equal(hidden.replyTimeHours, null);

  const shown = projectDirectoryProfile({
    agency: agency(),
    profile: profile(),
    replyTimeHours: 6,
  });
  assert.equal(shown.replyTimeHours, 6);

  const zero = projectDirectoryProfile({
    agency: agency(),
    profile: profile(),
    replyTimeHours: 0,
  });
  assert.equal(zero.replyTimeHours, null);
});

test('a missing publish date stays null instead of inventing one', () => {
  const view = projectDirectoryProfile({
    agency: agency(),
    profile: profile({ publishedAt: null }),
  });
  assert.equal(view.publishedAt, null);
});

test('the public logo points at the slug-addressed route, not the tenant asset', () => {
  const view = projectDirectoryProfile({ agency: agency(), profile: profile() });
  assert.equal(view.logoUrl, '/api/agencies/hills-and-horizons/logo');
  assert.ok(
    !JSON.stringify(view).includes('/api/agency/'),
    'the authenticated asset route must never reach a stranger'
  );

  const withoutLogo = projectDirectoryProfile({
    agency: agency({ branding: { website: 'https://hills.example.com' } }),
    profile: profile(),
  });
  assert.equal(withoutLogo.logoUrl, null);
});

test('a listing card exposes exactly the card allow-list', () => {
  const card = projectDirectoryListingCard({
    agency: agency(),
    profile: profile({ services: ['adventure'], languages: ['hi'] }),
  });

  assert.deepEqual(Object.keys(card).sort(), [...DIRECTORY_CARD_KEYS].sort());
  assert.deepEqual(card, {
    slug: 'hills-and-horizons',
    name: 'Hills & Horizons Travel',
    baseCity: 'Pune',
    specialties: ['Western ghats', 'Monsoon road trips'],
    services: [{ id: 'adventure', label: 'Adventure & trekking' }],
    logoUrl: '/api/agencies/hills-and-horizons/logo',
    verified: false,
    fromPricePerPerson: null,
    currency: 'INR',
  });

  const serialized = JSON.stringify(card);
  for (const secret of ['agency-object-id', '27AABCH1234C1Z5', 'about']) {
    assert.ok(!serialized.includes(secret), `the card must not contain ${secret}`);
  }
});

test('a card carries the lowest published price, or null on request', () => {
  const priced = projectDirectoryListingCard({
    agency: agency(),
    profile: profile(),
    lowestPrice: { price: 42000, currency: 'INR' },
  });
  assert.equal(priced.fromPricePerPerson, 42000);
  assert.equal(priced.currency, 'INR');

  const onRequest = projectDirectoryListingCard({
    agency: agency(),
    profile: profile(),
    lowestPrice: null,
  });
  assert.equal(onRequest.fromPricePerPerson, null);
  assert.equal(onRequest.currency, 'INR');
});

function packageRow(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'package-object-id',
    agencyId: 'agency-object-id',
    tripId: 'trip-object-id',
    title: '  Western ghats in the monsoon  ',
    summary: ' Five nights of waterfalls and slow roads. ',
    nights: 5,
    fromPricePerPerson: 42000,
    currency: 'INR',
    coverAssetId: 'cover-asset-id',
    highlights: ['Kaas plateau', 'Lonavala', '  ', 'Malshej'],
    inclusions: ['Stay', 'Breakfast', 'Guide'],
    state: 'published',
    publishedAt: new Date('2026-11-04T08:00:00.000Z'),
    ...overrides,
  };
}

test('a package exposes exactly the package allow-list', () => {
  const view = projectDirectoryPackage(packageRow(), 'hills-and-horizons');
  assert.deepEqual(Object.keys(view).sort(), [...DIRECTORY_PACKAGE_KEYS].sort());
  assert.deepEqual(view, {
    id: 'package-object-id',
    title: 'Western ghats in the monsoon',
    summary: 'Five nights of waterfalls and slow roads.',
    nights: 5,
    pricePerPerson: 42000,
    currency: 'INR',
    coverUrl:
      '/api/agencies/hills-and-horizons/packages/package-object-id/cover',
    highlights: ['Kaas plateau', 'Lonavala', 'Malshej'],
    inclusions: ['Stay', 'Breakfast', 'Guide'],
  });

  const serialized = JSON.stringify(view);
  for (const secret of ['trip-object-id', 'cover-asset-id', 'agency-object-id']) {
    assert.ok(
      !serialized.includes(secret),
      `the package must not contain ${secret}`
    );
  }
});

test('an unpriced package says "on request" and a missing cover stays null', () => {
  const view = projectDirectoryPackage(
    packageRow({ fromPricePerPerson: null, coverAssetId: null }),
    'hills-and-horizons'
  );
  assert.equal(view.pricePerPerson, null);
  assert.equal(view.coverUrl, null);
});

test('a package clamps nights and list lengths instead of trusting the row', () => {
  const view = projectDirectoryPackage(
    packageRow({
      nights: -3,
      highlights: Array.from({ length: 9 }, (_, index) => `Highlight ${index + 1}`),
      inclusions: Array.from({ length: 20 }, (_, index) => `Inclusion ${index + 1}`),
    }),
    'hills-and-horizons'
  );
  assert.equal(view.nights, 0);
  assert.equal(view.highlights.length, 6);
  assert.equal(view.inclusions.length, 12);
});

test('a profile joins its published packages with public cover URLs', () => {
  const view = projectDirectoryProfile({
    agency: agency(),
    profile: profile(),
    packages: [packageRow()],
  });

  assert.equal(view.packages.length, 1);
  assert.equal(view.packages[0].title, 'Western ghats in the monsoon');
  assert.equal(
    view.packages[0].coverUrl,
    '/api/agencies/hills-and-horizons/packages/package-object-id/cover'
  );
  assert.ok(!JSON.stringify(view).includes('/api/agency/'));
});
