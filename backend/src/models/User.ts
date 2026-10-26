import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Account realms (PA0). One `User` collection holds three kinds of identity:
 * personal, agency, and platform. The realm is fixed at creation because every
 * authorization decision keys off it; `accountType` is never edited.
 *
 * Email uniqueness is scoped by realm/tenant through partial indexes below:
 * the same address may own a personal account, one agency account per tenant,
 * and (in PA1) a platform account. Sign-in must always filter by realm too.
 */
export const ACCOUNT_TYPES = ['personal', 'agency', 'platform'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PLATFORM_ROLES = ['super_admin'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export interface IUser extends Document {
  email: string;
  password: string;
  googleId?: string;
  /** Realm of this identity. Immutable after creation. */
  accountType: AccountType;
  /** Required for agency accounts; must stay absent on other realms. */
  agencyId?: Types.ObjectId;
  /** Platform accounts only (PA1). */
  platformRole?: PlatformRole;
  /** Disabled accounts keep their data but cannot sign in or use sessions. */
  status: AccountStatus;
  /** Forces the password-change gate on every route except me/password/logout. */
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  /** Bumped on password change/disable; stale JWTs fail on the next request. */
  tokenVersion: number;
  /** Platform admin or agency owner that provisioned this account. */
  createdBy?: Types.ObjectId;
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
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    googleId: {
      type: String,
    },
    accountType: {
      type: String,
      enum: [...ACCOUNT_TYPES],
      default: 'personal',
      required: true,
      immutable: true,
    },
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      immutable: true,
    },
    platformRole: {
      type: String,
      enum: [...PLATFORM_ROLES],
    },
    status: {
      type: String,
      enum: [...ACCOUNT_STATUSES],
      default: 'active',
      required: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
    // Filled by PUT .../chat-key; validated there (base64, ≤512 chars).
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

// Realm-scoped uniqueness. The old global `email_1` index is dropped by the
// PA0 migration; these partial indexes are the target state.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'personal_email_unique',
    partialFilterExpression: { accountType: 'personal' },
  }
);
userSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'platform_email_unique',
    partialFilterExpression: { accountType: 'platform' },
  }
);
userSchema.index(
  { agencyId: 1, email: 1 },
  {
    unique: true,
    name: 'agency_email_unique',
    partialFilterExpression: { accountType: 'agency' },
  }
);
userSchema.index({ accountType: 1, status: 1 }, { name: 'account_type_status' });
// Stable newest-first pagination for the platform account directory.
userSchema.index(
  { createdAt: -1, _id: -1 },
  { name: 'createdAt_-1__id_-1' }
);
userSchema.index(
  { platformRole: 1 },
  {
    name: 'platform_super_admin',
    partialFilterExpression: { platformRole: 'super_admin' },
  }
);

/**
 * Realm invariants that must hold for every write path (signup, invite
 * activation, provisioning, migration). Immutability is enforced by the path
 * options above, so a loaded document cannot move tenants or realms.
 */
userSchema.pre('validate', function (next) {
  const accountType = (this.accountType ?? 'personal') as AccountType;

  if (accountType === 'agency' && !this.agencyId) {
    this.invalidate('agencyId', 'Agency accounts require an agencyId.');
  }
  if (accountType !== 'agency' && this.agencyId) {
    this.invalidate('agencyId', 'Only agency accounts may have an agencyId.');
  }

  if (accountType !== 'platform' && this.platformRole) {
    this.invalidate('platformRole', 'Only platform accounts may have a platformRole.');
  }
  if (accountType === 'platform' && !this.platformRole) {
    this.invalidate('platformRole', 'Platform accounts require a platformRole.');
  }

  next();
});

export default mongoose.model<IUser>('User', userSchema);
