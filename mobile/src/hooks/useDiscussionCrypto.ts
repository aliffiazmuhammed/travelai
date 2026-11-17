import { useEffect, useMemo, useReducer, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/api/client';
import {
  addChatEnvelopes,
  fetchChatKeys,
  publishChatKey,
  putChatKeys,
  type ChatKeysState,
} from '@/api/discussion';
import { chatCrypto, ensureChatIdentity } from '@/auth/chatIdentity';
import { keyBackup } from '@/auth/chatKeyBackup';
import { getSessionToken } from '@/auth/tokenStorage';
import { decodeUtf8 } from '@/lib/utf8';
import {
  base64ToBytes,
  memberDeviceKeysOf,
  slotIsUsable,
  type ChatIdentity,
  type MemberKeyMap,
  type MemberKeyMapMulti,
} from '@/lib/chatCrypto';

export type ChatCryptoStatus = 'off' | 'starting' | 'bootstrap' | 'restoring' | 'ready' | 'keyless' | 'error';
type BackupStatus = ReturnType<typeof keyBackup.getSnapshot>['status'];
type ChatRow = { _id: string; body?: string; e2ee?: boolean };

export interface DiscussionCrypto {
  status: ChatCryptoStatus;
  error?: string;
  backupError?: string;
  backupStatus: BackupStatus;
  keyRevision: number;
  canSend: boolean;
  isCurrent: () => boolean;
  captureSession: () => Promise<{ sessionToken: string; check: () => Promise<void> }>;
  keylessReason?: 'missing' | 'mismatch';
  isEncrypted: (row: { e2ee?: boolean }) => boolean;
  plaintextOf: (row: { _id: string; body: string; e2ee?: boolean }) => string;
  syncRows: (rows: { _id: string; body?: string; e2ee?: boolean }[]) => void;
  rememberPlaintext: (row: { _id: string; body: string }, plaintext: string) => void;
  /** Plaintext is permitted only when encryption is explicitly off. */
  encryptOutgoing: (plaintext: string) => Promise<{ body: string; e2ee: boolean }>;
  sealJson: (value: unknown) => Promise<string | null>;
  openJson: <T>(body: string, rowId?: string) => Promise<T | null>;
  retry: () => void;
}

function devicePubsOf(state: ChatKeysState): MemberKeyMapMulti {
  const map: MemberKeyMapMulti = {};
  for (const member of state.members || []) {
    const keys = memberDeviceKeysOf(member);
    if (keys.length) map[member.userId] = keys;
  }
  return map;
}

function livePubsOf(state: ChatKeysState): MemberKeyMap {
  const map: MemberKeyMap = {};
  for (const member of state.members || []) {
    const newest = member.pubKey || member.pubKeys?.[0];
    if (newest) map[member.userId] = newest;
  }
  return map;
}

function mineCandidates(state: ChatKeysState): string[] {
  return state.mineAll?.length ? state.mineAll : state.mine ? [state.mine] : [];
}

function sameKey(a: Uint8Array | undefined, b: Uint8Array): boolean {
  return Boolean(a && a.length === b.length && a.every((value, index) => value === b[index]));
}

function cacheKeyOf(row: { _id: string; body?: string }): string {
  return JSON.stringify([row._id, row.body ?? '']);
}

// Only binds the captured Bearer to the expected account; signature validation
// remains server-side. Never publish A's device identity under B's Bearer.
function tokenBelongsTo(token: string, userId: string): boolean {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(decodeUtf8(base64ToBytes(part.padEnd(Math.ceil(part.length / 4) * 4, '='))));
    return claims.userId === userId && (!claims.realm || claims.realm === 'personal');
  } catch { return false; }
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const SESSION_CHANGED = 'The account session changed. Check again before sending.';
const SEND_LOCKED = 'Sending is paused until this phone can confirm and open the current trip key.';
const BACKUP_FAILED = 'Some readable history could not be backed up. Your chat keys are still available; check again to retry.';

/** Mutable material belongs to one mounted account/trip, never a global cache. */
class TripCryptoSession {
  active = false;
  generation = 0;
  status: ChatCryptoStatus = 'starting';
  error?: string;
  backupError?: string;
  keylessReason?: 'missing' | 'mismatch';
  keyRevision = 0;
  private token: string | null = null;
  private currentEpoch: number | null = null;
  private sawEncryptedRows = false;
  private keys = new Map<number, Uint8Array>();
  private confirmed = new Set<number>();
  private uploaded = new Set<number>();
  private pubs: MemberKeyMap = {};
  private plain = new Map<string, string>();
  private failed = new Map<string, number>();
  private opening = new Map<string, Promise<string | null>>();
  private flow: Promise<void> | null = null;
  private historyBusy = false;
  private beforeEpoch?: number;
  private historyDone = false;
  private restored = false;
  private restoreFlow: Promise<void> | null = null;

  constructor(readonly tripId: string, readonly userId: string, private notify: () => void) {}

  isCurrent = () => this.active && keyBackup.getSnapshot().userId === this.userId;

  private assert(generation: number) {
    if (!this.isCurrent() || generation !== this.generation) throw new Error(SESSION_CHANGED);
  }

  start() {
    this.active = true;
    this.status = 'starting';
  }

  stop() {
    this.active = false;
    this.generation += 1;
    for (const key of this.keys.values()) key.fill(0);
    this.keys.clear();
    this.confirmed.clear();
    this.uploaded.clear();
    this.plain.clear();
    this.failed.clear();
    this.opening.clear();
    this.pubs = {};
    this.token = null;
    this.currentEpoch = null;
    this.sawEncryptedRows = false;
    this.flow = null;
    this.historyBusy = false;
    this.beforeEpoch = undefined;
    this.historyDone = false;
    this.restored = false;
    this.restoreFlow = null;
    this.error = undefined;
    this.backupError = undefined;
    this.keyRevision += 1;
  }

  captureSession = async () => {
    const generation = this.generation;
    this.assert(generation);
    const sessionToken = await getSessionToken();
    this.assert(generation);
    if (!sessionToken || !tokenBelongsTo(sessionToken, this.userId) || (this.token && this.token !== sessionToken)) {
      this.stop();
      this.status = 'error';
      this.error = SESSION_CHANGED;
      this.notify();
      throw new Error(SESSION_CHANGED);
    }
    this.token = sessionToken;
    return {
      sessionToken,
      check: async () => {
        this.assert(generation);
        const now = await getSessionToken();
        this.assert(generation);
        if (now !== sessionToken) {
          this.stop();
          this.status = 'error';
          this.error = SESSION_CHANGED;
          this.notify();
          throw new Error(SESSION_CHANGED);
        }
      },
    };
  };

  private currentKey() {
    return this.currentEpoch ? this.keys.get(this.currentEpoch) : undefined;
  }

  private adopt(epoch: number, key: Uint8Array, confirmed: boolean) {
    if (!Number.isSafeInteger(epoch) || epoch < 1 || key.length !== 32) return;
    const previous = this.keys.get(epoch);
    // Backups cannot replace a device-confirmed canonical key. Only a successful
    // canonical unwrap may repair a bad backup, and become an upload candidate.
    if (!confirmed && previous) return;
    if (!sameKey(previous, key)) {
      previous?.fill(0);
      this.keys.set(epoch, key.slice());
      this.uploaded.delete(epoch);
      this.keyRevision += 1;
      this.notify();
    }
    if (confirmed) this.confirmed.add(epoch);
  }

  private unwrap(identity: ChatIdentity, state: ChatKeysState) {
    if (!state.epoch) return;
    const livePubs = livePubsOf(state);
    for (const envelope of mineCandidates(state)) {
      try {
        const key = chatCrypto.unwrapConversationKey(envelope, identity, livePubs, this.pubs, devicePubsOf(state));
        this.adopt(state.epoch, key, true);
        key.fill(0);
        break;
      } catch { /* other devices' slots and unavailable legacy wrappers are normal gaps */ }
    }
    this.pubs = { ...this.pubs, ...livePubs };
  }

  private observeEpoch(state: ChatKeysState) {
    const epoch = state.epoch ?? null;
    if (this.currentEpoch && (!epoch || epoch < this.currentEpoch)) {
      // An older response or missing history must never roll back a held epoch
      // or automatically bootstrap a replacement for an encrypted conversation.
      throw new Error(SEND_LOCKED);
    }
    if (this.currentEpoch !== epoch) {
      this.currentEpoch = epoch;
      this.beforeEpoch = undefined;
      this.historyDone = false;
      this.restored = false;
      this.status = this.currentKey() ? 'ready' : 'restoring';
      this.notify();
    }
  }

  private async heal(identity: ChatIdentity, state: ChatKeysState, fence: Awaited<ReturnType<TripCryptoSession['captureSession']>>) {
    const epoch = state.epoch;
    const key = this.currentKey();
    if (!epoch || epoch !== this.currentEpoch || !key) return;
    const liveDeviceKeys = new Set<string>();
    const memberIds = new Set<string>();
    for (const member of state.members || []) {
      memberIds.add(member.userId);
      for (const pub of memberDeviceKeysOf(member)) liveDeviceKeys.add(pub);
    }
    const envelopes: Record<string, string> = {};
    for (const member of state.members || []) {
      for (const pub of memberDeviceKeysOf(member)) {
        const known = member.slots
          ? member.slots.some((slot) => slot.pub === pub)
          : (member.envelopedPubKeys || []).includes(pub);
        const usable = member.slots
          ? slotIsUsable(member.slots.find((slot) => slot.pub === pub), liveDeviceKeys, memberIds)
          : true;
        if (known && usable) continue;
        try {
          envelopes[pub] = chatCrypto.wrapConversationKey(this.userId, identity, pub, key);
        } catch { /* another device can still be healed */ }
      }
    }
    if (!Object.keys(envelopes).length) return;
    await fence.check();
    if (epoch !== this.currentEpoch || key !== this.currentKey()) return;
    // A rotation after this check can only update the old epoch, never poison
    // the new one. Never derive the target epoch from a held historical key.
    await addChatEnvelopes(this.tripId, epoch, envelopes, fence.sessionToken);
    await fence.check();
  }

  private restore(): Promise<void> {
    if (this.restored || keyBackup.getSnapshot().status !== 'ready') return Promise.resolve();
    if (this.restoreFlow) return this.restoreFlow;
    const generation = this.generation;
    const work = (async () => {
      try {
        const fence = await this.captureSession();
        const restored = await keyBackup.restoreTripKeys(this.userId, this.tripId);
        await fence.check();
        for (const [epoch, key] of restored) this.adopt(epoch, key, false);
        this.restored = true;
      } catch {
        if (!this.isCurrent() || generation !== this.generation) return;
        this.backupError = 'Backed-up history could not be restored. Check again or open account recovery.';
        this.notify();
      }
    })();
    this.restoreFlow = work;
    void work.finally(() => { if (this.restoreFlow === work) this.restoreFlow = null; }).catch(() => {});
    return work;
  }

  private async run() {
    const generation = this.generation;
    try {
      const fence = await this.captureSession();
      const identity = await ensureChatIdentity(this.userId);
      await fence.check();
      await publishChatKey(identity.pubKey, fence.sessionToken);
      await fence.check();
      let state = await fetchChatKeys(this.tripId, fence.sessionToken);
      await fence.check();
      this.observeEpoch(state); // Compare on EVERY refresh, even while ready.
      if (!state.epoch) {
        if (this.sawEncryptedRows || this.keys.size) throw new Error(SEND_LOCKED);
        this.status = 'bootstrap';
        this.notify();
        const candidate = chatCrypto.generateConversationKey();
        try {
          const envelopes: Record<string, string> = {};
          for (const member of state.members || []) {
            for (const pub of memberDeviceKeysOf(member)) {
              try {
                envelopes[pub] = chatCrypto.wrapConversationKey(this.userId, identity, pub, candidate);
              } catch { /* skip invalid device keys */ }
            }
          }
          if (!envelopes[identity.pubKey]) throw new Error(SEND_LOCKED);
          await fence.check();
          try {
            await putChatKeys(this.tripId, 1, envelopes, fence.sessionToken);
          } catch {
            // Conflict AND ambiguous network outcomes must resolve canonically.
            // Never adopt/upload the locally generated candidate on either path.
          }
          await fence.check();
          state = await fetchChatKeys(this.tripId, fence.sessionToken);
          await fence.check();
          if (!state.epoch) throw new Error(SEND_LOCKED);
          this.observeEpoch(state);
        } finally { candidate.fill(0); }
      }
      this.unwrap(identity, state);
      const backup = keyBackup.getSnapshot();
      if (backup.status !== 'ready') this.restored = false;
      if (!this.currentKey() && !this.restored && backup.status === 'ready') {
        this.status = 'restoring';
        this.notify();
        await this.restore();
      }
      await fence.check();
      const waiting = ['idle', 'loading', 'unlocking'].includes(keyBackup.getSnapshot().status);
      this.status = this.currentKey() ? 'ready' : waiting ? 'restoring' : 'keyless';
      this.keylessReason = mineCandidates(state).length ? 'mismatch' : 'missing';
      this.error = undefined;
      this.notify();
      // Bounded backup work must not hold up encryption or peer sharing.
      void this.historyStep(identity);
      try { await this.heal(identity, state, fence); } catch { /* epoch conflict/network: next refresh retries */ }
    } catch (error) {
      if (!this.isCurrent() || this.generation !== generation) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        this.stop();
        this.status = 'error';
        this.error = 'This session no longer has access to the conversation.';
      } else {
        // Keep usable keys/history on transient failures; every send still
        // requires a fresh successful epoch confirmation below.
        this.status = this.currentKey() ? 'ready' : 'error';
        this.error = 'The current trip key could not be checked. Check your connection and try again.';
      }
      this.notify();
      throw new Error(SEND_LOCKED);
    }
  }

  refresh = (): Promise<void> => {
    if (this.flow) return this.flow;
    const flow = this.run();
    this.flow = flow;
    void flow.finally(() => { if (this.flow === flow) this.flow = null; }).catch(() => {});
    return flow;
  };

  /** One 25-epoch page + at most 25 uploads per pass, two uploads at a time.
   * Failed uploads stay pending; this mounted trip resumes its cursor next pass.
   */
  private async historyStep(identity: ChatIdentity) {
    if (this.historyBusy || !this.isCurrent()) return;
    this.historyBusy = true;
    const generation = this.generation;
    const scanEpoch = this.currentEpoch;
    let failed = false;
    try {
      const fence = await this.captureSession();
      const backup = keyBackup.getSnapshot();
      if (['idle', 'loading', 'unlocking'].includes(backup.status)) return;
      // When a device already has the current key, slow backup restoration must
      // not hold the ready chat/send flow hostage. Restore history here instead.
      if (this.currentKey()) {
        await this.restore();
        await fence.check();
      }
      if (!this.historyDone) {
        try {
          await fence.check();
          const page = await keyBackup.getEpochs(this.userId, this.tripId, this.beforeEpoch);
          await fence.check();
          // This endpoint's currentEpoch is advisory, not send confirmation.
          for (const state of page.epochs.slice(0, 25)) {
            this.unwrap(identity, state);
            await yieldToUI();
            await fence.check();
          }
          if (page.nextBeforeEpoch !== null &&
              (!Number.isSafeInteger(page.nextBeforeEpoch) || page.nextBeforeEpoch < 1 ||
               (this.beforeEpoch !== undefined && page.nextBeforeEpoch >= this.beforeEpoch))) {
            throw new Error('Invalid history cursor.');
          }
          if (scanEpoch === this.currentEpoch) {
            this.historyDone = page.nextBeforeEpoch === null;
            this.beforeEpoch = page.nextBeforeEpoch ?? undefined;
          }
        } catch {
          this.assert(generation);
          failed = true;
        }
      }
      if (keyBackup.getSnapshot().status === 'ready') {
        const pending = [...this.confirmed].filter((epoch) => !this.uploaded.has(epoch)).slice(0, 25);
        for (let index = 0; index < pending.length; index += 2) {
          await Promise.all(pending.slice(index, index + 2).map(async (epoch) => {
            try {
              await fence.check();
              if (keyBackup.getSnapshot().status !== 'ready') return;
              const key = this.keys.get(epoch);
              if (!key) return;
              const copy = key.slice();
              try {
                // Only device-confirmed canonical keys reach `confirmed`, so a
              // stale or corrupt backup row may be repaired with its revision.
              await keyBackup.backupTripKey(this.userId, this.tripId, epoch, copy, true);
                await fence.check();
                if (keyBackup.getSnapshot().status === 'ready' && sameKey(this.keys.get(epoch), copy)) {
                  this.uploaded.add(epoch);
                }
              } finally { copy.fill(0); }
            } catch {
              this.assert(generation);
              failed = true;
            }
          }));
        }
      }
      await fence.check();
      if (failed) this.backupError = BACKUP_FAILED;
      else if (this.restored) this.backupError = undefined;
      this.notify();
    } catch {
      if (this.isCurrent() && generation === this.generation) {
        this.backupError = BACKUP_FAILED;
        this.notify();
      }
    } finally {
      if (generation === this.generation) this.historyBusy = false;
    }
  }

  private async outgoingKey() {
    // Capture BEFORE waiting: an old queued send cannot join a new session.
    const fence = await this.captureSession();
    if (this.flow) await this.flow;
    await fence.check();
    await this.refresh();
    await fence.check();
    // Restore/heal may have taken time. Confirm again after that work, immediately
    // before sealing; never use an epoch learned only from historical pagination.
    const state = await fetchChatKeys(this.tripId, fence.sessionToken);
    await fence.check();
    this.observeEpoch(state);
    const key = this.currentKey();
    if (!key || this.status !== 'ready' || this.error) throw new Error(SEND_LOCKED);
    return key;
  }

  encryptOutgoing = async (text: string) => {
    const generation = this.generation;
    const key = await this.outgoingKey();
    this.assert(generation);
    if (key !== this.currentKey()) throw new Error(SEND_LOCKED);
    return { body: chatCrypto.encryptText(key, text), e2ee: true };
  };

  sealJson = async (value: unknown): Promise<string | null> => {
    const generation = this.generation;
    const key = await this.outgoingKey();
    this.assert(generation);
    if (key !== this.currentKey()) throw new Error(SEND_LOCKED);
    return chatCrypto.encryptJson(key, value);
  };

  private openText(body: string, rowId: string): Promise<string | null> {
    if (!this.isCurrent() || !body) return Promise.resolve(null);
    this.sawEncryptedRows = true;
    const id = cacheKeyOf({ _id: rowId, body });
    const cached = this.plain.get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    if (this.failed.get(id) === this.keyRevision) return Promise.resolve(null);
    const pending = this.opening.get(id);
    if (pending) return pending;
    const generation = this.generation;
    const revision = this.keyRevision;
    const keys = [...this.keys.entries()].sort(([a], [b]) =>
      a === this.currentEpoch ? -1 : b === this.currentEpoch ? 1 : b - a);
    const promise = (async () => {
      for (let index = 0; index < keys.length; index += 1) {
        if (index % 8 === 0) {
          await yieldToUI();
          if (!this.isCurrent() || generation !== this.generation) return null;
        }
        try {
          const plain = chatCrypto.decryptText(keys[index][1], body);
          this.assert(generation);
          this.plain.set(id, plain);
          this.notify();
          return plain;
        } catch { /* legacy ciphertext has no epoch: try the next authorized key */ }
      }
      if (this.isCurrent() && generation === this.generation) {
        if (revision !== this.keyRevision) {
          // A key arrived while this body was in flight. Do not strand the
          // caller behind a failed attempt that used the older keyring.
          this.opening.delete(id);
          return this.openText(body, rowId);
        }
        this.failed.set(id, revision);
      }
      return null;
    })();
    this.opening.set(id, promise);
    void promise.finally(() => {
      if (this.opening.get(id) === promise) this.opening.delete(id);
    }).catch(() => {});
    return promise;
  }

  openJson = async <T,>(body: string, rowId = 'json'): Promise<T | null> => {
    const generation = this.generation;
    const plain = await this.openText(body, rowId);
    if (!this.isCurrent() || generation !== this.generation || plain === null) return null;
    try { return JSON.parse(plain) as T; } catch { return null; }
  };

  syncRows = (rows: ChatRow[]) => {
    const generation = this.generation;
    void (async () => {
      for (const row of rows) {
        if (!this.isCurrent() || generation !== this.generation) return;
        if (row.e2ee) await this.openText(row.body ?? '', row._id);
      }
    })().catch(() => {});
  };

  plaintextOf = (row: { _id: string; body: string; e2ee?: boolean }) =>
    !this.isCurrent() ? '' : !row.e2ee ? row.body || '' : this.plain.get(cacheKeyOf(row)) ?? '';

  rememberPlaintext = (row: { _id: string; body: string }, plaintext: string) => {
    if (!this.isCurrent()) return;
    this.plain.set(cacheKeyOf(row), plaintext);
    this.notify();
  };

  retry = () => {
    if (!this.active) this.start();
    this.restored = false;
    void this.refresh().catch(() => {});
  };
}

