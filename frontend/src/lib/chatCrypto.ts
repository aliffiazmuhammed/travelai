/**
 * Browser-side end-to-end chat crypto (Milestone 7, F10) — the identity shell.
 *
 * The primitives (ECDH identity, envelope wrap/unwrap, message AES-GCM, backup
 * codes, the per-trip key cache) live in `./chatCryptoCore`, which is
 * deliberately dependency-free so the repo's probes can execute the very code
 * the browser bundles. What lives *here* is the only piece that needs the
 * network: publishing this device's public half (`api.setMyChatKey`).
 *
 * Everything is re-exported, so `@/lib/chatCrypto` stays the one import path
 * the rest of the app uses. The header of `chatCryptoCore.ts` carries the
 * server-sees-nothing contract and its honest limits (§12.13).
 */

import { api } from '@/services/api';
import {
  adoptBackupCode,
  isCryptoAvailable,
  loadStoredIdentity,
  mintAndStoreIdentity,
  storedBackupCode,
  type ChatIdentity,
} from './chatCryptoCore';

export * from './chatCryptoCore';

/** One per browser: the loaded identity (kept so export/import can reach it). */
let identityPromise: Promise<ChatIdentity> | null = null;

/**
 * The module's identity: loaded from storage or minted once, and ALWAYS
 * (re-)published — publishing is idempotent for the same key and heals a
 * server-side wipe without user interaction.
 */
export async function ensureIdentity(): Promise<ChatIdentity | null> {
  if (!isCryptoAvailable()) return null;
  if (!identityPromise) {
    identityPromise = (async () => {
      const stored = await loadStoredIdentity();
      const identity = stored ?? (await mintAndStoreIdentity());
      try {
        await api.setMyChatKey(identity.pubKey);
      } catch {
        /* publication retries on the next chat open; envelopes only need it */
      }
      return identity;
    })().catch(() => {
      identityPromise = null;
      throw new Error('chat identity bootstrap failed');
    });
  }
  return identityPromise;
}

/**
 * Exports the current identity as a one-time backup code. Returns null when
 * no identity exists yet in this browser.
 */
export async function exportBackupCode(): Promise<string | null> {
  const identity = await ensureIdentity();
  if (!identity) return null;
  return storedBackupCode();
}

/**
 * Replaces this browser's identity with the one in a backup code. The private
 * key arrives (verified against the public half it claims — F10e); the public
 * half is re-published so the existing envelopes keep opening. Throws on any
 * malformed or mismatched code; consumers show the error.
 */
export async function importBackupCode(code: string): Promise<ChatIdentity> {
  const identity = await adoptBackupCode(code);
  // REPLACE the module memo too: it is captured for the tab's lifetime and
  // would otherwise keep handing out the freshly minted (wrong) identity, so
  // the key flow re-ran after an import still failed until a full reload.
  identityPromise = Promise.resolve(identity);
  try {
    await api.setMyChatKey(identity.pubKey);
  } catch {
    /* re-publish on next open */
  }
  return identity;
}
