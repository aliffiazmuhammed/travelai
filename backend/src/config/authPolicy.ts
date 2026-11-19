/**
 * Auth legal policy (Phase 1B).
 *
 * The versions are the contract between a rendered policy page and the
 * consent record stored on the account. Bump both the page copy in
 * `frontend/src/content/legal.ts` and the matching version here in one change;
 * a client that sends a stale version is asked to review again rather than
 * silently recording consent to text it never saw.
 *
 * `AUTH_LEGAL_CONSENT_REQUIRED` controls enforcement, not recording. New
 * clients always send consent; older app versions keep working until the
 * operator flips the flag after the release has drained.
 */

export const AUTH_TERMS_VERSION = '2026-11-17';
export const AUTH_PRIVACY_VERSION = '2026-11-17';

export const AUTH_TERMS_PATH = '/terms';
export const AUTH_PRIVACY_PATH = '/privacy';

export interface LegalConsentInput {
  termsVersion: string;
  privacyVersion: string;
  /** Separate, optional marketing permission. Never bundled with legal consent. */
  marketingOptIn?: boolean;
}

export type ConsentProblem = 'missing' | 'stale-terms' | 'stale-privacy';

export interface ConsentRecord {
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  acceptedAt: Date;
  marketingOptIn: boolean;
}

/**
 * Pure decision used by the sign-up service and by tests.
 *
 * Returns `null` when the payload may proceed. While enforcement is off an
 * older client can omit consent entirely; a *provided* consent still has to
 * reference the current versions, otherwise the stored record would be a lie.
 */
export function consentProblem(
  consent: LegalConsentInput | undefined,
  required: boolean
): ConsentProblem | null {
  if (!consent) return required ? 'missing' : null;
  if (consent.termsVersion !== AUTH_TERMS_VERSION) return 'stale-terms';
  if (consent.privacyVersion !== AUTH_PRIVACY_VERSION) return 'stale-privacy';
  return null;
}

/** Turns a validated payload into the fields persisted on the user document. */
export function consentRecord(consent: LegalConsentInput): ConsentRecord {
  return {
    acceptedTermsVersion: consent.termsVersion,
    acceptedPrivacyVersion: consent.privacyVersion,
    acceptedAt: new Date(),
    marketingOptIn: consent.marketingOptIn === true,
  };
}
