import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A public "can we join TravelAI?" request from a travel agency.
 *
 * The applicant has no account: the row holds only the three things the form
 * asks for, plus an optional note about the trips they run. Nothing is created
 * until a platform admin approves, and approval is the same provisioning
 * primitive the console uses for a hand-onboarded agency. This row is therefore
 * the decision trail, not a tenant.
 *
 * Rejection is not a ban: a rejected row leaves the pending index, so the same
 * email may apply again later. Only a *live* pending application blocks a
 * duplicate, which is what the unique partial index enforces.
 */
export const AGENCY_APPLICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type AgencyApplicationStatus =
  (typeof AGENCY_APPLICATION_STATUSES)[number];

export const AGENCY_APPLICATION_LIMITS = {
  name: 80,
  phone: 40,
  email: 160,
  note: 600,
  decisionNote: 500,
} as const;

export interface IAgencyApplication extends Document {
  name: string;
  phone: string;
  email: string;
  /** What kind of trips they run; optional context for the reviewer. */
  note: string;
  status: AgencyApplicationStatus;
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
  /** Internal reasoning for a rejection. Never shown to the applicant. */
  decisionNote: string;
  /** Set on approval: the workspace and its first owner account. */
  agencyId?: Types.ObjectId | null;
  ownerUserId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const agencyApplicationSchema = new Schema<IAgencyApplication>(
  {
    name: {
      type: String,
      trim: true,
      required: true,
      minlength: 2,
      maxlength: AGENCY_APPLICATION_LIMITS.name,
    },
    phone: {
      type: String,
      trim: true,
      required: true,
      maxlength: AGENCY_APPLICATION_LIMITS.phone,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      maxlength: AGENCY_APPLICATION_LIMITS.email,
    },
    note: {
      type: String,
      trim: true,
      maxlength: AGENCY_APPLICATION_LIMITS.note,
      default: '',
    },
    status: {
      type: String,
      enum: [...AGENCY_APPLICATION_STATUSES],
      default: 'pending',
      required: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: {
      type: String,
      trim: true,
      maxlength: AGENCY_APPLICATION_LIMITS.decisionNote,
      default: '',
    },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// The review queue: newest first, filtered by status.
agencyApplicationSchema.index(
  { status: 1, createdAt: -1, _id: -1 },
  { name: 'status_1_createdAt_-1__id_-1' }
);
// The unfiltered history, same stable pagination order as the other admin lists.
agencyApplicationSchema.index(
  { createdAt: -1, _id: -1 },
  { name: 'createdAt_-1__id_-1' }
);
// One live application per email. A rejected or approved row leaves the index,
// so a rejection does not lock the door forever and a second approval attempt
// cannot create a duplicate queue entry.
agencyApplicationSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'email_1_pending',
    partialFilterExpression: { status: 'pending' },
  }
);

export default mongoose.model<IAgencyApplication>(
  'AgencyApplication',
  agencyApplicationSchema
);
