import { env } from '../../config/env.js';
import type {
  AgencyEnquiryMessageAuthor,
  AgencyEnquiryStatus,
} from '../../models/AgencyEnquiry.js';
import type {
  ConversationMessageView,
  ConversationUnreadView,
} from '../directory/conversations.js';

/**
 * Enquiry live updates (Milestone 9, R1) — the SSE bus behind `/enquiries`,
 * the traveller thread and the agency inbox.
 *
 * Same deployment caveat as services/collab/presence.ts, stated once and meant:
 * the stream registry lives in this process. With one instance (the current
 * Render deployment) it is correct; behind several it degrades to "no live
 * updates" while every screen still has its plain HTTP read. Redis pub/sub is
 * the documented upgrade path, deliberately not taken now.
 *
 * Two channel kinds, because the two audiences are different:
 *
 * - `user:<userId>` — one personal account's enquiries, threads and proposals.
 * - `agency:<agencyId>` — one tenant's inbox, shared by every member's tab.
 *
 * **Frames are hints, not state.** Each one names the enquiry it concerns and
 * carries at most what the receiving list already renders. A client that
 * missed frames, or reconnected after a deploy, resyncs with a GET; nothing
 * here is required for correctness.
 *
 * Presence-style rule that also applies here: live delivery is decoration.
 * Every route that opens a stream sits behind the same realm guard as the
 * matching read, and no access decision downstream reads this module.
 */

export type EnquiryReadSide = 'agency' | 'traveller';

/** What a client can receive on either channel. */
export type EnquiryEvent =
  | { type: 'hello'; channel: string; at: string }
  | {
      type: 'enquiry:new';
      enquiryId: string;
      status: AgencyEnquiryStatus;
      createdAt: string | null;
      at: string;
    }
  | {
      type: 'enquiry:message';
      enquiryId: string;
      message: ConversationMessageView;
      status: AgencyEnquiryStatus;
      /** Both sides' counters; a client reads its own key. */
      unread: ConversationUnreadView;
      lastMessageAt: string | null;
      lastMessageBy: AgencyEnquiryMessageAuthor | null;
      at: string;
    }
  | {
      type: 'enquiry:updated';
      enquiryId: string;
      status: AgencyEnquiryStatus;
      at: string;
    }
  | { type: 'enquiry:read'; enquiryId: string; side: EnquiryReadSide; at: string }
  | { type: 'proposal:new'; enquiryId: string; linkId: string; at: string }
  | {
      type: 'proposal:declined';
      enquiryId: string;
      linkId: string;
      declinedAt: string | null;
      at: string;
    };

export interface StreamSink {
  deliver: (event: EnquiryEvent) => void;
  /** Called when the cap evicts this stream; the transport must end it. */
  close: () => void;
}

interface OpenStream {
  sink: StreamSink;
}

const streams = new Map<string, OpenStream[]>();

/**
 * `user:<id>` for a personal account. Empty input yields the empty string so
 * callers can hand it straight to {@link emitTo}, which ignores it.
 */
export function userChannel(userId: unknown): string {
  const id = String(userId ?? '').trim();
  return id ? `user:${id}` : '';
}

/** `agency:<id>` for a tenant inbox. */
export function agencyChannel(agencyId: unknown): string {
  const id = String(agencyId ?? '').trim();
  return id ? `agency:${id}` : '';
}

/** Live tier switch, mirrored on `GET /api/health` as `enquiries.sse`. */
export const isEnquirySseEnabled = (): boolean => env.ENABLE_ENQUIRY_SSE;

/**
 * Registers one open SSE stream on a channel and returns its unsubscriber.
 *
 * Past `ENQUIRY_SSE_MAX_STREAMS` the oldest stream is closed rather than the
 * new one refused: a stale half-open connection is more likely than a genuine
 * thirty-tab session, and the client's EventSource reconnects on its own. The
 * eviction runs under try/catch because ending a socket that is already gone
 * must not break the stream that just arrived.
 */
