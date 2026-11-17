import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/services/api';
import {
  cachedMemberKeys,
  encryptMessage,
  decryptMessage,
  ensureIdentity,
  exportConversationKey,
  generateConversationKey,
  importConversationKey,
  memberDeviceKeysOf,
  mergeMemberKeys,
  publishChatKey,
  slotIsUsable,
  unwrapMyEnvelope,
  wrapEnvelope,
} from '@/lib/chatCrypto';
import type {
  ChatIdentity,
  ChatRealm,
  MemberKeyMap,
  MemberKeyMapMulti,
} from '@/lib/chatCrypto';
import { keyBackup } from '@/lib/chatKeyBackup';
import type { BackupStatus } from '@/lib/keyBackupSession';
import type { ChatKeysState } from '@/types/trip';

/**
 * The per-trip E2EE session (Milestone 7, F10 — frontend half).
 *
 * Owns the whole key biography for one trip while the chat is mounted:
 * identity publish → keys fetch → bootstrap (nobody has a key yet) OR unwrap
 * (I hold an envelope) OR keyless (epoch exists but not for me yet) → the
 * live decrypt pass that turns ciphertext comments/decisions into plaintext.
 *
 * Deliberately SEPARATE from `useTripComments`: the discussion hub keeps its
 * rows verbatim (exactly what the server sent); this hook is the translator
 * layer on top. Consumers render `plaintextOf(row)` and encrypt outgoing text
 * through `encryptOutgoing`, so bubble UI never touches ivs or keys.
 *
 * States:
 * - 'off'       crypto unavailable (no WebCrypto) → plaintext chat, honestly
 *               labeled by the UI.
 * - 'starting'  identity + keys in flight.
 * - 'ready'     conversation key unwrapped; bodies flow.
 * - 'bootstrap' this member is minting epoch-1 (wraps to every member).
 * - 'keyless'   epoch exists but my envelope is missing; any member's open
 *               client re-shares this epoch's key (not full history recovery).
 * - 'error'     surfaced message; encrypted/unknown epochs cannot send plaintext.
 */

export type ChatCryptoStatus =
  | 'off'
  | 'starting'
  | 'bootstrap'
  | 'ready'
  | 'keyless'
  | 'error';

export interface ChatCryptoApi {
  status: ChatCryptoStatus;
  error?: string;
  /**
   * The personal account's password-assisted backup state. Agency chats are a
   * separate realm and deliberately never touch it.
   */
  backupStatus: BackupStatus;
  /** Non-fatal backup/restore failures; chat itself keeps working. */
  backupError?: string;
  /**
   * Only meaningful while `keyless`:
   * - 'missing'  no envelope for this account exists yet (awaiting a share),
   * - 'mismatch' an envelope exists but was wrapped to ANOTHER device's key —
   *              the ordinary "second browser" case. It needs no user action:
   *              any member whose client holds the key re-wraps this device's
   *              slot within seconds (the F10e healing rule).
   */
  keylessReason?: 'missing' | 'mismatch';
  /** True when this row is ciphertext per its flag (independent of state). */
  isEncrypted: (row: { e2ee?: boolean }) => boolean;
  /** Render text for a row: plaintext rows verbatim; ciphertext rows cached. */
  plaintextOf: (row: { _id: string; body: string; e2ee?: boolean }) => string;
  /** Kicks a decrypt pass for rows that changed (mount/frames/edits). */
  syncRows: (rows: { _id: string; body?: string; e2ee?: boolean }[]) => void;
  /** Remembers just-written plaintext so own bubbles never blink to 🔒. */
  rememberPlaintext: (rowId: string, plaintext: string) => void;
  /**
   * Confirms the current server epoch before encrypting. Only explicitly off
   * or confirmed uninitialized chats can send plaintext. Missing current keys
   * and network failures block encrypted sends rather than downgrading.
   */
  encryptOutgoing: (
    plaintext: string
  ) => Promise<{ body: string; e2ee: boolean }>;
  /** Re-runs the key flow in place (the fallback banner's Retry action). */
  retry: () => void;
  /**
   * Last-resort recovery for a device that cannot open the trip key: mint a new
   * conversation key (next epoch), wrap it for every current device, and move
   * the trip's chat forward. Messages sealed under the old key stay unreadable.
   * Only usable while this device is locked (never downgrades a working chat).
   */
  resetChat: () => Promise<void>;
  /**
   * F13a: seals an arbitrary JSON value with the trip key (polls: question +
   * options, and each vote's index). `null` when this device has no key — the
   * caller must refuse the action rather than fall back to plaintext.
   */
  sealJson: (value: unknown) => Promise<string | null>;
  /** Opens a sealed JSON value; `null` when it cannot be read on this device. */
  openJson: <T>(body: string) => Promise<T | null>;
}

