import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A reusable client record in an agency's address book (A4).
 *
 * This is directory data, not an access grant: clients only ever see a trip
 * through the existing trip invite/role system. Every query must be scoped by
 * `agencyId`; deleting a record unlinks it from tenant trips but never rewrites
 * historical quote snapshots.
 */
export interface IAgencyClient extends Document {
  agencyId: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const agencyClientSchema = new Schema<IAgencyClient>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// The directory lists one tenant's clients alphabetically.
agencyClientSchema.index({ agencyId: 1, name: 1 });
agencyClientSchema.index({ agencyId: 1, createdAt: -1 });

export default mongoose.model<IAgencyClient>('AgencyClient', agencyClientSchema);
