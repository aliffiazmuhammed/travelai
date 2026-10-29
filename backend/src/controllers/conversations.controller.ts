import { Request, Response } from 'express';
import {
  agencyContext,
  type AgencyAccessRequest,
} from '../middleware/agencyAccess.middleware.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';
import {
  getAgencyProposalForUser,
  getProposalForEnquiry,
  listConsumerProposals,
  listProposalsForEnquiry,
  readAgencyProposalPdfForUser,
  readProposalPdfForEnquiry,
} from '../services/agency/proposals.js';
import {
  appendAgencyMessage,
  appendGuestMessage,
  appendOwnMessage,
  getConversationByToken,
  getOwnConversation,
  loadConversationByToken,
} from '../services/directory/conversations.js';

/**
 * Two-way enquiry conversations (Milestone 9 D8).
 *
 * Three surfaces share one thread:
 *
 * - `/api/conversations/:token` — the guest's private link. No session: the
 *   token is the capability, and every read is scoped to that one enquiry.
 * - `/api/enquiries/:id` — a signed-in traveller's own thread, refused to every
 *   agency/platform session by `protectPersonal` on the route.
 * - `/api/agency/enquiries/:id/messages` — the tenant's reply, narrowed by the
 *   workspace membership guard and planner rank.
 */

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.userId) {
    throw new AppError('Please sign in to continue.', 401);
  }
  return String(req.userId);
}

/** `GET /api/conversations/:token` — guest read; marks the thread read. */
export const getConversationHandler = catchAsync(
  async (req: Request, res: Response) => {
    const conversation = await getConversationByToken(req.params.token);
    res.json({ success: true, conversation });
  }
);

/** `POST /api/conversations/:token/messages` — guest reply. */
export const sendConversationMessageHandler = catchAsync(
  async (req: Request, res: Response) => {
    const conversation = await appendGuestMessage(
      req.params.token,
      req.body?.body
    );
    res.status(201).json({ success: true, conversation });
  }
);

/**
 * `GET /api/conversations/:token/proposals` — the agency's live proposals for
 * this enquiry, so a guest can compare them in the same place they reply.
 */
export const listConversationProposalsHandler = catchAsync(
  async (req: Request, res: Response) => {
    const { row } = await loadConversationByToken(req.params.token);
    const proposals = await listProposalsForEnquiry(row);
    res.json({ success: true, proposals });
  }
);

/** `GET /api/conversations/:token/proposals/:linkId` — the pinned document. */
export const getConversationProposalHandler = catchAsync(
  async (req: Request, res: Response) => {
    const { row } = await loadConversationByToken(req.params.token);
    const proposal = await getProposalForEnquiry(row, String(req.params.linkId || ''));
    res.json({ success: true, proposal });
  }
);

/** `GET /api/conversations/:token/proposals/:linkId/pdf` — same bytes. */
export const downloadConversationProposalHandler = catchAsync(
  async (req: Request, res: Response) => {
    const { row } = await loadConversationByToken(req.params.token);
    const { buffer, filename } = await readProposalPdfForEnquiry(
      row,
      String(req.params.linkId || '')
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
);

/** `GET /api/enquiries/:id` — signed-in traveller's thread; marks it read. */
export const getMyConversationHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const conversation = await getOwnConversation(
      requireUserId(req),
      String(req.params.id || '')
    );
    res.json({ success: true, conversation });
  }
);

/** `POST /api/enquiries/:id/messages` — signed-in traveller reply. */
export const sendMyConversationMessageHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const conversation = await appendOwnMessage({
      userId: requireUserId(req),
      enquiryId: String(req.params.id || ''),
      body: req.body?.body,
    });
    res.status(201).json({ success: true, conversation });
  }
);

/** `POST /api/agency/enquiries/:enquiryId/messages` — tenant reply. */
export const sendAgencyEnquiryMessageHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const conversation = await appendAgencyMessage({
      agencyId: String(agency._id),
      enquiryId: String(req.params.enquiryId || ''),
      actorId: req.userId!,
      actorRole: role,
      body: req.body?.body,
    });
    res.status(201).json({ success: true, conversation });
  }
);

/* -------------------------------------------------------------------------- */
/*  Proposal comparison (personal realm)                                      */
/* -------------------------------------------------------------------------- */

/** `GET /api/proposals` — every live proposal answering this account's enquiries. */
export const listMyProposalsHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const proposals = await listConsumerProposals(requireUserId(req));
    res.json({ success: true, proposals });
  }
);

/** `GET /api/proposals/:linkId` — the full pinned document for its owner. */
export const getMyProposalHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const proposal = await getAgencyProposalForUser(
      String(req.params.linkId || ''),
      requireUserId(req)
    );
    res.json({ success: true, proposal });
  }
);

/** `GET /api/proposals/:linkId/pdf` — same bytes as the token link, owner-only. */
export const downloadMyProposalHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { buffer, filename } = await readAgencyProposalPdfForUser(
      String(req.params.linkId || ''),
      requireUserId(req)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
);
