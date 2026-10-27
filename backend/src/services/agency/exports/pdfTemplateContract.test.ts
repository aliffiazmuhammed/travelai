import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  degrees,
  rgb,
} from 'pdf-lib';
import { AppError } from '../../../utils/AppError.js';
import { buildExportDocument } from './document.js';
import {
  AGENCY_PDF_SLOT_TOKENS,
  resolveAgencyPdfSlotImage,
  resolveAgencyPdfSlotText,
  slotMapChecksum,
  slotMapCoverageTokens,
  validateAgencyPdfSlotMap,
  type AgencyPdfSlotMap,
} from './pdfTemplateContract.js';
import {
  agencyPdfSlotTokenCatalog,
  renderAgencyPdfTemplate,
  sanitizeAgencyPdfTemplate,
} from './pdfTemplateRender.js';
import type { ResolvedTemplateAssets } from './templateAssets.js';

/**
 * A6f guarantees; no database needed:
 * - untrusted layouts are normalised, bounded and audience-filtered;
 * - the stored layout checksum is stable across key order;
 * - uploaded PDFs are rebuilt without annotations, scripts, rotation or crop;
 * - the vector renderer expands the repeat day page with independent content.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

async function expectAppErrorAsync(
  fn: () => Promise<unknown>,
  status: number
): Promise<void> {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

function slotMap(overrides: { pages?: any[] } = {}): any {
  return {
    schemaVersion: 1,
    pages:
      overrides.pages ?? [
        {
          page: 1,
          slots: [
            { id: 'title', kind: 'text', token: 'trip.title', x: 40, y: 40, w: 400, h: 40 },
          ],
        },
      ],
  };
}

const PAGE_SIZES = [
  { width: 595.28, height: 841.89 },
  { width: 595.28, height: 841.89 },
  { width: 595.28, height: 841.89 },
];

test('layout validation materialises defaults and normalises coordinates', () => {
  const result = validateAgencyPdfSlotMap(
    slotMap({
      pages: [
        {
          page: 2,
          repeat: 'days',
          slots: [
            {
              id: 'day-title',
              kind: 'text',
              token: 'day.title',
              x: 40.126,
              y: 60,
              w: 300,
              h: 80,
            },
            {
              id: 'hero',
              kind: 'image',
              token: 'day.image',
              x: 40,
              y: 200,
              w: 300,
              h: 180,
            },
          ],
        },
      ],
    }),
    { audience: 'client', pageSizes: PAGE_SIZES }
  );

  const title = result.pages[0].slots[0];
  assert.equal(title.size, 11);
  assert.equal(title.minSize, 6.6);
  assert.equal(title.lineHeight, 1.25);
  assert.equal(title.maxLines, 10);
  assert.equal(title.align, 'left');
  assert.equal(title.color, '#0F172A');
  assert.equal(title.x, 40.13);
  assert.equal(result.pages[0].slots[1].fit, 'cover');
});

test('layout validation rejects unsafe or unsupported mappings', () => {
  const cases: Array<[string, any, number]> = [
    [
      'unknown token',
      slotMap({
        pages: [
          {
            page: 2,
            slots: [
              { id: 'x', kind: 'text', token: 'chat.ciphertext', x: 10, y: 10, w: 50, h: 20 },
            ],
          },
        ],
      }),
      400,
    ],
    [
      'internal token on a client template',
      slotMap({
        pages: [
          {
            page: 2,
            repeat: 'days',
            slots: [
              { id: 'x', kind: 'text', token: 'day.activityCosts', x: 10, y: 10, w: 50, h: 20 },
            ],
          },
        ],
      }),
      400,
    ],
    [
      'day token outside the repeat page',
      slotMap({
        pages: [
          {
            page: 2,
            slots: [
              { id: 'x', kind: 'text', token: 'day.title', x: 10, y: 10, w: 50, h: 20 },
            ],
          },
        ],
      }),
      400,
    ],
    [
      'slot outside the page',
      slotMap({
        pages: [
          {
            page: 2,
            slots: [
              { id: 'x', kind: 'text', token: 'trip.title', x: 560, y: 10, w: 100, h: 20 },
            ],
          },
        ],
      }),
      400,
    ],
    [
      'duplicate page',
      slotMap({
        pages: [
          {
            page: 1,
            slots: [
              { id: 'a', kind: 'text', token: 'trip.title', x: 10, y: 10, w: 100, h: 20 },
            ],
          },
          {
            page: 1,
            slots: [
              { id: 'b', kind: 'text', token: 'trip.title', x: 10, y: 40, w: 100, h: 20 },
            ],
          },
        ],
      }),
      400,
    ],
    [
      'two repeat pages',
      slotMap({
        pages: [
          { page: 2, repeat: 'days', slots: [] },
          { page: 3, repeat: 'days', slots: [] },
        ],
      }),
      400,
    ],
  ];

  for (const [label, input, status] of cases) {
    expectAppError(
      () => validateAgencyPdfSlotMap(input, { audience: 'client', pageSizes: PAGE_SIZES }),
      status
    );
    assert.ok(label);
  }

  expectAppError(
    () =>
      validateAgencyPdfSlotMap(
        { schemaVersion: 2, pages: [] },
        { audience: 'client', pageSizes: PAGE_SIZES }
      ),
    400
  );
});

test('layout checksum ignores object key order', () => {
  const first = validateAgencyPdfSlotMap(
    slotMap({
      pages: [
        {
          page: 2,
          slots: [{ id: 'a', kind: 'text', token: 'trip.title', x: 10, y: 10, w: 100, h: 40 }],
        },
      ],
    }),
    { audience: 'client', pageSizes: PAGE_SIZES }
  );
  const second = JSON.parse(JSON.stringify(first));
  second.pages[0].slots[0] = {
    h: 40,
    w: 100,
    y: 10,
    x: 10,
    token: 'trip.title',
    kind: 'text',
    id: 'a',
    size: 11,
    minSize: 6.6,
    font: 'body',
    align: 'left',
    color: '#0F172A',
    lineHeight: 1.25,
    maxLines: 10,
  };
  assert.equal(slotMapChecksum(first), slotMapChecksum(second));
  assert.notEqual(
    slotMapChecksum(first),
    slotMapChecksum({ ...first, pages: [] as any })
  );
});

test('slot resolvers reuse the HTML view and asset snapshots', () => {
  const view = {
    trip: { title: 'Spiti Valley' },
    quote: { totalFormatted: 'INR 1,200.00' },
    days: [
      { day: 1, title: 'Arrive', activities: [{ title: 'Walk', costFormatted: 'INR 450.00' }] },
    ],
  };
  const client = resolveAgencyPdfSlotText(view, 'trip.title', null, 'client');
  assert.equal(client, 'Spiti Valley');
  assert.equal(
    resolveAgencyPdfSlotText(view, 'day.activityCosts', view.days[0], 'client'),
    ''
  );
  assert.equal(
    resolveAgencyPdfSlotText(view, 'day.activityCosts', view.days[0], 'internal'),
    '• INR 450.00'
  );

  const assets = {
    images: { logo: PNG, 'day-1': PNG },
    headingFont: null,
    bodyFont: null,
  } as ResolvedTemplateAssets;
  assert.equal(resolveAgencyPdfSlotImage(assets, 'image.logo', null), PNG);
  assert.equal(
    resolveAgencyPdfSlotImage(assets, 'day.image', { pageNumber: 1 }),
    PNG
  );
  assert.equal(resolveAgencyPdfSlotImage(assets, 'image.cover', null), '');

  const coverage = slotMapCoverageTokens(
    validateAgencyPdfSlotMap(
      slotMap({
        pages: [
          {
            page: 2,
            repeat: 'days',
            slots: [
              { id: 'l', kind: 'image', token: 'image.logo', x: 10, y: 10, w: 50, h: 50 },
              { id: 'd', kind: 'image', token: 'day.image', x: 10, y: 70, w: 50, h: 50 },
            ],
          },
        ],
      }),
      { audience: 'client', pageSizes: PAGE_SIZES }
    )
  );
  assert.deepEqual(coverage.sort(), ['assets.logoDataUrl', 'days.imageDataUrl']);
});

async function designPdf(pages = 3): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 20,
      y: 20,
      width: 555,
      height: 800,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
  }
  return Buffer.from(await doc.save());
}

test('sanitizer rebuilds the design and drops annotations and scripts', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 0, width: 100, height: 100 });
  page.node.set(
    PDFName.of('Annots'),
    doc.context.obj([
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, 0, 10, 10],
        A: doc.context.obj({ S: 'JavaScript', JS: 'app.alert(1)' }),
      }),
    ])
  );
  const dirty = Buffer.from(await doc.save());

  const clean = await sanitizeAgencyPdfTemplate(dirty);
  assert.equal(clean.pageCount, 1);
  assert.deepEqual(clean.pageSizes, [
    { width: 595.28, height: 841.89 },
  ]);
  assert.match(clean.checksum, /^[a-f0-9]{64}$/);
  assert.equal(clean.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(clean.bytes.toString('latin1').includes('JavaScript'), false);

  const reloaded = await PDFDocument.load(clean.bytes);
  assert.equal(
    reloaded.getPage(0).node.get(PDFName.of('Annots')),
    undefined
  );
});

test('sanitizer rejects encrypted, rotated, cropped and oversized designs', async () => {
  await expectAppErrorAsync(
    () => sanitizeAgencyPdfTemplate(Buffer.from('not a pdf')),
    400
  );

  const rotated = await PDFDocument.create();
  rotated.addPage([595.28, 841.89]).setRotation(degrees(90));
  const rotatedBytes = Buffer.from(await rotated.save());
  await expectAppErrorAsync(
    () => sanitizeAgencyPdfTemplate(rotatedBytes),
    400
  );

  const cropped = await PDFDocument.create();
  cropped.addPage([595.28, 841.89]).setCropBox(10, 10, 500, 700);
  const croppedBytes = Buffer.from(await cropped.save());
  await expectAppErrorAsync(
    () => sanitizeAgencyPdfTemplate(croppedBytes),
    400
  );

  const tooManyPages = await designPdf(21);
  await expectAppErrorAsync(
    () => sanitizeAgencyPdfTemplate(tooManyPages),
    400
  );
});

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
      instagram: '@himalayatrails',
      address: '12 Camp Road, Pune',
    },
  };
}

function tripFixture() {
  return {
    _id: new Types.ObjectId(),
    title: 'Working title',
    workspace: 'agency',
    startDate: new Date('2026-11-05T00:00:00.000Z'),
    endDate: new Date('2026-11-06T00:00:00.000Z'),
    tripDetails: {
      trip_title: 'Spiti Valley Slow Road',
      destination: 'Spiti Valley',
      duration_days: 2,
      group_type: 'Family',
      season: 'Autumn',
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive in Kaza',
          summary: 'A measured day.',
          activities: [{ title: 'Morning walk', time: '08:30', approx_cost: 450 }],
          stay_recommendations: [{ name: 'Hotel Kaza', price_per_night: 3200 }],
        },
        {
          day: 2,
          title: 'Slow day in Kaza',
          summary: 'Time to acclimatise.',
          activities: [{ title: 'Long lunch' }],
        },
      ],
    },
  };
}

function quoteFixture(status = 'sent') {
  return {
    _id: new Types.ObjectId(),
    number: 'Q-2026-0042',
    version: 2,
    status,
    currency: 'INR',
    total: 1268.89,
    perPerson: 422.96,
    validUntil: new Date('2099-12-31T23:59:59.999Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    inclusions: ['Airport transfers'],
    exclusions: ['Lunch on day 2'],
    terms: ['A ₹ 5,000 deposit confirms the booking.'],
    client: { name: 'Asha Rao', email: 'asha@example.com', adults: 2 },
  };
}

function documentFixture(status = 'sent') {
  return buildExportDocument({
    agency: agencyFixture(),
    trip: tripFixture(),
    quote: quoteFixture(status),
    now: new Date('2026-10-22T10:00:00.000Z'),
  });
}

function assetsFixture(): ResolvedTemplateAssets {
  return {
    images: { logo: PNG, cover: PNG, 'day-1': PNG, 'day-2': PNG },
    headingFont: null,
    bodyFont: null,
  };
}

function layoutFixture(): AgencyPdfSlotMap {
  return validateAgencyPdfSlotMap(
    {
      schemaVersion: 1,
      pages: [
        {
          page: 1,
          slots: [
            { id: 'title', kind: 'text', token: 'trip.title', x: 40, y: 60, w: 400, h: 50, size: 22 },
            { id: 'total', kind: 'text', token: 'quote.totalFormatted', x: 40, y: 120, w: 300, h: 24 },
            { id: 'terms', kind: 'text', token: 'quote.terms', x: 40, y: 160, w: 400, h: 80 },
            { id: 'logo', kind: 'image', token: 'image.logo', x: 480, y: 40, w: 60, h: 60 },
          ],
        },
        {
          page: 2,
          repeat: 'days',
          slots: [
            { id: 'day-no', kind: 'text', token: 'day.number', x: 40, y: 40, w: 60, h: 20 },
            { id: 'day-title', kind: 'text', token: 'day.title', x: 40, y: 70, w: 380, h: 60 },
            { id: 'activities', kind: 'text', token: 'day.activities', x: 40, y: 140, w: 380, h: 200, size: 10 },
            { id: 'day-image', kind: 'image', token: 'day.image', x: 40, y: 360, w: 240, h: 160 },
          ],
        },
        {
          page: 3,
          slots: [
            { id: 'agency', kind: 'text', token: 'agency.name', x: 40, y: 760, w: 300, h: 30 },
          ],
        },
      ],
    },
    { audience: 'client', pageSizes: PAGE_SIZES }
  );
}

async function contentsLength(pdf: Buffer, pageIndex: number): Promise<number> {
  const doc = await PDFDocument.load(pdf);
  const raw = doc.getPage(pageIndex).node.get(PDFName.of('Contents'));
  const resolved = raw instanceof PDFArray ? raw : doc.context.lookup(raw as any);
  return resolved instanceof PDFArray ? resolved.size() : 1;
}

/** Decodes the WinAnsi hex strings pdf-lib writes into a page's content stream. */
async function pageText(pdf: Buffer, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(pdf);
  const raw = doc.getPage(pageIndex).node.get(PDFName.of('Contents'));
  const refs =
    raw instanceof PDFArray
      ? raw.asArray()
      : [raw];
  let result = '';
  for (const ref of refs) {
    const stream = doc.context.lookup(ref as any);
    if (!(stream instanceof PDFRawStream)) continue;
    const latin = Buffer.from(decodePDFRawStream(stream).decode()).toString(
      'latin1'
    );
    for (const match of latin.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      result += Buffer.from(match[1], 'hex').toString('latin1');
    }
  }
  return result;
}

