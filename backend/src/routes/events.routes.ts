import { Router } from 'express';
import {
  getPublicEvent,
  getPublicEventCover,
  getPublicEvents,
  submitPublicEventInterest,
} from '../controllers/events.controller.js';
import {
  eventInterestEmailLimiter,
  eventInterestEventIpLimiter,
  eventInterestEventLimiter,
  eventInterestIpLimiter,
  publicEventsLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { eventInterestSchema } from '../schemas/events.schema.js';

/**
 * Public agency events (Milestone 10 E1/E2). Like the gallery and the
 * directory, this router sits outside both realm guards: no session is read,
 * and every row leaves through the event projection.
 *
 * The listing and page reads share one IP brake; the interest write stacks its
 * own per-IP, per-email and per-event daily buckets, because it is the only
 * anonymous write on this surface. The per-event-IP bucket sits after the email
 * one so a shared network that is flooding a single camp hears about that camp,
 * not about the whole site.
 */
const router = Router();

router.get('/', publicEventsLimiter, getPublicEvents);
router.get('/:eventId/cover', publicEventsLimiter, getPublicEventCover);
router.post(
  '/:eventId/interest',
  eventInterestIpLimiter,
  eventInterestEmailLimiter,
  eventInterestEventIpLimiter,
  eventInterestEventLimiter,
  validate(eventInterestSchema),
  submitPublicEventInterest
);
router.get('/:eventId', publicEventsLimiter, getPublicEvent);

export default router;
