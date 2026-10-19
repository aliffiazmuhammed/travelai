import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashToken,
  inviteLinkFor,
  linkOriginHints,
  mintInviteToken,
  pickLinkOrigin,
  resolveMaxUses,
  resolveTtlHours,
  tokenHint,
} from './invites.js';
import { createInviteSchema, changeMemberRoleSchema, transferOwnershipSchema } from '../../schemas/collab.schema.js';
import {
  assertLeave,
  assertMemberRemoval,
  assertRoleChange,
  emailLocalPart,
  linkParticipant,
  resolveTransfer,
  unlinkParticipant,
} from './members.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

/**
 * Pure-rule tests for the invitation + member-management mechanics of sprint
 * E2 (`docs/roadmap-milestone-6-collaboration.md` §3.5/§3.9). The DB-backed
 * redemption itself is covered by the live-milestone smoke run; what must hold
 * *structurally* — token hygiene, invariants beyond rank, and ledger linking —
 * is asserted here so it fails in CI, not only in production.
 */

function fakeTrip(): any {
  return {
    _id: 'trip-1',
    userId: 'owner-1',
    members: [
      { userId: 'owner-1', role: 'owner' },
      { userId: 'editor-1', role: 'editor' },
      { userId: 'viewer-1', role: 'viewer' },
    ],
    participants: [],
    markModified() {},
  };
}

/* -------------------------------------------------------------------------- */
/*  Token hygiene                                                              */
/* -------------------------------------------------------------------------- */

test('tokens are 256-bit, URL-safe, and never stored raw', () => {
  const raw = mintInviteToken();
  assert.equal(raw.length, 43, '32 random bytes = 43 base64url chars');
  assert.match(raw, /^[A-Za-z0-9_-]+$/, 'must be safe in a URL path');
  assert.equal(hashToken(raw), hashToken(raw), 'hash is deterministic');
  assert.notEqual(hashToken(raw), hashToken(mintInviteToken()));
  assert.match(hashToken(raw), /^[0-9a-f]{64}$/, 'sha256 hex');
  assert.equal(tokenHint(raw).length, 6);
  assert.notEqual(tokenHint(raw), raw, 'hint is a prefix, not the token');
});

/* -------------------------------------------------------------------------- */
/*  Minting knobs                                                              */
/* -------------------------------------------------------------------------- */

test('ttl/maxUses fall back to env defaults and clamp to integers', () => {
  assert.equal(resolveTtlHours(undefined), env.INVITE_TTL_HOURS);
  assert.equal(resolveTtlHours('junk'), env.INVITE_TTL_HOURS);
  assert.equal(resolveTtlHours(24), 24);
  assert.equal(resolveMaxUses(undefined), env.INVITE_DEFAULT_MAX_USES);
  assert.equal(resolveMaxUses(5), 5);
});

test('invite schema: role can never be owner, email invites need an address', () => {
  assert.equal(createInviteSchema.safeParse({ role: 'owner' }).success, false);
  assert.equal(createInviteSchema.safeParse({ role: 'editor' }).success, true);
  assert.equal(
    createInviteSchema.safeParse({ role: 'viewer', kind: 'email' }).success,
    false,
    'an email invite without the email is rejected'
  );
  assert.equal(
    createInviteSchema.safeParse({ role: 'viewer', kind: 'email', email: 'A@b.co' }).success,
    true
  );
  assert.equal(
    createInviteSchema.safeParse({ role: 'viewer', maxUses: 40 }).success,
    false,
    'maxUses is capped (abuse bound)'
  );
});

test('member PATCH + transfer schemas reject direct owner assignment', () => {
  assert.equal(changeMemberRoleSchema.safeParse({ role: 'owner' }).success, false);
  assert.equal(changeMemberRoleSchema.safeParse({ role: 'commenter' }).success, true);
  assert.equal(transferOwnershipSchema.safeParse({ toUserId: 'nope' }).success, false);
  assert.equal(
    transferOwnershipSchema.safeParse({ toUserId: 'a'.repeat(24) }).success,
    true
  );
});

/* -------------------------------------------------------------------------- */
/*  Invariants beyond rank (services/collab/members.ts)                        */
/* -------------------------------------------------------------------------- */

test('role PATCHes can neither assign nor touch ownership', () => {
  assert.throws(() => assertRoleChange(fakeTrip(), 'editor-1', 'owner'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 400);
    return true;
  });

  assert.throws(() => assertRoleChange(fakeTrip(), 'owner-1', 'editor'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    return true;
  });

  assert.throws(() => assertRoleChange(fakeTrip(), 'ghost-1', 'viewer'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 404);
    return true;
  });

  // Legal case: promoting a viewer to editor passes.
  assert.doesNotThrow(() => assertRoleChange(fakeTrip(), 'viewer-1', 'editor'));
});

test('member removal and leaving can never orphan the trip', () => {
  // Removing an owner is refused — ownership leaves by transfer only.
  assert.throws(() => assertMemberRemoval(fakeTrip(), 'owner-1'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    return true;
  });

  // Non-owner removal is fine.
  assert.doesNotThrow(() => assertMemberRemoval(fakeTrip(), 'viewer-1'));

  // An owner leaving must transfer first.
  assert.throws(() => assertLeave(fakeTrip(), 'owner-1'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    return true;
  });

  // Everyone else may leave freely.
  assert.doesNotThrow(() => assertLeave(fakeTrip(), 'viewer-1'));
});

