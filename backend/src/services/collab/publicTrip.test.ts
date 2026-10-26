import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import Agency from '../../models/Agency.js';
import { findPublicSharedTrip } from './publicTrip.js';

/**
 * A public share is still tenant content. Suspension (PA0 §4.4) must fail it
 * closed exactly like the authenticated trip routes; personal shares have no
 * tenant and are unaffected.
 */

let currentTrip: Record<string, unknown> | null = null;
let agencyStatuses: Record<string, string> = {};

const originalTripFindOne = Trip.findOne;
const originalAgencyFindById = Agency.findById;

(Trip as any).findOne = async () => currentTrip;
(Agency as any).findById = (id: string) => ({
  select: () => ({
    lean: async () =>
      agencyStatuses[String(id)] ? { status: agencyStatuses[String(id)] } : null,
  }),
});

test.after(() => {
  (Trip as any).findOne = originalTripFindOne;
  (Agency as any).findById = originalAgencyFindById;
});

function reset(): void {
  agencyStatuses = { a1: 'active' };
  currentTrip = {
    _id: 't1',
    shareId: 'share-1',
    isPublic: true,
    workspace: 'agency',
    agencyId: 'a1',
  };
}

test('an active tenant share resolves', async () => {
  reset();
  assert.ok(await findPublicSharedTrip('share-1'));
});

test('a suspended tenant share fails closed', async () => {
  reset();
  agencyStatuses.a1 = 'suspended';
  assert.equal(await findPublicSharedTrip('share-1'), null);
});

test('a personal share ignores tenant status', async () => {
  reset();
  agencyStatuses.a1 = 'suspended';
  currentTrip = { _id: 't1', shareId: 'share-1', isPublic: true };
  assert.ok(await findPublicSharedTrip('share-1'));
});

test('a missing share resolves to null', async () => {
  reset();
  currentTrip = null;
  assert.equal(await findPublicSharedTrip('share-1'), null);
});
