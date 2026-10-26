import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A B2B tenant (Agency Workspace A1).
 *
 * The agency is the hard tenant boundary for staff, clients, trips, quotes and
 * exports. It is deliberately separate from a User: each agency account belongs
 * to exactly one tenant (PA0), and an agency has its own team roles.
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

export const AGENCY_STATUSES = ['active', 'suspended'] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

/** Platform-side billing metadata (PA0 stores it; PA3 edits it). */
export interface IAgencyBilling {
  contactName?: string;
  contactEmail?: string;
  renewalDate?: Date;
  notes?: string;
}

export interface IAgency extends Document {
  name: string;
  /** Workspace slug used in `/agency/login?workspace=<slug>`. Immutable. */
  slug: string;
  /** Suspension blocks agency sessions, invites and public proposal links. */
  status: AgencyStatus;
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
  /** Platform account that provisioned the tenant (PA3). */
  provisionedBy?: Types.ObjectId;
  provisionedAt?: Date;
  billing?: IAgencyBilling;
  /**
   * Agency-side creator: the owner agency account. For a self-service legacy
   * row this is the personal account that created it before PA0.
   */
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

const agencyBillingSchema = new Schema<IAgencyBilling>(
  {
    contactName: { type: String, trim: true, maxlength: 120 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    renewalDate: { type: Date },
    notes: { type: String, trim: true, maxlength: 2000 },
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
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      immutable: true,
    },
    status: {
      type: String,
      enum: [...AGENCY_STATUSES],
      default: 'active',
      required: true,
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
    provisionedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    provisionedAt: {
      type: Date,
    },
    billing: {
      type: agencyBillingSchema,
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

// Admin directory filters and dashboard counts (PA1/PA3).
agencySchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IAgency>('Agency', agencySchema);
