import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../../models/User.js';
import Trip from '../../models/Trip.js';
import TripChatKey from '../../models/TripChatKey.js';
import TripChatKeyBackup from '../../models/TripChatKeyBackup.js';
import PasswordResetToken from '../../models/PasswordResetToken.js';
import {
  getAccountBackup, enrollAccountBackup, recoverAccountBackup, changePersonalPassword,
  credentialCASFilter, projectAccountBackup, getBackupEpochs, getTripBackups, putTripBackup,
} from './keyBackup.js';
import { resetPasswordWithToken } from './passwordReset.js';
import { publicUser } from '../user/profile.js';
import {
  enrollKeyBackupSchema, recoverKeyBackupSchema, putTripKeyBackupSchema,
  keyBackupPageSchema, passwordWrapSchema, isCanonicalBase64url,
} from '../../schemas/keyBackup.schema.js';
import { personalChangePasswordSchema } from '../../schemas/profile.schema.js';
import { addChatEnvelopesSchema } from '../../schemas/chatKey.schema.js';
import { addTripChatEnvelopes } from '../collab/chatKeys.js';

const uid = '507f1f77bcf86cd799439011';
const other = '507f1f77bcf86cd799439012';
const tid = '507f1f77bcf86cd799439021';
const binary = (n: number, fill = 1) => Buffer.alloc(n, fill).toString('base64url');
const generation = binary(16);
const password = { salt: binary(16), iv: binary(12), ct: binary(48) };
const recovery = { iv: binary(12, 2), ct: binary(48, 2) };
const metadata = () => ({ v: 1, generation, revision: 1, password, recovery });
const enrollment = () => ({ v: 1, currentPassword: ' old password ', expectedRevision: 0, generation, password, recovery });
const tripInput = () => ({ v: 1, generation, expectedRowRevision: 0, iv: binary(12), ct: binary(48) });
const currentHash = await bcrypt.hash(' old password ', 4);
const copy = <T>(value: T): T => structuredClone(value);
const pathValue = (row: any, path: string) => path.split('.').reduce((r, part) => r?.[part], row);
function matches(row: any, filter: any): boolean {
  if (!row) return false;
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    const actual = pathValue(row, key);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
      if ('$ne' in value) return actual !== value.$ne;
      if ('$lt' in value) return actual < value.$lt;
      if ('$gt' in value) return actual > value.$gt;
      if ('$in' in value) return value.$in.map(String).includes(String(actual));
    }
    return String(actual) === String(value);
  });
}
function apply(row: any, update: any) {
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    const parts = path.split('.');
    const last = parts.pop()!;
    let target = row;
    for (const part of parts) target = target[part] ??= {};
    target[last] = copy(value);
  }
}
function query(value: any): any {
  return {
    select: () => query(value), lean: () => Promise.resolve(value),
    sort: () => query(Array.isArray(value) ? [...value].sort((a, b) => b.epoch - a.epoch) : value),
    limit: (n: number) => query(value.slice(0, n)),
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
}
function storage(t: TestContext, enrolled = true) {
  const db: any = {
    user: { _id: uid, email: 'synthetic@example.test', accountType: 'personal', status: 'active', password: currentHash, tokenVersion: 0,
      ...(enrolled ? { keyBackup: metadata() } : {}) },
    trip: { _id: tid, members: [{ userId: uid, role: 'viewer' }, { userId: other, role: 'owner' }] },
    epochs: [1, 2, 3].map((epoch) => ({ _id: `epoch-${epoch}`, tripId: tid, epoch, envelopes: new Map([[uid, 'b3du'], [other, 'b3RoZXI=']]) })),
    rows: [], userWrites: [], rowWrites: [], deletes: [], beforeUserWrite: undefined, afterRowWrite: undefined,
  };
  t.mock.method(User, 'findOne', (filter: any) => query(matches(db.user, filter) ? copy(db.user) : null));
  t.mock.method(User, 'findOneAndUpdate', (filter: any, update: any) => {
    db.userWrites.push({ filter, update });
    db.beforeUserWrite?.();
    if (!matches(db.user, filter)) return query(null);
    apply(db.user, update);
    return query(copy(db.user));
  });
  t.mock.method(User, 'find', () => query([{ _id: uid }, { _id: other }]));
  t.mock.method(Trip, 'findOne', (filter: any) => query(matches(db.trip, filter) ? copy(db.trip) : null));
  t.mock.method(TripChatKey, 'exists', (filter: any) => query(db.epochs.find((row: any) => matches(row, filter)) ?? null));
  t.mock.method(TripChatKey, 'find', (filter: any) => query(db.epochs.filter((row: any) => matches(row, filter))));
  t.mock.method(TripChatKey, 'findOne', (filter: any) => query([...db.epochs].sort((a, b) => b.epoch - a.epoch).find((row: any) => matches(row, filter)) ?? null));
  t.mock.method(TripChatKeyBackup, 'find', (filter: any) => query(db.rows.filter((row: any) => matches(row, filter))));
  t.mock.method(TripChatKeyBackup, 'create', async (row: any) => {
    const { userId, tripId, epoch, generation } = row;
    if (db.rows.some((r: any) => matches(r, { userId, tripId, epoch, generation }))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    db.rows.push(copy(row)); db.rowWrites.push(copy(row));
    db.afterRowWrite?.();
    return copy(row);
  });
  t.mock.method(TripChatKeyBackup, 'findOneAndUpdate', (filter: any, update: any) => {
    const row = db.rows.find((r: any) => matches(r, filter));
    if (!row) return query(null);
    apply(row, update); db.rowWrites.push(copy(row)); db.afterRowWrite?.();
    return query(copy(row));
  });
  t.mock.method(TripChatKeyBackup, 'deleteMany', async (filter: any) => {
    db.deletes.push(filter);
    db.rows = db.rows.filter((row: any) => !matches(row, filter));
    return {} as any;
  });
  return db;
}
const status = (code: number) => (error: any) => error.statusCode === code;

test('v1 strictly validates binary lengths, alphabet, canonical pad bits, versions and unknown fields', () => {
  assert.equal(enrollKeyBackupSchema.safeParse(enrollment()).success, true);
  for (const bad of ['abc=', binary(16) + '=', binary(16).replace(/.$/, 'B'), binary(15), binary(17), ' ' + binary(16)]) {
    assert.equal(enrollKeyBackupSchema.safeParse({ ...enrollment(), generation: bad }).success, false, bad);
  }
  assert.equal(isCanonicalBase64url(binary(16), 16), true);
  for (const [key, bytes] of [['iv', 12], ['ct', 48], ['salt', 16]] as const) {
    assert.equal(passwordWrapSchema.safeParse({ ...password, [key]: binary(bytes - 1) }).success, false);
    assert.equal(passwordWrapSchema.safeParse({ ...password, [key]: binary(bytes + 1) }).success, false);
  }
  for (const input of [{ ...enrollment(), v: 2 }, { ...enrollment(), userId: other }, { ...enrollment(), recoveryCode: 'secret' }, { ...enrollment(), expectedRevision: 1 }]) {
    assert.equal(enrollKeyBackupSchema.safeParse(input).success, false);
  }
  assert.equal(recoverKeyBackupSchema.safeParse({ ...enrollment(), expectedRevision: 0 }).success, false);
  assert.equal(putTripKeyBackupSchema.safeParse({ ...tripInput(), epoch: 1 }).success, false);
  assert.equal(putTripKeyBackupSchema.safeParse({ ...tripInput(), expectedRowRevision: -1 }).success, false);
  assert.equal(putTripKeyBackupSchema.safeParse({ ...tripInput(), expectedRowRevision: Number.MAX_SAFE_INTEGER }).success, false);
});

test('pagination is strict, bounded and defaults to 25', () => {
  assert.deepEqual(keyBackupPageSchema.parse({}), { limit: 25 });
  assert.deepEqual(keyBackupPageSchema.parse({ beforeEpoch: '100', limit: '25' }), { beforeEpoch: 100, limit: 25 });
  for (const limit of ['0', '-1', '26', '1.5', '1e1', '', '01', ['1'], 1, ' 2']) {
    assert.equal(keyBackupPageSchema.safeParse({ limit }).success, false);
  }
  for (const beforeEpoch of ['0', '1000000001', ['3', '4']]) assert.equal(keyBackupPageSchema.safeParse({ beforeEpoch }).success, false);
  assert.equal(keyBackupPageSchema.safeParse({ userId: other }).success, false);
});

test('metadata absence is explicit; failures/corruption cannot become not-enrolled; publicUser excludes it', async (t) => {
  const db = storage(t, false);
  assert.deepEqual(await getAccountBackup(uid), { v: 1, userId: uid, enrolled: false, revision: 0 });
  db.user.keyBackup = metadata();
  assert.equal((await getAccountBackup(uid)).enrolled, true);
  assert.equal('keyBackup' in publicUser(db.user), false);
  assert.equal(User.schema.path('keyBackup').options.select, false);
  for (const value of [null, {}, { ...metadata(), password: undefined }]) {
    assert.throws(() => projectAccountBackup({ _id: uid, keyBackup: value }), status(500));
  }
  t.mock.method(User, 'findOne', () => { throw new Error('database unavailable'); });
  await assert.rejects(() => getAccountBackup(uid), /database unavailable/);
});

test('enrollment verifies the exact untrimmed password and races create-only', async (t) => {
  const db = storage(t, false);
  await assert.rejects(() => enrollAccountBackup(uid, { ...enrollment(), currentPassword: 'old password' }), status(401));
  assert.equal(db.userWrites.length, 0);
  const results = await Promise.allSettled([
    enrollAccountBackup(uid, enrollment()),
    enrollAccountBackup(uid, { ...enrollment(), generation: binary(16, 7) }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.statusCode === 409).length, 1);
  assert.equal(db.user.keyBackup.revision, 1);
  assert.equal(db.user.password, currentHash);
  assert.equal(db.user.tokenVersion, 0);
  for (const { filter } of db.userWrites) {
    assert.equal(filter.password, currentHash);
    assert.deepEqual(filter.keyBackup, { $exists: false });
    assert.equal(filter.accountType, 'personal'); assert.equal(filter.status, 'active');
  }
});

test('enrollment loses safely to a credential change', async (t) => {
  const db = storage(t, false);
  db.beforeUserWrite = () => { db.user.password = 'new-hash'; db.user.tokenVersion++; };
  await assert.rejects(() => enrollAccountBackup(uid, enrollment()), status(409));
  assert.equal(db.user.keyBackup, undefined);
});

test('legacy missing payload fails before writes with structured upgrade error', async (t) => {
  const db = storage(t);
  await assert.rejects(() => changePersonalPassword(uid, ' old password ', 'new password'),
    (error: any) => error.statusCode === 409 && error.code === 'KEY_BACKUP_UPDATE_REQUIRED' && /Update your app/.test(error.message));
  assert.equal(db.userWrites.length, 0);
  assert.equal(db.user.password, currentHash);
  assert.equal(personalChangePasswordSchema.safeParse({ currentPassword: 'x', newPassword: '123456', backup: null }).success, false);
});

test('password change replaces only the password wrapper and atomically bumps credentials/revision', async (t) => {
  const db = storage(t);
  const wrap = { ...password, ct: binary(48, 9) };
  const updated = await changePersonalPassword(uid, ' old password ', ' new password ', { generation, expectedRevision: 1, password: wrap });
  assert.ok(await bcrypt.compare(' new password ', updated.password));
  assert.equal(updated.tokenVersion, 1);
  assert.ok(updated.passwordChangedAt instanceof Date);
  assert.deepEqual(db.user.keyBackup, { ...metadata(), revision: 2, password: wrap });
  assert.equal(db.rowWrites.length, 0);
  assert.equal(db.userWrites[0].filter['keyBackup.revision'], 1);
});

test('password change rejects stale generation/revision and malformed wrappers before mutation', async (t) => {
  const db = storage(t);
  for (const backup of [
    { generation: binary(16, 9), expectedRevision: 1, password },
    { generation, expectedRevision: 2, password },
    { generation, expectedRevision: 1, password: { ...password, iv: 'x' } },
  ]) await assert.rejects(() => changePersonalPassword(uid, ' old password ', 'new password', backup));
  assert.equal(db.userWrites.length, 0);
});

test('unenrolled change cannot orphan a racing enrollment', async (t) => {
  const db = storage(t, false);
  db.beforeUserWrite = () => { db.user.keyBackup = metadata(); };
  await assert.rejects(() => changePersonalPassword(uid, ' old password ', 'new password'), status(409));
  assert.equal(db.user.password, currentHash);
  assert.equal(db.user.keyBackup.password.ct, password.ct);
});

test('credential CAS handles missing/default/null tokenVersion without Mongoose hydration defaults', async (t) => {
  const db = storage(t, false);
  delete db.user.tokenVersion;
  assert.deepEqual(credentialCASFilter(db.user).tokenVersion, { $exists: false });
  await changePersonalPassword(uid, ' old password ', 'new password');
  assert.equal(db.user.tokenVersion, 1);
  db.user.password = currentHash; db.user.tokenVersion = null;
  assert.equal(credentialCASFilter(db.user).tokenVersion, null);
  await changePersonalPassword(uid, ' old password ', 'new password');
  assert.equal(db.user.tokenVersion, 1);
});

function resetToken(t: TestContext) {
  let claimed = false;
  t.mock.method(PasswordResetToken, 'findOne', () => query({ _id: 'token', userId: uid }));
  t.mock.method(PasswordResetToken, 'findOneAndUpdate', () => {
    if (claimed) return query(null);
    claimed = true; return query({ _id: 'token', userId: uid });
  });
  t.mock.method(PasswordResetToken, 'deleteMany', () => query({}));
}

test('reset atomically nulls password wrapper, retains recovery/generation/rows, and claims once', async (t) => {
  const db = storage(t); resetToken(t);
  db.rows.push({ retained: true });
  const results = await Promise.allSettled([resetPasswordWithToken('synthetic', 'new password'), resetPasswordWithToken('synthetic', 'another password')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.user.tokenVersion, 1);
  assert.deepEqual(db.user.keyBackup, { ...metadata(), password: null, revision: 2 });
  assert.deepEqual(db.rows, [{ retained: true }]);
  assert.equal(db.userWrites.length, 1);
});

test('reset loses to enrollment after token claim without orphaning wrappers', async (t) => {
  const db = storage(t, false); resetToken(t);
  db.beforeUserWrite = () => { db.user.keyBackup = metadata(); };
  await assert.rejects(() => resetPasswordWithToken('synthetic', 'new password'), status(409));
  assert.equal(db.user.password, currentHash);
  assert.deepEqual(db.user.keyBackup, metadata());
  await assert.rejects(() => resetPasswordWithToken('synthetic', 'new password'), status(400));
});

test('reset and password change cannot both win against the same credential snapshot', async (t) => {
  const db = storage(t); resetToken(t);
  const results = await Promise.allSettled([
    resetPasswordWithToken('synthetic', 'reset password'),
    changePersonalPassword(uid, ' old password ', 'changed password', { generation, expectedRevision: 1, password }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.statusCode === 409).length, 1);
  assert.equal(db.user.tokenVersion, 1);
  assert.equal(db.user.keyBackup.revision, 2);
});

test('recovery rotates both wrappers with immutable generation and CAS, including null password wrapper', async (t) => {
  const db = storage(t); db.user.keyBackup.password = null;
  const nextRecovery = { iv: binary(12, 8), ct: binary(48, 8) };
  const input = { ...enrollment(), expectedRevision: 1, recovery: nextRecovery };
  await assert.rejects(() => recoverAccountBackup(uid, { ...input, generation: binary(16, 4) }), status(409));
  await assert.rejects(() => recoverAccountBackup(uid, { ...input, currentPassword: 'wrong' }), status(401));
  const result = await recoverAccountBackup(uid, input);
  assert.deepEqual(result, { ...metadata(), revision: 2, recovery: nextRecovery, enrolled: true, userId: uid });
  assert.equal(db.user.tokenVersion, 0);
  await assert.rejects(() => recoverAccountBackup(uid, input), status(409));
});

test('epoch histories paginate stably and expose only caller-addressed envelopes', async (t) => {
  storage(t);
  const first = await getBackupEpochs(tid, uid, { limit: '2' });
  assert.equal(first.currentEpoch, 3);
  assert.deepEqual(first.epochs.map((e) => e.epoch), [3, 2]);
  assert.equal(first.nextBeforeEpoch, 2);
  for (const epoch of first.epochs) {
    assert.deepEqual(epoch.mineAll, ['b3du']);
    assert.equal(JSON.stringify(epoch).includes('b3RoZXI='), false);
    assert.equal('envelopes' in epoch, false);
  }
  const last = await getBackupEpochs(tid, uid, { beforeEpoch: '2', limit: '2' });
  assert.deepEqual(last.epochs.map((e) => e.epoch), [1]); assert.equal(last.nextBeforeEpoch, null);
});

test('trip writes are generation/epoch scoped, create-only then revision CAS', async (t) => {
  const db = storage(t);
  const first = await putTripBackup(tid, uid, 2, tripInput());
  assert.deepEqual(first, { v: 1, userId: uid, tripId: tid, epoch: 2, generation, rowRevision: 1, iv: binary(12), ct: binary(48) });
  await assert.rejects(() => putTripBackup(tid, uid, 2, tripInput()), status(409));
  await assert.rejects(() => putTripBackup(tid, uid, 2, { ...tripInput(), expectedRowRevision: 2 }), status(409));
  const repaired = await putTripBackup(tid, uid, 2, { ...tripInput(), expectedRowRevision: 1, ct: binary(48, 9) });
  assert.equal(repaired.rowRevision, 2);
  const result = await Promise.allSettled([
    putTripBackup(tid, uid, 2, { ...tripInput(), expectedRowRevision: 2 }),
    putTripBackup(tid, uid, 2, { ...tripInput(), expectedRowRevision: 2 }),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(() => putTripBackup(tid, uid, 99, tripInput()), status(404));
  await assert.rejects(() => putTripBackup(tid, uid, 1, { ...tripInput(), generation: binary(16, 8) }), status(409));
  assert.equal(db.rows.length, 1);
});

test('own backup listing excludes other accounts/generations and paginates newest first', async (t) => {
  const db = storage(t);
  for (const epoch of [1, 2, 3]) await putTripBackup(tid, uid, epoch, tripInput());
  db.rows.push({ ...db.rows[0], userId: other }, { ...db.rows[0], generation: binary(16, 8) });
  const first = await getTripBackups(tid, uid, { limit: '2' });
  assert.deepEqual(first.backups.map((b) => b.epoch), [3, 2]); assert.equal(first.nextBeforeEpoch, 2);
  const last = await getTripBackups(tid, uid, { beforeEpoch: '2' });
  assert.deepEqual(last.backups.map((b) => b.epoch), [1]); assert.equal(last.nextBeforeEpoch, null);
});

test('outsiders, removed members and deleted trips cannot read/write backups', async (t) => {
  const db = storage(t);
  for (const trip of [{ ...db.trip, members: [] }, { ...db.trip, isDeleted: true }, null]) {
    db.trip = trip;
    await assert.rejects(() => getTripBackups(tid, uid, {}), status(404));
    await assert.rejects(() => getBackupEpochs(tid, uid, {}), status(404));
    await assert.rejects(() => putTripBackup(tid, uid, 1, tripInput()), status(404));
  }
  assert.equal(db.rowWrites.length, 0);
});

test('late orphan cleanup is epoch-specific and never deletes other history', async (t) => {
  const db = storage(t);
  await putTripBackup(tid, uid, 1, tripInput());
  db.afterRowWrite = () => { db.epochs = db.epochs.filter((e: any) => e.epoch !== 2); };
  await assert.rejects(() => putTripBackup(tid, uid, 2, tripInput()), status(404));
  assert.deepEqual(db.deletes, [{ tripId: tid, userId: uid, epoch: 2, generation }]);
  assert.deepEqual(db.rows.map((r: any) => r.epoch), [1]);
});

test('late deletion or removal cleans the written row and fails authorization', async (t) => {
  const db = storage(t);
  db.afterRowWrite = () => { db.trip.isDeleted = true; };
  await assert.rejects(() => putTripBackup(tid, uid, 1, tripInput()), status(404));
  assert.equal(db.rows.length, 0);
  db.trip.isDeleted = false;
  db.afterRowWrite = () => { db.trip.members = []; };
  await assert.rejects(() => putTripBackup(tid, uid, 2, tripInput()), status(404));
  assert.equal(db.rows.length, 0);
});

test('expectedEpoch is mandatory; stale envelopes fail and concurrent rotation writes the exact old epoch', async (t) => {
  const db = storage(t);
  const envelopes = { [uid]: 'b3du' };
  assert.equal(addChatEnvelopesSchema.safeParse({ envelopes }).success, false);
  for (const expectedEpoch of [0, '3', 1.5, 1_000_000_001]) assert.equal(addChatEnvelopesSchema.safeParse({ expectedEpoch, envelopes }).success, false);
  let writes = 0;
  t.mock.method(TripChatKey, 'updateOne', async (filter: any, update: any) => {
    writes++;
    db.epochs.push({ _id: 'epoch-4', tripId: tid, epoch: 4, envelopes: new Map() });
    assert.equal(filter.epoch, 3); assert.equal(filter._id, 'epoch-3');
    assert.equal(update.$set[`envelopes.${uid}`], 'b3du');
    return { matchedCount: 1 } as any;
  });
  await assert.rejects(() => addTripChatEnvelopes(db.trip, uid, envelopes, undefined as any), status(400));
  await assert.rejects(() => addTripChatEnvelopes(db.trip, uid, envelopes, 2), status(409));
  assert.equal(writes, 0);
  const state = await addTripChatEnvelopes(db.trip, uid, envelopes, 3);
  assert.equal(state.epoch, 4);
  assert.equal(db.epochs[3].envelopes.size, 0);
  assert.equal(writes, 1);
});

test('Mongoose casts enrollment without dropping its immutable generation', async (t) => {
  let called = false;
  t.mock.method(User.collection, 'findOneAndUpdate', async (filter: any, update: any) => {
    called = true;
    assert.equal(filter.password, currentHash);
    assert.deepEqual(filter.tokenVersion, { $exists: false });
    assert.deepEqual(filter.keyBackup, { $exists: false });
    assert.equal(update.$set.keyBackup.generation, generation);
    return { _id: uid, keyBackup: metadata() };
  });
  await User.findOneAndUpdate(
    credentialCASFilter({ _id: uid, password: currentHash }),
    { $set: { keyBackup: metadata() } }, { new: true, runValidators: true }
  ).select('+keyBackup').lean();
  assert.equal(called, true);
});

test('mongoose model validates metadata and pins unique per-account trip/epoch/generation index', () => {
  const valid = new TripChatKeyBackup({ ...tripInput(), userId: uid, tripId: tid, epoch: 1, rowRevision: 1 });
  assert.equal(valid.validateSync(), undefined);
  const bad = new TripChatKeyBackup({ ...tripInput(), userId: uid, tripId: tid, epoch: 0, rowRevision: 1, ct: 'bad' });
  assert.ok(bad.validateSync());
  assert.ok(TripChatKeyBackup.schema.indexes().some(([fields, options]) => options.unique &&
    JSON.stringify(fields) === JSON.stringify({ userId: 1, tripId: 1, epoch: -1, generation: 1 })));
});