test('renderer expands the repeat day page with independent content', async () => {
  const background = (await sanitizeAgencyPdfTemplate(await designPdf(3))).bytes;
  const rendered = await renderAgencyPdfTemplate({
    doc: documentFixture(),
    template: { name: 'Agency design', audience: 'client' },
    background,
    slotMap: layoutFixture(),
    assets: assetsFixture(),
  });

  assert.equal(rendered.pageCount, 4);
  assert.equal(rendered.tokens.includes('day.title'), true);
  const out = await PDFDocument.load(rendered.pdf);
  assert.equal(out.getPageCount(), 4);
  // Every output page keeps the design's own stream plus its own overlay.
  for (let index = 0; index < 4; index += 1) {
    assert.ok((await contentsLength(rendered.pdf, index)) > 1);
  }
  const refA = out.getPage(1).node.get(PDFName.of('Contents'));
  const refB = out.getPage(2).node.get(PDFName.of('Contents'));
  assert.notEqual(String(refA), String(refB));

  assert.match(await pageText(rendered.pdf, 0), /Spiti Valley Slow Road/);
  assert.match(await pageText(rendered.pdf, 1), /Arrive in Kaza/);
  assert.doesNotMatch(await pageText(rendered.pdf, 1), /Slow day in Kaza/);
  assert.match(await pageText(rendered.pdf, 2), /Slow day in Kaza/);
  assert.match(await pageText(rendered.pdf, 3), /Himalaya Trails/);
});

