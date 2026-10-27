/**
 * Live smoke test for Agency Workspace A6f (uploaded PDF designs).
 *
 * Exercises the whole vector path with no browser involved: design
 * sanitisation, slot-map validation against real page geometry, the repeat
 * day page, preview-before-activation, an export rendered entirely by
 * pdf-lib, layout editing into a new immutable version, the pinned public
 * proposal PDF and tenant scoping. It uses a throwaway
 * `travelai_a6f_smoke` database and temporary storage directories.
 *
 * Run from `backend/`:
 *   npx tsx scripts/smoke-a6f.mts
 */
import 'dotenv/config';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  rgb,
} from 'pdf-lib';
import Agency from '../src/models/Agency.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyQuote from '../src/models/AgencyQuote.js';
import AgencyTemplateVersion from '../src/models/AgencyTemplateVersion.js';
import Trip from '../src/models/Trip.js';
import { AppError } from '../src/utils/AppError.js';
import { uploadAgencyAsset } from '../src/services/agency/assets.js';
import {
  createAgencyExport,
  processAgencyExport,
} from '../src/services/agency/exports/exports.js';
import {
  readAgencyExportFile,
  removeAgencyExportFile,
} from '../src/services/agency/exports/storage.js';
import {
  activateAgencyTemplateVersion,
  archiveAgencyTemplate,
  createAgencyPdfTemplate,
  getAgencyTemplateLayout,
  previewAgencyTemplateVersion,
  readAgencyTemplateBackground,
  saveAgencyTemplateLayout,
} from '../src/services/agency/exports/templateManagement.js';
import { writeAgencyTemplatePdf } from '../src/services/agency/exports/templateStorage.js';
import { getAgencyTemplate } from '../src/services/agency/exports/templates.js';
import {
  createAgencyProposalLink,
  getAgencyProposal,
  readAgencyProposalPdf,
} from '../src/services/agency/proposals.js';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) console.log('     detail:', detail);
  }
}

function smokeMongoUri(): string {
  const configured =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/travelai';
  const parsed = new URL(configured);
  parsed.pathname = '/travelai_a6f_smoke';
  return parsed.toString();
}

async function expectAppError(
  fn: () => Promise<unknown>,
  status: number
): Promise<boolean> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AppError && error.statusCode === status) return true;
    console.log('     unexpected error:', (error as any)?.statusCode, (error as any)?.message);
  }
  return false;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
// RIFF....WEBP is enough for the upload sniff; the PDF guard rejects it.
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8 ', 'latin1'),
  Buffer.alloc(16),
]);

/** A three-page design: cover, one repeatable day page, closing page. */
async function designPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < 3; index += 1) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 24,
      y: 24,
      width: 547,
      height: 793,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
    page.drawRectangle({
      x: 24,
      y: 760,
      width: 547,
      height: 57,
      color: rgb(0.06, 0.46, 0.43),
    });
  }
  return Buffer.from(await doc.save());
}

