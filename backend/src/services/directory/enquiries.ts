import mongoose, { type FilterQuery, Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry, {
  AGENCY_ENQUIRY_BUDGET_BANDS,
  AGENCY_ENQUIRY_LIMITS,
  type AgencyEnquiryBudgetBand,
  type AgencyEnquiryStatus,
} from '../../models/AgencyEnquiry.js';
import AgencyMember from '../../models/AgencyMember.js';
import AgencyPackage from '../../models/AgencyPackage.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { agencyCan, type AgencyRole } from '../agency/access.js';
import { recordAgencyAudit } from '../agency/audit.js';
import {
  projectAgencyClient,
  type AgencyClientSummary,
} from '../agency/clients.js';
import { effectiveQuoteStatus } from '../agency/quotes.js';
import { createAgencyTrip } from '../agency/trips.js';
import { userLabel } from '../collab/comments.js';
import {
  applyConversationRead,
  conversationMessages,
  conversationMeta,
  markAgencyConversationRead,
  type ConversationMessageView,
  type ConversationUnreadView,
} from './conversations.js';
import {
  emitEnquiryCreated,
  emitEnquiryRead,
  emitEnquiryUpdated,
} from '../realtime/enquiryEvents.js';
import { loadPublicAgencyRecord } from './profile.js';

/**
 * Public enquiry intake, the two read models and the agency's lead actions
 * (Milestone 9 D5/D6).
 *
 * Four rules shape this module:
 *
 * 1. **Submission is inert.** The public write creates exactly one enquiry row;
 *    no client, quote, membership or notification exists until an agency member
 *    explicitly converts the lead.
 * 2. **Public eligibility is the profile's.** The slug lookup reuses
 *    `loadPublicAgencyRecord`, so a suspended agency, an unpublished profile or
 *    an ops-hidden profile answers the same 404 as the page itself.
 * 3. **Nothing is echoed back to the visitor.** The acknowledgement carries an
 *    id, status and timestamp only. Contact details go to the owning tenant.
 * 4. **Inbox actions are tenant-scoped and accountable.** Claim is an atomic
 *    conditional update (two members racing cannot both win), conversion is
 *    idempotent through the enquiry → client link plus a unique index, and every
 *    status/claim/conversion writes one audit row.
 *
 * Dates are calendar days. They are normalised to UTC midnight so a server in
 * another timezone cannot shift the traveller's chosen day.
 */

const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface EnquiryDateView {
  start: string | null;
  end: string | null;
  flexible: boolean;
}

export interface AgencyEnquiryPackageView {
  id: string;
  title: string;
  /** Tenant-only: the package's provenance trip, for the quote hand-off. */
  tripId?: string | null;
}

export interface AgencyEnquiryClientView {
  id: string;
  name: string;
}

export interface AgencyEnquiryAssigneeView {
  id: string;
  name: string;
}

export interface AgencyEnquiryProposalsView {
  count: number;
  lastAt: string | null;
}

export interface AgencyEnquiryView {
  id: string;
  status: AgencyEnquiryStatus;
  source: 'profile' | 'package';
  contact: { name: string; email: string; phone: string | null };
  party: { adults: number; children: number };
  dates: EnquiryDateView;
  budgetBand: AgencyEnquiryBudgetBand | null;
  message: string;
  package: AgencyEnquiryPackageView | null;
  /** Present only on a consumer's own history (never on the tenant inbox). */
  agency?: { name: string; slug: string } | null;
  /** The directory client this lead became, once converted (tenant view). */
  client: AgencyEnquiryClientView | null;
  /** Tenant-only: the trip started from this lead, for the quote hand-off. */
  tripId: string | null;
  assignedTo: string | null;
  /** Display name for `assignedTo`; null when unclaimed. */
  assignee: AgencyEnquiryAssigneeView | null;
  consentAt: string | null;
  repliedAt: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  /** D8: replies after the opening enquiry. */
  replyCount: number;
  unread: ConversationUnreadView;
  lastMessageAt: string | null;
  lastMessageBy: 'traveller' | 'agency' | null;
  /** Full thread on the detail read; omitted from list projections. */
  messages?: ConversationMessageView[];
  /** When the guest link stops working (agency view only). */
  conversationExpiresAt: string | null;
  /**
   * Live proposals answering this enquiry (consumer history only). Lets the
   * traveller see that a plan was sent without opening every thread.
   */
  proposals?: AgencyEnquiryProposalsView;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AgencyEnquiryPage {
  enquiries: AgencyEnquiryView[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface EnquirySubmissionInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  adults?: unknown;
  children?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  flexible?: unknown;
  budgetBand?: unknown;
  message?: unknown;
  packageId?: unknown;
  consent?: unknown;
}

interface EnquiryCursor {
  createdAt: Date;
  id: string;
}

/* -------------------------------------------------------------------------- */
/*  Normalisation and validation                                              */
/* -------------------------------------------------------------------------- */

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Parses a `YYYY-MM-DD` calendar day; null means "not supplied". */
export function parseEnquiryDate(
  value: unknown,
  label: 'start date' | 'end date'
): Date | null {
  const raw = text(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(`Choose a valid ${label}.`, 400);
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  // The round-trip rejects a well-shaped but impossible day such as 2026-02-31.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new AppError(`Choose a valid ${label}.`, 400);
  }
  return date;
}

/**
 * Applies the date rules: explicit days must be in the future and ordered, and
 * a non-flexible enquiry must name a start date. "Future-or-flexible" is the
 * contract; a deliberate past date is always a mistake, flexible or not.
 */
export function normalizeEnquiryDates(
  input: Pick<EnquirySubmissionInput, 'startDate' | 'endDate' | 'flexible'>,
  now: Date = new Date()
): { start: Date | null; end: Date | null; flexible: boolean } {
  const flexible = input.flexible === true;
  const start = parseEnquiryDate(input.startDate, 'start date');
  const end = parseEnquiryDate(input.endDate, 'end date');

  if (end && !start) {
    throw new AppError('Add a start date along with your end date.', 400);
  }
  if (!flexible && !start) {
    throw new AppError(
      'Choose a start date, or tick "My dates are flexible".',
      400
    );
  }
  if (start && start.getTime() < utcMidnight(now)) {
    throw new AppError(
      'Choose a future start date, or tick "My dates are flexible".',
      400
    );
  }
  if (start && end) {
    if (end.getTime() < start.getTime()) {
      throw new AppError('Your end date must be on or after the start date.', 400);
    }
    if ((end.getTime() - start.getTime()) / DAY_MS > AGENCY_ENQUIRY_LIMITS.dateSpanDays) {
      throw new AppError(
        `Keep the trip under ${AGENCY_ENQUIRY_LIMITS.dateSpanDays} days, or mark your dates flexible.`,
        400
      );
    }
  }

  return { start, end, flexible };
}

function normalizeName(value: unknown): string {
  const name = text(value);
  if (name.length < 2) {
    throw new AppError('Tell the agency your name.', 400);
  }
  if (name.length > AGENCY_ENQUIRY_LIMITS.name) {
    throw new AppError(
      `Keep your name under ${AGENCY_ENQUIRY_LIMITS.name} characters.`,
      400
    );
  }
  return name;
}

function normalizeEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  if (
    email.length > AGENCY_ENQUIRY_LIMITS.email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new AppError('Enter an email address the agency can reply to.', 400);
  }
  return email;
}

function normalizePhone(value: unknown): string | null {
  const phone = text(value);
  if (!phone) return null;
  if (phone.length > AGENCY_ENQUIRY_LIMITS.phone) {
    throw new AppError(
      `Keep your phone number under ${AGENCY_ENQUIRY_LIMITS.phone} characters.`,
      400
    );
  }
  return phone;
}

function normalizeCount(value: unknown, min: number, max: number, label: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < min || count > max) {
    throw new AppError(
      `${label} must be a whole number between ${min} and ${max}.`,
      400
    );
  }
  return count;
}

function normalizeBudgetBand(value: unknown): AgencyEnquiryBudgetBand | null {
  const raw = text(value);
  if (!raw) return null;
  if (!(AGENCY_ENQUIRY_BUDGET_BANDS as readonly string[]).includes(raw)) {
    throw new AppError('Choose a budget from the list, or leave it blank.', 400);
  }
  return raw as AgencyEnquiryBudgetBand;
}

function normalizeMessage(value: unknown): string {
  const message = text(value);
  if (message.length < 20) {
    throw new AppError(
      'Tell the agency a little about the trip you have in mind (at least 20 characters).',
      400
    );
  }
  if (message.length > AGENCY_ENQUIRY_LIMITS.message) {
    throw new AppError(
      `Keep your message under ${AGENCY_ENQUIRY_LIMITS.message} characters.`,
      400
    );
  }
  return message;
}

/**
 * Allow-list builder. The `consent` flag is re-checked here rather than trusted
 * from the schema, because a consent timestamp without consent is a compliance
 * bug, not a validation detail.
 */
export function buildAgencyEnquiryFields(input: EnquirySubmissionInput) {
  if (input.consent !== true) {
    throw new AppError(
      'Please agree to share your details with this agency before sending.',
      400
    );
  }

  const adults = normalizeCount(input.adults, 1, AGENCY_ENQUIRY_LIMITS.adults, 'Adults');
  const children = normalizeCount(
    input.children ?? 0,
    0,
    AGENCY_ENQUIRY_LIMITS.children,
    'Children'
  );
  if (adults + children > AGENCY_ENQUIRY_LIMITS.party) {
    throw new AppError(
      `Tell the agency about parties of ${AGENCY_ENQUIRY_LIMITS.party} or fewer.`,
      400
    );
  }

  const phone = normalizePhone(input.phone);
  return {
    contact: {
      name: normalizeName(input.name),
      email: normalizeEmail(input.email),
      ...(phone ? { phone } : {}),
    },
    party: { adults, children },
    dates: normalizeEnquiryDates(input),
    budgetBand: normalizeBudgetBand(input.budgetBand),
    message: normalizeMessage(input.message),
    consentAt: new Date(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Submission                                                                */
/* -------------------------------------------------------------------------- */

export interface EnquiryAcknowledgement {
  id: string;
  status: AgencyEnquiryStatus;
  createdAt: string | null;
}

/**
 * Writes one enquiry for a published agency profile.
 *
 * The traveller is always a signed-in account, so the row is attributed and the
 * thread, every reply and any proposal are reachable from `/enquiries`. Guest
 * links are no longer minted; existing rows keep their token until it expires.
 *
 * The package check is deliberately scoped to the same agency **and** to a
 * published state: an unpublished or foreign package id is a 404, not a silent
 * profile enquiry, so a stale browser tab cannot attach the wrong card.
 */
export async function submitAgencyEnquiry(input: {
  slug: string;
  body: EnquirySubmissionInput;
  userId: string;
}): Promise<EnquiryAcknowledgement> {
  const record = await loadPublicAgencyRecord(input.slug);
  if (!record) {
    throw new AppError('This agency is not accepting enquiries right now.', 404);
  }

  const fields = buildAgencyEnquiryFields(input.body);

  let packageId: Types.ObjectId | null = null;
  if (input.body.packageId !== undefined) {
    const raw = String(input.body.packageId ?? '').trim();
    if (!mongoose.isValidObjectId(raw)) {
      throw new AppError('That trip package is no longer available.', 404);
    }
    const pkg = await AgencyPackage.findOne({
      _id: raw,
      agencyId: record.agency._id,
      state: 'published',
      publishedAt: { $ne: null },
    })
      .select('_id')
      .lean();
    if (!pkg) {
      throw new AppError('That trip package is no longer available.', 404);
    }
    packageId = new Types.ObjectId(String((pkg as any)._id));
  }

  const enquiry = await AgencyEnquiry.create({
    agencyId: record.agency._id,
    packageId,
    userId: new Types.ObjectId(input.userId),
    ...fields,
    source: packageId ? 'package' : 'profile',
    status: 'new',
  });

  emitEnquiryCreated(enquiry);

  return {
    id: String(enquiry._id),
    status: enquiry.status,
    createdAt: iso(enquiry.createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

export function encodeEnquiryCursor(row: any): string {
  return Buffer.from(
    JSON.stringify({
      t: new Date(row.createdAt).toISOString(),
      i: String(row._id),
    })
  ).toString('base64url');
}

export function decodeEnquiryCursor(raw: string): EnquiryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const createdAt = new Date(String(parsed?.t ?? ''));
    const id = String(parsed?.i ?? '');
    if (
      Number.isNaN(createdAt.getTime()) ||
      !mongoose.isValidObjectId(id) ||
      Object.keys(parsed ?? {}).length !== 2
    ) {
      throw new Error('bad cursor');
    }
    return { createdAt, id };
  } catch {
    throw new AppError('That page cursor is not valid.', 400);
  }
}

function clampLimit(value: unknown): number {
  const limit = Math.floor(Number(value) || DEFAULT_LIMIT);
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

async function packageViews(
  agencyId: string,
  rows: any[],
  includeTripId = false
): Promise<Map<string, AgencyEnquiryPackageView>> {
  const ids = [
    ...new Set(
      rows
        .map((row) => row?.packageId)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => String(id))
    ),
  ];
  if (ids.length === 0) return new Map();

  const packages = (await AgencyPackage.find({
    _id: { $in: ids },
    agencyId,
  })
    .select(includeTripId ? 'title tripId' : 'title')
    .lean()) as any[];
  return new Map(
    packages.map((pkg) => {
      const view: AgencyEnquiryPackageView = {
        id: String(pkg._id),
        title: text(pkg.title) || 'Trip package',
      };
      // Provenance is tenant-only. The consumer history and every public
      // projection stay title-only, so a lead never leaks a trip id.
      if (includeTripId) {
        view.tripId = pkg.tripId ? String(pkg.tripId) : null;
      }
      return [String(pkg._id), view];
    })
  );
}

interface EnquiryRelations {
  assignees: Map<string, AgencyEnquiryAssigneeView>;
  clients: Map<string, AgencyEnquiryClientView>;
}

/**
 * Joins the two optional side records an inbox row can reference: the member
 * who claimed it and the directory client it became. Both are scoped to the
 * tenant and only queried when at least one row needs them.
 */
async function loadEnquiryRelations(
  agencyId: string,
  rows: any[]
): Promise<EnquiryRelations> {
  const assigneeIds = [
    ...new Set(
      rows
        .map((row) => row?.assignedTo)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => String(id))
    ),
  ];
  const clientIds = [
    ...new Set(
      rows
        .map((row) => row?.clientId)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => String(id))
    ),
  ];

  const [users, clients] = await Promise.all([
    assigneeIds.length
      ? ((await User.find({ _id: { $in: assigneeIds } })
          .select('name email')
          .lean()) as any[])
      : Promise.resolve([]),
    clientIds.length
      ? ((await AgencyClient.find({ _id: { $in: clientIds }, agencyId })
          .select('name')
          .lean()) as any[])
      : Promise.resolve([]),
  ]);

  return {
    assignees: new Map(
      users.map((user) => [
        String(user._id),
        { id: String(user._id), name: userLabel(user) || 'A team member' },
      ])
    ),
    clients: new Map(
      clients.map((client) => [
        String(client._id),
        { id: String(client._id), name: text(client.name) || 'A client' },
      ])
    ),
  };
}

export function viewAgencyEnquiry(
  row: any,
  packages: Map<string, AgencyEnquiryPackageView> = new Map(),
  agency?: { name: string; slug: string } | null,
  relations?: EnquiryRelations,
  options: {
    consumer?: boolean;
    includeMessages?: boolean;
    proposals?: AgencyEnquiryProposalsView;
  } = {}
): AgencyEnquiryView {
  const consumer = options.consumer === true;
  const packageId = row?.packageId ? String(row.packageId) : '';
  const clientId = row?.clientId ? String(row.clientId) : '';
  const assigneeId = row?.assignedTo ? String(row.assignedTo) : '';
  const meta = conversationMeta(row);
  return {
    id: String(row?._id ?? ''),
    status: (row?.status ?? 'new') as AgencyEnquiryStatus,
    source: row?.source === 'package' ? 'package' : 'profile',
    contact: {
      name: text(row?.contact?.name),
      email: text(row?.contact?.email),
      phone: text(row?.contact?.phone) || null,
    },
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
    message: text(row?.message),
    package: packageId ? packages.get(packageId) ?? { id: packageId, title: 'Trip package' } : null,
    ...(agency !== undefined ? { agency } : {}),
    // The traveller's own history never reveals the agency's internal client
    // link, claim owner or lost reason; those are workspace bookkeeping. A
    // dangling client id (the directory row was deleted) reads as unconverted
    // rather than linking a quote to a missing client.
    client:
      !consumer && clientId ? relations?.clients.get(clientId) ?? null : null,
    // The trip a lead became is agency bookkeeping; a traveller's own history
    // never carries an internal trip id.
    tripId: !consumer && row?.tripId ? String(row.tripId) : null,
    assignedTo: consumer ? null : assigneeId || null,
    assignee:
      !consumer && assigneeId
        ? relations?.assignees.get(assigneeId) ?? { id: assigneeId, name: 'A team member' }
        : null,
    consentAt: iso(row?.consentAt),
    repliedAt: iso(row?.repliedAt),
    convertedAt: iso(row?.convertedAt),
    lostReason: consumer ? null : text(row?.lostReason) || null,
    replyCount: meta.replyCount,
    unread: meta.unread,
    lastMessageAt: meta.lastMessageAt,
    lastMessageBy: meta.lastMessageBy,
    ...(options.includeMessages
      ? { messages: conversationMessages(row) }
      : {}),
    // The guest link belongs to the traveller; the agency only needs to know it
    // exists and when it lapses.
    conversationExpiresAt: consumer
      ? null
      : iso(row?.conversationTokenExpiresAt),
    ...(options.proposals ? { proposals: options.proposals } : {}),
    createdAt: iso(row?.createdAt),
    updatedAt: iso(row?.updatedAt),
  };
}

/** The tenant inbox. Always scoped by `agencyId`; a foreign id is a 404. */
export async function listAgencyEnquiries(input: {
  agencyId: string;
  status?: AgencyEnquiryStatus;
  cursor?: string;
  limit?: number;
}): Promise<AgencyEnquiryPage> {
  const limit = clampLimit(input.limit);

  const clauses: FilterQuery<any>[] = [{ agencyId: input.agencyId }];
  if (input.status) clauses.push({ status: input.status });

  const pageClauses = [...clauses];
  if (input.cursor) {
    const cursor = decodeEnquiryCursor(input.cursor);
    const id = new Types.ObjectId(cursor.id);
    pageClauses.push({
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: id } },
      ],
    });
  }

  const [rows, total] = await Promise.all([
    AgencyEnquiry.find({ $and: pageClauses })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean() as unknown as Promise<any[]>,
    AgencyEnquiry.countDocuments({ $and: clauses }),
  ]);

  const pageRows = rows.slice(0, limit);
  const [packages, relations] = await Promise.all([
    packageViews(input.agencyId, pageRows, true),
    loadEnquiryRelations(input.agencyId, pageRows),
  ]);
  const last = pageRows[pageRows.length - 1];

  return {
    enquiries: pageRows.map((row) =>
      viewAgencyEnquiry(row, packages, undefined, relations)
    ),
    nextCursor: rows.length > limit && last ? encodeEnquiryCursor(last) : null,
    hasMore: rows.length > limit,
    total,
  };
}

