import { useEffect, useState } from 'react';
import { api } from '@/services/api';

/**
 * Backend feature discovery for Agency Workspace A1.
 *
 * The server is the source of truth: `/api/agency/*` is a 404 unless
 * `AGENCY_WORKSPACE_ENABLED` is on. We probe the public health payload once per
 * page load and hide every agency link/route when it is off, so the personal
 * product has no agency surface at all.
 */
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function resetAgencyEnabledCache(): void {
  cached = null;
  inflight = null;
}

function probe(): Promise<boolean> {
  if (!inflight) {
    inflight = api
      .getHealth()
      .then((health) => Boolean(health?.agency?.enabled))
      .catch(() => false);
  }
  return inflight;
}

export function useAgencyEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(cached);

  useEffect(() => {
    let cancelled = false;
    if (cached !== null) {
      setEnabled(cached);
      return;
    }

    probe().then((value) => {
      cached = value;
      if (!cancelled) setEnabled(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