function basePages(): any[] {
  return [
    {
      page: 1,
      slots: [
        {
          id: 'title',
          kind: 'text',
          token: 'trip.title',
          x: 40,
          y: 60,
          w: 500,
          h: 40,
          size: 22,
          font: 'heading',
        },
        { id: 'agency', kind: 'text', token: 'agency.name', x: 40, y: 110, w: 400, h: 24 },
        { id: 'logo', kind: 'image', token: 'image.logo', x: 480, y: 40, w: 70, h: 70 },
      ],
    },
    {
      page: 2,
      repeat: 'days',
      slots: [
        { id: 'day-no', kind: 'text', token: 'day.number', x: 40, y: 40, w: 60, h: 24 },
        {
          id: 'day-title',
          kind: 'text',
          token: 'day.title',
          x: 110,
          y: 40,
          w: 440,
          h: 24,
          size: 18,
          font: 'heading',
        },
        { id: 'day-summary', kind: 'text', token: 'day.summary', x: 40, y: 80, w: 510, h: 60 },
        {
          id: 'day-activities',
          kind: 'text',
          token: 'day.activities',
          x: 40,
          y: 150,
          w: 510,
          h: 120,
        },
        { id: 'day-img', kind: 'image', token: 'day.image', x: 40, y: 300, w: 200, h: 150 },
      ],
    },
    {
      page: 3,
      slots: [
        { id: 'quote-no', kind: 'text', token: 'quote.number', x: 40, y: 40, w: 300, h: 24 },
        {
          id: 'quote-total',
          kind: 'text',
          token: 'quote.totalFormatted',
          x: 40,
          y: 80,
          w: 300,
          h: 30,
          size: 16,
        },
        { id: 'terms', kind: 'text', token: 'quote.terms', x: 40, y: 140, w: 510, h: 80 },
        { id: 'contact', kind: 'text', token: 'contact.email', x: 40, y: 260, w: 300, h: 20 },
      ],
    },
  ];
}

function slotMap(pages = basePages()) {
  return { schemaVersion: 1, pages };
}

async function pageText(pdf: Buffer, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(pdf);
  const raw = doc.getPage(pageIndex).node.get(PDFName.of('Contents'));
  const refs = raw instanceof PDFArray ? raw.asArray() : [raw];
  let result = '';
  for (const ref of refs) {
    const stream = doc.context.lookup(ref as any);
    if (!(stream instanceof PDFRawStream)) continue;
    const latin = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    for (const match of latin.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      result += Buffer.from(match[1], 'hex').toString('latin1');
    }
  }
  return result;
}

