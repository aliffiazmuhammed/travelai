import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A B2B tenant (Agency Workspace A1).
 *
 * The agency is the hard tenant boundary for staff, clients, trips, quotes and
 * exports. It is deliberately separate from a User: a person may belong to
 * several agencies, and an agency has its own team roles.
 */
export interface IAgencyBranding {
  /**
   * URL of the active logo. Uploaded assets use the private tenant content
   * route; external URLs remain accepted for existing records.
   */
  logoUrl?: string;
  mascotUrl?: string;
  /** Six-digit hex, e.g. #0F766E. */
  primaryColor?: string;
  /** Six-digit hex, e.g. #F59E0B. */
  accentColor?: string;
  /** Font family names applied by branded exports/client pages (A5+). */
  fontHeading?: string;
  fontBody?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
}

/**
 * Reusable commercial text for quotes (A4). A trip quote may override any list;
 * defaults exist so an agent does not retype the same terms for every client.
 */
export interface IAgencyTerms {
  inclusions: string[];
  exclusions: string[];
  terms: string[];
}

/**
 * A8 ops-applied plan override. Absent means the environment default tier.
 * Only TravelAI ops may change it (secret-guarded route); owners read it via
 * the usage endpoint.
 */
export interface IAgencyPlan {
  tierId: string;
  seats?: number;
  monthlyExports?: number;
  storageMb?: number;
}

export interface IAgency extends Document {
  name: string;
  branding: IAgencyBranding;
  /** Indian tax id for quotes/invoices; optional until A4/A5. */
  gstin?: string;
  /** Default inclusions/exclusions/terms copied into a new trip quote. */
  defaultTerms: IAgencyTerms;
  /**
   * Monotonic quote-number sequence, incremented atomically on first save.
   * Never projected to clients — only the formatted number is public.
   */
  quoteCounter: number;
  plan?: IAgencyPlan;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const agencyTermsSchema = new Schema<IAgencyTerms>(
  {
    inclusions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    terms: { type: [String], default: [] },
  },
  { _id: false }
);

const brandingSchema = new Schema<IAgencyBranding>(
  {
    logoUrl: { type: String, trim: true, maxlength: 2048 },
    mascotUrl: { type: String, trim: true, maxlength: 2048 },
    primaryColor: { type: String, trim: true, maxlength: 7 },
    accentColor: { type: String, trim: true, maxlength: 7 },
    fontHeading: { type: String, trim: true, maxlength: 120 },
    fontBody: { type: String, trim: true, maxlength: 120 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    website: { type: String, trim: true, maxlength: 2048 },
    address: { type: String, trim: true, maxlength: 400 },
  },
  { _id: false }
);

const agencyPlanSchema = new Schema<IAgencyPlan>(
  {
    tierId: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    seats: { type: Number, min: 1 },
    monthlyExports: { type: Number, min: 0 },
    storageMb: { type: Number, min: 0 },
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
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    defaultTerms: {
      type: agencyTermsSchema,
      default: () => ({}),
    },
    quoteCounter: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    plan: {
      type: agencyPlanSchema,
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
