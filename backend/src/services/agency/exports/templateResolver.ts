import AgencyTemplate, { type IAgencyTemplate } from '../../../models/AgencyTemplate.js';
import AgencyTemplateVersion, {
  type IAgencyTemplateVersion,
} from '../../../models/AgencyTemplateVersion.js';
import { AppError } from '../../../utils/AppError.js';
import {
  AGENCY_TEMPLATE_SCHEMA_VERSION,
  templateSourceChecksum,
  validateAgencyTemplateSource,
} from './templateValidation.js';
import { readAgencyTemplateFile } from './templateStorage.js';
import {
  loadAgencyTemplateVersionAssets,
  type ResolvedTemplateAssets,
} from './templateAssets.js';

/**
 * Pinned custom template resolution (Agency Workspace A6).
 *
 * Exports reference an immutable `(templateId, version)` pair. Resolution never
 * follows `activeVersion`, so a retry still renders the approved version after
 * a newer one is activated or the template is archived. The source checksum
 * and byte size must still match the approved version.
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export interface ResolveAgencyTemplateVersionInput {
  agencyId: string;
  templateId: unknown;
  version: unknown;
  /** New exports require an active template; retries may resolve archived ones. */
  requireActiveTemplate?: boolean;
}

export interface ResolvedAgencyTemplateVersion {
  template: IAgencyTemplate;
  version: IAgencyTemplateVersion;
  source: string;
  assets: ResolvedTemplateAssets;
}

/** Pure integrity check used before rendering a pinned version. */
export function assertTemplateVersionIntegrity(
  version:
    | Pick<
        IAgencyTemplateVersion,
        'engine' | 'schemaVersion' | 'checksum' | 'sourceBytes'
      >
    | any,
  source: string
): void {
  if (version?.engine !== 'html') {
    throw new AppError('That template engine is not supported yet.', 400);
  }
  if (Number(version?.schemaVersion) !== AGENCY_TEMPLATE_SCHEMA_VERSION) {
    throw new AppError(
      'This template version uses an unsupported contract. Upload a new version.',
      409
    );
  }
  const bytes = Buffer.byteLength(source, 'utf8');
  if (
    bytes !== Number(version?.sourceBytes) ||
    templateSourceChecksum(source) !== String(version?.checksum)
  ) {
    throw new AppError(
      'The stored template no longer matches the approved version. Upload a new version.',
      409
    );
  }
}

export async function resolveAgencyTemplateVersion(
  input: ResolveAgencyTemplateVersionInput
): Promise<ResolvedAgencyTemplateVersion> {
  const templateId = String(input.templateId ?? '');
  const versionNumber = Number(input.version);
  if (
    !OBJECT_ID.test(input.agencyId) ||
    !OBJECT_ID.test(templateId) ||
    !Number.isInteger(versionNumber) ||
    versionNumber < 1
  ) {
    throw new AppError('Template not found', 404);
  }

  const [template, version] = await Promise.all([
    AgencyTemplate.findOne({
      _id: templateId,
      agencyId: input.agencyId,
      ...(input.requireActiveTemplate ? { status: 'active' } : {}),
    }),
    AgencyTemplateVersion.findOne({
      agencyId: input.agencyId,
      templateId,
      version: versionNumber,
    }),
  ]);
  if (!template || !version) {
    throw new AppError('Template not found', 404);
  }
  if (template.builtinKey || template.engine !== 'html') {
    throw new AppError('This template does not use an uploaded source.', 400);
  }
  if (template.audience !== version.audience) {
    throw new AppError(
      'This template version no longer matches the template. Upload a new version.',
      409
    );
  }

  let source: string;
  try {
    source = await readAgencyTemplateFile(version.storageKey);
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(
        'The template source for this version is no longer available. Upload a new version.',
        409
      );
    }
    throw error;
  }

  assertTemplateVersionIntegrity(version, source);
  try {
    validateAgencyTemplateSource(source, { audience: version.audience });
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(
        'The stored template is no longer valid. Upload a new version.',
        409
      );
    }
    throw error;
  }

  const assets = await loadAgencyTemplateVersionAssets(version.assets);
  return { template, version, source, assets };
}
