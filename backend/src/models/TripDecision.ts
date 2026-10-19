import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A logged decision (Milestone 7, F9) — a comment promoted into a durable
 * "what we agreed on" card for the trip.
 *
 * Rules locked into this schema:
 * - **Snapshot semantics.** `body` and the author link are copied here at
 *   promotion time. The discussion is conversation — people edit and retract
 *   remarks as thoughts evolve; the decision record freezes what was agreed
 *   WHEN it was agreed. Promoting then editing the comment cannot rewrite
 *   history, and the snapshot survives even if the comment is later removed.
 * - **One decision per comment.** A partial unique index on `commentId`
 *   (active rows only) makes re-promotion a 409 instead of a duplicate.
 * - **Never touches the Trip document** (the F6a §19.2 rule again): marking or
 *   unmarking a decision must never bump `rev` or 409 an open edit.
 */
export interface ITripDecision extends Document {
  tripId: Types.ObjectId;
  /** The comment this decision was made from — the discussion link back. */
  commentId: Types.ObjectId;
  /** The COMMENT's author (degenerate label source), snapshotted with body. */
  userId: Types.ObjectId;
  /** Who promoted it — decision authorship binds here, not to the comment. */
  createdBy: Types.ObjectId;
  /** Snapshot of the comment body at promotion time. */
  body: string;
  /** Optional day anchor inherited from the comment (bounds trip context). */
  day?: number;
  /** Tombstone (unmark) — soft, like comments, for the audit trail. */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripDecisionSchema = new Schema<ITripDecision>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    commentId: { type: Schema.Types.ObjectId, ref: 'TripComment', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    day: { type: Number, default: undefined },
    deletedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

// One ACTIVE decision per comment. Tombstones don't collide: they're closed
// history, and remark-then-unmark-then-promote-again must be possible.
tripDecisionSchema.index(
  { commentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } }
);
tripDecisionSchema.index({ tripId: 1, createdAt: -1 });

export default mongoose.model<ITripDecision>('TripDecision', tripDecisionSchema);
