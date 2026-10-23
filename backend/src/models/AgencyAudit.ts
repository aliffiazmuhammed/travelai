import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Append-only tenant audit trail (Agency Workspace A5).
 *
 * A5 records export lifecycle events; A8 adds the viewer and the remaining
 * member/quote/template events. There are deliberately no update helpers — an
 * audit row is written once and never edited from the application.
 */
export interface IAgencyAudit extends Document {
  agencyId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const agencyAuditSchema = new Schema<IAgencyAudit>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { versionKey: false }
);

agencyAuditSchema.index({ agencyId: 1, createdAt: -1 });
agencyAuditSchema.index({ agencyId: 1, action: 1, createdAt: -1 });

export default mongoose.model<IAgencyAudit>('AgencyAudit', agencyAuditSchema);
