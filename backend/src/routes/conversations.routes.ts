import { Router } from 'express';
import {
  downloadConversationProposalHandler,
  getConversationHandler,
  getConversationProposalHandler,
  listConversationProposalsHandler,
  sendConversationMessageHandler,
} from '../controllers/conversations.controller.js';
import {
  conversationReadLimiter,
  conversationWriteLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { conversationMessageSchema } from '../schemas/agencyEnquiry.schema.js';

/**
 * Guest enquiry conversations (Milestone 9 D8), mounted at `/api/conversations`.
 *
 * Deliberately outside both realm guards: the private 256-bit token is the
 * capability, and the service resolves exactly one enquiry from its hash. An
 * expired, revoked (deleted enquiry) or suspended-agency link answers the same
 * generic 404 as an unknown one.
 */
const router = Router();

router.get('/:token', conversationReadLimiter, getConversationHandler);
// Must be registered beside the thread read so it is never read as a message id.
router.get(
  '/:token/proposals',
  conversationReadLimiter,
  listConversationProposalsHandler
);
router.get(
  '/:token/proposals/:linkId',
  conversationReadLimiter,
  getConversationProposalHandler
);
router.get(
  '/:token/proposals/:linkId/pdf',
  conversationReadLimiter,
  downloadConversationProposalHandler
);
router.post(
  '/:token/messages',
  conversationWriteLimiter,
  validate(conversationMessageSchema),
  sendConversationMessageHandler
);

export default router;
