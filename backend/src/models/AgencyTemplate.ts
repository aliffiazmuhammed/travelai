import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A renderable document template owned by one agency (Agency Workspace A5/A6).
 *
 * Built-ins select a renderer through `builtinKey` and stay code-backed. A6
 * uploaded templates are immutable `AgencyTemplateVersion` rows; this document
 * is the stable identity/default pointer. Source bytes are never exposed to
 * clients.
 *
 * Exports pin `templateId` + `templateVersion`, so activating a newer version
 * later cannot rewrite an existing PDF.
 */
export const AGENCY_TEMPLATE_ENGINES = ['html', 'docx', 'pdf-background'] as const;
export type AgencyTemplateEngine = (typeof AGENCY_TEMPLATE_ENGINES)[number];

export const AGENCY_TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;
export type AgencyTemplateStatus = (typeof AGENCY_TEMPLATE_STATUSES)[number];

export const AGENCY_TEMPLATE_AUDIENCES = ['client', 'internal'] as const;
export type AgencyTemplateAudience = (typeof AGENCY_TEMPLATE_AUDIENCES)[number];

/** Managed templates A5 understands. Unknown keys are never rendered. */
export const AGENCY_BUILTIN_TEMPLATE_KEYS = ['brochure', 'internal-summary'] as const;
export type AgencyBuiltinTemplateKey = (typeof AGENCY_BUILTIN_TEMPLATE_KEYS)[number];

export interface IAgencyTemplate extends Document {
  agencyId: Types.ObjectId;
  name: string;
  description?: string;
  engine: AgencyTemplateEngine;
  status: AgencyTemplateStatus;
  /** Current active version; mirrors an immutable version row for uploads. */
  version: number;
  /** Version used by new exports once a custom template is activated. */
  activeVersion?: number;
  schemaVersion: number;
  audience: AgencyTemplateAudience;
  isDefault: boolean;
  /** Managed renderer key; built-ins have no uploaded source bytes. */
  builtinKey?: AgencyBuiltinTemplateKey;
  /** Reserved by A5; uploaded sources live on AgencyTemplateVersion. */
  storageKey?: string;
  previewKey?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const agencyTemplateSchema = new Schema<IAgencyTemplate>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 240,
    },
    engine: {
      type: String,
      enum: [...AGENCY_TEMPLATE_ENGINES],
      default: 'html',
      required: true,
    },
    status: {
      type: String,
      enum: [...AGENCY_TEMPLATE_STATUSES],
      default: 'draft',
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    activeVersion: {
      type: Number,
      min: 1,
    },
    schemaVersion: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    audience: {
      type: String,
      enum: [...AGENCY_TEMPLATE_AUDIENCES],
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    builtinKey: {
      type: String,
      enum: [...AGENCY_BUILTIN_TEMPLATE_KEYS],
    },
    storageKey: {
      type: String,
      trim: true,
    },
    previewKey: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// The template picker and default resolution read one tenant/audience at a time.
agencyTemplateSchema.index({ agencyId: 1, status: 1, audience: 1, version: -1 });
// Concurrent first visits both seed the same built-in; the unique key makes
// that a harmless duplicate-key retry instead of two template rows.
agencyTemplateSchema.index(
  { agencyId: 1, builtinKey: 1 },
  {
    unique: true,
    partialFilterExpression: { builtinKey: { $exists: true } },
  }
);
// Exactly one active default per audience. Partial form so archived/draft
// versions may coexist with the active default.
agencyTemplateSchema.index(
  { agencyId: 1, audience: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true, status: 'active' },
  }
);

export default mongoose.model<IAgencyTemplate>('AgencyTemplate', agencyTemplateSchema);
