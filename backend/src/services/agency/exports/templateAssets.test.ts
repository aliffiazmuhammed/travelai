import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/AppError.js';
import {
  agencyTemplateAssetFilePath,
  buildAgencyTemplateAssetStorageKey,
  buildAgencyTemplateStorageKey,
  readAgencyTemplateAssetFile,
  readAgencyTemplateFile,
  removeAgencyTemplateAssetFile,
  removeAgencyTemplateVersionFiles,
  writeAgencyTemplateAssetFile,
  writeAgencyTemplateFile,
} from './templateStorage.js';
import {
  AGENCY_TEMPLATE_MAX_DAY_ASSETS,
  agencyAssetIdFromContentUrl,
  assertTemplateAssetCoverage,
  carryOverTemplateAssetSnapshots,
  loadAgencyTemplateVersionAssets,
  normalizeAgencyTemplateAssetSelection,
  snapshotAgencyTemplateAssets,
} from './templateAssets.js';

/**
 * A6 asset snapshot guarantees:
 * - keys are version-scoped, server-generated and traversal-safe;
 * - only supported image/font bytes become embedded data URLs;
 * - truncated, missing or type-confused snapshots fail loudly;
 * - a template that references an unmapped slot cannot be published;
 * - failed versions can remove their private files.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const WOFF2 = Buffer.from('wOF2test-font-bytes', 'utf8');

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

async function withTemplateRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-template-assets-'));
  const previous = process.env.AGENCY_TEMPLATE_DIR;
  const previousProvider = process.env.AGENCY_STORAGE_PROVIDER;
  // These tests assert local-disk semantics against a temp root, so the
  // provider must be pinned even on a Cloudinary-configured machine.
  process.env.AGENCY_TEMPLATE_DIR = root;
  process.env.AGENCY_STORAGE_PROVIDER = 'local';
  try {
    await run(root);
  } finally {
    if (previous === undefined) delete process.env.AGENCY_TEMPLATE_DIR;
    else process.env.AGENCY_TEMPLATE_DIR = previous;
    if (previousProvider === undefined) delete process.env.AGENCY_STORAGE_PROVIDER;
    else process.env.AGENCY_STORAGE_PROVIDER = previousProvider;
    await fs.rm(root, { recursive: true, force: true });
  }
}

function snapshot(
  slot: string,
  storageKey: string,
  mime: string,
  bytes: number,
  fontFamily?: string
) {
  return {
    slot,
    storageKey,
    mime,
    bytes,
    ...(fontFamily ? { fontFamily } : {}),
  };
}

test('asset storage keys are version-scoped and reject traversal', () => {
  const agencyId = new Types.ObjectId().toString();
  const versionId = new Types.ObjectId().toString();
  const key = buildAgencyTemplateAssetStorageKey(
    agencyId,
    versionId,
    'day-1',
    'webp'
  );
  assert.equal(key, `${agencyId}/${versionId}/day-1.webp`);

  expectAppError(
    () => buildAgencyTemplateAssetStorageKey('nope', versionId, 'logo', 'png'),
    400
  );
  expectAppError(
    () => buildAgencyTemplateAssetStorageKey(agencyId, versionId, '../logo', 'png'),
    400
  );
  expectAppError(
    () => buildAgencyTemplateAssetStorageKey(agencyId, versionId, 'logo', 'html'),
    400
  );
  expectAppError(() => agencyTemplateAssetFilePath('../escape.png'), 400);
  expectAppError(() => agencyTemplateAssetFilePath('/absolute.png'), 400);
  expectAppError(() => agencyTemplateAssetFilePath('source/template.html'), 400);
});

test('snapshot files round-trip and missing files fail with 409', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const versionId = new Types.ObjectId().toString();
    const key = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'logo',
      'png'
    );

    await writeAgencyTemplateAssetFile(key, PNG);
    assert.deepEqual(await readAgencyTemplateAssetFile(key), PNG);

    await removeAgencyTemplateAssetFile(key);
    await assert.rejects(
      () => readAgencyTemplateAssetFile(key),
      (error) => error instanceof AppError && error.statusCode === 409
    );
  });
});

test('version snapshots load as embedded images and fonts', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const versionId = new Types.ObjectId().toString();
    const logoKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'logo',
      'png'
    );
    const dayKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'day-1',
      'png'
    );
    const fontKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'heading-font',
      'woff2'
    );
    await writeAgencyTemplateAssetFile(logoKey, PNG);
    await writeAgencyTemplateAssetFile(dayKey, PNG);
    await writeAgencyTemplateAssetFile(fontKey, WOFF2);

    const loaded = await loadAgencyTemplateVersionAssets([
      snapshot('logo', logoKey, 'image/png', PNG.byteLength),
      snapshot('day-1', dayKey, 'image/png', PNG.byteLength),
      snapshot('heading-font', fontKey, 'font/woff2', WOFF2.byteLength, 'Fraunces'),
      // Unknown slots are not part of v1 and must not be read or exposed.
      snapshot('decoration', `${agencyId}/${versionId}/missing.png`, 'image/png', 1),
    ]);

    assert.match(loaded.images.logo, /^data:image\/png;base64,/);
    assert.match(loaded.images['day-1'], /^data:image\/png;base64,/);
    assert.equal(loaded.headingFont?.family, 'Fraunces');
    assert.match(loaded.headingFont?.dataUrl ?? '', /^data:font\/woff2;base64,/);
    assert.equal(loaded.bodyFont, null);
  });
});

test('corrupt or missing snapshots are rejected', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const versionId = new Types.ObjectId().toString();

    const shortKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'day-1',
      'png'
    );
    await writeAgencyTemplateAssetFile(shortKey, PNG);
    await assert.rejects(
      () =>
        loadAgencyTemplateVersionAssets([
          snapshot('day-1', shortKey, 'image/png', PNG.byteLength + 1),
        ]),
      (error) => error instanceof AppError && error.statusCode === 409
    );

    const wrongMimeKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'day-2',
      'png'
    );
    await writeAgencyTemplateAssetFile(wrongMimeKey, PNG);
    await assert.rejects(
      () =>
        loadAgencyTemplateVersionAssets([
          snapshot('day-2', wrongMimeKey, 'image/webp', PNG.byteLength),
        ]),
      (error) => error instanceof AppError && error.statusCode === 409
    );

    const missingKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'logo',
      'png'
    );
    await assert.rejects(
      () =>
        loadAgencyTemplateVersionAssets([
          snapshot('logo', missingKey, 'image/png', PNG.byteLength),
        ]),
      (error) => error instanceof AppError && error.statusCode === 409
    );
  });
});

test('template coverage rejects unmapped image slots', () => {
  expectAppError(() => assertTemplateAssetCoverage(['assets.logoDataUrl'], []), 400);
  assert.doesNotThrow(() =>
    assertTemplateAssetCoverage(['assets.logoDataUrl'], [{ slot: 'logo' }])
  );

  expectAppError(
    () =>
      assertTemplateAssetCoverage(
        ['assets.coverImageDataUrl'],
        [{ slot: 'logo' }]
      ),
    400
  );
  expectAppError(
    () => assertTemplateAssetCoverage(['days.imageDataUrl'], [{ slot: 'cover' }]),
    400
  );
  assert.doesNotThrow(() =>
    assertTemplateAssetCoverage(['days.imageDataUrl'], [{ slot: 'day-2' }])
  );
});

test('asset selections are normalised and validated before any file is read', () => {
  const logoId = new Types.ObjectId().toString().toUpperCase();
  const dayOne = new Types.ObjectId().toString();
  const dayTwo = new Types.ObjectId().toString();
  const normalized = normalizeAgencyTemplateAssetSelection({
    logoAssetId: logoId,
    dayAssets: [
      { day: 2, assetId: dayTwo },
      { day: 1, assetId: dayOne },
    ],
  });
  assert.deepEqual(normalized, [
    { slot: 'logo', assetId: logoId.toLowerCase() },
    { slot: 'day-1', assetId: dayOne },
    { slot: 'day-2', assetId: dayTwo },
  ]);

  expectAppError(
    () =>
      normalizeAgencyTemplateAssetSelection({
        dayAssets: [
          { day: 1, assetId: dayOne },
          { day: 1, assetId: dayTwo },
        ],
      }),
    400
  );
  expectAppError(
    () =>
      normalizeAgencyTemplateAssetSelection({
        dayAssets: [{ day: AGENCY_TEMPLATE_MAX_DAY_ASSETS + 1, assetId: dayOne }],
      }),
    400
  );
  expectAppError(
    () =>
      normalizeAgencyTemplateAssetSelection({
        dayAssets: [{ day: 1, assetId: 'not-an-id' }],
      }),
    400
  );
});

test('branding URLs only resolve inside the current tenant', () => {
  const agencyId = new Types.ObjectId().toString();
  const assetId = new Types.ObjectId().toString();
  const url = `/api/agency/${agencyId}/assets/${assetId}/content`;

  assert.equal(agencyAssetIdFromContentUrl(url, agencyId), assetId);
  assert.equal(
    agencyAssetIdFromContentUrl(
      url,
      new Types.ObjectId().toString()
    ),
    null
  );
  assert.equal(
    agencyAssetIdFromContentUrl('https://evil.test/logo.png', agencyId),
    null
  );
});

test('an invalid version id is rejected before any database lookup', async () => {
  await assert.rejects(
    () =>
      snapshotAgencyTemplateAssets({
        agencyId: 'not-an-id',
        versionId: new Types.ObjectId().toString(),
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
});

test('failed versions can remove their source and snapshots', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const versionId = new Types.ObjectId().toString();
    const sourceKey = buildAgencyTemplateStorageKey(agencyId, versionId);
    const assetKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      versionId,
      'logo',
      'png'
    );
    await writeAgencyTemplateFile(sourceKey, '<section class="page"></section>');
    await writeAgencyTemplateAssetFile(assetKey, PNG);

    await removeAgencyTemplateVersionFiles({
      storageKey: sourceKey,
      assets: [{ storageKey: assetKey }],
    });

    await assert.rejects(
      () => readAgencyTemplateFile(sourceKey),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    await assert.rejects(
      () => readAgencyTemplateAssetFile(assetKey),
      (error) => error instanceof AppError && error.statusCode === 409
    );
  });
});

test('edited versions carry snapshots forward byte-for-byte', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const sourceVersionId = new Types.ObjectId().toString();
    const targetVersionId = new Types.ObjectId().toString();
    const logoKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      sourceVersionId,
      'logo',
      'png'
    );
    const fontKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      sourceVersionId,
      'heading-font',
      'woff2'
    );
    await writeAgencyTemplateAssetFile(logoKey, PNG);
    await writeAgencyTemplateAssetFile(fontKey, WOFF2);
    const logoAssetId = new Types.ObjectId();

    const carried = await carryOverTemplateAssetSnapshots({
      agencyId,
      sourceVersionId,
      targetVersionId,
      usedTokens: ['assets.logoDataUrl'],
      assets: [
        {
          ...snapshot('logo', logoKey, 'image/png', PNG.byteLength),
          assetId: logoAssetId,
        },
        snapshot(
          'heading-font',
          fontKey,
          'font/woff2',
          WOFF2.byteLength,
          'Fraunces'
        ),
      ],
    });

    assert.equal(carried.length, 2);
    const logo = carried.find((asset) => asset.slot === 'logo');
    assert.ok(logo);
    assert.equal(
      logo.storageKey,
      `${agencyId}/${targetVersionId}/logo.png`
    );
    assert.equal(String(logo.assetId), String(logoAssetId));
    assert.deepEqual(await readAgencyTemplateAssetFile(logo.storageKey), PNG);

    const loaded = await loadAgencyTemplateVersionAssets(carried);
    assert.match(loaded.images.logo, /^data:image\/png;base64,/);
    assert.equal(loaded.headingFont?.family, 'Fraunces');
    // The approved source version keeps its own snapshots untouched.
    assert.deepEqual(await readAgencyTemplateAssetFile(logoKey), PNG);
  });
});

test('editing fails loudly when a snapshot is missing or unmapped', async () => {
  await withTemplateRoot(async () => {
    const agencyId = new Types.ObjectId().toString();
    const sourceVersionId = new Types.ObjectId().toString();
    const targetVersionId = new Types.ObjectId().toString();
    const logoKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      sourceVersionId,
      'logo',
      'png'
    );
    await writeAgencyTemplateAssetFile(logoKey, PNG);

    const missingKey = buildAgencyTemplateAssetStorageKey(
      agencyId,
      sourceVersionId,
      'day-1',
      'png'
    );
    await assert.rejects(
      () =>
        carryOverTemplateAssetSnapshots({
          agencyId,
          sourceVersionId,
          targetVersionId,
          assets: [snapshot('day-1', missingKey, 'image/png', PNG.byteLength)],
        }),
      (error) => error instanceof AppError && error.statusCode === 409
    );

    // A source that newly needs a cover cannot silently publish without one.
    await assert.rejects(
      () =>
        carryOverTemplateAssetSnapshots({
          agencyId,
          sourceVersionId,
          targetVersionId,
          usedTokens: ['assets.coverImageDataUrl'],
          assets: [snapshot('logo', logoKey, 'image/png', PNG.byteLength)],
        }),
      (error) => error instanceof AppError && error.statusCode === 400
    );
    await assert.rejects(
      () =>
        readAgencyTemplateAssetFile(
          `${agencyId}/${targetVersionId}/logo.png`
        ),
      (error) => error instanceof AppError && error.statusCode === 409
    );
  });
});
