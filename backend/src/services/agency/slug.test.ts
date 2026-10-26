import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENCY_SLUG_MAX,
  allocateAgencySlug,
  slugifyAgencyName,
} from './slug.js';

test('agency slugs are lowercase, accent-free and dash-separated', () => {
  assert.equal(slugifyAgencyName('Café Voyages & Co.'), 'cafe-voyages-co');
  assert.equal(slugifyAgencyName('  Acme   Travel  '), 'acme-travel');
  assert.equal(slugifyAgencyName('!!!'), '');
});

test('slugs stay inside the 3..40 character schema window', () => {
  const long = slugifyAgencyName('a'.repeat(80));
  assert.equal(long.length, AGENCY_SLUG_MAX);
  assert.equal(slugifyAgencyName('ab'), '');
});

test('collisions get a numeric suffix inside the limit', () => {
  assert.equal(allocateAgencySlug('Acme'), 'acme');
  assert.equal(allocateAgencySlug('Acme', ['acme']), 'acme-2');
  assert.equal(allocateAgencySlug('Acme', ['acme', 'acme-2']), 'acme-3');

  const base = 'b'.repeat(AGENCY_SLUG_MAX);
  const collided = allocateAgencySlug(base, [base]);
  assert.equal(collided.length <= AGENCY_SLUG_MAX, true);
  assert.match(collided, /-2$/);
});

test('a nameless agency still gets a usable slug', () => {
  assert.equal(allocateAgencySlug(''), 'agency');
  assert.equal(allocateAgencySlug('', ['agency']), 'agency-2');
});
