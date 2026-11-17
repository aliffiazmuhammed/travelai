/// <reference types="node" />

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mock, test } from 'node:test';

import type { BackupMutation, ChatKeyBackupApi } from '../src/api/chatKeyBackup';
import { createChatCrypto } from '../src/lib/chatCrypto';
import {
  createKeyBackupCrypto,
  decodeKey,
  encodeKey,
  type AccountBackupState,
  type PasswordWrap,
  type SealedKey,
  type TripKeyBackup,
} from '../src/lib/chatKeyBackupCrypto';
import { createKeyBackupSession } from '../src/lib/keyBackupSession';

type Enrolled = Extract<AccountBackupState, { enrolled: true }>;
type Session = ReturnType<typeof createKeyBackupSession>;
const A = '0123456789abcdef01234567';
const B = '1123456789abcdef01234567';
const TRIP = 'abcdef0123456789abcdef01';
const TOKEN_A = 'test-token-a';
const TOKEN_B = 'test-token-b';
const NEXT_TOKEN = 'test-token-a-next';
const PASSWORD = '  synthetic Caf\u00e9 password\n';
const PASSWORD_B = 'synthetic password b';
const NEW_PASSWORD = 'synthetic replacement password';
const bytes = (length: number, start: number) => Uint8Array.from({ length }, (_, i) => (start + i) % 256);
const ABK_A = bytes(32, 16);
const ABK_B = bytes(32, 80);
const GENERATION_A = encodeKey(bytes(16, 144));
const GENERATION_B = encodeKey(bytes(16, 176));
const CODE_A = `WTK1-${encodeKey(bytes(32, 192))}`;
const CODE_B = `WTK1-${encodeKey(bytes(32, 224))}`;
const absent = (userId = A): AccountBackupState => ({ v: 1, userId, enrolled: false, revision: 0 });
const copy = <T>(value: T): T => structuredClone(value);
const failure = (status = 503) => Object.assign(new Error('Synthetic request failure.'), { status });

function deterministicRandom() {
  let counter = 0;
  return (length: number) => {
    const output = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 32) {
      const block = createHash('sha256').update(`session-test-random-${counter++}`).digest();
      output.set(block.subarray(0, Math.min(32, length - offset)), offset);
    }
    return output;
  };
}

