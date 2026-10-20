/**
 * Trip presence + change notifications (Milestone 6 §3.7, sprint E4b).
 *
 * THIS IS SINGLE-INSTANCE INFRASTRUCTURE, BY DESIGN AND DOCUMENTED: the map
 * and the bus live in this process. With one server instance (the current
 * Render deployment) it is correct; behind multiple instances it degrades to
 * "no live presence" while `rev` conflicts keep the data correct. Redis
 * pub/sub is the upgrade path — deliberately not taken now (§8).
 *
 * Presence is **decoration, never authorization**: the SSE channel and the
 * heartbeat route are guarded by the same `requireTripRole` choke point as
 * everything else, but nothing in the access layer reads presence.
 */

import { env } from '../../config/env.js';

export interface PresenceEntry {
  userId: string;
  /** Best-effort display label (email local part; no User.name exists yet). */
  label: string;
  role: import('./access.js').TripRole;
  lastSeen: number;
}

type Listener = (tripId: string, event: TripEvent) => void;

export type TripEvent =
  | { type: 'trip:updated'; tripId: string }
  | { type: 'presence'; tripId: string; users: Array<Omit<PresenceEntry, 'lastSeen'>> }
  /**
   * Comment frames (Milestone 6 §19.4, F6a). `comment` is an already-projected
   * `CommentRow`; `isYou` on a fan-out frame is the *author's* view only — the
   * SPA recomputes it from the row it holds, since one frame reaches every
   * member (see the note in services/collab/comments.ts).
   */
  | { type: 'comment:new'; tripId: string; comment: unknown }
  | { type: 'comment:update'; tripId: string; comment: unknown }
  /**
   * Typing signal (Milestone 7, F8a). STATELESS by design: nothing is stored
   * server-side — the writer pings, everyone's client shows the indicator for
   * ~5s after the last frame and expires it itself. Same rule as presence:
   * decoration, never authorization, never durable.
   */
  | { type: 'typing'; tripId: string; userId: string; label: string }
  /**
   * Decision frames (Milestone 7, F9). `decision` is an already-projected
   * `DecisionRow` (a snapshot of a comment promoted to "what we agreed").
   * Like comments: never touches `Trip`, so no 409s ride these frames.
   */
  | { type: 'decision:new'; tripId: string; decision: unknown }
  | { type: 'decision:update'; tripId: string; decision: unknown }
  /**
   * Poll frames (Milestone 7, F13a). `poll` is an already-projected `PollRow`:
   * the sealed payload, the sealed votes and who cast them — never a plaintext
   * option or choice, because the server never has either.
   */
  | { type: 'poll:new'; tripId: string; poll: unknown }
  | { type: 'poll:update'; tripId: string; poll: unknown };

const presenceByTrip = new Map<string, Map<string, PresenceEntry>>();
const listeners = new Set<Listener>();

/** Globally disabled live tier → the controller returns 404 before getting here. */
export const isSseEnabled = (): boolean => env.ENABLE_TRIP_SSE;

/** Records a heartbeat; returns whether this user had gone quiet (for logs). */
export function heartbeat(tripId: string, user: Omit<PresenceEntry, 'lastSeen'>): void {
  pruneTrip(tripId);
  let members = presenceByTrip.get(tripId);
  if (!members) {
    members = new Map();
    presenceByTrip.set(tripId, members);
  }
  members.set(user.userId, { ...user, lastSeen: Date.now() });
}

/** Removes one user's presence (the client's SSE stream closed). */
export function removePresence(tripId: string, userId: string): void {
  const members = presenceByTrip.get(tripId);
  if (!members) return;
  members.delete(userId);
  if (members.size === 0) {
    presenceByTrip.delete(tripId);
  } else {
    broadcastPresence(tripId);
  }
}

