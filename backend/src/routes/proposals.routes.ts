import { Router } from 'express';
import {
  downloadMyProposalHandler,
  getMyProposalHandler,
  listMyProposalsHandler,
} from '../controllers/conversations.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';

/**
 * A traveller's proposal comparison (Milestone 9 D8), mounted at `/api/proposals`.
 *
 * Personal-realm only: a proposal answers one of the signed-in account's own
 * enquiries. The proposal token never leaves the agency's link, so the page
 * resolves each row by id and the service proves ownership through the
 * enquiry → client → quote chain.
 */
const router = Router();

router.get('/', protectPersonal, listMyProposalsHandler);
router.get('/:linkId', protectPersonal, getMyProposalHandler);
router.get('/:linkId/pdf', protectPersonal, downloadMyProposalHandler);

export default router;
