import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A published snapshot of one agency trip (Milestone 9 D4).
 *
 * The row is a **copy**, not a view of the trip: title, nights, highlights and
 * price are written once and read from here forever. Editing or deleting the
 * source trip can neither change nor break a public package. `tripId` is kept
 * only as provenance (and to stop one trip producing two packages); it is never
 * projected to a public payload.
 *
 * `coverAssetId` points at an `AgencyAsset` of kind `image`. Public visitors
 * read the bytes through `/api/agencies/:slug/packages/:id/cover`, which
 * re-checks the profile's public eligibility first — an asset URL is never
 * exposed directly.
 *
 * Ops moderation is a separate subdocument rather than a third state, so a
 * takedown never erases the agency's own draft/published choice: restoring the
 * package puts it back exactly where it was. Every public read excludes
 * `moderation.hiddenAt` even when the row still says `published`.
 */
export const AGENCY_PACKAGE_STATES = ['draft', 'published'] as const;
export type AgencyPackageState = (typeof AGENCY_PACKAGE_STATES)[number];

export interface IAgencyPackageModeration {
  hiddenAt?: Date | null;
  hiddenBy?: Types.ObjectId;
  reason?: string;
}

export const AGENCY_PACKAGE_LIMITS = {
  title: 120,
  summary: 280,
  nights: 60,
  listItem: 80,
  highlights: 6,
  inclusions: 12,
  /** ₹1 crore per person; keeps a stray keystroke from publishing a typo price. */
  priceMax: 10_000_000,
} as const;

export interface IAgencyPackage extends Document {
  agencyId: Types.ObjectId;
  /** Provenance only. Never selected by a public projection. */
  tripId?: Types.ObjectId | null;
  title: string;
  summary: string;
  nights: number;
  /** Null means "price on request". */
  fromPricePerPerson?: number | null;
  currency: string;
  coverAssetId?: Types.ObjectId | null;
  highlights: string[];
  inclusions: string[];
  state: AgencyPackageState;
  order: number;
  publishedAt?: Date | null;
  moderation: IAgencyPackageModeration;
  createdAt: Date;
  updatedAt: Date;
}

const packageModerationSchema = new Schema<IAgencyPackageModeration>(
  {
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const agencyPackageSchema = new Schema<IAgencyPackage>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
    },
    tripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
    },
    title: {
      type: String,
      trim: true,
      maxlength: AGENCY_PACKAGE_LIMITS.title,
      default: '',
      required: true,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: AGENCY_PACKAGE_LIMITS.summary,
      default: '',
    },
    nights: {
      type: Number,
      min: 0,
      max: AGENCY_PACKAGE_LIMITS.nights,
      default: 1,
      required: true,
    },
    fromPricePerPerson: {
      type: Number,
      min: 0,
      max: AGENCY_PACKAGE_LIMITS.priceMax,
      default: null,
    },
    currency: {
      type: String,
      enum: ['INR'],
      default: 'INR',
      required: true,
    },
    coverAssetId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyAsset',
      default: null,
    },
    highlights: {
      type: [String],
      default: () => [],
    },
    inclusions: {
      type: [String],
      default: () => [],
    },
    state: {
      type: String,
      enum: [...AGENCY_PACKAGE_STATES],
      default: 'draft',
      required: true,
    },
    order: { type: Number, default: 0, required: true },
    publishedAt: { type: Date, default: null },
    moderation: {
      type: packageModerationSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// The agency's own library view.
agencyPackageSchema.index({ agencyId: 1, state: 1, order: 1 });
// The public profile read: published rows in display order, newest first.
agencyPackageSchema.index(
  { agencyId: 1, state: 1, publishedAt: -1, _id: -1 },
  { name: 'agencyId_1_state_1_publishedAt_-1__id_-1' }
);
// One package per source trip, so the trip view always has one row to open.
// Scratch packages (`tripId: null`) are exempt.
agencyPackageSchema.index(
  { agencyId: 1, tripId: 1 },
  {
    unique: true,
    name: 'agencyId_1_tripId_1',
    partialFilterExpression: { tripId: { $type: 'objectId' } },
  }
);

export default mongoose.model<IAgencyPackage>('AgencyPackage', agencyPackageSchema);
