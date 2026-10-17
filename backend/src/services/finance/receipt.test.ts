import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  DEFAULT_MAX_UPLOAD_MB,
  RECEIPT_FILE_PREFIX,
  RECEIPT_URL_PREFIX,
  buildReceiptFilename,
  contentMatchesMime,
  deleteReceiptFile,
  extensionForMime,
  isAllowedReceiptMime,
  isManagedReceiptUrl,
  maxUploadBytes,
  maxUploadMb,
  receiptFilenameFromUrl,
  receiptUrlFor,
  sanitizeFilename,
  sniffMime,
  isCloudinaryConfigured,
  isCloudinaryUrl,
  parseCloudinaryPublicId,
  saveReceiptFile,
} from './receipt.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(16)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.alloc(8),
]);

test('sniffMime identifies supported formats from their magic bytes', () => {
  assert.equal(sniffMime(JPEG), 'image/jpeg');
  assert.equal(sniffMime(PNG), 'image/png');
  assert.equal(sniffMime(WEBP), 'image/webp');
  assert.equal(sniffMime(PDF), 'application/pdf');
});

test('sniffMime rejects forged, empty and truncated input', () => {
  // A text file renamed to .jpg, an executable and an empty buffer
  assert.equal(sniffMime(Buffer.from('just some text pretending to be a jpeg')), null);
  assert.equal(sniffMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null);
  assert.equal(sniffMime(Buffer.alloc(0)), null);
  assert.equal(sniffMime(null), null);
  assert.equal(sniffMime(undefined), null);
  // "RIFF" alone is not enough — the WEBP tag must be present too
  assert.equal(sniffMime(Buffer.from('RIFF____AVI ')), null);
});

test('contentMatchesMime enforces that contents agree with the declared type', () => {
  assert.equal(contentMatchesMime('image/png', PNG), true);
  assert.equal(contentMatchesMime('IMAGE/PNG', PNG), true);
  assert.equal(contentMatchesMime('application/pdf', PDF), true);
  // Declared as an image, but the bytes are a PDF
  assert.equal(contentMatchesMime('image/jpeg', PDF), false);
  assert.equal(contentMatchesMime('image/gif', PNG), false);
  assert.equal(contentMatchesMime('image/png', Buffer.from('nope')), false);
});

test('mime allow-list and extension mapping stay in sync', () => {
  for (const mime of ALLOWED_RECEIPT_MIME_TYPES) {
    assert.equal(isAllowedReceiptMime(mime), true);
    assert.equal(typeof extensionForMime(mime), 'string');
    assert.ok((extensionForMime(mime) as string).startsWith('.'));
  }
  assert.equal(isAllowedReceiptMime('application/x-msdownload'), false);
  assert.equal(isAllowedReceiptMime('image/svg+xml'), false);
  assert.equal(isAllowedReceiptMime(undefined), false);
  assert.equal(isAllowedReceiptMime(''), false);
  assert.equal(extensionForMime('image/svg+xml'), null);
});

test('sanitizeFilename strips paths and hostile characters', () => {
  assert.equal(sanitizeFilename('hotel-bill.pdf'), 'hotel-bill.pdf');
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('my receipt (1).jpg'), 'my_receipt__1_.jpg');
  assert.equal(sanitizeFilename('....'), 'receipt');
  assert.equal(sanitizeFilename(undefined), 'receipt');
  assert.equal(sanitizeFilename('x'.repeat(400)).length, 120);

  // Windows-style paths must never survive, on any platform
  const winPath = sanitizeFilename('C:\\Windows\\system32\\evil.png');
  assert.ok(!winPath.includes('\\') && !winPath.includes('/') && !winPath.includes(':'));
  assert.ok(winPath.endsWith('evil.png'));
});

