import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GenerationAbortedError,
  isAbortError,
  shouldPersistGeneration,
  throwIfAborted,
} from './generationGuard.js';

/**
 * C-03: cancellation is a normal outcome, not an error. These tests pin the
 * three properties the controller relies on: recognisable abort errors, a
 * throw between chunks, and a single save decision that never persists after
 * a cancel or disconnect.
 */

test('isAbortError recognises provider and platform cancellations', () => {
  assert.equal(isAbortError(new GenerationAbortedError()), true);

  const domAbort = new Error('The operation was aborted.');
  domAbort.name = 'AbortError';
  assert.equal(isAbortError(domAbort), true);

  const coded = Object.assign(new Error('aborted'), { code: 'ABORT_ERR' });
  assert.equal(isAbortError(coded), true);
});

test('isAbortError leaves genuine failures for the retry path', () => {
  assert.equal(isAbortError(new Error('Gemini quota exceeded')), false);
  assert.equal(isAbortError({ name: 'TypeError' }), false);
  assert.equal(isAbortError(null), false);
  assert.equal(isAbortError(undefined), false);
  assert.equal(isAbortError('AbortError'), false);
});

test('throwIfAborted stops before work when the signal is already aborted', () => {
  const controller = new AbortController();
  assert.doesNotThrow(() => throwIfAborted(controller.signal));

  controller.abort();
  assert.throws(() => throwIfAborted(controller.signal), GenerationAbortedError);
  assert.throws(() => throwIfAborted(controller.signal), /cancelled/i);
});

test('throwIfAborted tolerates an absent signal', () => {
  assert.doesNotThrow(() => throwIfAborted(undefined));
  assert.doesNotThrow(() => throwIfAborted(null));
});

test('shouldPersistGeneration only allows a live, connected request', () => {
  assert.equal(shouldPersistGeneration({ aborted: false, clientGone: false }), true);
  assert.equal(shouldPersistGeneration({ aborted: true, clientGone: false }), false);
  assert.equal(shouldPersistGeneration({ aborted: false, clientGone: true }), false);
  assert.equal(shouldPersistGeneration({ aborted: true, clientGone: true }), false);
});
