import mongoose, { Schema, Types } from 'mongoose';

/**
 * Trip photos (days, activities, stays and food spots).
 *
 * Bytes live in private storage; itinerary items only carry a media id. The
 * document is trip-scoped so one access check covers every reference, and
 * snapshots/version history stay small because they store ids, not data URLs.
 */
export interface ITripMedia {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  /** `<tripId>/<mediaId>.<ext>`, generated server-side. */
  storageKey: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: Date;
  updatedAt: Date;
}

const tripMediaSchema = new Schema<ITripMedia>(
  {
    tripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
      maxlength: 200,
    },
    mime: {
      type: String,
      required: true,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
    },
    bytes: {
      type: Number,
      required: true,
      min: 1,
    },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
  },
  { timestamps: true }
);

// Gallery/editor listings read one trip's media, newest first.
tripMediaSchema.index({ tripId: 1, createdAt: -1 });

export default mongoose.model<ITripMedia>('TripMedia', tripMediaSchema);
