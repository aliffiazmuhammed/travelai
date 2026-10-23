import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyAsset from '../../models/AgencyAsset.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyInvite from '../../models/AgencyInvite.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import AgencyTemplate from '../../models/AgencyTemplate.js';
import AgencyTemplateVersion from '../../models/AgencyTemplateVersion.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyAudit from '../../models/AgencyAudit.js';
import Trip from '../../models/Trip.js';

/**
 * Structural tenancy guarantees that must not depend on a live database:
 * - one person can join an agency at most once;
 * - invite tokens are unique at rest and expire automatically;
 * - invite roles cannot be `owner`.
 */

test('AgencyMember has a unique (agencyId, userId) index', () => {
  const indexes = AgencyMember.schema.indexes();
  const uniqueMembership = indexes.find(
    ([keys, options]) =>
      keys.agencyId === 1 && keys.userId === 1 && options?.unique === true
  );
  assert.ok(uniqueMembership, 'the compound membership index must be unique');
});

test('AgencyInvite stores a unique token hash and expires via TTL', () => {
  const indexes = AgencyInvite.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) => keys.tokenHash === 1 && options?.unique === true
    ),
    'tokenHash must be unique'
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.expiresAt === 1 && options?.expireAfterSeconds === 0
    ),
    'expired invites must be removed by the TTL index'
  );
});

test('Trip has tenant-scoped library and trash indexes', () => {
  const indexes = Trip.schema.indexes();
  const hasAgencyIndex = (order: 1 | -1, field: string) =>
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 &&
        keys.workspace === 1 &&
        keys.isDeleted === 1 &&
        keys[field] === order
    );

  assert.ok(hasAgencyIndex(-1, 'createdAt'), 'agency library index is missing');
  assert.ok(hasAgencyIndex(-1, 'deletedAt'), 'agency trash index is missing');
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 &&
        keys.assignedTo === 1 &&
        keys.isDeleted === 1
    ),
    'assignment index is missing'
  );
});

test('Trip defaults to the personal workspace and tenants agency trips', async () => {
  const userId = new Types.ObjectId();
  const personal = new Trip({ userId, title: 'Personal', tripDetails: {} });
  assert.equal(personal.workspace, 'personal');
  assert.equal(personal.agencyId, undefined);
  await personal.validate();

  const orphanAgency = new Trip({
    userId,
    workspace: 'agency',
    title: 'Agency',
    tripDetails: {},
  });
  await assert.rejects(
    () => orphanAgency.validate(),
    /Agency trips must belong to an agency/
  );

  const agency = new Trip({
    userId,
    workspace: 'agency',
    agencyId: new Types.ObjectId(),
    title: 'Agency',
    tripDetails: {},
  });
  await agency.validate();
  assert.equal(agency.members.length, 0);
});

test('AgencyInvite role validator rejects owner', async () => {
  const invite = new AgencyInvite({
    agencyId: 'a'.repeat(24),
    tokenHash: 'b'.repeat(64),
    tokenHint: 'abc123',
    role: 'owner',
    kind: 'link',
    createdBy: 'c'.repeat(24),
    expiresAt: new Date(Date.now() + 60_000),
    maxUses: 1,
    acceptedBy: [],
  });

  let error: any = null;
  try {
    await invite.validate();
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'owner must fail validation');
  assert.ok(error.errors?.role, 'the role path must be the failure');
});

test('AgencyAsset storage keys are unique and listing is tenant-scoped', () => {
  const indexes = AgencyAsset.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) => keys.storageKey === 1 && options?.unique === true
    ),
    'storageKey must be unique'
  );
  assert.ok(
    indexes.some(
      ([keys]) => keys.agencyId === 1 && keys.createdAt === -1
    ),
    'the tenant asset library needs an agencyId + createdAt index'
  );
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 && keys.kind === 1 && keys.createdAt === -1
    ),
    'the by-kind asset index is missing'
  );
});

test('AgencyAsset rejects an unknown kind and a missing owner', async () => {
  const asset = new AgencyAsset({
    kind: 'video',
    storageKey: `${'a'.repeat(24)}/${'b'.repeat(24)}.png`,
    mime: 'image/png',
    bytes: 12,
  });

  let error: any = null;
  try {
    await asset.validate();
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'invalid assets must fail validation');
  assert.ok(error.errors?.kind, 'the kind path must be the failure');
  assert.ok(error.errors?.agencyId, 'agencyId is required');
  assert.ok(error.errors?.createdBy, 'createdBy is required');
});

test('Agency branding stores mascot, typography and GSTIN', async () => {
  const agency = new Agency({
    name: 'Brand Co',
    gstin: '27aapfu0939f1zv',
    branding: {
      mascotUrl: `/api/agency/${'a'.repeat(24)}/assets/${'b'.repeat(24)}/content`,
      fontHeading: 'Fraunces',
      fontBody: 'Inter',
    },
    createdBy: new Types.ObjectId(),
  });

  await agency.validate();
  assert.equal(agency.gstin, '27AAPFU0939F1ZV');
  assert.ok(agency.branding.mascotUrl?.startsWith('/api/agency/'));
  assert.equal(agency.branding.fontHeading, 'Fraunces');
  assert.equal(agency.branding.fontBody, 'Inter');
});

