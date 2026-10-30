import { Response } from 'express';
import {
  agencyContext,
  type AgencyAccessRequest,
} from '../middleware/agencyAccess.middleware.js';
import {
  closeAgencyEvent,
  createAgencyEvent,
  decideEventInterest,
  deleteAgencyEvent,
  getAgencyEventInterestSummary,
  getOwnAgencyEvent,
  listAgencyEvents,
  listEventInterests,
  publishAgencyEvent,
  reopenAgencyEvent,
  unpublishAgencyEvent,
  updateAgencyEvent,
  viewOwnEvent,
} from '../services/events/agencyEvents.js';
import {
  eventInterestsQuerySchema,
  type AgencyEventFormInput,
} from '../schemas/events.schema.js';
import { parseQuery } from '../utils/parseQuery.js';
import { catchAsync } from '../utils/catchAsync.js';

/**
 * Agency event library (Milestone 10 E2). Every handler runs behind a tenant
 * guard, so the agency id comes from `agencyContext` rather than the body, and
 * no read or write can cross tenants.
 */

export const listAgencyEventsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const events = await listAgencyEvents(String(agency._id));
    res.json({ success: true, events });
  }
);

/** The Events nav badge: one tenant-wide pending-interest count. */
export const getAgencyEventSummaryHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const summary = await getAgencyEventInterestSummary(String(agency._id));
    res.json({ success: true, summary });
  }
);

export const getAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const event = await getOwnAgencyEvent(
      String(agency._id),
      String(req.params.eventId ?? '')
    );
    res.json({ success: true, event });
  }
);

export const createAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const created = await createAgencyEvent({
      agencyId: String(agency._id),
      actorId: req.userId,
      fields: (req.body ?? {}) as AgencyEventFormInput,
    });
    res.status(201).json({
      success: true,
      event: viewOwnEvent(created, String(agency._id)),
    });
  }
);

export const updateAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const eventId = String(req.params.eventId ?? '');
    await updateAgencyEvent({
      agencyId: String(agency._id),
      eventId,
      actorId: req.userId,
      fields: (req.body ?? {}) as AgencyEventFormInput,
    });
    res.json({
      success: true,
      event: await getOwnAgencyEvent(String(agency._id), eventId),
    });
  }
);

/** Publish/unpublish/close/reopen all answer with the fresh library row. */
async function applyLifecycleAction(
  req: AgencyAccessRequest,
  res: Response,
  action: (input: {
    agencyId: string;
    eventId: string;
    actorId?: string;
  }) => Promise<unknown>
): Promise<void> {
  const { agency } = agencyContext(req);
  const eventId = String(req.params.eventId ?? '');
  await action({
    agencyId: String(agency._id),
    eventId,
    actorId: req.userId,
  });
  res.json({
    success: true,
    event: await getOwnAgencyEvent(String(agency._id), eventId),
  });
}

export const publishAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) =>
    applyLifecycleAction(req, res, publishAgencyEvent)
);

export const unpublishAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) =>
    applyLifecycleAction(req, res, unpublishAgencyEvent)
);

export const closeAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) =>
    applyLifecycleAction(req, res, closeAgencyEvent)
);

export const reopenAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) =>
    applyLifecycleAction(req, res, reopenAgencyEvent)
);

export const deleteAgencyEventHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const result = await deleteAgencyEvent({
      agencyId: String(agency._id),
      eventId: String(req.params.eventId ?? ''),
      actorId: req.userId,
    });
    res.json({
      success: true,
      id: result.id,
      message: 'Event deleted.',
    });
  }
);

export const listEventInterestsHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const query = parseQuery(eventInterestsQuerySchema, req.query);
    const interests = await listEventInterests({
      agencyId: String(agency._id),
      eventId: String(req.params.eventId ?? ''),
      status: query.status,
    });
    res.json({ success: true, interests });
  }
);

export const decideEventInterestHandler = catchAsync(
  async (req: AgencyAccessRequest, res: Response) => {
    const { agency } = agencyContext(req);
    const status = req.body?.status as 'confirmed' | 'declined';
    const interest = await decideEventInterest({
      agencyId: String(agency._id),
      eventId: String(req.params.eventId ?? ''),
      interestId: String(req.params.interestId ?? ''),
      actorId: req.userId,
      status,
    });
    res.json({ success: true, interest });
  }
);
