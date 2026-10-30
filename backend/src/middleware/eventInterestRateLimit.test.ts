import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import {
  EVENT_INTEREST_EMAIL_DAILY_LIMIT,
  EVENT_INTEREST_EVENT_IP_DAILY_LIMIT,
  EVENT_INTEREST_IP_DAILY_LIMIT,
  eventInterestEmailLimiter,
  eventInterestEventIpLimiter,
  eventInterestIpLimiter,
} from './rateLimiter.middleware.js';

/**
 * M10 QA-13: the interest form is the only anonymous write on the events
 * surface, so its buckets are pinned here. The network ceilings are env-driven
 * — an operator widens them without touching code — and every refusal names
 * the 24-hour reset, because the window is rolling, not "until midnight".
 *
 * Each test uses its own fake network so the limiters' shared memory store
 * cannot leak counts between cases.
 */

function request(overrides: Record<string, unknown> = {}): any {
  return {
    ip: '203.0.113.10',
    body: { email: 'traveller@example.com' },
    params: { eventId: 'event-a' },
    headers: {},
    originalUrl: '/api/events/event-a/interest',
    // express-rate-limit's IP validation reads the trust-proxy setting.
    app: { get: () => 1 },
    ...overrides,
  };
}

function response(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers[name.toLowerCase()] = String(value);
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      this.writableEnded = true;
      return this;
    },
  };
}

async function hit(
  middleware: any,
  req: any
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const res = response();
  let next = false;
  await middleware(req, res, () => {
    next = true;
  });
  return { status: next ? 200 : res.statusCode, body: res.body, headers: res.headers };
}

test('the network ceilings come from the environment', () => {
  assert.equal(EVENT_INTEREST_IP_DAILY_LIMIT, env.EVENT_INTEREST_IP_DAILY_LIMIT);
  assert.equal(
    EVENT_INTEREST_EVENT_IP_DAILY_LIMIT,
    env.EVENT_INTEREST_EVENT_IP_DAILY_LIMIT
  );
  assert.equal(
    EVENT_INTEREST_EMAIL_DAILY_LIMIT,
    env.EVENT_INTEREST_EMAIL_DAILY_LIMIT
  );
  // The five-a-day ceiling was the bug: a shared connection spent it on one
  // browsing session.
  assert.ok(EVENT_INTEREST_IP_DAILY_LIMIT > 5);
});

test('the network bucket allows the ceiling and refuses the next ask', async () => {
  const ip = '198.51.100.7';
  for (let i = 0; i < EVENT_INTEREST_IP_DAILY_LIMIT; i += 1) {
    const passed = await hit(
      eventInterestIpLimiter,
      request({
        ip,
        params: { eventId: `event-${i}` },
        body: { email: `person${i}@example.com` },
      })
    );
    assert.equal(passed.status, 200, `ask ${i + 1} of the day should pass`);
  }

  const blocked = await hit(
    eventInterestIpLimiter,
    request({ ip, params: { eventId: 'event-late' }, body: { email: 'late@example.com' } })
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.body?.message), /24 hours/);
  assert.equal(blocked.headers['ratelimit-limit'], String(EVENT_INTEREST_IP_DAILY_LIMIT));
});

test('one network flooding one event keeps its room for another event', async () => {
  const ip = '198.51.100.20';
  for (let i = 0; i < EVENT_INTEREST_EVENT_IP_DAILY_LIMIT; i += 1) {
    const passed = await hit(
      eventInterestEventIpLimiter,
      request({
        ip,
        params: { eventId: 'camp-a' },
        body: { email: `flood${i}@example.com` },
      })
    );
    assert.equal(passed.status, 200);
  }

  const blocked = await hit(
    eventInterestEventIpLimiter,
    request({ ip, params: { eventId: 'camp-a' }, body: { email: 'late@example.com' } })
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.body?.message), /this event/);
  assert.match(String(blocked.body?.message), /24 hours/);

  const otherEvent = await hit(
    eventInterestEventIpLimiter,
    request({ ip, params: { eventId: 'camp-b' }, body: { email: 'other@example.com' } })
  );
  assert.equal(otherEvent.status, 200);

  const otherNetwork = await hit(
    eventInterestEventIpLimiter,
    request({
      ip: '198.51.100.21',
      params: { eventId: 'camp-a' },
      body: { email: 'neighbour@example.com' },
    })
  );
  assert.equal(otherNetwork.status, 200);
});

test('one email address cannot queue up on many events', async () => {
  const email = 'repeat@example.com';
  for (let i = 0; i < EVENT_INTEREST_EMAIL_DAILY_LIMIT; i += 1) {
    const passed = await hit(
      eventInterestEmailLimiter,
      request({
        ip: `10.0.0.${i + 1}`,
        params: { eventId: `event-${i}` },
        body: { email },
      })
    );
    assert.equal(passed.status, 200);
  }

  const blocked = await hit(
    eventInterestEmailLimiter,
    request({ ip: '10.0.0.99', params: { eventId: 'event-z' }, body: { email } })
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.body?.message), /email address/);
  assert.match(String(blocked.body?.message), /24 hours/);
});