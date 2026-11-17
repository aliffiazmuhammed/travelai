import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import User from '../models/User.js';
import Trip from '../models/Trip.js';
import Agency from '../models/Agency.js';
import AgencyMember from '../models/AgencyMember.js';
import TripChatKey from '../models/TripChatKey.js';
import TripChatKeyBackup from '../models/TripChatKeyBackup.js';
import authRouter from './auth.routes.js';
import { AUTH_GUARD_TAG } from '../middleware/auth.middleware.js';
import { TRIP_GUARD_TAG } from '../middleware/tripAccess.middleware.js';
import { keyBackupLimiter, KEY_BACKUP_REQUEST_LIMIT, passwordChangeLimiter } from '../middleware/rateLimiter.middleware.js';
import { errorHandler } from '../middleware/error.middleware.js';
import { verifyCsrf } from '../middleware/csrf.middleware.js';
import { signRealmToken } from '../services/auth/realm.js';
import { BACKUP_BODY_MAX } from '../schemas/keyBackup.schema.js';

const uid = '507f1f77bcf86cd799439011';
const aid = '507f1f77bcf86cd799439012';
const tid = '507f1f77bcf86cd799439021';
const tenant = '507f1f77bcf86cd799439031';
const bin = (n: number) => Buffer.alloc(n, 1).toString('base64url');
const metadata = { v: 1, generation: bin(16), revision: 1, password: { salt: bin(16), iv: bin(12), ct: bin(48) }, recovery: { iv: bin(12), ct: bin(48) } };
const personalToken = signRealmToken({ userId: uid, realm: 'personal', tokenVersion: 0 });
const agencyToken = signRealmToken({ userId: aid, realm: 'agency', agencyId: tenant, tokenVersion: 0 });
const platformToken = signRealmToken({ userId: aid, realm: 'platform', role: 'super_admin', tokenVersion: 0 });
function query(value: any): any {
  return { select: () => query(value), lean: () => Promise.resolve(value), sort: () => query(value), limit: () => query(value),
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
}
async function server(t: TestContext) {
  const db: any = {
    user: { _id: uid, email: 'synthetic@example.test', accountType: 'personal', status: 'active', tokenVersion: 0 },
    trip: { _id: tid, workspace: 'agency', agencyId: tenant, members: [{ userId: uid, role: 'viewer' }] },
    agencyStatus: 'active', agencyLookups: 0, userReads: 0,
  };
  t.mock.method(User, 'findById', (id: any) => query(String(id) === uid ? db.user : null));
  t.mock.method(User, 'findOne', (filter: any) => {
    db.userReads++;
    assert.equal(filter._id, uid); assert.equal(filter.accountType, 'personal');
    return query(db.user);
  });
  t.mock.method(User, 'find', () => query([{ _id: uid }]));
  t.mock.method(User, 'findOneAndUpdate', () => { throw new Error('No credential writes expected in this fixture'); });
  t.mock.method(Trip, 'findOne', (filter: any) => {
    assert.equal(filter._id, tid);
    assert.deepEqual(filter.isDeleted, { $ne: true });
    return query(db.trip?.isDeleted ? null : db.trip);
  });
  t.mock.method(Agency, 'findById', () => query({ status: db.agencyStatus }));
  t.mock.method(AgencyMember, 'findOne', () => {
    db.agencyLookups++; return query({ role: 'owner' });
  });
  t.mock.method(TripChatKey, 'findOne', () => query(null));
  t.mock.method(TripChatKey, 'find', () => query([]));
  t.mock.method(TripChatKeyBackup, 'find', () => query([]));
  const app = express();
  app.use(express.json({ limit: '1mb' }), cookieParser(), verifyCsrf);
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  const http = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => http.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/auth`;
  async function request(path: string, options: { token?: string; cookie?: string; method?: string; body?: any; csrf?: string } = {}) {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET', headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      }, body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  }
  // Existing limiter stores persist across router instances; each fixture starts empty.
  keyBackupLimiter.resetKey(uid);
  passwordChangeLimiter.resetKey(uid);
  return { db, request };
}

test('every recovery route is personal first, trip guard second, bounded and rate limited', () => {
  const routes = (authRouter as any).stack.filter((layer: any) => layer.route?.path.startsWith('/key-backup')).map((layer: any) => layer.route);
  assert.equal(routes.length, 7);
  for (const route of routes) {
    const handlers = route.stack.map((layer: any) => layer.handle);
    assert.equal(handlers[0][AUTH_GUARD_TAG]?.realm, 'personal');
    assert.ok(handlers.includes(keyBackupLimiter));
    if (route.path.includes('/trips/')) assert.equal(handlers[1][TRIP_GUARD_TAG]?.min, 'viewer');
    if (route.methods.post) assert.ok(handlers.includes(passwordChangeLimiter));
  }
});

test('API denies anonymous, agency, platform and reset-token identities; bearer does not borrow cookies', async (t) => {
  const { request, db } = await server(t);
  for (const options of [{}, { cookie: `agency_token=${agencyToken}` }, { token: agencyToken }, { token: platformToken }, { token: 'reset-token' }, { token: agencyToken, cookie: `token=${personalToken}` }]) {
    assert.equal((await request('/key-backup', options)).status, 401);
    assert.equal((await request(`/key-backup/trips/${tid}/backups`, options)).status, 401);
  }
  assert.equal(db.userReads, 0);
});

test('dual-cookie agency trip uses only personal collaborator and preserves outsider/deletion/suspension 404', async (t) => {
  const { request, db } = await server(t);
  const cookie = `token=${personalToken}; agency_token=${agencyToken}`;
  for (const suffix of ['epochs', 'backups']) {
    const result = await request(`/key-backup/trips/${tid}/${suffix}`, { cookie });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  assert.equal(db.agencyLookups, 0);
  db.trip.members = [];
  assert.equal((await request(`/key-backup/trips/${tid}/backups`, { cookie })).status, 404);
  assert.equal((await request(`/key-backup/trips/${tid}/backups/1`, { cookie, csrf: 'x', method: 'PUT', body: {} })).status, 403);
  db.trip.members = [{ userId: uid, role: 'viewer' }];
  db.trip.isDeleted = true;
  assert.equal((await request(`/key-backup/trips/${tid}/epochs`, { cookie })).status, 404);
  db.trip.isDeleted = false; db.agencyStatus = 'suspended';
  assert.equal((await request(`/key-backup/trips/${tid}/epochs`, { cookie })).status, 404);
});

test('API wire shape distinguishes enrollment absence and null password wrapper without public exposure', async (t) => {
  const { request, db } = await server(t);
  let result = await request('/key-backup', { token: personalToken });
  assert.deepEqual(result.body, { success: true, backup: { v: 1, userId: uid, enrolled: false, revision: 0 } });
  db.user.keyBackup = { ...metadata, password: null };
  result = await request('/key-backup', { token: personalToken });
  assert.deepEqual(result.body, { success: true, backup: { ...metadata, password: null, userId: uid, enrolled: true } });
  const me = await request('/me', { token: personalToken });
  assert.equal(me.status, 200);
  assert.equal(JSON.stringify(me.body).includes('keyBackup'), false);
});

test('cookie mutations retain CSRF protection; native requests reach validation and strict 8 KB limit', async (t) => {
  const { request } = await server(t);
  const cookie = `token=${personalToken}`;
  assert.equal((await request('/key-backup', { cookie, method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/key-backup', { cookie: `${cookie}; csrf=test`, csrf: 'test', method: 'POST', body: {} })).status, 400);
  assert.equal((await request('/key-backup', { token: personalToken, method: 'POST', body: {} })).status, 400);
  const oversized = { v: 1, currentPassword: 'x'.repeat(BACKUP_BODY_MAX), expectedRevision: 0, generation: bin(16), password: metadata.password, recovery: metadata.recovery };
  assert.equal((await request('/key-backup', { token: personalToken, method: 'POST', body: oversized })).status, 413);
  for (const queryString of ['limit=26', 'limit=0', 'limit=1&limit=2', 'beforeEpoch=1000000001', 'beforeEpoch=2.5', 'userId=other']) {
    assert.equal((await request(`/key-backup/trips/${tid}/epochs?${queryString}`, { token: personalToken })).status, 400);
  }
});

test('enrollment, recovery and trip writes return the frozen v1 wire contracts', async (t) => {
  const { request, db } = await server(t);
  db.user.password = 'synthetic-hash';
  t.mock.method(bcrypt, 'compare', async () => true);
  t.mock.method(User, 'findOneAndUpdate', (_filter: any, update: any) => {
    for (const [key, value] of Object.entries(update.$set)) {
      if (key.startsWith('keyBackup.')) db.user.keyBackup[key.slice('keyBackup.'.length)] = value;
      else db.user[key] = value;
    }
    return query(db.user);
  });
  const enrollment = { v: 1, generation: metadata.generation, expectedRevision: 0,
    currentPassword: 'synthetic-password', password: metadata.password, recovery: metadata.recovery };
  const enrolled = await request('/key-backup', { token: personalToken, method: 'POST', body: enrollment });
  assert.equal(enrolled.status, 200);
  assert.deepEqual(enrolled.body, { success: true, backup: { ...metadata, userId: uid, enrolled: true } });
  const recovered = await request('/key-backup/recover', { token: personalToken, method: 'POST', body: { ...enrollment, expectedRevision: 1 } });
  assert.equal(recovered.status, 200);
  assert.deepEqual(recovered.body, { success: true, backup: { ...metadata, revision: 2, userId: uid, enrolled: true } });
  t.mock.method(TripChatKey, 'exists', () => query({ _id: 'epoch' }));
  t.mock.method(TripChatKeyBackup, 'create', async (row: any) => row);
  const input = { v: 1, generation: metadata.generation, expectedRowRevision: 0, iv: bin(12), ct: bin(48) };
  const saved = await request(`/key-backup/trips/${tid}/backups/2`, { token: personalToken, method: 'PUT', body: input });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { success: true, backup: { v: 1, userId: uid, tripId: tid, epoch: 2,
    generation: metadata.generation, rowRevision: 1, iv: bin(12), ct: bin(48) } });
  for (const epoch of ['0', '2.5', '1000000001']) {
    assert.equal((await request(`/key-backup/trips/${tid}/backups/${epoch}`, { token: personalToken, method: 'PUT', body: input })).status, 400);
  }
});

test('password endpoint returns structured upgrade error before mutation for enrolled old clients', async (t) => {
  const { request, db } = await server(t); db.user.keyBackup = metadata;
  const response = await request('/password', { token: personalToken, method: 'POST', body: { currentPassword: 'old password', newPassword: 'new password' } });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'KEY_BACKUP_UPDATE_REQUIRED');
  assert.match(response.body.error, /Update your app/);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('trip index is bounded, member-only, cursor-paged and omits suspended tenants', async (t) => {
  const { request, db } = await server(t);
  const ids = Array.from({ length: 26 }, (_, index) => (index + 1).toString(16).padStart(24, '0'));
  let filter: any;
  let bounded = 0;
  t.mock.method(Trip, 'find', (input: any) => {
    filter = input;
    const rows = ids.map((_id) => ({ _id, workspace: 'agency', agencyId: tenant }));
    return {
      sort(order: any) { assert.deepEqual(order, { _id: 1 }); return this; },
      select() { return this; },
      limit(limit: number) { bounded = limit; return this; },
      lean: async () => rows,
    } as any;
  });
  db.agencyStatus = 'suspended';
  const result = await request('/key-backup/trips', { cookie: `token=${personalToken}; agency_token=${agencyToken}` });
  assert.equal(result.status, 200);
  assert.equal(bounded, 26);
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.deepEqual(filter.members, { $elemMatch: { userId: uid, role: { $in: ['owner', 'editor', 'commenter', 'viewer'] } } });
  assert.deepEqual(result.body, { success: true, trips: [], nextAfterTripId: ids[24] });
  db.agencyStatus = 'active';
  const next = await request(`/key-backup/trips?afterTripId=${ids[24]}`, { token: personalToken });
  assert.deepEqual(filter._id, { $gt: ids[24] });
  assert.equal(next.body.trips.length, 25);
  assert.deepEqual(Object.keys(next.body.trips[0]).sort(), ['title', 'tripId']);
  for (const invalid of ['limit=26', 'afterTripId=wrong', 'afterTripId=a&afterTripId=b', 'userId=other']) {
    assert.equal((await request(`/key-backup/trips?${invalid}`, { token: personalToken })).status, 400);
  }
  assert.equal((await request('/key-backup/trips', { token: agencyToken })).status, 401);
});

test('backup rate limit is shared across routes and isolated by authenticated user', async (t) => {
  const { request, db } = await server(t);
  for (let i = 0; i < KEY_BACKUP_REQUEST_LIMIT; i++) {
    assert.equal((await request('/key-backup', { token: personalToken })).status, 200);
  }
  assert.equal((await request(`/key-backup/trips/${tid}/epochs`, { token: personalToken })).status, 429);
  const otherId = '507f1f77bcf86cd799439013';
  t.mock.method(User, 'findById', () => query({ ...db.user, _id: otherId }));
  t.mock.method(User, 'findOne', () => query({ ...db.user, _id: otherId }));
  const otherToken = signRealmToken({ userId: otherId, realm: 'personal', tokenVersion: 0 });
  assert.equal((await request('/key-backup', { token: otherToken })).status, 200);
});

test('enrollment and recovery share the password-verification limiter', async (t) => {
  const { request } = await server(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await request(i % 2 ? '/key-backup/recover' : '/key-backup', { token: personalToken, method: 'POST', body: {} })).status, 400);
  }
  assert.equal((await request('/password', { token: personalToken, method: 'POST', body: {} })).status, 429);
});
