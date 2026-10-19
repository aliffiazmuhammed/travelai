import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import TripChatKey from '../../models/TripChatKey.js';
import User from '../../models/User.js';
import { isObjectId, emailLabel } from './comments.js';

/**
 * End-to-end chat keys (Milestone 7, F10) — the blind-carrier key service.
 *
 * The conversation key itself is generated client-side and never sent here.
 * What this service stores and hands out:
 * - the per-trip **epoch** (1 = bootstrap; higher = a client-initiated rotation),
 * - `envelopes`: the conversation key wrapped pairwise to each member's public
 *   key (ECDH P-256 → HKDF-SHA-256 → AES-GCM wrap).
 *
 * Split like every collab service: the pure helpers carry the rules worth
 * testing (base64 shape, envelope targeting, epoch transitions, projection)
 * and are exercised by `chatKeys.test.ts` without a database; the DB functions
 * below are thin glue covered by the live `smoke-f10.mts` run.
 *
 * Product decisions wired in here (confirmed with the user):
 * - **Full history for new members**: any member holding the key may add an
 *   envelope for any member who lacks one — the "self-healing" distribution —
 *   so an accepted invitee reads the entire chat the moment some other member
 *   opens theirs once.
 * - The server enforces membership and shape but cannot verify content; that
 *   is the definition of end-to-end.
 */

/** What a client receives for `GET /:id/chat/keys`. */
export interface ChatKeyState {
  /** Current epoch (absent when the trip has no key yet). */
  epoch?: number;
  /** This caller's envelope, base64 — absent when they have none yet. */
  mine?: string;
  /** One entry per current member: their published public key + envelope state. */
  members: Array<{
    userId: string;
    label: string;
    pubKey?: string;
    hasEnvelope: boolean;
  }>;
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in chatKeys.test.ts)                               */
/* -------------------------------------------------------------------------- */

export const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function isBase64(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= max && BASE64_RE.test(value);
}

/**
 * Envelope targeting: every recipient must be a **current member**, ids must be
 * well-formed ObjectIds, and the values must be sane base64. Duplicates are
 * natural (last write wins); unknown recipients are a client bug → 400 shape,
 * but since the check is pure the tests iterate it directly.
 */
export function assertEnvelopeInputs(
  entries: Record<string, unknown>,
  memberIds: Array<string | { toString(): string }>
): void {
  const members = new Set(memberIds.map(String));
  for (const [userId, wrapped] of Object.entries(entries)) {
    if (!isObjectId(userId)) {
      throw new AppError('Envelope targets must be user ids.', 400);
    }
    if (!members.has(userId)) {
      throw new AppError('Envelopes may only be addressed to current members.', 400);
    }
    if (!isBase64(wrapped, 1024)) {
      throw new AppError('Envelope payloads must be base64 up to 1024 characters.', 400);
    }
  }
  if (Object.keys(entries).length === 0) {
    throw new AppError('Send at least one envelope.', 400);
  }
}

/**
 * Epoch transitions for `PUT /:id/chat/keys`:
 * - no doc yet → any epoch ≥ 1 is a valid bootstrap;
 * - doc exists → only a **higher** epoch is accepted (a rotation);
 * - the same or an older epoch is a 409 that carries the current state so the
 *   racing client can re-fetch, unwrap and self-heal via the envelopes route.
 */
export function assertEpochTransition(
  requestedEpoch: number,
  currentEpoch: number | null
): void {
  if (!Number.isInteger(requestedEpoch) || requestedEpoch < 1) {
    throw new AppError('Epoch must be a positive integer.', 400);
  }
  if (currentEpoch !== null && requestedEpoch <= currentEpoch) {
    throw new AppError(
      `This trip already has chat key epoch ${currentEpoch}. Fetch the current key and add envelopes instead.`,
      409
    );
  }
}

