import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * An agency's public directory profile (Milestone 9 D1).
 *
 * Kept out of the tenant document on purpose: billing, plan and team fields
 * stay in `Agency`, while everything a stranger may read lives here behind an
 * explicit projection. States:
 *
 * - `draft`     — saved but never published (or unpublished).
 * - `published` — eligible for public reads while the agency itself is active.
 * - `hidden`    — ops took it down (moderation), regardless of agency intent.
 *
 * `moderation.hiddenAt` is checked on every public read even for `published`
 * rows, so an ops hide is effective without rewriting the agency's choice.
 */
export const AGENCY_PROFILE_STATES = ['draft', 'published', 'hidden'] as const;
export type AgencyProfileState = (typeof AGENCY_PROFILE_STATES)[number];

export interface IAgencyProfileModeration {
  hiddenAt?: Date | null;
  hiddenBy?: Types.ObjectId;
  reason?: string;
}

export interface IAgencyProfile extends Document {
  agencyId: Types.ObjectId;
  state: AgencyProfileState;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  /** Directory language codes; validated against the taxonomy by the service. */
  languages: string[];
  /** Directory service ids; validated against the taxonomy by the service. */
  services: string[];
  /** Opt-in: contact phone and GSTIN are withheld from public payloads by default. */
  showPhone: boolean;
  showGstin: boolean;
  publishedAt?: Date | null;
  verifiedAt?: Date | null;
  moderation: IAgencyProfileModeration;
  createdAt: Date;
  updatedAt: Date;
}

const moderationSchema = new Schema<IAgencyProfileModeration>(
  {
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const textList = () => ({ type: [String], default: () => [] });

const agencyProfileSchema = new Schema<IAgencyProfile>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
    },
    state: {
      type: String,
      enum: [...AGENCY_PROFILE_STATES],
      default: 'draft',
      required: true,
    },
    about: { type: String, trim: true, maxlength: 1200, default: '' },
    baseCity: { type: String, trim: true, maxlength: 80, default: '' },
    destinations: textList(),
    specialties: textList(),
    languages: textList(),
    services: textList(),
    showPhone: { type: Boolean, default: false, required: true },
    showGstin: { type: Boolean, default: false, required: true },
    publishedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    moderation: {
      type: moderationSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// One profile per tenant; the read path always starts from the agency row.
agencyProfileSchema.index({ agencyId: 1 }, { unique: true, name: 'agencyId_1' });
// Directory listing order: published rows, newest first, with an `_id` tie-break
// so cursor pagination never repeats or skips a row.
agencyProfileSchema.index(
  { state: 1, publishedAt: -1, _id: -1 },
  { name: 'state_1_publishedAt_-1__id_-1' }
);

export default mongoose.model<IAgencyProfile>('AgencyProfile', agencyProfileSchema);
