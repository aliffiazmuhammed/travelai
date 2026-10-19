import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config';
import { api } from '@/services/api';
import type { TripRole } from '@/types/trip';

/**
 * Milestone 6 §3.7 (sprint E4b) — the client half of the live tier.
 *
 * Channels (server `GET /api/itinerary/:id/events`, guarded by
 * `requireTripRole('viewer')`):
 *   - `presence`      → the live roster for the avatar stack
 *   - `trip:updated`  → any Trip write anywhere; the caller refetches
 *
 * Presence is decoration: a closed browser tab stops heartbeating and its
 * entry TTL-expires server-side. Everything here degrades to a no-op when
 * `ENABLE_TRIP_SSE` is not enabled on the server / health endpoint.
 */

export interface PresenceUser {
  userId: string;
  label: string;
  role: TripRole;
}

interface HealthFeatures {
  sse: boolean;
}

let featuresCache: Promise<HealthFeatures> | null = null;

/** One-shot health probe (feature discovery) — cached for the session. */
export function appFeatures(): Promise<HealthFeatures> {
  featuresCache ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        const data = await response.json();
        return { sse: Boolean(data?.collab?.sse) };
      }
    } catch {
      /* offline — treat as disabled */
    }
    return { sse: false };
  })();
  return featuresCache;
}

interface UseTripEventsOptions {
  /** Called (debounced) for every `trip:updated` — the caller refetches. */
  onTripUpdated?: () => void;
  /** Called for every `comment:new` / `comment:update` frame (F6a/F6b). */
  onCommentEvent?: (frame: CommentFrame) => void;
  /** Called for every `typing` frame (F8a/F8b) — stateless, client self-expired. */
  onTypingEvent?: (frame: TypingFrame) => void;
  /** Heartbeat cadence; must stay below the server TTL (30s default). */
  heartbeatMs?: number;
}

/**
 * A comment frame (Milestone 6 §19.4). `comment` is the server's projected row;
 * `isYou` on a fan-out frame is the AUTHOR's view, not the recipient's — every
 * consumer must dedupe by `_id` and trust its own POST responses instead.
 */
export type CommentFrame =
  | { type: 'comment:new'; tripId: string; comment: import('@/types').TripComment }
  | { type: 'comment:update'; tripId: string; comment: import('@/types').TripComment };

/**
 * A typing ping (Milestone 7 F8a). Stateless on both ends: there is no server
 * roster and no reliable-delivery promise — the RECIPENT's client shows the
 * indicator and expires it ~5s after the last frame for that author. `userId`
 * lets consumers drop their own echo; `label` is display-only.
 */
export interface TypingFrame {
  type: 'typing';
  tripId: string;
  userId: string;
  label: string;
}

/**
 * mount an SSE stream + heartbeat loop for a trip. Returns the live roster
 * (empty when the tier is off or the stream could not open).
 */
export function useTripEvents(
  tripId?: string,
  options: UseTripEventsOptions = {}
): PresenceUser[] {
  const { onTripUpdated, onCommentEvent, onTypingEvent, heartbeatMs = 10000 } = options;
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  // Latest callback without resubscribing the EventSource on re-render.
  const onTripUpdatedRef = useRef(onTripUpdated);
  onTripUpdatedRef.current = onTripUpdated;
  const onCommentEventRef = useRef(onCommentEvent);
  onCommentEventRef.current = onCommentEvent;
  const onTypingEventRef = useRef(onTypingEvent);
  onTypingEventRef.current = onTypingEvent;

  // Coalesce bursts of trip:updated into one refetch (a save touches many
  // routes; the UI needs one fresh read, not N).
  const updateTimer = useRef<number | null>(null);
  const notifyUpdate = useCallback(() => {
    if (updateTimer.current) window.clearTimeout(updateTimer.current);
    updateTimer.current = window.setTimeout(() => {
      updateTimer.current = null;
      onTripUpdatedRef.current?.();
    }, 1200);
  }, []);

  useEffect(() => {
    if (!tripId) {
      setPresence([]);
      return;
    }
    let source: EventSource | null = null;
    let heartbeatTimer: number | null = null;
    let disposed = false;

    (async () => {
      const features = await appFeatures();
      if (disposed || !features.sse) return; // live tier off → silent no-op

      try {
        source = new EventSource(
          `${API_BASE_URL}/api/itinerary/${tripId}/events`,
          { withCredentials: true }
        );
        source.onmessage = (message) => {
          try {
            const event = JSON.parse(message.data);
            if (event?.type === 'presence' && Array.isArray(event.users)) {
              setPresence(event.users as PresenceUser[]);
            } else if (event?.type === 'trip:updated') {
              notifyUpdate();
            } else if (event?.type === 'comment:new' || event?.type === 'comment:update') {
              onCommentEventRef.current?.(event as CommentFrame);
            } else if (event?.type === 'typing') {
              onTypingEventRef.current?.(event as TypingFrame);
            }
          } catch {
            /* malformed frame — ignore, keep-alives stay as comments */
          }
        };
        // onerror fires while the browser retries; presence stays stale until
        // the stream reopens (the query re-announces with a fresh snapshot).
        source.onerror = () => setPresence((prev) => (prev.length ? prev : []));
      } catch {
        return; // EventSource not available — decoration only
      }

      heartbeatTimer = window.setInterval(() => {
        void api.sendPresenceHeartbeat(tripId);
      }, heartbeatMs);
      void api.sendPresenceHeartbeat(tripId);
    })();

    return () => {
      disposed = true;
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      if (source) source.close();
      setPresence([]);
      if (updateTimer.current) {
        window.clearTimeout(updateTimer.current);
        updateTimer.current = null;
      }
    };
  }, [tripId, heartbeatMs, notifyUpdate]);

  return presence;
}