/** One enquiry, narrowed to the owning tenant. */
export async function getAgencyEnquiry(
  agencyId: string,
  enquiryId: string
): Promise<AgencyEnquiryView> {
  if (!mongoose.isValidObjectId(enquiryId)) {
    throw new AppError('Enquiry not found.', 404);
  }
  const row = await AgencyEnquiry.findOne({ _id: enquiryId, agencyId }).lean();
  if (!row) {
    throw new AppError('Enquiry not found.', 404);
  }
  // Opening a lead is reading its thread (D8): stamp the receipts before the
  // projection, so the badge and the messages agree. The traveller's channel
  // hears about it only when a receipt actually moved (R1).
  const hadUnread = conversationMeta(row).unread.agency > 0;
  const now = await markAgencyConversationRead(agencyId, String(row._id));
  applyConversationRead(row, 'agency', now);
  if (hadUnread) emitEnquiryRead(row, 'agency');
  const [packages, relations] = await Promise.all([
    packageViews(agencyId, [row], true),
    loadEnquiryRelations(agencyId, [row]),
  ]);
  return viewAgencyEnquiry(row as any, packages, undefined, relations, {
    includeMessages: true,
  });
}

/**
 * Live proposals per enquiry for the traveller's list. A proposal answers an
 * enquiry by its stamped `enquiryId` or, for links minted before that field
 * existed, through the quote's directory client. Only live links count, so the
 * badge agrees with what the conversation will actually show.
 *
 * `unansweredOnly` is what the nav badge wants: an accepted or declined link is
 * still a live proposal in the thread, but it is no longer work waiting for the
 * traveller. The pinned quote decides the rest: an agency-side acceptance never
 * stamps the link, and a cancelled or lapsed quote keeps its share link
 * looking live, so a link only counts when its quote is still `sent`.
 */
