/**
 * Per-browser memory for assistant proposal cards (F12e follow-up).
 *
 * A bot row is immutable ciphertext, so "I already applied this" and "not now"
 * have nowhere to live on the server. Keeping them in component state made the
 * card prompt again every time the chat drawer was closed. This module stores
 * the two sets per trip × user in localStorage: applied stays applied, a
 * dismissed card stops nagging, and both survive a reload.
 *
 * Deliberately tiny and fail-safe: private mode / quota errors degrade to the
 * old per-visit behaviour instead of breaking the chat.
 */

const KEY_PREFIX = "ww:assistant-card-state:";
const MAX_IDS = 200;

export interface AssistantCardMemory {
  applied: Set<string>;
  dismissed: Set<string>;
}

export function assistantCardStateKey(tripId: string, userId?: string): string {
  return `${KEY_PREFIX}${tripId}:${userId || "anon"}`;
}

const idSet = (value: unknown): Set<string> =>
  new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : []
  );

export function loadAssistantCardMemory(key: string): AssistantCardMemory {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as
      | { applied?: unknown; dismissed?: unknown }
      | null;
    return { applied: idSet(parsed?.applied), dismissed: idSet(parsed?.dismissed) };
  } catch {
    return { applied: new Set(), dismissed: new Set() };
  }
}

export function saveAssistantCardMemory(
  key: string,
  applied: Set<string>,
  dismissed: Set<string>
): void {
  try {
    const newest = (ids: Set<string>) => Array.from(ids).slice(-MAX_IDS);
    window.localStorage.setItem(
      key,
      JSON.stringify({ applied: newest(applied), dismissed: newest(dismissed) })
    );
  } catch {
    /* storage unavailable — stay honest and keep per-visit behaviour */
  }
}
