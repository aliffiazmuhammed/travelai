import { apiRequest } from '@/api/client';
import type { LegalConfig } from '@/lib/legal';
import {
  DEFAULT_PASSWORD_POLICY,
  type PasswordPolicy,
} from '@/lib/passwordPolicy';

/**
 * Public auth capability document (Phase 1B / Phase 2). The sign-up screen
 * reads the policy versions and password floor the server will accept, so a
 * copy change does not require an app release just to keep records honest.
 */
export interface AuthConfig {
  consentRequired: boolean;
  legal: LegalConfig;
  password: PasswordPolicy;
}

interface AuthConfigResponse {
  success: true;
  consentRequired?: boolean;
  legal: LegalConfig;
  password?: Partial<PasswordPolicy>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Optional in the response: an older server keeps working with the defaults. */
function parsePasswordPolicy(value: Partial<PasswordPolicy> | undefined): PasswordPolicy {
  return {
    minLength:
      typeof value?.minLength === 'number' && Number.isInteger(value.minLength)
        ? value.minLength
        : DEFAULT_PASSWORD_POLICY.minLength,
    maxLength:
      typeof value?.maxLength === 'number' && Number.isInteger(value.maxLength)
        ? value.maxLength
        : DEFAULT_PASSWORD_POLICY.maxLength,
    requirements: isNonEmptyString(value?.requirements)
      ? value.requirements
      : DEFAULT_PASSWORD_POLICY.requirements,
  };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const response = await apiRequest<AuthConfigResponse>('/auth/config', { auth: false });
  const legal = response?.legal;

  if (
    !legal ||
    !isNonEmptyString(legal.termsVersion) ||
    !isNonEmptyString(legal.privacyVersion) ||
    !isNonEmptyString(legal.termsPath) ||
    !isNonEmptyString(legal.privacyPath)
  ) {
    throw new Error('The server returned an incomplete auth configuration.');
  }

  return {
    consentRequired: response.consentRequired === true,
    legal,
    password: parsePasswordPolicy(response.password),
  };
}