// Only password KDF operations are replaced. These asynchronous, exact-password
// stubs make races deterministic without running PBKDF2. Recovery/trip wrappers,
// wire validation, ABK generation and the entire session controller are production.
// Real password vectors belong to chatKeyBackup.test.ts, not this lifecycle suite.
function fastCrypto() {
  const random = deterministicRandom();
  const real = createKeyBackupCrypto(random);
  const passwordCode = (userId: string, generation: string, password: string, salt: string) =>
    `WTK1-${encodeKey(createHash('sha256').update(JSON.stringify([userId, generation, password, salt])).digest())}`;
  return {
    ...real,
    generateAccountKey: mock.fn(real.generateAccountKey),
    wrapPassword: mock.fn(async (userId: string, generation: string, password: string, key: Uint8Array): Promise<PasswordWrap> => {
      const salt = encodeKey(random(16));
      return { salt, ...real.wrapRecovery(userId, generation, passwordCode(userId, generation, password, salt), key) };
    }),
    unwrapPassword: mock.fn(async (userId: string, generation: string, password: string, wrap: PasswordWrap): Promise<Uint8Array> =>
      real.unwrapRecovery(userId, generation, passwordCode(userId, generation, password, wrap.salt), { iv: wrap.iv, ct: wrap.ct })),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function gate() {
  const entered = deferred<void>();
  const released = deferred<void>();
  return {
    entered: entered.promise,
    release: () => released.resolve(),
    async wait() { entered.resolve(); await released.promise; },
  };
}

function storage(memoryOnly = false) {
  const values = new Map<string, string>();
  let lastAccount: string | null = null;
  const events: string[] = [];
  return {
    values,
    events,
    get: mock.fn(async (userId: string) => { events.push(`get:${userId}`); return memoryOnly ? null : values.get(userId) ?? null; }),
    set: mock.fn(async (userId: string, value: string) => {
      events.push(`set:${userId}`);
      if (!memoryOnly) { values.set(userId, value); lastAccount = userId; }
    }),
    remove: mock.fn(async (userId: string) => {
      events.push(`remove:${userId}`);
      values.delete(userId);
      if (lastAccount === userId) lastAccount = null;
    }),
    select: mock.fn(async (userId: string) => {
      events.push(`select:${userId}`);
      if (lastAccount && lastAccount !== userId) { values.delete(lastAccount); lastAccount = null; }
    }),
    clearLast: mock.fn(async () => {
      if (lastAccount) values.delete(lastAccount);
      lastAccount = null;
    }),
  };
}

function server(initial: AccountBackupState) {
  const state = { metadata: copy(initial), rows: new Map<string, TripKeyBackup>() };
  const install = (input: BackupMutation): AccountBackupState => {
    if (state.metadata.revision !== input.expectedRevision) throw failure(409);
    state.metadata = {
      v: 1, userId: initial.userId, enrolled: true, generation: input.generation,
      revision: input.expectedRevision + 1, password: copy(input.password), recovery: copy(input.recovery),
    };
    return copy(state.metadata);
  };
  const api = {
    metadata: mock.fn(async (): Promise<AccountBackupState> => copy(state.metadata)),
    enroll: mock.fn(async (input: BackupMutation): Promise<AccountBackupState> => {
      if (state.metadata.enrolled) throw failure(409);
      return install(input);
    }),
    recover: mock.fn(async (input: BackupMutation): Promise<AccountBackupState> => {
      if (!state.metadata.enrolled) throw failure(409);
      return install(input);
    }),
    backups: mock.fn(async (tripId: string, before?: number) => ({
      backups: [...state.rows.values()].filter((row) => row.tripId === tripId && (before === undefined || row.epoch < before))
        .sort((left, right) => right.epoch - left.epoch).map(copy),
      nextBeforeEpoch: null as number | null,
    })),
    putBackup: mock.fn(async (tripId: string, epoch: number, generation: string, sealed: SealedKey, expectedRowRevision: number): Promise<TripKeyBackup> => {
      const slot = `${tripId}:${epoch}`;
      const previous = state.rows.get(slot);
      if ((previous?.rowRevision ?? 0) !== expectedRowRevision) throw failure(409);
      const row: TripKeyBackup = {
        v: 1, userId: initial.userId, tripId, epoch, generation,
        rowRevision: expectedRowRevision + 1, ...copy(sealed),
      };
      state.rows.set(slot, row);
      return copy(row);
    }),
    trips: mock.fn(async (_afterTripId?: string) => ({ trips: [], nextAfterTripId: null })),
    epochs: mock.fn(async (_tripId: string, _before?: number) => ({ currentEpoch: null, epochs: [], nextBeforeEpoch: null })),
    changePassword: mock.fn(async (_currentPassword: string, _newPassword: string, backup?: Parameters<ChatKeyBackupApi['changePassword']>[2]) => {
      if (backup) {
        if (!state.metadata.enrolled || backup.expectedRevision !== state.metadata.revision) throw failure(409);
        state.metadata = { ...state.metadata, revision: state.metadata.revision + 1, password: copy(backup.password) };
      }
      return { token: NEXT_TOKEN, message: 'Password updated.' };
    }),
  } satisfies ChatKeyBackupApi;
  return { state, api };
}

async function harness(options: { absent?: boolean; memoryOnly?: boolean } = {}) {
  const crypto = fastCrypto();
  const enrolled = async (userId: string, generation: string, key: Uint8Array, password: string, code: string): Promise<Enrolled> => ({
    v: 1, userId, enrolled: true, generation, revision: 1,
    password: await crypto.wrapPassword(userId, generation, password, key),
    recovery: crypto.wrapRecovery(userId, generation, code, key),
  });
  const a = server(options.absent ? absent() : await enrolled(A, GENERATION_A, ABK_A, PASSWORD, CODE_A));
  const b = server(await enrolled(B, GENERATION_B, ABK_B, PASSWORD_B, CODE_B));
  const store = storage(options.memoryOnly);
  const auth = { token: TOKEN_A as string | null };
  const deps = {
    crypto,
    storage: store,
    api: mock.fn((token: string): ChatKeyBackupApi => {
      if (token === TOKEN_A || token === NEXT_TOKEN) return a.api;
      if (token === TOKEN_B) return b.api;
      throw new Error('Unexpected synthetic token.');
    }),
    replaceToken: mock.fn(async (previous: string, next: string) => {
      if (auth.token !== previous) return false;
      auth.token = next;
      return true;
    }),
  };
  return { crypto, a, b, store, auth, deps, session: createKeyBackupSession(deps), enrolled };
}

type Harness = Awaited<ReturnType<typeof harness>>;

function assertState(session: Session, expected: Pick<ReturnType<Session['getSnapshot']>, 'userId' | 'status' | 'metadata'>) {
  const { userId, status, metadata } = session.getSnapshot();
  assert.deepEqual({ userId, status, metadata }, expected);
}

function assertStored(h: Harness, userId: string, generation: string, key: Uint8Array) {
  const raw = h.store.values.get(userId);
  assert.ok(raw, 'ABK must be persisted under its account ID');
  // Exact shape forbids storing passwords, recovery codes, tokens or trip keys.
  assert.deepEqual(JSON.parse(raw), { generation, key: encodeKey(key) });
}

function mutations(h: Harness) {
  return [h.a.api.enroll.mock.callCount(), h.a.api.recover.mock.callCount(), h.a.api.changePassword.mock.callCount(), h.a.api.putBackup.mock.callCount()];
}

function addRow(h: Harness, epoch: number, key: Uint8Array, userId = A, accountKey = ABK_A, generation = GENERATION_A) {
  const row: TripKeyBackup = {
    v: 1, userId, tripId: TRIP, epoch, generation, rowRevision: 1,
    ...h.crypto.wrapTrip(userId, generation, TRIP, epoch, key, accountKey),
  };
  (userId === A ? h.a : h.b).state.rows.set(`${TRIP}:${epoch}`, row);
  return row;
}

function history(h: Harness) {
  const chat = createChatCrypto(deterministicRandom());
  const items = [2, 7].map((epoch) => {
    const key = bytes(32, epoch * 17);
    addRow(h, epoch, key);
    const text = `Synthetic history for epoch ${epoch}`;
    return { epoch, key, text, body: chat.encryptText(key, text) };
  });
  return async (session: Session = h.session) => {
    const restored = await session.restoreTripKeys(A, TRIP);
    assert.equal(restored.size, items.length);
    for (const item of items) {
      const key = restored.get(item.epoch);
      assert.ok(key);
      assert.deepEqual(key, item.key);
      assert.equal(chat.decryptText(key, item.body), item.text);
    }
  };
}

test('only explicit absent metadata permits enrollment; confirmation persists only an account-scoped ABK', async () => {
  const h = await harness({ absent: true });
  await h.session.begin(A, TOKEN_A, PASSWORD);
  assertState(h.session, { userId: A, status: 'disabled', metadata: absent() });
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
  assert.equal(h.crypto.generateAccountKey.mock.callCount(), 0);
  assert.equal(h.store.set.mock.callCount(), 0);

  const draft = h.session.prepare();
  const key = draft.key.slice();
  assert.equal(draft.expectedRevision, 0);
  assert.equal(h.a.api.enroll.mock.callCount(), 0);
  await h.session.save(draft, PASSWORD);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assert.deepEqual(mutations(h), [1, 0, 0, 0]);
  assertStored(h, A, draft.generation, key);
  const saved = h.a.state.metadata as Enrolled;
  assert.deepEqual(h.crypto.unwrapRecovery(A, saved.generation, draft.code, saved.recovery), key);
  assert.deepEqual(await h.crypto.unwrapPassword(A, saved.generation, PASSWORD, saved.password!), key);
});

for (const status of [404, 503]) {
  test(`metadata HTTP ${status} is an error, never implicit absent enrollment`, async () => {
    const h = await harness();
    h.a.api.metadata.mock.mockImplementation(async () => { throw failure(status); });
    await h.session.begin(A, TOKEN_A, PASSWORD);
    assert.equal(h.session.getSnapshot().status, 'error');
    assert.equal(h.session.getSnapshot().metadata, null);
    assert.throws(() => h.session.prepare(), /status/i);
    assert.deepEqual(mutations(h), [0, 0, 0, 0]);
    assert.equal(h.crypto.generateAccountKey.mock.callCount(), 0);
    assert.equal(h.store.set.mock.callCount(), 0);
  });
}

test('an inexact password locks existing backup without enrollment, rewrapping or metadata replacement', async () => {
  const h = await harness();
  const metadata = copy(h.a.state.metadata);
  await h.session.begin(A, TOKEN_A, PASSWORD.trim());
  assert.equal(h.session.getSnapshot().status, 'locked');
  assert.deepEqual(h.session.getSnapshot().metadata, metadata);
  assert.throws(() => h.session.prepare(), /recovery code/i);
  await assert.rejects(h.session.changePassword(PASSWORD.trim(), NEW_PASSWORD), /Nothing was changed/);
  assert.deepEqual(h.a.state.metadata, metadata);
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
  assert.equal(h.crypto.generateAccountKey.mock.callCount(), 0);
  assert.equal(h.store.set.mock.callCount(), 0);
  await h.session.unlock(PASSWORD);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assertStored(h, A, GENERATION_A, ABK_A);
});

test('out-of-order metadata replies cannot regress the latest revision or status', async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A);
  const older = deferred<AccountBackupState>();
  const newer = deferred<AccountBackupState>();
  let requests = 0;
  h.a.api.metadata.mock.mockImplementation(() => requests++ === 0 ? older.promise : newer.promise);
  const first = h.session.refresh();
  const second = h.session.refresh();
  assert.equal(requests, 2);
  const latest: Enrolled = { ...h.a.state.metadata as Enrolled, revision: 3, password: null };
  newer.resolve(latest);
  await second;
  older.resolve({ ...h.a.state.metadata as Enrolled, revision: 2 });
  await first;
  assertState(h.session, { userId: A, metadata: latest, status: 'recoveryNeeded' });
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
});

