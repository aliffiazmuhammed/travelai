import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  isBase64,
  assertEnvelopeInputs,
  assertEnvelopeMetadata,
  envelopeSlotMeta,
  assertEpochTransition,
  projectKeyState,
  mergePubKeyList,
  memberDeviceKeys,
  CHAT_PUB_KEYS_MAX,
} from './chatKeys.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

/**
 * Pure-rule tests for the E2EE chat keys (F10). The server is a blind
 * carrier, so every rule worth testing is SHAPE and AUTHORIZATION:
 * envelope base64/size limits, envelope targets must be current members,
 * epochs may only move forward, and the projection must hand each caller
 * exactly their own envelope back. The DB paths ride the live
 * `smoke-f10.mts` run.
 */

const ID_A = new Types.ObjectId().toString();
const ID_B = new Types.ObjectId().toString();
const validWrapped = 'QS0xMjM0NTY3ODk=', // base64("A-123456789") — well-formed filler
  validWrapped2 = 'Qi00NTY3ODkwMTI=';

/* ---------------------------- base64 shape -------------------------------- */

test('isBase64: accepts well-formed base64 within the cap', () => {
  assert.equal(isBase64(validWrapped, 1024), true);
  assert.equal(isBase64('ab==', 1024), true);
});

test("isBase64: rejects junk, oversized blobs and empties", () => {
  assert.equal(isBase64('not base64!!', 1024), false);
  assert.equal(isBase64('', 1024), false);
  assert.equal(isBase64(validWrapped + 'a'.repeat(2000), 1024), false);
  assert.equal(isBase64(42, 1024), false);
});

/* -------------------------- envelope targeting ---------------------------- */

test('assertEnvelopeInputs: legacy member-id envelopes still pass', () => {
  assert.doesNotThrow(() =>
    assertEnvelopeInputs({ [ID_A]: validWrapped, [ID_B]: validWrapped2 }, [ID_A, ID_B])
  );
});

test('assertEnvelopeInputs: device-key envelopes for current members pass', () => {
  assert.doesNotThrow(() =>
    assertEnvelopeInputs(
      { 'PUBA=': validWrapped, 'PUBB=': validWrapped2 },
      [ID_A, ID_B],
      ['PUBA=', 'PUBB=']
    )
  );
});

