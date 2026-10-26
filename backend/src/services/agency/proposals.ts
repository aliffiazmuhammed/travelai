import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyExport from '../../models/AgencyExport.js';
import AgencyProposalLink, {
  IAgencyProposalLink,
} from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
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
import { renderPinnedAgencyExport } from './exports/exports.js';
import { readAgencyExportFile } from './exports/storage.js';
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

export function projectAgencyProposalLink(link: IAgencyProposalLink | any) {
  return {
    _id: String(link._id),
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
  };
}

export function agencyProposalLinkFor(
  rawToken: string,
  hints: LinkOriginHints = {}
): string {
  return `${pickLinkOrigin(hints)}/proposal/${rawToken}`;
}

async function loadLink(rawToken: unknown): Promise<IAgencyProposalLink> {
  const hash = hashToken(String(rawToken ?? ''));
  const link = await AgencyProposalLink.findOne({ tokenHash: hash });
  if (!link || !proposalLinkIsViewable(link)) {
    throw new AppError('Proposal not found', 404);
  }
  return link;
}

async function loadPinnedRows(link: IAgencyProposalLink) {
  const agencyId = String(link.agencyId);
  const tripId = String(link.tripId);
  const [agency, trip, quoteRow, job] = await Promise.all([
    Agency.findById(link.agencyId),
    Trip.findOne({
      _id: link.tripId,
      agencyId,
      workspace: 'agency',
      isDeleted: { $ne: true },
    }),
    AgencyQuote.findOne({ _id: link.quoteId, agencyId, tripId }),
    AgencyExport.findOne({ _id: link.exportId, agencyId, tripId }),
  ]);
  if (!agency || agency.status !== 'active' || !trip || !job) {
    // A suspended tenant fails closed, and a public link must not reveal
    // whether the tenant exists at all.
    throw new AppError('Proposal not found', 404);
  }
  const quote = quoteRow ? await reconcileQuoteExpiry(quoteRow) : null;
  return { agency, trip, quote, job };
}

export interface AgencyProposalView {
  agency: { name: string };
  trip: { _id: string; title: string };
  quote: QuoteProjection | null;
  canAccept: boolean;
  accepted: boolean;
  acceptedAt: Date | null;
  html: string;
  pageCount: number;
  templateName: string;
  pdf: { bytes: number } | null;
  expiresAt: Date;
}

export async function getAgencyProposal(rawToken: unknown): Promise<AgencyProposalView> {
  const link = await loadLink(rawToken);
  const { agency, trip, quote, job } = await loadPinnedRows(link);

  const client = trip.clientId
    ? await AgencyClient.findOne({ _id: trip.clientId, agencyId: String(link.agencyId) })
    : null;
  const rendered = await renderPinnedAgencyExport({
    agencyId: String(link.agencyId),
    job,
    agency,
    trip,
    quote,
    client,
  });

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

  const status = quote ? effectiveQuoteStatus(quote) : null;
  return {
    agency: { name: String(agency.name ?? '') },
    trip: { _id: String(trip._id), title: String(trip.tripDetails?.trip_title || trip.title || 'Proposal') },
    quote: quote ? projectQuoteForClient(quote) : null,
    canAccept: status === 'sent',
    accepted: status === 'accepted',
    acceptedAt: quote?.acceptedAt ?? link.acceptedAt ?? null,
    html: rendered.html,
    pageCount: rendered.pageCount,
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

export async function acceptAgencyProposal(
  rawToken: unknown
): Promise<AgencyProposalAcceptResult> {
  const link = await loadLink(rawToken);
  const { quote } = await loadPinnedRows(link);
  if (!quote) throw new AppError('Proposal not found', 404);

  // Acceptance is idempotent: a retry returns the same accepted row.
  const status = effectiveQuoteStatus(quote);
  if (status === 'accepted') {
    return {
      status: 'accepted',
      acceptedAt: quote.acceptedAt ?? link.acceptedAt ?? new Date(),
      quote: projectQuoteForClient(quote),
    };
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
    metadata: { ...metadata, via: 'share' },
  });

  return {
    status: 'accepted',
    acceptedAt: accepted.acceptedAt!,
    quote: projectQuoteForClient(accepted),
  };
}

export async function readAgencyProposalPdf(rawToken: unknown): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const link = await loadLink(rawToken);
  const { job } = await loadPinnedRows(link);
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

  const rawToken = mintInviteToken();
  const link = await AgencyProposalLink.create({
    agencyId: input.agencyId,
    tripId: input.tripId,
    quoteId: quote._id,
    exportId: job._id,
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
