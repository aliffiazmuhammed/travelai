import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Agency mark for directory cards and the public profile (M9 D3).
 *
 * Without an uploaded logo the tile falls back to the name's initial on a
 * colour picked deterministically from the name, so the same agency always
 * looks the same across pages and reloads without inventing artwork.
 */
const TONES = [
  'bg-agency-accent',
  'bg-info',
  'bg-admin-accent',
  'bg-success',
  'bg-warning',
  'bg-destructive',
] as const;

function toneFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

interface AgencyLogoTileProps {
  name: string;
  logoUrl?: string | null;
  className?: string;
  imgClassName?: string;
}

export const AgencyLogoTile = ({
  name,
  logoUrl,
  className,
  imgClassName,
}: AgencyLogoTileProps) => {
  const label = name.trim() || 'Agency';
  const [failed, setFailed] = useState(false);

  // A logo can 404 (unpublished since the page loaded, legacy external URL);
  // the initial tile is always a safe fallback rather than a broken image.
  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const showLogo = Boolean(logoUrl) && !failed;

  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/60 text-xl font-bold text-white shadow-xs',
        showLogo ? 'bg-white dark:bg-background' : toneFor(label),
        className
      )}
    >
      {showLogo ? (
        <img
          src={logoUrl ?? undefined}
          alt=""
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-contain', imgClassName)}
        />
      ) : (
        <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
};

export default AgencyLogoTile;
