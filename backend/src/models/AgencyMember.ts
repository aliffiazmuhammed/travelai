import mongoose, { Document, Schema, Types } from 'mongoose';
import { AGENCY_ROLES, type AgencyRole } from '../services/agency/access.js';

/**
 * The join table between an agency account and its Agency (Agency Workspace A1,
 * tightened by PA0).
 *
 * PA0 makes the account tenant-scoped: `userId` must reference a User with
 * `accountType: 'agency'` and the same `agencyId` as this row. The unique
 * `{ userId }` index makes "one account, one tenant membership" structural;
 * `{ agencyId, userId }` remains the guard lookup. Services enforce the account
 * realm invariant on every membership write.
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
      // No `index: true` here: the explicit unique `{ userId: 1 }` index below
      // is the single source of truth. Declaring both made Mongoose race a
      // non-unique `userId_1` against the unique one (the PA0 migration saw the
      // non-unique winner on real data).
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

// One membership per account per agency; also the lookup used by the guard.
agencyMemberSchema.index({ agencyId: 1, userId: 1 }, { unique: true });
// PA0: an agency account belongs to exactly one tenant, so one membership per
// account is structural. The old { userId, createdAt } switcher index is gone
// with the switcher itself.
agencyMemberSchema.index({ userId: 1 }, { unique: true });
// Team counts and owner checks.
agencyMemberSchema.index({ agencyId: 1, role: 1 });

export default mongoose.model<IAgencyMember>('AgencyMember', agencyMemberSchema);
