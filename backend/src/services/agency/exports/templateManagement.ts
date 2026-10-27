import { Types } from 'mongoose';
import AgencyClient from '../../../models/AgencyClient.js';
import AgencyQuote from '../../../models/AgencyQuote.js';
import AgencyTemplate, {
  type AgencyTemplateAudience,
  type IAgencyTemplate,
} from '../../../models/AgencyTemplate.js';
import AgencyTemplateVersion, {
  type IAgencyTemplateVersion,
  type IAgencyTemplateVersionAsset,
} from '../../../models/AgencyTemplateVersion.js';
import Trip from '../../../models/Trip.js';
import { AppError } from '../../../utils/AppError.js';
import { agencyCan, type AgencyRole } from '../access.js';
import { recordAgencyAudit } from '../audit.js';
import { assertStorageQuota } from '../plan.js';
import { getLatestQuote, reconcileQuoteExpiry } from '../quotes.js';
import { renderCustomTemplateHtml } from './customTemplate.js';
import { buildExportDocument } from './document.js';
import {
  carryOverTemplateAssetSnapshots,
  snapshotAgencyTemplateAssets,
  type AgencyTemplateAssetSelection,
} from './templateAssets.js';
import { resolveAgencyTemplateVersion } from './templateResolver.js';
import {
  buildAgencyTemplateStorageKey,
  readAgencyTemplateFile,
  removeAgencyTemplateVersionFiles,
  writeAgencyTemplateFile,
} from './templateStorage.js';
import {
  AGENCY_TEMPLATE_SCHEMA_VERSION,
  templateSourceChecksum,
  validateAgencyTemplateSource,
} from './templateValidation.js';
import {
  projectAgencyTemplate,
  type AgencyTemplateProjection,
} from './templates.js';

/**
 * Template authoring lifecycle (Agency Workspace A6c).
 *
 * Admins upload a validated HTML source, map the assets it needs, preview the
 * resulting version against a real tenant trip, and only then activate it.
 * Versions are immutable; the template row is the stable identity. Nothing in
 * this module follows a client-supplied storage path.
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function assertAdmin(role: AgencyRole): void {
  if (!agencyCan(role, 'admin')) {
    throw new AppError('Only an agency admin can manage templates.', 403);
  }
}

function isObjectId(value: unknown): boolean {
  return OBJECT_ID.test(String(value ?? ''));
}

function duplicateKey(error: any): boolean {
  return error?.code === 11000;
}

export interface AgencyTemplateVersionProjection {
  version: number;
  audience: AgencyTemplateAudience;
  pageCount: number;
  sourceBytes: number;
  createdAt: Date;
  previewedAt?: Date;
  previewTripId?: string;
  active: boolean;
}

export function projectAgencyTemplateVersion(
  version: IAgencyTemplateVersion | any,
  activeVersion?: number | null
): AgencyTemplateVersionProjection {
  return {
    version: Number(version.version ?? 1),
    audience: version.audience,
    pageCount: Number(version.pageCount ?? 0),
    sourceBytes: Number(version.sourceBytes ?? 0),
    createdAt: version.createdAt,
    ...(version.previewedAt ? { previewedAt: version.previewedAt } : {}),
    ...(version.previewTripId
      ? { previewTripId: String(version.previewTripId) }
      : {}),
    active:
      activeVersion !== undefined &&
      activeVersion !== null &&
      Number(activeVersion) === Number(version.version),
  };
}

async function loadCustomTemplate(
  agencyId: string,
  templateId: string
): Promise<IAgencyTemplate> {
  if (!isObjectId(templateId)) {
    throw new AppError('Template not found', 404);
  }
  const template = await AgencyTemplate.findOne({ _id: templateId, agencyId });
  if (!template) throw new AppError('Template not found', 404);
  if (template.builtinKey) {
    throw new AppError('Built-in templates are managed by TravelAI.', 400);
  }
  if (template.engine !== 'html') {
    throw new AppError('That template engine is not supported yet.', 400);
  }
  return template;
}

async function loadVersion(
  agencyId: string,
  templateId: string,
  version: unknown
): Promise<IAgencyTemplateVersion> {
  const versionNumber = Number(version);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new AppError('Template version not found', 404);
  }
  const row = await AgencyTemplateVersion.findOne({
    agencyId,
    templateId,
    version: versionNumber,
  });
  if (!row) throw new AppError('Template version not found', 404);
  return row;
}

async function cleanupVersionFiles(
  storageKey: string | null,
  assets: IAgencyTemplateVersionAsset[]
): Promise<void> {
  await removeAgencyTemplateVersionFiles({ storageKey, assets });
}

export interface CreateAgencyTemplateInput {
  agency: any;
  actorId: string;
  role: AgencyRole;
  name: unknown;
  description?: unknown;
  audience: unknown;
  buffer: Buffer;
  assets?: AgencyTemplateAssetSelection;
}

/**
 * Creates a draft template and its first immutable version. The source and
 * snapshots are written before the rows, so a failed validation or write can
 * never leave a selectable template behind.
 */
