import { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyProposalLink, {
  type IAgencyProposalLink,
} from '../../models/AgencyProposalLink.js';
import AgencyQuote, { type IAgencyQuote } from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { hashToken, mintInviteToken, tokenHint } from '../collab/invites.js';
import { emitProposalCreated } from '../realtime/enquiryEvents.js';
import { agencyCan, type AgencyRole } from './access.js';
import { recordAgencyAudit } from './audit.js';
import { buildExportDocument } from './exports/document.js';

/**
 * The in-app proposal behind a sent quote (M9 R9).
 *
 * "Save & send" shares the quote plus the itinerary as it stood that moment:
 * no template, no export job, no PDF, no quota. The traveller opens it from
 * their enquiry thread, accepts or declines it, or keeps talking to the
 * agency. The PDF remains a separate, explicit step on the Export tab.
 *
 * The snapshot is deliberate. A later itinerary edit is a new version of the
 * trip, not a silent rewrite of what the traveller was quoted against; the
 * quote row itself is referenced live so acceptance and expiry stay in one
 * place.
 */

export interface LiveProposalMintResult {
  link: IAgencyProposalLink;
  /** False when an answerable share for this quote already existed. */
  created: boolean;
}

function liveLinkTtlDays(): number {
  return env.AGENCY_PROPOSAL_TTL_DAYS;
}

async function findViewableLiveLink(
  agencyId: string,
  quoteId: Types.ObjectId
): Promise<IAgencyProposalLink | null> {
  return AgencyProposalLink.findOne({
    agencyId,
    quoteId,
    kind: 'live',
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

/**
 * Creates the traveller's in-app proposal for one sent quote, or returns the
 * existing one. Returns null when the quote has no directory client or that
 * client never came from an enquiry — an ad-hoc client has no account to
 * answer in-app and is served by a PDF share instead.
 */
export async function ensureLiveProposalForQuote(input: {
  agencyId: string;
  tripId: string;
  quote: IAgencyQuote | any;
  actorId?: string;
}): Promise<LiveProposalMintResult | null> {
  const quote = input.quote;
  if (!quote?.clientId) return null;

  const client = (await AgencyClient.findOne({
    _id: quote.clientId,
    agencyId: input.agencyId,
  })
    .select('sourceEnquiryId name email phone')
    .lean()) as any;
  if (!client?.sourceEnquiryId) return null;

  const existing = await findViewableLiveLink(input.agencyId, quote._id);
  if (existing) return { link: existing, created: false };

  const [agency, trip] = await Promise.all([
    Agency.findById(input.agencyId),
    Trip.findOne({
      _id: input.tripId,
      agencyId: input.agencyId,
      workspace: 'agency',
      isDeleted: { $ne: true },
    }),
  ]);
  if (!agency || agency.status !== 'active' || !trip) {
    throw new AppError('This trip is no longer available to share.', 409);
  }

  // Built from the same normalizer the PDF renderer uses, so the snapshot is
  // client-safe by construction: no markup, internal cost or chat ciphertext.
  const snapshot = buildExportDocument({ agency, trip, quote, client });

  const enquiryId = client.sourceEnquiryId as Types.ObjectId;
  const rawToken = mintInviteToken();
  const link = await AgencyProposalLink.create({
    kind: 'live',
    agencyId: input.agencyId,
    tripId: input.tripId,
    quoteId: quote._id,
    exportId: null,
    enquiryId,
    tokenHash: hashToken(rawToken),
    tokenHint: tokenHint(rawToken),
    createdBy: input.actorId ?? quote.createdBy,
    expiresAt: new Date(Date.now() + liveLinkTtlDays() * 86_400_000),
    quoteNumber: quote.number,
    quoteVersion: quote.version,
    templateName: null,
    itinerarySnapshot: snapshot,
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'share.created',
    targetType: 'AgencyProposalLink',
    targetId: String(link._id),
    metadata: {
      tripId: input.tripId,
      quoteId: String(quote._id),
      via: 'send',
    },
  });

  // The enquiry row owns the traveller's account id; the frame no-ops for a
  // legacy lead without one.
  const enquiry = (await AgencyEnquiry.findOne({ _id: enquiryId })
    .select('userId')
    .lean()) as any;
  emitProposalCreated({
    enquiryId,
    userId: enquiry?.userId,
    linkId: link._id,
  });

  return { link, created: true };
}

/**
 * The quote panel's retry: make sure the latest issued quote is in the
 * traveller's enquiries. Sending already does this; the endpoint exists for
 * quotes issued before R9 and for a send whose mint failed.
 */
export async function shareLatestQuoteWithTraveller(input: {
  agencyId: string;
  tripId: string;
  actorId: string;
  role: AgencyRole;
}): Promise<LiveProposalMintResult> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to share this quote.", 403);
  }
  const quote = await AgencyQuote.findOne({
    agencyId: input.agencyId,
    tripId: input.tripId,
  }).sort({ version: -1 });
  if (!quote) throw new AppError('Create a quote for this trip first.', 404);
  if (quote.status !== 'sent') {
    throw new AppError('Send this quote before sharing it with the traveller.', 409);
  }
  if (quote.validUntil.getTime() <= Date.now()) {
    throw new AppError(
      'This quote has expired. Update the validity date and send a new version.',
      409
    );
  }

  const result = await ensureLiveProposalForQuote({
    agencyId: input.agencyId,
    tripId: input.tripId,
    quote,
    actorId: input.actorId,
  });
  if (!result) {
    throw new AppError(
      "This client isn't linked to a traveller account. Generate a PDF proposal to share it instead.",
      409
    );
  }
  return result;
}
