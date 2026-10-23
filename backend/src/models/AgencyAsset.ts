import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A private brand asset owned by one agency (Agency Workspace A3).
 *
 * Bytes live behind the storage adapter, never in Mongo and never under the
 * public `/uploads` prefix. Every lookup must filter by `agencyId`; the content
 * route re-checks membership before streaming the file.
 */
export const AGENCY_ASSET_KINDS = ['logo', 'mascot', 'font', 'image'] as const;
export type AgencyAssetKind = (typeof AGENCY_ASSET_KINDS)[number];

export interface IAgencyAsset extends Document {
  agencyId: Types.ObjectId;
  kind: AgencyAssetKind;
  storageKey: string;
  mime: string;
  bytes: number;
  originalName?: string;
  fontFamily?: string;
  licenseNote?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const agencyAssetSchema = new Schema<IAgencyAsset>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: [...AGENCY_ASSET_KINDS],
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
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
    originalName: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    fontFamily: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    licenseNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// The settings library lists one tenant's assets, newest first.
agencyAssetSchema.index({ agencyId: 1, createdAt: -1 });
agencyAssetSchema.index({ agencyId: 1, kind: 1, createdAt: -1 });

export default mongoose.model<IAgencyAsset>('AgencyAsset', agencyAssetSchema);
