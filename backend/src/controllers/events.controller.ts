import { Request, Response } from 'express';
import { extensionForAgencyAssetMime } from '../services/agency/assets.js';
import {
  listPublicEvents,
  loadPublicEvent,
  loadPublicEventCover,
} from '../services/events/publicEvents.js';
import {
  submitEventInterest,
  type EventInterestInput,
} from '../services/events/interest.js';
import { eventsQuerySchema } from '../schemas/events.schema.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { parseQuery } from '../utils/parseQuery.js';

/**
 * Public agency events (Milestone 10 E1).
 *
 * Every handler is anonymous by design: a visitor browsing Explore has no
 * session, and the event payload is an allow-list projection. The service
 * layer decides eligibility, so the response shape cannot widen with a query.
 */

/** GET /api/events — upcoming open events, soonest first. */
export const getPublicEvents = catchAsync(async (req: Request, res: Response) => {
  const query = parseQuery(eventsQuerySchema, req.query);
  const page = await listPublicEvents(query);
  res.status(200).json({ success: true, ...page });
});

/** GET /api/events/:eventId — one event page, closed windows included. */
export const getPublicEvent = catchAsync(async (req: Request, res: Response) => {
  const event = await loadPublicEvent(String(req.params.eventId ?? ''));
  res.status(200).json({ success: true, event });
});

/**
 * POST /api/events/:eventId/interest — the guest's "I'm interested" write.
 * The response echoes only ids and timestamps, never the contact details.
 */
export const submitPublicEventInterest = catchAsync(
  async (req: Request, res: Response) => {
    const interest = await submitEventInterest({
      eventId: String(req.params.eventId ?? ''),
      body: (req.body ?? {}) as EventInterestInput,
    });
    res.status(201).json({ success: true, interest });
  }
);

/** GET /api/events/:eventId/cover — cover bytes, gated like the event page. */
export const getPublicEventCover = catchAsync(
  async (req: Request, res: Response) => {
    const cover = await loadPublicEventCover(String(req.params.eventId ?? ''));
    if (!cover) {
      throw new AppError('Event not found.', 404);
    }
    const extension = extensionForAgencyAssetMime(cover.mime) || 'jpg';

    res.setHeader('Content-Type', cover.mime);
    res.setHeader('Content-Length', String(cover.buffer.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="cover.${extension}"`);
    res.send(cover.buffer);
  }
);