const day = (title: string, location: string, cost: number) => ({
  title,
  summary: `${title} at an easy pace.`,
  activities: [
    { title: `${title} walk`, time: '09:30', location, approx_cost: cost },
    { title: `${title} lunch`, time: '13:00', location, approx_cost: 900 },
  ],
  stay_recommendations: [{ name: `${location} Retreat`, location, vibe: 'quiet' }],
  food_spots: [`${location} café`],
  transport: ['Private car'],
  pro_tip: ['Carry cash for small shops'],
});

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A6f smoke against production.');
  }

  const templateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a6f-templates-'));
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a6f-assets-'));
  const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a6f-exports-'));
  const previousTemplateDir = process.env.AGENCY_TEMPLATE_DIR;
  const previousAssetDir = process.env.AGENCY_ASSET_DIR;
  const previousExportDir = process.env.AGENCY_EXPORT_DIR;
  process.env.AGENCY_TEMPLATE_DIR = templateRoot;
  process.env.AGENCY_ASSET_DIR = assetRoot;
  process.env.AGENCY_EXPORT_DIR = exportRoot;

  await mongoose.connect(smokeMongoUri());
  const renderedKeys: string[] = [];

  try {
    const userId = new Types.ObjectId();
    const agency = await Agency.create({
      name: 'A6f Smoke Travel',
      slug: 'a6f-smoke-travel',
      createdBy: userId,
      branding: {
        primaryColor: '#0F766E',
        accentColor: '#F59E0B',
        contactEmail: 'desk@smoke.test',
        contactPhone: '+91 90000 00000',
        website: 'https://smoke.test',
      },
      defaultTerms: {
        inclusions: ['Stay', 'Transfers'],
        exclusions: ['Flights'],
        terms: ['50% advance to confirm'],
      },
    });
    const otherAgency = await Agency.create({
      name: 'A6f Other Tenant',
      slug: 'a6f-other-tenant',
      createdBy: userId,
    });
    const agencyId = String(agency._id);

    const trip = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      title: 'Spiti 2-day escape',
      status: 'planned',
      startDate: new Date('2026-11-02T00:00:00Z'),
      endDate: new Date('2026-11-03T00:00:00Z'),
      tripDetails: {
        trip_title: 'Spiti 2-day escape',
        destination: 'Kaza, Himachal Pradesh',
        duration_days: 2,
        group_type: 'Couple',
        season: 'Autumn',
        highlights: ['Key Monastery'],
        things_to_carry: ['Warm layers'],
        day_by_day_itinerary: [
          day('Arrival', 'Kaza', 1200),
          day('Valley day', 'Langza', 2400),
        ],
      },
    });
    const otherTrip = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: otherAgency._id,
      title: 'Other tenant trip',
      status: 'planned',
      tripDetails: { trip_title: 'Other tenant trip', duration_days: 1 },
    });
    const quote = await AgencyQuote.create({
      agencyId: agency._id,
      tripId: trip._id,
      number: 'Q-2026-0001',
      version: 1,
      status: 'sent',
      client: { name: 'Riya Sharma', email: 'riya@example.com', adults: 2, children: 0 },
      currency: 'INR',
      lineItems: [{ label: 'Hotels', quantity: 2, unitPrice: 9000, total: 18000 }],
      subtotal: 18000,
      markupPct: 12,
      markupAmount: 2160,
      taxPct: 5,
      taxAmount: 1008,
      discount: 0,
      total: 21168,
      perPerson: 10584,
      validUntil: new Date('2026-11-15T23:59:59Z'),
      inclusions: ['Hotels'],
      exclusions: ['Flights'],
      terms: ['50% advance to confirm'],
      createdBy: userId,
    });

    const logo = await uploadAgencyAsset({
      agencyId,
      userId: String(userId),
      kind: 'logo',
      buffer: PNG,
      declaredMime: 'image/png',
      originalName: 'smoke-logo.png',
    });
    const dayImage = await uploadAgencyAsset({
      agencyId,
      userId: String(userId),
      kind: 'image',
      buffer: PNG,
      declaredMime: 'image/png',
      originalName: 'smoke-day.png',
    });
    const webpLogo = await uploadAgencyAsset({
      agencyId,
      userId: String(userId),
      kind: 'logo',
      buffer: WEBP,
      declaredMime: 'image/webp',
      originalName: 'smoke-logo.webp',
    });
    check(
      'logo, day image and WebP logo assets were uploaded',
      Boolean(logo.asset._id && dayImage.asset._id && webpLogo.asset._id)
    );

    const design = await designPdf();
    const baseInput = {
      agency,
      actorId: String(userId),
      role: 'owner' as const,
      name: 'Smoke PDF design',
      description: 'A6f smoke template',
      audience: 'client' as const,
      buffer: design,
    };
    const assets = {
      logoAssetId: logo.asset._id,
      dayAssets: [
        { day: 1, assetId: dayImage.asset._id },
        { day: 2, assetId: dayImage.asset._id },
      ],
    };

    // 1. Layout validation answers before any bytes are stored.
    const dayOnCover = basePages();
    dayOnCover[0].slots.push({
      id: 'bad-day',
      kind: 'text',
      token: 'day.title',
      x: 40,
      y: 700,
      w: 200,
      h: 20,
    });
    check(
      'a day token outside the repeat page is refused',
      await expectAppError(
        () => createAgencyPdfTemplate({ ...baseInput, slotMap: slotMap(dayOnCover), assets }),
        400
      )
    );

    const outOfBounds = basePages();
    outOfBounds[0].slots[0].w = 600;
    check(
      'a slot that leaves the page is refused',
      await expectAppError(
        () => createAgencyPdfTemplate({ ...baseInput, slotMap: slotMap(outOfBounds), assets }),
        400
      )
    );

    const unknownToken = basePages();
    unknownToken[0].slots[0].token = 'trip.secret';
    check(
      'an unknown token is refused',
      await expectAppError(
        () => createAgencyPdfTemplate({ ...baseInput, slotMap: slotMap(unknownToken), assets }),
        400
      )
    );

    const fourthPage = basePages();
    fourthPage.push({
      page: 4,
      slots: [{ id: 'ghost', kind: 'text', token: 'trip.title', x: 40, y: 40, w: 200, h: 20 }],
    });
    check(
      'a page that is not in the PDF is refused',
      await expectAppError(
        () => createAgencyPdfTemplate({ ...baseInput, slotMap: slotMap(fourthPage), assets }),
        400
      )
    );

    const internalLeak = basePages();
    internalLeak[1].slots.push({
      id: 'costs',
      kind: 'text',
      token: 'day.activityCosts',
      x: 40,
      y: 460,
      w: 510,
      h: 60,
    });
    check(
      'an internal-only token is refused in a client layout',
      await expectAppError(
        () => createAgencyPdfTemplate({ ...baseInput, slotMap: slotMap(internalLeak), assets }),
        400
      )
    );

    check(
      'a WebP snapshot for a mapped image slot is refused',
      await expectAppError(
        () =>
          createAgencyPdfTemplate({
            ...baseInput,
            name: 'WebP logo design',
            slotMap: {
              schemaVersion: 1,
              pages: [
                {
                  page: 1,
                  slots: [
                    { id: 'title', kind: 'text', token: 'trip.title', x: 40, y: 40, w: 300, h: 20 },
                    { id: 'logo', kind: 'image', token: 'image.logo', x: 480, y: 40, w: 70, h: 70 },
                  ],
                },
              ],
            },
            assets: { logoAssetId: webpLogo.asset._id },
          }),
        400
      )
    );

    // 2. A valid upload creates a draft whose design is sanitised.
    const created = await createAgencyPdfTemplate({
      ...baseInput,
      slotMap: slotMap(),
      assets,
    });
    check(
      'a PDF design creates a draft version 1',
      created.template.status === 'draft' &&
        created.template.engine === 'pdf-background' &&
        created.version.version === 1 &&
        created.version.pageCount === 3,
      {
        status: created.template.status,
        engine: created.template.engine,
        version: created.version.version,
        pages: created.version.pageCount,
      }
    );
    const templateId = created.template._id;
    const v1Row = await AgencyTemplateVersion.findOne({
      agencyId,
      templateId,
      version: 1,
    });
    check(
      'the draft is not selectable before activation',
      await expectAppError(() => getAgencyTemplate(agencyId, templateId), 404)
    );
    check(
      'activation before preview is refused',
      await expectAppError(
        () =>
          activateAgencyTemplateVersion({
            agencyId,
            actorId: String(userId),
            role: 'owner',
            templateId,
            version: 1,
          }),
        409
      )
    );

    // 3. Cross-tenant references answer 404.
    check(
      'a foreign template id cannot be read by another tenant',
      await expectAppError(
        () =>
          getAgencyTemplateLayout({
            agencyId: String(otherAgency._id),
            role: 'owner',
            templateId,
            version: 1,
          }),
        404
      )
    );
    check(
      'a preview cannot use another tenant trip',
      await expectAppError(
        () =>
          previewAgencyTemplateVersion({
            agency,
            actorId: String(userId),
            role: 'owner',
            templateId,
            version: 1,
            tripId: String(otherTrip._id),
          }),
        404
      )
    );

    // 4. Admin-only read surfaces.
    check(
      'layout reading is admin-only',
      await expectAppError(
        () => getAgencyTemplateLayout({ agencyId, role: 'planner', templateId, version: 1 }),
        403
      )
    );
    check(
      'background reading is admin-only',
      await expectAppError(
        () =>
          readAgencyTemplateBackground({ agencyId, role: 'planner', templateId, version: 1 }),
        403
      )
    );

    // 5. The stored layout and background round-trip.
    const layout = await getAgencyTemplateLayout({ agencyId, role: 'owner', templateId, version: 1 });
    check(
      'the saved layout reads back with a stable checksum',
      layout.pageCount === 3 &&
        /^[a-f0-9]{64}$/.test(layout.slotMapChecksum) &&
        /^[a-f0-9]{64}$/.test(layout.checksum) &&
        layout.slotMap.pages.length === 3 &&
        v1Row?.assets?.length === 3,
      {
        pages: layout.slotMap.pages.length,
        assets: v1Row?.assets?.map((asset) => asset.slot),
      }
    );
    const background = await readAgencyTemplateBackground({
      agencyId,
      role: 'owner',
      templateId,
      version: 1,
    });
    check(
      'the private background streams back as a PDF',
      background.buffer.subarray(0, 5).toString('latin1') === '%PDF-' &&
        background.filename === 'template-v1.pdf' &&
        background.buffer.byteLength === v1Row?.sourceBytes,
      { bytes: background.buffer.byteLength }
    );

    // 6. Preview renders the real trip through the repeat day page.
    const preview = await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 1,
      tripId: String(trip._id),
      quoteId: String(quote._id),
    });
    const previewPdf = Buffer.from(String(preview.pdf ?? ''), 'base64');
    const previewDoc = await PDFDocument.load(previewPdf);
    const cover = await pageText(previewPdf, 0);
    const dayOne = await pageText(previewPdf, 1);
    const dayTwo = await pageText(previewPdf, 2);
    const closing = await pageText(previewPdf, 3);
    check(
      'preview is a four-page PDF with the trip data merged in',
      preview.engine === 'pdf-background' &&
        preview.pageCount === 4 &&
        previewDoc.getPageCount() === 4 &&
        cover.includes('Spiti 2-day escape') &&
        cover.includes('A6f Smoke Travel'),
      { engine: preview.engine, pageCount: preview.pageCount, pages: previewDoc.getPageCount() }
    );
    check(
      'the repeat page expands once per itinerary day',
      dayOne.includes('Arrival') &&
        !dayOne.includes('Valley day') &&
        dayTwo.includes('Valley day') &&
        dayTwo.includes('Valley day at an easy pace.'),
      { dayOne, dayTwo }
    );
    check(
      'the closing page carries quote and contact data',
      closing.includes('Q-2026-0001') &&
        closing.includes('21,168') &&
        closing.includes('50% advance to confirm') &&
        closing.includes('desk@smoke.test'),
      closing
    );
    check(
      'client previews never leak activity costs',
      !dayOne.includes('1,200') && !dayTwo.includes('2,400'),
      { dayOne, dayTwo }
    );
    check(
      'preview is recorded on the version',
      Boolean(preview.version.previewedAt)
    );

    // 7. Only an internal template may carry desk-only costs.
    const internal = await createAgencyPdfTemplate({
      ...baseInput,
      name: 'Smoke internal design',
      audience: 'internal',
      slotMap: slotMap([
        {
          page: 1,
          slots: [
            { id: 'title', kind: 'text', token: 'trip.title', x: 40, y: 60, w: 500, h: 40 },
          ],
        },
        {
          page: 2,
          repeat: 'days',
          slots: [
            { id: 'day-no', kind: 'text', token: 'day.number', x: 40, y: 40, w: 60, h: 24 },
            {
              id: 'costs',
              kind: 'text',
              token: 'day.activityCosts',
              x: 40,
              y: 80,
              w: 510,
              h: 80,
            },
          ],
        },
      ]),
    });
    const internalPreview = await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId: internal.template._id,
      version: 1,
      tripId: String(trip._id),
      quoteId: String(quote._id),
    });
    const internalPdf = Buffer.from(String(internalPreview.pdf ?? ''), 'base64');
    const internalDayOne = await pageText(internalPdf, 1);
    check(
      'internal previews include activity costs',
      internalPreview.pageCount === 4 && internalDayOne.includes('1,200'),
      { pageCount: internalPreview.pageCount, dayOne: internalDayOne }
    );

    // 8. Activation requires the preview, then pins the version on export.
    const activated = await activateAgencyTemplateVersion({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 1,
    });
    check(
      'activation publishes version 1',
      activated.status === 'active' && activated.activeVersion === 1,
      { status: activated.status, activeVersion: activated.activeVersion }
    );

    const job1 = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    check('the export pins version 1', job1.templateVersion === 1, job1.templateVersion);
    await processAgencyExport(String(job1._id));
    const job1Ready = await AgencyExport.findById(job1._id);
    check(
      'the export renders to a PDF without a browser',
      job1Ready?.status === 'ready' && Boolean(job1Ready.outputKey),
      { status: job1Ready?.status, error: job1Ready?.error }
    );
    if (job1Ready?.outputKey) renderedKeys.push(job1Ready.outputKey);
    if (job1Ready?.outputKey) {
      const exported = await readAgencyExportFile(job1Ready.outputKey);
      check(
        'the exported file is the merged four-page PDF',
        job1Ready.pageCount === 4 &&
          (await PDFDocument.load(exported)).getPageCount() === 4 &&
          (await pageText(exported, 2)).includes('Valley day'),
        { pages: job1Ready.pageCount, bytes: exported.byteLength }
      );
    }

    // 9. Editing the layout saves a new version without copying the design.
    const editedPages = basePages();
    editedPages[0].slots[0].y = 72;
    const saved = await saveAgencyTemplateLayout({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      baseVersion: 1,
      slotMap: slotMap(editedPages),
    });
    const v2Row = await AgencyTemplateVersion.findOne({
      agencyId,
      templateId,
      version: 2,
    });
    check(
      'saving a moved slot creates version 2 and keeps version 1 active',
      saved.version.version === 2 &&
        saved.version.previewedAt === undefined &&
        saved.template.activeVersion === 1,
      { version: saved.version.version, active: saved.template.activeVersion }
    );
    check(
      'the layout edit carries the design and assets forward',
      v2Row?.checksum === v1Row?.checksum &&
        v2Row?.sourceBytes === v1Row?.sourceBytes &&
        v2Row?.pageCount === 3 &&
        v2Row?.assets?.length === v1Row?.assets?.length,
      {
        checksumMatch: v2Row?.checksum === v1Row?.checksum,
        assets: v2Row?.assets?.map((asset) => asset.slot),
      }
    );
    const savedLayout = await getAgencyTemplateLayout({
      agencyId,
      role: 'owner',
      templateId,
      version: 2,
    });
    check(
      'the new version stores the moved coordinates',
      savedLayout.slotMap.pages[0].slots.find((slot) => slot.id === 'title')?.y === 72,
      savedLayout.slotMap.pages[0].slots[0]
    );
    check(
      'saving an unchanged layout is refused',
      await expectAppError(
        () =>
          saveAgencyTemplateLayout({
            agency,
            actorId: String(userId),
            role: 'owner',
            templateId,
            baseVersion: 2,
            slotMap: slotMap(editedPages),
          }),
        400
      )
    );
    check(
      'layout saving is admin-only',
      await expectAppError(
        () =>
          saveAgencyTemplateLayout({
            agency,
            actorId: String(userId),
            role: 'planner',
            templateId,
            baseVersion: 2,
            slotMap: slotMap(basePages()),
          }),
        403
      )
    );

    await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 2,
      tripId: String(trip._id),
      quoteId: String(quote._id),
    });
    const activated2 = await activateAgencyTemplateVersion({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 2,
    });
    check('version 2 becomes active after preview', activated2.activeVersion === 2);

    const job2 = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    check('the next export pins version 2', job2.templateVersion === 2, job2.templateVersion);
    await processAgencyExport(String(job2._id));
    const job2Ready = await AgencyExport.findById(job2._id);
    check('the edited layout exports', job2Ready?.status === 'ready' && job2Ready.pageCount === 4);
    if (job2Ready?.outputKey) renderedKeys.push(job2Ready.outputKey);

    // 10. A tampered background fails closed and can be restored.
    if (v2Row) {
      await writeAgencyTemplatePdf(
        v2Row.storageKey,
        Buffer.from('%PDF-1.4 tampered background')
      );
      check(
        'a background that no longer matches its checksum is refused',
        await expectAppError(
          () =>
            readAgencyTemplateBackground({
              agencyId,
              role: 'owner',
              templateId,
              version: 2,
            }),
          409
        )
      );
      await writeAgencyTemplatePdf(v2Row.storageKey, background.buffer);
    }

    // 11. The pinned public proposal serves the finished PDF.
    const share = await createAgencyProposalLink({
      agencyId,
      tripId: String(job1.tripId),
      exportId: String(job1._id),
      actorId: String(userId),
      role: 'owner',
    });
    const token = share.url.split('/').pop() ?? '';
    const proposal = await getAgencyProposal(token);
    check(
      'the proposal uses the pinned PDF document',
      proposal.documentMode === 'pdf' &&
        proposal.html === '' &&
        proposal.pageCount === 4 &&
        proposal.pdf?.bytes === job1Ready?.bytes,
      {
        mode: proposal.documentMode,
        pages: proposal.pageCount,
        pdf: proposal.pdf,
      }
    );
    const proposalPdf = await readAgencyProposalPdf(token);
    check(
      'the token-only route serves the same PDF',
      proposalPdf.buffer.subarray(0, 5).toString('latin1') === '%PDF-' &&
        proposalPdf.buffer.byteLength === job1Ready?.bytes,
      { bytes: proposalPdf.buffer.byteLength }
    );

    // 12. Archiving retires the template for new work only.
    const archived = await archiveAgencyTemplate({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
    });
    check('archiving retires the template', archived.status === 'archived');
    check(
      'no layout can be saved while archived',
      await expectAppError(
        () =>
          saveAgencyTemplateLayout({
            agency,
            actorId: String(userId),
            role: 'owner',
            templateId,
            baseVersion: 2,
            slotMap: slotMap(basePages()),
          }),
        409
      )
    );
    check(
      'a new export cannot pin an archived template',
      await expectAppError(
        () =>
          createAgencyExport({
            agencyId,
            actorId: String(userId),
            role: 'owner',
            trip,
            templateId,
            quoteId: quote._id,
            schedule: false,
          }),
        404
      )
    );
    check(
      'archived PDF templates cannot be deleted by another tenant',
      await expectAppError(
        () =>
          archiveAgencyTemplate({
            agencyId: String(otherAgency._id),
            actorId: String(userId),
            role: 'owner',
            templateId,
          }),
        404
      )
    );

    // 13. Lifecycle actions leave tenant-scoped audit rows.
    const audits = await AgencyAudit.countDocuments({
      agencyId,
      action: {
        $in: [
          'template.created',
          'template.previewed',
          'template.activated',
          'template.layout_saved',
          'template.archived',
        ],
      },
    });
    check('PDF lifecycle actions are audited', audits >= 8, audits);
  } finally {
    for (const key of renderedKeys) {
      await removeAgencyExportFile(key).catch(() => undefined);
    }
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
    for (const root of [templateRoot, assetRoot, exportRoot]) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
    if (previousTemplateDir === undefined) delete process.env.AGENCY_TEMPLATE_DIR;
    else process.env.AGENCY_TEMPLATE_DIR = previousTemplateDir;
    if (previousAssetDir === undefined) delete process.env.AGENCY_ASSET_DIR;
    else process.env.AGENCY_ASSET_DIR = previousAssetDir;
    if (previousExportDir === undefined) delete process.env.AGENCY_EXPORT_DIR;
    else process.env.AGENCY_EXPORT_DIR = previousExportDir;
  }

  if (failures > 0) {
    console.error(`\n${failures} A6f smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A6f smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
