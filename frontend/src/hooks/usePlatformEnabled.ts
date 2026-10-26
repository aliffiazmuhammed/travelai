import { useEffect, useState } from 'react';
import { api } from '@/services/api';

/**
 * Backend feature discovery for the platform admin (PA1).
 *
 * The server is authoritative: `/api/admin/*` is a 404 while
 * `PLATFORM_ADMIN_ENABLED` is off. The SPA probes the public health payload once
 * per page load and renders `/admin` as unavailable instead of a login form.
 */
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function resetPlatformEnabledCache(): void {
  cached = null;
  inflight = null;
}

function probe(): Promise<boolean> {
  if (!inflight) {
    inflight = api
      .getHealth()
      .then((health) => Boolean(health?.platform?.enabled))
      .catch(() => false);
  }
  return inflight;
}

export function usePlatformEnabled(): boolean | null {
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
