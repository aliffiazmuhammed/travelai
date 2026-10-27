import { Router } from 'express';
import { getTravelerProfile } from '../controllers/travelers.controller.js';
import { publicTravelerLimiter } from '../middleware/rateLimiter.middleware.js';

/**
 * Anonymous gallery profile. No realm guard by design — the handle is public
 * and the payload is a projection — but every read is IP-rate-limited because
 * handles are guessable.
 */
const router = Router();

router.get('/:handle', publicTravelerLimiter, getTravelerProfile);

export default router;
