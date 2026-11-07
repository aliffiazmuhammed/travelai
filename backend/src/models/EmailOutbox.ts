import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Durable queue for transactional email (P0).
 *
 * A service hook only writes a row; the dispatcher sends it. That ordering is
 * deliberate: a mail outage must never fail an enquiry, a quote send or an
 * acceptance. Rows survive restarts, so a free host that spins down mid-send
 * still delivers once it wakes up.
 *
 * `dedupeKey` is what makes retries and double-clicks safe. It is unique per
 * recipient and event ("proposal:<id>:sent:<email>"); a duplicate insert is a
 * silent no-op. The reply templates also fold a time bucket into the key, so a
 * chatty thread produces one email per window instead of one per message.
 */
export const EMAIL_OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'failed'] as const;
export type EmailOutboxStatus = (typeof EMAIL_OUTBOX_STATUSES)[number];

export interface IEmailOutbox extends Document {
  /** Template id, e.g. `enquiry.new`, `proposal.sent`. Used for stats/debug. */
  kind: string;
  recipient: string;
  recipientName?: string;
  subject: string;
  html: string;
  text: string;
  dedupeKey?: string;
  agencyId?: Types.ObjectId | null;
  status: EmailOutboxStatus;
  attempts: number;
  lastError?: string | null;
  nextAttemptAt: Date;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const emailOutboxSchema = new Schema<IEmailOutbox>(
  {
    kind: { type: String, required: true, trim: true, maxlength: 60 },
    recipient: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    recipientName: { type: String, trim: true, maxlength: 120 },
    subject: { type: String, required: true, maxlength: 300 },
    html: { type: String, required: true },
    text: { type: String, required: true },
    dedupeKey: { type: String, trim: true, maxlength: 200 },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    status: {
      type: String,
      enum: [...EMAIL_OUTBOX_STATUSES],
      default: 'pending',
      required: true,
    },
    attempts: { type: Number, default: 0, min: 0, required: true },
    lastError: { type: String, maxlength: 500, default: null },
    nextAttemptAt: { type: Date, default: () => new Date(), required: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One live row per key. A partial index (rather than sparse) keeps documents
// without a key out of the constraint entirely.
emailOutboxSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    name: 'dedupe_key_unique',
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  }
);
emailOutboxSchema.index({ status: 1, nextAttemptAt: 1 }, { name: 'status_next_attempt' });
emailOutboxSchema.index({ createdAt: -1 }, { name: 'createdAt_desc' });

const EmailOutbox = mongoose.model<IEmailOutbox>('EmailOutbox', emailOutboxSchema);

export default EmailOutbox;
