import { Router } from 'express';
import { listMyEnquiriesHandler } from '../controllers/enquiries.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';

/**
 * A traveller's own enquiry history (Milestone 9 D5), mounted at `/api/enquiries`.
 *
 * Read-only and personal-realm only: an enquiry is attributed to the account
 * that sent it, so the agency realm (or a platform operator) must not be able to
 * list a consumer's contacts through this surface. The submission itself is
 * public and lives on `/api/agencies/:slug/enquiries`.
 */
const router = Router();

router.get('/', protectPersonal, listMyEnquiriesHandler);

export default router;
