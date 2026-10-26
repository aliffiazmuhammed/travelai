/**
 * Simulated pilot for Agency Workspace A9 (hardening, pilot and launch).
 *
 * Walks the full agency lifecycle end-to-end against the real services and a
 * throwaway database, exactly as a pilot agency would experience it: agency
 * creation, ops plan provisioning, invites/seat limits, branding and assets,
 * trips, clients, quotes, exports (client + internal), public share links,
 * limits, audit and cross-tenant 404s. It doubles as the executable form of
 * the pilot acceptance checklist in docs/agency-operations-runbook.md.
 *
 * The ops plan path needs the same secret the API checks, so run with:
 *   AGENCY_OPS_KEY=smoke-ops-key npx tsx scripts/smoke-a9-pilot.mts
 *
 * PDF rendering needs a Chrome/Edge binary (AGENCY_CHROME_PATH override).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyAsset from '../src/models/AgencyAsset.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyMember from '../src/models/AgencyMember.js';
import AgencyTemplate from '../src/models/AgencyTemplate.js';
import AgencyTemplateVersion from '../src/models/AgencyTemplateVersion.js';
import AgencyClient from '../src/models/AgencyClient.js';
import AgencyInvite from '../src/models/AgencyInvite.js';
import AgencyProposalLink from '../src/models/AgencyProposalLink.js';
import AgencyQuote from '../src/models/AgencyQuote.js';
import Trip from '../src/models/Trip.js';
import User from '../src/models/User.js';
import { AppError } from '../src/utils/AppError.js';
import { updateAgencyDetails } from '../src/services/agency/agencies.js';
import { listAgencyAudit } from '../src/services/agency/audit.js';
import { changeAgencyPlan, assertExportQuota, assertSeatAvailable, assertStorageQuota } from '../src/services/agency/plan.js';
import { activateAgencyInvite, createAgencyInvite, previewAgencyInvite } from '../src/services/agency/invites.js';
import { uploadAgencyAsset, getAgencyAsset, readAgencyAssetContent } from '../src/services/agency/assets.js';
import { removeAgencyAssetFile } from '../src/services/agency/assetStorage.js';
import {
  archiveAgencyTrip,
  createAgencyTrip,
  listAgencyTrips,
  unarchiveAgencyTrip,
  updateAgencyTrip,
} from '../src/services/agency/trips.js';
import { createAgencyClient } from '../src/services/agency/clients.js';
import { projectQuoteForClient, saveQuote, sendQuote } from '../src/services/agency/quotes.js';
import {
  createAgencyExport,
  previewAgencyExport,
} from '../src/services/agency/exports/exports.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../src/services/agency/exports/templates.js';
import {
  createAgencyProposalLink,
  getAgencyProposal,
  readAgencyProposalPdf,
  revokeAgencyProposalLink,
  acceptAgencyProposal,
} from '../src/services/agency/proposals.js';
import { readAgencyExportFile, removeAgencyExportFile } from '../src/services/agency/exports/storage.js';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) console.log('     detail:', JSON.stringify(detail)?.slice(0, 500));
  }
}

function smokeMongoUri(): string {
  const configured =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/travelai';
  const parsed = new URL(configured);
  parsed.pathname = '/travelai_a9_pilot_smoke';
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

async function waitForReady(exportId: string): Promise<any> {
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const job = await AgencyExport.findById(exportId).lean();
    if (!job) throw new Error('Export disappeared while waiting.');
    if (job.status === 'ready' || job.status === 'failed') return job;
    if (Date.now() > deadline) throw new Error(`Export ${exportId} never settled.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * PA0 provisioning fixture. Self-service agency creation is gone, so the pilot
 * creates a tenant the way PA3 will: an Agency plus its first agency account
 * (never a personal account) and an owner membership.
 */
