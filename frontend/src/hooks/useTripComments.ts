import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';
import type { TripComment, TripDecision, TripPoll } from '@/types';
import { appFeatures } from '@/hooks/useTripEvents';
import type { CommentFrame, DecisionFrame, PollFrame, TypingFrame } from '@/hooks/useTripEvents';

/**
 * Trip comments state (Milestone 6 §19.7 / §20, sprint F6b).
 *
 * The state lives in `ItineraryDisplay` (which owns the one EventSource via
 * `useTripEvents`) and is handed to `CommentsTab` as props — so a comment that
 * arrives while the user is on another tab still merges here, and only ONE SSE
 * channel exists per open trip. Rules encoded below:
 *
 * - **The stream is newest-first**, newest at the top — matching the server's
 *   cursor direction; "Load earlier" appends older pages to the bottom.
 * - **Dedupe by `_id` everywhere** (§19.4): a frame for a row the client
 *   already holds is a patch, never a duplicate — this also makes the author's
 *   own optimistic echo idempotent.
 * - **`frame.isYou` is never trusted** (§20.2): frames carry the *author's*
 *   view. Rows only get marked `isYou` when the caller's own HTTP response
 *   produced them.
 * - **dayCounts stay server-truth**: the initial load reads the aggregate and
 *   the composer/removal nudge it locally in between — no client-side
 *   re-aggregation over rows the client may not have loaded.
 */

export interface TripCommentsState {
  comments: TripComment[];
  dayCounts: Record<string, number>;
  /** `null` when the older end of the stream is reached. */
  nextCursor: string | null;
  /** 'idle' = never opened, 'loading' = first page in flight, then ready/error. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadingEarlier: boolean;
  submitting: boolean;
  /** Unread count (Milestone 7 F8b): server-seeded, frame-bumped, flush-on-open. */
  unread: number;
  /** Other members currently "typing" (F8b), freshest first, ≤3 entries. */
  typing: TypingEntry[];
  /** Active decisions (F9), newest first — the pinned "what we agreed" cards. */
  decisions: TripDecision[];
  /**
   * Active polls (F13a), newest first. Payloads and votes are still SEALED
   * here — the chat surface decodes them with the trip key.
   */
  polls: TripPoll[];
}

export interface TypingEntry {
  userId: string;
  label: string;
  /** Injection instant; consumers expire entries older than TYPING_TTL_MS. */
  at: number;
}

export interface UseTripComments {
  state: TripCommentsState;
  /** First-page fetch — called when the tab is first opened. Idempotent. */
  ensureLoaded: () => void;
  loadEarlier: () => Promise<void>;
  /** Resolves the created row (comment type) on 201 — the caller uses it to
   *  pin just-written plaintext for the crypto layer. */
  addComment: (
    body: string,
    day?: number,
    e2ee?: boolean,
    plaintextHint?: string,
    bot?: boolean
  ) => Promise<TripComment | null>;
  /** Author-only edit; `e2ee` marks the body as freshly encrypted (F10). */
  editComment: (commentId: string, body: string, e2ee?: boolean) => Promise<boolean>;
  removeComment: (comment: TripComment) => Promise<void>;
  /** Live ingest — wired to `useTripEvents.onCommentEvent`. */
  ingest: (frame: CommentFrame) => void;
  /**
   * Marks a chat surface open/closed (F8b). Opening flushes the read marker
   * (`POST /comments/read`) and zeroes the badge; while closed, unknown
   * foreign rows arriving by frame tick the badge instead.
   */
  setOpen: (open: boolean) => void;
  /** Throttled "I'm composing" ping — call from the composer keystrokes. */
  notifyTyping: () => void;
  /** Live ingest for typing pings — wired to `useTripEvents.onTypingEvent`. */
  ingestTyping: (frame: TypingFrame) => void;
  /** Labels on screen right now, derived from `state.typing`. */
  typingLabels: string[];
  /**
   * Promotes a comment into a decision (F9). Resolves the created snapshot
   * row; throws with the server message on failure (403 non-author, 409
   * duplicate/empty/tombstoned). The caller still owns the toast.
   */
  promoteComment: (commentId: string) => Promise<TripDecision>;
  /** Unmarks a decision (promoter-or-owner; the server soft-tombstones). */
  removeDecision: (decisionId: string) => Promise<void>;
  /** Live ingest for decision frames — wired to `useTripEvents.onDecisionEvent`. */
  ingestDecision: (frame: DecisionFrame) => void;
  /** Comment ids that already have an active decision (drives row buttons). */
  decidedCommentIds: Set<string>;
  /**
   * Starts a poll (F13a) from an ALREADY-SEALED payload. Sealing happens in the
   * chat surface, which is the only place that holds the trip key.
   */
  createPoll: (sealedBody: string) => Promise<TripPoll>;
  /** Casts or changes this member's vote (sealed option index). */
  votePoll: (pollId: string, sealedChoice: string) => Promise<TripPoll>;
  /** Stops voting (creator or owner); the tally stays. */
  closePoll: (pollId: string) => Promise<void>;
  /** Removes a poll (creator or owner; soft-tombstoned server-side). */
  removePoll: (pollId: string) => Promise<void>;
  /** Live ingest for poll frames — wired to `useTripEvents.onPollEvent`. */
  ingestPoll: (frame: PollFrame) => void;
}