async function liveProposalsByEnquiry(
  rows: any[],
  options: { unansweredOnly?: boolean } = {}
): Promise<Map<string, AgencyEnquiryProposalsView>> {
  const counts = new Map<string, AgencyEnquiryProposalsView>();
  if (rows.length === 0) return counts;

  const enquiryIds = rows.map((row) => row._id);
  const clientToEnquiry = new Map(
    rows
      .filter((row) => row?.clientId)
      .map((row) => [String(row.clientId), String(row._id)])
  );
  const quotes = clientToEnquiry.size
    ? ((await AgencyQuote.find({
        clientId: { $in: [...clientToEnquiry.keys()] },
      })
        .select('_id clientId')
        .lean()) as any[])
    : [];
  const quoteToEnquiry = new Map(
    quotes.map((quote) => [
      String(quote._id),
      clientToEnquiry.get(String(quote.clientId)) ?? null,
    ])
  );

  const links = (await AgencyProposalLink.find({
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    ...(options.unansweredOnly ? { acceptedAt: null, declinedAt: null } : {}),
    $or: [
      { enquiryId: { $in: enquiryIds } },
      ...(quotes.length ? [{ quoteId: { $in: quotes.map((quote) => quote._id) } }] : []),
    ],
  })
    .select('enquiryId quoteId createdAt')
    .lean()) as any[];

  let answerable: Set<string> | null = null;
  if (options.unansweredOnly) {
    const pinnedIds = [
      ...new Set(links.map((link) => String(link.quoteId ?? '')).filter(Boolean)),
    ];
    const pinned = pinnedIds.length
      ? ((await AgencyQuote.find({ _id: { $in: pinnedIds } })
          .select('_id tripId status validUntil')
          .lean()) as any[])
      : [];
    // Accepting one version settles the trip: its other open versions are no
    // longer work waiting for the traveller, even though their quotes are still
    // `sent` (a second acceptance is refused).
    const tripIds = [...new Set(pinned.map((quote) => String(quote.tripId ?? '')).filter(Boolean))];
    const acceptedTrips = new Set(
      (
        (tripIds.length
          ? await AgencyQuote.find({ tripId: { $in: tripIds }, status: 'accepted' })
              .select('tripId')
              .lean()
          : []) as any[]
      ).map((quote) => String(quote.tripId))
    );
    answerable = new Set(
      pinned
        .filter(
          (quote) =>
            effectiveQuoteStatus(quote) === 'sent' &&
            !acceptedTrips.has(String(quote.tripId))
        )
        .map((quote) => String(quote._id))
    );
  }

  const known = new Set(enquiryIds.map(String));
  for (const link of links) {
    if (answerable && !answerable.has(String(link.quoteId))) continue;
    const enquiryId =
      link.enquiryId && known.has(String(link.enquiryId))
        ? String(link.enquiryId)
        : quoteToEnquiry.get(String(link.quoteId));
    if (!enquiryId) continue;

    const entry = counts.get(enquiryId) ?? { count: 0, lastAt: null };
    entry.count += 1;
    const at = iso(link.createdAt);
    if (at && (!entry.lastAt || at > entry.lastAt)) entry.lastAt = at;
    counts.set(enquiryId, entry);
  }
  return counts;
}

