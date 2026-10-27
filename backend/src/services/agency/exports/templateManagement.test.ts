import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/AppError.js';
import {
  assertRenderableTemplate,
  projectAgencyTemplate,
} from './templates.js';
import { projectAgencyTemplateVersion } from './templateManagement.js';

/**
 * A6c template management guarantees that do not need a database:
 * - version projections expose lifecycle metadata, never private keys/bytes;
 * - new exports accept built-ins and activated custom templates only.
 */

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

test('version projections expose lifecycle state but never private storage', () => {
  const projected = projectAgencyTemplateVersion(
    {
      _id: new Types.ObjectId(),
      version: 3,
      audience: 'client',
      pageCount: 4,
      sourceBytes: 12_345,
      checksum: 'a'.repeat(64),
      tokens: ['trip.title'],
      storageKey: 'private/version.html',
      assets: [{ storageKey: 'private/version/logo.png' }],
      createdAt: new Date('2026-10-23T00:00:00.000Z'),
      previewedAt: new Date('2026-10-23T01:00:00.000Z'),
      previewTripId: new Types.ObjectId(),
    },
    3
  );

  assert.equal(projected.version, 3);
  assert.equal(projected.active, true);
  assert.equal(projected.previewedAt instanceof Date, true);
  assert.equal(typeof projected.previewTripId, 'string');
  for (const key of ['storageKey', 'checksum', 'tokens', 'assets']) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(projected, key),
      false,
      `${key} must not be projected`
    );
  }
});

test('an older version is not marked active', () => {
  const projected = projectAgencyTemplateVersion(
    {
      version: 2,
      audience: 'client',
      pageCount: 1,
      sourceBytes: 100,
      createdAt: new Date(),
    },
    3
  );
  assert.equal(projected.active, false);
});

test('custom templates need an activated version before export', () => {
  const custom = {
    _id: new Types.ObjectId(),
    name: 'Custom proposal',
    engine: 'html',
    status: 'active',
    audience: 'client',
    builtinKey: undefined,
    activeVersion: 2,
  };
  assert.doesNotThrow(() => assertRenderableTemplate(custom));
  assert.doesNotThrow(() =>
    assertRenderableTemplate({ ...custom, engine: 'pdf-background' })
  );

  expectAppError(
    () => assertRenderableTemplate({ ...custom, activeVersion: undefined }),
    400
  );
  expectAppError(
    () => assertRenderableTemplate({ ...custom, engine: 'docx' }),
    400
  );
});

test('built-ins remain renderable and template projections carry activeVersion', () => {
  assert.doesNotThrow(() =>
    assertRenderableTemplate({
      builtinKey: 'brochure',
      engine: 'html',
      audience: 'client',
    })
  );

  const projected = projectAgencyTemplate({
    _id: new Types.ObjectId(),
    name: 'Custom proposal',
    engine: 'html',
    status: 'active',
    version: 2,
    activeVersion: 2,
    schemaVersion: 1,
    audience: 'client',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(projected.activeVersion, 2);
  assert.equal(projected.builtinKey, undefined);
});
