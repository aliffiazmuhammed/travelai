import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agencyApplicationListQuerySchema,
  rejectAgencyApplicationSchema,
  submitAgencyApplicationSchema,
} from '../../schemas/agencyApplications.schema.js';
import {
  normalizeApplicationEmail,
  normalizeApplicationName,
  normalizeApplicationNote,
  normalizeApplicationPhone,
} from './applications.js';

/**
 * PA6 policy: the public application form is an anonymous write, so its shape
 * walls and the phone/email/name normalisation are tested without a database.
 * Approval itself is `provisionAgency`, whose behaviour is already pinned by
 * `provisioning.test.ts` — this flow adds no second provisioning path.
 */

test('a phone number is accepted with local formatting and stored as typed', () => {
  assert.equal(normalizeApplicationPhone('+91 98765 43210'), '+91 98765 43210');
  assert.equal(normalizeApplicationPhone('(022) 1234-5678'), '(022) 1234-5678');
  assert.equal(normalizeApplicationPhone('  9876543210  '), '9876543210');
});

test('a phone number without 7 to 15 digits is refused', () => {
  assert.throws(() => normalizeApplicationPhone(''), /phone number/);
  assert.throws(() => normalizeApplicationPhone('123456'), /7 to 15 digits/);
  assert.throws(() => normalizeApplicationPhone('1234567890123456'), /7 to 15 digits/);
  assert.throws(() => normalizeApplicationPhone('call me'), /digits/);
});

test('agency names are collapsed and bounded', () => {
  assert.equal(normalizeApplicationName('  Blue   Horizon   Travels '), 'Blue Horizon Travels');
  assert.throws(() => normalizeApplicationName('A'), /2 to 80/);
  assert.throws(() => normalizeApplicationName('x'.repeat(81)), /2 to 80/);
});

test('emails are lowercased and length-checked', () => {
  assert.equal(normalizeApplicationEmail('  Ops@Agency.IN '), 'ops@agency.in');
  assert.throws(() => normalizeApplicationEmail(''), /email address/);
  assert.throws(() => normalizeApplicationEmail(`${'a'.repeat(151)}@agency.in`), /160/);
});

test('the optional note is trimmed and capped', () => {
  assert.equal(normalizeApplicationNote('  Backpacking in Himachal  '), 'Backpacking in Himachal');
  assert.equal(normalizeApplicationNote(undefined), '');
  assert.equal(normalizeApplicationNote('x'.repeat(700)).length, 600);
});

test('the public form accepts the three fields plus an optional note', () => {
  const parsed = submitAgencyApplicationSchema.parse({
    name: 'Blue Horizon Travels',
    phone: '+91 98765 43210',
    email: 'Ops@Agency.IN',
    note: 'Honeymoons and small group treks.',
  });
  assert.equal(parsed.email, 'ops@agency.in');
  assert.equal(parsed.note, 'Honeymoons and small group treks.');
});

test('the public form rejects unknown keys, bad emails and long notes', () => {
  assert.throws(() =>
    submitAgencyApplicationSchema.parse({
      name: 'Blue Horizon',
      phone: '9876543210',
      email: 'ops@agency.in',
      role: 'owner',
    })
  );
  assert.throws(() =>
    submitAgencyApplicationSchema.parse({
      name: 'Blue Horizon',
      phone: '9876543210',
      email: 'not-an-email',
    })
  );
  assert.throws(() =>
    submitAgencyApplicationSchema.parse({
      name: 'Blue Horizon',
      phone: '9876543210',
      email: 'ops@agency.in',
      note: 'x'.repeat(601),
    })
  );
});

test('the honeypot is part of the accepted shape so the service can swallow it', () => {
  const parsed = submitAgencyApplicationSchema.parse({
    name: 'Blue Horizon',
    phone: '9876543210',
    email: 'ops@agency.in',
    website: 'https://spam.example',
  });
  assert.equal(parsed.website, 'https://spam.example');
});

test('the review queue defaults to pending and refuses unknown statuses', () => {
  const defaults = agencyApplicationListQuerySchema.parse({});
  assert.equal(defaults.status, 'pending');
  assert.equal(defaults.page, 1);
  assert.equal(defaults.limit, 25);

  const all = agencyApplicationListQuerySchema.parse({ status: 'all', q: ' blue ', page: '2' });
  assert.equal(all.status, 'all');
  assert.equal(all.q, 'blue');
  assert.equal(all.page, 2);

  assert.throws(() => agencyApplicationListQuerySchema.parse({ status: 'archived' }));
});

test('a rejection note is optional and bounded', () => {
  assert.equal(rejectAgencyApplicationSchema.parse({}).note, '');
  assert.equal(rejectAgencyApplicationSchema.parse({ note: '  Duplicate of an existing agency ' }).note, 'Duplicate of an existing agency');
  assert.throws(() => rejectAgencyApplicationSchema.parse({ note: 'x'.repeat(501) }));
  assert.throws(() => rejectAgencyApplicationSchema.parse({ reason: 'typo' }));
});