test('Agency starts with empty quote defaults and hides its sequence', () => {
  const agency = new Agency({
    name: 'Defaults Co',
    createdBy: new Types.ObjectId(),
  });

  assert.deepEqual(agency.defaultTerms.inclusions, []);
  assert.deepEqual(agency.defaultTerms.exclusions, []);
  assert.deepEqual(agency.defaultTerms.terms, []);
  assert.equal(
    (Agency.schema.path('quoteCounter') as any)?.options?.select,
    false,
    'the raw quote counter must never be selected by default'
  );
});

test('AgencyClient is tenant-scoped and listed by name', () => {
  const indexes = AgencyClient.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys]) => keys.agencyId === 1 && keys.name === 1
    ),
    'the directory needs an agencyId + name index'
  );
  assert.equal(
    (Trip.schema.path('clientId') as any)?.options?.ref,
    'AgencyClient',
    'Trip.clientId must reference the directory model'
  );
});

test('AgencyQuote enforces per-trip versions and per-agency numbers', () => {
  const indexes = AgencyQuote.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.agencyId === 1 &&
        keys.tripId === 1 &&
        keys.version === 1 &&
        options?.unique === true
    ),
    'one version row per trip must be unique'
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.agencyId === 1 &&
        keys.number === 1 &&
        keys.version === 1 &&
        options?.unique === true
    ),
    'quote number + version must be unique inside an agency'
  );
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 &&
        keys.status === 1 &&
        keys.validUntil === 1
    ),
    'the expiring-quotes index is missing'
  );
});

test('AgencyQuote validates a client snapshot and status enum', async () => {
  const quote = new AgencyQuote({
    agencyId: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    number: 'Q-2026-0001',
    version: 1,
    status: 'draft',
    client: { name: 'Asha Rao', adults: 2, children: 1 },
    currency: 'inr',
    lineItems: [
      { label: 'Hotel', quantity: 2, unitPrice: 100, total: 200 },
    ],
    subtotal: 200,
    markupPct: 10,
    markupAmount: 20,
    taxPct: 5,
    taxAmount: 11,
    discount: 0,
    total: 231,
    perPerson: 77,
    validUntil: new Date(Date.now() + 86_400_000),
    inclusions: ['Stay'],
    createdBy: new Types.ObjectId(),
  });

  await quote.validate();
  assert.equal(quote.currency, 'INR');

  const invalid = new AgencyQuote({
    agencyId: new Types.ObjectId(),
    tripId: new Types.ObjectId(),
    number: 'Q-2026-0002',
    version: 1,
    status: 'paid',
    client: { name: 'Asha Rao', adults: 2, children: 0 },
    currency: 'INR',
    validUntil: new Date(),
    createdBy: new Types.ObjectId(),
  });
  await assert.rejects(() => invalid.validate(), /paid/);
});

test('AgencyTemplate keeps built-ins unique and one active default per audience', () => {
  const indexes = AgencyTemplate.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.agencyId === 1 &&
        keys.builtinKey === 1 &&
        options?.unique === true &&
        options?.partialFilterExpression?.builtinKey?.$exists === true
    ),
    'concurrent built-in seeding needs a partial unique key'
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.agencyId === 1 &&
        keys.audience === 1 &&
        options?.unique === true &&
        options?.partialFilterExpression?.isDefault === true
    ),
    'only one active default template may exist per audience'
  );
  assert.deepEqual(
    (AgencyTemplate.schema.path('builtinKey') as any)?.enumValues,
    ['brochure', 'internal-summary'],
    'A5 only knows the managed built-in renderers'
  );
});

test('AgencyTemplateVersion is unique per tenant, template and version', () => {
  const indexes = AgencyTemplateVersion.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.agencyId === 1 &&
        keys.templateId === 1 &&
        keys.version === 1 &&
        options?.unique === true
    ),
    'template versions must be unique inside one template family'
  );
  assert.deepEqual(
    (AgencyTemplateVersion.schema.path('engine') as any)?.enumValues,
    ['html', 'docx', 'pdf-background'],
    'version rows must use the shared template engine enum'
  );
  assert.ok(
    (AgencyTemplateVersion.schema.path('checksum') as any)?.options?.match,
    'a stored template source needs a checksum'
  );
  assert.equal(
    (AgencyTemplate.schema.path('activeVersion') as any)?.options?.min,
    1,
    'the active version pointer must start at 1'
  );
});

test('AgencyExport indexes trip history and non-terminal jobs', () => {
  const indexes = AgencyExport.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.agencyId === 1 && keys.tripId === 1 && keys.createdAt === -1
    ),
    'trip export history index is missing'
  );
  assert.ok(
    indexes.some(([keys]) => keys.status === 1 && keys.createdAt === 1),
    'queued/rendering recovery index is missing'
  );
});

test('AgencyAudit is append-only and tenant-indexed', () => {
  const indexes = AgencyAudit.schema.indexes();
  assert.ok(
    indexes.some(([keys]) => keys.agencyId === 1 && keys.createdAt === -1),
    'the tenant audit trail needs an agencyId + createdAt index'
  );
  assert.equal(
    (AgencyAudit.schema as any).options.versionKey,
    false,
    'audit rows must not carry a version key'
  );
});
