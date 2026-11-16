import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { bytesToBase64, createChatCrypto, type ChatIdentity } from '@/lib/chatCrypto';

/** One chat crypto instance for the whole app; randomness comes from the OS. */
export const chatCrypto = createChatCrypto((length) => Crypto.getRandomBytes(length));

/**
 * Chat identities are per account, not per device: the web client's one-key-
 * per-browser rule would otherwise link two accounts signed in here. The
 * private half stays in the keychain/keystore (localStorage on the web
 * preview), exactly like the session token.
 */
const webStorage = {
  getItemAsync: async (key: string) =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  setItemAsync: async (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
};

const storage = Platform.OS === 'web' ? webStorage : SecureStore;

function identityKey(userId: string): string {
  return `waytowalk.chat.identity.${userId}.v1`;
}

const identityPromises = new Map<string, Promise<ChatIdentity>>();

/** Loads this account's device key, minting the first one and storing it. */
export function ensureChatIdentity(userId: string): Promise<ChatIdentity> {
  const cached = identityPromises.get(userId);
  if (cached) return cached;

  const promise = (async () => {
    const raw = await storage.getItemAsync(identityKey(userId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { v?: number; sk?: string; pub?: string };
        if (parsed?.sk && parsed?.pub) {
          return chatCrypto.identityFromStored(parsed.sk, parsed.pub);
        }
      } catch {
        // Corrupt storage behaves like "no identity yet": mint a fresh device
        // key and let the trip's healing flow unlock it.
      }
    }
    const identity = chatCrypto.mintIdentity();
    await storage.setItemAsync(
      identityKey(userId),
      JSON.stringify({
        v: 1,
        sk: bytesToBase64(identity.secretKey),
        pub: identity.pubKey,
      })
    );
    return identity;
  })().catch((error) => {
    identityPromises.delete(userId);
    throw error;
  });

  identityPromises.set(userId, promise);
  return promise;
}
