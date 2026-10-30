import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyProposalLink, {
  IAgencyProposalLink,
} from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import AgencyTemplate from '../../models/AgencyTemplate.js';
import Trip from '../../models/Trip.js';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import {
  hashToken,
  linkOriginHints,
  mintInviteToken,
  pickLinkOrigin,
  tokenHint,
  type LinkOriginHints,
} from '../collab/invites.js';
import { agencyCan, type AgencyRole } from './access.js';
import { recordAgencyAudit } from './audit.js';
import { emitProposalCreated, emitProposalDeclined } from '../realtime/enquiryEvents.js';
import {
  markEnquiryQuotedByProposal,
  markEnquiryWonByAcceptance,
} from '../directory/enquiries.js';
import { renderPinnedAgencyExport } from './exports/exports.js';
import type { ExportDocument } from './exports/document.js';
import { readAgencyExportFile } from './exports/storage.js';
import { resolveEnquiryForTrip } from './liveProposal.js';
import {
  effectiveQuoteStatus,
  projectQuoteForClient,
  reconcileQuoteExpiry,
  type QuoteProjection,
} from './quotes.js';

/**
 * Public proposal shares (Agency Workspace A7).
 *
 * A share link is minted from a ready client export and pins the export's
 * quote, template and version. The public page re-renders that exact document
 * server-side (no browser job) and streams the stored PDF; accepting the
 * proposal marks the pinned quote accepted, idempotently.
 *
 * No public route ever resolves a live template, the latest quote or an
 * internal audience: the link is the only capability, and everything it can
 * reach was already approved by staff when the export was generated.
 */

export const AGENCY_PROPOSAL_TTL_MAX_DAYS = 90;

export function resolveProposalTtlDays(requested?: unknown): number {
  const value = Number(requested);
  if (Number.isFinite(value) && value >= 1) {
    return Math.min(Math.floor(value), AGENCY_PROPOSAL_TTL_MAX_DAYS);
  }
  return env.AGENCY_PROPOSAL_TTL_DAYS;
}

