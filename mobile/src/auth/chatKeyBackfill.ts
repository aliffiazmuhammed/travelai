import { chatCrypto, ensureChatIdentity } from '@/auth/chatIdentity';
import { keyBackup } from '@/auth/chatKeyBackup';
import { memberDeviceKeysOf } from '@/lib/chatCrypto';

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
  const identity = await ensureChatIdentity(userId);
  assertActive();
  let result = { ...progress, finished: false };
  do {
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
        do {
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
            const publicKeys = Object.fromEntries(state.members.filter((member) => member.pubKey).map((member) => [member.userId, member.pubKey!]));
            const deviceKeys = Object.fromEntries(state.members.map((member) => [member.userId, memberDeviceKeysOf(member)]));
            let key: Uint8Array | undefined;
            for (const envelope of new Set([state.mine, ...(state.mineAll ?? [])].filter((value): value is string => Boolean(value)))) {
              try {
                key = chatCrypto.unwrapConversationKey(envelope, identity, publicKeys, {}, deviceKeys);
                break;
              } catch {
                continue;
              }
            }
            if (!key) result.unavailable += 1;
            else {
              try {
                // Opened from this identity's own envelope: a confirmed canonical key.
                await keyBackup.backupTripKey(userId, trip.tripId, state.epoch, key, true);
                assertActive();
                result.saved += 1;
              } finally {
                key.fill(0);
              }
            }
          }
          const next = epochs.nextBeforeEpoch;
          if (next === null) break;
          if (!Number.isSafeInteger(next) || next < 1 || (before !== undefined && next >= before)) throw new Error('Invalid history cursor.');
          before = next;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } while (true);
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
  } while (true);
}
