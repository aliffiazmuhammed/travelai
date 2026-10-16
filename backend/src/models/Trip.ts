import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITrip extends Document {
  userId: Types.ObjectId;
  title?: string;
  status: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted: boolean;
  shareId?: string;
  isPublic?: boolean;
  tripDetails: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const tripSchema = new Schema<ITrip>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'planned', 'ongoing', 'completed'],
      default: 'planned',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    tripDetails: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

tripSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });

export default mongoose.model<ITrip>('Trip', tripSchema);
