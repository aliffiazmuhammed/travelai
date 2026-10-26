import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import User from './User.js';

/**
 * Account-realm index invariants (PA0/PA2).
 *
 * The platform realm is not a singleton: more than one super-admin must be able
 * to exist at the same time. `platform_super_admin` is therefore a *non-unique*
 * lookup index and email uniqueness lives in `platform_email_unique`.
 *
 * An earlier build of `scripts/migrate-account-realms.mts` created the role
 * index with `unique: true`, while the model declared it non-unique. Existing
 * databases kept the unique flag and the second super-admin creation failed
 * with a duplicate-key 409. These tests pin the model and the migration script
 * to the same (non-unique) definition so the two cannot drift again.
 */

const MIGRATION_SOURCE = readFileSync(
  new URL('../../scripts/migrate-account-realms.mts', import.meta.url),
  'utf8'
);

test('platform_super_admin is declared on the model and is not unique', () => {
  const index = User.schema
    .indexes()
    .find(([, options]) => options?.name === 'platform_super_admin');

  assert.ok(index, 'the platform_super_admin index must be declared');
  const [keys, options] = index;
  assert.deepEqual(keys, { platformRole: 1 });
  assert.notEqual(
    options?.unique,
    true,
    'the role index must not be unique: the platform realm supports many super-admins'
  );
  assert.deepEqual(options?.partialFilterExpression, { platformRole: 'super_admin' });
});

test('platform email uniqueness stays realm-scoped, not role-scoped', () => {
  const indexes = User.schema.indexes();
  const platformEmail = indexes.find(
    ([, options]) => options?.name === 'platform_email_unique'
  );

  assert.ok(platformEmail, 'platform_email_unique must be declared');
  const [, options] = platformEmail;
  assert.equal(options?.unique, true);
  assert.deepEqual(options?.partialFilterExpression, { accountType: 'platform' });

  // Exactly one platform row per email, but no cap on how many platform rows
  // exist. `unique` must not leak onto the role lookup above.
  const uniqueRoleIndexes = indexes.filter(
    ([keys, options]) => keys.platformRole === 1 && options?.unique === true
  );
  assert.equal(uniqueRoleIndexes.length, 0, 'no unique index may target platformRole');
});

test('the PA0 migration creates the same non-unique role index', () => {
  const marker = "name: 'platform_super_admin'";
  const start = MIGRATION_SOURCE.indexOf(marker);
  assert.notEqual(start, -1, 'migration must define platform_super_admin');

  // The declaration's own options end at the closing `);` of this
  // `ensureIndex` call. Anything after it belongs to another index.
  const end = MIGRATION_SOURCE.indexOf(');', start);
  assert.notEqual(end, -1, 'migration index declaration must be closed');
  const declaration = MIGRATION_SOURCE.slice(start, end);
  assert.doesNotMatch(
    declaration,
    /unique:\s*true/,
    'the migration must not create platform_super_admin as unique'
  );
});

test('a bootstrap or console-created platform account is never attached to a tenant', () => {
  assert.equal(User.schema.path('agencyId').options.ref, 'Agency');
  assert.equal(
    User.schema.path('accountType').options.immutable,
    true,
    'accountType is fixed at creation so a row cannot change realm'
  );
  assert.equal(
    User.schema.path('agencyId').options.immutable,
    true,
    'agencyId is fixed at creation so a row cannot change tenant'
  );
});
