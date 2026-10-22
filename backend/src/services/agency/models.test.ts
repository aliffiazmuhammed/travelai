import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyInvite from '../../models/AgencyInvite.js';

/**
 * Structural tenancy guarantees that must not depend on a live database:
 * - one person can join an agency at most once;
 * - invite tokens are unique at rest and expire automatically;
 * - invite roles cannot be `owner`.
 */

test('AgencyMember has a unique (agencyId, userId) index', () => {
  const indexes = AgencyMember.schema.indexes();
  const uniqueMembership = indexes.find(
    ([keys, options]) =>
      keys.agencyId === 1 && keys.userId === 1 && options?.unique === true
  );
  assert.ok(uniqueMembership, 'the compound membership index must be unique');
});

test('AgencyInvite stores a unique token hash and expires via TTL', () => {
  const indexes = AgencyInvite.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) => keys.tokenHash === 1 && options?.unique === true
    ),
    'tokenHash must be unique'
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.expiresAt === 1 && options?.expireAfterSeconds === 0
    ),
    'expired invites must be removed by the TTL index'
  );
});

test('AgencyInvite role validator rejects owner', async () => {
  const invite = new AgencyInvite({
    agencyId: 'a'.repeat(24),
    tokenHash: 'b'.repeat(64),
    tokenHint: 'abc123',
    role: 'owner',
    kind: 'link',
    createdBy: 'c'.repeat(24),
    expiresAt: new Date(Date.now() + 60_000),
    maxUses: 1,
    acceptedBy: [],
  });

  let error: any = null;
  try {
    await invite.validate();
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'owner must fail validation');
  assert.ok(error.errors?.role, 'the role path must be the failure');
});
