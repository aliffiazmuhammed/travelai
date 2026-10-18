import mongoose, { Document, Schema, Types } from 'mongoose';
import type { TripRole } from '../services/collab/access.js';
import { invitableRoleSchema } from '../services/collab/access.js';

/**
 * An invitation to collaborate on a trip (Milestone 6 §3.5 / sprint E2).
 *
 * Invariants the whole system depends on:
 * - **The raw token is never stored.** `tokenHash` (sha256 of the raw token) is
 *   the lookup key, so a database leak cannot be replayed into trip access.
 * - `role` can never be `owner` — invitations join people at editor/commenter/
 *   viewer; ownership is transferred, never invited.
 * - `acceptedBy[]` is the usage ledger: its size against `maxUses` is what the
 *   redemption race checks atomically (`$expr`), and `$addToSet` dedupes.
 * - `expiresAt` carries a TTL index (expireAfterSeconds: 0) so Mongo removes
 *   dead invites; redemption separately treats an expired token as 404.
 */
export interface ITripInvite extends Document {
  tripId: Types.ObjectId;
  /** sha256 hex of the raw invite token. */
  tokenHash: string;
  /** First characters of the raw token, for the owner's invite list UI. */
  tokenHint: string;
  role: Exclude<TripRole, 'owner'>;
  kind: 'link' | 'email';
  /** Lowercased email the invite is bound to (kind === 'email' only). */
  email?: string;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  maxUses: number;
  /** User ids that consumed a use; the size is compared with `maxUses`. */
  acceptedBy: Types.ObjectId[];
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripInviteSchema = new Schema<ITripInvite>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenHint: { type: String, required: true },
    role: {
      type: String,
      required: true,
      // Validated here too so no code path can mint an owner invite.
      validate: (value: string) => invitableRoleSchema.safeParse(value).success,
    },
    kind: { type: String, enum: ['link', 'email'], required: true },
    email: { type: String, lowercase: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    maxUses: { type: Number, required: true, min: 1 },
    acceptedBy: { type: [Schema.Types.ObjectId], default: [] },
    revokedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// TTL: Mongo deletes the document once `expiresAt` passes (seconds precision).
tripInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ITripInvite>('TripInvite', tripInviteSchema);
