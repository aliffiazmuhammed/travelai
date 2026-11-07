import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A single-use, hashed password-reset token for a personal account.
 *
 * The raw token exists only in the emailed link; the row stores its sha256 so a
 * database leak cannot be replayed. Only one live token per account is kept:
 * requesting again invalidates the previous one, and a successful reset
 * invalidates every sibling row. `expiresAt` carries a TTL index.
 */
export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetTokenSchema.index({ userId: 1, usedAt: 1 });

export default mongoose.model<IPasswordResetToken>(
  'PasswordResetToken',
  passwordResetTokenSchema
);
