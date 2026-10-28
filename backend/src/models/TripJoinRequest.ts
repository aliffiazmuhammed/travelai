import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A stranger's request to join a published trip (Milestone 8 G5).
 *
 * Requests are queued for the owner; approval grants **commenter** only. The
 * status is a small state machine because the same row is the requester's
 * receipt ("pending"/"approved"/"declined") and the owner's audit trail.
 */
export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface ITripJoinRequest extends Document {
  tripId: Types.ObjectId;
  requesterId: Types.ObjectId;
  /** Message to the owner; short and optional. */
  message?: string;
  status: JoinRequestStatus;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripJoinRequestSchema = new Schema<ITripJoinRequest>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, trim: true, maxlength: 280 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'withdrawn'],
      default: 'pending',
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

// Owner queue: pending requests for one trip, oldest first.
tripJoinRequestSchema.index({ tripId: 1, status: 1, createdAt: 1 });
// Requester history: "what happened to my request?"
tripJoinRequestSchema.index({ requesterId: 1, createdAt: -1 });
// One *pending* request per person per trip. History rows (declined,
// withdrawn, approved) are allowed to coexist with a later request.
tripJoinRequestSchema.index(
  { tripId: 1, requesterId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export default mongoose.model<ITripJoinRequest>('TripJoinRequest', tripJoinRequestSchema);
