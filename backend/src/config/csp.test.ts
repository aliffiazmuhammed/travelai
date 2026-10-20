import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCspDirectives,
  CSP_CONNECT_ORIGINS,
  CSP_IMAGE_ORIGINS,
} from './csp.js';

/**
 * M7.4 turned the previously disabled CSP into an explicit allow-list. These
 * tests pin the two things that tend to rot: scripts must stay free of
 * `unsafe-inline`/`unsafe-eval`, and the origins the real UI loads (map tiles,
 * covers, avatars, geocoding) must stay listed.
 */

test('CSP: scripts are self-only (no inline, no eval)', () => {
  const directives = buildCspDirectives(false) as Record<string, unknown>;
  assert.deepEqual(directives.scriptSrc, ["'self'"]);
  assert.deepEqual(directives.scriptSrcAttr, ["'none'"]);
  assert.deepEqual(directives.objectSrc, ["'none'"]);
  assert.deepEqual(directives.frameSrc, ["'none'"]);
  assert.ok(!JSON.stringify(directives.scriptSrc).includes('unsafe-'));
});

test('CSP: image allow-list covers covers, avatars and both tile providers', () => {
  assert.ok(CSP_IMAGE_ORIGINS.includes('https://images.unsplash.com'));
  assert.ok(CSP_IMAGE_ORIGINS.includes('https://res.cloudinary.com'));
  assert.ok(CSP_IMAGE_ORIGINS.includes('https://*.basemaps.cartocdn.com'));
  assert.ok(CSP_IMAGE_ORIGINS.includes('https://server.arcgisonline.com'));
});

test('CSP: browser connections stay same-origin plus Nominatim', () => {
  assert.deepEqual(CSP_CONNECT_ORIGINS, [
    "'self'",
    'https://nominatim.openstreetmap.org',
  ]);
});

test('CSP: upgrade-insecure-requests is production-only', () => {
  const dev = buildCspDirectives(true) as Record<string, unknown>;
  const prod = buildCspDirectives(false) as Record<string, unknown>;
  assert.equal(dev.upgradeInsecureRequests, null);
  assert.deepEqual(prod.upgradeInsecureRequests, []);
  assert.deepEqual(prod.defaultSrc, ["'self'"]);
  assert.deepEqual(prod.baseUri, ["'self'"]);
  assert.deepEqual(prod.frameAncestors, ["'self'"]);
  assert.deepEqual(prod.formAction, ["'self'"]);
});