/** A consumer's own history: only rows attributed to their verified session. */
export async function listOwnEnquiries(input: {
  userId: string;
  cursor?: string;
  limit?: number;
}): Promise<AgencyEnquiryPage> {
  const limit = clampLimit(input.limit);

  const base: FilterQuery<any> = { userId: input.userId };
  const pageClauses: FilterQuery<any>[] = [{ ...base }];
  if (input.cursor) {
    const cursor = decodeEnquiryCursor(input.cursor);
    const id = new Types.ObjectId(cursor.id);
    pageClauses.push({
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: id } },
      ],
    });
  }

  const [rows, total] = await Promise.all([
    AgencyEnquiry.find({ $and: pageClauses })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean() as unknown as Promise<any[]>,
    AgencyEnquiry.countDocuments(base),
  ]);

  const pageRows = rows.slice(0, limit);
  const agencyIds = [
    ...new Set(pageRows.map((row) => String(row.agencyId)).filter(Boolean)),
  ];
  const agencies = agencyIds.length
    ? ((await Agency.find({ _id: { $in: agencyIds } })
        .select('name slug')
        .lean()) as any[])
    : [];
  const agencyMap = new Map(
    agencies.map((agency) => [
      String(agency._id),
      { name: text(agency.name), slug: text(agency.slug) },
    ])
  );

  // A consumer's history can span agencies, so package titles are joined in one
  // query and scoped to the agencies actually present on this page.
  const packageIds = [
    ...new Set(
      pageRows
        .map((row) => row?.packageId)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => String(id))
    ),
  ];
  const packages = packageIds.length
    ? ((await AgencyPackage.find({
        _id: { $in: packageIds },
        agencyId: { $in: agencyIds },
      })
        .select('title')
        .lean()) as any[])
    : [];
  const packageTitles = new Map<string, AgencyEnquiryPackageView>(
    packages.map((pkg) => [
      String(pkg._id),
      { id: String(pkg._id), title: text(pkg.title) || 'Trip package' },
    ])
  );

  const proposals = await liveProposalsByEnquiry(pageRows);
  const last = pageRows[pageRows.length - 1];
  return {
    enquiries: pageRows.map((row) =>
      viewAgencyEnquiry(
        row,
        packageTitles,
        agencyMap.get(String(row.agencyId)) ?? null,
        undefined,
        {
          consumer: true,
          proposals: proposals.get(String(row._id)) ?? { count: 0, lastAt: null },
        }
      )
    ),
    nextCursor: rows.length > limit && last ? encodeEnquiryCursor(last) : null,
    hasMore: rows.length > limit,
    total,
  };
}