test('a stale metadata error cannot overwrite a newer successful refresh', async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const older = deferred<AccountBackupState>();
  h.a.api.metadata.mock.mockImplementationOnce(() => older.promise);
  const pending = h.session.refresh();
  await h.session.refresh();
  const latest = copy(h.session.getSnapshot());
  older.reject(failure());
  await pending;
  assert.deepEqual(h.session.getSnapshot(), latest);
});

test('a metadata response for signed-out A cannot replace signed-in B', async () => {
  const h = await harness();
  const waiting = gate();
  h.a.api.metadata.mock.mockImplementation(async () => { await waiting.wait(); return copy(h.a.state.metadata); });
  const pending = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  await h.session.end();
  await h.session.begin(B, TOKEN_B, PASSWORD_B);
  const latest = copy(h.session.getSnapshot());
  waiting.release();
  await pending;
  assert.deepEqual(h.session.getSnapshot(), latest);
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.equal(h.store.values.has(A), false);
  assert.equal(h.crypto.unwrapPassword.mock.calls.some((call) => call.arguments[0] === A), false);
});

test('logout during password derivation cannot resurrect A or persist its ABK into B', { timeout: 5000 }, async () => {
  const h = await harness();
  const waiting = gate();
  const unwrap = h.crypto.unwrapPassword;
  let derived: Uint8Array | undefined;
  h.crypto.unwrapPassword = mock.fn(async (...args: Parameters<typeof unwrap>) => {
    const result = await unwrap(...args);
    if (args[0] === A) { derived = result; await waiting.wait(); }
    return result;
  });
  const pending = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  await h.session.end();
  await h.session.begin(B, TOKEN_B, PASSWORD_B);
  const latest = copy(h.session.getSnapshot());
  waiting.release();
  await pending;
  assert.deepEqual(h.session.getSnapshot(), latest);
  assert.equal(h.store.set.mock.calls.some((call) => call.arguments[0] === A), false);
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.ok(derived?.every((byte) => byte === 0), 'obsolete derived key must be wiped');
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
});

