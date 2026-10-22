import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A B2B tenant (Agency Workspace A1).
 *
 * The agency is the hard tenant boundary for staff, clients, trips, quotes and
 * exports. It is deliberately separate from a User: a person may belong to
 * several agencies, and an agency has its own team roles.
 */
export interface IAgencyBranding {
  /** URL of the agency logo. Upload/storage lands with the branding sprint. */
  logoUrl?: string;
  /** Six-digit hex, e.g. #0F766E. */
  primaryColor?: string;
  /** Six-digit hex, e.g. #F59E0B. */
  accentColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
}

export interface IAgency extends Document {
  name: string;
  branding: IAgencyBranding;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const brandingSchema = new Schema<IAgencyBranding>(
  {
    logoUrl: { type: String, trim: true, maxlength: 2048 },
    primaryColor: { type: String, trim: true, maxlength: 7 },
    accentColor: { type: String, trim: true, maxlength: 7 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    website: { type: String, trim: true, maxlength: 2048 },
    address: { type: String, trim: true, maxlength: 400 },
  },
  { _id: false }
);

const agencySchema = new Schema<IAgency>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    branding: {
      type: brandingSchema,
      default: () => ({}),
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IAgency>('Agency', agencySchema);
