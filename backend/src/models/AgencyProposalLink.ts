import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A revocable public share for one client proposal (Agency Workspace A7).
 *
 * The link pins the exact things the client saw: the ready client export
 * (which itself pins template, version and quote) and the quote row. Later
 * quote versions, template activations or archive actions never change what
 * an existing link renders or accepts.
 *
 * Token hygiene mirrors invites: the raw token exists only at mint time and in
 * the copied link; `tokenHash` (sha256) is the lookup key. Expired or revoked
 * rows answer the same generic 404 as unknown tokens.
 */
export interface IAgencyProposalLink extends Document {
  agencyId: Types.ObjectId;
  tripId: Types.ObjectId;
  quoteId: Types.ObjectId;
  exportId: Types.ObjectId;
  /**
   * The enquiry this proposal answers, when the quote's client came from one
   * (M9 D8). It lets the traveller's `/proposals` page group links by thread
   * without guessing from quote ids. Older links simply have no value.
   */
  enquiryId?: Types.ObjectId | null;
  tokenHash: string;
  tokenHint: string;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  revokedAt?: Date;
  /** Denormalized from the export at creation; never follows newer rows. */
  quoteNumber?: string;
  quoteVersion?: number;
  templateName?: string;
  lastViewedAt?: Date;
  viewCount: number;
  acceptedAt?: Date;
  /**
   * The traveller answered "not this one" in-app (M9 R6). A decline closes
   * that version only: the quote stays `sent` and the agency can share a new
   * proposal, but the declined link can no longer be accepted.
   */
  declinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agencyProposalLinkSchema = new Schema<IAgencyProposalLink>(
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
      required: true,
    },
    exportId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyExport',
      required: true,
    },
    enquiryId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyEnquiry',
      default: null,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenHint: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    quoteNumber: { type: String, trim: true, maxlength: 20 },
    quoteVersion: { type: Number, min: 1 },
    templateName: { type: String, trim: true, maxlength: 80 },
    lastViewedAt: { type: Date },
    viewCount: { type: Number, default: 0, min: 0 },
    acceptedAt: { type: Date },
    declinedAt: { type: Date },
  },
  { timestamps: true }
);

// Mongo removes expired links; lookups still check the date explicitly.
agencyProposalLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The trip's share list.
agencyProposalLinkSchema.index({ agencyId: 1, tripId: 1, createdAt: -1 });
// A traveller's proposal comparison (D8). Partial so links that answer no
// enquiry stay out of the index.
agencyProposalLinkSchema.index(
  { agencyId: 1, enquiryId: 1, createdAt: -1 },
  {
    name: 'agencyId_1_enquiryId_1_createdAt_-1',
    partialFilterExpression: { enquiryId: { $type: 'objectId' } },
  }
);

export default mongoose.model<IAgencyProposalLink>(
  'AgencyProposalLink',
  agencyProposalLinkSchema
);
