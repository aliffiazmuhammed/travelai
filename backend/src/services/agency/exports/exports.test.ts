import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/AppError.js';
import {
  buildExportDocument,
  EXPORT_SCHEMA_VERSION,
  normalizeActivities,
  normalizeStays,
} from './document.js';
import {
  countExportPages,
  escapeHtml,
  renderExportHtml,
  safeFontFamily,
  safeHexColour,
} from './render.js';
import { countPdfPages, remotePdfRenderer, renderHtmlToPdf } from './pdf.js';
import {
  agencyExportFilePath,
  buildAgencyExportStorageKey,
} from './storage.js';
import {
  EXPORT_DOWNLOAD_TTL_MS,
  exportDownloadPath,
  signExportDownload,
  verifyExportDownload,
} from './signing.js';
import {
  assertExportPolicy,
  exportExpiry,
  EXPORT_RETENTION_DAYS,
  projectAgencyExport,
  staleRenderCutoff,
} from './exports.js';
import { projectAgencyTemplate } from './templates.js';

/**
 * A5 export guarantees that do not need a database or a browser:
 * - the DTO is client-safe by construction and has a schema version;
 * - 1, 4 and 10-day documents render the full page sequence;
 * - missing dates/photos/quotes still produce a readable document;
 * - page counting is exact and never confuses a page footer with a page;
 * - signed downloads are bound to one tenant and expire.
 */

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

const TEMPLATE = {
  builtinKey: 'brochure',
  name: 'Signature brochure',
  audience: 'client',
  version: 1,
} as const;

const INTERNAL_TEMPLATE = {
  builtinKey: 'internal-summary',
  name: 'Internal summary',
  audience: 'internal',
  version: 1,
} as const;

const CHAT_SECRET = 'ciphertext-that-must-never-render';
const EXPENSE_SECRET = 'internal-expense-note';
const PREPARED_BY_SECRET = 'Prepared by a specific agent';

function agencyFixture() {
  return {
    _id: new Types.ObjectId(),
    name: 'Himalaya Trails',
    gstin: '27AAPFU0939F1ZV',
    branding: {
      primaryColor: '#0F766E',
      accentColor: '#F59E0B',
      fontHeading: 'Fraunces',
      fontBody: 'Inter',
      contactPhone: '+91 99999 00000',
      contactEmail: 'hello@himalaya.test',
      website: 'https://himalaya.test',
      address: '12 Camp Road, Pune',
    },
  };
}

function quoteFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    number: 'Q-2026-0042',
    version: 2,
    status: 'sent',
    currency: 'INR',
    total: 1268.89,
    perPerson: 422.96,
    validUntil: new Date('2099-12-31T23:59:59.999Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    inclusions: ['Airport transfers', 'All stays'],
    exclusions: ['Lunch on day 2'],
    terms: ['50% deposit confirms the booking.'],
    client: {
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+91 88888 11111',
      adults: 2,
      children: 1,
      rooms: 1,
    },
    // Staff-only values that must not reach the export DTO.
    markupPct: 47.31,
    markupAmount: 9876.54,
    preparedBy: PREPARED_BY_SECRET,
    expenses: [{ amount: 777, note: EXPENSE_SECRET }],
    chat: [{ ciphertext: CHAT_SECRET }],
    ...overrides,
  };
}

function tripFixture(dayCount: number, overrides: Record<string, any> = {}) {
  const startDate = new Date('2026-11-05T00:00:00.000Z');
  const endDate = new Date(startDate.getTime() + (dayCount - 1) * 86_400_000);
  const days = Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    title: index === 0 ? 'Arrive in Kaza' : `Slow day ${index + 1}`,
    summary: 'A measured day with time to acclimatise and look around.',
    activities: [
      {
        title: `Morning walk ${index + 1}`,
        time: '08:30',
        location: 'Kaza',
        description: 'A gentle walk through the bazaar and old town.',
        approx_cost: 450,
      },
      {
        title: 'Long lunch',
        time: '13:00',
        location_name: 'Kaza',
        description: 'Local thukpa and butter tea.',
      },
    ],
    stay_recommendations: [
      {
        name: `Hotel ${index + 1}`,
        location: 'Kaza',
        vibe: 'Quiet and warm',
        price_per_night: 3200,
        description: 'A small family-run property with reliable heating.',
      },
    ],
    food_spots: ['Sol Cafe', 'Taste of Spiti'],
    transport: ['Private Innova'],
    pro_tip: ['Carry cash; ATMs are unreliable above Kaza.'],
    permit_required: index === 2,
  }));

  return {
    _id: new Types.ObjectId(),
    title: 'Working title that should not win',
    workspace: 'agency',
    startDate,
    endDate,
    tripDetails: {
      trip_title: 'Spiti Valley Slow Road',
      destination: 'Spiti Valley',
      duration_days: dayCount,
      group_type: 'Family',
      season: 'Autumn',
      highlights: ['Key Monastery at dawn', 'Chandratal under the stars'],
      things_to_carry: ['Down jacket', 'Reusable bottle'],
      weather_advisory: { packing_tips: ['Sunscreen'] },
      day_by_day_itinerary: days,
      chat: [{ ciphertext: CHAT_SECRET }],
      expenses: [{ amount: 999, note: EXPENSE_SECRET }],
    },
    ...overrides,
  };
}

