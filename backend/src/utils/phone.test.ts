import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPhone,
  isPhoneNumber,
  parsePhoneNumber,
  PHONE_FORMAT_MESSAGE,
} from './phone.js';

/**
 * Phone numbers are stored in E.164. The rule table only has to answer two
 * questions at the boundary: does this belong to a country we support, and is
 * the national part the length that country actually issues?
 */

test('a national number is canonicalised to E.164', () => {
  assert.equal(parsePhoneNumber('+91 98765 43210')?.e164, '+919876543210');
  assert.equal(parsePhoneNumber('+1 (415) 555-2671')?.e164, '+14155552671');
  assert.equal(parsePhoneNumber('+44 7911 123456')?.e164, '+447911123456');
  assert.equal(parsePhoneNumber('+971 50 123 4567')?.e164, '+971501234567');
});

test('formatting and a national trunk zero are dropped', () => {
  assert.equal(parsePhoneNumber('  +91.98765.43210  ')?.e164, '+919876543210');
  assert.equal(parsePhoneNumber('+91 098765 43210')?.e164, '+919876543210');
  assert.equal(parsePhoneNumber('+33 06 12 34 56 78')?.e164, '+33612345678');
});

test('every supported country carries its own national length', () => {
  const india = parsePhoneNumber('+91 98765 43210');
  assert.equal(india?.country.iso, 'IN');
  assert.equal(parsePhoneNumber('+65 8123 4567')?.country.iso, 'SG');
  assert.equal(parsePhoneNumber('+61 412 345 678')?.country.iso, 'AU');
  // Countries that issue more than one length accept each of them.
  assert.ok(parsePhoneNumber('+81 90 1234 5678'));
  assert.ok(parsePhoneNumber('+49 1512 3456789'));
});

test('a missing country code is refused', () => {
  assert.equal(parsePhoneNumber('9876543210'), null);
  assert.equal(parsePhoneNumber('(022) 1234-5678'), null);
  assert.equal(parsePhoneNumber(''), null);
  assert.equal(parsePhoneNumber(null), null);
  assert.equal(parsePhoneNumber(9876543210 as unknown as string), null);
});

test('a national part of the wrong length is refused', () => {
  assert.equal(parsePhoneNumber('+91 98765 4321'), null);
  assert.equal(parsePhoneNumber('+91 98765 432100'), null);
  assert.equal(parsePhoneNumber('+65 8123 45678'), null);
});

test('an unsupported dialling code is refused rather than guessed', () => {
  assert.equal(parsePhoneNumber('+999 123456789'), null);
  assert.equal(parsePhoneNumber('+0 123456789'), null);
});

test('canonicalPhone is the thin string/null wrapper', () => {
  assert.equal(canonicalPhone('+91 98765 43210'), '+919876543210');
  assert.equal(canonicalPhone('call me'), null);
  assert.equal(isPhoneNumber('+91 98765 43210'), true);
  assert.equal(isPhoneNumber('9876543210'), false);
});

test('the shared message names an example in E.164', () => {
  assert.match(PHONE_FORMAT_MESSAGE, /\+91 98765 43210/);
});
