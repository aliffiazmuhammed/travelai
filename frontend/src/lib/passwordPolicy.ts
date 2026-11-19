/**
 * Client mirror of the backend password policy (Phase 2, AUTH-030/033).
 *
 * The numbers and requirement copy are also published by `/api/auth/config`;
 * the defaults here keep the form usable on first paint and if that request
 * fails. The server remains authoritative, so a stale client is rejected with
 * the same message instead of silently storing a weaker password.
 */

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requirements: string;
}

export interface PasswordContext {
  email?: string;
  name?: string;
}

export interface PasswordStrengthResult {
  /** A text label, never colour alone. */
  label: string;
  /** 1–4 for the meter; the label carries the meaning. */
  score: number;
  hint: string;
  weak: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 64,
  requirements:
    "Use at least 8 characters. Spaces and passphrases are welcome.",
};

/** Kept short: the server owns the full blocklist and always re-checks. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "12345678",
  "123456789",
  "qwerty123",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "admin123",
  "iloveyou",
  "monkey12",
  "dragon12",
  "sunshine",
  "princess",
  "trustno1",
  "travel123",
  "waytowalk",
]);

function normalized(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** UTF-8 byte length without relying on TextEncoder in every runtime. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Returns a user-facing message, or null when the password may proceed. */
export function passwordProblem(
  value: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  context: PasswordContext = {}
): string | null {
  if (value.trim().length === 0) return "Enter a password.";
  if (value.length < policy.minLength) {
    return `Use at least ${policy.minLength} characters.`;
  }
  if (value.length > policy.maxLength) {
    return `Use ${policy.maxLength} characters or fewer.`;
  }
  if (utf8ByteLength(value) > 72) {
    return "That password is too long. Use fewer characters.";
  }

  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return "That password is too easy to guess. Choose another one.";
  }

  const email = normalized(context.email);
  if (email) {
    const localPart = email.split("@")[0] ?? "";
    if (lower === email || (localPart.length >= 4 && lower === localPart)) {
      return "Choose a password that is not your email address.";
    }
  }

  const name = normalized(context.name);
  if (name && name.length >= 3 && lower.replace(/\s+/g, "") === name.replace(/\s+/g, "")) {
    return "Choose a password that is not your name.";
  }

  return null;
}

/**
 * Length-first feedback on purpose: no composition score can make
 * `P@ssw0rd!` stronger than a long passphrase. The label is always rendered
 * as text next to the meter.
 */
export function passwordStrength(
  value: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  context: PasswordContext = {}
): PasswordStrengthResult | null {
  if (!value) return null;

  const problem = passwordProblem(value, policy, context);
  if (problem) {
    return {
      label: "Too weak",
      score: 1,
      hint: "Try a phrase that is longer and less predictable.",
      weak: true,
    };
  }

  const words = value.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 4) {
    return {
      label: "Strong passphrase",
      score: 4,
      hint: "Length beats complexity — this is a good one.",
      weak: false,
    };
  }
  if (value.length >= 16) {
    return {
      label: "Very strong",
      score: 4,
      hint: "A long password is hard to guess.",
      weak: false,
    };
  }
  if (value.length >= 12) {
    return {
      label: "Strong",
      score: 3,
      hint: "A little longer makes it stronger still.",
      weak: false,
    };
  }
  return {
    label: "Good",
    score: 2,
    hint: "Add a few more characters for a stronger password.",
    weak: false,
  };
}
