import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../config/env.js';
import {
  AGENCY_PROPOSAL_TTL_MAX_DAYS,
  agencyProposalLinkFor,
  projectAgencyProposalLink,
  proposalActionState,
  proposalLinkIsViewable,
  resolveProposalTtlDays,
} from './proposals.js';

/**
 * Pure proposal-share mechanics for A7. The DB-backed lifecycle (mint, view,
 * accept, revoke, cross-tenant 404s) is exercised by the local smoke run;
 * these tests pin the capability-token rules, TTL clamping and the fact that
 * no projection ever carries the raw token or its hash.
 */

test('a share link is viewable only while unrevoked and unexpired', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  const base = { expiresAt: new Date('2026-10-24T12:00:00Z') };

  assert.equal(proposalLinkIsViewable(base, now), true);
  assert.equal(proposalLinkIsViewable(null, now), false);
  assert.equal(proposalLinkIsViewable(undefined, now), false);
  assert.equal(
    proposalLinkIsViewable({ ...base, revokedAt: now }, now),
    false,
    'revoked'
  );
  assert.equal(
    proposalLinkIsViewable(
      { expiresAt: new Date('2026-10-22T12:00:00Z') },
      now
    ),
    false,
    'expired'
  );
  assert.equal(
    proposalLinkIsViewable(
      { expiresAt: new Date('2026-10-23T12:00:00Z') },
      now
    ),
    false,
    'expiry is exclusive'
  );
});

test('TTL requests clamp to 1-90 days and fall back to the env default', () => {
  assert.equal(resolveProposalTtlDays(undefined), env.AGENCY_PROPOSAL_TTL_DAYS);
  assert.equal(resolveProposalTtlDays(null), env.AGENCY_PROPOSAL_TTL_DAYS);
  assert.equal(resolveProposalTtlDays('abc'), env.AGENCY_PROPOSAL_TTL_DAYS);
  assert.equal(resolveProposalTtlDays(NaN), env.AGENCY_PROPOSAL_TTL_DAYS);
  assert.equal(resolveProposalTtlDays(0), env.AGENCY_PROPOSAL_TTL_DAYS);
  assert.equal(resolveProposalTtlDays(-5), env.AGENCY_PROPOSAL_TTL_DAYS);

  assert.equal(resolveProposalTtlDays(1), 1);
  assert.equal(resolveProposalTtlDays(7), 7);
  assert.equal(resolveProposalTtlDays('14'), 14);
  assert.equal(resolveProposalTtlDays(14.9), 14, 'floors, not rounds');
  assert.equal(resolveProposalTtlDays(AGENCY_PROPOSAL_TTL_MAX_DAYS), 90);
  assert.equal(resolveProposalTtlDays(200), 90, 'clamps to the max');
});

test('the projection never exposes the raw token or its hash', () => {
  const projected = projectAgencyProposalLink({
    _id: 'link-1',
    tokenHash: 'deadbeef',
    tokenHint: 'AbCd12',
    quoteNumber: 'QT-2026-0042',
    quoteVersion: 3,
    templateName: 'Honeymoon brochure',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    expiresAt: new Date('2026-11-20T00:00:00Z'),
    revokedAt: null,
    lastViewedAt: new Date('2026-10-21T00:00:00Z'),
    viewCount: 4,
    acceptedAt: null,
    declinedAt: null,
  } as any);

  assert.equal(projected._id, 'link-1');
  assert.equal(projected.tokenHint, 'AbCd12');
  assert.equal(projected.quoteNumber, 'QT-2026-0042');
  assert.equal(projected.quoteVersion, 3);
  assert.equal(projected.templateName, 'Honeymoon brochure');
  assert.equal(projected.viewCount, 4);
  assert.equal(projected.revokedAt, null);
  assert.equal(projected.acceptedAt, null);
  assert.equal(projected.declinedAt, null);
  assert.ok(!('tokenHash' in projected), 'token hash must never leak');
  assert.ok(!('token' in projected), 'raw token must never leak');

  const sparse = projectAgencyProposalLink({
    _id: 'link-2',
    tokenHint: '',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    expiresAt: new Date('2026-11-20T00:00:00Z'),
  } as any);
  assert.equal(sparse.quoteNumber, null);
  assert.equal(sparse.quoteVersion, 1);
  assert.equal(sparse.templateName, null);
  assert.equal(sparse.viewCount, 0);
  assert.equal(sparse.lastViewedAt, null);
  assert.equal(sparse.revokedAt, null);
  assert.equal(sparse.acceptedAt, null);
  assert.equal(sparse.declinedAt, null);
});

test('only a sent, unanswered proposal can be accepted or declined (R6)', () => {
  assert.deepEqual(proposalActionState({}, 'sent'), {
    accepted: false,
    declined: false,
    canAccept: true,
    canDecline: true,
  });
  assert.deepEqual(proposalActionState({}, null), {
    accepted: false,
    declined: false,
    canAccept: false,
    canDecline: false,
  });

  const accepted = proposalActionState(
    { acceptedAt: new Date('2026-10-29T10:00:00Z') },
    'sent'
  );
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.canAccept, false);
  assert.equal(accepted.canDecline, false);

  const declined = proposalActionState(
    { declinedAt: new Date('2026-10-29T10:00:00Z') },
    'sent'
  );
  assert.equal(declined.declined, true);
  assert.equal(declined.canAccept, false, 'a declined version cannot be accepted');
  assert.equal(declined.canDecline, false);

  for (const status of ['expired', 'cancelled', 'draft']) {
    const state = proposalActionState({}, status);
    assert.equal(state.canAccept, false, status);
    assert.equal(state.canDecline, false, status);
  }

  // A quote accepted elsewhere (phone or the token page) still reads as
  // accepted even before the link row catches up.
  assert.equal(proposalActionState({}, 'accepted').accepted, true);
});

test('proposal links land on the public proposal page', () => {
  assert.equal(
    agencyProposalLinkFor('tok_a7-123', {
      browserOrigin: 'https://travelai-tjce.onrender.com',
    }),
    'https://travelai-tjce.onrender.com/proposal/tok_a7-123'
  );
});
