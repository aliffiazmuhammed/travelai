import { apiRequest } from './client';
import type { ChatKeysState } from './discussion';
import type { AccountBackupState, PasswordWrap, SealedKey, TripKeyBackup } from '../lib/chatKeyBackupCrypto';

export interface BackupMutation {
  v: 1;
  currentPassword: string;
  generation: string;
  expectedRevision: number;
  password: PasswordWrap;
  recovery: SealedKey;
}

export interface EpochPage {
  currentEpoch: number | null;
  epochs: ChatKeysState[];
  nextBeforeEpoch: number | null;
}

export function createChatKeyBackupApi(token: string) {
  const request = <T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) =>
    apiRequest<T>(path, {
      method,
      body,
      auth: false,
      handleUnauthorized: method !== 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  const page = (before?: number) => `?limit=25${before === undefined ? '' : `&beforeEpoch=${before}`}`;
  const tripPath = (id: string) => `/auth/key-backup/trips/${encodeURIComponent(id)}`;

  return {
    async metadata(): Promise<AccountBackupState> {
      return (await request<{ backup: AccountBackupState }>('/auth/key-backup')).backup;
    },
    async enroll(input: BackupMutation): Promise<AccountBackupState> {
      return (await request<{ backup: AccountBackupState }>('/auth/key-backup', 'POST', input)).backup;
    },
    async recover(input: BackupMutation): Promise<AccountBackupState> {
      return (await request<{ backup: AccountBackupState }>('/auth/key-backup/recover', 'POST', input)).backup;
    },
    trips: (afterTripId?: string) => request<{ trips: { tripId: string; title: string }[]; nextAfterTripId: string | null }>(
      `/auth/key-backup/trips?limit=25${afterTripId ? `&afterTripId=${encodeURIComponent(afterTripId)}` : ''}`,
    ),
    epochs: (tripId: string, before?: number) =>
      request<EpochPage>(`${tripPath(tripId)}/epochs${page(before)}`),
    backups: (tripId: string, before?: number) =>
      request<{ backups: TripKeyBackup[]; nextBeforeEpoch: number | null }>(`${tripPath(tripId)}/backups${page(before)}`),
    async putBackup(tripId: string, epoch: number, generation: string, sealed: SealedKey, expectedRowRevision: number) {
      return (await request<{ backup: TripKeyBackup }>(`${tripPath(tripId)}/backups/${epoch}`, 'PUT', {
        v: 1, generation, expectedRowRevision, ...sealed,
      })).backup;
    },
    changePassword: (currentPassword: string, newPassword: string, backup?: {
      generation: string; expectedRevision: number; password: PasswordWrap;
    }) => request<{ token?: string; message?: string }>('/auth/password', 'POST', {
      currentPassword, newPassword, ...(backup ? { backup } : {}),
    }),
  };
}

export type ChatKeyBackupApi = ReturnType<typeof createChatKeyBackupApi>;
