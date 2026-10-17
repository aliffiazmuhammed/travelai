/**
 * Small in-memory TTL cache for AI generations.
 *
 * Identical prompts (same destination/days/budget/interests/language/variant)
 * within the TTL window are served instantly instead of calling the provider
 * again. This dramatically cuts cost and latency for popular combinations.
 *
 * Intentionally dependency-free and process-local — for multi-instance
 * deployments this can later be swapped for Redis without changing callers.
 */

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_MAX_ENTRIES = 200;

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const ttlMs = readNumberEnv('AI_CACHE_TTL_MS', DEFAULT_TTL_MS);
const maxEntries = readNumberEnv('AI_CACHE_MAX', DEFAULT_MAX_ENTRIES);

const store = new Map<string, CacheEntry>();

/** Stats counters (handy for the health endpoint / debugging). */
let hits = 0;
let misses = 0;

/**
 * Normalizes a prompt into a stable cache key. Whitespace and case are
 * collapsed so trivially different prompts share a cache entry.
 */
export function buildCacheKey(prompt: string): string {
  const normalized = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized;
}

/** Returns the cached value for a key, or null when missing/expired. */
export function getFromCache(key: string): string | null {
  const entry = store.get(key);
  if (!entry) {
    misses++;
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses++;
    return null;
  }
  hits++;
  // Refresh recency by re-inserting (Map preserves insertion order for LRU-ish eviction)
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

/** Stores a value, evicting the oldest entry when the cache is full. */
export function setInCache(key: string, value: string): void {
  if (!key || typeof value !== 'string') return;
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  while (store.size > maxEntries) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function getCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  ttlMs: number;
  maxEntries: number;
} {
  return { size: store.size, hits, misses, ttlMs, maxEntries };
}

export function clearCache(): void {
  store.clear();
  hits = 0;
  misses = 0;
}