export function proposalLinkIsViewable(
  link:
    | Pick<IAgencyProposalLink, 'expiresAt' | 'revokedAt'>
    | null
    | undefined,
  now: Date = new Date()
): boolean {
  if (!link || link.revokedAt) return false;
  const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : NaN;
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function proposalLinkKind(
  link: Pick<IAgencyProposalLink, 'kind'> | any
): 'pdf' | 'live' {
  return link?.kind === 'live' ? 'live' : 'pdf';
}

export function projectAgencyProposalLink(link: IAgencyProposalLink | any) {
  return {
    _id: String(link._id),
    kind: proposalLinkKind(link),
    quoteId: link.quoteId ? String(link.quoteId) : null,
    tokenHint: String(link.tokenHint ?? ''),
    quoteNumber: link.quoteNumber ?? null,
    quoteVersion: Number(link.quoteVersion ?? 1),
    templateName: link.templateName ?? null,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt ?? null,
    lastViewedAt: link.lastViewedAt ?? null,
    viewCount: Number(link.viewCount ?? 0),
    acceptedAt: link.acceptedAt ?? null,
    declinedAt: link.declinedAt ?? null,
  };
}

export interface ProposalActionState {
  accepted: boolean;
  declined: boolean;
  canAccept: boolean;
  canDecline: boolean;
}

/**
 * What a viewer may still do with one share (M9 R6).
 *
 * A decline is final for that version: accepting afterwards would contradict
 * the answer the agency already received, so it has to send a new proposal.
 * Both actions need the quote to still be `sent`; an accepted, expired or
 * cancelled quote offers neither.
 */
export function proposalActionState(
  link: Pick<IAgencyProposalLink, 'acceptedAt' | 'declinedAt'>,
  status: string | null
): ProposalActionState {
  const accepted = Boolean(link.acceptedAt) || status === 'accepted';
  const declined = Boolean(link.declinedAt);
  const open = status === 'sent' && !accepted && !declined;
  return { accepted, declined, canAccept: open, canDecline: open };
}

export function agencyProposalLinkFor(
  rawToken: string,
  hints: LinkOriginHints = {}
): string {
  return `${pickLinkOrigin(hints)}/proposal/${rawToken}`;
}

async function loadLink(rawToken: unknown): Promise<IAgencyProposalLink> {
  const hash = hashToken(String(rawToken ?? ''));
  // Live shares have no public page: their token is never exposed, and even a
  // leaked one must answer the same 404 as an unknown token.
  const link = await AgencyProposalLink.findOne({
    tokenHash: hash,
    kind: { $ne: 'live' },
  });
  if (!link || !proposalLinkIsViewable(link)) {
    throw new AppError('Proposal not found', 404);
  }
  return link;
}

/* -------------------------------------------------------------------------- */
/*  Consumer comparison (M9 D8)                                               */
/* -------------------------------------------------------------------------- */

/**
 * The enquiries a personal account owns, plus the directory clients those
 * enquiries became. A proposal link may have been minted before the enquiry id
 * was stamped, so both paths are used to prove ownership.
 */
async function consumerAccess(
  userId: string
): Promise<{ enquiryIds: string[]; clientIds: string[] }> {
  const rows = (await AgencyEnquiry.find({ userId })
    .select('_id clientId')
    .lean()) as any[];
  const enquiryIds = rows.map((row) => String(row._id));
  const direct = rows
    .map((row) => row.clientId)
    .filter(Boolean)
    .map((id) => String(id));
  const linked = enquiryIds.length
    ? ((await AgencyClient.find({ sourceEnquiryId: { $in: enquiryIds } })
        .select('_id')
        .lean()) as any[])
    : [];
  return {
    enquiryIds,
    clientIds: [
      ...new Set([...direct, ...linked.map((client) => String(client._id))]),
    ],
  };
}

async function loadOwnedLink(
  linkId: string,
  userId: string
): Promise<IAgencyProposalLink> {
  if (!mongoose.isValidObjectId(linkId)) {
    throw new AppError('Proposal not found', 404);
  }
  // Live links carry their itinerary snapshot; select it back explicitly.
  const link = await AgencyProposalLink.findById(linkId).select(
    '+itinerarySnapshot'
  );
  if (!link || !proposalLinkIsViewable(link)) {
    throw new AppError('Proposal not found', 404);
  }
  const { enquiryIds, clientIds } = await consumerAccess(userId);
  if (link.enquiryId && enquiryIds.includes(String(link.enquiryId))) {
    return link;
  }
  const quote = (await AgencyQuote.findOne({
    _id: link.quoteId,
    agencyId: link.agencyId,
  })
    .select('clientId')
    .lean()) as any;
  if (quote?.clientId && clientIds.includes(String(quote.clientId))) {
    return link;
  }
  // A foreign link answers the same 404 as an unknown one.
  throw new AppError('Proposal not found', 404);
}

export interface AgencyProposalSummary {
  id: string;
  /**
   * `live` is the in-app share minted by a send; `pdf` is a public link to a
   * generated document. The card labels its preview button from this.
   */
  kind: 'pdf' | 'live';
  /** The conversation this proposal answers, when it can be resolved. */
  enquiryId: string | null;
  agency: { name: string; slug: string };
  trip: { id: string; title: string };
  quote: {
    number: string;
    version: number;
    status: string;
    currency: string;
    total: number;
    perPerson: number;
    validUntil: string | null;
    inclusions: string[];
    exclusions: string[];
    createdAt: string | null;
  } | null;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  /**
   * True when another version of this trip is already accepted. The card stays
   * readable, but it is neither answerable nor acceptable: the acceptance guard
   * refuses a second quote for the same trip.
   */
  settledByAcceptedTrip: boolean;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function summarizeLinks(links: any[]): Promise<AgencyProposalSummary[]> {
  if (links.length === 0) return [];
  const agencyIds = [...new Set(links.map((link) => String(link.agencyId)))];
  const tripIds = [...new Set(links.map((link) => String(link.tripId)))];
  const quoteIds = [...new Set(links.map((link) => String(link.quoteId)))];

  const [agencies, trips, quotes] = (await Promise.all([
    Agency.find({ _id: { $in: agencyIds } })
      .select('name slug')
      .lean(),
    Trip.find({ _id: { $in: tripIds } })
      .select('title tripDetails.trip_title')
      .lean(),
    AgencyQuote.find({ _id: { $in: quoteIds } })
      .select(
        'number version status clientId tripId currency total perPerson validUntil inclusions exclusions createdAt lineItems subtotal markupPct markupAmount taxPct taxAmount discount terms sentAt acceptedAt cancelledAt updatedAt'
      )
      .lean(),
  ])) as [any[], any[], any[]];

  const quoteClientIds = quotes
    .map((quote) => quote.clientId)
    .filter(Boolean)
    .map((id) => String(id));
  const clients = quoteClientIds.length
    ? ((await AgencyClient.find({ _id: { $in: quoteClientIds } })
        .select('sourceEnquiryId')
        .lean()) as any[])
    : [];
  const enquiryByClient = new Map(
    clients.map((client) => [
      String(client._id),
      client.sourceEnquiryId ? String(client.sourceEnquiryId) : null,
    ])
  );

  // The comparison and the badge share one rule: a trip settles on its first
  // acceptance, so its other versions are shown for reference but not offered.
  const quoteTripIds = [
    ...new Set(quotes.map((quote) => String(quote.tripId ?? '')).filter(Boolean)),
  ];
  const acceptedByTrip = new Map<string, Set<string>>();
  if (quoteTripIds.length) {
    const accepted = (await AgencyQuote.find({
      agencyId: { $in: agencyIds },
      tripId: { $in: quoteTripIds },
      status: 'accepted',
    })
      .select('_id tripId')
      .lean()) as any[];
    for (const quote of accepted) {
      const key = String(quote.tripId);
      const ids = acceptedByTrip.get(key) ?? new Set<string>();
      ids.add(String(quote._id));
      acceptedByTrip.set(key, ids);
    }
  }

  const agencyMap = new Map(
    agencies.map((agency) => [String(agency._id), agency])
  );
  const tripMap = new Map(trips.map((trip) => [String(trip._id), trip]));
  const quoteMap = new Map(quotes.map((quote) => [String(quote._id), quote]));

  return links.map((link) => {
    const agency = agencyMap.get(String(link.agencyId));
    const trip = tripMap.get(String(link.tripId));
    const quote = quoteMap.get(String(link.quoteId));
    const projected = quote ? projectQuoteForClient(quote) : null;
    const acceptedSiblings = quote?.tripId
      ? acceptedByTrip.get(String(quote.tripId))
      : undefined;
    const settledByAcceptedTrip = Boolean(
      acceptedSiblings &&
        [...acceptedSiblings].some((id) => id !== String(quote._id))
    );
    const enquiryId = link.enquiryId
      ? String(link.enquiryId)
      : quote?.clientId
        ? enquiryByClient.get(String(quote.clientId)) ?? null
        : null;

    return {
      id: String(link._id),
      kind: proposalLinkKind(link),
      enquiryId,
      agency: {
        name: String(agency?.name ?? 'The agency'),
        slug: String(agency?.slug ?? ''),
      },
      trip: {
        id: String(link.tripId),
        title: String(
          trip?.tripDetails?.trip_title || trip?.title || 'Trip proposal'
        ),
      },
      quote: projected
        ? {
            number: projected.number,
            version: projected.version,
            status: effectiveQuoteStatus(quote),
            currency: projected.currency,
            total: projected.total,
            perPerson: projected.perPerson,
            validUntil: iso(projected.validUntil),
            inclusions: projected.inclusions,
            exclusions: projected.exclusions,
            createdAt: iso(projected.createdAt),
          }
        : null,
      createdAt: iso(link.createdAt),
      expiresAt: iso(link.expiresAt),
      acceptedAt: iso(link.acceptedAt),
      declinedAt: iso(link.declinedAt),
      settledByAcceptedTrip,
    };
  });
}

/** Every live proposal answering this traveller's own enquiries. */
export async function listConsumerProposals(
  userId: string
): Promise<AgencyProposalSummary[]> {
  const { enquiryIds, clientIds } = await consumerAccess(userId);
  if (enquiryIds.length === 0) return [];

  // Quotes are the other half of the fallback: a link minted before
  // `enquiryId` existed still points at a client this traveller now owns.
  const clientQuotes = clientIds.length
    ? ((await AgencyQuote.find({ clientId: { $in: clientIds } })
        .select('_id')
        .lean()) as any[])
    : [];
  const quoteIds = clientQuotes.map((quote) => quote._id);

  const links = (await AgencyProposalLink.find({
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $or: [
      { enquiryId: { $in: enquiryIds } },
      ...(quoteIds.length ? [{ quoteId: { $in: quoteIds } }] : []),
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()) as any[];

  return summarizeLinks(links);
}

/**
 * The proposals a guest conversation can compare. Only public `pdf` shares
 * appear: a `live` proposal belongs to a signed-in account and is read through
 * `/api/proposals`, never a conversation token.
 */
export async function listProposalsForEnquiry(
  row: any
): Promise<AgencyProposalSummary[]> {
  if (!row?._id) return [];
  const quoteFilters: any[] = [];
  if (row.clientId) {
    const quotes = (await AgencyQuote.find({
      agencyId: row.agencyId,
      clientId: row.clientId,
    })
      .select('_id')
      .lean()) as any[];
    if (quotes.length) {
      quoteFilters.push({ quoteId: { $in: quotes.map((quote) => quote._id) } });
    }
  }

  const links = (await AgencyProposalLink.find({
    agencyId: row.agencyId,
    kind: { $ne: 'live' },
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $or: [{ enquiryId: row._id }, ...quoteFilters],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean()) as any[];

  return summarizeLinks(links);
}

async function loadEnquiryLink(row: any, linkId: string): Promise<IAgencyProposalLink> {
  if (!mongoose.isValidObjectId(linkId)) {
    throw new AppError('Proposal not found', 404);
  }
  const link = await AgencyProposalLink.findOne({
    _id: linkId,
    agencyId: row.agencyId,
    // A guest thread never opens a signed-in-only live proposal.
    kind: { $ne: 'live' },
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+itinerarySnapshot');
  if (!link) throw new AppError('Proposal not found', 404);
  if (link.enquiryId && String(link.enquiryId) === String(row._id)) {
    return link;
  }
  const quote = (await AgencyQuote.findOne({
    _id: link.quoteId,
    agencyId: row.agencyId,
  })
    .select('clientId')
    .lean()) as any;
  if (quote?.clientId && row.clientId && String(quote.clientId) === String(row.clientId)) {
    return link;
  }
  throw new AppError('Proposal not found', 404);
}

/** One proposal inside a guest's thread, resolved from that thread's row. */
export async function getProposalForEnquiry(
  row: any,
  linkId: string
): Promise<AgencyProposalView> {
  const link = await loadEnquiryLink(row, linkId);
  return buildAgencyProposalView(link);
}

export async function readProposalPdfForEnquiry(
  row: any,
  linkId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const link = await loadEnquiryLink(row, linkId);
  return readPdfForLink(link);
}

async function loadPinnedRows(link: IAgencyProposalLink) {
  const agencyId = String(link.agencyId);
  const tripId = String(link.tripId);
  const kind = proposalLinkKind(link);
  const [agency, trip, quoteRow, job] = await Promise.all([
    Agency.findById(link.agencyId),
    Trip.findOne({
      _id: link.tripId,
      agencyId,
      workspace: 'agency',
      isDeleted: { $ne: true },
    }),
    AgencyQuote.findOne({ _id: link.quoteId, agencyId, tripId }),
    // A live share has no export to pin: it renders its own snapshot.
    link.exportId
      ? AgencyExport.findOne({ _id: link.exportId, agencyId, tripId })
      : Promise.resolve(null),
  ]);
  if (!agency || agency.status !== 'active' || !trip || (kind === 'pdf' && !job)) {
    // A suspended tenant fails closed, and a public link must not reveal
    // whether the tenant exists at all.
    throw new AppError('Proposal not found', 404);
  }
  const quote = quoteRow ? await reconcileQuoteExpiry(quoteRow) : null;
  return { agency, trip, quote, job, kind };
}

export interface AgencyProposalView {
  agency: { name: string };
  trip: { _id: string; title: string };
  quote: QuoteProjection | null;
  canAccept: boolean;
  accepted: boolean;
  acceptedAt: Date | null;
  declined: boolean;
  declinedAt: Date | null;
  /**
   * `live` is the itinerary snapshot taken when the quote was sent (M9 R9).
   * `html` re-renders the pinned HTML template; `pdf` points the page at the
   * token-only PDF route because an uploaded PDF design is already the exact
   * document the agency approved.
   */
  documentMode: 'live' | 'html' | 'pdf';
  /** The send-time itinerary for `live` proposals; null for pinned shares. */
  itinerary: ExportDocument | null;
  html: string;
  pageCount: number;
  templateName: string;
  pdf: { bytes: number } | null;
  expiresAt: Date;
}

export async function getAgencyProposal(rawToken: unknown): Promise<AgencyProposalView> {
  const link = await loadLink(rawToken);
  return buildAgencyProposalView(link);
}

/**
 * Renders a proposal for its own traveller (M9 D8). The proposal token never
 * leaves the link the agency sent, so the comparison page resolves the link by
 * id and proves ownership through the enquiry/client chain before reusing the
 * exact same projection the public page shows.
 */
export async function getAgencyProposalForUser(
  linkId: string,
  userId: string
): Promise<AgencyProposalView> {
  const link = await loadOwnedLink(linkId, userId);
  return buildAgencyProposalView(link);
}

/**
 * The agency's own preview of an in-app proposal (M9 R9). It reads the same
 * snapshot the traveller sees and deliberately does not count as a view.
 */
export async function getAgencyProposalSharePreview(input: {
  agencyId: string;
  tripId: string;
  linkId: string;
  role: AgencyRole;
}): Promise<AgencyProposalView> {
  if (!agencyCan(input.role, 'viewer')) {
    throw new AppError("You don't have permission to view shares.", 403);
  }
  if (!mongoose.isValidObjectId(input.linkId)) {
    throw new AppError('Proposal not found', 404);
  }
  const link = await AgencyProposalLink.findOne({
    _id: input.linkId,
    agencyId: input.agencyId,
    tripId: input.tripId,
    kind: 'live',
  }).select('+itinerarySnapshot');
  if (!link || !proposalLinkIsViewable(link)) {
    throw new AppError('Proposal not found', 404);
  }
  return buildAgencyProposalView(link, { trackView: false });
}

async function recordProposalView(link: IAgencyProposalLink): Promise<void> {
  await AgencyProposalLink.updateOne(
    { _id: link._id },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }
  );
  await recordAgencyAudit({
    agencyId: String(link.agencyId),
    action: 'share.viewed',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata: { tripId: String(link.tripId), quoteId: String(link.quoteId) },
  });
}

/**
 * `trackView: false` is for the agency's own preview: staff reading the share
 * must not inflate the traveller's view count.
 */
async function buildAgencyProposalView(
  link: IAgencyProposalLink,
  options: { trackView?: boolean } = {}
): Promise<AgencyProposalView> {
  const { agency, trip, quote, job, kind } = await loadPinnedRows(link);
  const status = quote ? effectiveQuoteStatus(quote) : null;
  const action = proposalActionState(link, status);
  const track = options.trackView !== false;

  if (kind === 'live') {
    const itinerary = (link.itinerarySnapshot ?? null) as ExportDocument | null;
    if (!itinerary) {
      // A live row without its snapshot cannot be rebuilt; fail closed rather
      // than showing the current trip as if it were what was sent.
      throw new AppError('Proposal not found', 404);
    }
    if (track) await recordProposalView(link);
    return {
      agency: { name: String(agency.name ?? '') },
      trip: {
        _id: String(trip._id),
        title: String(
          itinerary.trip?.title ||
            trip.tripDetails?.trip_title ||
            trip.title ||
            'Proposal'
        ),
      },
      quote: quote ? projectQuoteForClient(quote) : null,
      canAccept: action.canAccept,
      accepted: action.accepted,
      acceptedAt: quote?.acceptedAt ?? link.acceptedAt ?? null,
      declined: action.declined,
      declinedAt: link.declinedAt ?? null,
      documentMode: 'live',
      itinerary,
      html: '',
      pageCount: 0,
      templateName: '',
      pdf: null,
      expiresAt: link.expiresAt,
    };
  }

  if (!job) throw new AppError('Proposal not found', 404);

  // Uploaded PDF designs are served from the finished export file through the
  // token-only PDF route; only HTML templates are re-rendered here.
  const template = await AgencyTemplate.findOne({
    _id: job.templateId,
    agencyId: link.agencyId,
  });
  const pdfMode = template?.engine === 'pdf-background';

  const client = trip.clientId
    ? await AgencyClient.findOne({ _id: trip.clientId, agencyId: String(link.agencyId) })
    : null;
  const rendered = pdfMode
    ? null
    : await renderPinnedAgencyExport({
        agencyId: String(link.agencyId),
        job,
        agency,
        trip,
        quote,
        client,
      });

  if (track) await recordProposalView(link);

  return {
    agency: { name: String(agency.name ?? '') },
    trip: { _id: String(trip._id), title: String(trip.tripDetails?.trip_title || trip.title || 'Proposal') },
    quote: quote ? projectQuoteForClient(quote) : null,
    canAccept: action.canAccept,
    accepted: action.accepted,
    acceptedAt: quote?.acceptedAt ?? link.acceptedAt ?? null,
    declined: action.declined,
    declinedAt: link.declinedAt ?? null,
    documentMode: pdfMode ? 'pdf' : 'html',
    itinerary: null,
    html: rendered?.html ?? '',
    pageCount: pdfMode
      ? Number(job.pageCount ?? 0)
      : rendered?.pageCount ?? 0,
    templateName: String(job.templateName ?? ''),
    pdf:
      job.status === 'ready' && job.outputKey
        ? { bytes: Number(job.bytes ?? 0) }
        : null,
    expiresAt: link.expiresAt,
  };
}

export interface AgencyProposalAcceptResult {
  status: 'accepted';
  acceptedAt: Date;
  quote: QuoteProjection;
}

export type ProposalAnswerSurface = 'share' | 'in-app';

/**
 * The one acceptance path for both surfaces (M9 R6): the public token page and
 * the traveller's own comparison. Ownership is already proved by the caller —
 * link by token, or link by account — so the quote CAS and the funnel write are
 * identical.
 */
async function acceptLink(
  link: IAgencyProposalLink,
  surface: ProposalAnswerSurface
): Promise<AgencyProposalAcceptResult> {
  const { quote } = await loadPinnedRows(link);
  if (!quote) throw new AppError('Proposal not found', 404);

  const status = effectiveQuoteStatus(quote);
  // Acceptance is idempotent: a retry returns the same accepted row.
  if (status === 'accepted') {
    return {
      status: 'accepted',
      acceptedAt: quote.acceptedAt ?? link.acceptedAt ?? new Date(),
      quote: projectQuoteForClient(quote),
    };
  }
  if (link.declinedAt) {
    throw new AppError(
      'You declined this proposal. Ask the agency for an updated one.',
      409
    );
  }
  if (status === 'expired') {
    throw new AppError(
      'This proposal has expired and can no longer be accepted.',
      409
    );
  }
  if (status === 'cancelled') {
    throw new AppError('This proposal was cancelled.', 409);
  }
  if (status !== 'sent') {
    throw new AppError('This proposal is not ready to accept yet.', 409);
  }

  // A trip can carry several versions, each with its own link. Accepting a
  // second one would leave the agency with two accepted quotes for the same
  // booking, so the first answer stands until staff send something new.
  const acceptedElsewhere = await AgencyQuote.findOne({
    agencyId: link.agencyId,
    tripId: quote.tripId,
    status: 'accepted',
    _id: { $ne: quote._id },
  })
    .select('_id')
    .lean();
  if (acceptedElsewhere) {
    throw new AppError(
      'You already accepted another version of this proposal. Ask the agency to send an update if your plans changed.',
      409
    );
  }

  const accepted = await AgencyQuote.findOneAndUpdate(
    { _id: quote._id, status: 'sent' },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
    { new: true }
  );
  if (!accepted) {
    throw new AppError(
      'This proposal changed before it could be accepted. Reload it.',
      409
    );
  }

  await AgencyProposalLink.updateOne(
    { _id: link._id },
    { $set: { acceptedAt: accepted.acceptedAt } }
  );
  const metadata = { tripId: String(link.tripId), linkId: String(link._id) };
  await recordAgencyAudit({
    agencyId: String(link.agencyId),
    action: 'share.accepted',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata,
  });
  await recordAgencyAudit({
    agencyId: String(link.agencyId),
    action: 'quote.accepted',
    targetType: 'AgencyQuote',
    targetId: String(accepted._id),
    metadata: { ...metadata, via: surface },
  });

  // The traveller said yes: close the lead that asked for this proposal, so the
  // inbox stops showing it as open work.
  if (link.enquiryId) {
    await markEnquiryWonByAcceptance(
      String(link.agencyId),
      String(link.enquiryId)
    );
  }

  return {
    status: 'accepted',
    acceptedAt: accepted.acceptedAt!,
    quote: projectQuoteForClient(accepted),
  };
}

export async function acceptAgencyProposal(
  rawToken: unknown
): Promise<AgencyProposalAcceptResult> {
  const link = await loadLink(rawToken);
  return acceptLink(link, 'share');
}

/** The same acceptance for the proposal's own traveller (M9 R6). */
export async function acceptAgencyProposalForUser(
  linkId: string,
  userId: string
): Promise<AgencyProposalAcceptResult> {
  const link = await loadOwnedLink(linkId, userId);
  return acceptLink(link, 'in-app');
}

export interface AgencyProposalDeclineResult {
  status: 'declined';
  declinedAt: Date;
}

/**
 * The traveller turns down this version (M9 R6). Only the link is stamped:
 * the quote stays `sent` and the lead keeps its funnel status, because the
 * conversation is still open and the agency may answer with a new proposal.
 */
export async function declineAgencyProposalForUser(
  linkId: string,
  userId: string
): Promise<AgencyProposalDeclineResult> {
  const link = await loadOwnedLink(linkId, userId);
  const { quote } = await loadPinnedRows(link);
  if (!quote) throw new AppError('Proposal not found', 404);

  if (link.declinedAt) {
    return { status: 'declined', declinedAt: link.declinedAt };
  }
  const status = effectiveQuoteStatus(quote);
  if (status === 'accepted') {
    throw new AppError('This proposal is already accepted.', 409);
  }
  if (status === 'expired') {
    throw new AppError('This proposal has expired.', 409);
  }
  if (status === 'cancelled') {
    throw new AppError('This proposal was cancelled.', 409);
  }
  if (status !== 'sent') {
    throw new AppError('This proposal is not ready to answer yet.', 409);
  }

  const declinedAt = new Date();
  const declined = await AgencyProposalLink.findOneAndUpdate(
    { _id: link._id, acceptedAt: null, declinedAt: null },
    { $set: { declinedAt } },
    { new: true }
  );
  if (!declined) {
    const current = await AgencyProposalLink.findById(link._id);
    if (current?.declinedAt) {
      return { status: 'declined', declinedAt: current.declinedAt };
    }
    throw new AppError(
      'This proposal changed before it could be declined. Reload it.',
      409
    );
  }

  await recordAgencyAudit({
    agencyId: String(link.agencyId),
    action: 'share.declined',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata: {
      tripId: String(link.tripId),
      quoteId: String(link.quoteId),
      via: 'in-app',
    },
  });
  emitProposalDeclined({
    agencyId: link.agencyId,
    enquiryId: link.enquiryId,
    linkId: link._id,
    declinedAt: declined.declinedAt,
  });

  return { status: 'declined', declinedAt: declined.declinedAt! };
}

export async function readAgencyProposalPdf(rawToken: unknown): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const link = await loadLink(rawToken);
  return readPdfForLink(link);
}

/** The same file, resolved for its own traveller rather than by token. */
export async function readAgencyProposalPdfForUser(
  linkId: string,
  userId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const link = await loadOwnedLink(linkId, userId);
  return readPdfForLink(link);
}

async function readPdfForLink(link: IAgencyProposalLink): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const { job } = await loadPinnedRows(link);
  if (!job) {
    throw new AppError(
      'This proposal has no PDF. Generate one from the trip export to download it.',
      409
    );
  }
  if (job.status !== 'ready' || !job.outputKey) {
    throw new AppError('The proposal PDF is not ready yet.', 409);
  }
  const buffer = await readAgencyExportFile(job.outputKey);
  const base = job.quoteNumber
    ? `${job.quoteNumber}-v${job.quoteVersion ?? 1}`
    : `proposal-${String(job.tripId)}`;
  return {
    buffer,
    filename: `${base.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80)}.pdf`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Staff management                                                          */
/* -------------------------------------------------------------------------- */

export interface CreateAgencyProposalLinkInput {
  agencyId: string;
  tripId: string;
  exportId: string;
  actorId: string;
  role: AgencyRole;
  ttlDays?: unknown;
  linkOrigins?: LinkOriginHints;
}

export async function createAgencyProposalLink(
  input: CreateAgencyProposalLinkInput
): Promise<{ link: ReturnType<typeof projectAgencyProposalLink>; url: string }> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to share proposals.", 403);
  }
  const job = await AgencyExport.findOne({
    _id: input.exportId,
    agencyId: input.agencyId,
    tripId: input.tripId,
  });
  if (!job) throw new AppError('Export not found', 404);
  if (job.audience !== 'client') {
    throw new AppError('Only client proposals can be shared publicly.', 400);
  }
  if (job.status !== 'ready' || !job.outputKey) {
    throw new AppError('Generate this proposal before sharing it.', 409);
  }
  if (!job.quoteId) {
    throw new AppError('This export has no quote to share.', 400);
  }
  const quote = await AgencyQuote.findOne({
    _id: job.quoteId,
    agencyId: input.agencyId,
    tripId: input.tripId,
  });
  if (!quote) throw new AppError('Quote not found', 404);

  // Stamp the conversation this proposal answers. The trip's own lead wins over
  // the client's first enquiry, so a returning traveller's newer thread gets
  // the document it was written for. An ad-hoc client leaves the field null.
  const enquiryId = await resolveEnquiryForTrip({
    agencyId: input.agencyId,
    tripId: input.tripId,
    clientId: quote.clientId ?? null,
  });

  const rawToken = mintInviteToken();
  const link = await AgencyProposalLink.create({
    kind: 'pdf',
    agencyId: input.agencyId,
    tripId: input.tripId,
    quoteId: quote._id,
    exportId: job._id,
    enquiryId,
    tokenHash: hashToken(rawToken),
    tokenHint: tokenHint(rawToken),
    createdBy: input.actorId,
    expiresAt: new Date(
      Date.now() + resolveProposalTtlDays(input.ttlDays) * 86_400_000
    ),
    quoteNumber: job.quoteNumber,
    quoteVersion: job.quoteVersion,
    templateName: job.templateName,
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'share.created',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata: {
      tripId: input.tripId,
      exportId: String(job._id),
      quoteId: String(quote._id),
    },
  });

  // Tell the traveller's own channel; the enquiry row is where their account
  // id lives. A legacy guest enquiry simply has none, and the frame no-ops.
  if (enquiryId) {
    // A proposal went out: that is what "quoted" means in the funnel. Write it
    // before the proposal frame so both screens resync to the same status.
    await markEnquiryQuotedByProposal(String(enquiryId));
    const enquiry = (await AgencyEnquiry.findOne({ _id: enquiryId })
      .select('userId')
      .lean()) as any;
    emitProposalCreated({
      enquiryId,
      userId: enquiry?.userId,
      linkId: link._id,
    });
  }

  return {
    link: projectAgencyProposalLink(link),
    url: agencyProposalLinkFor(rawToken, input.linkOrigins),
  };
}

export async function listAgencyProposalLinks(input: {
  agencyId: string;
  tripId: string;
  role: AgencyRole;
}) {
  if (!agencyCan(input.role, 'viewer')) {
    throw new AppError("You don't have permission to view shares.", 403);
  }
  const links = await AgencyProposalLink.find({
    agencyId: input.agencyId,
    tripId: input.tripId,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return links.map(projectAgencyProposalLink);
}

export async function revokeAgencyProposalLink(input: {
  agencyId: string;
  tripId: string;
  linkId: string;
  actorId: string;
  role: AgencyRole;
}) {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to revoke shares.", 403);
  }
  const link = await AgencyProposalLink.findOne({
    _id: input.linkId,
    agencyId: input.agencyId,
    tripId: input.tripId,
  });
  if (!link) throw new AppError('Share link not found', 404);
  if (link.revokedAt) return projectAgencyProposalLink(link);

  link.revokedAt = new Date();
  await link.save();
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'share.revoked',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata: { tripId: input.tripId },
  });
  return projectAgencyProposalLink(link);
}
