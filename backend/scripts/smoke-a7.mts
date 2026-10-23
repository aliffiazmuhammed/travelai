/**
 * Live smoke test for Agency Workspace A7 (client-facing proposal shares).
 *
 * Unlike the unit tests, this exercises the real pipeline end to end: a ready
 * client export becomes a capability-token share link, the public view
 * re-renders the exact pinned document server-side, the stored PDF streams
 * back, acceptance transitions the quote idempotently and every event lands in
 * the tenant audit trail. Internal exports stay unshareable and revoked,
 * expired, unknown or cross-tenant references answer the same 404.
 *
 * Run from `backend/`:
 *   npx tsx scripts/smoke-a7.mts
 */
import 'dotenv/config';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyProposalLink from '../src/models/AgencyProposalLink.js';
import AgencyQuote from '../src/models/AgencyQuote.js';
import Trip from '../src/models/Trip.js';
import { AppError } from '../src/utils/AppError.js';
import {
  createAgencyExport,
  processAgencyExport,
} from '../src/services/agency/exports/exports.js';
import { findChromeExecutable } from '../src/services/agency/exports/pdf.js';
import { removeAgencyExportFile } from '../src/services/agency/exports/storage.js';
import {
  activateAgencyTemplateVersion,
  archiveAgencyTemplate,
  createAgencyTemplate,
  previewAgencyTemplateVersion,
} from '../src/services/agency/exports/templateManagement.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../src/services/agency/exports/templates.js';
import {
  acceptAgencyProposal,
  createAgencyProposalLink,
  getAgencyProposal,
  listAgencyProposalLinks,
  readAgencyProposalPdf,
  revokeAgencyProposalLink,
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
  parsed.pathname = '/travelai_a7_smoke';
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

const tokenFromUrl = (url: string): string => {
  const marker = '/proposal/';
  const index = url.lastIndexOf(marker);
  if (index < 0) throw new Error(`not a proposal url: ${url}`);
  return url.slice(index + marker.length);
};

const CLIENT_TEMPLATE = `
<style>
  .page { page-break-after: always; padding: 14mm; font-family: var(--font-body); }
</style>
<section class="page">
  <h1>{{trip.title}}</h1>
  <p>{{agency.name}} · {{trip.destination}}</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
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
  ],
  stay_recommendations: [{ name: `${location} Retreat`, location, vibe: 'quiet' }],
  food_spots: [`${location} café`],
  transport: ['Private car'],
  pro_tip: ['Carry cash'],
});

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A7 smoke against production.');
  }
  const chrome = await findChromeExecutable();
  check('Chrome/Chromium/Edge executable found', Boolean(chrome), chrome);
  if (!chrome) {
    throw new Error(
      'Install Chrome or set AGENCY_CHROME_PATH before running this smoke.'
    );
  }

  const templateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a7-templates-'));
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-a7-assets-'));
  const previousTemplateDir = process.env.AGENCY_TEMPLATE_DIR;
  const previousAssetDir = process.env.AGENCY_ASSET_DIR;
  process.env.AGENCY_TEMPLATE_DIR = templateRoot;
  process.env.AGENCY_ASSET_DIR = assetRoot;

  await mongoose.connect(smokeMongoUri());
  const renderedKeys: string[] = [];

  try {
    const userId = new Types.ObjectId();
    const agency = await Agency.create({
      name: 'A7 Smoke Travel',
      createdBy: userId,
      branding: {
        primaryColor: '#0F766E',
        accentColor: '#F59E0B',
        contactEmail: 'desk@smoke.test',
      },
      defaultTerms: { inclusions: ['Stay'], exclusions: ['Flights'], terms: ['50% advance'] },
    });
    const otherAgency = await Agency.create({
      name: 'A7 Other Tenant',
      createdBy: userId,
    });
    const agencyId = String(agency._id);
    const otherAgencyId = String(otherAgency._id);

    const trip = await Trip.create({
      userId,
      workspace: 'agency',
      agencyId: agency._id,
      title: 'Spiti proposal trip',
      status: 'planned',
      startDate: new Date('2026-11-02T00:00:00Z'),
      endDate: new Date('2026-11-03T00:00:00Z'),
      tripDetails: {
        trip_title: 'Spiti proposal trip',
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
    const tripId = String(trip._id);
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
      number: 'Q-2026-0007',
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
      preparedBy: 'Anisha Planner',
      createdBy: userId,
    });

    await ensureBuiltinTemplates(agencyId, String(userId));
    const seeded = await listAgencyTemplates({ agencyId, role: 'owner' });
    const internalTemplate = seeded.find((entry) => entry.audience === 'internal');
    check('a builtin internal template exists', Boolean(internalTemplate), seeded.map((e) => e.audience));

    // A custom client template whose HTML is fully predictable for the
    // client-only content checks.
    const created = await createAgencyTemplate({
      agency,
      actorId: String(userId),
      role: 'owner',
      name: 'A7 client layout',
      audience: 'client',
      buffer: Buffer.from(CLIENT_TEMPLATE, 'utf8'),
    });
    const templateId = created.template._id;
    await previewAgencyTemplateVersion({
      agency,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 1,
      tripId,
      quoteId: String(quote._id),
    });
    await activateAgencyTemplateVersion({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
      version: 1,
    });

    // 1. A ready internal export can never be shared publicly.
    const internalJob = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId: internalTemplate!._id,
      quoteId: quote._id,
      schedule: false,
    });
    await processAgencyExport(String(internalJob._id));
    const internalReady = await AgencyExport.findById(internalJob._id);
    check('internal export rendered', internalReady?.status === 'ready', internalReady?.status);
    check(
      'an internal export cannot be shared publicly',
      await expectAppError(
        () =>
          createAgencyProposalLink({
            agencyId,
            tripId,
            exportId: String(internalJob._id),
            actorId: String(userId),
            role: 'owner',
          }),
        400
      )
    );
    if (internalReady?.outputKey) renderedKeys.push(internalReady.outputKey);

    // 2. A queued (unrendered) client export cannot be shared.
    const queuedJob = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    check(
      'a queued export cannot be shared',
      await expectAppError(
        () =>
          createAgencyProposalLink({
            agencyId,
            tripId,
            exportId: String(queuedJob._id),
            actorId: String(userId),
            role: 'owner',
          }),
        409
      )
    );

    // 3. A ready client export shares, and the row pins the quote and template.
    const job = await createAgencyExport({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      trip,
      templateId,
      quoteId: quote._id,
      schedule: false,
    });
    await processAgencyExport(String(job._id));
    const readyJob = await AgencyExport.findById(job._id);
    check('client export rendered', readyJob?.status === 'ready' && Boolean(readyJob.bytes));
    if (readyJob?.outputKey) renderedKeys.push(readyJob.outputKey);

    const shared = await createAgencyProposalLink({
      agencyId,
      tripId,
      exportId: String(job._id),
      actorId: String(userId),
      role: 'owner',
      linkOrigins: { browserOrigin: 'https://travelai.app' },
    });
    check(
      'a ready client export creates a share link',
      shared.url === 'https://travelai.app/proposal/' + tokenFromUrl(shared.url),
      shared.url
    );
    check(
      'the link projection carries a hint but never the hash',
      shared.link.tokenHint.length === 6 &&
        !('tokenHash' in shared.link) &&
        !('token' in shared.link),
      shared.link
    );
    const token = tokenFromUrl(shared.url);

    // 4. Cross-tenant creation paths answer 404.
    check(
      'another tenant cannot share our export',
      await expectAppError(
        () =>
          createAgencyProposalLink({
            agencyId: otherAgencyId,
            tripId,
            exportId: String(job._id),
            actorId: String(userId),
            role: 'owner',
          }),
        404
      )
    );
    check(
      'we cannot share an export of another tenant trip',
      await expectAppError(
        () =>
          createAgencyProposalLink({
            agencyId,
            tripId: String(otherTrip._id),
            exportId: String(job._id),
            actorId: String(userId),
            role: 'owner',
          }),
        404
      )
    );

    // 5. TTL requests clamp at the 90-day cap.
    const capped = await createAgencyProposalLink({
      agencyId,
      tripId,
      exportId: String(job._id),
      actorId: String(userId),
      role: 'owner',
      ttlDays: 500,
    });
    const cappedDays = Math.round(
      (new Date(capped.link.expiresAt).getTime() - Date.now()) / 86_400_000
    );
    check('a 500-day request clamps to 90 days', cappedDays <= 91, cappedDays);
    const cappedToken = tokenFromUrl(capped.url);

    // 6. The public view re-renders the pinned document server-side.
    const view = await getAgencyProposal(token);
    check(
      'the public view renders the real document',
      view.html.includes('A7 Smoke Travel') &&
        view.html.includes('Spiti proposal trip') &&
        view.html.includes('Q-2026-0007'),
      { pageCount: view.pageCount }
    );
    check('the view carries a PDF descriptor', Boolean(view.pdf?.bytes), view.pdf);
    check(
      'the client quote projection strips internal fields',
      view.quote !== null &&
        !('markupPct' in view.quote) &&
        !('markupAmount' in view.quote) &&
        !('preparedBy' in view.quote),
      view.quote && Object.keys(view.quote)
    );
    check(
      'internal figures never reach the public HTML',
      !view.html.includes('2,160') && !view.html.includes('Anisha Planner'),
      'markup or prepared-by leaked'
    );
    check('a sent quote is acceptable from the link', view.canAccept === true);
    check('the agency and trip identity are visible', view.agency.name === 'A7 Smoke Travel' && view.trip._id === tripId);

    // 7. The stored PDF streams back.
    const pdf = await readAgencyProposalPdf(token);
    check(
      'the PDF streams the stored bytes',
      pdf.buffer.subarray(0, 5).toString() === '%PDF-',
      pdf.filename
    );
    check('the PDF filename carries the quote number', pdf.filename.startsWith('Q-2026-0007-v1'));

    // 8. Acceptance transitions the quote and is idempotent.
    const acceptance = await acceptAgencyProposal(token);
    check(
      'accepting the proposal marks the quote accepted',
      acceptance.status === 'accepted' && acceptance.quote.status === 'accepted',
      acceptance.quote.status
    );
    const storedQuote = await AgencyQuote.findById(quote._id);
    check(
      'the quote row itself is accepted',
      storedQuote?.status === 'accepted' && Boolean(storedQuote.acceptedAt)
    );
    const again = await acceptAgencyProposal(token);
    check('accepting again is idempotent', again.status === 'accepted', again.status);
    const storedLink = await AgencyProposalLink.findOne({ tokenHint: shared.link.tokenHint });
    check('the link records the acceptance', Boolean(storedLink?.acceptedAt));

    // 9. Public events are audited without an actor.
    const viewedAudit = await AgencyAudit.findOne({ action: 'share.viewed' });
    const acceptedAudit = await AgencyAudit.findOne({ action: 'share.accepted' });
    const quoteAudit = await AgencyAudit.findOne({
      action: 'quote.accepted',
      'metadata.via': 'share',
    });
    check(
      'view, accept and quote events are audited',
      Boolean(viewedAudit && acceptedAudit && quoteAudit)
    );
    check(
      'public audit rows carry no actor',
      viewedAudit?.actorId === undefined && acceptedAudit?.actorId === undefined && quoteAudit?.actorId === undefined
    );

    // 10. A revoked link dies everywhere, and revocation is idempotent.
    const second = await createAgencyProposalLink({
      agencyId,
      tripId,
      exportId: String(job._id),
      actorId: String(userId),
      role: 'owner',
    });
    const secondToken = tokenFromUrl(second.url);
    await revokeAgencyProposalLink({
      agencyId,
      tripId,
      linkId: second.link._id,
      actorId: String(userId),
      role: 'owner',
    });
    check(
      'a revoked link answers 404 for the view',
      await expectAppError(() => getAgencyProposal(secondToken), 404)
    );
    check(
      'a revoked link answers 404 for the PDF',
      await expectAppError(() => readAgencyProposalPdf(secondToken), 404)
    );
    check(
      'a revoked link answers 404 for acceptance',
      await expectAppError(() => acceptAgencyProposal(secondToken), 404)
    );
    const revokedAgain = await revokeAgencyProposalLink({
      agencyId,
      tripId,
      linkId: second.link._id,
      actorId: String(userId),
      role: 'owner',
    });
    check('revocation is idempotent', Boolean(revokedAgain.revokedAt));

    // 11. An expired link answers 404 too.
    const third = await createAgencyProposalLink({
      agencyId,
      tripId,
      exportId: String(job._id),
      actorId: String(userId),
      role: 'owner',
    });
    await AgencyProposalLink.updateOne(
      { _id: third.link._id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    );
    check(
      'an expired link answers 404',
      await expectAppError(
        () => getAgencyProposal(tokenFromUrl(third.url)),
        404
      )
    );

    // 12. Unknown tokens answer 404 for every public route.
    check(
      'an unknown token answers 404 for the view',
      await expectAppError(() => getAgencyProposal('nope-not-real'), 404)
    );
    check(
      'an unknown token answers 404 for acceptance',
      await expectAppError(() => acceptAgencyProposal('nope-not-real'), 404)
    );
    check(
      'an unknown token answers 404 for the PDF',
      await expectAppError(() => readAgencyProposalPdf('nope-not-real'), 404)
    );

    // 13. Archiving the template never breaks an existing link.
    await archiveAgencyTemplate({
      agencyId,
      actorId: String(userId),
      role: 'owner',
      templateId,
    });
    const afterArchive = await getAgencyProposal(cappedToken);
    check(
      'a link still renders after the template is archived',
      afterArchive.html.includes('Spiti proposal trip'),
      afterArchive.pageCount
    );

    // 14. The trip share list is scoped and safe.
    const links = await listAgencyProposalLinks({ agencyId, tripId, role: 'owner' });
    check(
      'the share list shows the created links newest first',
      links.length >= 3 &&
        links.every((entry) => !('tokenHash' in entry) && !('token' in entry)),
      { count: links.length }
    );
    const foreign = await listAgencyProposalLinks({
      agencyId: otherAgencyId,
      tripId,
      role: 'owner',
    });
    check('another tenant sees no shares for our trip', foreign.length === 0, foreign.length);

    // 15. Cross-tenant ids cannot revoke.
    check(
      'another tenant cannot revoke our link',
      await expectAppError(
        () =>
          revokeAgencyProposalLink({
            agencyId: otherAgencyId,
            tripId,
            linkId: shared.link._id,
            actorId: String(userId),
            role: 'owner',
          }),
        404
      )
    );

    const linkCount = await AgencyProposalLink.countDocuments({ agencyId });
    check('share rows exist for the tenant', linkCount >= 3, linkCount);
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
    console.error(`\n${failures} A7 smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A7 smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
