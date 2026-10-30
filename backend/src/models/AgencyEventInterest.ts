import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * One person's "I'm interested" in an agency event (Milestone 10 E2).
 *
 * This is deliberately not an `AgencyEnquiry`: the contact triple is the
 * whole record, there is no thread to host, and the visitor needs no account.
 * The agency works the list — call or write to verify, then confirm — and a
 * confirmed row is what "added to the event" means. No payment lives here.
 *
 * The unique partial index keeps a refresh or double tap from queueing the
 * same person twice while their row is still live. A declined row falls out of
 * the index, so the agency can change its mind or the person can ask again.
 */
export const AGENCY_EVENT_INTEREST_STATUSES = [
  'pending',
  'confirmed',
  'declined',
] as const;
export type AgencyEventInterestStatus =
  (typeof AGENCY_EVENT_INTEREST_STATUSES)[number];

export const AGENCY_EVENT_INTEREST_LIMITS = {
  name: 120,
  email: 160,
  phone: 40,
  note: 500,
} as const;

export interface IAgencyEventInterest extends Document {
  eventId: Types.ObjectId;
  agencyId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  note: string;
  status: AgencyEventInterestStatus;
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventInterestSchema = new Schema<IAgencyEventInterest>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'AgencyEvent', required: true },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_INTEREST_LIMITS.name,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: AGENCY_EVENT_INTEREST_LIMITS.email,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_INTEREST_LIMITS.phone,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_INTEREST_LIMITS.note,
      default: '',
    },
    status: {
      type: String,
      enum: [...AGENCY_EVENT_INTEREST_STATUSES],
      default: 'pending',
      required: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The roster read: newest interest first, filterable by status.
eventInterestSchema.index({ eventId: 1, status: 1, createdAt: -1 });
// The agency-wide queue across events.
eventInterestSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
// One live interest per person per event. Declined rows leave the index.
eventInterestSchema.index(
  { eventId: 1, email: 1 },
  {
    unique: true,
    name: 'eventId_1_email_1_live',
    partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } },
  }
);

export default mongoose.model<IAgencyEventInterest>(
  'AgencyEventInterest',
  eventInterestSchema
);
