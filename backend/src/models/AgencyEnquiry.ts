import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * One traveller enquiry against a public agency profile (Milestone 9 D5).
 *
 * The enquiry is the first **anonymous write** on a public business page, so
 * the document is designed around three rules:
 *
 * 1. **Inert.** A row is a lead, not a booking: it creates no client, quote,
 *    membership or notification. Conversion is an explicit agency action (D6).
 * 2. **An allow-list.** Only the fields below are written; the submit builder
 *    never spreads a request body into the document.
 * 3. **Tenant-owned.** `agencyId` is the access boundary for every inbox read;
 *    `userId` is optional and only set from a verified personal session.
 *
 * The package, when present, is a published snapshot id. No trip is referenced.
 */
export const AGENCY_ENQUIRY_STATUSES = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
] as const;
export type AgencyEnquiryStatus = (typeof AGENCY_ENQUIRY_STATUSES)[number];

export const AGENCY_ENQUIRY_SOURCES = ['profile', 'package'] as const;
export type AgencyEnquirySource = (typeof AGENCY_ENQUIRY_SOURCES)[number];

/**
 * Approximate per-person budget. A fixed vocabulary keeps the agency inbox
 * filterable; "not sure" exists because most first enquiries do not know yet.
 */
export const AGENCY_ENQUIRY_BUDGET_BANDS = [
  'under_25k',
  '25k_50k',
  '50k_1l',
  'above_1l',
  'not_sure',
] as const;
export type AgencyEnquiryBudgetBand =
  (typeof AGENCY_ENQUIRY_BUDGET_BANDS)[number];

export const AGENCY_ENQUIRY_LIMITS = {
  name: 80,
  email: 160,
  phone: 24,
  message: 1500,
  lostReason: 200,
  adults: 20,
  children: 20,
  party: 30,
  /** Longest sensible trip a first enquiry can describe. */
  dateSpanDays: 90,
} as const;

/**
 * The two-way thread that turns a lead into a conversation (M9 D8).
 *
 * Messages are subdocuments because a thread is always read with its enquiry
 * and never queried across tenants on its own. The cap is a guard against a
 * single document growing without bound, not a product limit.
 */
export const AGENCY_ENQUIRY_THREAD_LIMITS = {
  body: 2000,
  messages: 500,
  /** How long a guest can come back through their private link. */
  tokenTtlDays: 90,
  tokenMaxTtlDays: 365,
} as const;

export const AGENCY_ENQUIRY_MESSAGE_AUTHORS = ['traveller', 'agency'] as const;
export type AgencyEnquiryMessageAuthor =
  (typeof AGENCY_ENQUIRY_MESSAGE_AUTHORS)[number];

export interface IAgencyEnquiryMessage {
  _id?: Types.ObjectId;
  author: AgencyEnquiryMessageAuthor;
  /** Agency member or personal account, when one was signed in. */
  authorId?: Types.ObjectId | null;
  /** Snapshot of the display name at send time. */
  authorName: string;
  body: string;
  createdAt: Date;
  /** Read receipts; the side that did not write the message fills these in. */
  readByAgencyAt?: Date | null;
  readByTravellerAt?: Date | null;
}

export interface IAgencyEnquiryContact {
  name: string;
  email: string;
  phone?: string;
}

export interface IAgencyEnquiryParty {
  adults: number;
  children: number;
}

export interface IAgencyEnquiryDates {
  start?: Date | null;
  end?: Date | null;
  flexible: boolean;
}

export interface IAgencyEnquiry extends Document {
  agencyId: Types.ObjectId;
  /** Published package snapshot, when the form was opened from a card. */
  packageId?: Types.ObjectId | null;
  /** Verified personal account, when the visitor was signed in. */
  userId?: Types.ObjectId | null;
  /** Directory client created or reused when the lead was converted (D6). */
  clientId?: Types.ObjectId | null;
  contact: IAgencyEnquiryContact;
  party: IAgencyEnquiryParty;
  dates: IAgencyEnquiryDates;
  budgetBand?: AgencyEnquiryBudgetBand | null;
  message: string;
  source: AgencyEnquirySource;
  status: AgencyEnquiryStatus;
  /** D6: why a lead was lost (`price`, `dates`, …); free text kept short. */
  lostReason?: string;
  /** D6: agency member who claimed the lead. */
  assignedTo?: Types.ObjectId;
  /** Consent is a timestamp, not a boolean: it is the record we can show. */
  consentAt: Date;
  repliedAt?: Date | null;
  convertedAt?: Date | null;
  /** D8: the thread, oldest first. */
  messages: IAgencyEnquiryMessage[];
  lastMessageAt?: Date | null;
  lastMessageBy?: AgencyEnquiryMessageAuthor | null;
  /**
   * Guest access to the thread (D8). The raw token exists only in the link the
   * traveller kept; the row stores a sha256 hash and a short hint, exactly like
   * trip invites and proposal shares.
   */
  conversationTokenHash?: string | null;
  conversationTokenHint?: string | null;
  conversationTokenExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IAgencyEnquiryContact>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.name,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.email,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.phone,
    },
  },
  { _id: false }
);

