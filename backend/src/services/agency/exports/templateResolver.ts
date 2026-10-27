import crypto from 'node:crypto';
import AgencyTemplate, { type IAgencyTemplate } from '../../../models/AgencyTemplate.js';
import AgencyTemplateVersion, {
  type IAgencyTemplateVersion,
} from '../../../models/AgencyTemplateVersion.js';
import { AppError } from '../../../utils/AppError.js';
import {
  AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION,
  slotMapChecksum,
  validateAgencyPdfSlotMap,
  type AgencyPdfSlotMap,
} from './pdfTemplateContract.js';
import { readAgencyPdfPageSizes } from './pdfTemplateRender.js';
import {
  AGENCY_TEMPLATE_SCHEMA_VERSION,
  templateSourceChecksum,
  validateAgencyTemplateSource,
} from './templateValidation.js';
import {
  readAgencyTemplateFile,
  readAgencyTemplatePdf,
} from './templateStorage.js';
import {
  loadAgencyTemplateVersionAssets,
  type ResolvedTemplateAssets,
} from './templateAssets.js';

/**
 * Pinned custom template resolution (Agency Workspace A6 / A6f).
 *
 * Exports reference an immutable `(templateId, version)` pair. Resolution never
 * follows `activeVersion`, so a retry still renders the approved version after
 * a newer one is activated or the template is archived. HTML sources and PDF
 * backgrounds are both re-verified byte-for-byte against the approved version.
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
  engine: 'html' | 'pdf-background';
  /** HTML source for the `html` engine. */
  source?: string;
  /** Sanitised background bytes for the `pdf-background` engine. */
  background?: Buffer;
  slotMap?: AgencyPdfSlotMap;
  assets: ResolvedTemplateAssets;
}

/** Pure integrity check used before rendering a pinned HTML version. */
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

/** Pure integrity check for a pinned PDF background. */
export function assertPdfTemplateVersionIntegrity(
  version:
    | Pick<
        IAgencyTemplateVersion,
        'engine' | 'schemaVersion' | 'checksum' | 'sourceBytes'
      >
    | any,
  background: Buffer
): void {
  if (version?.engine !== 'pdf-background') {
    throw new AppError('That template engine is not supported yet.', 400);
  }
  if (
    Number(version?.schemaVersion) !== AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION
  ) {
    throw new AppError(
      'This template version uses an unsupported layout contract. Upload a new version.',
      409
    );
  }
  const checksum = crypto
    .createHash('sha256')
    .update(background)
    .digest('hex');
  if (
    background.byteLength !== Number(version?.sourceBytes) ||
    checksum !== String(version?.checksum)
  ) {
    throw new AppError(
      'The stored PDF design no longer matches the approved version. Upload a new version.',
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
  if (template.builtinKey || template.engine === 'docx') {
    throw new AppError('This template does not use an uploaded source.', 400);
  }
  if (template.audience !== version.audience) {
    throw new AppError(
      'This template version no longer matches the template. Upload a new version.',
      409
    );
  }

  if (template.engine === 'pdf-background') {
    if (version.engine !== 'pdf-background') {
      throw new AppError(
        'This template version no longer matches the template. Upload a new version.',
        409
      );
    }
    const stored = version.slotMap as AgencyPdfSlotMap | undefined;
    if (
      !stored ||
      !version.slotMapChecksum ||
      slotMapChecksum(stored) !== String(version.slotMapChecksum)
    ) {
      throw new AppError(
        'The stored layout no longer matches the approved version. Upload a new version.',
        409
      );
    }

    let background: Buffer;
    try {
      background = await readAgencyTemplatePdf(version.storageKey);
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError(
          'The PDF design for this version is no longer available. Upload a new version.',
          409
        );
      }
      throw error;
    }
    assertPdfTemplateVersionIntegrity(version, background);

    const pageSizes = await readAgencyPdfPageSizes(background);
    if (pageSizes.length !== Number(version.pageCount)) {
      throw new AppError(
        'The stored PDF design no longer matches the approved version. Upload a new version.',
        409
      );
    }
    let slotMap: AgencyPdfSlotMap;
    try {
      slotMap = validateAgencyPdfSlotMap(stored, {
        audience: version.audience,
        pageSizes,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError(
          'The stored layout is no longer valid. Upload a new version.',
          409
        );
      }
      throw error;
    }

    const assets = await loadAgencyTemplateVersionAssets(version.assets);
    return {
      template,
      version,
      engine: 'pdf-background',
      background,
      slotMap,
      assets,
    };
  }

  if (template.engine !== 'html') {
    throw new AppError('That template engine is not supported yet.', 400);
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
  return { template, version, engine: 'html', source, assets };
}
