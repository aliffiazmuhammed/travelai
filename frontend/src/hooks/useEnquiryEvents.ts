import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config';
import { appFeatures } from '@/hooks/useTripEvents';
import type {
  AgencyConversationAuthor,
  AgencyConversationMessage,
  AgencyConversationUnread,
  AgencyEnquiryStatus,
} from '@/types/agency';

/**
 * Milestone 9 R2/R3 — the client half of the enquiry live tier, for both the
 * traveller (`/api/enquiries/events`) and the tenant inbox
 * (`/api/agency/enquiries/events`).
 *
 * Mirrors `services/realtime/enquiryEvents.ts`. Frames are hints: every one
 * names an enquiry, and the consumer answers with a quiet GET. Nothing here is
 * load-bearing for correctness, so a missed frame, a reconnect or a deploy all
 * degrade to "the next read is right".
 */

export type EnquiryFrame =
  | { type: 'hello'; channel: string; at: string }
  | {
      type: 'enquiry:new';
      enquiryId: string;
      status: AgencyEnquiryStatus;
      createdAt: string | null;
      at: string;
    }
  | {
      type: 'enquiry:message';
      enquiryId: string;
      message: AgencyConversationMessage;
      status: AgencyEnquiryStatus;
      unread: AgencyConversationUnread;
      lastMessageAt: string | null;
      lastMessageBy: AgencyConversationAuthor | null;
      at: string;
    }
  | {
      type: 'enquiry:updated';
      enquiryId: string;
      status: AgencyEnquiryStatus;
      at: string;
    }
  | { type: 'enquiry:read'; enquiryId: string; side: AgencyConversationAuthor; at: string }
  | { type: 'proposal:new'; enquiryId: string; linkId: string; at: string }
  | {
      type: 'proposal:declined';
      enquiryId: string;
      linkId: string;
      declinedAt: string | null;
      at: string;
    };

/**
 * - `off`     — caller disabled the channel (the guest link has no account).
 * - `probing` — checking `/api/health` before touching EventSource.
 * - `live`    — the stream is open; frames drive refreshes.
 * - `poll`    — the live tier is unavailable; polling is the source of updates.
 */
export type EnquiryLiveMode = 'off' | 'probing' | 'live' | 'poll';

/** Coalesces bursts (a reply plus its read receipt) into one GET. */
const FRAME_REFRESH_DEBOUNCE_MS = 1000;
/** Fallback cadence when SSE is off or the stream keeps failing. */
const ENQUIRY_POLL_MS = 20000;

interface UseEnquiryLiveOptions {
  /** Set false for surfaces with no personal session, such as the guest link. */
  enabled?: boolean;
  /** Restrict refreshes to one thread; omitted on the list page. */
  enquiryId?: string;
  /** Which account the stream authenticates as (R3 adds the tenant inbox). */
  channel?: 'traveller' | 'agency';
  /** Reopen the stream when the caller's identity changes, e.g. a workspace switch. */
  streamKey?: string;
  intervalMs?: number;
}

const STREAM_PATHS = {
  traveller: '/api/enquiries/events',
  agency: '/api/agency/enquiries/events',
} as const;

/**
 * Opens the caller's enquiry stream and calls `refresh` once a burst of
 * relevant frames settles. While the stream is unavailable it poll-then-
 * refreshes instead — visible tabs only, plus a catch-up on focus and tab
 * return. Returns the mode so callers can show a live indicator.
 */
export function useEnquiryLiveRefresh(
  refresh: () => void | Promise<void>,
  options: UseEnquiryLiveOptions = {}
): EnquiryLiveMode {
  const {
    enabled = true,
    enquiryId,
    channel = 'traveller',
    streamKey,
    intervalMs = ENQUIRY_POLL_MS,
  } = options;
  const [mode, setMode] = useState<EnquiryLiveMode>(enabled ? 'probing' : 'off');

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const enquiryIdRef = useRef(enquiryId);
  enquiryIdRef.current = enquiryId;

  useEffect(() => {
    if (!enabled) {
      setMode('off');
      return;
    }
    let source: EventSource | null = null;
    let disposed = false;
    let debounceTimer: number | null = null;

    setMode('probing');

    const scheduleRefresh = () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void refreshRef.current();
      }, FRAME_REFRESH_DEBOUNCE_MS);
    };

    void (async () => {
      const features = await appFeatures();
      if (disposed) return;
      if (!features.enquirySse) {
        setMode('poll');
        return;
      }
      try {
        source = new EventSource(`${API_BASE_URL}${STREAM_PATHS[channel]}`, {
          withCredentials: true,
        });
      } catch {
        setMode('poll');
        return;
      }

      source.onopen = () => {
        if (!disposed) setMode('live');
      };
      source.onmessage = (message) => {
        let frame: EnquiryFrame;
        try {
          frame = JSON.parse(message.data) as EnquiryFrame;
        } catch {
          return; // a malformed frame is not worth a refresh
        }
        if (!frame || typeof frame !== 'object') return;
        if (frame.type === 'hello') {
          if (!disposed) setMode('live');
          return;
        }
        const scope = enquiryIdRef.current;
        if (scope && frame.enquiryId !== scope) return;
        // A hidden tab is not reading anything: refreshing there would mark an
        // open thread read without anyone seeing it. The return to visibility
        // does one catch-up read instead.
        if (document.visibilityState === 'hidden') return;
        scheduleRefresh();
      };
      // The browser retries on its own; a reopen flips the mode back to live.
      source.onerror = () => {
        if (!disposed) setMode('poll');
      };
    })();

    return () => {
      disposed = true;
      source?.close();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    };
    // `channel` picks the route; `streamKey` reopens when the signed-in tenant
    // changes, since the server bound the old socket to the previous agency.
  }, [enabled, channel, streamKey]);

  // Frames that arrived behind a hidden tab were deliberately dropped, so the
  // first visible moment resyncs with one quiet read.
  useEffect(() => {
    if (mode !== 'live') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'poll') return;
    let disposed = false;
    let inFlight = false;

    const tick = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        await refreshRef.current();
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    const timer = window.setInterval(() => void tick(), intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [mode, intervalMs]);

  return mode;
}