test('logout serializes behind an in-flight A storage write before B is selected', { timeout: 5000 }, async () => {
  const h = await harness();
  const waiting = gate();
  const set = h.store.set;
  h.store.set = mock.fn(async (userId: string, value: string) => {
    if (userId === A) await waiting.wait();
    await set(userId, value);
  });
  const pending = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  const ending = h.session.end();
  assert.equal(h.session.getSnapshot().status, 'idle');
  const emitted: (string | null)[] = [];
  const unsubscribe = h.session.subscribe(() => emitted.push(h.session.getSnapshot().userId));
  const signingIn = h.session.begin(B, TOKEN_B, PASSWORD_B);
  waiting.release();
  await Promise.all([pending, ending, signingIn]);
  unsubscribe();
  assert.equal(emitted.includes(A), false);
  assert.equal(h.session.getSnapshot().userId, B);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assert.equal(h.store.values.has(A), false);
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.ok(h.store.events.indexOf(`set:${A}`) < h.store.events.indexOf(`remove:${A}`));
  assert.ok(h.store.events.indexOf(`remove:${A}`) < h.store.events.indexOf(`select:${B}`));
  for (const call of h.store.set.mock.calls) {
    const [userId, raw] = call.arguments;
    assert.deepEqual(JSON.parse(raw), userId === A
      ? { generation: GENERATION_A, key: encodeKey(ABK_A) }
      : { generation: GENERATION_B, key: encodeKey(ABK_B) });
  }
});

test('logout during enrollment upload ignores A completion after B signs in', { timeout: 5000 }, async () => {
  const h = await harness({ absent: true });
  await h.session.begin(A, TOKEN_A);
  const draft = h.session.prepare();
  const waiting = gate();
  const enroll = h.a.api.enroll;
  h.a.api.enroll = mock.fn(async (input: BackupMutation) => { await waiting.wait(); return enroll(input); });
  const saving = assert.rejects(h.session.save(draft, PASSWORD), /account changed/i);
  await waiting.entered;
  await h.session.end();
  await h.session.begin(B, TOKEN_B, PASSWORD_B);
  const latest = copy(h.session.getSnapshot());
  waiting.release();
  await saving;
  assert.deepEqual(h.session.getSnapshot(), latest);
  assert.equal(h.store.values.has(A), false);
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.equal(h.b.api.enroll.mock.callCount(), 0);
  assert.equal(h.b.api.recover.mock.callCount(), 0);
  assert.equal(h.a.api.metadata.mock.callCount(), 1, 'stale completion must not refetch through the old session');
});

test('logout during a trip upload cannot pollute B row cache or send A keys through B API', { timeout: 5000 }, async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const waiting = gate();
  const put = h.a.api.putBackup;
  h.a.api.putBackup = mock.fn(async (...args: Parameters<typeof put>) => { await waiting.wait(); return put(...args); });
  const keyA = bytes(32, 31);
  const keyB = bytes(32, 63);
  const uploading = assert.rejects(h.session.backupTripKey(A, TRIP, 4, keyA), /account changed/i);
  await waiting.entered;
  await h.session.end();
  await h.session.begin(B, TOKEN_B, PASSWORD_B);
  waiting.release();
  await uploading;
  await h.session.backupTripKey(B, TRIP, 4, keyB);
  assert.equal(h.b.api.putBackup.mock.callCount(), 1);
  const restored = await h.session.restoreTripKeys(B, TRIP);
  assert.deepEqual(restored.get(4), keyB);
  assert.deepEqual(keyA, bytes(32, 31));
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.equal(h.store.values.has(A), false);
});

test('overlapping begin calls honor the latest ticket even while storage selection is pending', { timeout: 5000 }, async () => {
  const h = await harness();
  const waiting = gate();
  const select = h.store.select;
  h.store.select = mock.fn(async (userId: string) => { if (userId === A) await waiting.wait(); await select(userId); });
  const first = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  const second = h.session.begin(B, TOKEN_B, PASSWORD_B);
  waiting.release();
  await Promise.all([first, second]);
  assert.equal(h.a.api.metadata.mock.callCount(), 0);
  assert.deepEqual(h.deps.api.mock.calls.map((call) => call.arguments[0]), [TOKEN_B]);
  assert.equal(h.session.getSnapshot().userId, B);
  assertStored(h, B, GENERATION_B, ABK_B);
});

