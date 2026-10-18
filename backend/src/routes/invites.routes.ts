import { Router } from 'express';
import { getInvitePreview, acceptInvite } from '../controllers/collab.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { invitePreviewLimiter, inviteAcceptLimiter } from '../middleware/rateLimiter.middleware.js';

/**
 * Token-identified invitation endpoints (Milestone 6 §3.4).
 *
 * Unlike trip routes, there is no `requireTripRole` guard here: the invite
 * token IS the authorization (hashed lookup + expiry + revocation checked in
 * `services/collab/invites.ts`). Ranked trip access is enforced by the trip
 * guards afterwards; these endpoints only mint the membership itself, and
 * `TripInvite.role` cannot be `owner`.
 */
const router = Router();

router.get('/:token', protect, invitePreviewLimiter, getInvitePreview);
router.post('/:token/accept', protect, inviteAcceptLimiter, acceptInvite);

export default router;
