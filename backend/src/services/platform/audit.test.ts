import { test } from 'node:test';
import assert from 'node:assert/strict';
import PlatformAudit from '../../models/PlatformAudit.js';
import {
  recordPlatformAudit,
  sanitizeAuditMetadata,
} from './audit.js';

/**
 * PA1 audit foundation. The sanitizer is the security boundary: admin metadata
 * is written by future call sites that may pass whole request bodies, so secret
 * keys, excessive depth and oversized strings must never reach the collection.
 */

test('audit metadata strips secret-shaped keys at every depth', () => {
  const sanitized = sanitizeAuditMetadata({
    email: 'ops@example.com',
    password: 'hunter2',
    nested: {
      apiKey: 'sk-live',
      authorization: 'Bearer abc',
      keep: 'yes',
    },
    list: [{ token: 't', label: 'visible' }],
  });

  assert.deepEqual(sanitized, {
    email: 'ops@example.com',
    nested: { keep: 'yes' },
    list: [{ label: 'visible' }],
  });
});

test('audit metadata caps string length and array size', () => {
  const sanitized = sanitizeAuditMetadata({
    long: 'x'.repeat(900),
    items: Array.from({ length: 50 }, (_, index) => index),
  }) as Record<string, unknown>;

  assert.equal(String(sanitized.long).length, 501);
  assert.equal((sanitized.items as unknown[]).length, 20);
});

test('audit metadata ignores non-object payloads and empty results', () => {
  assert.equal(sanitizeAuditMetadata('plain text'), undefined);
  assert.equal(sanitizeAuditMetadata(null), undefined);
  assert.equal(sanitizeAuditMetadata(['array']), undefined);
  assert.equal(sanitizeAuditMetadata({ password: 'x' }), undefined);
});

test('recordPlatformAudit writes sanitized rows', async () => {
  const original = PlatformAudit.create;
  let created: any = null;
  (PlatformAudit as any).create = async (doc: unknown) => {
    created = doc;
    return doc;
  };

  try {
    await recordPlatformAudit({
      actorId: '507f1f77bcf86cd799439011',
      action: 'platform.signin',
      targetType: 'platform_account',
      targetId: '507f1f77bcf86cd799439011',
      metadata: { email: 'ops@example.com', password: 'never' },
      ip: '127.0.0.1',
    });
  } finally {
    (PlatformAudit as any).create = original;
  }

  assert.ok(created);
  assert.equal(created.action, 'platform.signin');
  assert.deepEqual(created.metadata, { email: 'ops@example.com' });
});

test('a failed audit write never fails the caller', async () => {
  const original = PlatformAudit.create;
  (PlatformAudit as any).create = async () => {
    throw new Error('audit collection unavailable');
  };

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.doesNotReject(() =>
      recordPlatformAudit({
        actorId: '507f1f77bcf86cd799439011',
        action: 'platform.signin',
        targetType: 'platform_account',
      })
    );
  } finally {
    (PlatformAudit as any).create = original;
    console.warn = originalWarn;
  }
});
