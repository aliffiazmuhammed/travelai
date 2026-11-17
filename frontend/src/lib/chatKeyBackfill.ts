/**
 * Web history migration for password-assisted chat backup.
 *
 * Phones could only back up the trips they had opened. The browser can do
 * better: it already has a device identity that may still open historical
 * envelopes, so this pass walks the personal trip list and the epoch pages and
 * uploads every key THIS browser can actually read. It never invents a key and
 * never overwrites a confirmed row:
 *
 * - a key opened from this identity's own envelope is canonical, so it may
 *   repair a stale/corrupt backup row through its revision;
 * - an epoch without a readable envelope is counted as unavailable, not guessed;
 * - progress is resumable by trip cursor and stops immediately if the account
 *   session or backup unlock changes.
 *
 * The honest limit stays visible in the UI: history whose only readable device
 * is gone cannot be recovered, and local-only plaintext rows are not exported.
 */

import {
  ensureIdentity,
  memberDeviceKeysOf,
  unwrapMyEnvelope,
} from '@/lib/chatCrypto';
import { exportConversationKey } from '@/lib/chatCryptoCore';
import { keyBackup } from './chatKeyBackup';

export interface BackfillProgress {
  trips: number;
  saved: number;
  alreadySaved: number;
  unavailable: number;
  failedTrips: number;
  afterTripId?: string;
  finished: boolean;
}

export async function backUpReadableHistory(
  userId: string,
  progress: BackfillProgress,
  isActive: () => boolean,
  onProgress: (next: BackfillProgress) => void,
): Promise<BackfillProgress> {
  const sessionId = keyBackup.getSnapshot().sessionId;
  const assertActive = () => {
    const snapshot = keyBackup.getSnapshot();
    if (!isActive() || snapshot.userId !== userId || snapshot.sessionId !== sessionId || snapshot.status !== 'ready') {
      throw new Error('History backup paused. Unlock this account’s backup to continue.');
    }
  };
  assertActive();
  const identity = await ensureIdentity('personal');
  assertActive();
  if (!identity) throw new Error('Secure chat is unavailable in this browser.');

  let result = { ...progress, finished: false };
  for (;;) {
    const page = await keyBackup.getTrips(userId, result.afterTripId);
    assertActive();
    if (!Array.isArray(page.trips) || page.trips.length > 25) throw new Error('Invalid trip backup page.');
    for (const trip of page.trips) {
      assertActive();
      let backedUp = new Map<number, Uint8Array>();
      try {
        backedUp = await keyBackup.restoreTripKeys(userId, trip.tripId);
        assertActive();
        let before: number | undefined;
        for (;;) {
          const epochs = await keyBackup.getEpochs(userId, trip.tripId, before);
          assertActive();
          if (epochs.epochs.length > 25) throw new Error('Invalid history page.');
          for (const state of epochs.epochs) {
            assertActive();
            if (!Number.isSafeInteger(state.epoch) || !state.epoch || state.epoch < 1) throw new Error('Invalid chat epoch.');
            if (backedUp.has(state.epoch)) {
              result.alreadySaved += 1;
              continue;
            }
            const publicKeys = Object.fromEntries(
              state.members.filter((member) => member.pubKey).map((member) => [member.userId, member.pubKey!])
            );
            const deviceKeys = Object.fromEntries(
              state.members.map((member) => [member.userId, memberDeviceKeysOf(member)])
            );
            let key: CryptoKey | undefined;
            for (const envelope of new Set([state.mine, ...(state.mineAll ?? [])].filter((value): value is string => Boolean(value)))) {
              try {
                key = await unwrapMyEnvelope(envelope, identity, publicKeys, {}, deviceKeys);
                break;
              } catch {
                continue;
              }
            }
            if (!key) result.unavailable += 1;
            else {
              let raw: Uint8Array | undefined;
              try {
                raw = await exportConversationKey(key);
                // Opened from this identity's own envelope: a confirmed canonical key.
                await keyBackup.backupTripKey(userId, trip.tripId, state.epoch, raw, true);
                assertActive();
                result.saved += 1;
              } finally {
                raw?.fill(0);
              }
            }
          }
          const next = epochs.nextBeforeEpoch;
          if (next === null) break;
          if (!Number.isSafeInteger(next) || next < 1 || (before !== undefined && next >= before)) throw new Error('Invalid history cursor.');
          before = next;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        assertActive();
        if ((error as { status?: number })?.status !== 404) throw error;
        result.failedTrips += 1;
      } finally {
        for (const key of backedUp.values()) key.fill(0);
      }
      result.trips += 1;
      result.afterTripId = trip.tripId;
      onProgress({ ...result });
    }
    const next = page.nextAfterTripId;
    if (next === null) {
      result = { ...result, finished: true };
      onProgress(result);
      return result;
    }
    if (!/^[a-f0-9]{24}$/.test(next) || (progress.afterTripId && next <= progress.afterTripId)) throw new Error('Invalid trip backup cursor.');
    result.afterTripId = next;
    progress = { ...result };
    onProgress(progress);
  }
}