const TYPING_TTL_MS = 5000; // mirrors the F8a contract (client-side expiry)
const TYPING_PING_INTERVAL_MS = 2500; // client throttle; well under the 400/15min cap
/** M7.3 fallback cadence when the SSE tier is disabled or unreachable. */
const COLLAB_POLL_MS = 20000;

function newestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}

/** Timestamp of the freshest vote on a poll (a vote can change without growing the list). */
function latestVoteAt(poll: TripPoll): number {
  return Math.max(0, ...(poll.votes || []).map((vote) => Date.parse(vote.at) || 0));
}

/**
 * Merges a polled first page into the newest-first comment list.
 *
 * Polling is a fallback, not a source of truth: a response that started before
 * this client edited/deleted a row must not undo the newer local change. New
 * rows are deduped by `_id`; tombstones patch an existing slot but never
 * introduce one.
 */
function mergePolledComments(list: TripComment[], fetched: TripComment[]): TripComment[] {
  const byId = new Map(fetched.map((row) => [row._id, row]));
  const patched = list.map((local) => {
    const remote = byId.get(local._id);
    if (!remote) return local;
    const localStamp = Date.parse(local.editedAt || local.createdAt) || 0;
    const remoteStamp = Date.parse(remote.editedAt || remote.createdAt) || 0;
    if (!remote.deletedAt && remoteStamp < localStamp) return local;
    return { ...remote, isYou: local.isYou || remote.isYou };
  });
  const known = new Set(patched.map((row) => row._id));
  const fresh = fetched.filter((row) => !known.has(row._id) && !row.deletedAt);
  if (fresh.length === 0) return patched;
  return [...fresh, ...patched].sort(newestFirst);
}

/** Keeps decisions created while a poll request was in flight; drops remote removals. */
function mergePolledDecisions(
  list: TripDecision[],
  fetched: TripDecision[],
  startedAt: number
): TripDecision[] {
  const fetchedIds = new Set(fetched.map((row) => row._id));
  const localById = new Map(list.map((row) => [row._id, row]));
  const merged = fetched
    .filter((row) => !row.deletedAt)
    .map((row) => {
      const local = localById.get(row._id);
      return local?.isYou ? { ...row, isYou: true } : row;
    });
  const localOnly = list.filter(
    (row) =>
      !fetchedIds.has(row._id) &&
      !row.deletedAt &&
      (Date.parse(row.createdAt) || 0) >= startedAt
  );
  return [...localOnly, ...merged].sort(newestFirst);
}

