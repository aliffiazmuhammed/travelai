import { test } from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import Agency from '../models/Agency.js';
import {
  protectAgency,
  protectPersonal,
  protectSession,
} from './auth.middleware.js';
import { signRealmToken } from '../services/auth/realm.js';

/**
 * PA0 guard behaviour. The database lookups are stubbed at the model boundary
 * so the tests exercise the real realm/status/version/tenant decisions.
 */

type Account = {
  _id: string;
  accountType: 'personal' | 'agency' | 'platform';
  agencyId?: string;
  platformRole?: string;
  status?: string;
  mustChangePassword?: boolean;
  tokenVersion?: number;
};

const users: Record<string, Account> = {};
const agencies: Record<string, { status: string }> = {};

const originalUserFindById = User.findById;
const originalAgencyFindById = Agency.findById;

(User as any).findById = (id: string) => ({
  select: async () => users[String(id)] ?? null,
});
(Agency as any).findById = (id: string) => ({
  select: () => ({ lean: async () => agencies[String(id)] ?? null }),
});

function resetFixtures(): void {
  for (const key of Object.keys(users)) delete users[key];
  for (const key of Object.keys(agencies)) delete agencies[key];

  users.personal = {
    _id: 'personal',
    accountType: 'personal',
    status: 'active',
    tokenVersion: 0,
  };
  users.agency = {
    _id: 'agency',
    accountType: 'agency',
    agencyId: 'a1',
    status: 'active',
    tokenVersion: 0,
  };
  users.otherAgency = {
    _id: 'otherAgency',
    accountType: 'agency',
    agencyId: 'a2',
    status: 'active',
    tokenVersion: 0,
  };
  agencies.a1 = { status: 'active' };
  agencies.a2 = { status: 'active' };
}

resetFixtures();

test.after(() => {
  (User as any).findById = originalUserFindById;
  (Agency as any).findById = originalAgencyFindById;
});

function token(account: Account): string {
  return signRealmToken({
    userId: account._id,
    realm: account.accountType,
    agencyId: account.agencyId,
    tokenVersion: account.tokenVersion,
  });
}

function request(overrides: Record<string, unknown> = {}): any {
  return {
    cookies: {},
    headers: {},
    params: {},
    body: {},
    query: {},
    path: '/x',
    method: 'GET',
    ...overrides,
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()];
    },
  };
}

function response(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function run(
  guard: any,
  req: any
): Promise<{ res: any; next: boolean }> {
  const res = response();
  let next = false;
  await guard(req, res, () => {
    next = true;
  });
  return { res, next };
}

test('a personal cookie authenticates the personal realm only', async () => {
  const personalToken = token(users.personal);
  const req = request({ cookies: { token: personalToken } });
  const personal = await run(protectPersonal, req);
  assert.equal(personal.next, true);
  assert.equal(req.userId, 'personal');
  assert.equal(req.realm, 'personal');

  const agency = await run(protectAgency, request({ cookies: { token: personalToken } }));
  assert.equal(agency.next, false);
  assert.equal(agency.res.statusCode, 401);
});

test('an agency cookie authenticates the agency realm only', async () => {
  const agencyToken = token(users.agency);
  const req = request({ cookies: { agency_token: agencyToken } });
  const ok = await run(protectAgency, req);
  assert.equal(ok.next, true);
  assert.equal(req.realm, 'agency');
  assert.equal(req.agencyId, 'a1');

  const personal = await run(protectPersonal, request({ cookies: { agency_token: agencyToken } }));
  assert.equal(personal.next, false);
  assert.equal(personal.res.statusCode, 401);
});

test('a tenant path param must match the agency session', async () => {
  const req = request({
    cookies: { agency_token: token(users.agency) },
    params: { agencyId: 'a1' },
  });
  assert.equal((await run(protectAgency, req)).next, true);

  const crossTenant = request({
    cookies: { agency_token: token(users.agency) },
    params: { agencyId: 'a2' },
  });
  const denied = await run(protectAgency, crossTenant);
  assert.equal(denied.next, false);
  assert.equal(denied.res.statusCode, 404);
  assert.deepEqual(denied.res.body, {
    success: false,
    error: 'Agency not found',
    message: 'Agency not found',
  });
});

test('a suspended tenant invalidates an existing agency session', async () => {
  agencies.a1.status = 'suspended';
  const denied = await run(
    protectAgency,
    request({ cookies: { agency_token: token(users.agency) } })
  );
  assert.equal(denied.next, false);
  assert.equal(denied.res.statusCode, 401);
  agencies.a1.status = 'active';
});

test('disabled accounts, stale versions and realm mismatches are generic 401s', async () => {
  const disabled = request({
    cookies: { token: token(users.personal) },
  });
  users.personal.status = 'disabled';
  assert.equal((await run(protectPersonal, disabled)).res.statusCode, 401);
  users.personal.status = 'active';

  users.personal.tokenVersion = 2;
  const stale = request({ cookies: { token: token({ ...users.personal, tokenVersion: 1 }) } });
  assert.equal((await run(protectPersonal, stale)).res.statusCode, 401);
  users.personal.tokenVersion = 0;

  // A token whose claim says agency but whose account is personal.
  const mismatched = request({
    cookies: { token: signRealmToken({ userId: 'personal', realm: 'agency', agencyId: 'a1' }) },
  });
  assert.equal((await run(protectAgency, mismatched)).res.statusCode, 401);
});

test('a temporary password blocks everything except the exempt paths', async () => {
  users.agency.mustChangePassword = true;
  const blocked = await run(
    protectAgency,
    request({ cookies: { agency_token: token(users.agency) }, path: '/trips' })
  );
  assert.equal(blocked.res.statusCode, 403);
  assert.equal(blocked.res.body.code, 'PASSWORD_CHANGE_REQUIRED');

  const allowed = await run(
    protectAgency,
    request({ cookies: { agency_token: token(users.agency) }, path: '/me' })
  );
  assert.equal(allowed.next, true);
  users.agency.mustChangePassword = false;
});

test('protectSession accepts both realms, records both, and prefers the declared tenant', async () => {
  const req = request({
    cookies: {
      token: token(users.personal),
      agency_token: token(users.agency),
    },
  });
  const ok = await run(protectSession, req);
  assert.equal(ok.next, true);
  assert.equal(req.realm, 'personal');
  assert.deepEqual(
    req.sessionCandidates.map((candidate: any) => candidate.realm).sort(),
    ['agency', 'personal']
  );

  const tenantReq = request({
    cookies: {
      token: token(users.personal),
      agency_token: token(users.agency),
    },
    body: { agencyId: 'a1' },
  });
  assert.equal((await run(protectSession, tenantReq)).next, true);
  assert.equal(tenantReq.realm, 'agency');
  assert.equal(tenantReq.agencyId, 'a1');
});

test('protectSession never accepts a platform token', async () => {
  users.platform = {
    _id: 'platform',
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
    tokenVersion: 0,
  };
  const denied = await run(
    protectSession,
    request({ cookies: { platform_token: token(users.platform) } })
  );
  assert.equal(denied.next, false);
  assert.equal(denied.res.statusCode, 401);
});

test('a Bearer token takes precedence over a valid cookie', async () => {
  const denied = await run(
    protectAgency,
    request({
      cookies: { agency_token: token(users.agency) },
      headers: { authorization: `Bearer ${token(users.personal)}` },
    })
  );
  assert.equal(denied.next, false);
  assert.equal(denied.res.statusCode, 401);
});