export function openStream(channel: string, sink: StreamSink): () => void {
  if (!channel) return () => {};
  let list = streams.get(channel);
  if (!list) {
    list = [];
    streams.set(channel, list);
  }
  const entry: OpenStream = { sink };
  list.push(entry);

  while (list.length > env.ENQUIRY_SSE_MAX_STREAMS) {
    const oldest = list.shift();
    try {
      oldest?.sink.close();
    } catch {
      // A closing socket is already handled by its own cleanup.
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = streams.get(channel);
    if (!current) return;
    const index = current.indexOf(entry);
    if (index >= 0) current.splice(index, 1);
    if (current.length === 0) streams.delete(channel);
  };
}

/**
 * Fans a frame out to every stream on one channel. A broken socket must never
 * fail the write that produced the frame, so each delivery is isolated.
 */
export function emitTo(channel: string, event: EnquiryEvent): void {
  if (!channel) return;
  const list = streams.get(channel);
  if (!list || list.length === 0) return;
  for (const entry of [...list]) {
    try {
      entry.sink.deliver(event);
    } catch {
      // The stream's close handler removes it; a dead write is a no-op.
    }
  }
}

/** Test helper: how many streams are open on a channel. */
export function streamCount(channel: string): number {
  return streams.get(channel)?.length ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Semantic emitters                                                         */
/* -------------------------------------------------------------------------- */

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusOf(row: any): AgencyEnquiryStatus {
  return (row?.status ?? 'new') as AgencyEnquiryStatus;
}

/** A newly submitted enquiry: the tenant inbox learns about the lead. */
export function emitEnquiryCreated(row: any): void {
  const enquiryId = String(row?._id ?? '');
  const channel = agencyChannel(row?.agencyId);
  if (!enquiryId || !channel) return;
  emitTo(channel, {
    type: 'enquiry:new',
    enquiryId,
    status: statusOf(row),
    createdAt: iso(row?.createdAt),
    at: new Date().toISOString(),
  });
}

export interface EnquiryMessageNotice {
  /** The message exactly as the thread projection returns it. */
  message: ConversationMessageView;
  unread: ConversationUnreadView;
  lastMessageAt: string | null;
  lastMessageBy: AgencyEnquiryMessageAuthor | null;
}

/**
 * One new reply, fanned out to both sides. The traveller's channel is skipped
 * for legacy guest rows (`userId` absent) — they only have the private link.
 */
export function emitEnquiryMessage(row: any, notice: EnquiryMessageNotice): void {
  const enquiryId = String(row?._id ?? '');
  if (!enquiryId) return;
  const frame: EnquiryEvent = {
    type: 'enquiry:message',
    enquiryId,
    message: notice.message,
    status: statusOf(row),
    unread: notice.unread,
    lastMessageAt: notice.lastMessageAt,
    lastMessageBy: notice.lastMessageBy,
    at: new Date().toISOString(),
  };
  emitTo(agencyChannel(row?.agencyId), frame);
  emitTo(userChannel(row?.userId), frame);
}

/**
 * Status, claim or conversion change. Carries the status only: the assignee is
 * tenant bookkeeping and a traveller's list must never see an internal id.
 */
export function emitEnquiryUpdated(row: any): void {
  const enquiryId = String(row?._id ?? '');
  if (!enquiryId) return;
  const frame: EnquiryEvent = {
    type: 'enquiry:updated',
    enquiryId,
    status: statusOf(row),
    at: new Date().toISOString(),
  };
  emitTo(agencyChannel(row?.agencyId), frame);
  emitTo(userChannel(row?.userId), frame);
}

/**
 * The reader opened the thread; the **other** side gets the "seen" hint. Emit
 * only when receipts actually changed, so a refresh loop cannot flood a
 * collaborator's stream with identical frames.
 */
export function emitEnquiryRead(row: any, side: EnquiryReadSide): void {
  const enquiryId = String(row?._id ?? '');
  if (!enquiryId) return;
  const frame: EnquiryEvent = {
    type: 'enquiry:read',
    enquiryId,
    side,
    at: new Date().toISOString(),
  };
  if (side === 'agency') emitTo(userChannel(row?.userId), frame);
  else emitTo(agencyChannel(row?.agencyId), frame);
}

/** A live proposal now answers this enquiry; the traveller's list gets a card. */
export function emitProposalCreated(input: {
  enquiryId: unknown;
  userId: unknown;
  linkId: unknown;
}): void {
  const enquiryId = String(input.enquiryId ?? '');
  const linkId = String(input.linkId ?? '');
  const channel = userChannel(input.userId);
  if (!enquiryId || !linkId || !channel) return;
  emitTo(channel, {
    type: 'proposal:new',
    enquiryId,
    linkId,
    at: new Date().toISOString(),
  });
}

/**
 * The traveller turned this version down (R7). Only the tenant hears about it:
 * the traveller just answered their own screen, and the agency is the side that
 * needs to react. An ad-hoc client link carries no `enquiryId`; the frame names
 * the link instead.
 */
export function emitProposalDeclined(input: {
  agencyId: unknown;
  enquiryId?: unknown;
  linkId: unknown;
  declinedAt?: unknown;
}): void {
  const linkId = String(input.linkId ?? '');
  const channel = agencyChannel(input.agencyId);
  if (!linkId || !channel) return;
  emitTo(channel, {
    type: 'proposal:declined',
    enquiryId: String(input.enquiryId ?? ''),
    linkId,
    declinedAt: iso(input.declinedAt),
    at: new Date().toISOString(),
  });
}

/** Test helper: drops every open stream and listener between suites. */
export function resetForTests(): void {
  streams.clear();
}