/** Same race guard for polls, plus the vote/close freshness checks. */
function mergePolledPolls(
  list: TripPoll[],
  fetched: TripPoll[],
  startedAt: number
): TripPoll[] {
  const fetchedIds = new Set(fetched.map((row) => row._id));
  const localById = new Map(list.map((row) => [row._id, row]));
  const merged = fetched
    .filter((row) => !row.deletedAt)
    .map((row) => {
      const local = localById.get(row._id);
      if (!local) return row;
      const isYou = row.isYou || local.isYou;
      if (latestVoteAt(local) > latestVoteAt(row)) {
        return { ...row, isYou, votes: local.votes, closedAt: local.closedAt ?? row.closedAt };
      }
      if (local.closedAt && !row.closedAt) return { ...row, isYou, closedAt: local.closedAt };
      return isYou ? { ...row, isYou: true } : row;
    });
  const localOnly = list.filter(
    (row) =>
      !fetchedIds.has(row._id) &&
      !row.deletedAt &&
      (Date.parse(row.createdAt) || 0) >= startedAt
  );
  return [...localOnly, ...merged].sort(newestFirst);
}

/** Merges one row into the newest-first list by `_id`: patch in place, else prepend. */
function mergeRow(list: TripComment[], row: TripComment, markMine: boolean): TripComment[] {
  const normalized: TripComment = markMine ? { ...row, isYou: true } : row;
  const index = list.findIndex((existing) => existing._id === normalized._id);
  if (index === -1) return [normalized, ...list];
  const next = [...list];
  next[index] = normalized;
  return next;
}

/**
 * Merges one decision row (F9), dedupe by `_id`. A tombstoned row leaves the
 * list entirely — unmarking means the card is closed history, and the client
 * mirrors the server's active-rows-only `GET /decisions` view.
 */
function mergeDecision(list: TripDecision[], row: TripDecision, markMine: boolean): TripDecision[] {
  const normalized: TripDecision = markMine ? { ...row, isYou: true } : row;
  const rest = list.filter((existing) => existing._id !== normalized._id);
  if (normalized.deletedAt) return rest;
  return [normalized, ...rest];
}

