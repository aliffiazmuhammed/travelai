import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * The trip's end-to-end chat key (Milestone 7, F10) — snapshot semantics.
 *
 * The SPA generates the **conversation key** (AES-256-GCM) entirely client-side
 * and never sends it anywhere in the clear. What this collection receives is
 * the key *enveloped* to each member's public key (ECDH P-256 → HKDF → AES-GCM
 * wrap). The server therefore stores ciphertexts about ciphertexts: it can
 * route and store chat, but cannot read a single message.
 *
 * Invariants the rest of the system depends on:
 * - One document per `(tripId, epoch)`. Epoch 1 is the bootstrap; any higher
 *   epoch is a client-initiated rotation (e.g. after a member leaves). The
 *   *current* epoch is simply the highest one that exists — monotonically
 *   increasing and race-safe via the unique index.
 * - `envelopes` maps `userId → wrapped conversation key` (base64). Envelopes
 *   are self-healing: any member who already holds the key may add envelopes
 *   for members that miss one (that is how a fresh invitee gets **full
 *   history** per the F10 product decision).
 * - Like `TripReadState`/`TripComment`, writes here **never touch the `Trip`
 *   document** — no `rev` bump, no `trip:updated` frame. Key wiring is live
 *   chat plumbing, not trip content.
 * - The server cannot verify envelope contents (it cannot decrypt them); it
 *   validates *shape* (member ids, base64, size caps) and trusts clients the
 *   same way it trusts them for anything else bound by TLS.
 */

export interface ITripChatKey extends Document {
  tripId: Types.ObjectId;
  /** 1 = bootstrap; higher = rotation. Monotonic per trip. */
  epoch: number;
  /** userId (hex string) → base64 envelope (the conversation key wrapped for that member). */
  envelopes: Map<string, string>;
  /** Which member minted this epoch (audit only). */
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const tripChatKeySchema = new Schema<ITripChatKey>(
  {
    tripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true,
    },
    epoch: {
      type: Number,
      required: true,
      min: 1,
    },
    envelopes: {
      type: Map,
      of: String,
      default: {},
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// One key version per (trip, epoch) — the bootstrap/rotation race guard.
tripChatKeySchema.index({ tripId: 1, epoch: 1 }, { unique: true });
// "Latest epoch for the trip" is the only hot read.
tripChatKeySchema.index({ tripId: 1, epoch: -1 });

export default mongoose.model<ITripChatKey>('TripChatKey', tripChatKeySchema);
