import mongoose, { Document, Schema, Types } from 'mongoose';
import { AGENCY_ROLES, type AgencyRole } from '../services/agency/access.js';

/**
 * The join table between a User and an Agency (Agency Workspace A1).
 *
 * The compound unique index is the tenant boundary in the database: the same
 * user can be in many agencies, but only once per agency. Every agency query
 * must filter by `agencyId`; there is no "current agency" implicit in the
 * document.
 */
export interface IAgencyMember extends Document {
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AgencyRole;
  invitedBy?: Types.ObjectId;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agencyMemberSchema = new Schema<IAgencyMember>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: [...AGENCY_ROLES],
      required: true,
      default: 'viewer',
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

// One membership per person per agency; also the lookup used by the guard.
agencyMemberSchema.index({ agencyId: 1, userId: 1 }, { unique: true });
// The agency switcher lists every membership for a user.
agencyMemberSchema.index({ userId: 1, createdAt: 1 });
// Team counts and owner checks.
agencyMemberSchema.index({ agencyId: 1, role: 1 });

export default mongoose.model<IAgencyMember>('AgencyMember', agencyMemberSchema);
