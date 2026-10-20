import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A group poll (Milestone 7, F13a) — the conversation's "let's settle this"
 * object, built the same way chat is: **the server stores nothing it can read**.
 *
 * Rules locked into this schema:
 * - **Sealed payload.** `body` is the poll itself (question + option labels) as
 *   ciphertext produced by the member's browser with the trip's conversation
 *   key — the same `<b64 iv>.<b64 ct>` shape chat messages use.
 * - **Votes are sealed too.** Each `votes[].choice` is the ciphertext of the
 *   chosen option *index*; the server can enforce one vote per member and count
 *   how many voted, but never which option won. Tallies are computed on the
 *   members' devices, which is the only place the key exists.
 * - **Membership is public.** `userId` rides beside each vote (and `createdBy`
 *   on the poll) so a client can say who voted; member ids are already visible
 *   to members through presence. The *choices* are not.
 * - **Never touches the Trip document** (the F6a §19.2 rule): creating, voting,
 *   closing or removing a poll must never bump `rev` or 409 an open edit.
 */
export interface IPollVote {
  /** The member who voted — needed for one-vote-per-member and "who voted". */
  userId: Types.ObjectId;
  /** Sealed option index (ciphertext; the server cannot read it). */
  choice: string;
  at: Date;
}

export interface ITripPoll extends Document {
  tripId: Types.ObjectId;
  /** Who started the poll (close/remove rights, display). */
  createdBy: Types.ObjectId;
  /** Sealed `{ q: string, o: string[] }` — question and option labels. */
  body: string;
  /** E2EE marker for the sealed payload (always true today; stored, not assumed). */
  e2ee: boolean;
  /** One entry per member; changing a vote replaces it. */
  votes: IPollVote[];
  /** Soft close: no more votes, but the card and the tally stay. */
  closedAt?: Date;
  /** Tombstone (remove) — soft, like comments/decisions. */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pollVoteSchema = new Schema<IPollVote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    choice: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const tripPollSchema = new Schema<ITripPoll>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // NOT `required`: removal tombstones the row and empties the payload, so
    // the document legitimately holds an empty string after a remove.
    body: { type: String, default: '' },
    e2ee: { type: Boolean, default: true },
    votes: { type: [pollVoteSchema], default: [] },
    closedAt: { type: Date, default: undefined },
    deletedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

// The list is "active polls of this trip, newest first" — the only read shape.
tripPollSchema.index({ tripId: 1, createdAt: -1 });

export default mongoose.model<ITripPoll>('TripPoll', tripPollSchema);
