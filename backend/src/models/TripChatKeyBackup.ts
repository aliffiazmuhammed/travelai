import mongoose, { Schema, Types } from 'mongoose';
import { BACKUP_EPOCH_MAX, isCanonicalBase64url } from '../schemas/keyBackup.schema.js';

export interface TripKeyBackup {
  v: 1;
  userId: string;
  tripId: string;
  epoch: number;
  generation: string;
  rowRevision: number;
  iv: string;
  ct: string;
}
interface StoredTripKeyBackup extends Omit<TripKeyBackup, 'userId' | 'tripId'> {
  userId: Types.ObjectId;
  tripId: Types.ObjectId;
}
const binary = (bytes: number) => ({
  type: String, required: true, validate: (value: string) => isCanonicalBase64url(value, bytes),
});
const schema = new Schema<StoredTripKeyBackup>({
  v: { type: Number, required: true, enum: [1] },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, immutable: true },
  epoch: { type: Number, required: true, min: 1, max: BACKUP_EPOCH_MAX, immutable: true, validate: Number.isInteger },
  generation: { ...binary(16), immutable: true },
  rowRevision: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  iv: binary(12), ct: binary(48),
}, { timestamps: true });
schema.index({ userId: 1, tripId: 1, epoch: -1, generation: 1 }, { unique: true });
schema.index({ tripId: 1 });
export default mongoose.model<StoredTripKeyBackup>('TripChatKeyBackup', schema);
