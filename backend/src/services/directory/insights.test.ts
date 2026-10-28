import { test } from 'node:test';
import assert from 'node:assert/strict';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import {
  agencyReplyTimeHours,
  medianReplyHours,
  REPLY_TIME_MIN_SAMPLES,
  REPLY_TIME_WINDOW,
} from './insights.js';

/**
 * Milestone 9 D7 — the public reply-time line. The value is a median over the
 * most recent replies and is withheld until the agency has enough samples.
 */

const AGENCY_A = '507f1f77bcf86cd799439011';
const originalFind = AgencyEnquiry.find;

test.after(() => {
  (AgencyEnquiry as any).find = originalFind;
});

function replyChain(result: any[] | Error) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return chain;
}

function reply(createdHoursAgo: number, replyHoursAgo: number) {
  return {
    createdAt: new Date(Date.now() - createdHoursAgo * 3_600_000),
    repliedAt: new Date(Date.now() - replyHoursAgo * 3_600_000),
  };
}

test('the median is rounded, floors at one hour and ignores unusable rows', () => {
  assert.equal(
    medianReplyHours([
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T02:00:00Z' },
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T04:00:00Z' },
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T09:00:00Z' },
    ]),
    4
  );

  // Even sample: the mean of the middle pair, then rounded.
  assert.equal(
    medianReplyHours([
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T01:00:00Z' },
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T02:00:00Z' },
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T03:00:00Z' },
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T04:00:00Z' },
    ]),
    3
  );

  // A same-hour reply is still "about 1 h"; a negative pair is dropped.
  assert.equal(
    medianReplyHours([
      { createdAt: '2026-10-01T00:00:00Z', repliedAt: '2026-10-01T00:10:00Z' },
      { createdAt: '2026-10-01T05:00:00Z', repliedAt: '2026-10-01T01:00:00Z' },
      { createdAt: null, repliedAt: '2026-10-01T01:00:00Z' },
    ]),
    1
  );

  assert.equal(medianReplyHours([]), null);
});

test('the public value stays hidden below the sample threshold', async () => {
  const rows = Array.from(
    { length: REPLY_TIME_MIN_SAMPLES - 1 },
    (_, index) => reply(48, 24 + index)
  );
  (AgencyEnquiry as any).find = () => replyChain(rows);

  assert.equal(await agencyReplyTimeHours(AGENCY_A), null);
});

test('the public value reads the last twenty replies for one agency', async () => {
  let captured: { filter?: unknown; sort?: unknown; limit?: unknown; selected?: unknown } =
    {};
  const rows = Array.from({ length: REPLY_TIME_MIN_SAMPLES }, () => reply(48, 24));
  (AgencyEnquiry as any).find = (filter: unknown) => {
    captured.filter = filter;
    const chain = {
      select: (value: unknown) => {
        captured.selected = value;
        return chain;
      },
      sort: (value: unknown) => {
        captured.sort = value;
        return chain;
      },
      limit: (value: unknown) => {
        captured.limit = value;
        return chain;
      },
      lean: async () => rows,
    };
    return chain;
  };

  assert.equal(await agencyReplyTimeHours(AGENCY_A), 24);
  assert.deepEqual(captured.filter, {
    agencyId: AGENCY_A,
    repliedAt: { $type: 'date' },
  });
  assert.deepEqual(captured.sort, { repliedAt: -1, _id: -1 });
  assert.equal(captured.limit, REPLY_TIME_WINDOW);
  assert.match(String(captured.selected), /createdAt/);
  assert.match(String(captured.selected), /repliedAt/);
});

test('a failed read degrades to null and an invalid id never queries', async () => {
  let queried = false;
  (AgencyEnquiry as any).find = () => {
    queried = true;
    return replyChain(new Error('database unavailable'));
  };

  assert.equal(await agencyReplyTimeHours(AGENCY_A), null);

  queried = false;
  assert.equal(await agencyReplyTimeHours('not-an-id'), null);
  assert.equal(queried, false);
});

test('AgencyEnquiry carries the partial reply-time index', () => {
  const indexes = AgencyEnquiry.schema.indexes();
  const replyIndex = indexes.find(
    ([keys]) => keys.agencyId === 1 && keys.repliedAt === -1
  );
  assert.ok(replyIndex, 'the reply-time read needs (agencyId, repliedAt)');
  assert.deepEqual(replyIndex![1].partialFilterExpression, {
    repliedAt: { $type: 'date' },
  });
});
