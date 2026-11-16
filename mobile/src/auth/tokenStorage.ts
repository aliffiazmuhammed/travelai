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

export function getSessionToken(): Promise<string | null> {
  return storage.getItemAsync(TOKEN_KEY);
}

export function setSessionToken(token: string): Promise<void> {
  return storage.setItemAsync(TOKEN_KEY, token);
}

export function clearSessionToken(): Promise<void> {
  return storage.deleteItemAsync(TOKEN_KEY);
}
