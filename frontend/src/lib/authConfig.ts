import { API_BASE_URL } from "../config";
import { LEGAL_VERSIONS } from "@/content/legal";
import {
  DEFAULT_PASSWORD_POLICY,
  type PasswordPolicy,
} from "./passwordPolicy";

/**
 * Public auth capability document (Phase 1B).
 *
 * The sign-up form must send the versions the server will accept. Fetching
 * them keeps a policy-version bump from becoming a client/server drift bug; the
 * local defaults cover the first paint and a temporarily unavailable API.
 */
export interface LegalConfig {
  termsVersion: string;
  privacyVersion: string;
  termsPath: string;
  privacyPath: string;
}

export interface AuthConfig {
  consentRequired: boolean;
  legal: LegalConfig;
  password: PasswordPolicy;
}

export const DEFAULT_LEGAL_CONFIG: LegalConfig = {
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
  termsPath: "/terms",
  privacyPath: "/privacy",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Optional in the response: an older server keeps working with the defaults. */
function parsePasswordPolicy(value: unknown): PasswordPolicy {
  if (!value || typeof value !== "object") return DEFAULT_PASSWORD_POLICY;
  const candidate = value as Record<string, unknown>;
  const minLength =
    typeof candidate.minLength === "number" && Number.isInteger(candidate.minLength)
      ? candidate.minLength
      : DEFAULT_PASSWORD_POLICY.minLength;
  const maxLength =
    typeof candidate.maxLength === "number" && Number.isInteger(candidate.maxLength)
      ? candidate.maxLength
      : DEFAULT_PASSWORD_POLICY.maxLength;
  return {
    minLength,
    maxLength,
    requirements: isNonEmptyString(candidate.requirements)
      ? candidate.requirements
      : DEFAULT_PASSWORD_POLICY.requirements,
  };
}

/** Reads `/api/auth/config`; throws on a malformed response so callers can keep the defaults. */
export async function fetchAuthConfig(signal?: AbortSignal): Promise<AuthConfig> {
  const response = await fetch(`${API_BASE_URL}/api/auth/config`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Could not load the current auth configuration.");

  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Malformed auth configuration.");

  const record = data as Record<string, unknown>;
  const legal = record.legal;
  if (!legal || typeof legal !== "object") throw new Error("Malformed legal configuration.");

  const candidate = legal as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.termsVersion) ||
    !isNonEmptyString(candidate.privacyVersion) ||
    !isNonEmptyString(candidate.termsPath) ||
    !isNonEmptyString(candidate.privacyPath)
  ) {
    throw new Error("Malformed legal configuration.");
  }

  return {
    consentRequired: record.consentRequired === true,
    legal: {
      termsVersion: candidate.termsVersion,
      privacyVersion: candidate.privacyVersion,
      termsPath: candidate.termsPath,
      privacyPath: candidate.privacyPath,
    },
    password: parsePasswordPolicy(record.password),
  };
}
