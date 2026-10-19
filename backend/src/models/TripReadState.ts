import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Per-member read marker for the trip discussion (Milestone 7, F8a).
 *
 * Deliberately a **separate collection, never on the Trip document** (the F6a
 * §19.2 rule): a read-marker write happens on every drawer open, so keeping it
 * inside `Trip` would bump `rev` on reads and collaborators' open edits would
 * see spurious 409s. Reads must never cost a rev.
 *
 * One row per (trip, user), upserted — `lastReadAt` is the only field. there is
 * deliberately NO unread array/counter denormalization: unread is a cheap
 * indexed count over an insert-only collection, so a sort of read-marker can
 * never drift from the truth.
 */
export interface ITripReadState extends Document {
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Comments strictly AFTER this instant count as unread for the user. */
  lastReadAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripReadStateSchema = new Schema<ITripReadState>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// The one lookup + upsert key. Unique so concurrent first-opens cannot fan out
// rows (the loser of the race is a harmless update).
tripReadStateSchema.index({ tripId: 1, userId: 1 }, { unique: true });

export default mongoose.model<ITripReadState>('TripReadState', tripReadStateSchema);
