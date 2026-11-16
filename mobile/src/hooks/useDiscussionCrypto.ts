import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/api/client';
import {
  addChatEnvelopes,
  fetchChatKeys,
  publishChatKey,
  putChatKeys,
  type ChatKeysState,
} from '@/api/discussion';
import { chatCrypto, ensureChatIdentity } from '@/auth/chatIdentity';
import {
  memberDeviceKeysOf,
  slotIsUsable,
  type ChatIdentity,
  type MemberKeyMap,
  type MemberKeyMapMulti,
} from '@/lib/chatCrypto';

/**
 * The per-trip E2EE session for the mobile discussion, mirroring
 * `frontend/src/hooks/useTripChatCrypto.ts`.
 *
 * It owns the whole key biography while the screen is open: publish this
 * device's public key → fetch keys → bootstrap epoch 1 (nobody has a key yet)
 * or unwrap my envelope or stay keyless → heal missing device slots → decrypt
 * rows. The screen renders `plaintextOf(row)` and seals outgoing text through
 * `encryptOutgoing` / `sealJson`, so the bubbles never touch a key.
 */

export type ChatCryptoStatus = 'off' | 'starting' | 'bootstrap' | 'ready' | 'keyless' | 'error';

export interface DiscussionCrypto {
  status: ChatCryptoStatus;
  error?: string;
  /**
   * Only meaningful while `keyless`:
   * - 'missing' — no envelope for this account yet (awaiting a share),
   * - 'mismatch' — an envelope exists for another device of this account; any
   *   member whose client holds the key re-wraps this device's slot shortly.
   */
  keylessReason?: 'missing' | 'mismatch';
  isEncrypted: (row: { e2ee?: boolean }) => boolean;
  plaintextOf: (row: { _id: string; body: string; e2ee?: boolean }) => string;
  syncRows: (rows: { _id: string; body?: string; e2ee?: boolean }[]) => void;
  rememberPlaintext: (row: { _id: string; body: string }, plaintext: string) => void;
  /** Falls back to disclosed plaintext only when this device has no key. */
  encryptOutgoing: (plaintext: string) => Promise<{ body: string; e2ee: boolean }>;
  sealJson: (value: unknown) => Promise<string | null>;
  openJson: <T>(body: string) => Promise<T | null>;
  retry: () => void;
}

interface CryptoSnapshot {
  status: ChatCryptoStatus;
  error?: string;
  keylessReason?: 'missing' | 'mismatch';
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Chat encryption is unavailable right now.';
}

function devicePubsOf(state: ChatKeysState): MemberKeyMapMulti {
  const map: MemberKeyMapMulti = {};
  for (const member of state.members || []) {
    const keys = memberDeviceKeysOf(member);
    if (keys.length) map[member.userId] = keys;
  }
  return map;
}

function livePubsOf(state: ChatKeysState): MemberKeyMap {
  const map: MemberKeyMap = {};
  for (const member of state.members || []) {
    const newest = member.pubKey || member.pubKeys?.[0];
    if (newest) map[member.userId] = newest;
  }
  return map;
}

function mineCandidates(state: ChatKeysState): string[] {
  return state.mineAll?.length ? state.mineAll : state.mine ? [state.mine] : [];
}

function sameKey(a: Uint8Array | null, b: Uint8Array): boolean {
  return Boolean(a && a.length === b.length && a.every((value, index) => value === b[index]));
}

function cacheKeyOf(row: { _id: string; body?: string }): string {
  return `${row._id}:${row.body ?? ''}`;
}

