import { Router, type Response } from 'express';
import { coverImageLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  buildCoverSourceUrl,
  COVER_MAX_BYTES,
  COVER_UPSTREAM_TIMEOUT_MS,
  coverCache,
  parseCoverRequest,
  type CachedCover,
  type CoverRequest,
} from '../services/images/cover.js';

/**
 * Same-origin destination covers (C-21). Anonymous by design: the ids come from
 * the public photo catalogue, and the endpoint refuses any other host or shape.
 */
const router = Router();

const inFlight = new Map<string, Promise<CachedCover | null>>();

function send(res: Response, cover: CachedCover) {
  res.setHeader('Content-Type', cover.contentType);
  res.setHeader('Content-Length', String(cover.bytes.byteLength));
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(cover.bytes);
}

async function fetchCover(request: CoverRequest): Promise<CachedCover | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COVER_UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(buildCoverSourceUrl(request.photo, request.width), {
      signal: controller.signal,
      headers: { Accept: 'image/avif,image/webp,image/jpeg' },
    });
    if (!upstream.ok) return null;

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > COVER_MAX_BYTES) return null;

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > COVER_MAX_BYTES) return null;

    return { bytes, contentType, storedAt: Date.now() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.get('/cover', coverImageLimiter, async (req, res) => {
  const request = parseCoverRequest(req.query.photo, req.query.w);
  if (!request) {
    res.status(400).json({ success: false, error: 'Invalid cover request' });
    return;
  }

  const cached = coverCache.get(request.key);
  if (cached) {
    send(res, cached);
    return;
  }

  // Collapse concurrent misses for the same photo so a page with several cards
  // does not send several upstream requests for one file.
  let pending = inFlight.get(request.key);
  if (!pending) {
    pending = fetchCover(request);
    inFlight.set(request.key, pending);
    void pending.finally(() => inFlight.delete(request.key));
  }

  const cover = await pending;
  if (!cover) {
    res.status(502).json({ success: false, error: 'Cover unavailable' });
    return;
  }

  coverCache.set(request.key, cover);
  send(res, cover);
});

export default router;
