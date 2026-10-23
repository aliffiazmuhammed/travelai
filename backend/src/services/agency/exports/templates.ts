import { Types } from 'mongoose';
import AgencyTemplate, {
  AGENCY_BUILTIN_TEMPLATE_KEYS,
  type AgencyBuiltinTemplateKey,
  type AgencyTemplateAudience,
  type IAgencyTemplate,
} from '../../../models/AgencyTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import { agencyCan, type AgencyRole } from '../access.js';

/**
 * Managed built-in templates (Agency Workspace A5).
 *
 * Every agency gets its own rows so the template id is tenant-scoped and an
 * export can pin `templateId` + `templateVersion`. The renderer is selected by
 * `builtinKey` in code; no user-supplied HTML is stored or executed in A5.
 */

interface BuiltinDefinition {
  builtinKey: AgencyBuiltinTemplateKey;
  name: string;
  description: string;
  audience: AgencyTemplateAudience;
}

export const BUILTIN_TEMPLATES: readonly BuiltinDefinition[] = [
  {
    builtinKey: 'brochure',
    name: 'Signature brochure',
    description:
      'The client-facing proposal: cover, journey overview, one page per day, pricing and practical details.',
    audience: 'client',
  },
  {
    builtinKey: 'internal-summary',
    name: 'Internal summary',
    description:
      'The same journey with internal estimates and quoted totals, for the desk copy only.',
    audience: 'internal',
  },
] as const;

export interface AgencyTemplateProjection {
  _id: string;
  name: string;
  description?: string;
  engine: string;
  status: string;
  version: number;
  activeVersion?: number;
  schemaVersion: number;
  audience: AgencyTemplateAudience;
  isDefault: boolean;
  builtinKey?: AgencyBuiltinTemplateKey;
  createdAt: Date;
  updatedAt: Date;
}

/** Never exposes `storageKey`/`previewKey`: clients only get template metadata. */
export function projectAgencyTemplate(template: IAgencyTemplate | any): AgencyTemplateProjection {
  return {
    _id: String(template._id),
    name: String(template.name ?? ''),
    description: template.description ?? undefined,
    engine: template.engine,
    status: template.status,
    version: Number(template.version ?? 1),
    ...(template.activeVersion
      ? { activeVersion: Number(template.activeVersion) }
      : {}),
    schemaVersion: Number(template.schemaVersion ?? 1),
    audience: template.audience,
    isDefault: Boolean(template.isDefault),
    builtinKey: template.builtinKey ?? undefined,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function isBuiltinTemplateKey(value: unknown): value is AgencyBuiltinTemplateKey {
  return (AGENCY_BUILTIN_TEMPLATE_KEYS as readonly string[]).includes(String(value ?? ''));
}

/**
 * Idempotently creates the two managed templates for a tenant. The same
 * `(agencyId, builtinKey)` upsert means a retry after a partial failure does
 * not produce a second default and the partial unique index on
 * `(agencyId, audience, isDefault)` stays satisfiable.
 */
export async function ensureBuiltinTemplates(
  agencyId: string,
  createdBy: string
): Promise<void> {
  if (!Types.ObjectId.isValid(agencyId) || !Types.ObjectId.isValid(createdBy)) {
    throw new AppError('Agency not found', 404);
  }

  for (const definition of BUILTIN_TEMPLATES) {
    try {
      await AgencyTemplate.findOneAndUpdate(
        { agencyId, builtinKey: definition.builtinKey },
        {
          $setOnInsert: {
            agencyId,
            name: definition.name,
            description: definition.description,
            engine: 'html',
            status: 'active',
            version: 1,
            schemaVersion: 1,
            audience: definition.audience,
            isDefault: true,
            builtinKey: definition.builtinKey,
            createdBy,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (error: any) {
      // A concurrent first request may have inserted the row between our
      // lookup and upsert. The built-in exists either way.
      if (error?.code !== 11000) throw error;
    }
  }
}

export type AgencyTemplateListStatus = 'active' | 'draft' | 'archived' | 'all';

export interface ListAgencyTemplatesInput {
  agencyId: string;
  role: AgencyRole;
  audience?: AgencyTemplateAudience;
  /** The export picker only wants `active`; the admin gallery may ask for all. */
  status?: AgencyTemplateListStatus;
}

/**
 * Internal templates carry desk-only estimates, so only admins can see them or
 * browse inactive versions. Non-admins get the active client catalogue.
 */
export async function listAgencyTemplates(
  input: ListAgencyTemplatesInput
): Promise<AgencyTemplateProjection[]> {
  const canManage = agencyCan(input.role, 'admin');
  const status = input.status ?? 'active';
  if (status !== 'active' && !canManage) {
    throw new AppError('Only an agency admin can view inactive templates.', 403);
  }
  if (input.audience === 'internal' && !canManage) {
    throw new AppError('Only an agency admin can view internal templates.', 403);
  }

  const filter: Record<string, unknown> = { agencyId: input.agencyId };
  if (status !== 'all') filter.status = status;
  if (input.audience) {
    filter.audience = input.audience;
  } else if (!canManage) {
    filter.audience = 'client';
  }

  const templates = await AgencyTemplate.find(filter)
    .sort({ status: 1, audience: 1, isDefault: -1, name: 1 })
    .limit(100)
    .lean();

  return templates.map(projectAgencyTemplate);
}

/** Tenant-scoped active template lookup; cross-tenant ids answer 404. */
export async function getAgencyTemplate(
  agencyId: string,
  templateId: string
): Promise<IAgencyTemplate> {
  if (!Types.ObjectId.isValid(templateId)) {
    throw new AppError('Template not found', 404);
  }
  const template = await AgencyTemplate.findOne({
    _id: templateId,
    agencyId,
    status: 'active',
  });
  if (!template) {
    throw new AppError('Template not found', 404);
  }
  return template;
}

/**
 * A template is selectable for a new export when it is either a managed
 * built-in or an uploaded template with an activated, previewed version.
 */
export function assertRenderableTemplate(template: IAgencyTemplate | any): void {
  if (isBuiltinTemplateKey(template?.builtinKey)) return;
  if (
    template?.engine === 'html' &&
    !template?.builtinKey &&
    Number.isInteger(Number(template?.activeVersion)) &&
    Number(template.activeVersion) >= 1
  ) {
    return;
  }
  throw new AppError(
    'That template is not ready for export. Activate a previewed version or choose a built-in template.',
    400
  );
}
