import { env } from '../../config/env.js';

/**
 * The CORS allow-list (Milestone 6 E1.0 — flaw F1).
 *
 * Origins are matched **exactly**. The previous suffix-based matching
 * (`*.vercel.app`, `*.onrender.com`) turned `credentials: true` into an
 * attacker-friendly channel because anyone can create a subdomain on those free
 * hosts. Preview deployments that need access must be listed explicitly in
 * `FRONTEND_URL` or `ALLOWED_EXTRA_ORIGINS`.
 */

const BUILT_IN_ORIGINS = [
  // Local development servers
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  // Known production SPA deployments (added explicitly, not by suffix)
  'https://travelai-eta.vercel.app',
  'https://travelai-8cm4.vercel.app',
  'https://travelai-tjce.onrender.com',
];

/**
 * True when the browser's `Origin` is the very host that served the request.
 *
 * A unified deployment (`SERVE_STATIC=true`, SPA and API on one origin) is not
 * a CORS scenario: no cross-origin read is happening. Vite's module scripts
 * still send `Origin` because they carry `crossorigin`, so without this check
 * the allow-list rejects the app's own asset requests unless the deployment
 * URL happens to be listed separately. Same-origin is always safe to reflect;
 * everything else still goes through the exact allow-list.
 */
export function isSameOriginRequest(rawOrigin: string, rawRequestOrigin: string): boolean {
  const normalize = (value: string) =>
    String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  const origin = normalize(rawOrigin);
  return origin.length > 0 && origin === normalize(rawRequestOrigin);
}

/** True when `origin` may receive credentialed responses. */
export function isAllowedCorsOrigin(rawOrigin: string): boolean {
  // Normalize the incoming origin exactly like the candidates are normalized.
  const origin = String(rawOrigin || '').trim().replace(/\/+$/, '');

  const candidates = [
    ...BUILT_IN_ORIGINS,
    process.env.RENDER_EXTERNAL_URL || '',
    ...(env.FRONTEND_URL || '').split(','),
    ...(env.ALLOWED_EXTRA_ORIGINS || '').split(','),
  ]
    .map((candidate) => candidate.trim().replace(/\/+$/, ''))
    .filter((candidate) => candidate.startsWith('http://') || candidate.startsWith('https://'));

  return origin.length > 0 && candidates.includes(origin);
}
