import { Router } from 'express';
import {
  generateItinerary,
  generateItineraryStream,
  getUserTrips,
  getTripById,
  updateTrip,
  updateTripActivity,
  reorderActivities,
  moveTripDay,
  getTripVersions,
  getTripVersionDetails,
  restoreTripVersion,
  submitTripFeedback,
  getTripInsights,
  suggestDayAlternative,
  getWeatherRouting,
  deleteTrip,
  duplicateTrip,
  shareTrip,
  getSharedTrip,
} from '../controllers/itinerary.controller.js';
import {
  getTripExpenses,
  addTripExpense,
  updateTripExpense,
  deleteTripExpense,
  updateTripParticipants,
  updateTripFinance,
  uploadExpenseReceipt,
  deleteExpenseReceipt,
} from '../controllers/expense.controller.js';
import {
  addTripRoute,
  updateTripRoute,
  deleteTripRoute,
} from '../controllers/route.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  generateItinerarySchema,
  updateTripSchema,
  updateActivitySchema,
  reorderActivitiesSchema,
  moveDaySchema,
  restoreVersionSchema,
  tripFeedbackSchema,
} from '../schemas/itinerary.schema.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  participantsSchema,
  financeUpdateSchema,
} from '../schemas/expense.schema.js';
import { createRouteSchema, updateRouteSchema } from '../schemas/route.schema.js';
import { generateLimiter } from '../middleware/rateLimiter.middleware.js';
import { handleReceiptUpload } from '../middleware/upload.middleware.js';

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

// Insights must be declared before the generic /:id route
router.get('/insights', protect, getTripInsights);

router.get('/:id', protect, getTripById);
router.put('/:id', protect, validate(updateTripSchema), updateTrip);
router.delete('/:id', protect, deleteTrip);
router.post('/:id/duplicate', protect, duplicateTrip);
router.post('/:id/share', protect, shareTrip);

// Granular itinerary editing endpoints (Milestone 1: Trip Management & Editing)
router.put(
  '/:id/activities',
  protect,
  validate(updateActivitySchema),
  updateTripActivity
);
router.put(
  '/:id/activities/reorder',
  protect,
  validate(reorderActivitiesSchema),
  reorderActivities
);
router.put('/:id/days/reorder', protect, validate(moveDaySchema), moveTripDay);

// Version history endpoints
router.get('/:id/versions', protect, getTripVersions);
router.get('/:id/versions/:version', protect, getTripVersionDetails);
router.post(
  '/:id/versions/:version/restore',
  protect,
  validate(restoreVersionSchema),
  restoreTripVersion
);

// Feedback endpoint (Milestone 2: AI prompt improvements / A-B insights)
router.post(
  '/:id/feedback',
  protect,
  validate(tripFeedbackSchema),
  submitTripFeedback
);

// Expense ledger & travellers (Milestone 5: Budget & Financial)
router.get('/:id/expenses', protect, getTripExpenses);
router.post('/:id/expenses', protect, validate(createExpenseSchema), addTripExpense);
router.put(
  '/:id/expenses/:expenseId',
  protect,
  validate(updateExpenseSchema),
  updateTripExpense
);
router.delete('/:id/expenses/:expenseId', protect, deleteTripExpense);

// Receipt upload / removal (Milestone 5: Budget & Financial)
router.post(
  '/:id/expenses/:expenseId/receipt',
  protect,
  handleReceiptUpload,
  uploadExpenseReceipt
);
router.delete('/:id/expenses/:expenseId/receipt', protect, deleteExpenseReceipt);

router.put(
  '/:id/participants',
  protect,
  validate(participantsSchema),
  updateTripParticipants
);

// Currency & rates (Milestone 5: Budget & Financial)
router.put('/:id/finance', protect, validate(financeUpdateSchema), updateTripFinance);

// Weather-aware day alternative (Milestone 4: Map & Geo)
router.post('/:id/days/:day/indoor-alternative', protect, suggestDayAlternative);

// Weather-aware routing analysis (Milestone 4: Map & Geo)
router.get('/:id/weather-routing', protect, getWeatherRouting);

// User-drawn custom routes (Milestone 4: Map & Geo)
router.post('/:id/routes', protect, validate(createRouteSchema), addTripRoute);
router.put('/:id/routes/:routeId', protect, validate(updateRouteSchema), updateTripRoute);
router.delete('/:id/routes/:routeId', protect, deleteTripRoute);

export default router;
