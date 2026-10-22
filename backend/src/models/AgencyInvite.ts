import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AGENCY_INVITABLE_ROLES,
  agencyInvitableRoleSchema,
  type AgencyInvitableRole,
} from '../services/agency/access.js';

/**
 * An invitation to join an agency's staff (Agency Workspace A1).
 *
 * Token hygiene is identical to trip invites (`models/TripInvite.ts`):
 * - the raw token exists only at mint time and in the copied link;
 * - `tokenHash` (sha256) is the lookup key, unique;
 * - `acceptedBy[]` is the usage ledger checked atomically at redemption;
 * - `expiresAt` has a TTL index, and redemption separately rejects expired or
 *   revoked rows with the same generic 404.
 *
 * `role` can never be `owner`. Ownership is a deliberate promotion by an
 * existing owner, never something a forwarded link can grant.
 */
export interface IAgencyInvite extends Document {
  agencyId: Types.ObjectId;
  tokenHash: string;
  tokenHint: string;
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  email?: string;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  maxUses: number;
  acceptedBy: Types.ObjectId[];
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agencyInviteSchema = new Schema<IAgencyInvite>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenHint: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: [...AGENCY_INVITABLE_ROLES],
      validate: (value: string) => agencyInvitableRoleSchema.safeParse(value).success,
    },
    kind: { type: String, enum: ['link', 'email'], required: true },
    email: { type: String, lowercase: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    maxUses: { type: Number, required: true, min: 1 },
    acceptedBy: { type: [Schema.Types.ObjectId], default: [] },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

// Mongo removes expired invites; redemption still checks the date explicitly.
agencyInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The pending-invite list for one agency.
agencyInviteSchema.index({ agencyId: 1, createdAt: -1 });

export default mongoose.model<IAgencyInvite>('AgencyInvite', agencyInviteSchema);