const partySchema = new Schema<IAgencyEnquiryParty>(
  {
    adults: {
      type: Number,
      required: true,
      min: 1,
      max: AGENCY_ENQUIRY_LIMITS.adults,
    },
    children: {
      type: Number,
      default: 0,
      min: 0,
      max: AGENCY_ENQUIRY_LIMITS.children,
    },
  },
  { _id: false }
);

const datesSchema = new Schema<IAgencyEnquiryDates>(
  {
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    flexible: { type: Boolean, default: false, required: true },
  },
  { _id: false }
);

const messageSchema = new Schema<IAgencyEnquiryMessage>(
  {
    author: {
      type: String,
      enum: [...AGENCY_ENQUIRY_MESSAGE_AUTHORS],
      required: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: {
      type: String,
      trim: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.name,
      default: '',
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: AGENCY_ENQUIRY_THREAD_LIMITS.body,
    },
    createdAt: { type: Date, default: () => new Date(), required: true },
    readByAgencyAt: { type: Date, default: null },
    readByTravellerAt: { type: Date, default: null },
  },
  { _id: true }
);

const agencyEnquirySchema = new Schema<IAgencyEnquiry>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyPackage',
      default: null,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyClient',
      default: null,
    },
    contact: { type: contactSchema, required: true },
    party: { type: partySchema, required: true },
    dates: { type: datesSchema, default: () => ({ flexible: false }) },
    budgetBand: {
      type: String,
      enum: [...AGENCY_ENQUIRY_BUDGET_BANDS, null],
      default: null,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.message,
    },
    source: {
      type: String,
      enum: [...AGENCY_ENQUIRY_SOURCES],
      default: 'profile',
      required: true,
    },
    status: {
      type: String,
      enum: [...AGENCY_ENQUIRY_STATUSES],
      default: 'new',
      required: true,
    },
    lostReason: {
      type: String,
      trim: true,
      maxlength: AGENCY_ENQUIRY_LIMITS.lostReason,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    consentAt: { type: Date, required: true },
    repliedAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    messages: { type: [messageSchema], default: () => [] },
    lastMessageAt: { type: Date, default: null },
    lastMessageBy: {
      type: String,
      enum: [...AGENCY_ENQUIRY_MESSAGE_AUTHORS, null],
      default: null,
    },
    conversationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    conversationTokenHint: { type: String, default: null },
    conversationTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Inbox, newest first, optionally filtered by status. The `_id` tie-break keeps
// cursor pagination stable when two enquiries share a timestamp.
agencyEnquirySchema.index(
  { agencyId: 1, status: 1, createdAt: -1, _id: -1 },
  { name: 'agencyId_1_status_1_createdAt_-1__id_-1' }
);
agencyEnquirySchema.index(
  { agencyId: 1, createdAt: -1, _id: -1 },
  { name: 'agencyId_1_createdAt_-1__id_-1' }
);
// Profile reply-time read: the last replies for one agency. Partial so the
// many unanswered leads never enter the index.
agencyEnquirySchema.index(
  { agencyId: 1, repliedAt: -1 },
  {
    name: 'agencyId_1_repliedAt_-1',
    partialFilterExpression: { repliedAt: { $type: 'date' } },
  }
);
// A consumer's own history (P2). Partial so guest rows (userId: null) do not
// bloat the index.
agencyEnquirySchema.index(
  { userId: 1, createdAt: -1, _id: -1 },
  {
    name: 'userId_1_createdAt_-1__id_-1',
    partialFilterExpression: { userId: { $type: 'objectId' } },
  }
);
// Conversion looks a lead up by its client link when a member clicks twice.
agencyEnquirySchema.index(
  { agencyId: 1, clientId: 1 },
  {
    name: 'agencyId_1_clientId_1',
    partialFilterExpression: { clientId: { $type: 'objectId' } },
  }
);
// Guest thread access (D8). Partial so the many enquiries without a token stay
// out of the index; the token is never stored in the clear.
agencyEnquirySchema.index(
  { conversationTokenHash: 1 },
  {
    name: 'conversationTokenHash_1',
    unique: true,
    partialFilterExpression: { conversationTokenHash: { $type: 'string' } },
  }
);

export default mongoose.model<IAgencyEnquiry>(
  'AgencyEnquiry',
  agencyEnquirySchema
);