export interface OwnEnquirySummaryView {
  /** Agency messages this account has not opened, across every enquiry. */
  unread: number;
  /** Live proposals this account can still answer (accept or decline). */
  liveProposals: number;
  lastMessageAt: string | null;
}

/**
 * Badge counters for the traveller's nav and `/enquiries` (R1).
 *
 * Deliberately one read over the account's own rows: a traveller has few
 * enquiries, the thread array is capped, and computing both counters from the
 * same rows keeps them consistent with the list the page renders. No thread
 * content leaves this function — just numbers and one timestamp.
 */
export async function getOwnEnquirySummary(
  userId: string
): Promise<OwnEnquirySummaryView> {
  const rows = (await AgencyEnquiry.find({ userId })
    .select('_id clientId messages lastMessageAt')
    .lean()) as any[];

  let unread = 0;
  let lastMessageAt: string | null = null;
  for (const row of rows) {
    const meta = conversationMeta(row);
    unread += meta.unread.traveller;
    if (meta.lastMessageAt && (!lastMessageAt || meta.lastMessageAt > lastMessageAt)) {
      lastMessageAt = meta.lastMessageAt;
    }
  }

  const proposals = await liveProposalsByEnquiry(rows, { unansweredOnly: true });
  let liveProposals = 0;
  for (const entry of proposals.values()) liveProposals += entry.count;

  return { unread, liveProposals, lastMessageAt };
}

/* -------------------------------------------------------------------------- */
/*  Agency actions (D6)                                                       */
/* -------------------------------------------------------------------------- */

async function loadScopedEnquiryRow(agencyId: string, enquiryId: string): Promise<any> {
  if (!mongoose.isValidObjectId(enquiryId)) {
    throw new AppError('Enquiry not found.', 404);
  }
  const row = await AgencyEnquiry.findOne({ _id: enquiryId, agencyId }).lean();
  if (!row) {
    throw new AppError('Enquiry not found.', 404);
  }
  return row;
}

function normalizeLostReason(value: unknown): string {
  const reason = text(value);
  if (!reason) {
    throw new AppError(
      'Add a short reason for marking this enquiry lost.',
      400
    );
  }
  if (reason.length > AGENCY_ENQUIRY_LIMITS.lostReason) {
    throw new AppError(
      `Keep the lost reason under ${AGENCY_ENQUIRY_LIMITS.lostReason} characters.`,
      400
    );
  }
  return reason;
}

export interface UpdateAgencyEnquiryInput {
  agencyId: string;
  enquiryId: string;
  actorId: string;
  actorRole: AgencyRole;
  status?: AgencyEnquiryStatus;
  /** Required when moving to `lost`; ignored (and rejected) otherwise. */
  lostReason?: unknown;
  /** `null` releases the lead; an id assigns it. Omit to leave it unchanged. */
  assigneeId?: unknown;
}

export interface UpdateAgencyEnquiryResult {
  enquiry: AgencyEnquiryView;
  /** True when this call won an atomic claim on an unassigned lead. */
  claimed: boolean;
}

/**
 * Which status moves a member may make by hand (M9 R5).
 *
 * The funnel has to mean what the counters say, so a lead cannot jump from
 * "new" straight to "quoted", or reopen a won lead as untouched. Automation —
 * a shared or accepted proposal — writes its own transitions and is not
 * limited by this map.
 */
const MANUAL_STATUS_TRANSITIONS: Record<
  AgencyEnquiryStatus,
  AgencyEnquiryStatus[]
