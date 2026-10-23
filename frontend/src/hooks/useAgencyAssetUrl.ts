import { useEffect, useState } from 'react';
import { api } from '@/services/api';

function isPrivateAssetUrl(url: string): boolean {
  return (
    url.startsWith('/api/agency/') &&
    url.includes('/assets/') &&
    !url.startsWith('//') &&
    !url.includes('\\')
  );
}

function isDisplayableExternalUrl(url: string): boolean {
  return url.startsWith('/') || /^https?:\/\//i.test(url);
}

/**
 * Resolves a branding URL for display. Uploaded assets live behind the agency
 * guard, so they are fetched with credentials and exposed as an object URL;
 * public absolute/`/uploads` URLs are returned unchanged. Object URLs are
 * revoked when the value changes or the component unmounts.
 */
export function useAgencyAssetUrl(url?: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!url) {
      setResolved(null);
      return;
    }

    if (!isPrivateAssetUrl(url)) {
      setResolved(isDisplayableExternalUrl(url) ? url : null);
      return;
    }

    setResolved(null);
    api
      .fetchAgencyAssetBlob(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return resolved;
}
