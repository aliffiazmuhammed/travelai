/**
 * Password-assisted chat-key backup — browser session state machine.
 *
 * The mobile app's `keyBackupSession.ts` is the canonical behavior: this is the
 * same state machine with cookie-authenticated HTTP and `localStorage` instead
 * of a Bearer token and SecureStore. The security rules are deliberately
 * identical:
 *
 * - metadata is validated against the signed-in user before use;
 * - the account key is never sent to the server;
 * - a changed generation is a hard stop, not a silent re-enrollment;
 * - backup rows are only overwritten with a row revision the server confirmed;
 * - a confirmed device key wins over a backup (backups cannot downgrade one).
 *
 * What differs is the honest storage limit: a browser has no SecureStore, so an
 * unlocked account key is kept in `localStorage` for the tab's account. That is
 * the same exposure the existing web chat identity already accepts (XSS can read
 * both), and it is why the UI never claims zero-knowledge recovery.
 */

import type {
  AccountBackupState,
  PasswordWrap,
  SealedKey,
  TripKeyBackup,
} from './chatKeyBackupCrypto';
import {
  createKeyBackupCrypto,
  decodeKey,
  encodeKey,
  validateAccountBackup,
  validateTripBackup,
} from './chatKeyBackupCrypto';
import type {
  KeyBackupEpochPage,
  KeyBackupMutation,
  KeyBackupRowsPage,
  KeyBackupTripsPage,
} from '@/services/api';

/** Everything the session needs from the account API. */
export interface ChatKeyBackupApi {
  metadata(): Promise<{ backup: AccountBackupState }>;
  enroll(input: KeyBackupMutation): Promise<{ backup: AccountBackupState }>;
  recover(input: KeyBackupMutation): Promise<{ backup: AccountBackupState }>;
  getKeyBackupTrips(afterTripId?: string): Promise<KeyBackupTripsPage>;
  getKeyBackupEpochs(tripId: string, beforeEpoch?: number): Promise<KeyBackupEpochPage>;
  getKeyBackupRows(tripId: string, beforeEpoch?: number): Promise<KeyBackupRowsPage>;
  putKeyBackup(
    tripId: string,
    epoch: number,
    input: { v: 1; generation: string; expectedRowRevision: number; iv: string; ct: string }
  ): Promise<{ backup: TripKeyBackup }>;
  changePassword(
    currentPassword: string,
    newPassword: string,
    backup?: { generation: string; expectedRevision: number; password: PasswordWrap }
  ): Promise<{ message: string; token?: string }>;
}

export type BackupStatus = 'idle' | 'loading' | 'disabled' | 'locked' | 'unlocking' | 'ready' | 'recoveryNeeded' | 'error';

export interface BackupSnapshot {
  sessionId?: number;
  userId: string | null;
  status: BackupStatus;
  metadata: AccountBackupState | null;
  error?: string;
}

export interface BackupDraft {
  sessionId: number;
  userId: string;
  generation: string;
  expectedRevision: number;
  key: Uint8Array;
  code: string;
}

interface Session {
  id: number;
  userId: string;
  api: ChatKeyBackupApi;
  key: Uint8Array | null;
  flow: number;
  rows: Map<string, TripKeyBackup>;
}

