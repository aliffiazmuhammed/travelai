import { Request, Response } from 'express';
import {
  agencyContext,
  type AgencyAccessRequest,
} from '../middleware/agencyAccess.middleware.js';
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
  getOwnEnquirySummary,
  convertAgencyEnquiry,
  listAgencyEnquiries,
  listOwnEnquiries,
  submitAgencyEnquiry,
  updateAgencyEnquiry,
} from '../services/directory/enquiries.js';
import {
  markAgencyEnquiryRead,
  markOwnConversationRead,
} from '../services/directory/conversations.js';
import {
  agencyChannel,
  isEnquirySseEnabled,
  openStream,
  userChannel,
  type EnquiryEvent,
} from '../services/realtime/enquiryEvents.js';

/**
 * Agency enquiries (Milestone 9 D5), mounted at `/api/agencies` (public write)
 * and `/api/agency` (tenant inbox) / `/api/enquiries` (own history).
 *
 * The write never trusts the body: the service re-normalises every field,
 * re-checks consent and re-verifies that the agency and package are still
 * public. The acknowledgement deliberately carries no contact detail.
 */

/**
 * `POST /api/agencies/:slug/enquiries`.
 *
 * `protectPersonal` on the route guarantees the session, so the enquiry is
 * always attributed to the traveller's own account — an agency or platform
 * cookie never reaches this handler.
 */
export const createAgencyEnquiryHandler = catchAsync(
  async (req: Request, res: Response) => {
    const auth = req as AuthenticatedRequest;
    const acknowledgement = await submitAgencyEnquiry({
      slug: String(req.params.slug || ''),
      body: req.body ?? {},
      userId: String(auth.userId),
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

/** `GET /api/enquiries/summary` — unread and proposal badges for the nav. */
export const getMyEnquirySummaryHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
      throw new AppError('Please sign in to see your enquiries.', 401);
    }
    const summary = await getOwnEnquirySummary(String(req.userId));
    res.json({ success: true, summary });
  }
);

/** `POST /api/enquiries/:id/read` — the traveller opened this thread. */
export const markMyEnquiryReadHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
      throw new AppError('Please sign in to see your enquiries.', 401);
    }
    const unread = await markOwnConversationRead(
      String(req.userId),
      String(req.params.id || '')
    );
    res.json({ success: true, unread });
  }
);

/** `POST /api/agency/enquiries/:enquiryId/read` — the inbox opened the lead. */
export const markAgencyEnquiryReadHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const unread = await markAgencyEnquiryRead(
      String(agency._id),
      String(req.params.enquiryId || '')
    );
    res.json({ success: true, unread });
  }
);

/* -------------------------------------------------------------------------- */
/*  Live tier (R1) — enquiry and inbox streams                                */
/* -------------------------------------------------------------------------- */

const ENQUIRY_KEEPALIVE_MS = 15000;

/**
 * Wires one SSE response to a channel.
 *
 * Exported for the controller test (which drives it with a fake response); the
 * two handlers below are what routes mount. `hello` is the first frame so a
 * client can tell a live stream from a proxy holding the connection open.
 */
export function startEnquiryStream(
  req: Request,
  res: Response,
  channel: string
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  const write = (event: unknown) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Closing sockets are cleaned up by their own close handler.
    }
  };

  const hello: EnquiryEvent = {
    type: 'hello',
    channel,
    at: new Date().toISOString(),
  };
  write(hello);

  let cleaned = false;
  let unsubscribe: () => void = () => {};
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(keepAlive);
    unsubscribe();
  };

  unsubscribe = openStream(channel, {
    deliver: write,
    close: () => {
      // Eviction is the one path where the socket never fires `close` itself,
      // so ending it must also drop the keepalive or the timer leaks.
      cleanup();
      try {
        res.end();
      } catch {
        // Already gone.
      }
    },
  });
  const keepAlive = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch {
      // Same rule as above: never throw from a timer.
    }
  }, ENQUIRY_KEEPALIVE_MS);

  req.on('close', cleanup);
  res.on('close', cleanup);
}

/** Dark by default, exactly like the admin namespace: off means "no such path". */
function streamUnavailable(res: Response): boolean {
  if (isEnquirySseEnabled()) return false;
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'Not found',
  });
  return true;
}

/** `GET /api/enquiries/events` — the traveller's own live channel. */
export const subscribeMyEnquiryEvents = (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (streamUnavailable(res)) return;
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Please sign in to continue.' });
    return;
  }
  startEnquiryStream(req, res, userChannel(String(req.userId)));
};

/** `GET /api/agency/enquiries/events` — the tenant inbox's live channel. */
export const subscribeAgencyEnquiryEvents = (
  req: AgencyAccessRequest,
  res: Response
) => {
  if (streamUnavailable(res)) return;
  const { agency } = agencyContext(req);
  startEnquiryStream(req, res, agencyChannel(String(agency._id)));
};
