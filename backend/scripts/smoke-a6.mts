/**
 * Live smoke test for Agency Workspace A6 (custom proposal templates).
 *
 * Unlike the unit tests, this exercises the real pipeline: private template
 * storage, asset snapshotting, the preview-before-activation lifecycle,
 * version pinning on export jobs, one default per audience, archiving and
 * tenant scoping. It uses a throwaway `travelai_a6_smoke` database, temporary
 * storage directories and removes rendered PDFs afterwards.
 *
 * Run from `backend/`:
 *   npx tsx scripts/smoke-a6.mts
 */
import 'dotenv/config';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyQuote from '../src/models/AgencyQuote.js';
import AgencyTemplate from '../src/models/AgencyTemplate.js';
import Trip from '../src/models/Trip.js';
import { AppError } from '../src/utils/AppError.js';
import { uploadAgencyAsset } from '../src/services/agency/assets.js';
import { createAgencyExport, processAgencyExport } from '../src/services/agency/exports/exports.js';
import { findChromeExecutable } from '../src/services/agency/exports/pdf.js';
import { removeAgencyExportFile } from '../src/services/agency/exports/storage.js';
import {
  activateAgencyTemplateVersion,
  addAgencyTemplateVersion,
  archiveAgencyTemplate,
  createAgencyTemplate,
  listAgencyTemplateVersions,
  previewAgencyTemplateVersion,
  setDefaultAgencyTemplate,
} from '../src/services/agency/exports/templateManagement.js';
import {
  ensureBuiltinTemplates,
  getAgencyTemplate,
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
  parsed.pathname = '/travelai_a6_smoke';
  return parsed.toString();
}

async function expectAppError(
  fn: () => Promise<unknown>,
  status: number
): Promise<boolean> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError && error.statusCode === status;
  }
  return false;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// Mirrors the published contract example: cover + one page per day with a
// conditional day image, so it requires a day asset mapping.
const DAY_IMAGE_TEMPLATE = `
<style>
  .page { page-break-after: always; padding: 14mm; font-family: var(--font-body); }
  h1, h2 { font-family: var(--font-heading); color: var(--brand-primary); }
</style>

<section class="page">
  {{#assets.logoDataUrl}}
    <img src="{{.}}" alt="{{agency.name}}" width="40mm">
  {{/assets.logoDataUrl}}
  <h1>{{trip.title}}</h1>
  <p>{{agency.name}} · {{trip.destination}} · {{trip.durationDays}} days</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
  {{^quote}}<p>Pricing on request</p>{{/quote}}
</section>

{{#days}}
<section class="page">
  <h2>Day {{day}} — {{title}}</h2>
  {{#imageDataUrl}}<img src="{{.}}" alt="{{title}}" width="100%">{{/imageDataUrl}}
  <p>{{summary}}</p>
  <ul>{{#activities}}<li>{{time}} {{title}}</li>{{/activities}}</ul>
  <ul>{{#stays}}<li>{{name}} — {{vibe}}</li>{{/stays}}</ul>
</section>
{{/days}}
`;