export async function createAgencyTemplate(
  input: CreateAgencyTemplateInput
): Promise<{
  template: AgencyTemplateProjection;
  version: AgencyTemplateVersionProjection;
}> {
  assertAdmin(input.role);

  const audience = String(input.audience ?? '').trim();
  if (audience !== 'client' && audience !== 'internal') {
    throw new AppError('Choose a valid template audience.', 400);
  }
  const name = String(input.name ?? '').trim();
  if (name.length < 2) {
    throw new AppError('Give this template a name.', 400);
  }
  if (name.length > 80) {
    throw new AppError('Template names must be 80 characters or fewer.', 400);
  }

  const validated = validateAgencyTemplateSource(input.buffer, {
    audience: audience as AgencyTemplateAudience,
  });

  const agencyId = String(input.agency._id);
  const templateId = new Types.ObjectId();
  const versionId = new Types.ObjectId();
  const storageKey = buildAgencyTemplateStorageKey(agencyId, versionId);

  await assertStorageQuota(agencyId, validated.bytes);

  let template: IAgencyTemplate | null = null;
  let version: IAgencyTemplateVersion | null = null;
  let assets: IAgencyTemplateVersionAsset[] = [];
  try {
    assets = await snapshotAgencyTemplateAssets({
      agencyId,
      versionId: String(versionId),
      branding: input.agency?.branding,
      selection: input.assets,
      usedTokens: validated.tokens,
    });
    await writeAgencyTemplateFile(storageKey, validated.source);

    template = await AgencyTemplate.create({
      _id: templateId,
      agencyId,
      name,
      ...(typeof input.description === 'string'
        ? { description: input.description.trim() }
        : {}),
      engine: 'html',
      status: 'draft',
      version: 1,
      schemaVersion: AGENCY_TEMPLATE_SCHEMA_VERSION,
      audience,
      isDefault: false,
      createdBy: input.actorId,
    });

    version = await AgencyTemplateVersion.create({
      _id: versionId,
      agencyId,
      templateId,
      version: 1,
      engine: 'html',
      schemaVersion: AGENCY_TEMPLATE_SCHEMA_VERSION,
      audience,
      storageKey,
      checksum: validated.checksum,
      sourceBytes: validated.bytes,
      pageCount: validated.pageCount,
      tokens: validated.tokens,
      assets,
      createdBy: input.actorId,
    });
  } catch (error) {
    if (version?._id) {
      await AgencyTemplateVersion.deleteOne({ _id: version._id }).catch(
        () => undefined
      );
    }
    if (template?._id) {
      await AgencyTemplate.deleteOne({
        _id: template._id,
        agencyId,
      }).catch(() => undefined);
    }
    await cleanupVersionFiles(storageKey, assets);
    throw error;
  }

  await recordAgencyAudit({
    agencyId,
    actorId: input.actorId,
    action: 'template.created',
    targetType: 'AgencyTemplate',
    targetId: String(templateId),
    metadata: {
      audience,
      version: 1,
      pageCount: validated.pageCount,
      assets: assets.map((asset) => asset.slot),
    },
  });

  return {
    template: projectAgencyTemplate(template),
    version: projectAgencyTemplateVersion(version, null),
  };
}

