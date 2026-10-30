import { useEffect, useState } from 'react';
import { api } from '@/services/api';

/**
 * Events discovery gate (Milestone 10 E1).
 *
 * Like the gallery, the Explore entry is a content threshold rather than a
 * feature flag: one live event is already a real thing to join, so the link is
 * offered as soon as there is one. The probe asks the public listing for a
 * single card and reads `total`. `/explore` and event pages stay reachable by
 * URL regardless.
 */
export const EVENTS_NAV_THRESHOLD = 1;

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function resetEventsEnabledCache(): void {
  cached = null;
  inflight = null;
}

function probe(): Promise<boolean> {
  if (!inflight) {
    inflight = api
      .getPublicEvents({ limit: 1 })
      .then((page) => Number(page?.total ?? 0) >= EVENTS_NAV_THRESHOLD)
      .catch(() => false)
      .then((enabled) => {
        cached = enabled;
        return enabled;
      });
  }
  return inflight;
}

/** `null` while probing, then whether any event is live right now. */
export function useEventsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(cached);

  useEffect(() => {
    let cancelled = false;
    if (cached !== null) {
      setEnabled(cached);
      return;
    }

    probe().then((value) => {
      if (!cancelled) setEnabled(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
