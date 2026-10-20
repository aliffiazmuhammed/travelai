import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  googleId?: string;
  /**
   * Display name (Milestone 7, F14). Optional: a member who has never set one is
   * shown by the email local part, exactly as before F14. Stored trimmed and
   * length-capped by the schema layer; never an identity for authorization.
   */
  name?: string;
  /**
   * Profile photo URL (F14) — always a URL this server manages (Cloudinary CDN
   * or `/uploads/avatar-*`), never a client-supplied foreign URL. Removed with
   * the file behind it; see `services/user/avatar.ts`.
   */
  avatarUrl?: string;
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
    // F14 display name: optional, trimmed, 1..40 chars (validated downstream).
    name: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    // F14 profile photo: a URL this server wrote (Cloudinary or local uploads).
    avatarUrl: {
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