test('ending a pending begin prevents later storage selection from creating a session', { timeout: 5000 }, async () => {
  const h = await harness();
  const waiting = gate();
  h.store.select.mock.mockImplementation(async () => waiting.wait());
  const beginning = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  const ending = h.session.end();
  waiting.release();
  await Promise.all([beginning, ending]);
  assertState(h.session, { userId: null, status: 'idle', metadata: null });
  assert.equal(h.deps.api.mock.callCount(), 0);
  assert.equal(h.store.clearLast.mock.callCount(), 1);
});

test('a new begin for the same account isolates the previous session derivation and drafts', { timeout: 5000 }, async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const draft = h.session.prepare();
  const waiting = gate();
  const unwrap = h.crypto.unwrapPassword;
  h.crypto.unwrapPassword = mock.fn(async (...args: Parameters<typeof unwrap>) => { await waiting.wait(); return unwrap(...args); });
  const first = h.session.begin(A, TOKEN_A, PASSWORD);
  await waiting.entered;
  await h.session.begin(A, NEXT_TOKEN);
  waiting.release();
  await first;
  assert.equal(h.session.getSnapshot().status, 'locked');
  assert.equal(h.store.values.has(A), false);
  await assert.rejects(h.session.save(draft, PASSWORD), /session ended/i);
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
});

test('process restart restores a matching stored generation without a password derivation', async () => {
  const h = await harness();
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const unwrapCount = h.crypto.unwrapPassword.mock.callCount();
  // A process restart creates a controller without logout (logout intentionally deletes ABK).
  const restarted = createKeyBackupSession(h.deps);
  await restarted.begin(A, TOKEN_A);
  assert.equal(restarted.getSnapshot().status, 'ready');
  assert.equal(h.crypto.unwrapPassword.mock.callCount(), unwrapCount);
  assertStored(h, A, GENERATION_A, ABK_A);
  await assertHistory(restarted);
});

for (const kind of ['wrong generation', 'malformed JSON', 'malformed key', 'different account'] as const) {
  test(`process restart never adopts a stored ABK with ${kind}`, async () => {
    const h = await harness();
    const stored = kind === 'malformed JSON' ? '{not-json'
      : JSON.stringify({ generation: kind === 'wrong generation' ? GENERATION_B : GENERATION_A, key: kind === 'malformed key' ? 'invalid' : encodeKey(ABK_A) });
    h.store.values.set(kind === 'different account' ? B : A, stored);
    const restarted = createKeyBackupSession(h.deps);
    await restarted.begin(A, TOKEN_A);
    assert.equal(restarted.getSnapshot().status, 'locked');
    assert.equal((await restarted.restoreTripKeys(A, TRIP)).size, 0);
    assert.equal(h.a.api.backups.mock.callCount(), 0);
    assert.equal(h.store.set.mock.callCount(), 0);
    assert.deepEqual(h.store.get.mock.calls.map((call) => call.arguments[0]), [A]);
    if (kind.startsWith('malformed')) assert.equal(h.store.values.has(A), false);
  });
}

test('web memory-only refresh retains the unlocked ABK, but a new controller remains locked', async () => {
  const h = await harness({ memoryOnly: true });
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  await assertHistory();
  const unwrapCount = h.crypto.unwrapPassword.mock.callCount();
  await h.session.refresh();
  await h.session.refresh();
  assert.equal(h.session.getSnapshot().status, 'ready');
  assert.equal(h.store.values.size, 0);
  assert.equal(h.crypto.unwrapPassword.mock.callCount(), unwrapCount);
  assert.equal(h.store.get.mock.callCount(), 0);
  await assertHistory();
  const restarted = createKeyBackupSession(h.deps);
  await restarted.begin(A, TOKEN_A);
  assert.equal(restarted.getSnapshot().status, 'locked');
});

test('a null password wrapper requires recovery, then rewraps the existing ABK without enrolling', async () => {
  const h = await harness();
  h.a.state.metadata = { ...h.a.state.metadata as Enrolled, revision: 2, password: null };
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, NEW_PASSWORD);
  assert.equal(h.session.getSnapshot().status, 'recoveryNeeded');
  assert.equal(h.crypto.unwrapPassword.mock.callCount(), 0);
  assert.throws(() => h.session.prepare(), /recovery code/i);
  await assert.rejects(h.session.changePassword(PASSWORD, NEW_PASSWORD), /recovery code/i);
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
  const draft = h.session.prepare(`  ${CODE_A}\n`);
  assert.equal(draft.generation, GENERATION_A);
  assert.equal(draft.expectedRevision, 2);
  assert.deepEqual(draft.key, ABK_A);
  assert.equal(h.crypto.generateAccountKey.mock.callCount(), 0);
  await h.session.save(draft, NEW_PASSWORD);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assert.deepEqual(mutations(h), [0, 1, 0, 0]);
  assertStored(h, A, GENERATION_A, ABK_A);
  await assertHistory();
  const metadata = h.a.state.metadata as Enrolled;
  assert.deepEqual(h.crypto.unwrapRecovery(A, GENERATION_A, draft.code, metadata.recovery), ABK_A);
  assert.throws(() => h.crypto.unwrapRecovery(A, GENERATION_A, CODE_A, metadata.recovery));
});

test('a reset password wrapper remains recoveryNeeded even with a matching locally stored ABK', async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  h.a.state.metadata = { ...h.a.state.metadata as Enrolled, revision: 2, password: null };
  await h.session.refresh();
  assert.equal(h.session.getSnapshot().status, 'recoveryNeeded');
  assert.equal((await h.session.restoreTripKeys(A, TRIP)).size, 0);
  assert.deepEqual(h.session.prepare().key, ABK_A);
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
});

