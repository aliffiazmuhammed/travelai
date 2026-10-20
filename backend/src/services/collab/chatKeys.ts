import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import TripChatKey from '../../models/TripChatKey.js';
import User from '../../models/User.js';
import { isObjectId, userLabel } from './comments.js';

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

/** One envelope slot as the client sees it (F10e). */
export interface ChatKeySlot {
  /** The recipient device key this slot is addressed to. */
  pub: string;
  /** The wrapper's userId (`w`) — null when the blob cannot be parsed. */
  wrapper: string | null;
  /** The wrapper's device key (`wk`, v2 envelopes only) — null for v1. */
  wrapperPub: string | null;
}

/** What a client receives for `GET /:id/chat/keys`. */
export interface ChatKeyState {
  /** Current epoch (absent when the trip has no key yet). */
  epoch?: number;
  /**
   * The caller's FIRST envelope (base64) — legacy clients read exactly this.
   * Absent when they have none yet.
   */
  mine?: string;
  /**
   * F10d: EVERY envelope addressed to this caller (any of their devices), the
   * device-keyed ones first. A client tries them until one opens with the
   * private key of the device in front of the user.
   */
  mineAll?: string[];
  /** One entry per current member: their published public keys + envelope state. */
  members: Array<{
    userId: string;
    label: string;
    /** Newest published device key (compat/roster). */
    pubKey?: string;
    /** Every device key of this member (F10d). */
    pubKeys: string[];
    /** Which of those device keys already have an envelope slot. */
    envelopedPubKeys: string[];
    /**
     * F10e: those same slots with their wrapper metadata, so a keyholder can
     * tell a slot the recipient can open from one that must be re-wrapped.
     */
    slots: ChatKeySlot[];
    /** True when ANY slot exists (legacy member-id envelope or a device slot). */
    hasEnvelope: boolean;
  }>;
}

/* -------------------------------------------------------------------------- */
/*  Pure rules (unit-tested in chatKeys.test.ts)                               */
/* -------------------------------------------------------------------------- */

export const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** How many devices one account may keep a key slot for, newest first. */
export const CHAT_PUB_KEYS_MAX = 5;

/**
 * The per-account device-key list (F10d): newest first, de-duplicated, capped.
 * Pure so the cap rule is testable without a database — the auth service owns
 * only the persistence around it.
 */
export function mergePubKeyList(
  existing: unknown,
  incoming: string,
  max: number = CHAT_PUB_KEYS_MAX
): string[] {
  const key = String(incoming || '').trim();
  if (!key) return Array.isArray(existing) ? existing.map(String).slice(0, max) : [];
  const rest = (Array.isArray(existing) ? existing : [])
    .map(String)
    .filter((value) => value && value !== key);
  return [key, ...rest].slice(0, max);
}

