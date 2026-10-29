import { Router } from 'express';
import {
  getMyEnquirySummaryHandler,
  listMyEnquiriesHandler,
  markMyEnquiryReadHandler,
  subscribeMyEnquiryEvents,
} from '../controllers/enquiries.controller.js';
import {
  getMyConversationHandler,
  sendMyConversationMessageHandler,
} from '../controllers/conversations.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { enquiryStreamLimiter } from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { conversationMessageSchema } from '../schemas/agencyEnquiry.schema.js';

/**
 * A traveller's own enquiry history and thread (Milestone 9 D5/D8), mounted at
 * `/api/enquiries`.
 *
 * Personal-realm only: an enquiry is attributed to the account that sent it, so
 * the agency realm (or a platform operator) must not be able to list a
 * consumer's contacts or read their thread through this surface. The submission
 * itself is public and lives on `/api/agencies/:slug/enquiries`; guest replies
 * live on `/api/conversations/:token`.
 *
 * R1 adds the badge summary, an explicit read receipt and the live stream. All
 * three are declared before `/:id`, or "summary" and "events" would be read as
 * enquiry ids.
 */
const router = Router();

router.get('/', protectPersonal, listMyEnquiriesHandler);
router.get('/summary', protectPersonal, getMyEnquirySummaryHandler);
router.get(
  '/events',
  protectPersonal,
  enquiryStreamLimiter,
  subscribeMyEnquiryEvents
);
router.post('/:id/read', protectPersonal, markMyEnquiryReadHandler);
router.get('/:id', protectPersonal, getMyConversationHandler);
router.post(
  '/:id/messages',
  protectPersonal,
  validate(conversationMessageSchema),
  sendMyConversationMessageHandler
);

export default router;
