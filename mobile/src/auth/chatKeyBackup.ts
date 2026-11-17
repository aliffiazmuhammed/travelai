import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createChatKeyBackupApi } from '@/api/chatKeyBackup';
import { createKeyBackupCrypto } from '@/lib/chatKeyBackupCrypto';
import { createKeyBackupSession } from '@/lib/keyBackupSession';
import { replaceSessionToken } from './tokenStorage';

const storageKey = (userId: string) => `waytowalk.chat.backup.${userId}.v1`;
const lastAccountKey = 'waytowalk.chat.backup.last-account';

export const keyBackup = createKeyBackupSession({
  crypto: createKeyBackupCrypto((length) => getRandomValues(new Uint8Array(length))),
  api: createChatKeyBackupApi,
  storage: {
    get: (userId) => Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(storageKey(userId)),
    async set(userId, value) {
      if (Platform.OS === 'web') return;
      await SecureStore.setItemAsync(lastAccountKey, userId);
      await SecureStore.setItemAsync(storageKey(userId), value);
    },
    async remove(userId) {
      if (Platform.OS === 'web') return;
      await SecureStore.deleteItemAsync(storageKey(userId));
      if (await SecureStore.getItemAsync(lastAccountKey) === userId) await SecureStore.deleteItemAsync(lastAccountKey);
    },
    async select(userId) {
      if (Platform.OS === 'web') return;
      const previous = await SecureStore.getItemAsync(lastAccountKey);
      if (previous && previous !== userId) {
        await SecureStore.deleteItemAsync(storageKey(previous));
        await SecureStore.deleteItemAsync(lastAccountKey);
      }
    },
    async clearLast() {
      if (Platform.OS === 'web') return;
      const userId = await SecureStore.getItemAsync(lastAccountKey);
      if (userId) await SecureStore.deleteItemAsync(storageKey(userId));
      await SecureStore.deleteItemAsync(lastAccountKey);
    },
  },
  replaceToken: replaceSessionToken,
});