/** Empty render value while a ciphertext row is not (yet) readable. */
const PLACEHOLDER = '';
const rowCacheKey = (rowId: string, body: string) => JSON.stringify([rowId, body]);
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
type CheckScope = () => void;
type HeldKey = { epoch: number; key: CryptoKey };
interface ChatSession {
  scope: string;
  held: HeldKey | null;
  epoch: number | null;
  status: ChatCryptoStatus;
  error?: string;
  backupError?: string;
  keylessReason?: 'missing' | 'mismatch';
  active: boolean;
  generation: number;
  queue: Promise<void>;
  plaintext: Map<string, string>;
  decrypting: Set<string>;
  /** Bounded bridge for existing rememberPlaintext(rowId, text) callers. */
  sentBodies: Map<string, string>;
  /** Older epochs restored from the password-assisted backup, newest first. */
  history: Map<number, CryptoKey>;
  /** Epochs whose key this device opened canonically (may repair a bad row). */
  confirmed: Set<number>;
  /** Epochs this device already backed up during this mount. */
  uploaded: Set<number>;
  /** One restore attempt per epoch context; cleared when the epoch changes. */
  restored: boolean;
  /** In-flight backup/restore guard, so interval ticks do not pile up. */
  backupBusy: boolean;
}

/** Older restored keys are only useful for reading; keep the map bounded. */
const MAX_HISTORY_KEYS = 64;
const BACKUP_FAILED =
  'Some readable history could not be backed up. Your chat keys still work; try again shortly.';