interface Dependencies {
  crypto: ReturnType<typeof createKeyBackupCrypto>;
  api: ChatKeyBackupApi;
  storage: {
    get(userId: string): Promise<string | null>;
    set(userId: string, value: string): Promise<void>;
    remove(userId: string): Promise<void>;
    clearLast?(): Promise<void>;
    select?(userId: string): Promise<void>;
  };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Chat backups are unavailable. Try again.';

export function createKeyBackupSession(deps: Dependencies) {
  let snapshot: BackupSnapshot = { userId: null, status: 'idle', metadata: null };
  let session: Session | null = null;
  let sequence = 0;
  let storageQueue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = (next: BackupSnapshot) => {
    snapshot = { ...next, sessionId: session?.id ?? sequence };
    for (const listener of listeners) listener();
  };
  const current = (captured: Session) => session === captured;
  const assertCurrent = (captured: Session) => {
    if (!current(captured)) throw new Error('The account changed. Open chat recovery again.');
  };
  const active = (userId?: string) => {
    if (!session || (userId && session.userId !== userId)) throw new Error('Sign in again to open chat backups.');
    return session;
  };
  const serializeStorage = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = storageQueue.catch(() => undefined).then(operation);
    storageQueue = result.catch(() => undefined);
    return result;
  };
  const persist = async (captured: Session, generation: string) => {
    await serializeStorage(async () => {
      if (!current(captured) || !captured.key) return;
      await deps.storage.set(captured.userId, JSON.stringify({ generation, key: encodeKey(captured.key) }));
    });
    assertCurrent(captured);
  };
  const acceptMetadata = (captured: Session, raw: unknown) => {
    assertCurrent(captured);
    const metadata = validateAccountBackup(raw, captured.userId);
    const previous = snapshot.metadata;
    if (previous && previous.revision > metadata.revision) return previous;
    if (previous?.enrolled && metadata.enrolled && previous.generation !== metadata.generation) {
      throw new Error('The backup identity changed. Sign in again before continuing.');
    }
    snapshot = { ...snapshot, metadata };
    return metadata;
  };
  const refreshMetadata = async (captured: Session) =>
    acceptMetadata(captured, (await captured.api.metadata()).backup);
  const adopt = async (captured: Session, raw: AccountBackupState, key: Uint8Array) => {
    const metadata = acceptMetadata(captured, raw);
    if (!metadata.enrolled) throw new Error('Enable chat backup first.');
    const copy = key.slice();
    captured.key?.fill(0);
    captured.key = copy;
    let error: string | undefined;
    try {
      await persist(captured, metadata.generation);
    } catch {
      assertCurrent(captured);
      error = 'Backup is unlocked for this session, but could not be saved in this browser.';
    }
    assertCurrent(captured);
    const latest = snapshot.metadata;
    emit({ userId: captured.userId, metadata: latest, status: latest?.enrolled && latest.password ? 'ready' : 'recoveryNeeded', error });
  };
  const end = async () => {
    const previous = session;
    session = null;
    sequence += 1;
    previous?.key?.fill(0);
    previous?.rows.clear();
    emit({ userId: null, status: 'idle', metadata: null });
    if (previous) await serializeStorage(() => deps.storage.remove(previous.userId));
    else if (deps.storage.clearLast) await serializeStorage(deps.storage.clearLast);
  };
  const load = async (captured: Session, password?: string) => {
    const flow = ++captured.flow;
    emit({ ...snapshot, status: password === undefined ? 'loading' : 'unlocking', error: undefined });
    let key: Uint8Array | undefined;
    let unlockFailed = false;
    try {
      const metadata = await refreshMetadata(captured);
      if (!current(captured) || flow !== captured.flow) return;
      if (!metadata.enrolled) {
        emit({ userId: captured.userId, metadata, status: 'disabled' });
        return;
      }
      if (password !== undefined && metadata.password) {
        try {
          key = await deps.crypto.unwrapPassword(captured.userId, metadata.generation, password, metadata.password);
        } catch (error) {
          unlockFailed = true;
          throw error;
        }
      } else if (captured.key) {
        key = captured.key.slice();
      } else {
        const stored = await serializeStorage(() => deps.storage.get(captured.userId));
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { generation?: string; key?: string };
            if (parsed.generation === metadata.generation && parsed.key) key = decodeKey(parsed.key, 32);
          } catch {
            await serializeStorage(() => deps.storage.remove(captured.userId));
          }
        }
      }
      if (!current(captured) || flow !== captured.flow) return;
      if (key) await adopt(captured, metadata, key);
      else emit({ userId: captured.userId, metadata, status: metadata.password ? 'locked' : 'recoveryNeeded' });
    } catch (error) {
      if (!current(captured) || flow !== captured.flow) return;
      emit({ ...snapshot, status: unlockFailed ? 'locked' : 'error', error: unlockFailed
        ? 'Chat backup could not be unlocked. Check your exact password, or use your recovery code.' : messageOf(error) });
    } finally {
      key?.fill(0);
      password = undefined;
    }
  };
  const begin = async (userId: string, password?: string) => {
    const cleanup = session ? end() : Promise.resolve();
    const ticket = ++sequence;
    // Storage housekeeping is best-effort: signing in and ordinary device-envelope
    // chat must not depend on account-key cleanup succeeding.
    await cleanup.catch(() => undefined);
    if (ticket !== sequence) return;
    await serializeStorage(async () => {
      if (ticket === sequence) await deps.storage.select?.(userId);
    }).catch(() => undefined);
    if (ticket !== sequence) return;
    const captured: Session = { id: ticket, userId, api: deps.api, key: null, flow: 0, rows: new Map() };
    session = captured;
    emit({ userId, status: 'loading', metadata: null });
    await load(captured, password);
  };
  const prepare = async (recoveryCode?: string): Promise<BackupDraft> => {
    const captured = active();
    const metadata = snapshot.metadata;
    if (!metadata) throw new Error('Check backup status before continuing.');
    let key: Uint8Array;
    if (metadata.enrolled) {
      if (!recoveryCode && captured.key) key = captured.key.slice();
      else {
        if (!recoveryCode) throw new Error('Enter your saved chat recovery code.');
        try {
          key = await deps.crypto.unwrapRecovery(captured.userId, metadata.generation, recoveryCode.trim(), metadata.recovery);
        } catch {
          throw new Error('That recovery code does not open this account’s backup. Check it and try again.');
        }
      }
    } else key = deps.crypto.generateAccountKey();
    return {
      sessionId: captured.id,
      userId: captured.userId,
      generation: metadata.enrolled ? metadata.generation : deps.crypto.generateGeneration(),
      expectedRevision: metadata.revision,
      key,
      code: deps.crypto.generateRecoveryCode(),
    };
  };
  const save = async (draft: BackupDraft, currentPassword: string) => {
    const captured = active(draft.userId);
    if (captured.id !== draft.sessionId) throw new Error('This recovery session ended. Start again.');
    const key = draft.key.slice();
    let code = draft.code;
    try {
      const password = await deps.crypto.wrapPassword(draft.userId, draft.generation, currentPassword, key);
      assertCurrent(captured);
      const recovery = await deps.crypto.wrapRecovery(draft.userId, draft.generation, code, key);
      const check = await deps.crypto.unwrapPassword(draft.userId, draft.generation, currentPassword, password);
      const recoveryCheck = await deps.crypto.unwrapRecovery(draft.userId, draft.generation, code, recovery);
      const verified = sameBytes(check, key) && sameBytes(recoveryCheck, key);
      check.fill(0);
      recoveryCheck.fill(0);
      if (!verified) throw new Error('The recovery key could not be verified. Nothing was changed.');
      assertCurrent(captured);
      const input: KeyBackupMutation = {
        v: 1,
        currentPassword,
        generation: draft.generation,
        expectedRevision: draft.expectedRevision,
        password,
        recovery,
      };
      let metadata: AccountBackupState;
      try {
        const response = draft.expectedRevision === 0
          ? await captured.api.enroll(input)
          : await captured.api.recover(input);
        metadata = response.backup;
      } catch (error) {
        assertCurrent(captured);
        const saved = await refreshMetadata(captured).catch(() => null);
        if (!saved?.enrolled || saved.generation !== draft.generation || saved.password?.ct !== password.ct || saved.password.iv !== password.iv || saved.password.salt !== password.salt || saved.recovery.ct !== recovery.ct || saved.recovery.iv !== recovery.iv) {
          if (statusOf(error) === 409) {
            draft.key.fill(0);
            draft.code = '';
            draft.sessionId = -1;
            if (draft.expectedRevision === 0 && saved?.enrolled && saved.password) {
              let winner: Uint8Array | undefined;
              try {
                winner = await deps.crypto.unwrapPassword(captured.userId, saved.generation, currentPassword, saved.password);
                await adopt(captured, saved, winner);
              } catch {
                assertCurrent(captured);
                emit({ ...snapshot, status: 'locked' });
              } finally {
                winner?.fill(0);
              }
            }
            throw new Error('Chat backup changed on another device. This displayed code was not activated; close and reopen recovery.');
          }
          throw error;
        }
        metadata = saved;
      } finally {
        input.currentPassword = '';
      }
      await adopt(captured, validateAccountBackup(metadata, captured.userId), key);
    } finally {
      key.fill(0);
      code = '';
      currentPassword = '';
    }
  };
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const captured = active();
    const metadata = await refreshMetadata(captured);
    let key: Uint8Array | undefined;
    let wrapper: PasswordWrap | undefined;
    try {
      if (metadata.enrolled) {
        if (!metadata.password) throw new Error('Restore chat backup with your recovery code before changing your password.');
        try {
          key = await deps.crypto.unwrapPassword(captured.userId, metadata.generation, currentPassword, metadata.password);
        } catch {
          throw new Error('Your chat backup needs its exact wrapping password or recovery code. Nothing was changed.');
        }
        wrapper = await deps.crypto.wrapPassword(captured.userId, metadata.generation, newPassword, key);
        const check = await deps.crypto.unwrapPassword(captured.userId, metadata.generation, newPassword, wrapper);
        const verified = sameBytes(check, key);
        check.fill(0);
        if (!verified) throw new Error('Could not verify the new password wrapper. Nothing was changed.');
      }
      assertCurrent(captured);
      const response = await captured.api.changePassword(currentPassword, newPassword,
        metadata.enrolled && wrapper ? { generation: metadata.generation, expectedRevision: metadata.revision, password: wrapper } : undefined);
      assertCurrent(captured);
      // The browser session is a cookie refreshed by the response, so there is
      // no token to replace here (unlike the native shell).
      if (metadata.enrolled && wrapper && key) {
        await adopt(captured, { ...metadata, revision: metadata.revision + 1, password: wrapper }, key);
      }
      return response.message;
    } finally {
      key?.fill(0);
      currentPassword = '';
      newPassword = '';
    }
  };
  const ready = (userId: string) => {
    const captured = active(userId);
    const metadata = snapshot.metadata;
    return metadata?.enrolled && captured.key && snapshot.status === 'ready' ? { captured, metadata, key: captured.key } : null;
  };
  const restoreTripKeys = async (userId: string, tripId: string) => {
    const context = ready(userId);
    const result = new Map<number, Uint8Array>();
    if (!context) return result;
    const { captured, metadata, key } = context;
    let before: number | undefined;
    try {
      do {
        const page = await captured.api.getKeyBackupRows(tripId, before);
        assertCurrent(captured);
        for (const raw of page.backups) {
          let row: TripKeyBackup;
          try {
            row = validateTripBackup(raw, userId, tripId);
            if (row.generation !== metadata.generation) continue;
            const opened = await deps.crypto.unwrapTrip(userId, metadata.generation, tripId, row.epoch, row, key);
            result.get(row.epoch)?.fill(0);
            result.set(row.epoch, opened);
            captured.rows.set(`${tripId}:${row.epoch}`, row);
          } catch {
            // One corrupt row must never discard keys that did authenticate.
            // A confirmed canonical key can repair it later via backupTripKey.
            continue;
          }
        }
        const next = page.nextBeforeEpoch;
        if (next === null) break;
        if (!Number.isSafeInteger(next) || next < 1 || (before !== undefined && next >= before)) throw new Error('Invalid chat backup page.');
        before = next;
      } while (current(captured));
      assertCurrent(captured);
      return result;
    } catch (error) {
      for (const value of result.values()) value.fill(0);
      throw error;
    }
  };
  /**
   * `repair` is the caller's assertion that `key` is device-confirmed canonical
   * for this epoch; only then may a differing/corrupt row be replaced, and only
   * with an observed row revision as the concurrency token.
   */
  const backupTripKey = async (userId: string, tripId: string, epoch: number, key: Uint8Array, repair = false) => {
    const context = ready(userId);
    if (!context) return;
    const { captured, metadata, key: accountKey } = context;
    const slot = `${tripId}:${epoch}`;
    const cached = captured.rows.get(slot);
    if (cached) {
      let matches = false;
      try {
        const opened = await deps.crypto.unwrapTrip(userId, metadata.generation, tripId, epoch, cached, accountKey);
        matches = sameBytes(opened, key);
        opened.fill(0);
      } catch { /* corrupt row */ }
      if (matches) return;
      if (!repair) throw new Error('A different key is already backed up for this chat epoch. Nothing was overwritten.');
      const wrapped = await deps.crypto.wrapTrip(userId, metadata.generation, tripId, epoch, key, accountKey);
      const response = await captured.api.putKeyBackup(tripId, epoch, {
        v: 1, generation: metadata.generation, expectedRowRevision: cached.rowRevision, ...wrapped,
      });
      assertCurrent(captured);
      captured.rows.set(slot, validateTripBackup(response.backup, userId, tripId));
      return;
    }
    const wrapped = await deps.crypto.wrapTrip(userId, metadata.generation, tripId, epoch, key, accountKey);
    try {
      const response = await captured.api.putKeyBackup(tripId, epoch, {
        v: 1, generation: metadata.generation, expectedRowRevision: 0, ...wrapped,
      });
      assertCurrent(captured);
      captured.rows.set(slot, validateTripBackup(response.backup, userId, tripId));
    } catch (error) {
      assertCurrent(captured);
      if (statusOf(error) !== 409) throw error;
      const page = await captured.api.getKeyBackupRows(tripId, epoch < 1_000_000_000 ? epoch + 1 : undefined);
      assertCurrent(captured);
      const raw = page.backups.find((row) => row.epoch === epoch);
      if (!raw) throw error;
      let row: TripKeyBackup;
      try {
        row = validateTripBackup(raw, userId, tripId);
      } catch {
        throw error;
      }
      let matches = false;
      try {
        const opened = await deps.crypto.unwrapTrip(userId, metadata.generation, tripId, epoch, row, accountKey);
        matches = sameBytes(opened, key);
        opened.fill(0);
      } catch { /* corrupt row */ }
      if (matches) { captured.rows.set(slot, row); return; }
      if (!repair) throw new Error('The saved chat key differs from this device. Nothing was overwritten.');
      const response = await captured.api.putKeyBackup(tripId, epoch, {
        v: 1, generation: metadata.generation, expectedRowRevision: row.rowRevision, ...wrapped,
      });
      assertCurrent(captured);
      captured.rows.set(slot, validateTripBackup(response.backup, userId, tripId));
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin,
    end,
    refresh: () => load(active()),
    unlock: (password: string) => load(active(), password),
    prepare,
    save,
    changePassword,
    restoreTripKeys,
    backupTripKey,
    async getTrips(userId: string, afterTripId?: string) {
      const captured = active(userId);
      const page = await captured.api.getKeyBackupTrips(afterTripId);
      assertCurrent(captured);
      return page;
    },
    async getEpochs(userId: string, tripId: string, before?: number) {
      const captured = active(userId);
      const page = await captured.api.getKeyBackupEpochs(tripId, before);
      assertCurrent(captured);
      return page;
    },
  };
}
