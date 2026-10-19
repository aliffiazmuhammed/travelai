import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A comment on a trip (Milestone 6 §19 / sprint F6a).
 *
 * Deliberately a **separate collection**, not an embedded array under `Trip`:
 * the F13 lesson of this milestone was that embedded arrays must be bounded by
 * *trip content* (`members`, `versions`, `expenses`, `customRoutes`). Comments
 * grow with **people**, so embedding them would repeat the unbounded-array
 * mistake and repaginate every trip read.
 *
 * Invariants the rest of the system depends on:
 * - `tripId` is the only lookup key besides `_id` (indexed below).
 * - Writes here **never touch the `Trip` document** — no `rev` bump, no
 *   `trip:updated` frame — so leaving a remark can never cause a collaborator's
 *   open edit to fail with a 409 (see §19.2).
 * - `deletedAt` marks a soft-delete tombstone (owner moderation): the row and
 *   its `userId` survive as an audit trail; only `body` is emptied.
 * - `body` carries NO markup — plain text (or, since F10, base64 ciphertext)
 *   rendered as text in the SPA, which is what makes rendering XSS-safe by
 *   construction.
 * - F10 end-to-end encryption: when `e2ee` is true, `body` is
 *   `"<base64 iv>.<base64 AES-GCM ciphertext>"` — the conversation key is
 *   held only by members (enveloped per public key in `TripChatKey`), so the
 *   server stores it exactly as opaque bytes. Rows without the flag are the
 *   legacy plaintext format and keep rendering unchanged.
 */

export interface ITripComment extends Document {
  tripId: Types.ObjectId;
  /** Author of record — never denormalized away; binds edit/moderation rights. */
  userId: Types.ObjectId;
  /** Plain-text body, or `iv.ct` ciphertext when `e2ee`; emptied on tombstones. */
  body: string;
  /** F10: true when `body` is end-to-end ciphertext rather than plain text. */
  e2ee: boolean;
  /** Optional day anchor (1..999); absent means "about the trip in general". */
  day?: number;
  /** Set when the author edits the body (renders "(edited)" in the SPA). */
  editedAt?: Date;
  /** Soft-delete marker: a tombstone, not a removal. */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tripCommentSchema = new Schema<ITripComment>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: {
      type: String,
      trim: true,
      // Sanity backstop only — the *configured* cap (`COMMENT_MAX_LEN`) is
      // enforced by the zod schema so raising it needs no model change.
      maxlength: 5000,
      // Not `required: true`: a tombstone (`deletedAt` set) legitimately has an
      // empty body. The real invariant is cross-field — "non-empty unless it has
      // been removed" — so it is expressed as a validator rather than `required`,
      // which cannot see `deletedAt`.
      validate: {
        validator: function (this: any, value: unknown): boolean {
          if (this.deletedAt !== undefined && this.deletedAt !== null) return true;
          return typeof value === 'string' && value.trim().length > 0;
        },
        message: 'A comment must have a body unless it has been removed.',
      },
    },
    day: { type: Number, min: 1, max: 999 },
    e2ee: { type: Boolean, default: false },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// Pagination + the POST cap check: one index serves both (`countDocuments` on
// the same shape). Newest-first ordering matches the cursor direction.
tripCommentSchema.index({ tripId: 1, createdAt: -1, _id: -1 });

// The day-badge aggregation (`dayCounts`) filters by day and skips tombstones.
tripCommentSchema.index({ tripId: 1, day: 1, deletedAt: 1 });

export default mongoose.model<ITripComment>('TripComment', tripCommentSchema);