export function useTripComments(
  tripId?: string,
  currentUserId?: string
): UseTripComments {
  const [state, setState] = useState<TripCommentsState>({
    comments: [],
    dayCounts: {},
    nextCursor: null,
    status: 'idle',
    loadingEarlier: false,
    submitting: false,
    unread: 0,
    typing: [],
    decisions: [],
    polls: [],
  });

  // Ref mirrors so event handlers never read state inside a setState updater
  // (React may invoke updaters more than once — side effects belong in refs).
  const bootstrapped = useRef(false); // guards a double first fetch
  const cursorRef = useRef<string | null>(null);
  const loadingEarlierRef = useRef(false);
  // F8b mirrors: is a chat surface open? which rows did THIS client author?
  const openRef = useRef(false);
  const mineRef = useRef<Set<string>>(new Set());
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  /** Applies one server-shaped comment and marks it ours only when ours. */
  const applyRow = useCallback((row: TripComment, mine: boolean) => {
    setState((prev) => ({ ...prev, comments: mergeRow(prev.comments, row, mine) }));
  }, []);

  /** Bumps (or rolls back) one day-chip count locally between server reads. */
  const bumpDayCount = useCallback((day: number | undefined, delta: number) => {
    if (day === undefined) return;
    setState((prev) => {
      const key = String(day);
      const next = Math.max(0, (prev.dayCounts[key] || 0) + delta);
      return { ...prev, dayCounts: { ...prev.dayCounts, [key]: next } };
    });
  }, []);

  // The polling effect can outlive a trip switch by one request. Refuse to
  // apply a response captured for the previous trip.
  const activeTripRef = useRef(tripId);
  activeTripRef.current = tripId;

  /**
   * M7.3 — the no-SSE safety net. One quiet round-trip refreshes the three
   * collaboration surfaces that otherwise rely on live frames. AllSettled keeps
   * a single failing endpoint (say polls) from blocking comments, and every
   * merge is race-aware: a response that started before a local edit/vote must
   * not undo that newer local truth.
   */
  const refreshCollab = useCallback(async () => {
    if (!tripId) return;
    const startedAt = Date.now();
    const [commentsResult, decisionsResult, pollsResult, readResult] = await Promise.allSettled([
      api.getTripComments(tripId, { limit: 50 }),
      api.getTripDecisions(tripId),
      api.getTripPolls(tripId),
      api.getTripReadState(tripId),
    ]);
    if (activeTripRef.current !== tripId) return;

    setState((prev) => {
      let next = prev;

      if (commentsResult.status === 'fulfilled') {
        const result = commentsResult.value;
        // A first poll can warm the cache before the chat drawer is opened; if
        // it beats `ensureLoaded`, record the cursor so "Load earlier" still
        // works.
        if (!bootstrapped.current) {
          bootstrapped.current = true;
          cursorRef.current = result.nextCursor ?? null;
        }
        next = {
          ...next,
          comments: mergePolledComments(next.comments, result.comments || []),
          dayCounts: result.dayCounts || next.dayCounts,
          status: 'ready',
        };
      }

      if (decisionsResult.status === 'fulfilled') {
        next = {
          ...next,
          decisions: mergePolledDecisions(
            next.decisions,
            decisionsResult.value.decisions || [],
            startedAt
          ),
        };
      }

      if (pollsResult.status === 'fulfilled') {
        next = {
          ...next,
          polls: mergePolledPolls(next.polls, pollsResult.value.polls || [], startedAt),
        };
      }

      if (readResult.status === 'fulfilled') {
        next = {
          ...next,
          unread: openRef.current ? 0 : readResult.value.unread || 0,
        };
      }

      return next;
    });
  }, [tripId]);

  /**
   * When the live tier is off (the local default) comments, polls and decisions
   * would otherwise only change on a manual reload. Poll while visible; focus
   * and tab-return trigger an immediate catch-up. A live SSE tier takes over
   * completely, so there is no duplicate traffic.
   */
  useEffect(() => {
    if (!tripId) return;
    let disposed = false;
    let timer: number | null = null;
    let inFlight = false;

    const tick = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        await refreshCollab();
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    void appFeatures().then((features) => {
      if (disposed || features.sse) return;
      timer = window.setInterval(() => void tick(), COLLAB_POLL_MS);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
    });

    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [tripId, refreshCollab]);

  /* ------------------------------------------------------------------ */
  /*  Unread badge (Milestone 7, F8b)                                    */
  /* ------------------------------------------------------------------ */

  // Seed from server truth once per trip open. The first GET also stamps the
  // marker (the backend's baseline rule), so a brand-new viewer starts at 0.
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    void (async () => {
      try {
        const result = await api.getTripReadState(tripId);
        if (alive) setState((prev) => ({ ...prev, unread: result.unread || 0 }));
      } catch {
        /* no badge is better than a wrong badge — leave the seed at 0 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);

  /* ------------------------------------------------------------------ */
  /*  Decisions (Milestone 7, F9)                                        */
  /* ------------------------------------------------------------------ */

  // Seed the pinned strip server-side per trip open (the list is bounded by
  // DECISION_MAX_PER_TRIP, so a full fetch is cheap by construction).
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    void (async () => {
      try {
        const result = await api.getTripDecisions(tripId);
        if (alive) setState((prev) => ({ ...prev, decisions: result.decisions || [] }));
      } catch (err: any) {
        console.error('decisions: initial load failed', err?.message || err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);

  // Latest decisions without re-creating the rollback closures below.
  const decisionsRef = useRef<TripDecision[]>([]);
  decisionsRef.current = state.decisions;

  /** Applies one server-shaped decision; `isYou` trusted only from our calls. */
  const applyDecisionRow = useCallback((row: TripDecision, mine: boolean) => {
    setState((prev) => ({ ...prev, decisions: mergeDecision(prev.decisions, row, mine) }));
  }, []);

  /** Promotes a comment; the created snapshot row lands in the strip. */
  const promoteComment = useCallback(
    async (commentId: string): Promise<TripDecision> => {
      if (!tripId) throw new Error('No trip is open.');
      const result = await api.markCommentDecision(tripId, commentId);
      applyDecisionRow(result.decision, true);
      return result.decision;
    },
    [tripId, applyDecisionRow]
  );

  /** Optimistic unmark: the card leaves the strip now; 404/403 rolls it back. */
  const removeDecision = useCallback(
    async (decisionId: string): Promise<void> => {
      if (!tripId) return;
      const snapshot = decisionsRef.current.find((row) => row._id === decisionId);
      setState((prev) => ({
        ...prev,
        decisions: prev.decisions.filter((row) => row._id !== decisionId),
      }));
      try {
        await api.removeTripDecision(tripId, decisionId);
      } catch (err) {
        if (snapshot) applyDecisionRow(snapshot, snapshot.isYou);
        throw err;
      }
    },
    [tripId, applyDecisionRow]
  );

  /** Live ingest for decision frames — frames are patches, never `isYou`. */
  const ingestDecision = useCallback(
    (frame: DecisionFrame) => {
      if (!frame?.decision?._id) return;
      applyDecisionRow(frame.decision, false);
    },
    [applyDecisionRow]
  );

  /* ------------------------------------------------------------------ */
  /*  Polls (F13a)                                                       */
  /* ------------------------------------------------------------------ */

  // Seed the poll list per trip open (bounded by POLL_MAX_PER_TRIP). Polls are
  // their own collection: creating/voting never bumps `Trip.rev`.
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    void (async () => {
      try {
        const result = await api.getTripPolls(tripId);
        if (alive) setState((prev) => ({ ...prev, polls: result.polls || [] }));
      } catch (err: any) {
        console.error('polls: initial load failed', err?.message || err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);

  /** Merges one poll row: patch in place (a vote must not reorder the list). */
  const applyPollRow = useCallback((row: TripPoll) => {
    setState((prev) => {
      if (row.deletedAt) {
        return { ...prev, polls: prev.polls.filter((poll) => poll._id !== row._id) };
      }
      const index = prev.polls.findIndex((poll) => poll._id === row._id);
      if (index === -1) return { ...prev, polls: [row, ...prev.polls] };
      const next = [...prev.polls];
      next[index] = row;
      return { ...prev, polls: next };
    });
  }, []);

  const createPoll = useCallback(
    async (sealedBody: string): Promise<TripPoll> => {
      if (!tripId) throw new Error('No trip is open.');
      const result = await api.createTripPoll(tripId, sealedBody);
      applyPollRow(result.poll);
      return result.poll;
    },
    [tripId, applyPollRow]
  );

  const votePoll = useCallback(
    async (pollId: string, sealedChoice: string): Promise<TripPoll> => {
      if (!tripId) throw new Error('No trip is open.');
      const result = await api.voteTripPoll(tripId, pollId, sealedChoice);
      applyPollRow(result.poll);
      return result.poll;
    },
    [tripId, applyPollRow]
  );

  const closePoll = useCallback(
    async (pollId: string): Promise<void> => {
      if (!tripId) return;
      const result = await api.closeTripPoll(tripId, pollId);
      applyPollRow(result.poll);
    },
    [tripId, applyPollRow]
  );

  const removePoll = useCallback(
    async (pollId: string): Promise<void> => {
      if (!tripId) return;
      const result = await api.removeTripPoll(tripId, pollId);
      applyPollRow(result.poll);
    },
    [tripId, applyPollRow]
  );

  /** Live ingest for poll frames — the projection carries the full row. */
  const ingestPoll = useCallback(
    (frame: PollFrame) => {
      if (!frame?.poll?._id) return;
      applyPollRow(frame.poll);
    },
    [applyPollRow]
  );

  const ensureLoaded = useCallback(() => {
    if (!tripId || bootstrapped.current) return;
    bootstrapped.current = true;
    setState((prev) => ({ ...prev, status: 'loading' }));
    void (async () => {
      try {
        const result = await api.getTripComments(tripId, { limit: 50 });
        cursorRef.current = result.nextCursor ?? null;
        setState((prev) => ({
          ...prev,
          comments: result.comments || [],
          dayCounts: result.dayCounts || {},
          nextCursor: result.nextCursor ?? null,
          status: 'ready',
        }));
      } catch (err: any) {
        bootstrapped.current = false; // allow a retry on the next tab open
        setState((prev) => ({ ...prev, status: 'error' }));
        console.error('comments: initial load failed', err?.message || err);
      }
    })();
  }, [tripId]);

  const loadEarlier = useCallback(async () => {
    if (!tripId) return;
    const before = cursorRef.current;
    if (!before || loadingEarlierRef.current) return;
    loadingEarlierRef.current = true;
    setState((prev) => ({ ...prev, loadingEarlier: true }));
    try {
      const result = await api.getTripComments(tripId, { before, limit: 50 });
      cursorRef.current = result.nextCursor ?? null;
      setState((prev) => {
        const known = new Set(prev.comments.map((existing) => existing._id));
        const fresh = (result.comments || []).filter((row) => !known.has(row._id));
        return {
          ...prev,
          // Older rows go to the BOTTOM (the list is newest-first).
          comments: [...prev.comments, ...fresh],
          nextCursor: result.nextCursor ?? null,
          loadingEarlier: false,
        };
      });
    } catch (err: any) {
      setState((prev) => ({ ...prev, loadingEarlier: false }));
      console.error('comments: load-earlier failed', err?.message || err);
    } finally {
      loadingEarlierRef.current = false;
    }
  }, [tripId]);

  /**
   * Optimistic add (§19.7): an in-flight row renders immediately and either
   * becomes the server truth on 201, or rolls back on any failure (limiter
   * 429, per-trip cap 409, network). F10: when `e2ee` is set, `body` is the
   * ciphertext while `plaintextHint` is what the optimistic bubble shows and
   * what the caller pins via the crypto hook (no 🔒 flash on just-sent).
   */
  const addComment = useCallback(
    async (
      body: string,
      day?: number,
      e2ee?: boolean,
      plaintextHint?: string,
      bot?: boolean
    ): Promise<TripComment | null> => {
      if (!tripId) return null;
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: TripComment = {
        _id: tempId,
        tripId,
        // The optimistic preview is the plaintext (the wire body is opaque,
        // and a human should never watch their own words turn into base64).
        label: bot ? 'TravelAI' : 'You',
        body: plaintextHint ?? body,
        // F12a: bot rows render as the TravelAI participant immediately.
        ...(bot ? { bot: true } : {}),
        isYou: true,
        createdAt: new Date().toISOString(),
        ...(day !== undefined ? { day } : {}),
      };

      setState((prev) => ({
        ...prev,
        comments: [optimistic, ...prev.comments],
        submitting: true,
      }));
      bumpDayCount(day, +1);

      try {
        const result = await api.addTripComment(tripId, {
          body,
          ...(day !== undefined ? { day } : {}),
          ...(e2ee ? { e2ee: true } : {}),
          ...(bot ? { bot: true } : {}),
        });
        // The authoritative row is OURS by construction (§20.2): record the id
        // so a racing frame can never count our own words as unread.
        mineRef.current.add(result.comment._id);
        setState((prev) => ({
          ...prev,
          // Drop the placeholder AND any same-_id row a frame may have raced
          // in with; the authoritative row replaces both right after.
          comments: prev.comments.filter(
            (row) => row._id !== tempId && row._id !== result.comment._id
          ),
          submitting: false,
        }));
        applyRow(result.comment, true);
        return result.comment;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          comments: prev.comments.filter((row) => row._id !== tempId),
          submitting: false,
        }));
        bumpDayCount(day, -1);
        throw err;
      }
    },
    [tripId, applyRow, bumpDayCount]
  );

  const editComment = useCallback(
    async (commentId: string, body: string, e2ee?: boolean): Promise<boolean> => {
      if (!tripId) return false;
      const result = await api.editTripComment(tripId, commentId, body, e2ee);
      applyRow(result.comment, true);
      return true;
    },
    [tripId, applyRow]
  );

  /** Author-or-owner removal; the server answers with the tombstone row. */
  const removeComment = useCallback(
    async (comment: TripComment): Promise<void> => {
      if (!tripId) return;
      // Optimistically blank the body so the words vanish instantly for
      // readers; the DELETE response finalizes the audit stamp (or rolls back).
      setState((prev) => ({
        ...prev,
        comments: prev.comments.map((row) =>
          row._id === comment._id ? { ...row, body: '' } : row
        ),
      }));
      bumpDayCount(comment.day, -1);
      try {
        const result = await api.removeTripComment(tripId, comment._id);
        applyRow(result.comment, comment.isYou);
      } catch (err) {
        // Undo the optimistic blank when the removal was refused.
        setState((prev) => ({
          ...prev,
          comments: mergeRow(prev.comments, comment, false),
        }));
        bumpDayCount(comment.day, +1);
        throw err;
      }
    },
    [tripId, applyRow, bumpDayCount]
  );

  /**
   * Live ingest — pure dedupe, no refetch. F8b additions: an UNKNOWN foreign
   * row bumps the unread badge when no chat surface is open (our own rows via
   * POST responses are pre-registered in `mineRef`, so they never count), and
   * both directions nudge the day-chip counts so the F6b2 badges stay honest
   * between server reads.
   */
  const ingest = useCallback((frame: CommentFrame) => {
    if (!frame?.comment?._id) return;
    const row = frame.comment;
    const tombstoned = Boolean(row.deletedAt);
    if (tombstoned) {
      bumpDayCount(row.day, -1);
    } else if (!mineRef.current.has(row._id)) {
      bumpDayCount(row.day, +1);
      // Accepted F8b limit (documented in §2.2): the projection carries no
      // userId, so a comment you posted from ANOTHER device can tick this
      // device's badge until the next server re-sync.
      if (!openRef.current) {
        setState((prev) => ({ ...prev, unread: prev.unread + 1 }));
      }
    }
    setState((prev) => {
      const had = prev.comments.some((existing) => existing._id === row._id);
      return {
        ...prev,
        comments: had
          ? prev.comments.map((existing) => (existing._id === row._id ? row : existing))
          : [row, ...prev.comments],
      };
    });
  }, [bumpDayCount]);

  /** Marks a chat surface open/closed; opening flushes the read marker. */
  const setOpen = useCallback(
    (open: boolean) => {
      openRef.current = open;
      if (!open || !tripId) return;
      setState((prev) => (prev.unread === 0 ? prev : { ...prev, unread: 0 }));
      void api.markTripRead(tripId).catch(() => {
        /* the badge is already at 0 locally; the next seed/load re-syncs */
      });
    },
    [tripId]
  );

  /* ------------------------------------------------------------------ */
  /*  Typing indicator (F8b)                                             */
  /* ------------------------------------------------------------------ */

  const lastTypingPing = useRef(0);
  const typingRef = useRef<TypingEntry[]>([]);

  /** Throttled outbound ping — decoration, dropped silently on failures. */
  const notifyTyping = useCallback(() => {
    if (!tripId) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_INTERVAL_MS) return;
    lastTypingPing.current = now;
    void api.sendTypingPing(tripId);
  }, [tripId]);

  /** Ingests one `typing` frame; own echo filtered, one entry per author. */
  const ingestTyping = useCallback((frame: TypingFrame) => {
    if (!frame?.userId) return;
    if (currentUserIdRef.current && frame.userId === currentUserIdRef.current) return;
    const entry: TypingEntry = { userId: frame.userId, label: frame.label, at: Date.now() };
    typingRef.current = [
      entry,
      ...typingRef.current.filter((existing) => existing.userId !== frame.userId),
    ].slice(0, 3);
    setState((prev) => ({ ...prev, typing: typingRef.current }));
  }, []);

  // The prune interval runs only while something is on screen; each client
  // expires the indicator TYPING_TTL_MS after that author's last frame — the
  // stateless half of the F8a contract (no server roster, no disconnect ping).
  useEffect(() => {
    if (state.typing.length === 0) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS;
      const expiredNow = typingRef.current.some((entry) => entry.at <= cutoff);
      typingRef.current = typingRef.current.filter((entry) => entry.at > cutoff);
      if (expiredNow) {
        setState((prev) => ({ ...prev, typing: typingRef.current }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.typing.length]);

  const typingLabels = useMemo(
    () => state.typing.map((entry) => entry.label),
    [state.typing]
  );

  /** Which comments already carry an active decision (row-button state). */
  const decidedCommentIds = useMemo(
    () => new Set(state.decisions.map((row) => row.commentId)),
    [state.decisions]
  );

  return {
    state,
    ensureLoaded,
    loadEarlier,
    addComment,
    editComment,
    removeComment,
    ingest,
    setOpen,
    notifyTyping,
    ingestTyping,
    typingLabels,
    promoteComment,
    removeDecision,
    ingestDecision,
    decidedCommentIds,
    createPoll,
    votePoll,
    closePoll,
    removePoll,
    ingestPoll,
  };
}
