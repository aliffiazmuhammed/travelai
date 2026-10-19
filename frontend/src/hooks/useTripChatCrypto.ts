import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import {
  cachedMemberKeys,
  encryptMessage,
  decryptMessage,
  ensureIdentity,
  generateConversationKey,
  memberDeviceKeysOf,
  mergeMemberKeys,
  slotIsUsable,
  unwrapMyEnvelope,
  wrapEnvelope,
} from '@/lib/chatCrypto';
import type { ChatIdentity, MemberKeyMap, MemberKeyMapMulti } from '@/lib/chatCrypto';
import type { ChatKeysState } from '@/types/trip';

/**
 * The per-trip E2EE session (Milestone 7, F10 — frontend half).
 *
 * Owns the whole key biography for one trip while the chat is mounted:
 * identity publish → keys fetch → bootstrap (nobody has a key yet) OR unwrap
 * (I hold an envelope) OR keyless (epoch exists but not for me yet) → the
 * live decrypt pass that turns ciphertext comments/decisions into plaintext.
 *
 * Deliberately SEPARATE from `useTripComments`: the discussion hub keeps its
 * rows verbatim (exactly what the server sent); this hook is the translator
 * layer on top. Consumers render `plaintextOf(row)` and encrypt outgoing text
 * through `encryptOutgoing`, so bubble UI never touches ivs or keys.
 *
 * States:
 * - 'off'       crypto unavailable (no WebCrypto) → plaintext chat, honestly
 *               labeled by the UI.
 * - 'starting'  identity + keys in flight.
 * - 'ready'     conversation key unwrapped; bodies flow.
 * - 'bootstrap' this member is minting epoch-1 (wraps to every member).
 * - 'keyless'   epoch exists but my envelope is missing; any member's open
 *               client self-heals it (full history) — the UI says so.
 * - 'error'     surfaced message; outgoing falls back to plaintext.
 */

export type ChatCryptoStatus =
  | 'off'
  | 'starting'
  | 'bootstrap'
  | 'ready'
  | 'keyless'
  | 'error';

export interface ChatCryptoApi {
  status: ChatCryptoStatus;
  error?: string;
  /**
   * Only meaningful while `keyless`:
   * - 'missing'  no envelope for this account exists yet (awaiting a share),
   * - 'mismatch' an envelope exists but was wrapped to ANOTHER device's key —
   *              the ordinary "second browser" case. It needs no user action:
   *              any member whose client holds the key re-wraps this device's
   *              slot within seconds (the F10e healing rule).
   */
  keylessReason?: 'missing' | 'mismatch';
  /** True when this row is ciphertext per its flag (independent of state). */
  isEncrypted: (row: { e2ee?: boolean }) => boolean;
  /** Render text for a row: plaintext rows verbatim; ciphertext rows cached. */
  plaintextOf: (row: { _id: string; body: string; e2ee?: boolean }) => string;
  /** Kicks a decrypt pass for rows that changed (mount/frames/edits). */
  syncRows: (rows: { _id: string; body?: string; e2ee?: boolean }[]) => void;
  /** Remembers just-written plaintext so own bubbles never blink to 🔒. */
  rememberPlaintext: (rowId: string, plaintext: string) => void;
  /**
   * Encrypts an outgoing message. Falls back to (disclosed) plaintext ONLY when
   * this device has no usable key; while the composer says the chat is
   * encrypted it throws instead of downgrading — never leak silently.
   */
  encryptOutgoing: (
    plaintext: string
  ) => Promise<{ body: string; e2ee: boolean }>;
  /** Re-runs the key flow in place (the fallback banner's Retry action). */
  retry: () => void;
}

/** Empty render value while a ciphertext row is not (yet) readable. */
const PLACEHOLDER = '';