test('buildReceiptFilename generates safe, unique, extension-correct names', () => {
  const name = buildReceiptFilename(
    '64b7f0c2aa11bb22cc33dd44',
    '64b7f0c2aa11bb22cc33dd45',
    'image/png',
    'abc123'
  );
  // Only the last 12 alphanumeric characters of each id are used
  assert.equal(name, `${RECEIPT_FILE_PREFIX}bb22cc33dd44-bb22cc33dd45-abc123.png`);

  // Hostile ids cannot escape the directory or inject characters
  const nasty = buildReceiptFilename('../..', 'a/b', 'application/pdf', '..');
  assert.ok(!nasty.includes('..'));
  assert.ok(!nasty.includes('/'));
  assert.ok(nasty.startsWith(RECEIPT_FILE_PREFIX));
  assert.ok(nasty.endsWith('.pdf'));

  // Unsupported types still get a deterministic fallback extension
  assert.ok(buildReceiptFilename('t', 'e', 'image/svg+xml', 'x').endsWith('.bin'));
  // Auto-generated tokens make repeated calls unique
  assert.notEqual(buildReceiptFilename('t', 'e', 'image/png'), buildReceiptFilename('t', 'e', 'image/png'));
});

test('receipt URLs round-trip and only managed paths are accepted', () => {
  const url = receiptUrlFor('receipt-trip-exp-abc.png');
  assert.equal(url, `${RECEIPT_URL_PREFIX}/receipt-trip-exp-abc.png`);
  assert.equal(receiptFilenameFromUrl(url), 'receipt-trip-exp-abc.png');

  assert.equal(isManagedReceiptUrl(url), true);
  // Traversal, foreign hosts, other folders and non-receipt files are rejected
  assert.equal(isManagedReceiptUrl('/uploads/../../etc/passwd'), false);
  assert.equal(isManagedReceiptUrl('/uploads/\\..\\secret'), false);
  assert.equal(isManagedReceiptUrl('https://evil.example/uploads/receipt-a.png'), false);
  assert.equal(isManagedReceiptUrl('/uploads/avatar.png'), false);
  assert.equal(isManagedReceiptUrl(null), false);
  assert.equal(receiptFilenameFromUrl('/uploads/avatar.png'), null);
});

test('deleteReceiptFile refuses anything it does not manage', async () => {
  // None of these may ever touch the filesystem
  assert.equal(await deleteReceiptFile('../../../etc/passwd'), false);
  assert.equal(await deleteReceiptFile('/uploads/../../../secret.txt'), false);
  assert.equal(await deleteReceiptFile('https://example.com/receipt-x.png'), false);
  assert.equal(await deleteReceiptFile(undefined), false);
  // Managed but missing → false, and still harmless
  assert.equal(await deleteReceiptFile(receiptUrlFor('receipt-nope-nope-zzz.png')), false);
});

test('upload size limits default and honour MAX_UPLOAD_MB', () => {
  const previous = process.env.MAX_UPLOAD_MB;
  try {
    delete process.env.MAX_UPLOAD_MB;
    assert.equal(maxUploadMb(), DEFAULT_MAX_UPLOAD_MB);
    assert.equal(maxUploadBytes(), DEFAULT_MAX_UPLOAD_MB * 1024 * 1024);

    process.env.MAX_UPLOAD_MB = '2';
    assert.equal(maxUploadMb(), 2);
    assert.equal(maxUploadBytes(), 2 * 1024 * 1024);

    // Invalid values fall back to the default rather than disabling the cap
    process.env.MAX_UPLOAD_MB = 'nonsense';
    assert.equal(maxUploadMb(), DEFAULT_MAX_UPLOAD_MB);
    process.env.MAX_UPLOAD_MB = '-4';
    assert.equal(maxUploadMb(), DEFAULT_MAX_UPLOAD_MB);
  } finally {
    if (previous === undefined) delete process.env.MAX_UPLOAD_MB;
    else process.env.MAX_UPLOAD_MB = previous;
  }
});

