import mongoose, { Document, Schema, Types } from 'mongoose';
import type { AgencyTemplateAudience } from './AgencyTemplate.js';

/**
 * One asynchronous document export job (Agency Workspace A5).
 *
 * The row is the durable job state; bytes live behind the private storage
 * adapter. A failed job keeps its error so the UI can offer a retry without
 * losing the original request. Quote/template identity is pinned at request
 * time, which is what keeps old exports explainable after a new version.
 */
export const AGENCY_EXPORT_STATUSES = [
  'queued',
  'rendering',
  'ready',
  'failed',
] as const;
export type AgencyExportStatus = (typeof AGENCY_EXPORT_STATUSES)[number];

export const AGENCY_EXPORT_FORMATS = ['pdf'] as const;
export type AgencyExportFormat = (typeof AGENCY_EXPORT_FORMATS)[number];

export interface IAgencyExport extends Document {
  agencyId: Types.ObjectId;
  tripId: Types.ObjectId;
  quoteId?: Types.ObjectId;
  quoteNumber?: string;
  quoteVersion?: number;
  templateId: Types.ObjectId;
  templateVersion: number;
  templateName: string;
  audience: AgencyTemplateAudience;
  format: AgencyExportFormat;
  status: AgencyExportStatus;
  outputKey?: string;
  bytes?: number;
  /** Pages in the finished document; known only after a successful render. */
  pageCount?: number;
  /** Safe, user-facing failure reason; never a filesystem path. */
  error?: string;
  attempts: number;
  requestedBy: Types.ObjectId;
  startedAt?: Date;
  completedAt?: Date;
  /** After this instant the signed download is no longer served. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agencyExportSchema = new Schema<IAgencyExport>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    tripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true,
    },
    quoteId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyQuote',
    },
    quoteNumber: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    quoteVersion: {
      type: Number,
      min: 1,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyTemplate',
      required: true,
    },
    templateVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    audience: {
      type: String,
      enum: ['client', 'internal'],
      required: true,
    },
    format: {
      type: String,
      enum: [...AGENCY_EXPORT_FORMATS],
      default: 'pdf',
      required: true,
    },
    status: {
      type: String,
      enum: [...AGENCY_EXPORT_STATUSES],
      default: 'queued',
      required: true,
    },
    outputKey: {
      type: String,
      trim: true,
    },
    bytes: {
      type: Number,
      min: 0,
    },
    pageCount: {
      type: Number,
      min: 1,
    },
    error: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    attempts: {
      type: Number,
      default: 1,
      min: 1,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Trip export history and the agency-wide recent exports list.
agencyExportSchema.index({ agencyId: 1, tripId: 1, createdAt: -1 });
agencyExportSchema.index({ agencyId: 1, createdAt: -1 });
// Crash recovery can find jobs that never reached a terminal state.
agencyExportSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model<IAgencyExport>('AgencyExport', agencyExportSchema);
