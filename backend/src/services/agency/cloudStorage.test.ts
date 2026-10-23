import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agencyStorageProvider,
  agencyCloudinaryBase,
  agencyCloudinaryPublicId,
  cloudReadAgencyBytes,
} from './cloudStorage.js';
import { AppError } from '../../utils/AppError.js';

const KEY = '507f1f77bcf86cd799439011';
const ASSET_KEY = `${KEY}/507f1f77bcf86cd799439022.png`;

const CLOUD_ENV_NAMES = [
  'CLOUDINARY_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
  'AGENCY_STORAGE_PROVIDER',
] as const;

function clearCloudEnv() {
  for (const name of CLOUD_ENV_NAMES) delete process.env[name];
}

test('agencyStorageProvider falls back to local without Cloudinary credentials', () => {
  clearCloudEnv();
  assert.equal(agencyStorageProvider(), 'local');
});

test('agencyStorageProvider picks Cloudinary when credentials exist', () => {
  clearCloudEnv();
  process.env.CLOUDINARY_CLOUD_NAME = 'my-cloud';
  process.env.CLOUDINARY_API_KEY = '123456789';
  process.env.CLOUDINARY_API_SECRET = 'secret_abc';
  assert.equal(agencyStorageProvider(), 'cloudinary');

  process.env.CLOUDINARY_URL = 'cloudinary://123:abc@my-cloud';
  assert.equal(agencyStorageProvider(), 'cloudinary');
});

test('AGENCY_STORAGE_PROVIDER overrides credential detection in both directions', () => {
  clearCloudEnv();

  // Forced cloudinary wins even without credentials (fails later at write).
  process.env.AGENCY_STORAGE_PROVIDER = 'cloudinary';
  assert.equal(agencyStorageProvider(), 'cloudinary');

  // Forced local wins even with credentials configured.
  process.env.CLOUDINARY_CLOUD_NAME = 'my-cloud';
  process.env.CLOUDINARY_API_KEY = '123456789';
  process.env.CLOUDINARY_API_SECRET = 'secret_abc';
  process.env.AGENCY_STORAGE_PROVIDER = 'local';
  assert.equal(agencyStorageProvider(), 'local');

  // Case-insensitive and whitespace-tolerant.
  process.env.AGENCY_STORAGE_PROVIDER = '  Cloudinary ';
  assert.equal(agencyStorageProvider(), 'cloudinary');

  // Unknown values fall through to credential detection.
  process.env.AGENCY_STORAGE_PROVIDER = 'banana';
  assert.equal(agencyStorageProvider(), 'cloudinary');
});

test('agencyCloudinaryPublicId prefixes the folder with a trailing-slash-tolerant base', () => {
  clearCloudEnv();
  assert.equal(agencyCloudinaryBase(), 'travelai/agency');
  assert.equal(
    agencyCloudinaryPublicId(ASSET_KEY),
    `travelai/agency/${ASSET_KEY}`
  );

  process.env.CLOUDINARY_FOLDER = 'acme-travel/';
  assert.equal(agencyCloudinaryBase(), 'acme-travel/agency');
  assert.equal(
    agencyCloudinaryPublicId(ASSET_KEY),
    `acme-travel/agency/${ASSET_KEY}`
  );
});

test('cloudReadAgencyBytes fails closed when no credentials are configured', async () => {
  clearCloudEnv();
  await assert.rejects(
    cloudReadAgencyBytes(ASSET_KEY, 'Asset not found'),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 500 &&
      error.message === 'Agency storage is not configured on this server.'
  );
});

test('cloudReadAgencyBytes reads via a signed private download URL and maps 404 to the caller contract', async () => {
  const origFetch = globalThis.fetch;
  const calls: Array<{ url: string; auth: string | undefined }> = [];

  try {
    clearCloudEnv();
    process.env.CLOUDINARY_CLOUD_NAME = 'my-cloud';
    process.env.CLOUDINARY_API_KEY = 'key123';
    process.env.CLOUDINARY_API_SECRET = 'sec456';

    const responses = [
      { status: 200, ok: true, arrayBuffer: async () => new TextEncoder().encode('hello').buffer },
      { status: 404, ok: false },
      { status: 404, ok: false },
      { status: 500, ok: false },
    ];
    globalThis.fetch = (async (url: string, init?: any) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization });
      return responses.shift() as any;
    }) as typeof fetch;

    const bytes = await cloudReadAgencyBytes(ASSET_KEY, 'Asset not found');
    assert.equal(Buffer.from(bytes).toString('utf8'), 'hello');

    // The read goes to the api.cloudinary.com download endpoint with the
    // public_id and a signature — never the public CDN and never Basic auth.
    assert.match(
      calls[0].url,
      /^https:\/\/api\.cloudinary\.com\/v1_1\/my-cloud\/raw\/download\?/
    );
    assert.ok(decodeURIComponent(calls[0].url).includes(`public_id=travelai/agency/${ASSET_KEY}`));
    assert.match(calls[0].url, /signature=[0-9a-f]+/);
    assert.match(calls[0].url, /expires_at=\d+/);
    assert.equal(calls[0].auth, undefined);

    await assert.rejects(
      cloudReadAgencyBytes(ASSET_KEY, 'Asset not found'),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 404 &&
        error.message === 'Asset not found'
    );

    // Template snapshot contract: same miss, but a 409 for the caller.
    await assert.rejects(
      cloudReadAgencyBytes(
        ASSET_KEY,
        'A template asset snapshot is no longer available. Upload a new template version.',
        409
      ),
      (error: unknown) =>
        error instanceof AppError && error.statusCode === 409
    );

    await assert.rejects(
      cloudReadAgencyBytes(ASSET_KEY, 'Asset not found'),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 502 &&
        error.message === 'Agency storage could not be read right now.'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