test('a wrong recovery code causes no local, server or draft-key mutation', async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A);
  const before = copy(h.session.getSnapshot());
  const stored = new Map(h.store.values);
  for (const code of [CODE_B, 'not-a-recovery-code']) {
    assert.throws(() => h.session.prepare(code), /does not open this account/);
  }
  assert.deepEqual(h.session.getSnapshot(), before);
  assert.deepEqual(h.a.state.metadata, before.metadata);
  assert.deepEqual(h.store.values, stored);
  assert.equal(h.store.set.mock.callCount(), 0);
  assert.equal(h.crypto.generateAccountKey.mock.callCount(), 0);
  assert.deepEqual(mutations(h), [0, 0, 0, 0]);
});

test('competing enrollment 409 discards the losing candidate and unlocks the winning ABK', async () => {
  const h = await harness({ absent: true });
  await h.session.begin(A, TOKEN_A);
  const draft = h.session.prepare();
  const losingCode = draft.code;
  const losingGeneration = draft.generation;
  const winner = await h.enrolled(A, GENERATION_A, ABK_A, PASSWORD, CODE_A);
  h.a.state.metadata = winner;
  const assertHistory = history(h);
  await assert.rejects(h.session.save(draft, PASSWORD), /changed on another device/i);
  assert.ok(draft.key.every((byte) => byte === 0));
  assert.equal(draft.code, '');
  assert.equal(draft.sessionId, -1);
  assert.notEqual(losingGeneration, GENERATION_A);
  assert.throws(() => h.crypto.unwrapRecovery(A, GENERATION_A, losingCode, winner.recovery));
  assert.deepEqual(h.session.getSnapshot().metadata, winner);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assertStored(h, A, GENERATION_A, ABK_A);
  await assertHistory();
  await assert.rejects(h.session.save(draft, PASSWORD), /session ended/i);
  assert.equal(h.a.api.enroll.mock.callCount(), 1);
  assert.equal(h.a.api.recover.mock.callCount(), 0);
});

for (const operation of ['enroll', 'recover'] as const) {
  test(`uncertain ${operation} succeeds only after refetch confirms both installed wrappers`, async () => {
    const h = await harness({ absent: operation === 'enroll' });
    await h.session.begin(A, TOKEN_A, PASSWORD);
    const draft = h.session.prepare();
    const key = draft.key.slice();
    const original = h.a.api[operation];
    h.a.api[operation] = mock.fn(async (input: BackupMutation) => { await original(input); throw failure(); });
    await h.session.save(draft, PASSWORD);
    assert.equal(h.session.getSnapshot().status, 'ready');
    assert.equal(h.a.api[operation].mock.callCount(), 1);
    assert.equal(h.a.api.metadata.mock.callCount(), 2);
    assertStored(h, A, draft.generation, key);
  });
}

const altered = (encoded: string) => {
  const raw = Buffer.from(encoded, 'base64url');
  raw[0] ^= 1;
  return encodeKey(raw);
};

for (const field of ['generation', 'password.ct', 'password.iv', 'password.salt', 'recovery.ct', 'recovery.iv', 'password=null'] as const) {
  test(`uncertain save does not adopt a candidate when installed ${field} differs`, async () => {
    const h = await harness({ absent: true });
    await h.session.begin(A, TOKEN_A);
    const draft = h.session.prepare();
    const enroll = h.a.api.enroll;
    h.a.api.enroll = mock.fn(async (input: BackupMutation) => {
      const saved = await enroll(input) as Enrolled;
      if (field === 'generation') saved.generation = GENERATION_B;
      else if (field === 'password=null') saved.password = null;
      else if (field === 'password.ct') saved.password!.ct = altered(saved.password!.ct);
      else if (field === 'password.iv') saved.password!.iv = altered(saved.password!.iv);
      else if (field === 'password.salt') saved.password!.salt = altered(saved.password!.salt);
      else if (field === 'recovery.ct') saved.recovery.ct = altered(saved.recovery.ct);
      else saved.recovery.iv = altered(saved.recovery.iv);
      h.a.state.metadata = saved;
      throw failure();
    });
    await assert.rejects(h.session.save(draft, PASSWORD), /Synthetic request failure/);
    assert.notEqual(h.session.getSnapshot().status, 'ready');
    assert.equal(h.store.set.mock.callCount(), 0);
    assert.equal(h.store.values.size, 0);
    assert.equal(h.a.api.enroll.mock.callCount(), 1);
    assert.equal(h.a.api.recover.mock.callCount(), 0);
    assert.equal(h.a.api.metadata.mock.callCount(), 2);
  });
}

