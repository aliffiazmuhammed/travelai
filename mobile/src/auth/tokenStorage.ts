import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'waytowalk.session-token';

/**
 * SecureStore has no web implementation, so the browser preview falls back to
 * localStorage. Only the native targets get the keychain/keystore.
 */
const webStorage = {
  getItemAsync: async (key: string) =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  setItemAsync: async (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

const storage = Platform.OS === 'web' ? webStorage : SecureStore;

let writes: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.catch(() => undefined).then(operation);
  writes = result.catch(() => undefined);
  return result;
}

export async function getSessionToken(): Promise<string | null> {
  await writes;
  return storage.getItemAsync(TOKEN_KEY);
}

export function setSessionToken(token: string, isCurrent: () => boolean): Promise<boolean> {
  return serialize(async () => {
    if (!isCurrent()) return false;
    await storage.setItemAsync(TOKEN_KEY, token);
    return isCurrent();
  });
}

export function clearSessionToken(): Promise<void> {
  return serialize(() => storage.deleteItemAsync(TOKEN_KEY));
}

export function replaceSessionToken(previous: string, next: string): Promise<boolean> {
  return serialize(async () => {
    if (await storage.getItemAsync(TOKEN_KEY) !== previous) return false;
    await storage.setItemAsync(TOKEN_KEY, next);
    return true;
  });
}