> = {
  new: ['replied', 'quoted', 'won', 'lost'],
  replied: ['quoted', 'won', 'lost'],
  quoted: ['replied', 'won', 'lost'],
  won: ['quoted', 'replied', 'lost'],
  lost: ['new', 'replied', 'quoted'],
};

/**
 * "Won" means a person booked; it needs a directory client to belong to. The
 * accepted-proposal path is the exception and writes its own row.
 */
function assertManualStatusChange(
  current: AgencyEnquiryStatus,
  next: AgencyEnquiryStatus,
  hasClient: boolean
): void {
  if (current === next) return;
  if (!MANUAL_STATUS_TRANSITIONS[current].includes(next)) {
    throw new AppError(
      current === 'lost'
        ? 'Reopen this lead before marking it won or quoted.'
        : `A ${current} lead cannot move straight to ${next}.`,
      409
    );
  }
  if (next === 'won' && !hasClient) {
    throw new AppError(
      'Convert this lead to a client before marking it won.',
      409
    );
  }
}

/**
 * Status transitions, claiming and assignment for one lead.
 *
 * The claim is a compare-and-set on `assignedTo: null`, so two members clicking
 * at the same time cannot both believe they own it: exactly one `findOneAndUpdate`
 * matches, and the loser gets a 409. Assigning a colleague is admin-only; a
 * planner can only claim or release their own lead.
 */
export async function updateAgencyEnquiry(
  input: UpdateAgencyEnquiryInput
): Promise<UpdateAgencyEnquiryResult> {
  const row = await loadScopedEnquiryRow(input.agencyId, input.enquiryId);
  const now = new Date();
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (input.status !== undefined) {
    const status = input.status;
    assertManualStatusChange(
      (row.status ?? 'new') as AgencyEnquiryStatus,
      status,
      Boolean(row.clientId)
    );
    $set.status = status;

    if (status === 'lost') {
      $set.lostReason = normalizeLostReason(input.lostReason ?? row.lostReason);
      // A lost lead is not a conversion, even if it was won and reopened.
      $unset.convertedAt = 1;
    } else {
      // Leaving `lost` must not keep an internal reason the agency wrote for
      // the traveller's enquiry.
      $unset.lostReason = 1;
      if (status !== 'won') $unset.convertedAt = 1;
    }

    if (status === 'won') {
      if (!row.convertedAt) $set.convertedAt = now;
      if (!row.repliedAt) $set.repliedAt = now;
    } else if ((status === 'replied' || status === 'quoted') && !row.repliedAt) {
      $set.repliedAt = now;
    }
  } else if (input.lostReason !== undefined) {
    throw new AppError('Choose a status before adding a lost reason.', 400);
  }

  let targetAssignee: string | null | undefined;
  if (input.assigneeId !== undefined) {
    targetAssignee =
      input.assigneeId === null || input.assigneeId === ''
        ? null
        : text(input.assigneeId);

    if (targetAssignee && !mongoose.isValidObjectId(targetAssignee)) {
      throw new AppError('Choose a team member from this agency.', 400);
    }

    const current = row.assignedTo ? String(row.assignedTo) : null;
    if (targetAssignee && targetAssignee !== String(input.actorId)) {
      if (!agencyCan(input.actorRole, 'admin')) {
        throw new AppError(
          'Only an owner or admin can assign an enquiry to someone else.',
          403
        );
      }
      const member = await AgencyMember.exists({
        agencyId: input.agencyId,
        userId: targetAssignee,
      });
      if (!member) {
        throw new AppError('Choose a team member from this agency.', 400);
      }
    }
    if (targetAssignee === null && current && current !== String(input.actorId)) {
      if (!agencyCan(input.actorRole, 'admin')) {
        throw new AppError(
          'Only the member who claimed this enquiry, or an admin, can release it.',
          403
        );
      }
    }
    // A planner claiming a lead that is already someone else's loses the race
    // exactly like the atomic compare-and-set below would: 409, not a silent
    // reassignment. An admin may deliberately reassign instead.
    if (
      targetAssignee === String(input.actorId) &&
      current &&
      current !== String(input.actorId) &&
      !agencyCan(input.actorRole, 'admin')
    ) {
      throw new AppError(
        'Another team member has already claimed this enquiry.',
        409
      );
    }

    if (targetAssignee) $set.assignedTo = targetAssignee;
    else $unset.assignedTo = 1;
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    throw new AppError('Provide an enquiry change.', 400);
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const claimingSelf =
    targetAssignee !== undefined &&
    targetAssignee !== null &&
    targetAssignee === String(input.actorId) &&
    !row.assignedTo;

  let claimed = false;
  let updated: any = null;

  if (claimingSelf) {
    updated = await AgencyEnquiry.findOneAndUpdate(
      {
        _id: input.enquiryId,
        agencyId: input.agencyId,
        $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
      },
      update,
      { new: true }
    ).lean();

    if (updated) {
      claimed = true;
    } else {
      const current = await loadScopedEnquiryRow(input.agencyId, input.enquiryId);
      if (String(current.assignedTo) !== String(input.actorId)) {
        throw new AppError(
          'Another team member has already claimed this enquiry.',
          409
        );
      }
      // A double click from the owner of the claim: apply the status part.
      updated = await AgencyEnquiry.findOneAndUpdate(
        { _id: input.enquiryId, agencyId: input.agencyId },
        update,
        { new: true }
      ).lean();
    }
  } else {
    updated = await AgencyEnquiry.findOneAndUpdate(
      { _id: input.enquiryId, agencyId: input.agencyId },
      update,
      { new: true }
    ).lean();
  }

  if (!updated) {
    throw new AppError('Enquiry not found.', 404);
  }

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'enquiry.updated',
    targetType: 'enquiry',
    targetId: String(updated._id),
    metadata: {
      status: updated.status,
      assignedTo: updated.assignedTo ? String(updated.assignedTo) : null,
      claimed,
    },
  });

  emitEnquiryUpdated(updated);

  const [packages, relations] = await Promise.all([
    packageViews(input.agencyId, [updated], true),
    loadEnquiryRelations(input.agencyId, [updated]),
  ]);

  return {
    enquiry: viewAgencyEnquiry(updated, packages, undefined, relations),
    claimed,
  };
}

