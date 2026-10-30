import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A dated, capped gathering an agency hosts publicly: a nature camp, a group
 * trek, a retreat (Milestone 10 E1).
 *
 * Unlike `AgencyPackage`, an event is not a snapshot of a trip. It has a real
 * window, a venue and a headcount, and it can close. The public eligibility
 * rule therefore lives with the row — published, not ops-hidden, not closed,
 * end date not past — rather than on a profile page.
 *
 * `state` and `closedAt` are separate on purpose: unpublishing hides a mistake,
 * closing ends a booking window. Reopening never needs a second publish, and a
 * close is reversible until the event has actually run.
 *
 * Ops moderation is a subdocument, exactly like profiles and packages, so a
 * takedown never erases the agency's own draft/published decision.
 */
export const AGENCY_EVENT_KINDS = ['camp', 'group_trip', 'retreat', 'other'] as const;
export type AgencyEventKind = (typeof AGENCY_EVENT_KINDS)[number];

export const AGENCY_EVENT_STATES = ['draft', 'published'] as const;
export type AgencyEventState = (typeof AGENCY_EVENT_STATES)[number];

export const AGENCY_EVENT_LIMITS = {
  title: 120,
  summary: 280,
  destination: 80,
  venue: 120,
  capacityMax: 500,
  /** ₹1 crore per person; mirrors the package price ceiling. */
  priceMax: 10_000_000,
  listItem: 80,
  highlights: 6,
} as const;

export interface IAgencyEventModeration {
  hiddenAt?: Date | null;
  hiddenBy?: Types.ObjectId;
  reason?: string;
}

export interface IAgencyEvent extends Document {
  agencyId: Types.ObjectId;
  title: string;
  summary: string;
  kind: AgencyEventKind;
  destination: string;
  venue: string;
  startDate: Date;
  endDate: Date;
  /** Null means no cap; the roster still counts confirmations. */
  capacity?: number | null;
  /** Null means "price on request". */
  pricePerPerson?: number | null;
  currency: string;
  coverAssetId?: Types.ObjectId | null;
  highlights: string[];
  state: AgencyEventState;
  publishedAt?: Date | null;
  /** Set when the agency stops taking interest; the roster is untouched. */
  closedAt?: Date | null;
  moderation: IAgencyEventModeration;
  createdAt: Date;
  updatedAt: Date;
}

const eventModerationSchema = new Schema<IAgencyEventModeration>(
  {
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const agencyEventSchema = new Schema<IAgencyEvent>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    title: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_LIMITS.title,
      default: '',
      required: true,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_LIMITS.summary,
      default: '',
    },
    kind: {
      type: String,
      enum: [...AGENCY_EVENT_KINDS],
      default: 'camp',
      required: true,
    },
    destination: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_LIMITS.destination,
      default: '',
    },
    venue: {
      type: String,
      trim: true,
      maxlength: AGENCY_EVENT_LIMITS.venue,
      default: '',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    capacity: {
      type: Number,
      min: 1,
      max: AGENCY_EVENT_LIMITS.capacityMax,
      default: null,
    },
    pricePerPerson: {
      type: Number,
      min: 0,
      max: AGENCY_EVENT_LIMITS.priceMax,
      default: null,
    },
    currency: {
      type: String,
      enum: ['INR'],
      default: 'INR',
      required: true,
    },
    coverAssetId: { type: Schema.Types.ObjectId, ref: 'AgencyAsset', default: null },
    highlights: { type: [String], default: () => [] },
    state: {
      type: String,
      enum: [...AGENCY_EVENT_STATES],
      default: 'draft',
      required: true,
    },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    moderation: { type: eventModerationSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// The public listing: open windows in start order, soonest first.
agencyEventSchema.index({ startDate: 1, _id: 1 });
// The agency's own library, which shows drafts, closed and past events.
agencyEventSchema.index({ agencyId: 1, state: 1, startDate: -1 });
// One tenant's open events, used by the agency profile read.
agencyEventSchema.index({ agencyId: 1, closedAt: 1, startDate: 1 });

export default mongoose.model<IAgencyEvent>('AgencyEvent', agencyEventSchema);
