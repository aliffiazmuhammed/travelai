import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnquiryStream,
  subscribeAgencyEnquiryEvents,
  subscribeMyEnquiryEvents,
} from './enquiries.controller.js';
import {
  emitTo,
  resetForTests,
  streamCount,
  userChannel,
} from '../services/realtime/enquiryEvents.js';
import { env } from '../config/env.js';

/**
 * Milestone 9 R1 — the enquiry stream endpoints.
 *
 * `startEnquiryStream` is driven with a fake response so the transport rules
 * (headers, `:ok`, `hello`, fan-out, cleanup) are pinned without a live socket.
 * The two handlers are checked for the dark-tier contract: when
 * `ENABLE_ENQUIRY_SSE` is off, the path is indistinguishable from an unknown
 * one, exactly like the platform admin namespace.
 */

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  chunks: string[];
  ended: boolean;
  closeHandlers: Array<() => void>;
  writeHead: (status: number, headers: Record<string, string>) => void;
  write: (chunk: string) => void;
  end: () => void;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => void;
  on: (event: string, handler: () => void) => void;
  body?: any;
}

function fakeResponse(): FakeResponse {
  const res: any = {
    statusCode: 200,
    headers: {},
    chunks: [],
    ended: false,
    closeHandlers: [],
    body: undefined,
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    write(chunk: string) {
      this.chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
    },
    on(event: string, handler: () => void) {
      if (event === 'close') this.closeHandlers.push(handler);
    },
  };
  return res;
}

function fakeRequest(): any {
  return { closeHandlers: [] as Array<() => void>, on() {}, userId: '64c000000000000000000901' };
}

function framesOf(res: FakeResponse): any[] {
  return res.chunks
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

test.beforeEach(() => resetForTests());

test('the stream opens with SSE headers, a comment and a hello frame', () => {
  const req = fakeRequest();
  const res = fakeResponse();
  const channel = userChannel('64c000000000000000000901');

  startEnquiryStream(req, res, channel);
  res.closeHandlers.forEach((handler) => handler());

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/event-stream');
  assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
  assert.equal(res.headers['X-Accel-Buffering'], 'no', 'proxies must not buffer frames');
  assert.equal(res.chunks[0], ':ok\n\n');

  const frames = framesOf(res);
  assert.equal(frames.length, 1);
  assert.deepEqual(Object.keys(frames[0]).sort(), ['at', 'channel', 'type']);
  assert.equal(frames[0].type, 'hello');
  assert.equal(frames[0].channel, channel);
});

test('bus frames reach the response while the stream is open', () => {
  const req = fakeRequest();
  const res = fakeResponse();
  const channel = userChannel('64c000000000000000000901');

  startEnquiryStream(req, res, channel);
  emitTo(channel, {
    type: 'enquiry:updated',
    enquiryId: '64c000000000000000000902',
    status: 'replied',
    at: '2026-10-29T10:00:00.000Z',
  });

  assert.equal(framesOf(res).filter((frame) => frame.type === 'enquiry:updated').length, 1);
  res.closeHandlers.forEach((handler) => handler());
});

test('closing the response unsubscribes exactly once', () => {
  const req = fakeRequest();
  const res = fakeResponse();
  const channel = userChannel('64c000000000000000000901');

  startEnquiryStream(req, res, channel);
  assert.equal(streamCount(channel), 1);

  // Both req and res fire close; the second must be a no-op.
  res.closeHandlers.forEach((handler) => handler());
  res.closeHandlers.forEach((handler) => handler());
  assert.equal(streamCount(channel), 0);

  const before = res.chunks.length;
  emitTo(channel, {
    type: 'enquiry:read',
    enquiryId: '64c000000000000000000902',
    side: 'agency',
    at: '2026-10-29T10:00:00.000Z',
  });
  assert.equal(res.chunks.length, before, 'a closed stream receives nothing');
});

test('when the cap evicts a stream the transport ends it', () => {
  const channel = userChannel('64c000000000000000000901');
  const responses: FakeResponse[] = [fakeResponse()];
  startEnquiryStream(fakeRequest(), responses[0], channel);
  assert.equal(responses[0].ended, false);

  for (let index = 0; index < env.ENQUIRY_SSE_MAX_STREAMS; index += 1) {
    const res = fakeResponse();
    responses.push(res);
    startEnquiryStream(fakeRequest(), res, channel);
  }

  assert.equal(responses[0].ended, true, 'the oldest socket is ended, not the newest');
  assert.equal(streamCount(channel), env.ENQUIRY_SSE_MAX_STREAMS);

  // Close the survivors so their keepalive timers do not outlive the suite.
  for (const res of responses) res.closeHandlers.forEach((handler) => handler());
  assert.equal(streamCount(channel), 0);
});

test('the personal stream answers an unknown-path 404 while the tier is dark', () => {
  assert.equal(env.ENABLE_ENQUIRY_SSE, false, 'the default must stay off');
  const res = fakeResponse();
  subscribeMyEnquiryEvents(fakeRequest(), res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, error: 'Not found', message: 'Not found' });
  assert.equal(res.chunks.length, 0);
});

test('the agency stream is dark on the same switch', () => {
  assert.equal(env.ENABLE_ENQUIRY_SSE, false);
  const res = fakeResponse();
  subscribeAgencyEnquiryEvents(fakeRequest(), res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, error: 'Not found', message: 'Not found' });
});