test('isCloudinaryConfigured identifies valid credentials and handles empty strings', () => {
  const origUrl = process.env.CLOUDINARY_URL;
  const origName = process.env.CLOUDINARY_CLOUD_NAME;
  const origKey = process.env.CLOUDINARY_API_KEY;
  const origSec = process.env.CLOUDINARY_API_SECRET;

  try {
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(isCloudinaryConfigured(), false);

    // Empty strings (like unset .env lines) should evaluate to false
    process.env.CLOUDINARY_CLOUD_NAME = '   ';
    process.env.CLOUDINARY_API_KEY = '';
    process.env.CLOUDINARY_API_SECRET = '';
    assert.equal(isCloudinaryConfigured(), false);

    // Full triplet configured
    process.env.CLOUDINARY_CLOUD_NAME = 'my-cloud';
    process.env.CLOUDINARY_API_KEY = '123456789';
    process.env.CLOUDINARY_API_SECRET = 'secret_abc';
    assert.equal(isCloudinaryConfigured(), true);

    // URL format takes precedence
    process.env.CLOUDINARY_URL = 'cloudinary://123:abc@my-cloud';
    assert.equal(isCloudinaryConfigured(), true);
  } finally {
    if (origUrl !== undefined) process.env.CLOUDINARY_URL = origUrl; else delete process.env.CLOUDINARY_URL;
    if (origName !== undefined) process.env.CLOUDINARY_CLOUD_NAME = origName; else delete process.env.CLOUDINARY_CLOUD_NAME;
    if (origKey !== undefined) process.env.CLOUDINARY_API_KEY = origKey; else delete process.env.CLOUDINARY_API_KEY;
    if (origSec !== undefined) process.env.CLOUDINARY_API_SECRET = origSec; else delete process.env.CLOUDINARY_API_SECRET;
  }
});

test('isCloudinaryUrl and parseCloudinaryPublicId parse URLs correctly', () => {
  const imgUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/travelai/receipts/receipt-123.jpg';
  const rawPdfUrl = 'https://res.cloudinary.com/demo/raw/upload/v1312461204/travelai/receipts/receipt-123.pdf';
  const transformedUrl = 'https://res.cloudinary.com/demo/image/upload/c_fill,w_300/v1312461204/travelai/receipts/receipt-123.jpg';
  const nonCldUrl = 'https://example.com/receipt-123.jpg';

  assert.equal(isCloudinaryUrl(imgUrl), true);
  assert.equal(isCloudinaryUrl(nonCldUrl), false);

  const imgParsed = parseCloudinaryPublicId(imgUrl);
  assert.ok(imgParsed);
  assert.equal(imgParsed.publicId, 'travelai/receipts/receipt-123');
  assert.equal(imgParsed.resourceType, 'image');

  const rawParsed = parseCloudinaryPublicId(rawPdfUrl);
  assert.ok(rawParsed);
  assert.equal(rawParsed.publicId, 'travelai/receipts/receipt-123.pdf');
  assert.equal(rawParsed.resourceType, 'raw');

  const transformedParsed = parseCloudinaryPublicId(transformedUrl);
  assert.ok(transformedParsed);
  assert.equal(transformedParsed.publicId, 'travelai/receipts/receipt-123');
  assert.equal(transformedParsed.resourceType, 'image');

  assert.equal(parseCloudinaryPublicId(nonCldUrl), null);
});

test('saveReceiptFile falls back to local disk storage when Cloudinary is unconfigured', async () => {
  const origUrl = process.env.CLOUDINARY_URL;
  const origName = process.env.CLOUDINARY_CLOUD_NAME;
  const origKey = process.env.CLOUDINARY_API_KEY;
  const origSec = process.env.CLOUDINARY_API_SECRET;

  try {
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const fakeJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const filename = 'receipt-test-disk-123.jpg';

    const result = await saveReceiptFile(filename, fakeJpg, 'image/jpeg');
    assert.equal(result.storage, 'local');
    assert.equal(result.url, `${RECEIPT_URL_PREFIX}/${filename}`);

    // Clean up file
    await deleteReceiptFile(result.url);
  } finally {
    if (origUrl !== undefined) process.env.CLOUDINARY_URL = origUrl; else delete process.env.CLOUDINARY_URL;
    if (origName !== undefined) process.env.CLOUDINARY_CLOUD_NAME = origName; else delete process.env.CLOUDINARY_CLOUD_NAME;
    if (origKey !== undefined) process.env.CLOUDINARY_API_KEY = origKey; else delete process.env.CLOUDINARY_API_KEY;
    if (origSec !== undefined) process.env.CLOUDINARY_API_SECRET = origSec; else delete process.env.CLOUDINARY_API_SECRET;
  }
});