export function useDiscussionCrypto(
  tripId: string | undefined,
  userId: string | undefined,
  enabled: boolean
): DiscussionCrypto {
  const [snapshot, setSnapshot] = useState<CryptoSnapshot>({ status: 'starting' });
  const [, bump] = useReducer((value: number) => value + 1, 0);

  const conversationKeyRef = useRef<Uint8Array | null>(null);
  const cachedMemberPubsRef = useRef<MemberKeyMap>({});
  const plainCacheRef = useRef<Map<string, string>>(new Map());
  const decryptingRef = useRef<Set<string>>(new Set());

  const adoptKey = useCallback((key: Uint8Array) => {
    if (!sameKey(conversationKeyRef.current, key)) {
      // A rotation means rows cached under the old key are stale by definition.
      plainCacheRef.current.clear();
    }
    conversationKeyRef.current = key;
  }, []);

  const adoptEnvelope = useCallback(
    (identity: ChatIdentity, state: ChatKeysState, attemptedKeyless = true): boolean => {
      const candidates = mineCandidates(state);
      if (!candidates.length) {
        if (attemptedKeyless) setSnapshot({ status: 'keyless', keylessReason: 'missing' });
        return false;
      }
      let lastError: unknown = null;
      let sawWrapperGap = false;
      for (const envelope of candidates) {
        try {
          const key = chatCrypto.unwrapConversationKey(
            envelope,
            identity,
            livePubsOf(state),
            cachedMemberPubsRef.current,
            devicePubsOf(state)
          );
          adoptKey(key);
          setSnapshot({ status: 'ready' });
          return true;
        } catch (error) {
          lastError = error;
          if (/wrapper/i.test(messageOf(error))) sawWrapperGap = true;
        }
      }
      console.warn('chatCrypto: this device cannot open any envelope for the account', lastError);
      setSnapshot({
        status: 'keyless',
        keylessReason: sawWrapperGap ? 'missing' : 'mismatch',
      });
      return false;
    },
    [adoptKey]
  );

  /** Re-wraps the conversation key for every device slot that cannot be opened. */
  const healSlots = useCallback(
    async (identity: ChatIdentity, state: ChatKeysState) => {
      const conversationKey = conversationKeyRef.current;
      if (!tripId || !userId || !conversationKey) return;

      const liveDeviceKeys = new Set<string>();
      const memberIds = new Set<string>();
      for (const member of state.members || []) {
        memberIds.add(member.userId);
        for (const key of memberDeviceKeysOf(member)) liveDeviceKeys.add(key);
      }

      const pending: Record<string, string> = {};
      for (const member of state.members || []) {
        for (const pub of memberDeviceKeysOf(member)) {
          const known = member.slots
            ? member.slots.some((slot) => slot.pub === pub)
            : (member.envelopedPubKeys || []).includes(pub);
          const usable = member.slots
            ? slotIsUsable(
                member.slots.find((slot) => slot.pub === pub),
                liveDeviceKeys,
                memberIds
              )
            : true;
          if (known && usable) continue;
          try {
            pending[pub] = chatCrypto.wrapConversationKey(
              userId,
              identity,
              pub,
              conversationKey
            );
          } catch {
            /* one device failing to wrap never blocks the rest */
          }
        }
      }
      if (!Object.keys(pending).length) return;
      try {
        await addChatEnvelopes(tripId, pending);
      } catch {
        /* the refresh poll retries */
      }
    },
    [tripId, userId]
  );

  const runKeyFlow = useCallback(async () => {
    if (!tripId || !userId) return;

    try {
      const identity = await ensureChatIdentity(userId);
      // Idempotent, and heals a server-side wipe of this device key.
      await publishChatKey(identity.pubKey).catch(() => undefined);

      const state = await fetchChatKeys(tripId);
      const livePubs = livePubsOf(state);
      cachedMemberPubsRef.current = { ...cachedMemberPubsRef.current, ...livePubs };

      if (!state.epoch) {
        // Nobody has minted a conversation key yet: bootstrap epoch 1 and
        // envelope every published device key of every member.
        setSnapshot({ status: 'bootstrap' });
        const conversationKey = chatCrypto.generateConversationKey();
        const envelopes: Record<string, string> = {};
        for (const member of state.members || []) {
          for (const pub of memberDeviceKeysOf(member)) {
            try {
              envelopes[pub] = chatCrypto.wrapConversationKey(
                userId,
                identity,
                pub,
                conversationKey
              );
            } catch {
              /* one member failing to wrap never blocks the rest */
            }
          }
        }
        if (!envelopes[identity.pubKey]) {
          throw new Error('Could not wrap the chat key for this device — try reopening.');
        }
        try {
          await putChatKeys(tripId, 1, envelopes);
        } catch (error) {
          // Bootstrap race: another member minted epoch 1 a beat before us.
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          const fresh = await fetchChatKeys(tripId);
          if (adoptEnvelope(identity, fresh)) await healSlots(identity, fresh);
          return;
        }
        adoptKey(conversationKey);
        setSnapshot({ status: 'ready' });
        await healSlots(identity, state);
        return;
      }

      if (adoptEnvelope(identity, state)) await healSlots(identity, state);
    } catch (error) {
      setSnapshot({ status: 'error', error: messageOf(error) });
    }
  }, [tripId, userId, adoptEnvelope, adoptKey, healSlots]);

  /** Quiet re-check: no 'starting' flicker while waiting for a share/heal. */
  const refreshKey = useCallback(async () => {
    if (!tripId || !userId) return;
    try {
      const identity = await ensureChatIdentity(userId);
      const state = await fetchChatKeys(tripId);
      if (!state.epoch) return;
      const livePubs = livePubsOf(state);
      cachedMemberPubsRef.current = { ...cachedMemberPubsRef.current, ...livePubs };
      if (conversationKeyRef.current) {
        await healSlots(identity, state);
        return;
      }
      if (adoptEnvelope(identity, state)) await healSlots(identity, state);
    } catch {
      /* the next poll retries */
    }
  }, [tripId, userId, adoptEnvelope, healSlots]);

  useEffect(() => {
    if (!enabled || !tripId || !userId) return;
    // Kick the flow off just after the commit: it publishes this device key,
    // fetches the trip keys and adopts one, and the first state update should
    // not land inside the effect body itself.
    const timer = setTimeout(() => void runKeyFlow(), 0);
    return () => clearTimeout(timer);
  }, [enabled, tripId, userId, runKeyFlow]);

  useEffect(() => {
    if (!enabled || !tripId) return;
    const delay = snapshot.status === 'keyless' ? 6000 : snapshot.status === 'ready' ? 15000 : 0;
    if (!delay) return;
    const timer = setInterval(() => void refreshKey(), delay);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshKey();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled, tripId, snapshot.status, refreshKey]);

  const decryptBatch = useCallback(
    (rows: { _id: string; body?: string; e2ee?: boolean }[]) => {
      const key = conversationKeyRef.current;
      if (!key) return;
      let changed = false;
      for (const row of rows) {
        if (!row?.e2ee) continue;
        const cacheKey = cacheKeyOf(row);
        if (plainCacheRef.current.has(cacheKey) || decryptingRef.current.has(cacheKey)) continue;
        decryptingRef.current.add(cacheKey);
        try {
          plainCacheRef.current.set(cacheKey, chatCrypto.decryptText(key, String(row.body || '')));
          changed = true;
        } catch {
          /* undecryptable (rotation, corrupt body): stays sealed */
        } finally {
          decryptingRef.current.delete(cacheKey);
        }
      }
      if (changed) bump();
    },
    []
  );

  const syncRows = useCallback(
    (rows: { _id: string; body?: string; e2ee?: boolean }[]) => {
      if (snapshot.status !== 'ready') return;
      decryptBatch(rows);
    },
    [snapshot.status, decryptBatch]
  );

  const encryptOutgoing = useCallback(
    async (plaintext: string): Promise<{ body: string; e2ee: boolean }> => {
      const key = conversationKeyRef.current;
      if (snapshot.status !== 'ready' || !key) {
        // No usable key on this device: the composer says so in plain words,
        // and the row carries the flag so every reader can tell.
        return { body: plaintext, e2ee: false };
      }
      try {
        return { body: chatCrypto.encryptText(key, plaintext), e2ee: true };
      } catch {
        // Never silently downgrade while the composer promises sealing.
        throw new Error(
          'This message could not be sealed — nothing was sent. Please try again.'
        );
      }
    },
    [snapshot.status]
  );

  const rememberPlaintext = useCallback(
    (row: { _id: string; body: string }, plaintext: string) => {
      plainCacheRef.current.set(cacheKeyOf(row), plaintext);
      bump();
    },
    []
  );

  const plaintextOf = useCallback(
    (row: { _id: string; body: string; e2ee?: boolean }) => {
      if (!row?.e2ee) return row?.body || '';
      return plainCacheRef.current.get(cacheKeyOf(row)) ?? '';
    },
    []
  );

  const isEncrypted = useCallback((row: { e2ee?: boolean }) => Boolean(row?.e2ee), []);

  const sealJson = useCallback(async (value: unknown): Promise<string | null> => {
    const key = conversationKeyRef.current;
    if (!key) return null;
    try {
      return chatCrypto.encryptJson(key, value);
    } catch {
      return null;
    }
  }, []);

  const openJson = useCallback(async <T,>(body: string): Promise<T | null> => {
    const key = conversationKeyRef.current;
    if (!key || !body) return null;
    try {
      return chatCrypto.decryptJson<T>(key, body);
    } catch {
      return null;
    }
  }, []);

  return {
    status: snapshot.status,
    error: snapshot.error,
    keylessReason: snapshot.keylessReason,
    isEncrypted,
    plaintextOf,
    syncRows,
    rememberPlaintext,
    encryptOutgoing,
    sealJson,
    openJson,
    retry: () => {
      setSnapshot({ status: 'starting' });
      void runKeyFlow();
    },
  };
}
