import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A versioned commercial quote for one agency trip (A4).
 *
 * Commercial data is deliberately kept out of `tripDetails`: the AI itinerary
 * remains content, while this document is the priced, sendable record. Quotes
 * are append-only once sent — editing creates `version + 1` with the same
 * number instead of mutating history. All totals are computed server-side.
 */
export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'expired',
  'cancelled',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface IQuoteClientSnapshot {
  name: string;
  email?: string;
  phone?: string;
  adults: number;
  children: number;
  rooms?: number;
}

export interface IQuoteLineItem {
  label: string;
  description?: string;
  quantity: number;
  /** Price per unit in major currency units, before markup/tax. */
  unitPrice: number;
  /** Server-computed `quantity × unitPrice`, rounded to two decimals. */
  total: number;
}

export interface IAgencyQuote extends Document {
  agencyId: Types.ObjectId;
  tripId: Types.ObjectId;
  /** `Q-YYYY-NNNN`, unique per agency across all versions. */
  number: string;
  version: number;
  status: QuoteStatus;
  /** Selected directory record; the snapshot below is authoritative. */
  clientId?: Types.ObjectId;
  client: IQuoteClientSnapshot;
  currency: string;
  lineItems: IQuoteLineItem[];
  subtotal: number;
  markupPct: number;
  markupAmount: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  validUntil: Date;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  preparedBy?: string;
  createdBy: Types.ObjectId;
  sentAt?: Date;
  acceptedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const quoteClientSchema = new Schema<IQuoteClientSnapshot>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    adults: { type: Number, required: true, min: 1, max: 30 },
    children: { type: Number, required: true, min: 0, max: 30 },
    rooms: { type: Number, min: 0, max: 30 },
  },
  { _id: false }
);

const quoteLineItemSchema = new Schema<IQuoteLineItem>(
  {
    label: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const agencyQuoteSchema = new Schema<IAgencyQuote>(
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
    number: {
      type: String,
      required: true,
      trim: true,
      match: /^Q-\d{4}-\d{1,9}$/,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: [...QUOTE_STATUSES],
      default: 'draft',
      required: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyClient',
      default: undefined,
    },
    client: {
      type: quoteClientSchema,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    lineItems: {
      type: [quoteLineItemSchema],
      default: [],
    },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    markupPct: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    markupAmount: { type: Number, required: true, min: 0, default: 0 },
    taxPct: { type: Number, required: true, min: 0, max: 100, default: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0, default: 0 },
    perPerson: { type: Number, required: true, min: 0, default: 0 },
    validUntil: { type: Date, required: true },
    inclusions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    terms: { type: [String], default: [] },
    preparedBy: { type: String, trim: true, maxlength: 120 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sentAt: { type: Date },
    acceptedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// One version row per trip; concurrent first saves cannot create two drafts.
agencyQuoteSchema.index(
  { agencyId: 1, tripId: 1, version: 1 },
  { unique: true }
);
// A quote number is reused across versions but never across trips.
agencyQuoteSchema.index(
  { agencyId: 1, number: 1, version: 1 },
  { unique: true }
);
// "Quotes expiring" lists and lazy expiry reconciliation.
agencyQuoteSchema.index({ agencyId: 1, status: 1, validUntil: 1 });

export default mongoose.model<IAgencyQuote>('AgencyQuote', agencyQuoteSchema);