test('password change uses token CAS and preserves ABK, recovery wrapper and decryptable chat history', async () => {
  const h = await harness();
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const before = copy(h.a.state.metadata as Enrolled);
  await assertHistory();
  assert.equal(await h.session.changePassword(PASSWORD, NEW_PASSWORD), 'Password updated.');
  assert.deepEqual(h.deps.replaceToken.mock.calls.map((call) => call.arguments), [[TOKEN_A, NEXT_TOKEN]]);
  assert.equal(h.auth.token, NEXT_TOKEN);
  assert.deepEqual(h.deps.api.mock.calls.map((call) => call.arguments[0]), [TOKEN_A, NEXT_TOKEN]);
  const after = h.session.getSnapshot().metadata as Enrolled;
  assert.equal(after.generation, before.generation);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.recovery, before.recovery);
  assert.notDeepEqual(after.password, before.password);
  assert.deepEqual(await h.crypto.unwrapPassword(A, GENERATION_A, NEW_PASSWORD, after.password!), ABK_A);
  await assert.rejects(h.crypto.unwrapPassword(A, GENERATION_A, PASSWORD, after.password!));
  assert.deepEqual(h.crypto.unwrapRecovery(A, GENERATION_A, CODE_A, after.recovery), ABK_A);
  assertStored(h, A, GENERATION_A, ABK_A);
  await assertHistory();
  assert.equal(h.a.api.enroll.mock.callCount(), 0);
  assert.equal(h.a.api.recover.mock.callCount(), 0);
  assert.equal(h.a.api.putBackup.mock.callCount(), 0);
});

test('password-change CAS failure cannot replace another session token or adopt the new wrapper', async () => {
  const h = await harness();
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const before = copy(h.session.getSnapshot());
  const writes = h.store.set.mock.callCount();
  h.auth.token = TOKEN_B;
  await assert.rejects(h.session.changePassword(PASSWORD, NEW_PASSWORD), /session changed/i);
  assert.equal(h.auth.token, TOKEN_B);
  assert.deepEqual(h.deps.replaceToken.mock.calls.map((call) => call.arguments), [[TOKEN_A, NEXT_TOKEN]]);
  assert.equal(h.deps.api.mock.callCount(), 1);
  assert.equal(h.store.set.mock.callCount(), writes);
  assert.deepEqual(h.session.getSnapshot(), before);
  await assertHistory();
});

test('logout during password-change upload cannot CAS or rewrap B', { timeout: 5000 }, async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const waiting = gate();
  const change = h.a.api.changePassword;
  h.a.api.changePassword = mock.fn(async (...args: Parameters<typeof change>) => { await waiting.wait(); return change(...args); });
  const changing = assert.rejects(h.session.changePassword(PASSWORD, NEW_PASSWORD), /account changed/i);
  await waiting.entered;
  await h.session.end();
  h.auth.token = TOKEN_B;
  await h.session.begin(B, TOKEN_B, PASSWORD_B);
  const latest = copy(h.session.getSnapshot());
  waiting.release();
  await changing;
  assert.equal(h.deps.replaceToken.mock.callCount(), 0);
  assert.equal(h.auth.token, TOKEN_B);
  assert.deepEqual(h.session.getSnapshot(), latest);
  assertStored(h, B, GENERATION_B, ABK_B);
  assert.equal(h.b.api.changePassword.mock.callCount(), 0);
});

for (const stage of ['derivation', 'verification', 'upload'] as const) {
  test(`save failure during ${stage} preserves the unlocked ABK and history`, async () => {
    const h = await harness();
    const assertHistory = history(h);
    await h.session.begin(A, TOKEN_A, PASSWORD);
    const before = copy(h.a.state.metadata);
    const draft = h.session.prepare();
    const writes = h.store.set.mock.callCount();
    if (stage === 'derivation') {
      h.crypto.wrapPassword.mock.mockImplementation(async () => { throw failure(); });
    } else if (stage === 'verification') {
      h.crypto.unwrapPassword.mock.mockImplementation(async () => ABK_B.slice());
    } else {
      h.a.api.recover.mock.mockImplementation(async () => { throw failure(); });
    }
    await assert.rejects(h.session.save(draft, PASSWORD));
    assert.deepEqual(h.a.state.metadata, before);
    assert.deepEqual(h.session.getSnapshot().metadata, before);
    assert.equal(h.session.getSnapshot().status, 'ready');
    assert.equal(h.store.set.mock.callCount(), writes);
    assertStored(h, A, GENERATION_A, ABK_A);
    assert.deepEqual(draft.key, ABK_A);
    assert.equal(h.a.api.enroll.mock.callCount(), 0);
    assert.equal(h.a.api.recover.mock.callCount(), stage === 'upload' ? 1 : 0);
    await assertHistory();
  });
}

test('secure-storage failure after confirmed recovery preserves usable in-memory ABK and reports it', async () => {
  const h = await harness({ memoryOnly: true });
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const draft = h.session.prepare();
  h.store.set.mock.mockImplementation(async () => { throw new Error('Synthetic storage failure.'); });
  await h.session.save(draft, PASSWORD);
  assert.equal(h.session.getSnapshot().status, 'ready');
  assert.match(h.session.getSnapshot().error ?? '', /could not be saved securely/i);
  assert.equal(h.store.values.size, 0);
  await assertHistory();
  await h.session.refresh();
  assert.equal(h.session.getSnapshot().status, 'ready');
  await assertHistory();
});

