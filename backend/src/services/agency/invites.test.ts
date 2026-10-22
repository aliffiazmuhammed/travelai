import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashToken,
  mintInviteToken,
  tokenHint,
} from '../collab/invites.js';
import {
  agencyInviteIsRedeemable,
  agencyInviteLinkFor,
  projectAgencyInvite,
} from './invites.js';

/**
 * Pure invitation mechanics for A1. The DB-backed redemption is exercised by
 * the local smoke run; these tests pin token hygiene, link shape, and the
 * expiry/revocation/exhaustion rules that decide whether a token is usable.
 */

test('agency invite tokens are 256-bit, URL-safe and hashed at rest', () => {
  const raw = mintInviteToken();
  assert.equal(raw.length, 43);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  assert.match(hashToken(raw), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(raw), raw);
  assert.equal(tokenHint(raw).length, 6);
});

test('agency invite links land on the agency invitation page', () => {
  assert.equal(
    agencyInviteLinkFor('tok_en-123', {
      browserOrigin: 'https://travelai-tjce.onrender.com',
    }),
    'https://travelai-tjce.onrender.com/agency/invite/tok_en-123'
  );
});

test('redeemable only while unrevoked, unexpired and under max uses', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const base = {
    expiresAt: new Date('2026-10-23T12:00:00Z'),
    maxUses: 1,
    acceptedBy: [],
    revokedAt: null,
  };

  assert.equal(agencyInviteIsRedeemable(base, now), true);
  assert.equal(
    agencyInviteIsRedeemable({ ...base, revokedAt: now }, now),
    false,
    'revoked'
  );
  assert.equal(
    agencyInviteIsRedeemable(
      { ...base, expiresAt: new Date('2026-10-21T12:00:00Z') },
      now
    ),
    false,
    'expired'
  );
  assert.equal(
    agencyInviteIsRedeemable({ ...base, acceptedBy: ['u1'] }, now),
    false,
    'exhausted'
  );
  assert.equal(
    agencyInviteIsRedeemable(
      { ...base, maxUses: 2, acceptedBy: ['u1'] },
      now
    ),
    true,
    'multi-use link with one claim left'
  );
});

test('projection never exposes the raw token or hash', () => {
  const projected = projectAgencyInvite({
    _id: 'invite-1',
    role: 'planner',
    kind: 'link',
    email: undefined,
    tokenHash: 'secret-hash',
    tokenHint: 'abc123',
    expiresAt: new Date('2026-10-23T12:00:00Z'),
    maxUses: 3,
    acceptedBy: ['u1'],
    revokedAt: null,
    createdAt: new Date('2026-10-22T12:00:00Z'),
  } as any);

  assert.equal(projected._id, 'invite-1');
  assert.equal(projected.usedCount, 1);
  assert.equal((projected as any).tokenHash, undefined);
  assert.equal((projected as any).acceptedBy, undefined);
});
