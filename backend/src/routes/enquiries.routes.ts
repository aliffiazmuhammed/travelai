import { Router } from 'express';
import { listMyEnquiriesHandler } from '../controllers/enquiries.controller.js';
import {
  getMyConversationHandler,
  sendMyConversationMessageHandler,
} from '../controllers/conversations.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
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
 */
const router = Router();

router.get('/', protectPersonal, listMyEnquiriesHandler);
router.get('/:id', protectPersonal, getMyConversationHandler);
router.post(
  '/:id/messages',
  protectPersonal,
  validate(conversationMessageSchema),
  sendMyConversationMessageHandler
);

export default router;
