import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A personal account's request to have their data removed (C-08 / D-F).
 *
 * Phase 4 deliberately does not delete anything on click. The request is
 * persisted for the support queue, an audit row is written, and the account
 * owner is told what happens next. Roadmap F19 still applies when the queue is
 * actioned: an owner who shares trips needs a transfer or a decision first.
 */
export type AccountDeletionRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed';

export interface IAccountDeletionRequest extends Document {
  userId: Types.ObjectId;
  email: string;
  name?: string;
  reason?: string;
  status: AccountDeletionRequestStatus;
  requestedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  note?: string;
}

const accountDeletionRequestSchema = new Schema<IAccountDeletionRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Snapshot of the identity at request time: the queue must stay readable
    // even if the account is later renamed or removed.
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    name: { type: String, trim: true, maxlength: 80 },
    reason: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { versionKey: false }
);

// One open request per account. A rejected or completed request may be
// followed by a new one, so the uniqueness is partial rather than absolute.
accountDeletionRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'userId_1_pending' }
);
// The support queue reads pending rows oldest first.
accountDeletionRequestSchema.index({ status: 1, requestedAt: 1 });

export default mongoose.model<IAccountDeletionRequest>(
  'AccountDeletionRequest',
  accountDeletionRequestSchema
);