export function useTripChatCrypto(
  tripId: string | undefined,
  currentUserId: string | undefined,
  enabled: boolean,
  /**
   * PA0: which account realm owns this chat identity. Agency chats use a
   * tenant-scoped device key and publish it through `/api/agency/auth/chat-key`,
   * never through the personal endpoint.
   */
  realm: ChatRealm = 'personal',
  identityScope?: string
): ChatCryptoApi {
  const [, setTick] = useState(0);
  const backup = useSyncExternalStore(keyBackup.subscribe, keyBackup.getSnapshot, keyBackup.getSnapshot);
  const scope = JSON.stringify([tripId, currentUserId, enabled, realm, identityScope]);
  // Separate state at render time fences old callbacks before effect cleanup.
  // Device identity storage is deliberately unchanged in this phase.
  const session = useMemo<ChatSession>(() => ({
    scope,
    held: null,
    epoch: null,
    status: 'starting',
    active: true,
    generation: 0,
    queue: Promise.resolve(),
    plaintext: new Map(),
    decrypting: new Set(),
    sentBodies: new Map(),
    history: new Map(),
    confirmed: new Set(),
    uploaded: new Set(),
    restored: false,
    backupBusy: false,
  }), [scope]);
  const activeSession = useRef(session);
  activeSession.current = session;
  const isCurrent = useCallback(() =>
    activeSession.current === session && session.active, [session]);
  const notify = useCallback(() => {
    if (isCurrent()) setTick((tick) => tick + 1);
  }, [isCurrent]);
  const update = useCallback((
    status: ChatCryptoStatus,
    error?: string,
    keylessReason?: 'missing' | 'mismatch'
  ) => {
    if (!isCurrent()) return;
    session.status = status;
    session.error = error;
    session.keylessReason = keylessReason;
    notify();
  }, [isCurrent, notify, session]);

  // Prevent out-of-order fetch/adopt/heal/reset/send completions. Generation
  // additionally fences effect cleanup/remount (including React StrictMode).
  const serialize = useCallback(<T,>(work: (check: CheckScope) => Promise<T>): Promise<T> => {
    const generation = session.generation;
    const check = () => {
      if (!isCurrent() || generation !== session.generation) {
        throw new Error('The chat session changed. Reopen the trip before trying again.');
      }
    };
    const result = session.queue.then(async () => {
      check();
      const value = await work(check);
      check();
      return value;
    });
    session.queue = result.then(() => undefined, () => undefined);
    return result;
  }, [isCurrent, session]);

  /* ------------------------------ key biography ----------------------------- */

  /** userId → every published device key (the wrapper may be any of them). */
  const devicePubsOf = (state: ChatKeysState): MemberKeyMapMulti => {
    const map: MemberKeyMapMulti = {};
    for (const member of state.members || []) {
      const keys = memberDeviceKeysOf(member);
      if (keys.length) map[member.userId] = keys;
    }
    return map;
  };

  /** userId → newest key (the shape `mergeMemberKeys`/legacy lookups use). */
  const livePubsOf = (state: ChatKeysState): MemberKeyMap => {
    const map: MemberKeyMap = {};
    for (const member of state.members || []) {
      const newest = member.pubKey || member.pubKeys?.[0];
      if (newest) map[member.userId] = newest;
    }
    return map;
  };

  /** Every envelope addressed to this account (any device), legacy shape included. */
  const mineCandidates = (state: ChatKeysState): string[] =>
    state.mineAll?.length ? state.mineAll : state.mine ? [state.mine] : [];

  /**
   * Tries to open MY envelopes with THIS browser's identity, one per device of
   * this account (the server hands all of them over; only the slot wrapped to
   * THIS device's key can be opened). No slot opening at all is NOT an error:
   * it is either "no key for this account yet" or "wrapped for another device"
   * — both `keyless`, healed by another open client. A password-assisted backup
   * can also supply the current key when no device envelope is openable.
   */
  const adoptState = useCallback(async (
    identity: ChatIdentity,
    state: ChatKeysState,
    check: CheckScope
  ): Promise<boolean> => {
    check();
    const epoch = state.epoch ?? 0;
    if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 1_000_000_000 ||
        (session.epoch !== null && epoch < session.epoch)) {
      throw new Error('The current chat epoch could not be confirmed. Please try again.');
    }
    const previousEpoch = session.epoch;
    session.epoch = epoch;
    // Retire the previous key BEFORE opening a rotated epoch, even if keyless.
    if (session.held?.epoch !== epoch) session.held = null;
    if (previousEpoch !== epoch) {
      // A new epoch may have its own backup row; allow one fresh restore.
      session.restored = false;
    }
    if (!epoch) return false;
    const livePubs = livePubsOf(state);
    mergeMemberKeys(tripId!, livePubs);
    if (session.held) {
      update('ready');
      return true;
    }
    const candidates = mineCandidates(state);
    update('keyless', undefined, 'missing');
    let wrapperGap = false;
    for (const envelope of candidates) {
      let key: CryptoKey;
      try {
        key = await unwrapMyEnvelope(
          envelope, identity, livePubs, cachedMemberKeys(tripId!), devicePubsOf(state)
        );
      } catch (error) {
        check();
        if (/wrapper/i.test(errorMessage(error, ''))) wrapperGap = true;
        continue;
      }
      check();
      session.held = { key, epoch };
      update('ready');
      return true;
    }
    update('keyless', undefined, !candidates.length || wrapperGap ? 'missing' : 'mismatch');
    return false;
  }, [session, tripId, update]);

  /**
   * Password-assisted backup integration (personal realm only).
   *
   * Two jobs, both non-fatal to the chat:
   * - when this browser cannot open any device envelope, try the account-key
   *   backup before settling on `keyless`;
   * - when this browser opens the canonical key, offer it to the account backup.
   *
   * The account key is only used inside the session module; the chat hook sees
   * raw trip-key bytes for the duration of one call/each restored epoch.
   */
  const restoreFromBackup = useCallback(async (check: CheckScope) => {
    if (!tripId || !currentUserId || session.restored || session.held) return;
    const snapshot = keyBackup.getSnapshot();
    if (snapshot.userId !== currentUserId || snapshot.status !== 'ready') return;
    try {
      const restored = await keyBackup.restoreTripKeys(currentUserId, tripId);
      check();
      for (const [epoch, raw] of restored) {
        try {
          if (epoch === session.epoch && !session.held) {
            const key = await importConversationKey(raw);
            check();
            session.held = { epoch, key };
            session.confirmed.add(epoch);
            session.uploaded.add(epoch);
            update('ready');
          } else if (epoch !== session.epoch) {
            const key = await importConversationKey(raw);
            check();
            if (!session.history.has(epoch)) {
              session.history.set(epoch, key);
              if (session.history.size > MAX_HISTORY_KEYS) {
                const oldest = session.history.keys().next().value;
                if (oldest !== undefined) session.history.delete(oldest);
              }
            }
            session.confirmed.add(epoch);
            session.uploaded.add(epoch);
          }
        } finally {
          raw.fill(0);
        }
      }
      check();
      session.restored = true;
      session.backupError = undefined;
      notify();
    } catch {
      check();
      session.backupError = 'Backed-up history could not be restored. Open account recovery to check the backup.';
      notify();
    }
  }, [currentUserId, notify, session, tripId, update]);

  const backUpCurrentKey = useCallback(async (check: CheckScope) => {
    const held = session.held;
    if (!tripId || !currentUserId || !held || held.epoch !== session.epoch) return;
    if (session.uploaded.has(held.epoch)) return;
    const snapshot = keyBackup.getSnapshot();
    if (snapshot.userId !== currentUserId || snapshot.status !== 'ready') return;
    let raw: Uint8Array | undefined;
    try {
      raw = await exportConversationKey(held.key);
      check();
      // `repair` is justified: `held` was opened from this device's own
      // canonical envelope (or restored from the matching backup row), never
      // guessed from history pagination.
      await keyBackup.backupTripKey(currentUserId, tripId, held.epoch, raw, true);
      check();
      if (session.held === held) {
        session.uploaded.add(held.epoch);
        session.backupError = undefined;
        notify();
      }
    } catch {
      check();
      session.backupError = BACKUP_FAILED;
      notify();
    } finally {
      raw?.fill(0);
    }
  }, [currentUserId, notify, session, tripId]);

  const syncBackup = useCallback(async (check: CheckScope) => {
    if (realm !== 'personal' || !tripId || !currentUserId) return;
    if (session.backupBusy) return;
    session.backupBusy = true;
    try {
      if (session.held) await backUpCurrentKey(check);
      else await restoreFromBackup(check);
    } finally {
      session.backupBusy = false;
    }
  }, [backUpCurrentKey, currentUserId, realm, restoreFromBackup, session, tripId]);

  /**
   * F10d self-heal: a client that HOLDS the conversation key wraps it for every
   * device slot that is still empty — a second browser of this account, or a
   * member who joined after the epoch was minted. Idempotent: only gaps are
   * sent, and the server writes only the exact expected epoch.
   *
   * F10e: "empty" is now "not provably openable". A filled slot whose wrapper
   * has left the trip, whose blob was overwritten with rubbish, or which was
   * written for a key nobody publishes any more used to be skipped FOREVER —
   * the recipient waited for a re-share that could never come (`healSlots` was
   * the only re-share there is). Such a slot is now re-wrapped, which makes it
   * usable again; `slotIsUsable` documents exactly when a slot is left alone.
   */
  const healSlots = useCallback(
    async (identity: ChatIdentity, state: ChatKeysState, check: CheckScope) => {
      check();
      const held = session.held;
      if (!tripId || !currentUserId || !held || held.epoch !== state.epoch ||
          held.epoch !== session.epoch) return;
      const liveDeviceKeys = new Set<string>();
      const memberIds = new Set<string>();
      for (const member of state.members || []) {
        memberIds.add(member.userId);
        for (const key of memberDeviceKeysOf(member)) liveDeviceKeys.add(key);
      }

      const pending: Record<string, string> = {};
      let wanted = 0;
      let failed = 0;
      for (const member of state.members || []) {
        for (const pub of memberDeviceKeysOf(member)) {
          // An older server sends no slot metadata: keep the pre-F10e rule
          // (any envelope counts) rather than re-wrapping the whole roster.
          const known = member.slots
            ? member.slots.some((slot) => slot.pub === pub)
            : (member.envelopedPubKeys || []).includes(pub);
          const usable = member.slots
            ? slotIsUsable(member.slots.find((slot) => slot.pub === pub), liveDeviceKeys, memberIds)
            : true;
          if (known && usable) continue;
          wanted += 1;
          try {
            pending[pub] = await wrapEnvelope(currentUserId, identity, pub, held.key);
          } catch {
            failed += 1; // one device failing to wrap never blocks the rest
          }
          check();
        }
      }
      if (!Object.keys(pending).length) {
        if (wanted && failed === wanted) {
          // Every attempt failed. Say so ONCE: this exact silence is what hid
          // the F10e defect (a non-extractable key cannot be re-wrapped) for a
          // whole release — nobody could tell healing apart from no work to do.
          console.warn(
            `chatCrypto: could not re-share the chat key for ${wanted} device slot(s)`
          );
        }
        return;
      }
      check();
      if (session.held !== held || session.epoch !== held.epoch) return;
      try {
        await api.addTripChatEnvelopes(tripId, held.epoch, pending);
      } catch {
        // Stale-epoch conflicts are retried only after a fresh state fetch.
      }
      check();
    },
    [tripId, currentUserId, session]
  );

  const fetchCurrent = useCallback(async (identity: ChatIdentity, check: CheckScope) => {
    check();
    const state = await api.getTripChatKeys(tripId!);
    check();
    await adoptState(identity, state, check);
    check();
    return state;
  }, [tripId, adoptState]);

  const getIdentity = useCallback(async (check: CheckScope, publish = false) => {
    check();
    const identity = await ensureIdentity(realm, identityScope);
    check();
    if (!identity) {
      throw new Error('Secure chat is unavailable in this browser. Nothing was sent.');
    }
    if (publish && currentUserId) {
      await publishChatKey(identity.pubKey, realm).catch(() => undefined);
      check();
    }
    return identity;
  }, [realm, identityScope, currentUserId]);

  /** Bootstrap/reset candidates are never adopted without a canonical fetch. */
  const mintEpoch = useCallback(async (
    identity: ChatIdentity,
    state: ChatKeysState,
    check: CheckScope
  ) => {
    check();
    if (!tripId || !currentUserId) throw new Error('Open the trip again before starting a new chat.');
    update('bootstrap');
    const key = await generateConversationKey();
    check();
    const envelopes: Record<string, string> = {};
    for (const member of state.members || []) {
      for (const pub of memberDeviceKeysOf(member)) {
        try {
          envelopes[pub] = await wrapEnvelope(currentUserId, identity, pub, key);
        } catch {
          // Missing device slots are healed by a confirmed keyholder later.
        }
        check();
      }
    }
    if (!envelopes[identity.pubKey]) {
      envelopes[identity.pubKey] = await wrapEnvelope(currentUserId, identity, identity.pubKey, key);
      check();
    }
    const epoch = (state.epoch ?? 0) + 1;
    let writeError: unknown;
    try {
      await api.putTripChatKeys(tripId, epoch, envelopes);
    } catch (error) {
      writeError = error;
    }
    check();
    // Conflict AND ambiguous network failures may have committed another key.
    // If this fetch fails, stay blocked instead of trusting our candidate.
    const canonical = await fetchCurrent(identity, check);
    check();
    if (!canonical.epoch || canonical.epoch < epoch) {
      throw new Error(errorMessage(writeError, 'The new chat epoch could not be confirmed. Please retry.'));
    }
    await healSlots(identity, canonical, check);
  }, [tripId, currentUserId, update, fetchCurrent, healSlots]);

  const runKeyFlow = useCallback(() => serialize(async (check) => {
    if (!enabled || !tripId || !currentUserId) return;
    update(session.held ? 'ready' : 'starting');
    try {
      const identity = await getIdentity(check, true);
      if (!identity) return;
      const state = await fetchCurrent(identity, check);
      if (!state.epoch) await mintEpoch(identity, state, check);
      else await healSlots(identity, state, check);
      await syncBackup(check);
    } catch (error) {
      check();
      // Retain a known key on transient failure; sends still must confirm it.
      update(session.held ? 'ready' : 'error', errorMessage(error, 'Chat encryption is unavailable right now.'));
    }
  }), [serialize, enabled, tripId, currentUserId, session, update, getIdentity, fetchCurrent, mintEpoch, healSlots, syncBackup]);

  /** Re-runs the whole key flow in place — the banner's Retry medicine. */
  const retry = useCallback(() => {
    void runKeyFlow().catch(() => undefined);
  }, [runKeyFlow]);

  /**
   * Last-resort recovery for a device that cannot open any existing envelope.
   * Mints the next conversation key and wraps it for every device currently on
   * the trip. Deliberately unavailable while this device already has a key:
   * recovery must never throw away a working chat. Older messages were sealed
   * under the previous key and remain unreadable — the UI says so before this
   * runs. No backup code and nothing reusable leaves the browser.
   */
  const resetChat = useCallback(() => serialize(async (check) => {
    if (!enabled || !tripId || !currentUserId) {
      throw new Error('Open the trip again before starting a new chat.');
    }
    try {
      const identity = await getIdentity(check, true);
      if (!identity) throw new Error('This browser cannot set up the secure chat.');
      const state = await fetchCurrent(identity, check);
      // A peer may have healed us since the banner appeared. Never reset that key.
      if (session.held) return;
      await mintEpoch(identity, state, check);
      if (!session.held) {
        throw new Error('The chat changed on another device. Wait for the current key to be shared, then retry.');
      }
    } catch (error) {
      check();
      update(
        session.held ? 'ready' : session.epoch ? 'keyless' : 'error',
        errorMessage(error, 'Could not start a new chat on this device.'),
        session.keylessReason
      );
      throw error;
    }
  }), [serialize, enabled, tripId, currentUserId, getIdentity, fetchCurrent, session, mintEpoch, update]);

  /**
   * Quiet re-check (never flickers through 'starting'): while keyless it tries
   * to open my envelopes; while ready it heals slots that appeared since (a
   * second browser of this account, or a fresh member) so the OTHER device
   * unlocks itself without any user action.
   */
  const refreshKey = useCallback(() => serialize(async (check) => {
    if (!enabled || !tripId || !currentUserId) return;
    const identity = await getIdentity(check);
    if (!identity) return;
    const state = await fetchCurrent(identity, check);
    await healSlots(identity, state, check);
    await syncBackup(check);
  }), [serialize, enabled, tripId, currentUserId, getIdentity, fetchCurrent, healSlots, syncBackup]);

  useEffect(() => {
    session.active = true;
    void runKeyFlow().catch(() => undefined);
    return () => {
      session.active = false;
      session.generation += 1;
      session.held = null;
      session.epoch = null;
      session.plaintext.clear();
      session.sentBodies.clear();
      session.decrypting.clear();
      session.history.clear();
      session.confirmed.clear();
      session.uploaded.clear();
      session.restored = false;
      session.backupBusy = false;
    };
  }, [session, runKeyFlow]);

  const status = !enabled || !tripId ? 'off' : session.status;

  useEffect(() => {
    if (!enabled || !tripId) return;
    // Fast when locked (waiting for a share), slow when ready (slot healing).
    const delay = status === 'keyless' ? 6000 : status === 'ready' ? 15000 : 0;
    if (!delay) return;
    const tick = () => { void refreshKey().catch(() => undefined); };
    const timer = window.setInterval(tick, delay);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [enabled, tripId, status, refreshKey]);

  useEffect(() => {
    if (!enabled || !tripId || realm !== 'personal' || !currentUserId) return;
    // An unlock performed after this chat mounted (the Profile shelf) should
    // immediately restore maybe-restorable keys and offer the current one.
    if (backup.userId !== currentUserId || backup.status !== 'ready') return;
    if (session.held && session.uploaded.has(session.held.epoch)) return;
    void refreshKey().catch(() => undefined);
  }, [backup.status, backup.userId, enabled, tripId, realm, currentUserId, refreshKey, session]);

  /* ------------------------------ decrypt pass ----------------------------- */

  /** Current key first, then restored older epochs. Rows carry no epoch field. */
  const decryptAny = useCallback(async (body: string): Promise<string> => {
    const held = session.held;
    if (held) {
      try {
        return await decryptMessage(held.key, body);
      } catch {
        /* a rotated epoch: fall through to restored history */
      }
    }
    let lastError: unknown;
    for (const key of session.history.values()) {
      try {
        return await decryptMessage(key, body);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('This message cannot be opened on this device.');
  }, [session]);

  const syncRows = useCallback((rows: { _id: string; body?: string; e2ee?: boolean }[]) => {
    if (!isCurrent() || (!session.held && !session.history.size)) return;
    const generation = session.generation;
    for (const row of rows) {
      if (!row?.e2ee) continue;
      const body = String(row.body || '');
      const cacheKey = rowCacheKey(row._id, body);
      if (session.plaintext.has(cacheKey) || session.decrypting.has(cacheKey)) continue;
      session.decrypting.add(cacheKey);
      void decryptAny(body).then((plaintext) => {
        if (!isCurrent() || generation !== session.generation) return;
        session.plaintext.set(cacheKey, plaintext);
        notify();
      }).catch(() => {
        // Old epochs and corrupt bodies remain unreadable until a backup is
        // unlocked; a later syncRows pass retries them with restored keys.
      }).finally(() => {
        if (isCurrent() && generation === session.generation) session.decrypting.delete(cacheKey);
      });
    }
  }, [session, isCurrent, notify, decryptAny]);

  /* -------------------------------- write path ----------------------------- */

  const encryptOutgoing = useCallback((plaintext: string) => serialize(async (check) => {
    // Keep explicitly off/plaintext chats unchanged. Unknown/network-failed
    // encryption state is NOT off and cannot take this fallback.
    if ((!enabled || !tripId || session.status === 'off') && !session.held && !session.epoch) {
      return { body: plaintext, e2ee: false };
    }
    if (!currentUserId) throw new Error('Sign in again before sending a chat message.');
    const identity = await getIdentity(check);
    if (!identity) return { body: plaintext, e2ee: false };
    // Rotation can happen between polls: confirm current state for every send.
    await fetchCurrent(identity, check);
    const held = session.held;
    if (!held) {
      if (session.epoch === 0) return { body: plaintext, e2ee: false };
      throw new Error('The current encrypted chat key is not available on this device yet. Nothing was sent. Wait for another device to share it, then retry.');
    }
    let body: string;
    try {
      body = await encryptMessage(held.key, plaintext);
    } catch {
      throw new Error('This message could not be encrypted — nothing was sent. Please try again.');
    }
    check();
    session.sentBodies.set(body, plaintext);
    // Optimistic-send hints only, not another unbounded plaintext cache.
    if (session.sentBodies.size > 32) session.sentBodies.delete(session.sentBodies.keys().next().value!);
    return { body, e2ee: true };
  }), [serialize, enabled, tripId, currentUserId, session, getIdentity, fetchCurrent]);

  const rememberPlaintext = useCallback((rowId: string, plaintext: string) => {
    if (!isCurrent()) return;
    // Existing callers have no body argument. Match only ciphertext actually
    // produced in this scope; caching just a row ID would show stale edits.
    for (const [body, sent] of session.sentBodies) {
      if (sent === plaintext) session.plaintext.set(rowCacheKey(rowId, body), plaintext);
    }
    notify();
  }, [session, isCurrent, notify]);

  /* --------------------------------- reads --------------------------------- */

  const isEncrypted = useCallback((row: { e2ee?: boolean }) => Boolean(row?.e2ee), []);

  /**
   * F13a: the poll channel reuses the message AEAD verbatim — a sealed poll is
   * just a string only keyholders can read. No plaintext fallback: when this
   * device has no key the call returns null and the UI refuses the action.
   */
  const sealJson = useCallback(async (value: unknown): Promise<string | null> => {
    try {
      const result = await encryptOutgoing(JSON.stringify(value));
      return isCurrent() && result.e2ee ? result.body : null;
    } catch {
      return null;
    }
  }, [encryptOutgoing, isCurrent]);

  const openJson = useCallback(async <T,>(body: string): Promise<T | null> => {
    const generation = session.generation;
    if (!isCurrent() || (!session.held && !session.history.size) || !body) return null;
    try {
      const value = JSON.parse(await decryptAny(body)) as T;
      return isCurrent() && generation === session.generation ? value : null;
    } catch {
      return null;
    }
  }, [session, isCurrent, decryptAny]);

  const plaintextOf = useCallback(
    (row: { _id: string; body: string; e2ee?: boolean }) => {
      if (!isCurrent()) return PLACEHOLDER;
      if (!row?.e2ee) return row?.body || '';
      return session.plaintext.get(rowCacheKey(row._id, row.body)) ?? PLACEHOLDER;
    },
    [session, isCurrent]
  );

  const backupStatus: BackupStatus =
    realm === 'personal' && currentUserId && backup.userId === currentUserId ? backup.status : 'idle';

  return {
    status,
    error: session.error,
    backupStatus,
    backupError: realm === 'personal' ? session.backupError : undefined,
    keylessReason: session.keylessReason,
    isEncrypted,
    plaintextOf,
    syncRows,
    rememberPlaintext,
    encryptOutgoing,
    retry,
    resetChat,
    sealJson,
    openJson,
  };
}
