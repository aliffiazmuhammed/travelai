/**
 * Avatar helpers (Milestone 7, F14).
 *
 * Every surface that shows a person (chat bubbles, the member list, the live
 * roster, the navbar chip) uses the same fallback rule, so a member without a
 * photo reads consistently everywhere: the first two characters of the label.
 */

/** Two-character initials used when there is no photo (or it fails to load). */
export const initialsFor = (label: string): string =>
  (label || "T").trim().slice(0, 2).toUpperCase();

/**
 * A safe `src` for an `<img>`: only URLs this app manages are rendered.
 * The server already refuses to store foreign URLs; this is the client-side
 * belt to that suspenders (a tampered response must not become an image fetch
 * to an arbitrary origin).
 */
export const avatarSrc = (url?: string | null): string | undefined => {
  const value = String(url ?? "").trim();
  if (!value) return undefined;
  if (value.startsWith("/uploads/")) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    if (!parsed.hostname.endsWith("res.cloudinary.com")) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};
