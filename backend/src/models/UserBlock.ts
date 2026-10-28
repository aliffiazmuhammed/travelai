import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A one-way block between two personal accounts (Milestone 8 G5).
 *
 * The blocker is the trip owner: a blocked account can never create a join
 * request on any of the blocker's trips, and any already-pending request is
 * declined when the block is created. Blocks are deliberately one-way — the
 * blocked person is not told, matching "decline is silent".
 */
export interface IUserBlock extends Document {
  blockerId: Types.ObjectId;
  blockedId: Types.ObjectId;
  /** Optional private note for the owner; never shown to the blocked user. */
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userBlockSchema = new Schema<IUserBlock>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

// One block per pair; blocking twice is idempotent, not a second row.
userBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
userBlockSchema.index({ blockerId: 1, createdAt: -1 });

export default mongoose.model<IUserBlock>('UserBlock', userBlockSchema);