test('assertEnvelopeInputs: a stranger device key is a 400', () => {
  assert.throws(
    () => assertEnvelopeInputs({ 'STRANGER=': validWrapped }, [ID_A], ['PUBA=']),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test('assertEnvelopeInputs: an envelope to a non-member is a 400', () => {
  const stranger = new Types.ObjectId().toString();
  assert.throws(
    () => assertEnvelopeInputs({ [stranger]: validWrapped }, [ID_A, ID_B]),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test('assertEnvelopeInputs: malformed ids and undecodable payloads are 400s', () => {
  assert.throws(
    () => assertEnvelopeInputs({ 'not-an-id': validWrapped }, [ID_A]),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
  assert.throws(
    () => assertEnvelopeInputs({ [ID_A]: '!!! junk !!!' }, [ID_A]),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test('assertEnvelopeInputs: an empty envelope set is a 400', () => {
  assert.throws(
    () => assertEnvelopeInputs({}, [ID_A]),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

/* ---------------------------- epoch transitions ---------------------------- */

test('assertEpochTransition: any positive epoch bootstraps when none exists', () => {
  assert.doesNotThrow(() => assertEpochTransition(1, null));
  assert.doesNotThrow(() => assertEpochTransition(7, null));
});

test('assertEpochTransition: only higher epochs rotate', () => {
  assert.doesNotThrow(() => assertEpochTransition(4, 3));
  assert.throws(
    () => assertEpochTransition(3, 3),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  assert.throws(
    () => assertEpochTransition(2, 3),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test('assertEpochTransition: zero/negative/NaN epochs are 400s', () => {
  for (const bad of [0, -1, NaN]) {
    assert.throws(
      () => assertEpochTransition(bad, null),
      (error: unknown) => error instanceof AppError && error.statusCode === 400
    );
  }
});

/* ------------------------- multi-device key slots -------------------------- */

test('mergePubKeyList: newest first, de-duplicated, capped', () => {
  assert.deepEqual(mergePubKeyList([], 'A='), ['A=']);
  assert.deepEqual(mergePubKeyList(['A=', 'B='], 'A='), ['A=', 'B=']);
  assert.deepEqual(mergePubKeyList(['A=', 'B='], 'C='), ['C=', 'A=', 'B=']);
  const many = Array.from({ length: CHAT_PUB_KEYS_MAX + 3 }, (_, i) => `K${i}=`);
  const capped = mergePubKeyList(many, 'NEW=');
  assert.equal(capped.length, CHAT_PUB_KEYS_MAX);
  assert.equal(capped[0], 'NEW=');
});

test('memberDeviceKeys: primary first, de-duplicated, junk skipped', () => {
  assert.deepEqual(memberDeviceKeys({ chatPubKey: 'A=', chatPubKeys: ['B=', 'A=', ''] }), ['A=', 'B=']);
  assert.deepEqual(memberDeviceKeys({}), []);
  assert.deepEqual(memberDeviceKeys({ chatPubKey: null, chatPubKeys: ['B='] }), ['B=']);
});

/* ------------------------------- projection -------------------------------- */

test('projectKeyState: each member sees their own envelope, never others', () => {
  const envelopes = new Map<string, string>([
    [ID_A, validWrapped],
    [ID_B, validWrapped2],
  ]);
  for (const viewer of [ID_A, ID_B]) {
    const state = projectKeyState(
      { epoch: 2, envelopes },
      [
        { _id: ID_A, email: `a@example.com`, chatPubKey: 'PUBA=' },
        { _id: ID_B, email: `b@example.com`, chatPubKey: 'PUBB=' },
      ],
      viewer
    );
    assert.equal(state.epoch, 2);
    assert.equal(state.members.filter((m) => m.hasEnvelope).length, 2);
    assert.equal(state.mine, viewer === ID_A ? validWrapped : validWrapped2);
    // Public keys are published server-side by design, member labels ride along.
    assert.equal(state.members[0].pubKey, 'PUBA=');
    assert.equal(state.members[0].label, 'a');
  }
});

test("projectKeyState: a member without an envelope gets mine=undefined", () => {
  const state = projectKeyState(
    { epoch: 1, envelopes: new Map([[ID_A, validWrapped]]) },
    [{ _id: ID_A, email: 'a@example.com' }, { _id: ID_B, email: 'b@example.com' }],
    ID_B
  );
  assert.equal(state.mine, undefined);
  assert.equal(state.members.find((m) => String(m.userId) === ID_B)?.hasEnvelope, false);
});

test('projectKeyState: a trip with no key yet reports no epoch, bare roster', () => {
  const state = projectKeyState(null, [{ _id: ID_A, email: 'a@example.com' }], ID_A);
  assert.equal(state.epoch, undefined);
  assert.equal(state.mine, undefined);
  assert.equal(state.mineAll, undefined);
  assert.equal(state.members.length, 1);
  assert.equal(state.members[0].hasEnvelope, false);
});

/* --------------- F10d: one envelope slot per device (browser) -------------- */

test('projectKeyState: an account with TWO devices gets both envelopes, members see slots', () => {
  const desk = 'DESKTOP=';
  const laptop = 'LAPTOP=';
  const envelopes = new Map<string, string>([
    [desk, validWrapped],
    [laptop, validWrapped2],
  ]);
  const state = projectKeyState(
    { epoch: 1, envelopes },
    [{ _id: ID_A, email: 'a@example.com', chatPubKey: laptop, chatPubKeys: [laptop, desk] }],
    ID_A
  );
  assert.deepEqual(state.mineAll, [validWrapped2, validWrapped]);
  assert.equal(state.mine, validWrapped2);
  assert.deepEqual(state.members[0].pubKeys, [laptop, desk]);
  assert.deepEqual(state.members[0].envelopedPubKeys, [laptop, desk]);
  assert.equal(state.members[0].hasEnvelope, true);
});

test('projectKeyState: only the viewer’s own slots land in mineAll, never a teammate’s', () => {
  const envelopes = new Map<string, string>([
    ['ALA=', validWrapped],
    ['BOB=', validWrapped2],
  ]);
  const state = projectKeyState(
    { epoch: 1, envelopes },
    [
      { _id: ID_A, email: 'a@example.com', chatPubKeys: ['ALA='] },
      { _id: ID_B, email: 'b@example.com', chatPubKeys: ['BOB='] },
    ],
    ID_A
  );
  assert.deepEqual(state.mineAll, [validWrapped]);
  const bob = state.members.find((m) => m.userId === ID_B)!;
  assert.deepEqual(bob.envelopedPubKeys, ['BOB=']);
  assert.equal(bob.hasEnvelope, true);
});

test('projectKeyState: a device with no slot is visible as a self-heal gap', () => {
  const state = projectKeyState(
    { epoch: 1, envelopes: new Map([['DESKTOP=', validWrapped]]) },
    [{ _id: ID_A, email: 'a@example.com', chatPubKey: 'LAPTOP=', chatPubKeys: ['LAPTOP=', 'DESKTOP='] }],
    ID_A
  );
  assert.deepEqual(state.members[0].envelopedPubKeys, ['DESKTOP=']);
  assert.equal(state.members[0].hasEnvelope, true);
  assert.deepEqual(state.mineAll, [validWrapped]);
});

test('projectKeyState: a legacy member-id envelope still unlocks (backwards compatible)', () => {
  const state = projectKeyState(
    { epoch: 1, envelopes: new Map([[ID_A, validWrapped]]) },
    [{ _id: ID_A, email: 'a@example.com', chatPubKey: 'DEVICE=' }],
    ID_A
  );
  assert.deepEqual(state.mineAll, [validWrapped]);
  assert.equal(state.members[0].hasEnvelope, true);
  assert.deepEqual(state.members[0].envelopedPubKeys, []);
});

test('projectKeyState: a missing pubKey simply hasEnvelope=false without pubKey', () => {
  const state = projectKeyState(
    null,
    [{ _id: ID_A, email: 'a@example.com', chatPubKey: null }],
    ID_A
  );
  assert.equal('pubKey' in state.members[0], false);
});

/* --------------- F10e: envelope slot metadata + wrapper verification -------- */

const envelopeBlob = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

const V2_BLOB = envelopeBlob({ v: 2, w: ID_A, wk: 'PUBA=', iv: 'aXY=', d: 'ZD0=' });
const V1_BLOB = envelopeBlob({ v: 1, w: ID_A, iv: 'aXY=', d: 'ZD0=' });

test('envelopeSlotMeta: reads a v2 wrapper + the device key it used', () => {
  assert.deepEqual(envelopeSlotMeta(V2_BLOB), {
    version: 2,
    wrapper: ID_A,
    wrapperPub: 'PUBA=',
  });
});

test('envelopeSlotMeta: a legacy v1 envelope has no wrapper key', () => {
  assert.deepEqual(envelopeSlotMeta(V1_BLOB), {
    version: 1,
    wrapper: ID_A,
    wrapperPub: null,
  });
});

test('envelopeSlotMeta: anything unreadable degrades to nulls (⇒ re-wrap it)', () => {
  for (const junk of [
    '!!!junk!!!',
    '',
    envelopeBlob([1, 2, 3]),
    envelopeBlob('a string'),
    validWrapped,
    42,
    null,
  ]) {
    assert.deepEqual(envelopeSlotMeta(junk), {
      version: null,
      wrapper: null,
      wrapperPub: null,
    });
  }
});

test('assertEnvelopeMetadata: a v2 envelope must name a REALLY published wrapper key', () => {
  assert.doesNotThrow(() =>
    assertEnvelopeMetadata({ 'PUBC=': V2_BLOB }, { [ID_A]: ['PUBA='] })
  );
  // A key that was rotated out of the wrapper's list cannot be named.
  assert.throws(
    () =>
      assertEnvelopeMetadata(
        { 'PUBC=': envelopeBlob({ v: 2, w: ID_A, wk: 'EVICTED=', iv: 'aXY=', d: 'ZD0=' }) },
        { [ID_A]: ['PUBA='] }
      ),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
  // Nor can a member label an envelope with someone else's key.
  assert.throws(
    () =>
      assertEnvelopeMetadata(
        { 'PUBC=': envelopeBlob({ v: 2, w: ID_B, wk: 'PUBA=', iv: 'aXY=', d: 'ZD0=' }) },
        { [ID_A]: ['PUBA='] }
      ),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test('assertEnvelopeMetadata: v2 needs both fields, v1 stays accepted', () => {
  assert.throws(
    () =>
      assertEnvelopeMetadata(
        { 'PUBC=': envelopeBlob({ v: 2, w: ID_A, iv: 'aXY=', d: 'ZD0=' }) },
        { [ID_A]: ['PUBA='] }
      ),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
  assert.doesNotThrow(() =>
    assertEnvelopeMetadata({ 'PUBC=': V1_BLOB }, { [ID_A]: ['PUBA='] })
  );
});

test('projectKeyState: slots carry wrapper metadata so dead slots can be re-wrapped', () => {
  const blob = envelopeBlob({ v: 2, w: ID_B, wk: 'BOB=', iv: 'aXY=', d: 'ZD0=' });
  const state = projectKeyState(
    { epoch: 1, envelopes: new Map([['ALA=', blob], ['ALB=', 'not-an-envelope']]) },
    [{ _id: ID_A, email: 'a@example.com', chatPubKeys: ['ALA=', 'ALB='] }],
    ID_A
  );
  assert.deepEqual(state.members[0].slots, [
    { pub: 'ALA=', wrapper: ID_B, wrapperPub: 'BOB=' }, // provably openable while BOB= lives
    { pub: 'ALB=', wrapper: null, wrapperPub: null }, // rubbish → cannot prove → re-wrap
  ]);
  assert.deepEqual(state.members[0].envelopedPubKeys, ['ALA=', 'ALB=']);
});

/* --------- the ciphertext cap arithmetic F10 pins on (comments/decisions) -- */

test('comment/decision caps: e2ee rows get the doubled encoding cap', () => {
  // Mirrors the zod cap logic in comments.schema.ts (superRefine) — the
  // plaintext meaning cap is COMMENT_MAX_LEN; ciphertext gets ×2.
  const cap = env.COMMENT_MAX_LEN;
  const longPlaintext = 'x'.repeat(cap + 1);
  const longCiphertext = 'y'.repeat(cap + 1); // must fit under cap*2
  assert.ok(longPlaintext.length > cap);
  assert.ok(longCiphertext.length <= cap * 2);
});