function render(dayCount: number, options: { quote?: any; trip?: any; template?: any } = {}) {
  const doc = buildExportDocument({
    agency: agencyFixture(),
    trip: options.trip ?? tripFixture(dayCount),
    quote: options.quote === undefined ? quoteFixture() : options.quote,
  });
  const rendered = renderExportHtml(doc, options.template ?? TEMPLATE, {});
  return { doc, ...rendered };
}

test('DTO fixtures render complete 1, 4 and 10-day documents', () => {
  for (const dayCount of [1, 4, 10]) {
    const { doc, html, pageCount } = render(dayCount);

    assert.equal(doc.schemaVersion, EXPORT_SCHEMA_VERSION);
    assert.equal(doc.trip.durationDays, dayCount);
    assert.equal(doc.trip.nights, dayCount - 1);
    assert.equal(doc.trip.days.length, dayCount);
    assert.equal(doc.trip.startDate, '2026-11-05');
    assert.equal(doc.trip.days[0].date, '2026-11-05');
    assert.equal(
      doc.trip.days[dayCount - 1].date,
      new Date(Date.UTC(2026, 10, 5 + dayCount - 1)).toISOString().slice(0, 10)
    );

    // cover + overview + one page per day + pricing + practical
    assert.equal(pageCount, dayCount + 4);
    assert.equal(countExportPages(html), dayCount + 4);

    const pages = html.split('<section class="page').slice(1);
    assert.equal(pages.length, dayCount + 4);
    for (const page of pages) {
      assert.ok(page.trim().length > 150, 'a rendered page must carry real content');
    }
    assert.ok(html.includes(`Day ${dayCount} of ${dayCount}`));
    assert.ok(html.includes('data-page="cover"'));
    assert.ok(html.includes('data-page="overview"'));
    assert.ok(html.includes('data-page="pricing"'));
    assert.ok(html.includes('data-page="practical"'));
  }
});

test('missing dates, photos, quote and optional fields still render a safe draft', () => {
  const trip = {
    _id: new Types.ObjectId(),
    tripDetails: {},
  };
  const doc = buildExportDocument({
    agency: { _id: new Types.ObjectId() },
    trip,
    quote: null,
  });
  const rendered = renderExportHtml(doc, TEMPLATE, {});

  assert.equal(doc.trip.durationDays, 1);
  assert.equal(doc.trip.startDate, null);
  assert.equal(doc.trip.endDate, null);
  assert.equal(doc.trip.destination, '');
  assert.equal(doc.trip.days[0].title, 'Day 1');
  assert.equal(doc.quote, null);
  assert.equal(doc.client, null);
  assert.equal(rendered.pageCount, 5);
  assert.equal(countExportPages(rendered.html), 5);
  assert.ok(rendered.html.includes('Pricing on request'));
  assert.ok(rendered.html.includes('Your journey'));
  assert.ok(!rendered.html.includes('data:image/'));
});