// A plain layout that needs no asset mapping at all.
const PLAIN_TEMPLATE = `
<style>
  .page { page-break-after: always; padding: 14mm; font-family: var(--font-body); }
</style>
<section class="page">
  <h1>{{trip.title}}</h1>
  <p>{{agency.name}} · {{trip.destination}}</p>
</section>
{{#days}}
<section class="page">
  <h2>Day {{day}} — {{title}}</h2>
  <p>{{summary}}</p>
</section>
{{/days}}
`;

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
    throw new Error('Refusing to run the A6 smoke against production.');
  }
  const chrome = await findChromeExecutable();
  check('Chrome/Chromium/Edge executable found', Boolean(chrome), chrome);
  if (!chrome) {
    throw new Error(
      'Install Chrome or set AGENCY_CHROME_PATH before running this smoke.'
    );
  }

  const templateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a6-templates-'));
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a6-assets-'));
  const previousTemplateDir = process.env.AGENCY_TEMPLATE_DIR;
  const previousAssetDir = process.env.AGENCY_ASSET_DIR;
  process.env.AGENCY_TEMPLATE_DIR = templateRoot;
  process.env.AGENCY_ASSET_DIR = assetRoot;

  await mongoose.connect(smokeMongoUri());
  const renderedKeys: string[] = [];

  try {
    const userId = new Types.ObjectId();
    const agency = await Agency.create({
      name: 'A6 Smoke Travel',
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
      name: 'A6 Other Tenant',
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

    await ensureBuiltinTemplates(agencyId, String(userId));

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
    check(
      'logo and day image assets were uploaded',
      Boolean(logo.asset._id && dayImage.asset._id)
    );

    const baseInput = {
      agency,
      actorId: String(userId),
      role: 'owner' as const,
      name: 'Smoke custom layout',
      description: 'A6 smoke template',
      audience: 'client' as const,
    };

    // 1. Asset coverage: a day-image template without a day mapping is refused.
    check(
      'upload without a day image mapping is refused',
      await expectAppError(
        () =>
          createAgencyTemplate({
            ...baseInput,
            buffer: Buffer.from(DAY_IMAGE_TEMPLATE, 'utf8'),
            assets: { logoAssetId: logo.asset._id },
          }),
        400
      )
    );

    // 2. A mapped upload creates a draft with version 1.
    const created = await createAgencyTemplate({
      ...baseInput,
      buffer: Buffer.from(DAY_IMAGE_TEMPLATE, 'utf8'),
      assets: {
        logoAssetId: logo.asset._id,
        dayAssets: [{ day: 1, assetId: dayImage.asset._id }],
      },
    });
    check(
      'a mapped upload creates a draft with version 1',
      created.template.status === 'draft' && created.version.version === 1,
      created.template.status
    );
    const templateId = created.template._id;
    check(
      'the created template is not selectable before activation',
      await expectAppError(() => getAgencyTemplate(agencyId, templateId), 404)
    );

    // 3. Cross-tenant references answer 404.
    check(
      'a foreign asset cannot be snapshotted by another tenant',
      await expectAppError(
        () =>
          createAgencyTemplate({
            agency: otherAgency,
            actorId: String(userId),
            role: 'owner',
            name: 'Thief layout',
            audience: 'client',
            buffer: Buffer.from(PLAIN_TEMPLATE, 'utf8'),
            assets: { logoAssetId: logo.asset._id },
          }),
        404
      )
    );
    check(
      'version listing refuses a cross-tenant template id',
      await expectAppError(
        () =>
          listAgencyTemplateVersions({
            agencyId: String(otherAgency._id),
            role: 'owner',
            templateId,
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

    // 4. Activation requires a recorded preview.
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

    // 5. Non-admins only ever see active client templates.
    const viewerListBefore = await listAgencyTemplates({
      agencyId,
      role: 'viewer',
    });
    check(
      'viewers do not see the draft',
      !viewerListBefore.some((entry) => entry._id === templateId),
      viewerListBefore.map((entry) => entry.name)
    );
    check(
      'viewers cannot ask for draft templates',
      await expectAppError(
        () => listAgencyTemplates({ agencyId, role: 'viewer', status: 'draft' }),
        403
      )
    );

    // 6. Preview records previewedAt and renders real trip data.
    const preview = await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 1,
      tripId: String(trip._id),
      quoteId: String(quote._id),
    });
    check(
      'preview renders the real trip against the stored source',
      preview.pageCount === 3 &&
        preview.html.includes('A6 Smoke Travel') &&
        preview.html.includes('Q-2026-0001') &&
        preview.html.includes('Day 2 — Valley day'),
      { pageCount: preview.pageCount }
    );
    check('preview is recorded on the version', Boolean(preview.version.previewedAt));

    // 7. Activation publishes the previewed version.
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

    // 8. An export pins the activated version and renders to a PDF.
    const job1 = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    check('first export pins version 1', job1.templateVersion === 1, job1.templateVersion);
    await processAgencyExport(String(job1._id));
    const job1Ready = await AgencyExport.findById(job1._id);
    check(
      'first export renders to a real PDF',
      job1Ready?.status === 'ready' && Boolean(job1Ready.bytes),
      { status: job1Ready?.status, error: job1Ready?.error }
    );
    if (job1Ready?.outputKey) renderedKeys.push(job1Ready.outputKey);

    // 9. A newer version can be uploaded, previewed and activated.
    const v2 = await addAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      buffer: Buffer.from(DAY_IMAGE_TEMPLATE.replace('14mm', '15mm'), 'utf8'),
      assets: {
        logoAssetId: logo.asset._id,
        dayAssets: [{ day: 1, assetId: dayImage.asset._id }],
      },
    });
    check('version 2 was added', v2.version.version === 2);
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
    check(
      'version 2 becomes the active version',
      activated2.activeVersion === 2,
      activated2.activeVersion
    );

    const job2 = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    check('second export pins version 2', job2.templateVersion === 2, job2.templateVersion);
    await processAgencyExport(String(job2._id));
    const job2Ready = await AgencyExport.findById(job2._id);
    check('second export renders to a real PDF', job2Ready?.status === 'ready');
    if (job2Ready?.outputKey) renderedKeys.push(job2Ready.outputKey);

    // 10. One default per audience.
    const firstDefault = await setDefaultAgencyTemplate({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
    });
    check('the custom template can become the default', firstDefault.isDefault);
    const clientDefaults = await AgencyTemplate.countDocuments({
      agencyId,
      audience: 'client',
      isDefault: true,
    });
    check('exactly one client default exists', clientDefaults === 1, clientDefaults);

    const plain = await createAgencyTemplate({
      agency,
      actorId: String(userId),
      role: 'owner',
      name: 'Plain layout',
      audience: 'client',
      buffer: Buffer.from(PLAIN_TEMPLATE, 'utf8'),
    });
    check(
      'a default cannot be set on a draft',
      await expectAppError(
        () =>
          setDefaultAgencyTemplate({
            agencyId,
            actorId: String(userId),
            role: 'owner',
            templateId: plain.template._id,
          }),
        409
      )
    );
    await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId: plain.template._id,
      version: 1,
      tripId: String(trip._id),
    });
    await activateAgencyTemplateVersion({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId: plain.template._id,
      version: 1,
    });
    await setDefaultAgencyTemplate({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId: plain.template._id,
    });
    const defaultsAfterSwap = await AgencyTemplate.find({
      agencyId,
      audience: 'client',
      isDefault: true,
    }).lean();
    check(
      'promoting a new default clears the previous one',
      defaultsAfterSwap.length === 1 &&
        String(defaultsAfterSwap[0]._id) === plain.template._id,
      defaultsAfterSwap.map((entry) => entry.name)
    );

    // 11. Archiving retires the template but never rewrites pinned exports.
    const archived = await archiveAgencyTemplate({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
    });
    check(
      'archiving clears status and the default flag',
      archived.status === 'archived' && archived.isDefault === false,
      archived.status
    );
    check(
      'an archived template is not selectable for new exports',
      await expectAppError(() => getAgencyTemplate(agencyId, templateId), 404)
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
      'no new version can be uploaded while archived',
      await expectAppError(
        () =>
          addAgencyTemplateVersion({
            agency,
            actorId: String(userId),
            role: 'owner',
            templateId,
            buffer: Buffer.from(DAY_IMAGE_TEMPLATE, 'utf8'),
          }),
        409
      )
    );
    check(
      'an archived template cannot become the default',
      await expectAppError(
        () =>
          setDefaultAgencyTemplate({
            agencyId,
            actorId: String(userId),
            role: 'owner',
            templateId,
          }),
        409
      )
    );
    const viewerListAfter = await listAgencyTemplates({ agencyId, role: 'viewer' });
    check(
      'viewers no longer see the archived template',
      !viewerListAfter.some((entry) => entry._id === templateId)
    );

    // A retry of the pinned v1 job still renders after activation moved on
    // and the template was archived.
    await AgencyExport.updateOne({ _id: job1._id }, { $set: { status: 'queued' } });
    await processAgencyExport(String(job1._id));
    const retried = await AgencyExport.findById(job1._id);
    check(
      'a retry keeps the pinned version after archive',
      retried?.status === 'ready' && retried.templateVersion === 1,
      { status: retried?.status, templateVersion: retried?.templateVersion }
    );

    // 12. Lifecycle actions leave tenant-scoped audit rows.
    const audits = await AgencyAudit.countDocuments({
      agencyId,
      action: { $in: ['template.created', 'template.previewed', 'template.activated', 'template.archived', 'template.default_set'] },
    });
    check('lifecycle actions are audited', audits >= 7, audits);
  } finally {
    for (const key of renderedKeys) {
      await removeAgencyExportFile(key).catch(() => undefined);
    }
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
    await fs.rm(templateRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(assetRoot, { recursive: true, force: true }).catch(() => undefined);
    if (previousTemplateDir === undefined) delete process.env.AGENCY_TEMPLATE_DIR;
    else process.env.AGENCY_TEMPLATE_DIR = previousTemplateDir;
    if (previousAssetDir === undefined) delete process.env.AGENCY_ASSET_DIR;
    else process.env.AGENCY_ASSET_DIR = previousAssetDir;
  }

  if (failures > 0) {
    console.error(`\n${failures} A6 smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A6 smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
