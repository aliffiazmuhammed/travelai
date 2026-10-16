import { Router } from 'express';
import {
  generateItinerary,
  generateItineraryStream,
  getUserTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  duplicateTrip,
  shareTrip,
  getSharedTrip,
} from '../controllers/itinerary.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  generateItinerarySchema,
  updateTripSchema,
} from '../schemas/itinerary.schema.js';
import { generateLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Generation Endpoints
router.post(
  '/generate',
  protect,
  generateLimiter,
  validate(generateItinerarySchema),
  generateItinerary
);

router.post(
  '/generate-stream',
  protect,
  generateLimiter,
  validate(generateItinerarySchema),
  generateItineraryStream
);

// Public Shared Trip Endpoint (No auth required)
router.get('/shared/:shareId', getSharedTrip);

// Full CRUD Endpoints
router.get('/', protect, getUserTrips);
router.get('/:id', protect, getTripById);
router.put('/:id', protect, validate(updateTripSchema), updateTrip);
router.delete('/:id', protect, deleteTrip);
router.post('/:id/duplicate', protect, duplicateTrip);
router.post('/:id/share', protect, shareTrip);

export default router;
