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
];

/** True when `origin` may receive credentialed responses. */
export function isAllowedCorsOrigin(rawOrigin: string): boolean {
  // Normalize the incoming origin exactly like the candidates are normalized.
  const origin = String(rawOrigin || '').trim().replace(/\/+$/, '');

  const candidates = [
    ...BUILT_IN_ORIGINS,
    ...(env.FRONTEND_URL || '').split(','),
    ...(env.ALLOWED_EXTRA_ORIGINS || '').split(','),
  ]
    .map((candidate) => candidate.trim().replace(/\/+$/, ''))
    .filter((candidate) => candidate.startsWith('http://') || candidate.startsWith('https://'));

  return origin.length > 0 && candidates.includes(origin);
}
