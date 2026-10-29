import mongoose, { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyEnquiry, {
  AGENCY_ENQUIRY_THREAD_LIMITS,
  type AgencyEnquiryBudgetBand,
  type AgencyEnquiryMessageAuthor,
  type AgencyEnquiryStatus,
} from '../../models/AgencyEnquiry.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { agencyCan, type AgencyRole } from '../agency/access.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { userLabel } from '../collab/comments.js';
import {
  hashToken,
  mintInviteToken,
  pickLinkOrigin,
  tokenHint,
  type LinkOriginHints,
} from '../collab/invites.js';

/**
 * The two-way enquiry thread (Milestone 9 D8).
 *
 * Four rules shape this module:
 *
 * 1. **One thread, one enquiry.** Messages live on the enquiry document, so a
 *    read is always tenant-scoped by `agencyId` and a reply can never attach to
 *    a lead the caller cannot see.
 * 2. **Two capabilities.** A signed-in traveller replies through their own
 *    account; a guest replies through the private link minted at submit. The raw
 *    token exists only in that link — the row stores a sha256 hash and a short
 *    hint, exactly like proposal shares and trip invites.
 * 3. **Reads are receipts.** The side that did not write a message fills in its
 *    read timestamp; unread counts are derived from the same array, never a
 *    second counter that can drift.
 * 4. **Replying is answering.** The first agency message stamps `repliedAt` and
 *    moves a `new` lead to `replied`, so the profile's reply-time badge finally
 *    measures a reply that reached the traveller in-app.
 */

const DAY_MS = 86_400_000;

/* -------------------------------------------------------------------------- */
/*  Token capability                                                          */
/* -------------------------------------------------------------------------- */

export interface ConversationToken {
  raw: string;
  hash: string;
  hint: string;
  expiresAt: Date;
}

/** Mints the private guest link. The raw token is returned once, never stored. */
export function mintConversationToken(now: Date = new Date()): ConversationToken {
  const raw = mintInviteToken();
  return {
    raw,
    hash: hashToken(raw),
    hint: tokenHint(raw),
    expiresAt: new Date(
      now.getTime() + AGENCY_ENQUIRY_THREAD_LIMITS.tokenTtlDays * DAY_MS
    ),
  };
}

export function conversationUrl(
  rawToken: string,
  hints: LinkOriginHints = {}
): string {
  return `${pickLinkOrigin(hints)}/conversation/${rawToken}`;
}

export function conversationTokenIsValid(
  row: { conversationTokenExpiresAt?: Date | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!row?.conversationTokenExpiresAt) return false;
  const expiresAt = new Date(row.conversationTokenExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

/* -------------------------------------------------------------------------- */
/*  Projections                                                               */
/* -------------------------------------------------------------------------- */

export interface ConversationMessageView {
  id: string;
  author: AgencyEnquiryMessageAuthor;
  authorName: string;
  body: string;
  createdAt: string | null;
  readByAgencyAt: string | null;
  readByTravellerAt: string | null;
}

export interface ConversationUnreadView {
  agency: number;
  traveller: number;
}

export interface ConversationMeta {
  replyCount: number;
  unread: ConversationUnreadView;
  lastMessageAt: string | null;
  lastMessageBy: AgencyEnquiryMessageAuthor | null;
}

export interface ConversationDatesView {
  start: string | null;
  end: string | null;
  flexible: boolean;
}

export interface ConversationView {
  id: string;
  status: AgencyEnquiryStatus;
  agency: { name: string; slug: string };
  traveller: { name: string };
  enquiry: {
    source: 'profile' | 'package';
    message: string;
    party: { adults: number; children: number };
    dates: ConversationDatesView;
    budgetBand: AgencyEnquiryBudgetBand | null;
    packageTitle: string | null;
    createdAt: string | null;
  };
  messages: ConversationMessageView[];
  unread: ConversationUnreadView;
  lastMessageAt: string | null;
  lastMessageBy: AgencyEnquiryMessageAuthor | null;
  repliedAt: string | null;
  /** Guest link expiry; null for a signed-in traveller. */
  expiresAt: string | null;
  canReply: boolean;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function projectConversationMessage(message: any): ConversationMessageView {
  return {
    id: String(message?._id ?? ''),
    author: message?.author === 'agency' ? 'agency' : 'traveller',
    authorName: text(message?.authorName),
    body: text(message?.body),
    createdAt: iso(message?.createdAt),
    readByAgencyAt: iso(message?.readByAgencyAt),
    readByTravellerAt: iso(message?.readByTravellerAt),
  };
}

export function conversationMessages(row: any): ConversationMessageView[] {
  const rows = Array.isArray(row?.messages) ? row.messages : [];
  return rows.map(projectConversationMessage);
}

/**
 * Counters the inbox and the traveller history need without shipping a whole
 * thread. A receipt is only "unread" when the other side wrote it and has not
 * opened the thread since.
 */
export function conversationMeta(row: any): ConversationMeta {
  const rows = Array.isArray(row?.messages) ? row.messages : [];
  let agencyUnread = 0;
  let travellerUnread = 0;
  for (const message of rows) {
    if (message?.author === 'traveller') {
      if (!message.readByAgencyAt) agencyUnread += 1;
    } else if (message?.author === 'agency') {
      if (!message.readByTravellerAt) travellerUnread += 1;
    }
  }
  return {
    replyCount: rows.length,
    unread: { agency: agencyUnread, traveller: travellerUnread },
    lastMessageAt: iso(row?.lastMessageAt),
    lastMessageBy:
      row?.lastMessageBy === 'agency'
        ? 'agency'
        : row?.lastMessageBy === 'traveller'
          ? 'traveller'
          : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeBody(value: unknown): string {
  const body = text(value);
  if (!body) {
    throw new AppError('Write a message before sending it.', 400);
  }
  if (body.length > AGENCY_ENQUIRY_THREAD_LIMITS.body) {
    throw new AppError(
      `Keep your message under ${AGENCY_ENQUIRY_THREAD_LIMITS.body} characters.`,
      400
    );
  }
  return body;
}

async function markRead(
  enquiryId: mongoose.Types.ObjectId | string,
  side: AgencyEnquiryMessageAuthor,
  now: Date
): Promise<void> {
  // `side` is the reader; the messages it has not opened belong to the other
  // author. A missing timestamp matches the null filter in MongoDB.
  const field =
    side === 'agency' ? 'readByAgencyAt' : 'readByTravellerAt';
  await AgencyEnquiry.updateOne(
    { _id: enquiryId },
    { $set: { [`messages.$[m].${field}`]: now } },
    {
      arrayFilters: [
        { 'm.author': side === 'agency' ? 'traveller' : 'agency', [`m.${field}`]: null },
      ],
    }
  );
}

/** Marks every message the agency has not opened, scoped to the tenant. */
export async function markAgencyConversationRead(
  agencyId: string,
  enquiryId: string
): Promise<Date> {
  const now = new Date();
  await AgencyEnquiry.updateOne(
    { _id: enquiryId, agencyId },
    { $set: { 'messages.$[m].readByAgencyAt': now } },
    { arrayFilters: [{ 'm.author': 'traveller', 'm.readByAgencyAt': null }] }
  );
  return now;
}

/**
 * Mirrors {@link markAgencyConversationRead} on an already-loaded lean row, so
 * a detail read can answer with the receipts it just wrote without a re-read.
 */
export function applyConversationRead(
  row: any,
  side: AgencyEnquiryMessageAuthor,
  now: Date
): void {
  applyReadInMemory(row, side, now);
}

function applyReadInMemory(
  row: any,
  side: AgencyEnquiryMessageAuthor,
  now: Date
): void {
  const rows = Array.isArray(row?.messages) ? row.messages : [];
  const field = side === 'agency' ? 'readByAgencyAt' : 'readByTravellerAt';
  for (const message of rows) {
    const authoredByOther =
      side === 'agency'
        ? message?.author === 'traveller'
        : message?.author === 'agency';
    if (authoredByOther && !message[field]) message[field] = now;
  }
}

interface PushMessageInput {
  row: any;
  author: AgencyEnquiryMessageAuthor;
  authorName: string;
  authorId?: string | null;
  body: unknown;
}

/**
 * Appends one message and returns the refreshed row.
 *
 * Reading the other side's messages is folded into the same call: replying is
 * an acknowledgement, so a traveller who answers does not leave the agency's
 * earlier replies unread (and vice versa).
 */
async function pushMessage(input: PushMessageInput): Promise<any> {
  const body = normalizeBody(input.body);
  const now = new Date();
  const row = input.row;

  await markRead(row._id, input.author, now);

  const message = {
    _id: new Types.ObjectId(),
    author: input.author,
    authorId:
      input.authorId && mongoose.isValidObjectId(input.authorId)
        ? new Types.ObjectId(input.authorId)
        : null,
    authorName: input.authorName,
    body,
    createdAt: now,
    readByAgencyAt: input.author === 'agency' ? now : null,
    readByTravellerAt: input.author === 'traveller' ? now : null,
  };

  const $set: Record<string, unknown> = {
    lastMessageAt: now,
    lastMessageBy: input.author,
  };
  if (input.author === 'agency') {
    if (!row.repliedAt) $set.repliedAt = now;
    if (row.status === 'new') $set.status = 'replied';
  }

  const updated = await AgencyEnquiry.findOneAndUpdate(
    { _id: row._id, agencyId: row.agencyId },
    {
      $push: {
        messages: {
          $each: [message],
          $slice: -AGENCY_ENQUIRY_THREAD_LIMITS.messages,
        },
      },
      $set,
    },
    { new: true }
  ).lean();

  if (!updated) {
    throw new AppError('Enquiry not found.', 404);
  }
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Loads                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadConversationByToken(rawToken: unknown): Promise<{
  row: any;
  agency: any;
}> {
  const token = text(rawToken);
  if (!token) {
    throw new AppError('This conversation link is not valid.', 404);
  }
  const row = (await AgencyEnquiry.findOne({
    conversationTokenHash: hashToken(token),
  })
    .select('+conversationTokenHash')
    .lean()) as any;
  if (!row || !conversationTokenIsValid(row)) {
    throw new AppError('This conversation link is not valid.', 404);
  }
  const agency = (await Agency.findById(row.agencyId)
    .select('name slug status')
    .lean()) as any;
  // A suspended tenant fails closed, and the link must not reveal whether the
  // agency exists at all.
  if (!agency || agency.status !== 'active') {
    throw new AppError('This conversation link is not valid.', 404);
  }
  return { row, agency };
}

async function loadOwnRow(userId: string, enquiryId: string): Promise<any> {
  if (!mongoose.isValidObjectId(enquiryId)) {
    throw new AppError('Enquiry not found.', 404);
  }
  const row = await AgencyEnquiry.findOne({
    _id: enquiryId,
    userId,
  }).lean();
  if (!row) {
    throw new AppError('Enquiry not found.', 404);
  }
  return row;
}

async function loadAgencyRow(
  agencyId: string,
  enquiryId: string
): Promise<any> {
  if (!mongoose.isValidObjectId(enquiryId)) {
    throw new AppError('Enquiry not found.', 404);
  }
  const row = await AgencyEnquiry.findOne({
    _id: enquiryId,
    agencyId,
  }).lean();
  if (!row) {
    throw new AppError('Enquiry not found.', 404);
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

async function packageTitleFor(row: any): Promise<string | null> {
  if (!row?.packageId) return null;
  const pkg = (await AgencyPackage.findOne({
    _id: row.packageId,
    agencyId: row.agencyId,
  })
    .select('title')
    .lean()) as any;
  return pkg ? text(pkg.title) || 'Trip package' : null;
}

async function buildConversationView(
  row: any,
  agency: any,
  options: { expiresAt?: Date | null; canReply?: boolean } = {}
): Promise<ConversationView> {
  return {
    id: String(row?._id ?? ''),
    status: (row?.status ?? 'new') as AgencyEnquiryStatus,
    agency: {
      name: text(agency?.name) || 'The agency',
      slug: text(agency?.slug),
    },
    traveller: { name: text(row?.contact?.name) },
    enquiry: {
      source: row?.source === 'package' ? 'package' : 'profile',
      message: text(row?.message),
      party: {
        adults: Math.max(0, Number(row?.party?.adults) || 0),
        children: Math.max(0, Number(row?.party?.children) || 0),
      },
      dates: {
        start: iso(row?.dates?.start),
        end: iso(row?.dates?.end),
        flexible: row?.dates?.flexible === true,
      },
      budgetBand: (row?.budgetBand ?? null) as AgencyEnquiryBudgetBand | null,
      packageTitle: await packageTitleFor(row),
      createdAt: iso(row?.createdAt),
    },
    messages: conversationMessages(row),
    unread: conversationMeta(row).unread,
    lastMessageAt: iso(row?.lastMessageAt),
    lastMessageBy:
      row?.lastMessageBy === 'traveller' || row?.lastMessageBy === 'agency'
        ? row.lastMessageBy
        : null,
    repliedAt: iso(row?.repliedAt),
    expiresAt: iso(options.expiresAt ?? null),
    canReply: options.canReply !== false,
  };
}

/**
 * Guest read: validates the link, records that the traveller opened the thread
 * and returns the same conversation the signed-in page shows.
 */
export async function getConversationByToken(
  rawToken: unknown
): Promise<ConversationView> {
  const { row, agency } = await loadConversationByToken(rawToken);
  const now = new Date();
  await markRead(row._id, 'traveller', now);
  applyReadInMemory(row, 'traveller', now);
  return buildConversationView(row, agency, {
    expiresAt: row.conversationTokenExpiresAt,
  });
}

/** Signed-in read: the enquiry must belong to this personal account. */
export async function getOwnConversation(
  userId: string,
  enquiryId: string
): Promise<ConversationView> {
  const row = await loadOwnRow(userId, enquiryId);
  const agency = (await Agency.findById(row.agencyId)
    .select('name slug')
    .lean()) as any;
  const now = new Date();
  await markRead(row._id, 'traveller', now);
  applyReadInMemory(row, 'traveller', now);
  return buildConversationView(row, agency);
}

/* -------------------------------------------------------------------------- */
/*  Replies                                                                   */
/* -------------------------------------------------------------------------- */

async function withConversationView(
  row: any,
  options: { expiresAt?: Date | null; canReply?: boolean } = {}
): Promise<ConversationView> {
  const agency = (await Agency.findById(row.agencyId)
    .select('name slug')
    .lean()) as any;
  return buildConversationView(row, agency, options);
}

/** Guest reply through the private link. */
export async function appendGuestMessage(
  rawToken: unknown,
  body: unknown
): Promise<ConversationView> {
  const { row } = await loadConversationByToken(rawToken);
  const updated = await pushMessage({
    row,
    author: 'traveller',
    authorName: text(row.contact?.name) || 'Traveller',
    body,
  });
  return withConversationView(updated, {
    expiresAt: row.conversationTokenExpiresAt,
  });
}

/** Signed-in traveller reply. */
export async function appendOwnMessage(input: {
  userId: string;
  enquiryId: string;
  body: unknown;
}): Promise<ConversationView> {
  const row = await loadOwnRow(input.userId, input.enquiryId);
  const user = (await User.findById(input.userId)
    .select('name email')
    .lean()) as any;
  const updated = await pushMessage({
    row,
    author: 'traveller',
    authorId: input.userId,
    authorName: userLabel(user) || text(row.contact?.name) || 'Traveller',
    body: input.body,
  });
  return withConversationView(updated);
}

/** Agency reply. Planner work; the row is narrowed to the session tenant. */
export async function appendAgencyMessage(input: {
  agencyId: string;
  enquiryId: string;
  actorId: string;
  actorRole: AgencyRole;
  body: unknown;
}): Promise<ConversationView> {
  if (!agencyCan(input.actorRole, 'planner')) {
    throw new AppError("You don't have permission to reply to enquiries.", 403);
  }
  const row = await loadAgencyRow(input.agencyId, input.enquiryId);
  const actor = (await User.findById(input.actorId)
    .select('name email')
    .lean()) as any;
  const updated = await pushMessage({
    row,
    author: 'agency',
    authorId: input.actorId,
    authorName: userLabel(actor) || 'The agency',
    body: input.body,
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'enquiry.replied',
    targetType: 'enquiry',
    targetId: String(updated._id),
    metadata: {
      messageId: String(updated.messages[updated.messages.length - 1]?._id ?? ''),
      status: updated.status,
    },
  });

  return withConversationView(updated);
}
