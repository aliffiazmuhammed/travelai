import { useEffect, useState } from 'react';
import { api } from '@/services/api';

/**
 * Gallery discovery (Milestone 8 G3).
 *
 * The nav entry is not a feature flag — it is a content threshold. The roadmap
 * seeds at least 5 curated trips before `/explore` is linked, so a nearly empty
 * gallery never becomes a first impression. The probe asks the public listing
 * for one card and reads its `total`, which is the size of the whole filtered
 * set (no filters here), not the page.
 *
 * `/explore` itself is always reachable by URL: direct links and the traveler
 * profile keep working even below the threshold.
 */
export const GALLERY_NAV_THRESHOLD = 5;

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function resetGalleryEnabledCache(): void {
  cached = null;
  inflight = null;
}

function probe(): Promise<boolean> {
  if (!inflight) {
    inflight = api
      .getExplore({ limit: 1 })
      .then((page) => Number(page?.total ?? 0) >= GALLERY_NAV_THRESHOLD)
      .catch(() => false)
      .then((enabled) => {
        cached = enabled;
        return enabled;
      });
  }
  return inflight;
}

/** `null` while probing, then whether the gallery has enough to be linked. */
export function useGalleryEnabled(): boolean | null {
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