export function useTripChatCrypto(
  tripId: string | undefined,
  currentUserId: string | undefined,
  enabled: boolean
): ChatCryptoApi {
  const [status, setStatus] = useState<ChatCryptoStatus>('starting');
  const [error, setError] = useState<string | undefined>(undefined);
  const [keylessReason, setKeylessReason] = useState<'missing' | 'mismatch' | undefined>(undefined);
  const [, setTick] = useState(0); // bump after decrypt batches land

  const convKeyRef = useRef<CryptoKey | null>(null);
  const plainCacheRef = useRef<Map<string, string>>(new Map());
  const decryptingRef = useRef<Set<string>>(new Set());

  const markError = useCallback((message: string) => {
    console.error('chatCrypto:', message);
    setError(message);
    setStatus('error');
  }, []);

  /* ------------------------------ key biography ----------------------------- */

  /** userId → every published device key (the wrapper may be any of them). */
  const devicePubsOf = (state: ChatKeysState): MemberKeyMapMulti => {
    const map: MemberKeyMapMulti = {};
    for (const member of state.members || []) {
      const keys = memberDeviceKeysOf(member);
      if (keys.length) map[member.userId] = keys;
    }
    return map;
  };

  /** userId → newest key (the shape `mergeMemberKeys`/legacy lookups use). */
  const livePubsOf = (state: ChatKeysState): MemberKeyMap => {
    const map: MemberKeyMap = {};
    for (const member of state.members || []) {
      const newest = member.pubKey || member.pubKeys?.[0];
      if (newest) map[member.userId] = newest;
    }
    return map;
  };

  /** Every envelope addressed to this account (any device), legacy shape included. */
  const mineCandidates = (state: ChatKeysState): string[] =>
    state.mineAll?.length ? state.mineAll : state.mine ? [state.mine] : [];

  /**
   * Tries to open MY envelopes with THIS browser's identity, one per device of
   * this account (the server hands all of them over; only the slot wrapped to
   * THIS device's key can be opened). No slot opening at all is NOT an error:
   * it is either "no key for this account yet" or "wrapped for another device"
   * — both `keyless`, healed by another open client or the backup code.
   */
  const adoptEnvelope = useCallback(
    async (
      identity: ChatIdentity,
      candidates: string[],
      livePubs: MemberKeyMap,
      cachedPubs: MemberKeyMap,
      devicePubs: MemberKeyMapMulti
    ): Promise<boolean> => {
      if (!candidates.length) {
        setKeylessReason('missing');
        setStatus('keyless');
        return false;
      }
      let lastError: unknown = null;
      let sawWrapperGap = false;
      for (const envelope of candidates) {
        try {
          convKeyRef.current = await unwrapMyEnvelope(
            envelope,
            identity,
            livePubs,
            cachedPubs,
            devicePubs
          );
          setKeylessReason(undefined);
          setStatus('ready');
          return true;
        } catch (err) {
          lastError = err;
          if (/wrapper/i.test(String((err as any)?.message || ''))) sawWrapperGap = true;
        }
      }
      console.warn('chatCrypto: this device cannot open any envelope for the account', lastError);
      // A missing wrapper pubkey (the member who wrapped it left the trip and
      // we have no cache) is a RE-SHARE wait, not a wrong-device key.
      setKeylessReason(sawWrapperGap ? 'missing' : 'mismatch');
      setStatus('keyless');
      return false;
    },
    []
  );

  /**
   * F10d self-heal: a client that HOLDS the conversation key wraps it for every
   * device slot that is still empty — a second browser of this account, or a
   * member who joined after the epoch was minted. Idempotent: only gaps are
   * sent, and the server merges them into the current epoch.
   *
   * F10e: "empty" is now "not provably openable". A filled slot whose wrapper
   * has left the trip, whose blob was overwritten with rubbish, or which was
   * written for a key nobody publishes any more used to be skipped FOREVER —
   * the recipient waited for a re-share that could never come (`healSlots` was
   * the only re-share there is). Such a slot is now re-wrapped, which makes it
   * usable again; `slotIsUsable` documents exactly when a slot is left alone.
   */
  const healSlots = useCallback(
    async (identity: ChatIdentity, state: ChatKeysState) => {
      if (!tripId || !currentUserId || !convKeyRef.current) return;
      const liveDeviceKeys = new Set<string>();
      const memberIds = new Set<string>();
      for (const member of state.members || []) {
        memberIds.add(member.userId);
        for (const key of memberDeviceKeysOf(member)) liveDeviceKeys.add(key);
      }

      const pending: Record<string, string> = {};
      let wanted = 0;
      let failed = 0;
      for (const member of state.members || []) {
        for (const pub of memberDeviceKeysOf(member)) {
          // An older server sends no slot metadata: keep the pre-F10e rule
          // (any envelope counts) rather than re-wrapping the whole roster.
          const known = member.slots
            ? member.slots.some((slot) => slot.pub === pub)
            : (member.envelopedPubKeys || []).includes(pub);
          const usable = member.slots
            ? slotIsUsable(member.slots.find((slot) => slot.pub === pub), liveDeviceKeys, memberIds)
            : true;
          if (known && usable) continue;
          wanted += 1;
          try {
            pending[pub] = await wrapEnvelope(currentUserId, identity, pub, convKeyRef.current);
          } catch {
            failed += 1; // one device failing to wrap never blocks the rest
          }
        }
      }
      if (!Object.keys(pending).length) {
        if (wanted && failed === wanted) {
          // Every attempt failed. Say so ONCE: this exact silence is what hid
          // the F10e defect (a non-extractable key cannot be re-wrapped) for a
          // whole release — nobody could tell healing apart from no work to do.
          console.warn(
            `chatCrypto: could not re-share the chat key for ${wanted} device slot(s)`
          );
        }
        return;
      }
      try {
        await api.addTripChatEnvelopes(tripId, pending);
      } catch {
        /* the poll retries */
      }
    },
    [tripId, currentUserId]
  );

  const runKeyFlow = useCallback(async () => {
    if (!tripId) return;
    setStatus('starting');
    setError(undefined);
    setKeylessReason(undefined);

    try {
      const identity = await ensureIdentity();
      if (!identity) {
        setStatus('off');
        return;
      }
      if (currentUserId) {
        // Deterministic publish (ensureIdentity retries silently, but a fresh
        // bootstrap needs EVERY envelope — including our own — to exist).
        await api.setMyChatKey(identity.pubKey).catch(() => undefined);
      }

      const state = await api.getTripChatKeys(tripId);
      const livePubs = livePubsOf(state);
      const devicePubs = devicePubsOf(state);
      mergeMemberKeys(tripId, livePubs);
      const cachedPubs = cachedMemberKeys(tripId);

      if (!state.epoch) {
        // Nobody has minted a conversation key yet: bootstrap epoch 1 and
        // envelope EVERY published device key of EVERY member (F10d: one slot
        // per browser). Members we cannot wrap for are self-healed later.
        setStatus('bootstrap');
        if (!currentUserId) throw new Error('Missing the current user id for key bootstrapping.');
        const conversationKey = await generateConversationKey();
        const envelopes: Record<string, string> = {};
        for (const member of state.members || []) {
          for (const pub of memberDeviceKeysOf(member)) {
            try {
              envelopes[pub] = await wrapEnvelope(
                currentUserId, // the wrapper id: recipients derive against MY pub
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
          throw new Error('Could not wrap the chat key for yourself — try reopening.');
        }
        try {
          await api.putTripChatKeys(tripId, 1, envelopes);
        } catch (err: any) {
          // Bootstrap race: another member minted epoch 1 a beat before us and
          // the unique (trip, epoch) index kept THEIR write. Their envelopes
          // covered us too (our pubKey was published just before the fetch),
          // so we recover as an ordinary keyholder: unwrap and move on.
          if (err?.status !== 409) throw err;
          const fresh = await api.getTripChatKeys(tripId);
          const opened = await adoptEnvelope(
            identity,
            mineCandidates(fresh),
            livePubsOf(fresh),
            cachedPubs,
            devicePubsOf(fresh)
          );
          if (opened) await healSlots(identity, fresh);
          return;
        }
        convKeyRef.current = conversationKey;
        setStatus('ready');
        await healSlots(identity, state);
        return;
      }

      const opened = await adoptEnvelope(
        identity,
        mineCandidates(state),
        livePubs,
        cachedPubs,
        devicePubs
      );
      if (opened) await healSlots(identity, state);
    } catch (err: any) {
      // Capture the real cause for the diagnostics tooltip — thrown strings
      // and exotic rejections used to fall through to the generic message,
      // which made field reports like "why did this happen?" unanswerable.
      const message =
        err?.message || (typeof err === 'string' && err) || String(err) || 'Chat encryption is unavailable right now.';
      markError(message);
    }
  }, [tripId, currentUserId, markError, adoptEnvelope, healSlots]);

  /** Re-runs the whole key flow in place — the banner's Retry medicine. */
  const retry = useCallback(() => {
    void runKeyFlow();
  }, [runKeyFlow]);

  /**
   * Quiet re-check (never flickers through 'starting'): while keyless it tries
   * to open my envelopes; while ready it heals slots that appeared since (a
   * second browser of this account, or a fresh member) so the OTHER device
   * unlocks itself without any user action.
   */
  const refreshKey = useCallback(async () => {
    if (!tripId) return;
    try {
      const identity = await ensureIdentity();
      if (!identity) return;
      const state = await api.getTripChatKeys(tripId);
      if (!state.epoch) return;
      const livePubs = livePubsOf(state);
      mergeMemberKeys(tripId, livePubs);
      if (convKeyRef.current) {
        await healSlots(identity, state);
        return;
      }
      const opened = await adoptEnvelope(
        identity,
        mineCandidates(state),
        livePubs,
        cachedMemberKeys(tripId),
        devicePubsOf(state)
      );
      if (opened) await healSlots(identity, state);
    } catch {
      /* the next poll retries */
    }
  }, [tripId, adoptEnvelope, healSlots]);

  useEffect(() => {
    if (!enabled || !tripId) return;
    // Fast when locked (waiting for a share), slow when ready (slot healing).
    const delay = status === 'keyless' ? 6000 : status === 'ready' ? 15000 : 0;
    if (!delay) return;
    const tick = () => void refreshKey();
    const timer = window.setInterval(tick, delay);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [enabled, tripId, status, refreshKey]);

  useEffect(() => {
    if (!enabled || !tripId) return;
    void runKeyFlow();
  }, [enabled, tripId, runKeyFlow]);

  /* ------------------------------ decrypt pass ----------------------------- */

  const decryptBatch = useCallback(
    async (rows: { _id: string; body?: string; e2ee?: boolean }[]) => {
      const key = convKeyRef.current;
      if (!key) return;
      let changed = false;
      await Promise.all(
        rows.map(async (row) => {
          if (
            !row?.e2ee ||
            plainCacheRef.current.has(row._id) ||
            decryptingRef.current.has(row._id)
          ) {
            return;
          }
          decryptingRef.current.add(row._id);
          try {
            const plain = await decryptMessage(key, String(row.body || ''));
            plainCacheRef.current.set(row._id, plain);
            changed = true;
          } catch {
            /* undecryptable (rotation epoch, corrupt body): stays as 🔒 */
          } finally {
            decryptingRef.current.delete(row._id);
          }
        })
      );
      if (changed) setTick((t) => t + 1);
    },
    []
  );

  const syncRows = useCallback(
    (rows: { _id: string; body?: string; e2ee?: boolean }[]) => {
      if (status !== 'ready') return;
      void decryptBatch(rows);
    },
    [status, decryptBatch]
  );

  /* -------------------------------- write path ----------------------------- */

  const encryptOutgoing = useCallback(
    async (plaintext: string): Promise<{ body: string; e2ee: boolean }> => {
      if (status !== 'ready' || !convKeyRef.current) {
        // No usable key on this device: the composer says so in plain words
        // ("Messages you send here aren't protected yet"), and the row is
        // flagged so every reader can tell. Deliberate, disclosed plaintext.
        return { body: plaintext, e2ee: false };
      }
      try {
        return { body: await encryptMessage(convKeyRef.current, plaintext), e2ee: true };
      } catch {
        // NEVER silently downgrade. While the composer promises encryption, a
        // failed encryption must fail the SEND, not leak the words in the clear
        // with an `e2ee: false` flag nobody looks at (F10e).
        throw new Error('This message could not be encrypted — nothing was sent. Please try again.');
      }
    },
    [status]
  );

  const rememberPlaintext = useCallback((rowId: string, plaintext: string) => {
    plainCacheRef.current.set(rowId, plaintext);
    setTick((t) => t + 1);
  }, []);

  /* --------------------------------- reads --------------------------------- */

  const isEncrypted = useCallback((row: { e2ee?: boolean }) => Boolean(row?.e2ee), []);

  const plaintextOf = useCallback(
    (row: { _id: string; body: string; e2ee?: boolean }) => {
      if (!row?.e2ee) return row?.body || '';
      return plainCacheRef.current.get(row._id) ?? PLACEHOLDER;
    },
    []
  );

  return {
    status,
    error,
    keylessReason,
    isEncrypted,
    plaintextOf,
    syncRows,
    rememberPlaintext,
    encryptOutgoing,
    retry,
  };
}
