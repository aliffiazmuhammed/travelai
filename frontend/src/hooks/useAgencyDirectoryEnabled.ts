import { useEffect, useState } from 'react';
import { api } from '@/services/api';

/**
 * Agency directory discovery (Milestone 9 D3).
 *
 * Same content gate as the gallery: the nav entry appears only once at least
 * five agencies have published a profile, so a half-empty directory is never a
 * first impression. The probe asks the listing for one card and reads `total`,
 * which is the size of the whole eligible set.
 *
 * `/agencies` itself is always reachable by URL and from any direct link.
 */
export const AGENCY_DIRECTORY_NAV_THRESHOLD = 5;

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function resetAgencyDirectoryEnabledCache(): void {
  cached = null;
  inflight = null;
}

function probe(): Promise<boolean> {
  if (!inflight) {
    inflight = api
      .getAgencies({ limit: 1 })
      .then((page) => Number(page?.total ?? 0) >= AGENCY_DIRECTORY_NAV_THRESHOLD)
      .catch(() => false)
      .then((enabled) => {
        cached = enabled;
        return enabled;
      });
  }
  return inflight;
}

/** `null` while probing, then whether the directory has enough to be linked. */
export function useAgencyDirectoryEnabled(): boolean | null {
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
