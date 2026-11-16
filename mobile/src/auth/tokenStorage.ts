import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'waytowalk.session-token';

export function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function setSessionToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearSessionToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
