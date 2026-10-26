import { Router } from 'express';
import {
  computeTripRoute,
  getCurrencyRates,
  getNearby,
  getWeather,
} from '../controllers/geo.controller.js';
import { protectSession } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { computeRouteSchema } from '../schemas/geo.schema.js';

const router = Router();

// Geo / distance endpoints (Milestone 4: Map & Geo)
router.post('/route', protectSession, validate(computeRouteSchema), computeTripRoute);

// Weather advisories + nearby search (Milestone 4: Map & Geo)
router.get('/weather', protectSession, getWeather);
router.get('/nearby', protectSession, getNearby);

// Currency conversion endpoint (Milestone 5: Budget & Financial)
router.get('/currency/rates', protectSession, getCurrencyRates);

export default router;