export interface ConvertAgencyEnquiryResult {
  enquiry: AgencyEnquiryView;
  client: AgencyClientSummary;
  /** True when an existing directory record was reused instead of created. */
  reused: boolean;
  /** True when this call created the client record. */
  created: boolean;
}

async function markEnquiryConverted(
  row: any,
  clientId: Types.ObjectId | string,
  now: Date
): Promise<any> {
  // Conversion is CRM bookkeeping, not a win: the client row is what the quote
  // needs. The lead keeps its status until a proposal goes out ("quoted") or
  // the traveller accepts ("won").
  const updated = await AgencyEnquiry.findOneAndUpdate(
    { _id: row._id, agencyId: row.agencyId },
    {
      $set: {
        clientId,
        convertedAt: row.convertedAt ?? now,
      },
      $unset: { lostReason: 1 },
    },
    { new: true }
  ).lean();
  if (!updated) {
    throw new AppError('Enquiry not found.', 404);
  }
  emitEnquiryUpdated(updated);
  return updated;
}

async function finishConversion(
  agencyId: string,
  row: any,
  client: any,
  reused: boolean,
  created: boolean
): Promise<ConvertAgencyEnquiryResult> {
  const [packages, relations] = await Promise.all([
    packageViews(agencyId, [row], true),
    loadEnquiryRelations(agencyId, [row]),
  ]);
  return {
    enquiry: viewAgencyEnquiry(row, packages, undefined, relations),
    client: projectAgencyClient(client),
    reused,
    created,
  };
}

/**
 * Turns a lead into a directory client. The status stays where it is: a client
 * row is CRM bookkeeping, and the lead is only won when a proposal is accepted.
 *
 * **Idempotent by construction.** The enquiry's `clientId` is the first check,
 * and a unique partial index on `AgencyClient.sourceEnquiryId` catches the race
 * where two clicks both reach the create. An existing client with the same
 * email is reused rather than duplicated, and only the enquiry that introduced
 * that person keeps the provenance tag.
 */
export async function convertAgencyEnquiry(input: {
  agencyId: string;
  enquiryId: string;
  actorId: string;
}): Promise<ConvertAgencyEnquiryResult> {
  const row = await loadScopedEnquiryRow(input.agencyId, input.enquiryId);
  const now = new Date();

  // Already converted (or a second click): return the same client, no new row.
  if (row.clientId) {
    const linked = await AgencyClient.findOne({
      _id: String(row.clientId),
      agencyId: input.agencyId,
    });
    if (linked) {
      const updated = await markEnquiryConverted(row, String(linked._id), now);
      return finishConversion(input.agencyId, updated, linked, true, false);
    }
    // A dangling link (client deleted by hand) falls through and re-resolves.
  }

  const email = text(row.contact?.email).toLowerCase();
  let client: any = email
    ? await AgencyClient.findOne({ agencyId: input.agencyId, email })
    : null;
  let created = false;

  if (client) {
    // Tag the source only when this person has no provenance yet; an earlier
    // enquiry that introduced them stays the credited lead.
    if (!client.sourceEnquiryId) {
      await AgencyClient.updateOne(
        {
          _id: client._id,
          agencyId: input.agencyId,
          $or: [
            { sourceEnquiryId: { $exists: false } },
            { sourceEnquiryId: null },
          ],
        },
        { $set: { sourceEnquiryId: row._id } }
      ).catch(() => {
        /* provenance is best-effort; the conversion itself must not fail */
      });
    }
  } else {
    const phone = text(row.contact?.phone);
    try {
      client = await AgencyClient.create({
        agencyId: input.agencyId,
        createdBy: input.actorId,
        name: text(row.contact?.name) || 'A travel enquiry',
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        sourceEnquiryId: row._id,
      });
      created = true;
    } catch (error: any) {
      // Two simultaneous conversions: the unique index picks one winner and the
      // loser adopts the row the winner just wrote.
      if (error?.code !== 11000) throw error;
      client = await AgencyClient.findOne({
        agencyId: input.agencyId,
        sourceEnquiryId: row._id,
      });
      if (!client) throw error;
    }
  }

  const updated = await markEnquiryConverted(row, client._id, now);

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'enquiry.converted',
    targetType: 'enquiry',
    targetId: String(row._id),
    metadata: {
      clientId: String(client._id),
      created,
    },
  });

  return finishConversion(input.agencyId, updated, client, !created, created);
}

/**
 * A live proposal just answered this lead, so the funnel moves to "quoted"
 * (M9 R5). Only a fresh lead moves automatically: a won or lost row keeps the
 * status its agency chose.
 */
export async function markEnquiryQuotedByProposal(
  enquiryId: string
): Promise<void> {
  if (!mongoose.isValidObjectId(enquiryId)) return;
  const row = (await AgencyEnquiry.findOne({ _id: enquiryId })
    .select('status repliedAt')
    .lean()) as any;
  if (!row) return;
  if (row.status !== 'new' && row.status !== 'replied') return;

  const updated = (await AgencyEnquiry.findOneAndUpdate(
    { _id: enquiryId, status: row.status },
    {
      $set: {
        status: 'quoted',
        ...(row.repliedAt ? {} : { repliedAt: new Date() }),
      },
    },
    { new: true }
  ).lean()) as any;
  if (updated) emitEnquiryUpdated(updated);
}

/**
 * The traveller accepted a proposal. That is the moment a lead is won, whether
 * the acceptance came through the private link or an agency member marked the
 * quote accepted on their behalf, so the enquiry closes either way.
 */
export async function markEnquiryWonByAcceptance(
  agencyId: string,
  enquiryId: string
): Promise<void> {
  if (!mongoose.isValidObjectId(agencyId) || !mongoose.isValidObjectId(enquiryId)) {
    return;
  }
  const row = (await AgencyEnquiry.findOne({ _id: enquiryId, agencyId }).lean()) as any;
  if (!row || row.status === 'won') return;

  const now = new Date();
  const updated = (await AgencyEnquiry.findOneAndUpdate(
    { _id: enquiryId, agencyId, status: row.status },
    {
      $set: {
        status: 'won',
        repliedAt: row.repliedAt ?? now,
        convertedAt: row.convertedAt ?? now,
      },
      // A booking supersedes whatever reason the lead was parked under.
      $unset: { lostReason: 1 },
    },
    { new: true }
  ).lean()) as any;
  if (updated) emitEnquiryUpdated(updated);
}

