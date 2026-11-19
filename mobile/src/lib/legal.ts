import { webUrl } from '@/config';

/**
 * Mirror of `backend/src/config/authPolicy.ts` (Phase 1B).
 *
 * These defaults are what the client renders before `/api/auth/config`
 * answers. The server remains the authority: a stale pair is rejected, never
 * recorded. Bump both sides together when the legal owner approves new copy.
 */
export interface LegalConfig {
  termsVersion: string;
  privacyVersion: string;
  termsPath: string;
  privacyPath: string;
}

export const DEFAULT_LEGAL_CONFIG: LegalConfig = {
  termsVersion: '2026-11-17',
  privacyVersion: '2026-11-17',
  termsPath: '/terms',
  privacyPath: '/privacy',
};

/** Opens a policy page in the browser; the native app has no legal route. */
export function legalUrl(path: string): string {
  return webUrl(path);
}