async function provisionAgency(input: {
  name: string;
  slug: string;
  email: string;
  password: string;
  ownerName: string;
}) {
  const agency = await Agency.create({
    name: input.name,
    slug: input.slug,
    status: 'active',
  });
  const user = await User.create({
    email: input.email,
    password: await bcrypt.hash(input.password, 12),
    accountType: 'agency',
    agencyId: agency._id,
    status: 'active',
    name: input.ownerName,
  });
  await AgencyMember.create({
    agencyId: agency._id,
    userId: user._id,
    role: 'owner',
    joinedAt: new Date(),
  });
  return { agency, user };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A9 pilot against production.');
  }
  const opsKey = process.env.AGENCY_OPS_KEY;
  if (!opsKey) {
    throw new Error(
      'Set AGENCY_OPS_KEY (e.g. AGENCY_OPS_KEY=smoke-ops-key) before running this pilot.'
    );
  }

  await mongoose.connect(smokeMongoUri());

  const createdFiles: Array<() => Promise<void>> = [];
  const plannerLogin = {
    email: 'planner.a9@pilot.test',
    password: 'pilot-planner-1',
  };
  let plannerId = '';

  try {
    /* 1. Onboarding: agency + first owner (PA0: tenant-scoped agency account). */
    const pilot = await provisionAgency({
      name: 'A9 Pilot Himalayan Trails',
      slug: 'a9-pilot-himalayan-trails',
      email: 'owner.a9@pilot.test',
      password: 'pilot-owner-1',
      ownerName: 'Pilot Owner',
    });
    const agencyId = String(pilot.agency._id);
    const ownerId = String(pilot.user._id);
    check('the pilot agency is created with its owner', Boolean(agencyId));

    /* 2. Ops plan provisioning (secret-gated, like production). */
    const plan = await changeAgencyPlan({
      agencyId,
      opsKey,
      plan: { tierId: 'starter', seats: 2, monthlyExports: 4, storageMb: 8 },
    });
    check(
      'ops provisions a pilot plan (2 seats / 4 exports / 8 MB)',
      plan.seats === 2 && plan.monthlyExports === 4 && plan.storageMb === 8,
      plan
    );

    /* 3. Branding and assets. */
    const logoUpload = await uploadAgencyAsset({
      agencyId,
      userId: String(ownerId),
      kind: 'logo',
      buffer: TINY_PNG,
      declaredMime: 'image/png',
      originalName: 'pilot-logo.png',
    });
    createdFiles.push(async () => {
      const row = await AgencyAsset.findById(logoUpload.asset._id).lean().catch(() => null);
      if (row?.storageKey) await removeAgencyAssetFile(row.storageKey);
    });
    const mascotUpload = await uploadAgencyAsset({
      agencyId,
      userId: String(ownerId),
      kind: 'mascot',
      buffer: TINY_PNG,
      declaredMime: 'image/png',
      originalName: 'pilot-mascot.png',
    });
    createdFiles.push(async () => {
      const row = await AgencyAsset.findById(mascotUpload.asset._id).lean().catch(() => null);
      if (row?.storageKey) await removeAgencyAssetFile(row.storageKey);
    });
    await updateAgencyDetails(agencyId, {
      branding: {
        primaryColor: '#0F766E',
        accentColor: '#F59E0B',
        fontHeading: 'Georgia',
        fontBody: 'Verdana',
        contactEmail: 'hello@pilot.test',
        contactPhone: '+91 99999 00000',
        website: 'https://pilot.test',
      },
      defaultTerms: { inclusions: ['Guided treks'], exclusions: ['Flights'] },
    });
    const storedAgency = await Agency.findById(agencyId).lean();
    check(
      'branding is stored and the logo upload set a private content URL',
      storedAgency?.branding?.primaryColor === '#0F766E' &&
        String(storedAgency?.branding?.logoUrl ?? '').startsWith(`/api/agency/${agencyId}/assets/`),
      storedAgency?.branding
    );
    const logoContent = await readAgencyAssetContent(agencyId, String(logoUpload.asset._id));
    check(
      'the uploaded logo reads back byte-for-byte through the private content path',
      Buffer.compare(logoContent.buffer, TINY_PNG) === 0
    );

    /* 4. Invites and seat limits. */
    const inviteResult = await createAgencyInvite({
      agencyId,
      createdBy: String(ownerId),
      role: 'planner',
      kind: 'link',
      linkOrigins: { sameOrigin: 'http://localhost:8080' },
    });
    const rawToken = inviteResult.link.split('/').pop() as string;
    const preview = await previewAgencyInvite(rawToken);
    check('an invite previews with the agency name before redemption', preview.agency.name === 'A9 Pilot Himalayan Trails');
    const activated = await activateAgencyInvite(rawToken, plannerLogin);
    plannerId = String(activated.user._id);
    check(
      'the planner activates the invite and becomes a member',
      String(activated.agency._id) === agencyId &&
        activated.role === 'planner' &&
        !activated.alreadyMember &&
        activated.user.accountType === 'agency',
      activated
    );
    check(
      'a third seat is refused at 2/2 with an actionable message',
      await expectAppError(
        () =>
          createAgencyInvite({
            agencyId,
            createdBy: String(ownerId),
            role: 'viewer',
            kind: 'link',
          }),
        409
      )
    );

    /* 5. Templates: builtins are available out of the box. */
    await ensureBuiltinTemplates(agencyId, String(ownerId));
    const templates = await listAgencyTemplates({ agencyId, role: 'owner' });
    const clientTemplate = templates.find((entry) => entry.audience === 'client');
    const internalTemplate = templates.find((entry) => entry.audience === 'internal');
    check('builtin client and internal templates exist', Boolean(clientTemplate && internalTemplate));

    /* 6. Trip lifecycle. */
    const trip = await createAgencyTrip({
      agencyId,
      userId: String(ownerId),
      role: 'owner',
      title: 'Everest Base Camp trek',
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      assignedTo: String(plannerId),
    });
    const tripId = String(trip._id);
    const tripRow = await Trip.findById(tripId).lean();
    check('the pilot trip is planned with 3 days', Number(tripRow?.tripDetails?.duration_days) === 3, tripRow?.tripDetails?.duration_days);
    const archived = await archiveAgencyTrip({ agencyId, tripId, actorId: String(ownerId), role: 'owner' });
    check('the trip archives', Boolean((await Trip.findById(tripId).lean())?.archivedAt), archived);
    const listedAfterArchive = await listAgencyTrips({ agencyId, role: 'owner' });
    check('archived trips leave the active library', !listedAfterArchive.some((entry) => String(entry._id) === tripId));
    await unarchiveAgencyTrip({ agencyId, tripId, actorId: String(ownerId), role: 'owner' });
    check('the trip unarchives cleanly', !(await Trip.findById(tripId).lean())?.archivedAt);

    /* 7. Client and quote. */
    const client = await createAgencyClient({
      agencyId,
      createdBy: String(ownerId),
      name: 'Meera Kapoor',
      email: 'meera@pilot.test',
      phone: '+91 88888 11111',
    });
    const clientId = String(client._id);
    await updateAgencyTrip(await Trip.findById(tripId), {
      agencyId,
      role: 'owner',
      clientId,
    });
    const quote = await saveQuote({
      agencyId,
      tripId,
      userId: String(ownerId),
      role: 'owner',
      clientId,
      client: {
        name: 'Meera Kapoor',
        email: 'meera@pilot.test',
        phone: '+91 88888 11111',
        adults: 2,
        children: 0,
      },
      currency: 'INR',
      lineItems: [{ label: 'Base camp permit', quantity: 2, unitPrice: 5000 }],
      markupPct: 12,
      validUntil: '2026-12-15',
    });
    check('a quote v1 saves as a draft with totals', quote.status === 'draft' && quote.total === 11200, {
      status: quote.status,
      total: quote.total,
    });
    const sent = await sendQuote({ agencyId, tripId, role: 'owner' });
    check('the quote is sent to the client', sent.status === 'sent' && sent.version === 1);
    const clientQuote = projectQuoteForClient(sent);
    check(
      'the client quote projection hides margin and preparer fields',
      !('markupPct' in clientQuote) && !('markupAmount' in clientQuote) && !('preparedBy' in clientQuote),
      clientQuote
    );

    /* 8. Exports: client proposal and internal desk copy. */
    // Seed a real activity cost so the internal/client cost-visibility checks
    // below are meaningful (a blank itinerary renders no cost labels at all).
    const tripWithCosts = await Trip.findByIdAndUpdate(
      tripId,
      {
        $set: {
          'tripDetails.day_by_day_itinerary.0.activities': [
            { name: 'Guided acclimatisation walk', approx_cost: 450 },
          ],
        },
      },
      { new: true }
    );
    const clientJob = await createAgencyExport({
      agencyId,
      actorId: String(ownerId),
      role: 'owner',
      trip,
      templateId: clientTemplate!._id,
      quoteId: quote._id,
    });
    const clientReady = await waitForReady(String(clientJob._id));
    check('the client proposal renders to ready', clientReady.status === 'ready', clientReady.error);
    if (clientReady.outputKey) {
      createdFiles.push(() => removeAgencyExportFile(clientReady.outputKey));
    }
    const clientPreview = await previewAgencyExport({
      agencyId,
      role: 'owner',
      trip: tripWithCosts,
      templateId: clientTemplate!._id,
      quoteId: quote._id,
    });
    check(
      'the client preview hides internal costs and the internal badge',
      !clientPreview.html.includes('Approx.') && !clientPreview.html.includes('Internal ·'),
      { pageCount: clientPreview.pageCount }
    );
    check('the client proposal renders 5 pages (cover, overview, 3 days)', clientPreview.pageCount >= 5, clientPreview.pageCount);

    const internalJob = await createAgencyExport({
      agencyId,
      actorId: String(ownerId),
      role: 'owner',
      trip,
      templateId: internalTemplate!._id,
    });
    const internalReady = await waitForReady(String(internalJob._id));
    check('the internal desk copy renders to ready', internalReady.status === 'ready', internalReady.error);
    if (internalReady.outputKey) {
      createdFiles.push(() => removeAgencyExportFile(internalReady.outputKey));
      const pdf = await readAgencyExportFile(internalReady.outputKey);
      check(
        'the rendered export file is a real PDF',
        pdf.subarray(0, 5).toString('latin1') === '%PDF-' && pdf.byteLength > 0,
        pdf.byteLength
      );
    }
    const internalPreview = await previewAgencyExport({
      agencyId,
      role: 'owner',
      trip: tripWithCosts,
      templateId: internalTemplate!._id,
    });
    check(
      'the internal preview carries the internal badge and cost labels',
      internalPreview.html.includes('Internal ·') && internalPreview.html.includes('Approx.'),
      { pageCount: internalPreview.pageCount }
    );

    /* 9. Share: public proposal page, accept, revoke. */
    const share = await createAgencyProposalLink({
      agencyId,
      tripId,
      exportId: String(clientJob._id),
      actorId: String(ownerId),
      role: 'owner',
      ttlDays: 7,
      linkOrigins: { sameOrigin: 'http://localhost:8080' },
    });
    const shareToken = share.url.split('/').pop() as string;
    const publicView = await getAgencyProposal(shareToken);
    check(
      'the public proposal shows the trip and client quote without internal fields',
      publicView.html.includes('Everest Base Camp trek') &&
        !publicView.html.includes('Approx.') &&
        publicView.quote !== null &&
        !('preparedBy' in (publicView.quote ?? {})),
      { pageCount: publicView.pageCount }
    );
    const publicPdf = await readAgencyProposalPdf(shareToken);
    check(
      'the public proposal PDF serves over the token-only route',
      publicPdf.buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    );
    const accepted = await acceptAgencyProposal(shareToken);
    check('the client can accept the proposal from the public page', accepted.status === 'accepted', accepted);
    const revoked = await revokeAgencyProposalLink({
      agencyId,
      tripId,
      linkId: String(share.link._id),
      actorId: String(ownerId),
      role: 'owner',
    });
    check('the owner revokes the share link', revoked.revokedAt !== null);
    check(
      'a revoked link answers 404 on the public route',
      await expectAppError(() => getAgencyProposal(shareToken), 404)
    );

    /* 10. Limits behave at the edges of the pilot plan. */
    check(
      'the quota gate still allows exports at 2/4',
      await assertExportQuota(agencyId).then(() => true, () => false)
    );
    await createAgencyExport({
      agencyId,
      actorId: String(ownerId),
      role: 'owner',
      trip,
      templateId: internalTemplate!._id,
      schedule: false,
    });
    await createAgencyExport({
      agencyId,
      actorId: String(ownerId),
      role: 'owner',
      trip,
      templateId: internalTemplate!._id,
      schedule: false,
    });
    check(
      'the quota gate refuses export 5 of 4',
      await expectAppError(() => assertExportQuota(agencyId), 409)
    );
    check(
      'a storage overrun is refused against the 8 MB cap',
      await expectAppError(() => assertStorageQuota(agencyId, 9 * 1024 * 1024), 409)
    );
    check(
      'the seat gate still refuses a fourth member',
      await expectAppError(() => assertSeatAvailable(agencyId), 409)
    );

    /* 11. Audit trail covers the lifecycle. */
    const audit = await listAgencyAudit({ agencyId, page: 1, limit: 100 });
    const actions = new Set(audit.entries.map((entry: any) => String(entry.action)));
    check(
      'audit records plan, export and share events across the lifecycle',
      actions.has('plan.changed') &&
        actions.has('export.requested') &&
        actions.has('export.completed') &&
        actions.has('share.created') &&
        actions.has('share.accepted') &&
        actions.has('share.revoked'),
      [...actions]
    );

    /* 12. Cross-tenant probes answer 404 (deep coverage lives in smoke-a9-security). */
    const foreign = await provisionAgency({
      name: 'A9 Pilot Foreign Tenant',
      slug: 'a9-pilot-foreign-tenant',
      email: 'owner.foreign@pilot.test',
      password: 'pilot-foreign-1',
      ownerName: 'Foreign Owner',
    });
    const foreignAgency = foreign.agency;
    const foreignOwnerId = String(foreign.user._id);
    const foreignTripDoc = await createAgencyTrip({
      agencyId: foreignAgency._id,
      userId: String(foreignOwnerId),
      role: 'owner',
      title: 'Foreign trip',
      startDate: '2026-12-01',
      endDate: '2026-12-01',
    });
    check(
      'editing a foreign trip answers 404',
      await expectAppError(
        async () =>
          updateAgencyTrip(await Trip.findById(foreignTripDoc._id), {
            agencyId,
            role: 'owner',
            clientId: clientId,
          }),
        404
      )
    );
    check(
      'reading a foreign agency asset answers 404',
      await expectAppError(() => getAgencyAsset(String(foreignAgency._id), String(logoUpload.asset._id)), 404)
    );
    check(
      'minting a quote for a foreign trip answers 404',
      await expectAppError(
        () =>
          saveQuote({
            agencyId,
            tripId: String(foreignTripDoc._id),
            userId: String(ownerId),
            role: 'owner',
            currency: 'INR',
            validUntil: '2026-12-15',
          }),
        404
      )
    );

    console.log(
      failures === 0
        ? '\nA9 simulated pilot PASSED: a pilot agency completed the full lifecycle without developer help.'
        : `\nA9 simulated pilot FAILED with ${failures} failing check(s).`
    );
  } catch (error) {
    failures += 1;
    console.error('A9 simulated pilot crashed:', error);
  } finally {
    for (const remove of createdFiles) {
      await remove().catch(() => undefined);
    }
    await Promise.all([
      Agency.deleteMany({ name: /^A9 Pilot / }),
      AgencyAsset.deleteMany({}),
      AgencyAudit.deleteMany({}),
      AgencyClient.deleteMany({}),
      AgencyExport.deleteMany({}),
      AgencyInvite.deleteMany({}),
      AgencyMember.deleteMany({}),
      AgencyProposalLink.deleteMany({}),
      AgencyQuote.deleteMany({}),
      AgencyTemplate.deleteMany({}),
      AgencyTemplateVersion.deleteMany({}),
      Trip.deleteMany({ workspace: 'agency' }),
    ]);
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
  }
}

main().catch((error) => {
  console.error('A9 simulated pilot crashed before cleanup:', error);
  process.exit(1);
});
