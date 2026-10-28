import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A safety report against published content (Milestone 8 G6).
 *
 * Reports are deliberately small: one row per reporter per target, a fixed
 * reason vocabulary and an optional note. A report is never public. The
 * `status` field is the moderation lifecycle:
 *
 * - `open`      — waiting for review (counts toward the auto-hide threshold)
 * - `hidden`    — reviewed and de-listed by an admin
 * - `dismissed` — reviewed and found acceptable (content restored)
 *
 * The trip's own `moderation` field is the fast query key; this collection is
 * the audit trail and the admin queue.
 */
export const REPORT_TARGET_TYPES = ['trip', 'profile'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'scam',
  'privacy',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'hidden', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Distinct open reporters required before a trip leaves the gallery. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

export interface ITripReport extends Document {
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  /** A Trip or User id, depending on `targetType`. */
  targetId: Types.ObjectId;
  reason: ReportReason;
  note?: string;
  status: ReportStatus;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripReportSchema = new Schema<ITripReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: {
      type: String,
      enum: [...REPORT_TARGET_TYPES],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: [...REPORT_REASONS], required: true },
    note: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: [...REPORT_STATUSES],
      default: 'open',
      required: true,
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

// One report per person per target. Re-reporting after a dismissal is not a
// second row; the admin decision stands until new content is published.
tripReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);
// Auto-hide count and the per-target admin detail.
tripReportSchema.index({ targetType: 1, targetId: 1, status: 1 });
// Admin queue: newest open reports first.
tripReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ITripReport>('TripReport', tripReportSchema);