/** Every device key of one member, newest first, primary pubKey included. */
export function memberDeviceKeys(row: {
  chatPubKey?: string | null;
  chatPubKeys?: string[] | null;
}): string[] {
  const keys: string[] = [];
  const primary = row?.chatPubKey ? String(row.chatPubKey) : '';
  if (primary) keys.push(primary);
  for (const key of row?.chatPubKeys || []) {
    const value = String(key || '');
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

export function isBase64(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= max && BASE64_RE.test(value);
}

/**
 * F10e: the envelope's *own* metadata, read without touching the key it carries.
 *
 * The blob is `base64(JSON { v, w, wk, iv, d })` and the wrapper fields are
 * written in the clear by the client (the recipient needs them to derive the
 * wrap key at all), so parsing them here is not a peek at the ciphertext — it is
 * reading the addressing. The server needs it for two things that only it can
 * do: telling a keyholder whether a filled slot is actually openable (so a dead
 * slot gets re-wrapped instead of locking that device out forever), and
 * rejecting a v2 envelope whose metadata is not internally consistent.
 *
 * Anything unreadable degrades to nulls — which the client reads as "cannot
 * prove this slot works", i.e. re-wrap it.
 */
export function envelopeSlotMeta(blob: unknown): {
  version: number | null;
  wrapper: string | null;
  wrapperPub: string | null;
} {
  const empty = { version: null, wrapper: null, wrapperPub: null };
  const value = typeof blob === 'string' ? blob.trim() : '';
  if (!value) return empty;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as {
      v?: unknown;
      w?: unknown;
      wk?: unknown;
    };
    if (!parsed || typeof parsed !== 'object') return empty;
    return {
      version: Number.isInteger(parsed.v) ? Number(parsed.v) : null,
      wrapper: typeof parsed.w === 'string' && parsed.w ? parsed.w : null,
      wrapperPub: typeof parsed.wk === 'string' && parsed.wk ? parsed.wk : null,
    };
  } catch {
    return empty;
  }
}

/**
 * F10e: a v2 envelope names the member who wrapped it AND the device key they
 * used — both are public facts the server already holds, so it can insist they
 * agree. Without this, a member could label a slot with a stranger's id and the
 * healing rule above would treat a dead slot as settled. v1 envelopes carry no
 * metadata to check (and stay accepted for compatibility).
 */
export function assertEnvelopeMetadata(
  entries: Record<string, unknown>,
  keysByUser: Record<string, string[]>
): void {
  for (const blob of Object.values(entries)) {
    const meta = envelopeSlotMeta(blob);
    if (meta.version !== 2) continue;
    if (!meta.wrapper || !meta.wrapperPub) {
      throw new AppError('A version 2 envelope must name the member and device key that wrapped it.', 400);
    }
    const published = keysByUser[meta.wrapper] || [];
    if (!published.includes(meta.wrapperPub)) {
      throw new AppError('That envelope names a wrapper key nobody published for that member.', 400);
    }
  }
}

/**
 * Envelope targeting: every envelope slot must belong to a **current member** —
 * either their device public key (F10d) or, for envelopes minted before
 * multi-device support, the member id itself. Values must be sane base64.
 * Duplicates are natural (last write wins); unknown targets are a client bug →
 * 400. Pure, so the tests iterate it directly.
 */
export function assertEnvelopeInputs(
  entries: Record<string, unknown>,
  memberIds: Array<string | { toString(): string }>,
  memberPubKeys: Array<string | null | undefined> = []
): void {
  const members = new Set(memberIds.map(String));
  const devices = new Set(memberPubKeys.filter(Boolean).map(String));
  for (const [target, wrapped] of Object.entries(entries)) {
    const isMemberId = isObjectId(target) && members.has(target);
    const isDeviceKey = devices.has(target);
    if (!isMemberId && !isDeviceKey) {
      throw new AppError(
        'Envelopes may only be addressed to current members or their published devices.',
        400
      );
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
  memberRows: Array<{
    _id: unknown;
    email?: string;
    name?: string;
    chatPubKey?: string | null;
    chatPubKeys?: string[] | null;
  }>,
  viewerId: string
): ChatKeyState {
  const envelopes = doc?.envelopes instanceof Map ? doc.envelopes : new Map<string, string>();
  const deviceKeys = new Map<string, string[]>();
  const state: ChatKeyState = {
    members: memberRows.map((row) => {
      const userId = String(row._id);
      const pubKeys = memberDeviceKeys(row);
      deviceKeys.set(userId, pubKeys);
      const envelopedPubKeys = pubKeys.filter((key) => envelopes.has(key));
      // F10e: the wrapper metadata of every slot, so the client can tell which
      // filled slots its recipient can really open (and re-wrap the rest).
      const slots: ChatKeySlot[] = envelopedPubKeys.map((pub) => {
        const meta = envelopeSlotMeta(envelopes.get(pub));
        return { pub, wrapper: meta.wrapper, wrapperPub: meta.wrapperPub };
      });
      const member: ChatKeyState['members'][number] = {
        userId,
        label: userLabel(row),
        pubKeys,
        envelopedPubKeys,
        slots,
        hasEnvelope: envelopedPubKeys.length > 0 || envelopes.has(userId),
      };
      if (row.chatPubKey) member.pubKey = String(row.chatPubKey);
      return member;
    }),
  };
  if (doc) {
    state.epoch = doc.epoch;
    // Every envelope addressed to this caller — any device they published from,
    // plus the legacy member-id slot minted before multi-device support.
    const own: string[] = [];
    const legacy = envelopes.get(String(viewerId));
    if (legacy) own.push(legacy);
    for (const key of deviceKeys.get(String(viewerId)) || []) {
      const wrapped = envelopes.get(key);
      if (wrapped && !own.includes(wrapped)) own.push(wrapped);
    }
    if (own.length) {
      state.mineAll = own;
      state.mine = own[0];
    }
  }
  return state;
}

/* -------------------------------------------------------------------------- */
/*  Data access (thin glue over the rules above)                               */
/* -------------------------------------------------------------------------- */

async function loadCurrentDoc(tripId: string): Promise<any> {
  return TripChatKey.findOne({ tripId: new Types.ObjectId(tripId) }).sort({ epoch: -1 });
}

/** userId → the published device keys of that member (the envelope-slot allowlist). */
async function loadMemberKeyMap(memberIds: string[]): Promise<Record<string, string[]>> {
  if (!memberIds.length) return {};
  const users = await User.find({ _id: { $in: memberIds.map((id) => new Types.ObjectId(id)) } })
    .select('chatPubKey chatPubKeys')
    .lean();
  const map: Record<string, string[]> = {};
  for (const row of users as any[]) {
    const keys = memberDeviceKeys(row);
    if (keys.length) map[String(row._id)] = keys;
  }
  return map;
}

/**
 * The shared slot checks for both key-writing routes: every target must be a
 * current member or a published device of one, every payload must be sane
 * base64, and (F10e) a v2 envelope must name a wrapper whose device key is
 * really published for that member.
 */
async function assertSlots(
  entries: Record<string, string>,
  memberIds: string[]
): Promise<void> {
  const keysByUser = await loadMemberKeyMap(memberIds);
  assertEnvelopeInputs(entries, memberIds, Object.values(keysByUser).flat());
  assertEnvelopeMetadata(entries, keysByUser);
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
          .select('_id email name chatPubKey chatPubKeys')
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

  await assertSlots(input.envelopes, memberIds);

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

  await assertSlots(entries, memberIds);

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
