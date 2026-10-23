import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../utils/AppError.js';
import {
  createAgencyAssetSchema,
  updateAgencySchema,
} from '../../schemas/agency.schema.js';
import {
  AGENCY_FONT_MAX_BYTES,
  AGENCY_IMAGE_MAX_BYTES,
  assertAgencyAssetBytes,
  assertAgencyAssetSize,
  extensionForAgencyAssetMime,
  normalizeAgencyAssetMime,
  projectAgencyAsset,
  sniffAgencyAssetMime,
} from './assets.js';
import {
  agencyAssetFilePath,
  buildAgencyAssetStorageKey,
} from './assetStorage.js';
import { buildAgencyUpdate } from './agencies.js';

const AGENCY_ID = 'a'.repeat(24);
const ASSET_ID = 'b'.repeat(24);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const WOFF = Buffer.concat([Buffer.from('wOFF'), Buffer.alloc(4)]);
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(4)]);
const OTF = Buffer.concat([Buffer.from('OTTO'), Buffer.alloc(4)]);
const TTF = Buffer.concat([
  Buffer.from([0x00, 0x01, 0x00, 0x00]),
  Buffer.alloc(4),
]);

function expectAppError(fn: () => void, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

test('agency asset MIME aliases normalise to the canonical allow-list', () => {
  assert.equal(normalizeAgencyAssetMime('image/jpg'), 'image/jpeg');
  assert.equal(normalizeAgencyAssetMime('IMAGE/PNG; charset=binary'), 'image/png');
  assert.equal(normalizeAgencyAssetMime('application/font-woff'), 'font/woff');
  assert.equal(normalizeAgencyAssetMime('application/x-font-woff2'), 'font/woff2');
  assert.equal(normalizeAgencyAssetMime('application/x-font-ttf'), 'font/ttf');
  assert.equal(normalizeAgencyAssetMime('application/vnd.ms-opentype'), 'font/otf');
});

test('the sniffer recognises every supported image and font signature', () => {
  assert.equal(sniffAgencyAssetMime(PNG), 'image/png');
  assert.equal(sniffAgencyAssetMime(JPEG), 'image/jpeg');
  assert.equal(sniffAgencyAssetMime(WEBP), 'image/webp');
  assert.equal(sniffAgencyAssetMime(WOFF), 'font/woff');
  assert.equal(sniffAgencyAssetMime(WOFF2), 'font/woff2');
  assert.equal(sniffAgencyAssetMime(OTF), 'font/otf');
  assert.equal(sniffAgencyAssetMime(TTF), 'font/ttf');
  assert.equal(sniffAgencyAssetMime(Buffer.from('not a font or image')), null);
  assert.equal(sniffAgencyAssetMime(null), null);
});

test('images must match the type their bytes actually are', () => {
  assert.equal(assertAgencyAssetBytes('image', 'image/png', PNG), 'image/png');
  assert.equal(assertAgencyAssetBytes('logo', 'image/jpg', JPEG), 'image/jpeg');
  assert.equal(assertAgencyAssetBytes('mascot', 'image/webp', WEBP), 'image/webp');

  expectAppError(
    () => assertAgencyAssetBytes('image', 'image/jpeg', PNG),
    400
  );
  expectAppError(
    () => assertAgencyAssetBytes('image', 'text/plain', PNG),
    400
  );
  expectAppError(
    () => assertAgencyAssetBytes('image', 'image/png', Buffer.from('<svg/>')),
    400
  );
});

test('fonts must be a supported signature and agree with the declared type', () => {
  assert.equal(assertAgencyAssetBytes('font', 'font/woff', WOFF), 'font/woff');
  assert.equal(assertAgencyAssetBytes('font', 'font/woff2', WOFF2), 'font/woff2');
  assert.equal(assertAgencyAssetBytes('font', 'font/otf', OTF), 'font/otf');
  assert.equal(assertAgencyAssetBytes('font', 'font/ttf', TTF), 'font/ttf');
  assert.equal(
    assertAgencyAssetBytes('font', 'application/octet-stream', WOFF2),
    'font/woff2'
  );

  expectAppError(
    () => assertAgencyAssetBytes('font', 'font/woff', WOFF2),
    400
  );
  expectAppError(
    () => assertAgencyAssetBytes('font', 'text/plain', WOFF),
    400
  );
  expectAppError(
    () => assertAgencyAssetBytes('font', 'font/woff', PNG),
    400
  );
});

test('size limits differ for images and fonts', () => {
  expectAppError(() => assertAgencyAssetSize('image', 0), 400);
  expectAppError(
    () => assertAgencyAssetSize('image', AGENCY_IMAGE_MAX_BYTES + 1),
    413
  );
  assert.doesNotThrow(() =>
    assertAgencyAssetSize('font', AGENCY_IMAGE_MAX_BYTES + 1)
  );
  expectAppError(
    () => assertAgencyAssetSize('font', AGENCY_FONT_MAX_BYTES + 1),
    413
  );
});

test('storage extensions come from the sniffed MIME, never the filename', () => {
  assert.equal(extensionForAgencyAssetMime('image/jpeg'), 'jpg');
  assert.equal(extensionForAgencyAssetMime('image/png'), 'png');
  assert.equal(extensionForAgencyAssetMime('font/woff2'), 'woff2');
  assert.equal(extensionForAgencyAssetMime('text/html'), null);
});

test('storage keys are tenant-scoped and reject traversal', () => {
  assert.equal(
    buildAgencyAssetStorageKey(AGENCY_ID, ASSET_ID, 'png'),
    `${AGENCY_ID}/${ASSET_ID}.png`
  );
  expectAppError(
    () => buildAgencyAssetStorageKey('../evil', ASSET_ID, 'png'),
    400
  );
  expectAppError(
    () => buildAgencyAssetStorageKey(AGENCY_ID, ASSET_ID, '../sh'),
    400
  );
  expectAppError(() => agencyAssetFilePath('../etc/passwd'), 400);
  expectAppError(() => agencyAssetFilePath('/absolute/path.png'), 400);
  expectAppError(() => agencyAssetFilePath('..\\windows\\secret'), 400);
  const resolved = agencyAssetFilePath(`${AGENCY_ID}/${ASSET_ID}.png`);
  assert.ok(resolved.includes(AGENCY_ID));
  assert.ok(resolved.endsWith(`${ASSET_ID}.png`));
});

test('asset projections expose a guarded URL but never the storage key', () => {
  const projection = projectAgencyAsset({
    _id: ASSET_ID,
    agencyId: AGENCY_ID,
    kind: 'logo',
    mime: 'image/png',
    bytes: 123,
    storageKey: `${AGENCY_ID}/${ASSET_ID}.png`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  assert.equal(
    projection.url,
    `/api/agency/${AGENCY_ID}/assets/${ASSET_ID}/content`
  );
  assert.ok(!('storageKey' in projection));
  assert.equal(projection.kind, 'logo');
});

test('brand settings accept empty strings as clear instructions', () => {
  const parsed = updateAgencySchema.parse({
    gstin: '',
    branding: {
      logoUrl: `/api/agency/${AGENCY_ID}/assets/${ASSET_ID}/content`,
      mascotUrl: '',
      contactEmail: '',
      contactPhone: '',
      website: '',
      primaryColor: '',
      address: '',
      fontHeading: '',
      fontBody: '',
    },
  });

  assert.ok(parsed.branding);
  assert.equal(parsed.branding?.logoUrl?.startsWith('/api/agency/'), true);
});

test('brand settings still reject malformed non-empty values', () => {
  assert.throws(() =>
    updateAgencySchema.parse({ branding: { contactEmail: 'not-an-email' } })
  );
  assert.throws(() =>
    updateAgencySchema.parse({ branding: { primaryColor: 'teal' } })
  );
  assert.throws(() =>
    updateAgencySchema.parse({ branding: { website: 'javascript:alert(1)' } })
  );
  assert.throws(() =>
    updateAgencySchema.parse({ branding: { logoUrl: '//evil.example/x.png' } })
  );
  assert.throws(() => updateAgencySchema.parse({ gstin: 'not-a-gstin' }));
});

test('asset upload metadata must name a supported kind', () => {
  assert.equal(
    createAgencyAssetSchema.parse({ kind: 'font', fontFamily: ' Inter ' }).kind,
    'font'
  );
  assert.throws(() => createAgencyAssetSchema.parse({ kind: 'video' }));
  assert.throws(() => createAgencyAssetSchema.parse({}));
});

test('branding updates whitelist fields and turn blanks into $unset', () => {
  const update = buildAgencyUpdate({
    gstin: ' 27aapfu0939f1zv ',
    branding: {
      website: '',
      primaryColor: ' #0F766E ',
      contactEmail: ' Hello@Agency.COM ',
      fontHeading: '',
      mascotUrl: undefined,
      injected: 'x',
    },
  });

  assert.equal(update.$set.gstin, '27AAPFU0939F1ZV');
  assert.equal(update.$set['branding.primaryColor'], '#0F766E');
  assert.equal(update.$set['branding.contactEmail'], 'hello@agency.com');
  assert.equal(update.$unset['branding.website'], 1);
  assert.equal(update.$unset['branding.fontHeading'], 1);
  assert.equal(update.$set['branding.injected'], undefined);
  assert.equal(update.$unset['branding.injected'], undefined);
});

test('branding updates can clear GSTIN but never accept an empty change', () => {
  const cleared = buildAgencyUpdate({ gstin: '' });
  assert.equal(cleared.$unset.gstin, 1);

  expectAppError(() => buildAgencyUpdate({}), 400);
  expectAppError(() => buildAgencyUpdate({ name: ' ' }), 400);
});
