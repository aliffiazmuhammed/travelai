/**
 * Destination cover proxy (C-21).
 *
 * Public pages should not depend on a third-party image host being reachable
 * from the browser. The Unsplash ids live in the SPA's `tripCover` helper; this
 * endpoint accepts only that id shape and a small width allow-list, so it cannot
 * be used as an open proxy. Bytes are cached in memory and served same-origin.
 */

export const COVER_WIDTHS = [320, 480, 640, 800, 1200, 1600] as const;
export type CoverWidth = (typeof COVER_WIDTHS)[number];

const PHOTO_ID = /^photo-[A-Za-z0-9_-]{1,80}$/;
const UPSTREAM_BASE = 'https://images.unsplash.com';
const UPSTREAM_QUALITY = 80;

export const COVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const COVER_CACHE_MAX_ENTRIES = 200;
export const COVER_UPSTREAM_TIMEOUT_MS = 8_000;
export const COVER_MAX_BYTES = 6 * 1024 * 1024;

export interface CoverRequest {
  photo: string;
  width: CoverWidth;
  key: string;
}

/** Parses the two query values; anything outside the allow-list is rejected. */
export function parseCoverRequest(
  rawPhoto: unknown,
  rawWidth: unknown
): CoverRequest | null {
  if (typeof rawPhoto !== 'string' || !PHOTO_ID.test(rawPhoto)) return null;
  if (typeof rawWidth !== 'string') return null;

  const width = Number(rawWidth);
  if (!COVER_WIDTHS.includes(width as CoverWidth)) return null;

  return {
    photo: rawPhoto,
    width: width as CoverWidth,
    key: `${rawPhoto}@${width}`,
  };
}

/** The only upstream URL this service will ever fetch. */
export function buildCoverSourceUrl(photo: string, width: CoverWidth): string {
  return `${UPSTREAM_BASE}/${photo}?auto=format&fit=crop&w=${width}&q=${UPSTREAM_QUALITY}`;
}

export interface CachedCover {
  bytes: Buffer;
  contentType: string;
  storedAt: number;
}

export interface CoverCache {
  get(key: string, now?: number): CachedCover | null;
  set(key: string, value: CachedCover, now?: number): void;
  size(): number;
}

/**
 * Small LRU-ish cache: expired rows are dropped on read, and insertion evicts
 * the oldest key once the cap is reached. A single process serves both the SPA
 * and the proxy, so this keeps a repeat visit off the upstream host entirely.
 */
export function createCoverCache(
  maxEntries = COVER_CACHE_MAX_ENTRIES,
  ttlMs = COVER_CACHE_TTL_MS
): CoverCache {
  const rows = new Map<string, CachedCover>();

  const isFresh = (row: CachedCover, now: number) => now - row.storedAt < ttlMs;

  return {
    get(key, now = Date.now()) {
      const row = rows.get(key);
      if (!row) return null;
      if (!isFresh(row, now)) {
        rows.delete(key);
        return null;
      }
      // Re-insert so the least recently used key is the first to go.
      rows.delete(key);
      rows.set(key, row);
      return row;
    },
    set(key, value, now = Date.now()) {
      if (rows.has(key)) rows.delete(key);
      rows.set(key, { ...value, storedAt: now });
      while (rows.size > maxEntries) {
        const oldest = rows.keys().next().value;
        if (oldest === undefined) break;
        rows.delete(oldest);
      }
    },
    size() {
      return rows.size;
    },
  };
}

export const coverCache = createCoverCache();