test('backup row 409 fetches and decrypts the existing row; matching plaintext is idempotent', async () => {
  const h = await harness();
  const key = bytes(32, 40);
  const existing = copy(addRow(h, 7, key));
  await h.session.begin(A, TOKEN_A, PASSWORD);
  await h.session.backupTripKey(A, TRIP, 7, key);
  assert.equal(h.a.api.putBackup.mock.callCount(), 1);
  assert.deepEqual(h.a.api.backups.mock.calls[0].arguments, [TRIP, 8]);
  const args = h.a.api.putBackup.mock.calls[0].arguments;
  assert.equal(args[4], 0, 'initial upload must use create-only revision');
  assert.notEqual(args[3].ct, existing.ct, 'comparison must open wrappers, not compare randomized ciphertext');
  assert.deepEqual(h.a.state.rows.get(`${TRIP}:7`), existing);
  await h.session.backupTripKey(A, TRIP, 7, key);
  assert.equal(h.a.api.putBackup.mock.callCount(), 1, 'matching cached row must not be reuploaded');
  assert.equal(h.a.api.backups.mock.callCount(), 1);
  await assert.rejects(h.session.backupTripKey(A, TRIP, 7, bytes(32, 41)), /Nothing was overwritten/);
  assert.equal(h.a.api.putBackup.mock.callCount(), 1);
  assert.deepEqual(h.a.state.rows.get(`${TRIP}:7`), existing);
  assert.deepEqual((await h.session.restoreTripKeys(A, TRIP)).get(7), key);
});

for (const kind of ['different key', 'tampered ciphertext', 'different generation', 'different account', 'missing row'] as const) {
  test(`backup row 409 with ${kind} never blindly overwrites or repairs the server row`, async () => {
    const h = await harness();
    const wanted = bytes(32, 40);
    const existing = addRow(h, 7, kind === 'different key' ? bytes(32, 41) : wanted);
    if (kind === 'tampered ciphertext') existing.ct = altered(existing.ct);
    if (kind === 'different generation') {
      Object.assign(existing, h.crypto.wrapTrip(A, GENERATION_B, TRIP, 7, wanted, ABK_A), { generation: GENERATION_B });
    }
    if (kind === 'different account') existing.userId = B;
    const before = copy(existing);
    if (kind === 'missing row') h.a.api.backups.mock.mockImplementation(async () => ({ backups: [], nextBeforeEpoch: null }));
    await h.session.begin(A, TOKEN_A, PASSWORD);
    // Deliberately omit any canonical-repair option: an arbitrary local key is not authority.
    await assert.rejects(h.session.backupTripKey(A, TRIP, 7, wanted));
    assert.equal(h.a.api.putBackup.mock.callCount(), 1);
    assert.equal(h.a.api.putBackup.mock.calls[0].arguments[4], 0);
    assert.equal(h.a.api.backups.mock.callCount(), 1);
    assert.deepEqual(h.a.state.rows.get(`${TRIP}:7`), before);
    assert.equal(h.session.getSnapshot().status, 'ready');
    assertStored(h, A, GENERATION_A, ABK_A);
    assert.deepEqual(wanted, bytes(32, 40));
  });
}

test('failed trip upload does not cache an unsaved row or damage either key; retry stays create-only', async () => {
  const h = await harness();
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const key = bytes(32, 40);
  h.a.api.putBackup.mock.mockImplementationOnce(async () => { throw failure(); });
  await assert.rejects(h.session.backupTripKey(A, TRIP, 7, key), /Synthetic request failure/);
  assert.equal(h.a.state.rows.size, 0);
  assert.equal(h.a.api.backups.mock.callCount(), 0);
  assertStored(h, A, GENERATION_A, ABK_A);
  await h.session.backupTripKey(A, TRIP, 7, key);
  assert.equal(h.a.api.putBackup.mock.callCount(), 2);
  assert.deepEqual(h.a.api.putBackup.mock.calls.map((call) => call.arguments[4]), [0, 0]);
  assert.deepEqual((await h.session.restoreTripKeys(A, TRIP)).get(7), key);
  assert.deepEqual(key, bytes(32, 40));
});

test('a rejected password change leaves existing wrappers, token and chat history untouched', async () => {
  const h = await harness();
  const assertHistory = history(h);
  await h.session.begin(A, TOKEN_A, PASSWORD);
  const before = copy(h.a.state.metadata);
  h.a.api.changePassword.mock.mockImplementation(async () => { throw failure(); });
  await assert.rejects(h.session.changePassword(PASSWORD, NEW_PASSWORD), /Synthetic request failure/);
  assert.deepEqual(h.session.getSnapshot().metadata, before);
  assert.deepEqual(h.a.state.metadata, before);
  assert.equal(h.auth.token, TOKEN_A);
  assert.equal(h.deps.replaceToken.mock.callCount(), 0);
  assertStored(h, A, GENERATION_A, ABK_A);
  await assertHistory();
});

test('storage adapters may omit selection/cleanup helpers without persisting extra material', async () => {
  const h = await harness();
  const session = createKeyBackupSession({ ...h.deps, storage: { get: h.store.get, set: h.store.set, remove: h.store.remove } });
  await session.begin(A, TOKEN_A, PASSWORD);
  assertStored(h, A, GENERATION_A, ABK_A);
  assert.equal(decodeKey(JSON.parse(h.store.values.get(A)!).key, 32).length, 32);
  await session.end();
  await session.end();
  assert.equal(h.store.values.size, 0);
  assert.deepEqual(h.store.remove.mock.calls.map((call) => call.arguments[0]), [A]);
});
