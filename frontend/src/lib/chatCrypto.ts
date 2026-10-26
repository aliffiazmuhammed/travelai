/**
 * Browser-side end-to-end chat crypto (Milestone 7, F10) — the identity shell.
 *
 * The primitives (ECDH identity, envelope wrap/unwrap, message AES-GCM, the
 * per-trip key cache) live in `./chatCryptoCore`, which is deliberately
 * dependency-free so the repo's probes can execute the very code the browser
 * bundles. What lives *here* is the only piece that needs the network:
 * publishing this device's public half (`api.setMyChatKey`).
 *
 * Everything is re-exported, so `@/lib/chatCrypto` stays the one import path
 * the rest of the app uses. The header of `chatCryptoCore.ts` carries the
 * server-sees-nothing contract and its honest limits (§12.13).
 *
 * There is NO export/import of the private half: a device is unlocked by
 * another member's open client re-wrapping the trip key for it (§12.9, §12.14),
 * never by the user copying anything.
 */

import { api } from '@/services/api';
import {
  isCryptoAvailable,
  loadStoredIdentity,
  mintAndStoreIdentity,
  type ChatIdentity,
} from './chatCryptoCore';

export * from './chatCryptoCore';

/** PA0 realms publish device keys through their own auth endpoint. */
export type ChatRealm = 'personal' | 'agency';

/** One per storage scope: the loaded identity for this tab's lifetime. */
const identityPromises = new Map<string, Promise<ChatIdentity | null>>();

/** Publishes this device's public half through the caller's realm. */
export function publishChatKey(
  pubKey: string,
  realm: ChatRealm = 'personal'
): Promise<{ success: boolean }> {
  return realm === 'agency'
    ? api.setAgencyChatKey(pubKey)
    : api.setMyChatKey(pubKey);
}

/**
 * The module's identity: loaded from storage or minted once, and ALWAYS
 * (re-)published — publishing is idempotent for the same key and heals a
 * server-side wipe without user interaction. A fresh identity (cleared storage,
 * another browser) simply publishes a new device key; the trip key reaches it
 * through the normal healing flow, same as any second device.
 *
 * PA0: agency identities are stored under a tenant-scoped key and published to
 * `/api/agency/auth/chat-key`. A browser signed into personal and agency
 * accounts therefore holds two unrelated device keys.
 */
export async function ensureIdentity(
  realm: ChatRealm = 'personal',
  scope?: string
): Promise<ChatIdentity | null> {
  if (!isCryptoAvailable()) return null;

  const storageScope = realm === 'agency' ? scope ?? 'agency' : undefined;
  const cacheKey = storageScope ?? 'personal';

  let promise = identityPromises.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const stored = await loadStoredIdentity(storageScope);
      const identity = stored ?? (await mintAndStoreIdentity(storageScope));
      try {
        await publishChatKey(identity.pubKey, realm);
      } catch {
        /* publication retries on the next chat open; envelopes only need it */
      }
      return identity;
    })().catch(() => {
      identityPromises.delete(cacheKey);
      throw new Error('chat identity bootstrap failed');
    });
    identityPromises.set(cacheKey, promise);
  }
  return promise;
}
