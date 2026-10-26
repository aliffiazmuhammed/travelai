/**
 * Live smoke test for Agency Workspace A5 (proposal exports).
 *
 * Unlike the unit tests, this exercises the real pipeline: Mongo-backed job
 * rows, tenant-seeded templates, Chrome HTML -> PDF conversion, private file
 * storage, signed downloads and role-filtered history. It uses a throwaway
 * `travelai_a5_smoke` database and removes the rendered PDFs afterwards.
 *
 * Run from `backend/`:
 *   npx tsx scripts/smoke-a5.mts
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyQuote from '../src/models/AgencyQuote.js';
import Trip from '../src/models/Trip.js';
import { AppError } from '../src/utils/AppError.js';
import {
  createAgencyExport,
  listAgencyExports,
  previewAgencyExport,
  processAgencyExport,
  readAgencyExportDownload,
} from '../src/services/agency/exports/exports.js';
import { findChromeExecutable } from '../src/services/agency/exports/pdf.js';
import { exportDownloadPath } from '../src/services/agency/exports/signing.js';
import { removeAgencyExportFile } from '../src/services/agency/exports/storage.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../src/services/agency/exports/templates.js';

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
  parsed.pathname = '/travelai_a5_smoke';
  return parsed.toString();
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
    throw new Error('Refusing to run the A5 smoke against production.');
  }
  const chrome = await findChromeExecutable();
  check('Chrome/Chromium/Edge executable found', Boolean(chrome), chrome);
  if (!chrome) {
    throw new Error(
      'Install Chrome or set AGENCY_CHROME_PATH before running this smoke.'
    );
  }

  await mongoose.connect(smokeMongoUri());
  const renderedKeys: string[] = [];

  try {
    const userId = new Types.ObjectId();
    const agency = await Agency.create({
      name: 'A5 Smoke Travel',
      slug: 'a5-smoke-travel',
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
    const trip = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      title: 'Himalayan 4-day escape',
      status: 'planned',
      startDate: new Date('2026-11-02T00:00:00Z'),
      endDate: new Date('2026-11-05T00:00:00Z'),
      tripDetails: {
        trip_title: 'Himalayan 4-day escape',
        destination: 'Manali, Himachal Pradesh',
        duration_days: 4,
        group_type: 'Family',
        season: 'Autumn',
        highlights: ['Old Manali cafés', 'Solang Valley'],
        things_to_carry: ['Warm layers', 'ID proof'],
        day_by_day_itinerary: [
          day('Arrival', 'Old Manali', 1200),
          day('Valley day', 'Solang Valley', 2400),
          day('Village day', 'Naggar', 1500),
          day('Departure', 'Kullu', 800),
        ],
      },
    });
    const quote = await AgencyQuote.create({
      agencyId: agency._id,
      tripId: trip._id,
      number: 'Q-2026-0001',
      version: 1,
      status: 'sent',
      client: {
        name: 'Riya Sharma',
        email: 'riya@example.com',
        adults: 2,
        children: 1,
      },
      currency: 'INR',
      lineItems: [
        { label: 'Hotels', quantity: 3, unitPrice: 9000, total: 27000 },
        { label: 'Transport', quantity: 1, unitPrice: 12000, total: 12000 },
      ],
      subtotal: 39000,
      markupPct: 12,
      markupAmount: 4680,
      taxPct: 5,
      taxAmount: 2184,
      discount: 0,
      total: 45864,
      perPerson: 15288,
      validUntil: new Date('2026-11-15T23:59:59Z'),
      inclusions: ['Hotels', 'Breakfast', 'Private car'],
      exclusions: ['Flights', 'Personal shopping'],
      terms: ['50% advance to confirm', 'Free date change until 15 days prior'],
      preparedBy: 'Internal Ops',
      createdBy: userId,
    });

    await ensureBuiltinTemplates(String(agency._id), String(userId));
    const templates = await listAgencyTemplates(String(agency._id));
    check(
      'two built-in templates were seeded',
      templates.length === 2,
      templates.map((template) => template.builtinKey)
    );
    const brochure = templates.find(
      (template) => template.builtinKey === 'brochure'
    );
    const internalSummary = templates.find(
      (template) => template.builtinKey === 'internal-summary'
    );
    if (!brochure || !internalSummary) {
      throw new Error('Built-in templates missing after seeding.');
    }

    const clientPreview = await previewAgencyExport({
      agencyId: String(agency._id),
      role: 'owner',
      trip,
      templateId: brochure._id,
      quoteId: quote._id,
    });
    check(
      'client preview renders N+4 pages',
      clientPreview.pageCount === 8,
      clientPreview.pageCount
    );
    check(
      'client preview carries the agency brand and quote',
      clientPreview.html.includes('A5 Smoke Travel') &&
        clientPreview.html.includes('Q-2026-0001')
    );
    check(
      'client preview hides internal cost and prepared-by',
      !clientPreview.html.includes('<span class="activity-cost">') &&
        !clientPreview.html.includes('Internal Ops') &&
        !clientPreview.html.includes('4680')
    );

    const internalPreview = await previewAgencyExport({
      agencyId: String(agency._id),
      role: 'owner',
      trip,
      templateId: internalSummary._id,
      quoteId: quote._id,
    });
    check(
      'internal preview includes internal activity estimates',
      internalPreview.html.includes('<span class="activity-cost">')
    );

    const clientJob = await createAgencyExport({
      agencyId: String(agency._id),
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId: brochure._id,
      quoteId: quote._id,
      schedule: false,
    });
    check('client export starts queued', clientJob.status === 'queued');
    await processAgencyExport(String(clientJob._id));
    const clientReady = await AgencyExport.findById(clientJob._id);
    check(
      'client PDF is ready',
      clientReady?.status === 'ready',
      clientReady?.error
    );
    check(
      'client PDF has bytes and a private key',
      Boolean(clientReady?.bytes && clientReady.bytes > 1000) &&
        Boolean(clientReady?.outputKey),
      { bytes: clientReady?.bytes, outputKey: clientReady?.outputKey }
    );
    if (clientReady?.outputKey) renderedKeys.push(clientReady.outputKey);

    const internalJob = await createAgencyExport({
      agencyId: String(agency._id),
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId: internalSummary._id,
      quoteId: quote._id,
      schedule: false,
    });
    await processAgencyExport(String(internalJob._id));
    const internalReady = await AgencyExport.findById(internalJob._id);
    check(
      'internal PDF is ready',
      internalReady?.status === 'ready',
      internalReady?.error
    );
    if (internalReady?.outputKey) renderedKeys.push(internalReady.outputKey);

    const ownerHistory = await listAgencyExports({
      agencyId: String(agency._id),
      tripId: String(trip._id),
      role: 'owner',
    });
    check('owner sees both exports', ownerHistory.length === 2);
    const viewerHistory = await listAgencyExports({
      agencyId: String(agency._id),
      tripId: String(trip._id),
      role: 'viewer',
    });
    check(
      'viewer history hides internal exports',
      viewerHistory.length === 1 && viewerHistory[0].audience === 'client',
      viewerHistory.map((job) => job.audience)
    );

    const signed = (exportId: string) => {
      const path = exportDownloadPath({
        agencyId: String(agency._id),
        exportId,
      });
      const url = new URL(`http://local${path}`);
      return {
        expiresAt: Number(url.searchParams.get('expires')),
        signature: url.searchParams.get('signature') || '',
      };
    };

    const clientSearch = signed(String(clientJob._id));
    const download = await readAgencyExportDownload({
      agencyId: String(agency._id),
      exportId: String(clientJob._id),
      ...clientSearch,
      actorId: String(userId),
      role: 'viewer',
    });
    check(
      'viewer can download a client proposal',
      download.buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    );

    const internalSearch = signed(String(internalJob._id));
    let internalDenied = false;
    try {
      await readAgencyExportDownload({
        agencyId: String(agency._id),
        exportId: String(internalJob._id),
        ...internalSearch,
        actorId: String(userId),
        role: 'planner',
      });
    } catch (error) {
      internalDenied = error instanceof AppError && error.statusCode === 403;
    }
    check('planner cannot download an internal export', internalDenied);
  } finally {
    for (const key of renderedKeys) {
      await removeAgencyExportFile(key).catch(() => undefined);
    }
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} A5 smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A5 smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