export interface AddAgencyTemplateVersionInput {
  agency: any;
  actorId: string;
  role: AgencyRole;
  templateId: string;
  buffer: Buffer;
  assets?: AgencyTemplateAssetSelection;
}

/** Adds an immutable version to an existing draft/active custom template. */
export async function addAgencyTemplateVersion(
  input: AddAgencyTemplateVersionInput
): Promise<{
  template: AgencyTemplateProjection;
  version: AgencyTemplateVersionProjection;
}> {
  assertAdmin(input.role);
  const agencyId = String(input.agency._id);
  const template = await loadCustomTemplate(agencyId, input.templateId);
  if (template.status === 'archived') {
    throw new AppError(
      'This template is archived. Restore it by activating a version before uploading another.',
      409
    );
  }

  const validated = validateAgencyTemplateSource(input.buffer, {
    audience: template.audience,
  });
  await assertStorageQuota(agencyId, validated.bytes);
  const latest = await AgencyTemplateVersion.findOne({
    agencyId,
    templateId: template._id,
  })
    .sort({ version: -1 })
    .select('version')
    .lean();
  const nextVersion = Number(latest?.version ?? 0) + 1;

  const versionId = new Types.ObjectId();
  const storageKey = buildAgencyTemplateStorageKey(agencyId, versionId);
  let version: IAgencyTemplateVersion | null = null;
  let assets: IAgencyTemplateVersionAsset[] = [];
  try {
    assets = await snapshotAgencyTemplateAssets({
      agencyId,
      versionId: String(versionId),
      branding: input.agency?.branding,
      selection: input.assets,
      usedTokens: validated.tokens,
    });
    await writeAgencyTemplateFile(storageKey, validated.source);

    version = await AgencyTemplateVersion.create({
      _id: versionId,
      agencyId,
      templateId: template._id,
      version: nextVersion,
      engine: 'html',
      schemaVersion: AGENCY_TEMPLATE_SCHEMA_VERSION,
      audience: template.audience,
      storageKey,
      checksum: validated.checksum,
      sourceBytes: validated.bytes,
      pageCount: validated.pageCount,
      tokens: validated.tokens,
      assets,
      createdBy: input.actorId,
    });
  } catch (error) {
    if (version?._id) {
      await AgencyTemplateVersion.deleteOne({ _id: version._id }).catch(
        () => undefined
      );
    }
    await cleanupVersionFiles(storageKey, assets);
    if (duplicateKey(error)) {
      throw new AppError(
        'Another version was uploaded at the same time. Please retry.',
        409
      );
    }
    throw error;
  }

  await recordAgencyAudit({
    agencyId,
    actorId: input.actorId,
    action: 'template.version_uploaded',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: {
      version: nextVersion,
      audience: template.audience,
      pageCount: validated.pageCount,
      assets: assets.map((asset) => asset.slot),
    },
  });

  return {
    template: projectAgencyTemplate(template),
    version: projectAgencyTemplateVersion(version, template.activeVersion),
  };
}

export interface AgencyTemplateSourceView {
  template: AgencyTemplateProjection;
  version: AgencyTemplateVersionProjection;
  source: string;
  checksum: string;
  schemaVersion: number;
}

/** Reads one version's private source for the in-app editor (admin only). */
export async function getAgencyTemplateSource(input: {
  agencyId: string;
  role: AgencyRole;
  templateId: string;
  version: unknown;
}): Promise<AgencyTemplateSourceView> {
  assertAdmin(input.role);
  const template = await loadCustomTemplate(input.agencyId, input.templateId);
  const version = await loadVersion(
    input.agencyId,
    String(template._id),
    input.version
  );
  const source = await readAgencyTemplateFile(version.storageKey);
  if (templateSourceChecksum(source) !== version.checksum) {
    throw new AppError(
      'The stored source no longer matches this approved version. Upload a new version instead.',
      409
    );
  }

  return {
    template: projectAgencyTemplate(template),
    version: projectAgencyTemplateVersion(version, template.activeVersion),
    source,
    checksum: version.checksum,
    schemaVersion: Number(
      version.schemaVersion ?? AGENCY_TEMPLATE_SCHEMA_VERSION
    ),
  };
}