test('the client DTO excludes margin, prepared-by, expenses and chat ciphertext', () => {
  const { doc } = render(4, { quote: quoteFixture() });
  const serialized = JSON.stringify(doc);

  assert.ok(doc.quote, 'the quote summary must be present');
  assert.equal(Object.prototype.hasOwnProperty.call(doc.quote, 'markupPct'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(doc.quote, 'markupAmount'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(doc.quote, 'preparedBy'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(doc.quote, 'expenses'), false);
  assert.ok(!serialized.includes(CHAT_SECRET));
  assert.ok(!serialized.includes(EXPENSE_SECRET));
  assert.ok(!serialized.includes(PREPARED_BY_SECRET));
  assert.ok(!serialized.includes('"markupPct"'));
  assert.ok(doc.quote!.inclusions.includes('All stays'));
  assert.equal(doc.client?.name, 'Asha Rao');
});

test('an expired sent quote is exported with an EXPIRED watermark', () => {
  const quote = quoteFixture({
    status: 'sent',
    validUntil: new Date('2026-01-01T00:00:00.000Z'),
  });
  const doc = buildExportDocument({
    agency: agencyFixture(),
    trip: tripFixture(2),
    quote,
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
  assert.equal(doc.quote?.status, 'expired');
  const rendered = renderExportHtml(doc, TEMPLATE, {});
  assert.ok(rendered.html.includes('EXPIRED'));
});

test('client exports need a live quote; internal exports need admin rank', () => {
  const quote = quoteFixture();

  expectAppError(
    () => assertExportPolicy({ audience: 'client', role: 'planner', quote: null }),
    400
  );
  expectAppError(
    () =>
      assertExportPolicy({
        audience: 'client',
        role: 'planner',
        quote: quoteFixture({ status: 'cancelled' }),
      }),
    409
  );
  assert.doesNotThrow(() =>
    assertExportPolicy({ audience: 'client', role: 'planner', quote })
  );
  assert.doesNotThrow(() =>
    assertExportPolicy({
      audience: 'client',
      role: 'planner',
      quote: quoteFixture({ status: 'draft' }),
    })
  );
  assert.doesNotThrow(() =>
    assertExportPolicy({ audience: 'internal', role: 'admin', quote: null })
  );
  expectAppError(
    () => assertExportPolicy({ audience: 'internal', role: 'planner', quote }),
    403
  );
  expectAppError(
    () => assertExportPolicy({ audience: 'client', role: 'viewer', quote }),
    403
  );
});

test('text is escaped and unsafe colours/fonts never reach the CSS', () => {
  const trip = tripFixture(1, {
    tripDetails: {
      ...tripFixture(1).tripDetails,
      trip_title: '<script>alert("x")</script>',
      highlights: ['<img src=x onerror=alert(1)>'],
    },
  });
  const agency = agencyFixture();
  agency.branding.primaryColor = 'red;background:url(javascript:alert(1))';
  agency.branding.fontHeading = "x';background:url(javascript:alert(1))";
  const doc = buildExportDocument({ agency, trip, quote: quoteFixture() });
  const rendered = renderExportHtml(doc, TEMPLATE, {});

  assert.ok(!rendered.html.includes('<script>alert'));
  assert.ok(rendered.html.includes('&lt;script&gt;alert'));
  assert.ok(!rendered.html.includes('<img src=x'));
  assert.equal(safeHexColour('red', '#000000'), '#000000');
  assert.equal(safeHexColour('#0f766e', '#000000'), '#0F766E');
  assert.equal(safeFontFamily("x';background:url(javascript:alert(1))"), null);
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('activity and stay normalizers accept strings and model-shaped objects', () => {
  const activities = normalizeActivities([
    'Sunrise walk',
    { name: 'Monastery', location_name: 'Key', approx_cost: '250', description: 'Quiet.' },
    { title: 'Bad', cost: -5 },
    null,
  ]);
  assert.equal(activities.length, 3);
  assert.equal(activities[0].title, 'Sunrise walk');
  assert.equal(activities[1].location, 'Key');
  assert.equal(activities[1].cost, 250);
  assert.equal(activities[2].cost, null);

  const stays = normalizeStays([
    { name: 'Homestay', price_per_night: 1800, vibe: 'Cosy' },
    'Guesthouse',
  ]);
  assert.equal(stays[0].pricePerNight, '1800');
  assert.equal(stays[1].name, 'Guesthouse');
});

test('renderer distinguishes the internal audience and hides internal costs from clients', () => {
  const { html: clientHtml } = render(3);
  const internal = buildExportDocument({
    agency: agencyFixture(),
    trip: tripFixture(3),
    quote: quoteFixture(),
  });
  const { html: internalHtml } = renderExportHtml(internal, INTERNAL_TEMPLATE, {});

  assert.ok(!clientHtml.includes('<span class="activity-cost">'));
  assert.ok(internalHtml.includes('<span class="activity-cost">'));
  assert.ok(internalHtml.includes('Internal · Internal summary'));
});

test('signed download URLs are tenant-bound, expiring and tamper-evident', () => {
  const agencyId = 'a'.repeat(24);
  const exportId = 'b'.repeat(24);
  const now = 1_700_000_000_000;
  const expiresAt = now + 60_000;
  const signature = signExportDownload({ agencyId, exportId, expiresAt, secret: 'test-secret' });

  assert.equal(
    verifyExportDownload({
      agencyId,
      exportId,
      expiresAt,
      signature,
      now,
      secret: 'test-secret',
    }),
    true
  );
  assert.equal(
    verifyExportDownload({
      agencyId: 'c'.repeat(24),
      exportId,
      expiresAt,
      signature,
      now,
      secret: 'test-secret',
    }),
    false
  );
  assert.equal(
    verifyExportDownload({
      agencyId,
      exportId,
      expiresAt,
      signature,
      now: expiresAt + 1,
      secret: 'test-secret',
    }),
    false
  );
  assert.equal(
    verifyExportDownload({
      agencyId,
      exportId,
      expiresAt,
      signature: signature.replace(/^./, signature[0] === 'a' ? 'b' : 'a'),
      now,
      secret: 'test-secret',
    }),
    false
  );

  const path = exportDownloadPath({ agencyId, exportId, now, secret: 'test-secret' });
  const url = new URL(path, 'http://localhost');
  assert.equal(
    Number(url.searchParams.get('expires')),
    now + EXPORT_DOWNLOAD_TTL_MS
  );
  assert.equal(url.searchParams.get('signature')?.length, 64);
});

test('export storage keys are server-generated and traversal-safe', () => {
  const agencyId = 'a'.repeat(24);
  const exportId = 'b'.repeat(24);
  assert.equal(
    buildAgencyExportStorageKey(agencyId, exportId),
    `${agencyId}/${exportId}.pdf`
  );
  expectAppError(() => buildAgencyExportStorageKey('not-an-id', exportId), 400);
  expectAppError(() => agencyExportFilePath('../../etc/passwd.pdf'), 400);
  expectAppError(() => agencyExportFilePath('/tmp/absolute.pdf'), 400);
  expectAppError(() => agencyExportFilePath('a/not-a-pdf.txt'), 400);
});

test('PDF page markers are counted without a PDF parser dependency', () => {
  const pdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << /Type /Pages /Kids [] /Count 6 >>\nendobj\n%%EOF'
  );
  assert.equal(countPdfPages(pdf), 6);
  expectAppError(() => countPdfPages(Buffer.from('not a pdf')), 500);
});

test('export history projects a signed URL only for a ready, unexpired job', () => {
  const now = new Date('2026-10-22T10:00:00.000Z');
  const agencyId = new Types.ObjectId();
  const base = {
    _id: new Types.ObjectId(),
    agencyId,
    tripId: new Types.ObjectId(),
    templateId: new Types.ObjectId(),
    templateName: 'Signature brochure',
    templateVersion: 1,
    audience: 'client',
    format: 'pdf',
    status: 'ready',
    outputKey: `${agencyId}/file.pdf`,
    bytes: 1234,
    attempts: 1,
    requestedBy: new Types.ObjectId(),
    createdAt: now,
    completedAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
  };

  const ready = projectAgencyExport(base, now);
  assert.equal(Object.prototype.hasOwnProperty.call(ready, 'outputKey'), false);
  assert.ok(ready.downloadUrl?.startsWith(`/api/agency/${agencyId}/exports/${base._id}/download?`));
  assert.equal(ready.expired, false);
  assert.equal(ready.bytes, 1234);

  const queued = projectAgencyExport({ ...base, status: 'queued', outputKey: undefined }, now);
  assert.equal(queued.downloadUrl, null);

  const expired = projectAgencyExport(
    { ...base, expiresAt: new Date(now.getTime() - 1) },
    now
  );
  assert.equal(expired.downloadUrl, null);
  assert.equal(expired.expired, true);

  const failed = projectAgencyExport(
    { ...base, status: 'failed', outputKey: undefined, error: 'Chrome missing' },
    now
  );
  assert.equal(failed.error, 'Chrome missing');
  assert.equal(failed.downloadUrl, null);
});

test('template projections expose metadata but never storage keys', () => {
  const projected = projectAgencyTemplate({
    _id: new Types.ObjectId(),
    name: 'Signature brochure',
    description: 'Client proposal',
    engine: 'html',
    status: 'active',
    version: 3,
    schemaVersion: 1,
    audience: 'client',
    isDefault: true,
    builtinKey: 'brochure',
    storageKey: 'private/template.html',
    previewKey: 'private/preview.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(projected.version, 3);
  assert.equal(projected.builtinKey, 'brochure');
  assert.equal(Object.prototype.hasOwnProperty.call(projected, 'storageKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projected, 'previewKey'), false);
});

test('export retention is explicit and finite', () => {
  const now = new Date('2026-10-22T00:00:00.000Z');
  assert.equal(
    exportExpiry(now).getTime() - now.getTime(),
    EXPORT_RETENTION_DAYS * 86_400_000
  );
});

/* -------------------------------------------------------------------------- */
/*  Remote renderer                                                            */
/* -------------------------------------------------------------------------- */

const RENDERER_ENV_KEYS = [
  'AGENCY_PDF_RENDERER_URL',
  'AGENCY_PDF_RENDERER_USERNAME',
  'AGENCY_PDF_RENDERER_PASSWORD',
  'AGENCY_PDF_RENDERER_TIMEOUT_MS',
] as const;

function clearRendererEnv(): void {
  for (const key of RENDERER_ENV_KEYS) delete process.env[key];
}

async function withStubRenderer(
  handler: Parameters<typeof createServer>[1],
  run: (url: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    clearRendererEnv();
  }
}

test('remote renderer posts the document and returns its PDF bytes', async () => {
  const seen: Array<{
    url?: string;
    contentType?: string;
    auth?: string;
    body: string;
  }> = [];

  await withStubRenderer(
    (req, res) => {
      let body = '';
      req.setEncoding('latin1');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        seen.push({
          url: req.url,
          contentType: req.headers['content-type'],
          auth: req.headers.authorization,
          body,
        });
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end('%PDF-1.4 stub');
      });
    },
    async (url) => {
      process.env.AGENCY_PDF_RENDERER_URL = `${url}/`;
      process.env.AGENCY_PDF_RENDERER_USERNAME = 'travelai';
      process.env.AGENCY_PDF_RENDERER_PASSWORD = 'secret';

      const pdf = await renderHtmlToPdf('<section class="page">Goa</section>');

      assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, '/forms/chromium/convert/html');
      assert.match(
        String(seen[0].contentType),
        /^multipart\/form-data; boundary=/
      );
      assert.equal(
        seen[0].auth,
        `Basic ${Buffer.from('travelai:secret').toString('base64')}`
      );
      assert.match(seen[0].body, /name="files"/);
      assert.match(seen[0].body, /filename="index.html"/);
      assert.match(seen[0].body, /name="printBackground"\r\n\r\ntrue/);
      assert.match(seen[0].body, /name="preferCssPageSize"\r\n\r\ntrue/);
      assert.match(seen[0].body, /name="marginTop"\r\n\r\n0/);
      assert.match(seen[0].body, /Goa/);
      // Trailing slashes are normalised so the route is never doubled.
      assert.equal(remotePdfRenderer()?.url, url);
    }
  );
});

test('remote renderer retries a cold-start 503 once', async () => {
  let calls = 0;

  await withStubRenderer(
    (_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.writeHead(503);
        res.end('starting');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end('%PDF-1.4 after retry');
    },
    async (url) => {
      process.env.AGENCY_PDF_RENDERER_URL = url;

      const pdf = await renderHtmlToPdf('<section class="page">Retry</section>');

      assert.equal(calls, 2);
      assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    }
  );
});

test('remote renderer surfaces auth failures as retryable 503s without retrying', async () => {
  let calls = 0;

  await withStubRenderer(
    (_req, res) => {
      calls += 1;
      res.writeHead(401);
      res.end('unauthorized');
    },
    async (url) => {
      process.env.AGENCY_PDF_RENDERER_URL = url;

      await assert.rejects(
        () => renderHtmlToPdf('<section class="page">No auth</section>'),
        (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.statusCode, 503);
          return true;
        }
      );
      assert.equal(calls, 1);
    }
  );
});

test('stale render cutoff follows the active renderer budget', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  clearRendererEnv();
  try {
    assert.equal(
      staleRenderCutoff(now).getTime(),
      now.getTime() - (45_000 * 2 + 60_000)
    );

    process.env.AGENCY_PDF_RENDERER_URL = 'https://renderer.example';
    process.env.AGENCY_PDF_RENDERER_TIMEOUT_MS = '20000';
    assert.equal(
      staleRenderCutoff(now).getTime(),
      now.getTime() - (20_000 * 2 + 60_000)
    );
  } finally {
    clearRendererEnv();
  }
});
