/**
 * Pure recovery-state helpers shared by the reset and invite pages (C-08).
 *
 * Kept free of React and the API client so the two decisions that matter can be
 * unit-tested without a browser: whether a failed preflight means "this link is
 * dead" or "we could not ask", and whether an email-bound invite belongs to the
 * signed-in account.
 */

export type ResetLinkState = "checking" | "ready" | "invalid" | "retry";

/**
 * `400` is the server's authoritative "this link is not usable" (missing,
 * used, expired, or belonging to a closed account). Everything else — offline,
 * a 5xx, throttling — is transient: we must not tell someone their link has
 * expired when we simply could not check it.
 */
export function resetLinkFailureState(status: number | undefined): "invalid" | "retry" {
  return status === 400 ? "invalid" : "retry";
}

/**
 * Email-bound invites only match the signed-in account's own address. Emails
 * are case-insensitive, and the server stores them lowercased, so compare the
 * trimmed, lowercased forms rather than raw strings.
 */
export function inviteAccountMismatch(
  emailBoundTo?: string | null,
  viewerEmail?: string | null
): boolean {
  const invited = String(emailBoundTo ?? "").trim().toLowerCase();
  const viewer = String(viewerEmail ?? "").trim().toLowerCase();
  if (!invited || !viewer) return false;
  return invited !== viewer;
}

const RESET_EMAIL_KEY = "waytowalk.reset-email";

/**
 * The reset form has no email field, so password managers need the address
 * that asked for the link. Remembering it for the session lets the reset page
 * offer a hidden `username` field and keep save/update working.
 */
export function rememberResetEmail(email: string): void {
  try {
    window.sessionStorage.setItem(RESET_EMAIL_KEY, email.trim());
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function readRememberedResetEmail(): string {
  try {
    return window.sessionStorage.getItem(RESET_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetRememberedResetEmail(): void {
  try {
    window.sessionStorage.removeItem(RESET_EMAIL_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
