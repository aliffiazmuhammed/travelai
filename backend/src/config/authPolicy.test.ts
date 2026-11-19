import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_PRIVACY_VERSION,
  AUTH_TERMS_VERSION,
  consentProblem,
  consentRecord,
} from './authPolicy.js';
import { signupSchema } from '../schemas/auth.schema.js';

/**
 * Phase 1B consent rules. These are pure decisions: the rollout shape (old
 * clients may omit consent while enforcement is off) and the evidence written
 * to the account. The route wiring and persistence are covered by the realm
 * coverage test and the smoke checks.
 */

test('consentProblem: an old client may omit consent while enforcement is off', () => {
  assert.equal(consentProblem(undefined, false), null);
});

test('consentProblem: enforcement requires the acknowledgement', () => {
  assert.equal(consentProblem(undefined, true), 'missing');
});

test('consentProblem: current versions pass', () => {
  assert.equal(
    consentProblem(
      {
        termsVersion: AUTH_TERMS_VERSION,
        privacyVersion: AUTH_PRIVACY_VERSION,
      },
      true
    ),
    null
  );
});

test('consentProblem: a stale terms or privacy version is rejected', () => {
  assert.equal(
    consentProblem(
      { termsVersion: '2020-01-01', privacyVersion: AUTH_PRIVACY_VERSION },
      false
    ),
    'stale-terms'
  );
  assert.equal(
    consentProblem(
      { termsVersion: AUTH_TERMS_VERSION, privacyVersion: '2020-01-01' },
      false
    ),
    'stale-privacy'
  );
});

test('consentRecord: stores server time and treats marketing as opt-in only', () => {
  const before = Date.now();
  const record = consentRecord({
    termsVersion: AUTH_TERMS_VERSION,
    privacyVersion: AUTH_PRIVACY_VERSION,
  });

  assert.equal(record.acceptedTermsVersion, AUTH_TERMS_VERSION);
  assert.equal(record.acceptedPrivacyVersion, AUTH_PRIVACY_VERSION);
  assert.equal(record.marketingOptIn, false);
  assert.ok(record.acceptedAt instanceof Date);
  assert.ok(record.acceptedAt.getTime() >= before);

  const optedIn = consentRecord({
    termsVersion: AUTH_TERMS_VERSION,
    privacyVersion: AUTH_PRIVACY_VERSION,
    marketingOptIn: true,
  });
  assert.equal(optedIn.marketingOptIn, true);
});

test('signupSchema: consent is optional, versioned and trimmed', () => {
  const withoutConsent = signupSchema.safeParse({
    email: 'ada@example.com',
    password: 'correct horse battery staple',
  });
  assert.equal(withoutConsent.success, true);

  const withConsent = signupSchema.safeParse({
    email: 'ada@example.com',
    password: 'correct horse battery staple',
    consent: {
      termsVersion: `  ${AUTH_TERMS_VERSION}  `,
      privacyVersion: AUTH_PRIVACY_VERSION,
      marketingOptIn: true,
    },
  });
  assert.equal(withConsent.success, true);
  if (withConsent.success) {
    assert.equal(withConsent.data.consent?.termsVersion, AUTH_TERMS_VERSION);
    assert.equal(withConsent.data.consent?.marketingOptIn, true);
  }
});

test('signupSchema: a half-filled consent payload is rejected', () => {
  const missingPrivacy = signupSchema.safeParse({
    email: 'ada@example.com',
    password: 'correct horse battery staple',
    consent: { termsVersion: AUTH_TERMS_VERSION },
  });
  assert.equal(missingPrivacy.success, false);

  const wrongMarketingType = signupSchema.safeParse({
    email: 'ada@example.com',
    password: 'correct horse battery staple',
    consent: {
      termsVersion: AUTH_TERMS_VERSION,
      privacyVersion: AUTH_PRIVACY_VERSION,
      marketingOptIn: 'yes',
    },
  });
  assert.equal(wrongMarketingType.success, false);
});
