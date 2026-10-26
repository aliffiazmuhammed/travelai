/**
 * Live IDOR smoke for Agency Workspace A9 (tenant-isolation review).
 *
 * Seeds two tenants with parallel object graphs (trips, clients, assets,
 * templates, exports, proposal links, invites, members) and then probes every
 * mutation/read service with tenant A's context and tenant B's object ids.
 * Every probe must answer 404 — never 403, never success — and B's rows must
 * be byte-identical afterwards (no cross-tenant writes).
 *
 * The two service-level findings this smoke locks in:
 * - saveQuote rejects a foreign tripId before allocating a quote number;
 * - updateAgencyTrip rejects a trip document from another tenant.
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyAsset from '../src/models/AgencyAsset.js';
import AgencyClient from '../src/models/AgencyClient.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyInvite from '../src/models/AgencyInvite.js';
import AgencyMember from '../src/models/AgencyMember.js';
import AgencyProposalLink from '../src/models/AgencyProposalLink.js';
import AgencyTemplate from '../src/models/AgencyTemplate.js';
import Trip from '../src/models/Trip.js';
import User from '../src/models/User.js';
import { AppError } from '../src/utils/AppError.js';
import { getAgencyAsset, readAgencyAssetContent, deleteAgencyAsset } from '../src/services/agency/assets.js';
import { updateAgencyClient, deleteAgencyClient } from '../src/services/agency/clients.js';
import { changeAgencyMemberRole, removeAgencyMember } from '../src/services/agency/members.js';
import { revokeAgencyInvite } from '../src/services/agency/invites.js';
import { saveQuote } from '../src/services/agency/quotes.js';
import { archiveAgencyTrip, updateAgencyTrip } from '../src/services/agency/trips.js';
import {
  createAgencyProposalLink,
  revokeAgencyProposalLink,
} from '../src/services/agency/proposals.js';
import {
  listAgencyExports,
  readAgencyExportDownload,
  retryAgencyExport,
} from '../src/services/agency/exports/exports.js';
import { signExportDownload } from '../src/services/agency/exports/signing.js';
import {
  activateAgencyTemplateVersion,
  archiveAgencyTemplate,
  listAgencyTemplateVersions,
  setDefaultAgencyTemplate,
  updateAgencyTemplateDetails,
} from '../src/services/agency/exports/templateManagement.js';

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
  parsed.pathname = '/travelai_a9_security_smoke';
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

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A9 security smoke against production.');
  }

  await mongoose.connect(smokeMongoUri());

  try {
    const agencyA = await Agency.create({ name: 'A9 Alpha', slug: 'a9-alpha' });
    const agencyB = await Agency.create({ name: 'A9 Beta', slug: 'a9-beta' });
    const A = String(agencyA._id);
    const B = String(agencyB._id);

    const userA = await User.create({
      email: 'alpha.owner@smoke.test',
      password: 'not-a-real-hash',
      name: 'Alpha Owner',
      accountType: 'agency',
      agencyId: agencyA._id,
    });
    const plannerA = await User.create({
      email: 'alpha.planner@smoke.test',
      password: 'not-a-real-hash',
      name: 'Alpha Planner',
      accountType: 'agency',
      agencyId: agencyA._id,
    });
    const userB = await User.create({
      email: 'beta.owner@smoke.test',
      password: 'not-a-real-hash',
      name: 'Beta Owner',
      accountType: 'agency',
      agencyId: agencyB._id,
    });

    await AgencyMember.create([
      { agencyId: agencyA._id, userId: userA._id, role: 'owner', joinedAt: new Date() },
      { agencyId: agencyA._id, userId: plannerA._id, role: 'planner', joinedAt: new Date() },
      { agencyId: agencyB._id, userId: userB._id, role: 'owner', joinedAt: new Date() },
    ]);

    const tripA = await Trip.create({
      userId: userA._id,
      workspace: 'agency',
      agencyId: agencyA._id,
      title: 'Alpha trip',
      status: 'planned',
      tripDetails: { trip_title: 'Alpha trip', duration_days: 2 },
    });
    const tripB = await Trip.create({
      userId: userB._id,
      workspace: 'agency',
      agencyId: agencyB._id,
      title: 'Beta trip',
      status: 'planned',
      tripDetails: { trip_title: 'Beta trip', duration_days: 2 },
    });
    const tripBId = String(tripB._id);

    const clientB = await AgencyClient.create({
      agencyId: agencyB._id,
      name: 'Beta Client',
      createdBy: userB._id,
    });
    const assetB = await AgencyAsset.create({
      agencyId: agencyB._id,
      kind: 'logo',
      storageKey: 'a9-smoke/beta-logo.png',
      mime: 'image/png',
      bytes: 42,
      createdBy: userB._id,
    });
    const templateB = await AgencyTemplate.create({
      agencyId: agencyB._id,
      name: 'Beta template',
      engine: 'html',
      status: 'active',
      version: 1,
      schemaVersion: 1,
      audience: 'client',
      isDefault: false,
      createdBy: userB._id,
    });
    const exportB = await AgencyExport.create({
      agencyId: agencyB._id,
      tripId: tripB._id,
      templateId: templateB._id,
      templateVersion: 1,
      templateName: 'Beta template',
      audience: 'internal',
      format: 'pdf',
      status: 'failed',
      attempts: 1,
      requestedBy: userB._id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const shareB = await AgencyProposalLink.create({
      agencyId: agencyB._id,
      tripId: tripB._id,
      quoteId: new Types.ObjectId(),
      exportId: exportB._id,
      tokenHash: 'a'.repeat(64),
      tokenHint: 'beta99',
      createdBy: userB._id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const inviteB = await AgencyInvite.create({
      agencyId: agencyB._id,
      createdBy: userB._id,
      tokenHash: 'b'.repeat(64),
      tokenHint: 'beta88',
      role: 'planner',
      kind: 'link',
      maxUses: 1,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const quoteBase = {
      role: 'planner' as const,
      userId: String(plannerA._id),
      currency: 'INR',
      lineItems: [{ label: 'Stay', quantity: 1, unitPrice: 5000 }],
      markupPct: 10,
      taxPct: 5,
      discount: 0,
      validUntil,
      client: { adults: 2, children: 0, name: 'Alpha Client' },
    };

    // 1. Trips: foreign documents and ids never mutate another tenant's rows.
    check(
      'updating a foreign trip document answers 404',
      await expectAppError(
        () =>
          updateAgencyTrip(tripB, {
            agencyId: A,
            role: 'admin',
            assignedTo: String(plannerA._id),
          }),
        404
      )
    );
    const tripBAfter = await Trip.findById(tripB._id).lean();
    check(
      'the foreign trip row is untouched',
      tripBAfter?.assignedTo === undefined && tripBAfter?.title === 'Beta trip'
    );
    check(
      'archiving a foreign trip id answers 404',
      await expectAppError(
        () =>
          archiveAgencyTrip({
            agencyId: A,
            tripId: tripBId,
            role: 'admin',
            actorId: String(userA._id),
          }),
        404
      )
    );

    // 2. Assets.
    check(
      'reading a foreign asset row answers 404',
      await expectAppError(() => getAgencyAsset(A, String(assetB._id)), 404)
    );
    check(
      'foreign asset content answers 404',
      await expectAppError(
        () => readAgencyAssetContent(A, String(assetB._id)),
        404
      )
    );
    check(
      'deleting a foreign asset answers 404',
      await expectAppError(() => deleteAgencyAsset(A, String(assetB._id)), 404)
    );

    // 3. Clients.
    check(
      'updating a foreign client answers 404',
      await expectAppError(
        () =>
          updateAgencyClient(A, String(clientB._id), {
            name: 'Stolen client',
          }),
        404
      )
    );
    check(
      'deleting a foreign client answers 404',
      await expectAppError(() => deleteAgencyClient(A, String(clientB._id)), 404)
    );

    // 4. Templates.
    check(
      'listing versions of a foreign template answers 404',
      await expectAppError(
        () =>
          listAgencyTemplateVersions({
            agencyId: A,
            role: 'admin',
            templateId: String(templateB._id),
          }),
        404
      )
    );
    check(
      'updating a foreign template answers 404',
      await expectAppError(
        () =>
          updateAgencyTemplateDetails({
            agencyId: A,
            role: 'admin',
            actorId: String(userA._id),
            templateId: String(templateB._id),
            name: 'Stolen template',
          }),
        404
      )
    );
    check(
      'archiving a foreign template answers 404',
      await expectAppError(
        () =>
          archiveAgencyTemplate({
            agencyId: A,
            role: 'admin',
            actorId: String(userA._id),
            templateId: String(templateB._id),
          }),
        404
      )
    );
    check(
      'defaulting a foreign template answers 404',
      await expectAppError(
        () =>
          setDefaultAgencyTemplate({
            agencyId: A,
            role: 'admin',
            actorId: String(userA._id),
            templateId: String(templateB._id),
          }),
        404
      )
    );
    check(
      'activating a foreign template version answers 404',
      await expectAppError(
        () =>
          activateAgencyTemplateVersion({
            agencyId: A,
            role: 'admin',
            actorId: String(userA._id),
            templateId: String(templateB._id),
            version: 1,
          }),
        404
      )
    );

    // 5. Exports.
    check(
      'retrying a foreign export answers 404',
      await expectAppError(
        () =>
          retryAgencyExport({
            agencyId: A,
            tripId: String(tripA._id),
            exportId: String(exportB._id),
            role: 'planner',
            actorId: String(plannerA._id),
          }),
        404
      )
    );
    const expiresAt = Date.now() + 60_000;
    check(
      'a signed download for a foreign export answers 404',
      await expectAppError(
        () =>
          readAgencyExportDownload({
            agencyId: A,
            exportId: String(exportB._id),
            expiresAt,
            signature: signExportDownload({
              agencyId: A,
              exportId: String(exportB._id),
              expiresAt,
            }),
            actorId: String(userA._id),
            role: 'admin',
          }),
        404
      )
    );
    const foreignTripExports = await listAgencyExports({
      agencyId: A,
      tripId: tripBId,
      role: 'admin',
    });
    check(
      'export history for a foreign trip id is empty',
      foreignTripExports.length === 0,
      foreignTripExports
    );

    // 6. Quotes: the save path must reject a foreign trip before writing.
    check(
      'saving a quote for a foreign trip answers 404',
      await expectAppError(
        () => saveQuote({ agencyId: A, tripId: tripBId, ...quoteBase }),
        404
      )
    );

    // 7. Members.
    check(
      'changing a foreign member role answers 404',
      await expectAppError(
        () =>
          changeAgencyMemberRole({
            agencyId: A,
            actorId: String(userA._id),
            actorRole: 'owner',
            targetUserId: String(userB._id),
            nextRole: 'planner',
          }),
        404
      )
    );
    check(
      'removing a foreign member answers 404',
      await expectAppError(
        () =>
          removeAgencyMember({
            agencyId: A,
            actorId: String(userA._id),
            actorRole: 'owner',
            targetUserId: String(userB._id),
          }),
        404
      )
    );

    // 8. Invites and shares.
    check(
      'revoking a foreign invite answers 404',
      await expectAppError(() => revokeAgencyInvite(A, String(inviteB._id)), 404)
    );
    check(
      'revoking a foreign share link answers 404',
      await expectAppError(
        () =>
          revokeAgencyProposalLink({
            agencyId: A,
            tripId: String(tripA._id),
            linkId: String(shareB._id),
            role: 'planner',
            actorId: String(plannerA._id),
          }),
        404
      )
    );
    check(
      'sharing a foreign export answers 404',
      await expectAppError(
        () =>
          createAgencyProposalLink({
            agencyId: A,
            tripId: String(tripA._id),
            exportId: String(exportB._id),
            role: 'planner',
            actorId: String(plannerA._id),
          }),
        404
      )
    );

    // 9. Tenant B is untouched: no probe created or mutated a foreign row.
    const foreignQuoteCount = await mongoose.connection.db
      .collection('agencyquotes')
      .countDocuments({ agencyId: agencyA._id, tripId: tripB._id });
    check('no quote row was minted for the foreign trip', foreignQuoteCount === 0);
    const clientBAfter = await AgencyClient.findById(clientB._id).lean();
    check(
      'the foreign client row is untouched',
      clientBAfter?.name === 'Beta Client'
    );
    const templateBAfter = await AgencyTemplate.findById(templateB._id).lean();
    check(
      'the foreign template row is untouched',
      templateBAfter?.status === 'active' && templateBAfter?.name === 'Beta template'
    );
    const shareBAfter = await AgencyProposalLink.findById(shareB._id).lean();
    const inviteBAfter = await AgencyInvite.findById(inviteB._id).lean();
    check(
      'the foreign share and invite stay live',
      shareBAfter?.revokedAt === undefined && inviteBAfter?.revokedAt === undefined
    );
    const exportBAfter = await AgencyExport.findById(exportB._id).lean();
    check(
      'the foreign export row is untouched',
      exportBAfter?.status === 'failed' && exportBAfter?.attempts === 1
    );

    // 10. The hardened paths still work inside their own tenant.
    const updated = await updateAgencyTrip(tripA, {
      agencyId: A,
      role: 'admin',
      assignedTo: String(plannerA._id),
    });
    check(
      'same-tenant assignment still works',
      String(updated.assignedTo) === String(plannerA._id)
    );
    const ownQuote = await saveQuote({
      agencyId: A,
      tripId: String(tripA._id),
      ...quoteBase,
    });
    check(
      'same-tenant quote save still works',
      ownQuote.status === 'draft' && ownQuote.version === 1
    );
  } finally {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} A9 security smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll A9 security smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
