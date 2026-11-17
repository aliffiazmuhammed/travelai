/**
 * The browser's single chat-key backup session (M7 chat recovery, web).
 *
 * One module-level instance mirrors `mobile/src/auth/chatKeyBackup.ts`: the
 * session state machine is shared by the account shelf, the chat hook and the
 * history migration, so all three agree on who is unlocked.
 *
 * Storage note: the web has no SecureStore. An unlocked account key is written
 * to `localStorage` under an account-scoped key, exactly like the existing web
 * chat identity. It is removed on sign-out, account switch and backup teardown.
 * The UI states the residual XSS exposure rather than implying device-grade
 * secrecy.
 */

import { api } from '@/services/api';
import { createKeyBackupCrypto } from './chatKeyBackupCrypto';
import { createKeyBackupSession, type ChatKeyBackupApi } from './keyBackupSession';

const storageKey = (userId: string) => `waytowalk.chat.backup.${userId}.v1`;
const lastAccountKey = 'waytowalk.chat.backup.last-account';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  // Let quota/privacy failures reach the session so it can tell the user the
  // backup is unlocked for this session but not remembered in this browser.
  localStorage.setItem(key, value);
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* a locked-down browser simply has nothing to clear */
  }
}

const backupApi: ChatKeyBackupApi = {
  metadata: () => api.getKeyBackup(),
  enroll: (input) => api.enrollKeyBackup(input),
  recover: (input) => api.recoverKeyBackup(input),
  getKeyBackupTrips: (afterTripId) => api.getKeyBackupTrips(afterTripId),
  getKeyBackupEpochs: (tripId, before) => api.getKeyBackupEpochs(tripId, before),
  getKeyBackupRows: (tripId, before) => api.getKeyBackupRows(tripId, before),
  putKeyBackup: (tripId, epoch, input) => api.putKeyBackup(tripId, epoch, input),
  changePassword: (currentPassword, newPassword, backup) =>
    api.changePassword(currentPassword, newPassword, backup),
};

export const keyBackup = createKeyBackupSession({
  crypto: createKeyBackupCrypto((length) => crypto.getRandomValues(new Uint8Array(length))),
  api: backupApi,
  storage: {
    get: (userId) => Promise.resolve(read(storageKey(userId))),
    async set(userId, value) {
      write(lastAccountKey, userId);
      write(storageKey(userId), value);
    },
    async remove(userId) {
      drop(storageKey(userId));
      if (read(lastAccountKey) === userId) drop(lastAccountKey);
    },
    async select(userId) {
      const previous = read(lastAccountKey);
      if (previous && previous !== userId) {
        drop(storageKey(previous));
        drop(lastAccountKey);
      }
    },
    async clearLast() {
      const userId = read(lastAccountKey);
      if (userId) drop(storageKey(userId));
      drop(lastAccountKey);
    },
  },
});
