import { Router } from 'express';
import { computeTripRoute, getCurrencyRates } from '../controllers/geo.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { computeRouteSchema } from '../schemas/geo.schema.js';

const router = Router();

// Geo / distance endpoints (Milestone 4: Map & Geo)
router.post('/route', protect, validate(computeRouteSchema), computeTripRoute);

// Currency conversion endpoint (Milestone 5: Budget & Financial)
router.get('/currency/rates', protect, getCurrencyRates);

export default router;