test('renderer adds the quote watermark and rejects internal-only tokens', async () => {
  const background = (await sanitizeAgencyPdfTemplate(await designPdf(3))).bytes;
  const draft = await renderAgencyPdfTemplate({
    doc: documentFixture('draft'),
    template: { name: 'Agency design', audience: 'client' },
    background,
    slotMap: layoutFixture(),
    assets: assetsFixture(),
  });
  assert.match(await pageText(draft.pdf, 0), /DRAFT/);

  await expectAppErrorAsync(
    () =>
      renderAgencyPdfTemplate({
        doc: documentFixture(),
        template: { name: 'Agency design', audience: 'client' },
        background,
        slotMap: {
          schemaVersion: 1,
          pages: [
            {
              page: 2,
              repeat: 'days',
              slots: [
                { id: 'cost', kind: 'text', token: 'day.activityCosts', x: 10, y: 10, w: 100, h: 40 },
              ],
            },
          ],
        } as AgencyPdfSlotMap,
        assets: assetsFixture(),
      }),
    400
  );
});

test('renderer refuses WebP images with an actionable error', async () => {
  const background = (await sanitizeAgencyPdfTemplate(await designPdf(3))).bytes;
  await expectAppErrorAsync(
    () =>
      renderAgencyPdfTemplate({
        doc: documentFixture(),
        template: { name: 'Agency design', audience: 'client' },
        background,
        slotMap: {
          schemaVersion: 1,
          pages: [
            {
              page: 1,
              slots: [
                { id: 'logo', kind: 'image', token: 'image.logo', x: 20, y: 20, w: 60, h: 60 },
              ],
            },
          ],
        } as AgencyPdfSlotMap,
        assets: {
          images: { logo: 'data:image/webp;base64,AAAA' },
          headingFont: null,
          bodyFont: null,
        },
      }),
    409
  );
});

test('the token catalogue hides internal fields from client templates', () => {
  assert.ok(AGENCY_PDF_SLOT_TOKENS['day.activityCosts'].internalOnly);
  assert.equal(
    agencyPdfSlotTokenCatalog('client').some(
      (entry) => entry.token === 'day.activityCosts'
    ),
    false
  );
  assert.equal(
    agencyPdfSlotTokenCatalog('internal').some(
      (entry) => entry.token === 'day.activityCosts'
    ),
    true
  );
});