test('ownership transfer targets members only, never the caller themselves', () => {
  assert.throws(
    () => resolveTransfer(fakeTrip(), { trip: fakeTrip(), fromUserId: 'owner-1', toUserId: 'ghost-1' }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  assert.throws(
    () => resolveTransfer(fakeTrip(), { trip: fakeTrip(), fromUserId: 'owner-1', toUserId: 'owner-1' }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  const resolved = resolveTransfer(fakeTrip(), {
    trip: fakeTrip(),
    fromUserId: 'owner-1',
    toUserId: 'editor-1',
  });
  assert.equal(String(resolved.next.userId), 'editor-1');
});

/* -------------------------------------------------------------------------- */
/*  Participant ledger linking (§3.9)                                          */
/* -------------------------------------------------------------------------- */

test('join links an unlinked participant by email local-part and never invents rows', () => {
  const trip = fakeTrip();
  trip.participants = [
    { _id: 'p1', name: 'Alex' },
    { _id: 'p2', name: 'Sam' },
  ];

  // "Alex" != "alexb" — nothing was invented.
  const changed = linkParticipant(trip, 'member-9', 'alexb@example.com');
  assert.equal(changed, false);
  assert.equal(trip.participants.length, 2);

  const linked = linkParticipant(trip, 'member-9', 'alex@example.com');
  assert.equal(linked, true);
  assert.equal(trip.participants[0].userId, 'member-9');
  assert.equal(linkParticipant(trip, 'member-9', 'alex@example.com'), false, 'idempotent when already linked');
});

test('member removal unlinks but never deletes the ledger row', () => {
  const trip = fakeTrip();
  trip.participants = [
    { _id: 'p1', name: 'Alex', userId: 'member-9' },
    { _id: 'p2', name: 'Sam' },
  ];

  unlinkParticipant(trip, 'member-9');
  assert.equal(trip.participants.length, 2, 'the row survives');
  assert.equal(trip.participants[0].userId, undefined, 'only the link is cleared');
});

/* -------------------------------------------------------------------------- */
/*  Invite link origin (the localhost-in-production defect)                    */
/* -------------------------------------------------------------------------- */

test('a real browser origin always wins over a localhost config', () => {
  // This is the production defect: Render serves the SPA itself and the env
  // still (or again) says localhost — the owner must receive the real URL.
  assert.equal(
    pickLinkOrigin({ browserOrigin: 'https://travelai-tjce.onrender.com' }, 'http://localhost:8080'),
    'https://travelai-tjce.onrender.com'
  );
  assert.equal(
    pickLinkOrigin({ browserOrigin: 'https://travelai-tjce.onrender.com' }, ''),
    'https://travelai-tjce.onrender.com'
  );
  // Even a wrongly configured remote URL loses to the page the owner is on.
  assert.equal(
    pickLinkOrigin({ browserOrigin: 'https://travelai-tjce.onrender.com' }, 'https://stale.example.com'),
    'https://travelai-tjce.onrender.com'
  );
});

test('without a browser origin, config wins, then the request host, then Render', () => {
  assert.equal(
    pickLinkOrigin({ sameOrigin: 'https://api.example.com' }, 'https://app.example.com'),
    'https://app.example.com',
    'explicit config beats the API host when they differ'
  );
  assert.equal(
    pickLinkOrigin({ sameOrigin: 'https://travelai-tjce.onrender.com' }, ''),
    'https://travelai-tjce.onrender.com',
    'same-origin deploy needs no configuration'
  );
  assert.equal(
    pickLinkOrigin({ renderUrl: 'https://travelai-tjce.onrender.com' }, 'http://localhost:8080'),
    'https://travelai-tjce.onrender.com',
    'platform URL rescues a leftover localhost config'
  );
});

test('local development still gets a localhost link, never a broken one', () => {
  assert.equal(
    pickLinkOrigin({ browserOrigin: 'http://localhost:5173' }, 'http://localhost:8080'),
    'http://localhost:8080',
    'the configured dev origin is the SPA the backend serves'
  );
  assert.equal(pickLinkOrigin({}, ''), 'http://localhost:8080');
  // Loopback values are cleaned but never mangled into an invalid URL.
  assert.match(pickLinkOrigin({ browserOrigin: 'http://127.0.0.1:5173/' }, ''), /^http:\/\/127\.0\.0\.1:5173$/);
});

test('the minted link is the origin plus the invite path', () => {
  assert.equal(
    inviteLinkFor('tok_en-123', { browserOrigin: 'https://travelai-tjce.onrender.com' }),
    'https://travelai-tjce.onrender.com/invite/tok_en-123'
  );
});

test('the request origin is read proxy-aware, comma lists included', () => {
  const headers: Record<string, string> = {
    origin: 'https://travelai-eta.vercel.app',
    host: 'travelai-tjce.onrender.com',
    'x-forwarded-host': 'travelai-tjce.onrender.com, proxy.internal',
    'x-forwarded-proto': 'https, http',
  };
  const hints = linkOriginHints({
    get: (name) => headers[name.toLowerCase()],
    protocol: 'http',
  });
  assert.equal(hints.browserOrigin, 'https://travelai-eta.vercel.app');
  assert.equal(hints.sameOrigin, 'https://travelai-tjce.onrender.com');
});

test('a request without forwarding headers resolves to a safe no-hint state', () => {
  const hints = linkOriginHints({ get: () => undefined });
  assert.equal(hints.browserOrigin, null);
  assert.equal(hints.sameOrigin, null);
});

test('email local-parts can be hint sources', () => {
  assert.equal(emailLocalPart('sam.ray@example.com'), 'sam.ray');
  assert.equal(emailLocalPart(''), '');
});
