import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import {
  cachedMemberKeys,
  encryptMessage,
  decryptMessage,
  ensureIdentity,
  exportBackupCode as chatExportBackupCode,
  generateConversationKey,
  importBackupCode,
  mergeMemberKeys,
  unwrapMyEnvelope,
  wrapEnvelope,
} from '@/lib/chatCrypto';
import type { MemberKeyMap } from '@/lib/chatCrypto';

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
  /** True when this row is ciphertext per its flag (independent of state). */
  isEncrypted: (row: { e2ee?: boolean }) => boolean;
  /** Render text for a row: plaintext rows verbatim; ciphertext rows cached. */
  plaintextOf: (row: { _id: string; body: string; e2ee?: boolean }) => string;
  /** Kicks a decrypt pass for rows that changed (mount/frames/edits). */
  syncRows: (rows: { _id: string; body?: string; e2ee?: boolean }[]) => void;
  /** Remembers just-written plaintext so own bubbles never blink to 🔒. */
  rememberPlaintext: (rowId: string, plaintext: string) => void;
  /** Encrypts an outgoing message; falls back to plaintext when unusable. */
  encryptOutgoing: (
    plaintext: string
  ) => Promise<{ body: string; e2ee: boolean }>;
  /** Key backup code (null = nothing to export yet). */
  exportBackupCode: () => Promise<string | null>;
  /** Imports a backup code; re-runs the key flow with the restored identity. */
  importBackupCode: (code: string) => Promise<void>;
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

  const runKeyFlow = useCallback(async () => {
    if (!tripId) return;
    setStatus('starting');
    setError(undefined);

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
      const livePubs: MemberKeyMap = {};
      for (const member of state.members || []) {
        if (member.pubKey) livePubs[member.userId] = member.pubKey;
      }
      mergeMemberKeys(tripId, livePubs);
      const cachedPubs = cachedMemberKeys(tripId);

      if (!state.epoch) {
        // Nobody has minted a conversation key yet: bootstrap epoch 1 and
        // envelope EVERY member that already has a published public key.
        // Members we cannot wrap for are self-healed by later holders.
        setStatus('bootstrap');
        if (!currentUserId) throw new Error('Missing the current user id for key bootstrapping.');
        const conversationKey = await generateConversationKey();
        const envelopes: Record<string, string> = {};
        for (const member of state.members || []) {
          if (member.pubKey) {
            try {
              envelopes[member.userId] = await wrapEnvelope(
                currentUserId, // the wrapper id: recipients derive against MY pub
                identity,
                member.pubKey,
                conversationKey
              );
            } catch {
              /* one member failing to wrap never blocks the rest */
            }
          }
        }
        if (!envelopes[currentUserId]) {
          throw new Error('Could not wrap the chat key for yourself — try reopening.');
        }
        await api.putTripChatKeys(tripId, 1, envelopes);
        convKeyRef.current = conversationKey;
        setStatus('ready');
        return;
      }

      if (state.mine) {
        convKeyRef.current = await unwrapMyEnvelope(
          state.mine,
          identity,
          livePubs,
          cachedPubs
        );
        setStatus('ready');
        return;
      }

      setStatus('keyless');
    } catch (err: any) {
      markError(err?.message || 'Chat encryption is unavailable right now.');
    }
  }, [tripId, currentUserId, markError]);

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
      if (status === 'ready' && convKeyRef.current) {
        try {
          return { body: await encryptMessage(convKeyRef.current, plaintext), e2ee: true };
        } catch {
          return { body: plaintext, e2ee: false };
        }
      }
      return { body: plaintext, e2ee: false };
    },
    [status]
  );

  const rememberPlaintext = useCallback((rowId: string, plaintext: string) => {
    plainCacheRef.current.set(rowId, plaintext);
    setTick((t) => t + 1);
  }, []);

  /* -------------------------------- backup UI ------------------------------ */

  const exportCode = useCallback((): Promise<string | null> => chatExportBackupCode(), []);

  const importCode = useCallback(
    async (code: string) => {
      await importBackupCode(code);
      // Restored: the same pubKey ⇒ the same envelopes still open. Re-run.
      convKeyRef.current = null;
      plainCacheRef.current.clear();
      await runKeyFlow();
    },
    [runKeyFlow]
  );

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
    isEncrypted,
    plaintextOf,
    syncRows,
    rememberPlaintext,
    encryptOutgoing,
    exportBackupCode: exportCode,
    importBackupCode: importCode,
  };
}