export interface SaveAgencyTemplateSourceInput {
  agency: any;
  actorId: string;
  role: AgencyRole;
  templateId: string;
  baseVersion: unknown;
  source: unknown;
}

/**
 * Saves edited HTML as the next immutable version. The base version's asset
 * snapshots are copied forward, so editing cannot silently swap a client's
 * cover or fonts; preview and activation still gate publication.
 */
export async function saveAgencyTemplateSource(
  input: SaveAgencyTemplateSourceInput
): Promise<{
  template: AgencyTemplateProjection;
  version: AgencyTemplateVersionProjection;
}> {
  assertAdmin(input.role);
  const agencyId = String(input.agency._id);
  const template = await loadCustomTemplate(agencyId, input.templateId);
  if (template.status === 'archived') {
    throw new AppError(
      'This template is archived. Restore it by activating a version before editing it.',
      409
    );
  }

  const base = await loadVersion(
    agencyId,
    String(template._id),
    input.baseVersion
  );
  const raw = typeof input.source === 'string' ? input.source : '';
  if (!raw.trim()) {
    throw new AppError('Add the template HTML before saving a version.', 400);
  }

  const validated = validateAgencyTemplateSource(Buffer.from(raw, 'utf8'), {
    audience: template.audience,
  });

  const baseSource = await readAgencyTemplateFile(base.storageKey);
  const baseChecksum = templateSourceChecksum(baseSource);
  if (baseChecksum !== base.checksum) {
    throw new AppError(
      'The stored source no longer matches this approved version. Upload a new version instead.',
      409
    );
  }
  if (validated.checksum === baseChecksum) {
    throw new AppError(
      'The HTML is unchanged. Edit the source before saving a new version.',
      400
    );
  }
  await assertStorageQuota(agencyId, validated.bytes);

  const latest = await AgencyTemplateVersion.findOne({
    agencyId,
    templateId: template._id,
  })
    .sort({ version: -1 })
    .select('version')
    .lean();
  const nextVersion = Number(latest?.version ?? 0) + 1;

  const versionId = new Types.ObjectId();
  const storageKey = buildAgencyTemplateStorageKey(agencyId, versionId);
  let version: IAgencyTemplateVersion | null = null;
  let assets: IAgencyTemplateVersionAsset[] = [];
  try {
    assets = await carryOverTemplateAssetSnapshots({
      agencyId,
      sourceVersionId: String(base._id),
      targetVersionId: String(versionId),
      usedTokens: validated.tokens,
      assets: base.assets,
    });
    await writeAgencyTemplateFile(storageKey, validated.source);

    version = await AgencyTemplateVersion.create({
      _id: versionId,
      agencyId,
      templateId: template._id,
      version: nextVersion,
      engine: 'html',
      schemaVersion: AGENCY_TEMPLATE_SCHEMA_VERSION,
      audience: template.audience,
      storageKey,
      checksum: validated.checksum,
      sourceBytes: validated.bytes,
      pageCount: validated.pageCount,
      tokens: validated.tokens,
      assets,
      createdBy: input.actorId,
    });
  } catch (error) {
    if (version?._id) {
      await AgencyTemplateVersion.deleteOne({ _id: version._id }).catch(
        () => undefined
      );
    }
    await cleanupVersionFiles(storageKey, assets);
    if (duplicateKey(error)) {
      throw new AppError(
        'Another version was saved at the same time. Please retry.',
        409
      );
    }
    throw error;
  }

  await recordAgencyAudit({
    agencyId,
    actorId: input.actorId,
    action: 'template.version_edited',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: {
      version: nextVersion,
      baseVersion: base.version,
      audience: template.audience,
      pageCount: validated.pageCount,
      assets: assets.map((asset) => asset.slot),
    },
  });

  return {
    template: projectAgencyTemplate(template),
    version: projectAgencyTemplateVersion(version, template.activeVersion),
  };
}

