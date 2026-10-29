import { Router } from 'express';
import {
  acceptMyProposalHandler,
  declineMyProposalHandler,
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
 *
 * R6 adds the two in-app answers. They reuse the token page's acceptance core,
 * so an accepted proposal wins the lead whichever surface answered it.
 */
const router = Router();

router.get('/', protectPersonal, listMyProposalsHandler);
router.get('/:linkId', protectPersonal, getMyProposalHandler);
router.get('/:linkId/pdf', protectPersonal, downloadMyProposalHandler);
router.post('/:linkId/accept', protectPersonal, acceptMyProposalHandler);
router.post('/:linkId/decline', protectPersonal, declineMyProposalHandler);

export default router;
