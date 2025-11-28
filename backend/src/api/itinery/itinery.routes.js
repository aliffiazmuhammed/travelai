import express from 'express';
import { generateItinerary, getUserTrips } from './itinery.controller.js';
import { protect } from '../../../middleware/auth.middleware.js';

const router = express.Router();

router.post('/generate', protect, generateItinerary);
router.get('/', protect, getUserTrips);

export default router;