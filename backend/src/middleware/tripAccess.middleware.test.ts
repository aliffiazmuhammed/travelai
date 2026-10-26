import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../models/Trip.js';
import Agency from '../models/Agency.js';
import AgencyMember from '../models/AgencyMember.js';
import { requireTripRole } from './tripAccess.middleware.js';

/**
 * PA0 suspension rule (`docs/roadmap-platform-admin.md` §4.4): a suspended
 * tenant's shared trip routes are closed to every caller, including personal
 * collaborators whose personal session itself remains valid.
 */

type TripFixture = {
  _id: string;
  workspace?: string;
  agencyId?: string;
  members?: Array<{ userId: string; role: string }>;
  rev?: number;
};

let currentTrip: TripFixture | null = null;
let agencyStatuses: Record<string, string> = {};
let memberships: Record<string, string> = {};

const originalTripFindOne = Trip.findOne;
const originalAgencyFindById = Agency.findById;
const originalMemberFindOne = AgencyMember.findOne;

(Trip as any).findOne = () => ({
  select: async () => currentTrip,
});
(Agency as any).findById = (id: string) => ({
  select: () => ({
    lean: async () =>
      agencyStatuses[String(id)] ? { status: agencyStatuses[String(id)] } : null,
  }),
});
(AgencyMember as any).findOne = (filter: { userId: string }) => ({
  select: () => ({
    lean: async () =>
      memberships[String(filter.userId)]
        ? { role: memberships[String(filter.userId)] }
        : null,
  }),
});

test.after(() => {
  (Trip as any).findOne = originalTripFindOne;
  (Agency as any).findById = originalAgencyFindById;
  (AgencyMember as any).findOne = originalMemberFindOne;
});

function reset(): void {
  agencyStatuses = { a1: 'active' };
  memberships = {};
  currentTrip = {
    _id: 't1',
    workspace: 'agency',
    agencyId: 'a1',
    members: [{ userId: 'personal', role: 'editor' }],
    rev: 1,
  };
}

function request(candidates: Array<Record<string, unknown>>): any {
  return {
    params: { id: 't1' },
    body: {},
    sessionCandidates: candidates,
    headers: {},
    get: () => undefined,
  };
}

function run(
  guard: any,
  req: any
): Promise<{ error: any; next: boolean }> {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    guard(req, res, (error?: unknown) => resolve({ error, next: true }));
  });
}

test('a personal collaborator can open an active tenant trip', async () => {
  reset();
  const req = request([{ userId: 'personal', realm: 'personal' }]);

  const result = await run(requireTripRole('viewer'), req);

  assert.equal(result.error, undefined);
  assert.equal(req.tripRole, 'editor');
});

test('a suspended tenant blocks a personal collaborator with a generic 404', async () => {
  reset();
  agencyStatuses.a1 = 'suspended';
  const req = request([{ userId: 'personal', realm: 'personal' }]);

  const result = await run(requireTripRole('viewer'), req);

  assert.equal(result.error?.statusCode, 404);
  assert.equal(result.error?.message, 'Trip not found');
});

test('a suspended tenant blocks the tenant agency account too', async () => {
  reset();
  agencyStatuses.a1 = 'suspended';
  memberships.agency = 'owner';
  const req = request([
    { userId: 'agency', realm: 'agency', agencyId: 'a1' },
  ]);

  const result = await run(requireTripRole('viewer'), req);

  assert.equal(result.error?.statusCode, 404);
});

test('personal trips do not consult tenant status', async () => {
  reset();
  agencyStatuses.a1 = 'suspended';
  currentTrip = {
    _id: 't1',
    members: [{ userId: 'personal', role: 'owner' }],
    rev: 1,
  };
  const req = request([{ userId: 'personal', realm: 'personal' }]);

  const result = await run(requireTripRole('viewer'), req);

  assert.equal(result.error, undefined);
  assert.equal(req.tripRole, 'owner');
});