export async function listAgencyTemplateVersions(input: {
  agencyId: string;
  role: AgencyRole;
  templateId: string;
}): Promise<{
  template: AgencyTemplateProjection;
  versions: AgencyTemplateVersionProjection[];
}> {
  assertAdmin(input.role);
  const template = await loadCustomTemplate(input.agencyId, input.templateId);
  const versions = await AgencyTemplateVersion.find({
    agencyId: input.agencyId,
    templateId: template._id,
  })
    .sort({ version: -1 })
    .limit(50)
    .lean();

  return {
    template: projectAgencyTemplate(template),
    versions: versions.map((version) =>
      projectAgencyTemplateVersion(version, template.activeVersion)
    ),
  };
}

export interface PreviewAgencyTemplateVersionInput {
  agency: any;
  actorId: string;
  role: AgencyRole;
  templateId: string;
  version: unknown;
  tripId: unknown;
  quoteId?: unknown;
}

export interface AgencyTemplateVersionPreview {
  html: string;
  pageCount: number;
  audience: AgencyTemplateAudience;
  template: AgencyTemplateProjection;
  version: AgencyTemplateVersionProjection;
  trip: { _id: string; title: string };
}

/**
 * Renders one version against a real agency trip and records that preview.
 * Activation only accepts a version that went through this path.
 */
export async function previewAgencyTemplateVersion(
  input: PreviewAgencyTemplateVersionInput
): Promise<AgencyTemplateVersionPreview> {
  assertAdmin(input.role);
  const agencyId = String(input.agency._id);
  const tripId = String(input.tripId ?? '');
  if (!isObjectId(tripId)) {
    throw new AppError('Trip not found', 404);
  }

  const resolved = await resolveAgencyTemplateVersion({
    agencyId,
    templateId: input.templateId,
    version: input.version,
    requireActiveTemplate: false,
  });
  const trip = await Trip.findOne({
    _id: tripId,
    agencyId,
    workspace: 'agency',
    isDeleted: { $ne: true },
  });
  if (!trip) throw new AppError('Trip not found', 404);

  let quote = null;
  if (input.quoteId !== undefined && input.quoteId !== null && input.quoteId !== '') {
    const quoteId = String(input.quoteId);
    if (!isObjectId(quoteId)) {
      throw new AppError('Quote not found', 404);
    }
    quote = await AgencyQuote.findOne({ _id: quoteId, agencyId, tripId });
    if (!quote) throw new AppError('Quote not found', 404);
    quote = await reconcileQuoteExpiry(quote);
  } else {
    quote = await getLatestQuote(agencyId, tripId);
  }

  const client = trip.clientId
    ? await AgencyClient.findOne({ _id: trip.clientId, agencyId })
    : null;
  const doc = buildExportDocument({
    agency: input.agency,
    trip,
    quote,
    client,
  });
  const rendered = renderCustomTemplateHtml({
    doc,
    template: {
      name: resolved.template.name,
      audience: resolved.version.audience,
      version: resolved.version.version,
    },
    source: resolved.source,
    assets: resolved.assets,
  });

  const previewedAt = new Date();
  const previewed = await AgencyTemplateVersion.findOneAndUpdate(
    {
      _id: resolved.version._id,
      agencyId,
      templateId: resolved.template._id,
    },
    {
      $set: {
        previewedAt,
        previewedBy: input.actorId,
        previewTripId: trip._id,
      },
    },
    { new: true }
  );

  await recordAgencyAudit({
    agencyId,
    actorId: input.actorId,
    action: 'template.previewed',
    targetType: 'AgencyTemplate',
    targetId: String(resolved.template._id),
    metadata: {
      version: resolved.version.version,
      tripId,
      pageCount: rendered.pageCount,
    },
  });

  return {
    html: rendered.html,
    pageCount: rendered.pageCount,
    audience: resolved.version.audience,
    template: projectAgencyTemplate(resolved.template),
    version: projectAgencyTemplateVersion(
      previewed ?? resolved.version,
      resolved.template.activeVersion
    ),
    trip: { _id: String(trip._id), title: String(trip.title ?? '') },
  };
}

