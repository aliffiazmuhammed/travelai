import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';

/**
 * One password policy for every credential-writing path (Phase 2, AUTH-030).
 *
 * Length-first, per NIST SP 800-63B and decision D-01/D-02:
 * - 8 characters minimum, 64 maximum, spaces and passphrases welcome.
 * - No uppercase/lowercase/number/symbol composition rules.
 * - Reject a small common-password list and the account's own email or name.
 * - Never apply this to sign-in: existing accounts may predate the policy, and
 *   forcing a reset would break their stored chat-key backups.
 *
 * bcrypt truncates input after 72 bytes. We do not pre-hash (that would
 * invalidate every stored hash and the key-backup protocol), so the boundary is
 * enforced explicitly: a password must fit in 64 characters AND 72 UTF-8 bytes.
 * Rejecting is honest; silently ignoring the tail is not.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_MAX_BYTES = 72;

/** Shown before submit by both clients; keep the wording in sync via auth-config. */
export const PASSWORD_REQUIREMENTS = `Use at least ${PASSWORD_MIN_LENGTH} characters. Spaces and passphrases are welcome.`;

export const PASSWORD_POLICY = {
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  requirements: PASSWORD_REQUIREMENTS,
} as const;

export interface PasswordContext {
  /** Rejected so a password is not a predictable copy of the login address. */
  email?: string;
  /** Optional display name, when the account already has one. */
  name?: string;
}

/**
 * Small, deliberately conservative blocklist. It catches the passwords real
 * attackers try first without pretending to be a full breach corpus; the
 * generic strength guidance and length floor do the rest.
 */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  'qwertyui',
  'qwerty123',
  'qwertyuiop',
  '1q2w3e4r',
  '1qaz2wsx',
  'zaq12wsx',
  'abc12345',
  'abcd1234',
  'letmein1',
  'letmein123',
  'welcome1',
  'welcome123',
  'admin123',
  'administrator',
  'iloveyou',
  'monkey12',
  'dragon12',
  'shadow12',
  'master12',
  'football',
  'baseball',
  'superman',
  'starwars',
  'sunshine',
  'princess',
  'trustno1',
  'whatever',
  'freedom1',
  'hello123',
  'travel123',
  'traveller',
  'traveler',
  'waytowalk',
]);

function normalizedIdentity(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Pure decision used by schemas, services and tests. Returns a user-facing
 * message, or `null` when the password may proceed.
 *
 * Callers that know the account context should pass `email`/`name`; the schema
 * layer runs the context-free checks so a request is rejected before any
 * database work.
 */
export function passwordProblem(
  password: unknown,
  context: PasswordContext = {}
): string | null {
  const value = String(password ?? '');

  if (value.trim().length === 0) return 'Enter a password.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  // A 64-character password with wide characters can still exceed bcrypt's
  // 72-byte window; reject rather than truncate silently.
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'That password is too long. Use fewer characters.';
  }

  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return 'That password is too easy to guess. Choose another one.';
  }

  const email = normalizedIdentity(context.email);
  if (email) {
    const localPart = email.split('@')[0] ?? '';
    if (lower === email || (localPart.length >= 4 && lower === localPart)) {
      return 'Choose a password that is not your email address.';
    }
  }

  const name = normalizedIdentity(context.name);
  if (name && name.length >= 3) {
    const compactName = name.replace(/\s+/g, '');
    if (lower.replace(/\s+/g, '') === compactName) {
      return 'Choose a password that is not your name.';
    }
  }

  return null;
}

/** Throws the same 400 shape every credential service already uses. */
export function assertPasswordPolicy(password: unknown, context: PasswordContext = {}): void {
  const problem = passwordProblem(password, context);
  if (problem) throw new AppError(problem, 400);
}

/**
 * Zod field shared by sign-up, reset, profile, agency and admin schemas. It
 * covers the context-free rules; services add email/name checks once the
 * account is loaded.
 */
export const newPasswordField = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) {
    ctx.addIssue({ code: 'custom', message: problem });
  }
});