export interface StartTripFromEnquiryResult {
  tripId: string;
  clientId: string | null;
  enquiry: AgencyEnquiryView;
}

/**
 * Starts a trip from a lead and links it back (M9 R5).
 *
 * A package enquiry already has a trip behind its package; a profile enquiry
 * has nothing to quote. This turns the lead into a client, opens a blank trip
 * carrying the dates the traveller asked for, and stamps the trip on the lead
 * so the inbox can hand it straight to the quote tab.
 *
 * The trip id is generated first and claimed on the enquiry with a
 * compare-and-set, so a double click cannot leave two blank trips behind; the
 * loser of the race reads the winner's link.
 */
export async function startTripFromEnquiry(input: {
  agencyId: string;
  enquiryId: string;
  actorId: string;
  role: AgencyRole;
}): Promise<StartTripFromEnquiryResult> {
  const row: any = await loadScopedEnquiryRow(input.agencyId, input.enquiryId);

  if (row.tripId) {
    const existing = await Trip.exists({
      _id: String(row.tripId),
      agencyId: input.agencyId,
      workspace: 'agency',
      isDeleted: false,
    });
    if (existing) {
      return {
        tripId: String(row.tripId),
        clientId: row.clientId ? String(row.clientId) : null,
        enquiry: await getAgencyEnquiry(input.agencyId, input.enquiryId),
      };
    }
  }

  // A dangling link (the client was deleted by hand) re-resolves through the
  // same create-or-reuse rules as a fresh conversion.
  const linkedClient = row.clientId
    ? await AgencyClient.exists({
        _id: String(row.clientId),
        agencyId: input.agencyId,
      })
    : null;
  const clientId = linkedClient
    ? String(row.clientId)
    : (
        await convertAgencyEnquiry({
          agencyId: input.agencyId,
          enquiryId: input.enquiryId,
          actorId: input.actorId,
        })
      ).client._id;

  const tripId = new Types.ObjectId();
  const claimed = (await AgencyEnquiry.findOneAndUpdate(
    {
      _id: row._id,
      agencyId: input.agencyId,
      // An unset link, or the stale link to a trip that no longer exists, may be
      // replaced; two clicks still have exactly one winner.
      $or: [
        { tripId: null },
        { tripId: { $exists: false } },
        ...(row.tripId ? [{ tripId: row.tripId }] : []),
      ],
    },
    { $set: { tripId } },
    { new: true }
  ).lean()) as any;

  if (!claimed) {
    const current = (await AgencyEnquiry.findOne({ _id: row._id }).lean()) as any;
    if (current?.tripId) {
      return {
        tripId: String(current.tripId),
        clientId,
        enquiry: await getAgencyEnquiry(input.agencyId, input.enquiryId),
      };
    }
    throw new AppError(
      'This enquiry changed before the trip could start. Reload it.',
      409
    );
  }

  const start = row.dates?.start ? new Date(row.dates.start) : undefined;
  const end = row.dates?.end ? new Date(row.dates.end) : undefined;
  try {
    await createAgencyTrip({
      agencyId: input.agencyId,
      userId: input.actorId,
      role: input.role,
      title: `Trip for ${text(row.contact?.name) || 'a travel enquiry'}`,
      startDate: start?.toISOString(),
      endDate: end?.toISOString(),
      clientId,
      tripId,
    });
  } catch (error) {
    // The lead must not point at a trip that was never created.
    await AgencyEnquiry.updateOne(
      { _id: row._id, agencyId: input.agencyId },
      { $unset: { tripId: 1 } }
    ).catch(() => {});
    throw error;
  }

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'enquiry.trip_started',
    targetType: 'enquiry',
    targetId: String(row._id),
    metadata: { tripId: String(tripId), clientId },
  });

  return {
    tripId: String(tripId),
    clientId,
    enquiry: await getAgencyEnquiry(input.agencyId, input.enquiryId),
  };
}

const SUMMARY_STATUSES: AgencyEnquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
];

export interface AgencyEnquirySummaryView {
  total: number;
  byStatus: Record<AgencyEnquiryStatus, number>;
  /** Leads still needing work: new + replied + quoted. */
  open: number;
  receivedThisWeek: number;
  repliedThisWeek: number;
  convertedThisWeek: number;
  /** Won ÷ total, rounded to three decimals; 0 when there are no leads. */
  conversionRate: number;
  weekStart: string;
}

/**
 * Dashboard counters for the inbox (D6). "This week" is a rolling seven-day
 * window so the number is meaningful on the first day after a quiet stretch,
 * rather than resetting every Monday morning.
 */
export async function getAgencyEnquirySummary(
  agencyId: string,
  now: Date = new Date()
): Promise<AgencyEnquirySummaryView> {
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);

  const [counts, receivedThisWeek, repliedThisWeek, convertedThisWeek] =
    await Promise.all([
      Promise.all(
        SUMMARY_STATUSES.map((status) =>
          AgencyEnquiry.countDocuments({ agencyId, status })
        )
      ),
      AgencyEnquiry.countDocuments({ agencyId, createdAt: { $gte: weekStart } }),
      AgencyEnquiry.countDocuments({ agencyId, repliedAt: { $gte: weekStart } }),
      AgencyEnquiry.countDocuments({ agencyId, convertedAt: { $gte: weekStart } }),
    ]);

  const byStatus = {
    new: 0,
    replied: 0,
    quoted: 0,
    won: 0,
    lost: 0,
  } as Record<AgencyEnquiryStatus, number>;
  SUMMARY_STATUSES.forEach((status, index) => {
    byStatus[status] = counts[index] ?? 0;
  });

  const total = SUMMARY_STATUSES.reduce((sum, status) => sum + byStatus[status], 0);

  return {
    total,
    byStatus,
    open: byStatus.new + byStatus.replied + byStatus.quoted,
    receivedThisWeek,
    repliedThisWeek,
    convertedThisWeek,
    conversionRate: total
      ? Math.round((byStatus.won / total) * 1000) / 1000
      : 0,
    weekStart: weekStart.toISOString(),
  };
}
