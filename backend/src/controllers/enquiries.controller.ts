import { Request, Response } from 'express';
import {
  agencyContext,
  type AgencyAccessRequest,
} from '../middleware/agencyAccess.middleware.js';
import { linkOriginHints } from '../services/collab/invites.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { parseQuery } from '../utils/parseQuery.js';
import {
  agencyEnquiryQuerySchema,
  myEnquiryQuerySchema,
  updateAgencyEnquirySchema,
} from '../schemas/agencyEnquiry.schema.js';
import {
  getAgencyEnquiry,
  getAgencyEnquirySummary,
  convertAgencyEnquiry,
  listAgencyEnquiries,
  listOwnEnquiries,
  submitAgencyEnquiry,
  updateAgencyEnquiry,
} from '../services/directory/enquiries.js';

/**
 * Agency enquiries (Milestone 9 D5), mounted at `/api/agencies` (public write)
 * and `/api/agency` (tenant inbox) / `/api/enquiries` (own history).
 *
 * The write is anonymous but never trusts the body: the service re-normalises
 * every field, re-checks consent and re-verifies that the agency and package are
 * still public. The acknowledgement deliberately carries no contact detail.
 */

/**
 * `POST /api/agencies/:slug/enquiries`.
 *
 * `req.userId` is only present when `attachPersonalIfPresent` verified a
 * personal session; an agency or platform cookie is ignored, so an agent using
 * the workspace cannot accidentally file a lead as their own tenant account.
 */
export const createAgencyEnquiryHandler = catchAsync(
  async (req: Request, res: Response) => {
    const auth = req as AuthenticatedRequest;
    const acknowledgement = await submitAgencyEnquiry({
      slug: String(req.params.slug || ''),
      body: req.body ?? {},
      userId: auth.realm === 'personal' ? auth.userId : undefined,
      linkOrigins: linkOriginHints(req),
    });
    res.status(201).json({ success: true, enquiry: acknowledgement });
  }
);

/** `GET /api/agency/enquiries` — the tenant inbox, newest first. */
export const listAgencyEnquiriesHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const query = parseQuery(agencyEnquiryQuerySchema, req.query);
    const page = await listAgencyEnquiries({
      agencyId: String(agency._id),
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.json({ success: true, ...page });
  }
);

/** `GET /api/agency/enquiries/:enquiryId` — one lead, tenant-scoped. */
export const getAgencyEnquiryHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const enquiry = await getAgencyEnquiry(
      String(agency._id),
      String(req.params.enquiryId || '')
    );
    res.json({ success: true, enquiry });
  }
);

/** `GET /api/agency/enquiries/summary` — inbox counters and conversion rate. */
export const getAgencyEnquirySummaryHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const summary = await getAgencyEnquirySummary(String(agency._id));
    res.json({ success: true, summary });
  }
);

/** `PATCH /api/agency/enquiries/:enquiryId` — status, claim and release. */
export const updateAgencyEnquiryHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency, role } = agencyContext(req);
    const body = (req.body ?? {}) as {
      status?: unknown;
      lostReason?: unknown;
      assigneeId?: unknown;
    };
    const result = await updateAgencyEnquiry({
      agencyId: String(agency._id),
      enquiryId: String(req.params.enquiryId || ''),
      actorId: req.userId!,
      actorRole: role,
      status: body.status as any,
      lostReason: body.lostReason,
      assigneeId: body.assigneeId,
    });
    res.json({ success: true, ...result });
  }
);

/**
 * `POST /api/agency/enquiries/:enquiryId/convert` — create or reuse a directory
 * client and mark the lead won. Safe to retry: the second call returns the same
 * client rather than creating a duplicate.
 */
export const convertAgencyEnquiryHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const result = await convertAgencyEnquiry({
      agencyId: String(agency._id),
      enquiryId: String(req.params.enquiryId || ''),
      actorId: req.userId!,
    });
    res.json({ success: true, ...result });
  }
);

/** `GET /api/enquiries` — the signed-in traveller's own history. */
export const listMyEnquiriesHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
      throw new AppError('Please sign in to see your enquiries.', 401);
    }
    const query = parseQuery(myEnquiryQuerySchema, req.query);
    const page = await listOwnEnquiries({
      userId: String(req.userId),
      cursor: query.cursor,
      limit: query.limit,
    });
    res.json({ success: true, ...page });
  }
);
