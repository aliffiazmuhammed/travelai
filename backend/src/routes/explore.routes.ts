import { Router } from 'express';
import { getExplore, getGalleryTrip } from '../controllers/explore.controller.js';
import { publicGalleryLimiter } from '../middleware/rateLimiter.middleware.js';

/**
 * Anonymous public gallery (Milestone 8 G3). Like the traveler profile routes,
 * this is deliberately outside both realm guards: there is no session to
 * resolve and no trip role to check. The listing payload is a projection, and
 * the IP brake bounds cursor walking and search scraping.
 */
const router = Router();

router.get('/', publicGalleryLimiter, getExplore);
router.get('/:tripId', publicGalleryLimiter, getGalleryTrip);

export default router;
