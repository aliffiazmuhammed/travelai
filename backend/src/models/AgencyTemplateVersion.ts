import mongoose, { Document, Schema, Types } from 'mongoose';
import type { AgencyPdfSlotMap } from '../services/agency/exports/pdfTemplateContract.js';
import {
  AGENCY_TEMPLATE_ENGINES,
  AGENCY_TEMPLATE_AUDIENCES,
  type AgencyTemplateAudience,
  type AgencyTemplateEngine,
} from './AgencyTemplate.js';

/**
 * One immutable uploaded template version (Agency Workspace A6).
 *
 * The version row owns the source bytes and the asset snapshots that were
 * approved together. Opening an export pins `templateId` + `version`, so a
 * newer version or an archive can never rewrite an existing proposal.
 *
 * `previewedAt` records a successful preview against a real trip. Activation
 * requires that preview so an unreviewed upload cannot become client-facing.
 */
export interface IAgencyTemplateVersionAsset {
  /** `logo`, `mascot`, `heading-font`, `body-font`, `cover`, `day-1`, ... */
  slot: string;
  /** The A3 asset this snapshot came from; absent for brand fallbacks. */
  assetId?: Types.ObjectId;
  /** Server-generated private snapshot key; never projected to clients. */
  storageKey: string;
  mime: string;
  bytes: number;
  fontFamily?: string;
}

export interface IAgencyTemplateVersion extends Document {
  agencyId: Types.ObjectId;
  templateId: Types.ObjectId;
  version: number;
  engine: AgencyTemplateEngine;
  schemaVersion: number;
  audience: AgencyTemplateAudience;
  storageKey: string;
  checksum: string;
  sourceBytes: number;
  pageCount: number;
  tokens: string[];
  /**
   * Slot map for the `pdf-background` engine (schema version 1). HTML versions
   * leave this empty; the map is immutable alongside its background bytes.
   */
  slotMap?: AgencyPdfSlotMap;
  slotMapChecksum?: string;
  assets?: IAgencyTemplateVersionAsset[];
  previewedAt?: Date;
  previewedBy?: Types.ObjectId;
  previewTripId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const agencyTemplateVersionAssetSchema = new Schema<IAgencyTemplateVersionAsset>(
  {
    slot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    assetId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyAsset',
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    mime: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    bytes: {
      type: Number,
      required: true,
      min: 0,
    },
    fontFamily: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const agencyTemplateVersionSchema = new Schema<IAgencyTemplateVersion>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyTemplate',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    engine: {
      type: String,
      enum: [...AGENCY_TEMPLATE_ENGINES],
      default: 'html',
      required: true,
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
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    checksum: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      lowercase: true,
    },
    sourceBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    pageCount: {
      type: Number,
      required: true,
      min: 1,
    },
    tokens: {
      type: [String],
      default: [],
    },
    slotMap: {
      type: Schema.Types.Mixed,
    },
    slotMapChecksum: {
      type: String,
      match: /^[a-f0-9]{64}$/,
      lowercase: true,
    },
    assets: {
      type: [agencyTemplateVersionAssetSchema],
      default: [],
    },
    previewedAt: { type: Date },
    previewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    previewTripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// A version number is unique inside one template family and tenant. This is
// the lookup an export uses to resolve its pinned source.
agencyTemplateVersionSchema.index(
  { agencyId: 1, templateId: 1, version: 1 },
  { unique: true }
);

export default mongoose.model<IAgencyTemplateVersion>(
  'AgencyTemplateVersion',
  agencyTemplateVersionSchema
);
