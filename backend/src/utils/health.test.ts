import assert from 'node:assert/strict';
import test from 'node:test';
import { healthState } from './health.js';

test('healthState: connected is the only healthy state', () => {
  const connected = healthState(1);
  assert.equal(connected.ok, true);
  assert.equal(connected.status, 'healthy');
  assert.equal(connected.database, 'connected');
  assert.equal(connected.httpStatus, 200);
});

test('healthState: a disconnected database is a 503', () => {
  const disconnected = healthState(0);
  assert.equal(disconnected.ok, false);
  assert.equal(disconnected.status, 'unhealthy');
  assert.equal(disconnected.database, 'disconnected');
  assert.equal(disconnected.httpStatus, 503);
});

test('healthState: startup and shutdown states are not ready', () => {
  for (const state of [2, 3]) {
    const result = healthState(state);
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 503);
  }
  assert.equal(healthState(2).database, 'connecting');
  assert.equal(healthState(3).database, 'disconnecting');
});

test('healthState: an unknown readyState fails closed', () => {
  const unknown = healthState(99);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 'unhealthy');
  assert.equal(unknown.database, 'unknown');
  assert.equal(unknown.httpStatus, 503);
});
