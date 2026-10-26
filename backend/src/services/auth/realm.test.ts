import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import {
  ALL_SESSION_COOKIES,
  SESSION_COOKIES,
  signRealmToken,
  signSessionForAccount,
  verifyRealmToken,
} from './realm.js';

/**
 * PA0 realm token contract. The realm claim, tenant claim and version are what
 * every guard trusts after signature verification, so their shape is pinned
 * here without a database.
 */

test('each realm has its own cookie and all three are CSRF targets', () => {
  assert.deepEqual(SESSION_COOKIES, {
    personal: 'token',
    agency: 'agency_token',
    platform: 'platform_token',
  });
  assert.deepEqual([...ALL_SESSION_COOKIES].sort(), [
    'agency_token',
    'platform_token',
    'token',
  ]);
});

test('agency tokens carry the tenant and the account version', () => {
  const token = signRealmToken({
    userId: 'u1',
    realm: 'agency',
    agencyId: 'a1',
    tokenVersion: 4,
  });
  assert.deepEqual(verifyRealmToken(token), {
    userId: 'u1',
    realm: 'agency',
    agencyId: 'a1',
    ver: 4,
  });
});

test('platform tokens require the super_admin role', () => {
  const token = signRealmToken({
    userId: 'p1',
    realm: 'platform',
    role: 'super_admin',
  });
  assert.deepEqual(verifyRealmToken(token), {
    userId: 'p1',
    realm: 'platform',
    role: 'super_admin',
    ver: 0,
  });
});

test('legacy personal tokens are treated as realm personal, version 0', () => {
  const legacy = jwt.sign({ userId: 'legacy-user' }, env.JWT_SECRET, {
    expiresIn: '1h',
  });
  assert.deepEqual(verifyRealmToken(legacy), {
    userId: 'legacy-user',
    realm: 'personal',
    ver: 0,
  });
});

test('an agency token without a tenant is rejected', () => {
  const malformed = jwt.sign(
    { userId: 'u1', realm: 'agency' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  assert.throws(() => verifyRealmToken(malformed), /missing its tenant/);
});

test('a platform token without super_admin is rejected', () => {
  const malformed = jwt.sign(
    { userId: 'p1', realm: 'platform', role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  assert.throws(() => verifyRealmToken(malformed), /platform role/);
});

test('signSessionForAccount derives realm claims from the account', () => {
  const agency = verifyRealmToken(
    signSessionForAccount(
      { _id: 'u1', tokenVersion: 2, agencyId: 'a1' },
      'agency'
    )
  );
  assert.equal(agency.realm, 'agency');
  assert.equal(agency.agencyId, 'a1');
  assert.equal(agency.ver, 2);

  const personal = verifyRealmToken(
    signSessionForAccount({ _id: 'p1', tokenVersion: 1 }, 'personal')
  );
  assert.equal(personal.realm, 'personal');
  assert.equal(personal.agencyId, undefined);
});