/** Shapes the GET response. Public keys are published server-side by design. */
export function projectKeyState(
  doc: { epoch: number; envelopes: Map<string, string> } | null,
  memberRows: Array<{ _id: unknown; email?: string; chatPubKey?: string | null }>,
  viewerId: string
): ChatKeyState {
  const envelopes = doc?.envelopes instanceof Map ? doc.envelopes : new Map<string, string>();
  const state: ChatKeyState = {
    members: memberRows.map((row) => {
      const userId = String(row._id);
      const member: ChatKeyState['members'][number] = {
        userId,
        label: emailLabel(row.email),
        hasEnvelope: envelopes.has(userId),
      };
      if (row.chatPubKey) member.pubKey = row.chatPubKey;
      return member;
    }),
  };
  if (doc) {
    state.epoch = doc.epoch;
    const mine = envelopes.get(String(viewerId));
    if (mine) state.mine = mine;
  }
  return state;
}

/* -------------------------------------------------------------------------- */
/*  Data access (thin glue over the rules above)                               */
/* -------------------------------------------------------------------------- */

async function loadCurrentDoc(tripId: string): Promise<any> {
  return TripChatKey.findOne({ tripId: new Types.ObjectId(tripId) }).sort({ epoch: -1 });
}

/**
 * The full key picture for one member: current epoch (+ the caller's envelope)
 * and per-member public keys / envelope coverage. Members come from the loaded
 * trip document — the route guard already vetted the caller against it.
 */
export async function getTripChatKeyState(
  trip: any,
  viewerId: string
): Promise<ChatKeyState> {
  const tripId = String((trip as any)._id);
  const memberIds = ((trip as any).members || []).map((m: any) => String(m.userId));

  const [doc, users] = await Promise.all([
    loadCurrentDoc(tripId),
    memberIds.length
      ? User.find({ _id: { $in: memberIds.map((id: string) => new Types.ObjectId(id)) } })
          .select('_id email chatPubKey')
          .lean()
      : Promise.resolve([]),
  ]);

  return projectKeyState(doc, users as any, viewerId);
}

/**
 * Bootstrap or rotation (`PUT /:id/chat/keys`). Creates the epoch document;
 * the unique `(tripId, epoch)` index arbitrates the bootstrap race — a loser
 * gets the same 409 with a pointer to re-fetch, unwrap and envelope onward.
 * Caller identity is audit-only: any current member may wire keys (per the F10
 * self-healing design); the server merely records who minted each epoch.
 */
export async function setTripChatKeys(
  trip: any,
  callerId: string,
  input: { epoch: number; envelopes: Record<string, string> }
): Promise<ChatKeyState> {
  const tripId = String((trip as any)._id);
  const memberIds = ((trip as any).members || []).map((m: any) => String(m.userId));

  assertEnvelopeInputs(input.envelopes, memberIds);

  const current = await loadCurrentDoc(tripId);
  assertEpochTransition(input.epoch, current ? current.epoch : null);

  try {
    await TripChatKey.create({
      tripId: new Types.ObjectId(tripId),
      epoch: input.epoch,
      envelopes: new Map(Object.entries(input.envelopes)),
      createdBy: new Types.ObjectId(callerId),
    });
  } catch (error: any) {
    if (error && (error.code === 11000 || error.name === 'MongoServerError' && error.code === 11000)) {
      throw new AppError(
        'Chat keys were created by someone else a moment ago. Fetch the current key and add envelopes instead.',
        409
      );
    }
    throw error;
  }

  return getTripChatKeyState(trip, callerId);
}

/**
 * Self-healing distribution (`POST /:id/chat/envelopes`): merge the caller's
 * envelopes into the CURRENT epoch so missing/new members can decrypt. 404s
 * when the trip has no key at all — `PUT` is how a trip gets its first one;
 * 409s on a stale race with a rotation (the doc changed under us).
 */
export async function addTripChatEnvelopes(
  trip: any,
  callerId: string,
  entries: Record<string, string>
): Promise<ChatKeyState> {
  const tripId = String((trip as any)._id);
  const memberIds = ((trip as any).members || []).map((m: any) => String(m.userId));

  assertEnvelopeInputs(entries, memberIds);

  const doc = await loadCurrentDoc(tripId);
  if (!doc) {
    throw new AppError('This trip has no chat key yet — bootstrap it first.', 404);
  }

  for (const [userId, wrapped] of Object.entries(entries)) {
    doc.envelopes.set(userId, wrapped);
  }
  await doc.save();

  return getTripChatKeyState(trip, callerId);
}
