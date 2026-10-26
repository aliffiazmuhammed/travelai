import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Append-only platform audit trail (PA1).
 *
 * Platform actions cross tenant boundaries (account administration, agency
 * provisioning, access grants), so they need a trail independent of any one
 * agency. Rows are written once and never edited from the application; there is
 * deliberately no update/delete helper.
 */
export interface IPlatformAudit extends Document {
  actorId: Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  /** Sanitized, non-secret context (never passwords, tokens or raw headers). */
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const platformAuditSchema = new Schema<IPlatformAudit>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    targetType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    targetId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { versionKey: false }
);

platformAuditSchema.index({ createdAt: -1 });
platformAuditSchema.index({ action: 1, createdAt: -1 });
platformAuditSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export default mongoose.model<IPlatformAudit>('PlatformAudit', platformAuditSchema);