const subscribeBackup = (listener: () => void) => keyBackup.subscribe(listener);
const getBackupSnapshot = () => keyBackup.getSnapshot();

export function useDiscussionCrypto(tripId: string | undefined, userId: string | undefined, enabled: boolean): DiscussionCrypto {
  const [, bump] = useReducer((value: number) => value + 1, 0);
  const backup = useSyncExternalStore(subscribeBackup, getBackupSnapshot, getBackupSnapshot);
  const session = useMemo(() => new TripCryptoSession(tripId ?? '', userId ?? '', bump), [tripId, userId]);

  useEffect(() => {
    if (!enabled || !tripId || !userId) return;
    session.start();
    // Observe account changes synchronously, even if React batches A -> null -> B.
    const unsubscribe = keyBackup.subscribe(() => {
      if (keyBackup.getSnapshot().userId !== userId) session.stop();
    });
    return () => { unsubscribe(); session.stop(); };
  }, [enabled, tripId, userId, session]);

  useEffect(() => {
    if (!enabled || !tripId || !userId || backup.userId !== userId) return;
    const refresh = () => { void session.refresh().catch(() => {}); };
    const kickoff = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 10_000);
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    return () => { clearTimeout(kickoff); clearInterval(timer); subscription.remove(); };
  }, [enabled, tripId, userId, backup.userId, backup.status, session]);

  // New keys retry unreadable rows even when the current epoch remains missing.
  const revision = session.keyRevision;
  const syncRows = session.syncRows;
  const openJson = session.openJson;
  const generation = session.generation;
  const isCurrent = useMemo(() => () => session.isCurrent() && session.generation === generation, [session, generation]);
  const off = !enabled || !tripId || !userId;
  const status = off ? 'off' : session.status;
  return {
    status,
    error: session.error,
    backupError: session.backupError,
    backupStatus: backup.userId === userId ? backup.status : 'idle',
    keylessReason: session.keylessReason,
    keyRevision: revision,
    canSend: !off && isCurrent() && status === 'ready' && !session.error,
    isCurrent,
    captureSession: session.captureSession,
    isEncrypted: (row) => Boolean(row.e2ee),
    plaintextOf: session.plaintextOf,
    syncRows,
    rememberPlaintext: session.rememberPlaintext,
    encryptOutgoing: off ? async (body) => ({ body, e2ee: false }) : session.encryptOutgoing,
    sealJson: off ? async () => null : session.sealJson,
    openJson,
    retry: session.retry,
  };
}