export async function activateAgencyTemplateVersion(input: {
  agencyId: string;
  actorId: string;
  role: AgencyRole;
  templateId: string;
  version: unknown;
}): Promise<AgencyTemplateProjection> {
  assertAdmin(input.role);
  const template = await loadCustomTemplate(input.agencyId, input.templateId);
  const version = await loadVersion(
    input.agencyId,
    String(template._id),
    input.version
  );
  if (!version.previewedAt) {
    throw new AppError(
      'Preview this version against a real trip before activating it.',
      409
    );
  }

  // Re-verify the private source before it can become the client-facing
  // default; an on-disk edit must not slip past the preview.
  await resolveAgencyTemplateVersion({
    agencyId: input.agencyId,
    templateId: String(template._id),
    version: version.version,
    requireActiveTemplate: false,
  });

  const updated = await AgencyTemplate.findOneAndUpdate(
    { _id: template._id, agencyId: input.agencyId },
    {
      $set: {
        status: 'active',
        activeVersion: version.version,
        version: version.version,
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw new AppError('Template not found', 404);

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'template.activated',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: { version: version.version },
  });

  return projectAgencyTemplate(updated);
}

export async function archiveAgencyTemplate(input: {
  agencyId: string;
  actorId: string;
  role: AgencyRole;
  templateId: string;
}): Promise<AgencyTemplateProjection> {
  assertAdmin(input.role);
  const template = await loadCustomTemplate(input.agencyId, input.templateId);
  const updated = await AgencyTemplate.findOneAndUpdate(
    { _id: template._id, agencyId: input.agencyId },
    { $set: { status: 'archived', isDefault: false } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new AppError('Template not found', 404);

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'template.archived',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: { activeVersion: template.activeVersion },
  });

  return projectAgencyTemplate(updated);
}

export async function setDefaultAgencyTemplate(input: {
  agencyId: string;
  actorId: string;
  role: AgencyRole;
  templateId: string;
}): Promise<AgencyTemplateProjection> {
  assertAdmin(input.role);
  if (!isObjectId(input.templateId)) {
    throw new AppError('Template not found', 404);
  }
  const template = await AgencyTemplate.findOne({
    _id: input.templateId,
    agencyId: input.agencyId,
  });
  if (!template) throw new AppError('Template not found', 404);
  if (template.status !== 'active') {
    throw new AppError('Activate this template before making it the default.', 409);
  }
  if (template.isDefault) return projectAgencyTemplate(template);

  // The unique partial index allows one default per audience, so clear the
  // previous default before promoting this one.
  await AgencyTemplate.updateMany(
    {
      agencyId: input.agencyId,
      audience: template.audience,
      isDefault: true,
      _id: { $ne: template._id },
    },
    { $set: { isDefault: false } }
  );

  let updated: IAgencyTemplate | null = null;
  try {
    updated = await AgencyTemplate.findOneAndUpdate(
      { _id: template._id, agencyId: input.agencyId, status: 'active' },
      { $set: { isDefault: true } },
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (duplicateKey(error)) {
      throw new AppError(
        'Another default changed at the same time. Please retry.',
        409
      );
    }
    throw error;
  }
  if (!updated) throw new AppError('Template not found', 404);

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'template.default_set',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: { audience: template.audience },
  });

  return projectAgencyTemplate(updated);
}

export async function updateAgencyTemplateDetails(input: {
  agencyId: string;
  actorId: string;
  role: AgencyRole;
  templateId: string;
  name?: unknown;
  description?: unknown;
}): Promise<AgencyTemplateProjection> {
  assertAdmin(input.role);
  const template = await loadCustomTemplate(input.agencyId, input.templateId);
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 2) throw new AppError('Give this template a name.', 400);
    if (name.length > 80) {
      throw new AppError('Template names must be 80 characters or fewer.', 400);
    }
    update.name = name;
  }
  if (input.description !== undefined) {
    update.description = String(input.description).trim();
  }

  const updated = await AgencyTemplate.findOneAndUpdate(
    { _id: template._id, agencyId: input.agencyId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!updated) throw new AppError('Template not found', 404);

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'template.updated',
    targetType: 'AgencyTemplate',
    targetId: String(template._id),
    metadata: { fields: Object.keys(update) },
  });

  return projectAgencyTemplate(updated);
}