/** Live (non-expired) participants of a trip, newest heartbeat first. */
export function listPresence(tripId: string): Array<Omit<PresenceEntry, 'lastSeen'>> {
  pruneTrip(tripId);
  const members = presenceByTrip.get(tripId);
  if (!members) return [];
  return [...members.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map(({ lastSeen, ...user }) => ({ ...user }));
}

/** TTL sweep for one trip — expired heartbeats are simply gone. */
function pruneTrip(tripId: string): void {
  const members = presenceByTrip.get(tripId);
  if (!members) return;
  const cutoff = Date.now() - env.PRESENCE_TTL_MS;
  for (const [userId, entry] of members) {
    if (entry.lastSeen < cutoff) {
      members.delete(userId);
    }
  }
  if (members.size === 0) {
    presenceByTrip.delete(tripId);
  }
}

/** Current live roster and whether it changed since the last broadcast. */
let lastBroadcast: Map<string, string> = new Map();

/**
 * Fan-out presence to every open SSE stream for the trip. Cheap state-diff so
 * heartbeats from one user do not spam streams with identical rosters.
 */
export function broadcastPresence(tripId: string): void {
  const roster = listPresence(tripId);
  const signature = roster
    .map((entry) => `${entry.userId}:${entry.role}`)
    .sort()
    .join('|');
  if (lastBroadcast.get(tripId) === signature) return;
  lastBroadcast.set(tripId, signature);
  emit(tripId, { type: 'presence', tripId, users: roster });
}

/** Change notification from any Trip write payload that carries an id. */
export function emitTripUpdated(tripId: string): void {
  if (!tripId) return;
  emit(tripId, { type: 'trip:updated', tripId });
}

/**
 * Fan-out for a created/edited/removed comment (Milestone 6 §19.4, F6a).
 *
 * Comments live in their own collection and never bump `Trip.rev`, so this
 * frame — not `trip:updated` — is what keeps collaborators' streams live. It is
 * a pure broadcast: no `rev` participated, so nothing here can trigger a 409.
 */
export function emitCommentEvent(
  tripId: string,
  frame: { type: 'comment:new' | 'comment:update'; comment: unknown }
): void {
  if (!tripId) return;
  emit(tripId, { ...frame, tripId } as TripEvent);
}

/**
 * Fan-out for a "I'm composing" ping (Milestone 7, F8a). Deliberately
 * stateless: no map, no TTL sweep, no roster — the client itself expires the
 * indicator ~5s after the last received frame, so a dropped ping costs nothing
 * and a spammy client is bounded by its route limiter alone.
 */
export function emitTypingFrame(
  tripId: string,
  user: { userId: string; label: string }
): void {
  if (!tripId) return;
  emit(tripId, { type: 'typing', tripId, userId: user.userId, label: user.label });
}

/**
 * Fan-out for a comment promoted into (or retired from) a decision (F9).
 * Same contract as `emitCommentEvent` — a pure broadcast beside `Trip`.
 */
export function emitDecisionEvent(
  tripId: string,
  frame: { type: 'decision:new' | 'decision:update'; decision: unknown }
): void {
  if (!tripId) return;
  emit(tripId, { ...frame, tripId } as TripEvent);
}

/**
 * Fan-out for a created poll or a vote/close/remove on it (F13a). Same
 * contract as `emitDecisionEvent` — a pure broadcast beside `Trip`.
 */
export function emitPollEvent(
  tripId: string,
  frame: { type: 'poll:new' | 'poll:update'; poll: unknown }
): void {
  if (!tripId) return;
  emit(tripId, { ...frame, tripId } as TripEvent);
}

function emit(tripId: string, event: TripEvent): void {
  for (const listener of listeners) {
    try {
      listener(tripId, event);
    } catch {
      // A broken SSE stream must never take down the write path.
    }
  }
}

/** Subscribes a stream (one per open SSE connection). Returns the unsubscriber. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: clears all state between suites. */
export function resetForTests(): void {
  presenceByTrip.clear();
  listeners.clear();
  lastBroadcast = new Map();
}
