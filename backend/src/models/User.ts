import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  googleId?: string;
  /**
   * Chat identity public key (base64 SPKI, ECDH P-256) — Milestone 7, F10.
   * Published by the browser right after it mints the keypair; the matching
   * private key NEVER leaves the device (localStorage + a backup code). The
   * server only ever sees this half, which is what lets any member's browser
   * envelope the conversation key for every member.
   *
   * This is the NEWEST published device key (roster display + compatibility);
   * `chatPubKeys` keeps the rest so a second browser of the same account keeps
   * its own envelope slot (F10d multi-device).
   */
  chatPubKey?: string;
  /** Every device this account has published from, newest first, capped. */
  chatPubKeys?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    googleId: {
      type: String,
    },
    // Filled by PUT /api/auth/chat-key; validated there (base64, ≤512 chars).
    chatPubKey: {
      type: String,
    },
    // F10d: one slot per device (browser) of this account, newest first.
    chatPubKeys: {
      type: [String],
      default: undefined,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', userSchema);
