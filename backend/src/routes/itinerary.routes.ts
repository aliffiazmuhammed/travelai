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
  listTripMembers,
  leaveTrip,
  changeMemberRole,
  removeMember,
  transferOwnership,
  createTripInviteHandler,
  listTripInvites,
  revokTripInviteHandler,
} from '../controllers/collab.controller.js';
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
import { requireTripRole } from '../middleware/tripAccess.middleware.js';
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
import {
  createInviteSchema,
  changeMemberRoleSchema,
  transferOwnershipSchema,
} from '../schemas/collab.schema.js';
import { generateLimiter, inviteManageLimiter } from '../middleware/rateLimiter.middleware.js';
import { handleReceiptUpload } from '../middleware/upload.middleware.js';

const router = Router();

// --- Public / non-trip-scoped endpoints (no role guard by design) -----------

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

// --- Trip-scoped endpoints (guarded by requireTripRole — one choke point) ---

// Every trip-scoped route below MUST carry a `requireTripRole(minimum)` guard
// (`docs/roadmap-milestone-6-collaboration.md` §3.2 + §6.3). The coverage test
// in `src/services/collab/routerCoverage.test.ts` walks this router and fails
// CI when a trip-scoped route is missing its guard — adding a route without
// one is impossible to merge, which is what keeps the choke point honest.
//
// `withVersions` mirrors the old `+versions` selects: version payloads live in
// a `select: false` field, so only the routes that read or snapshot history
// load it.

router.get('/:id', protect, requireTripRole('viewer'), getTripById);

// Owner: rename / change status / replace itinerary content
router.put(
  '/:id',
  protect,
  requireTripRole('owner', { withVersions: true, revMode: 'optional' }),
  validate(updateTripSchema),
  updateTrip
);
router.delete('/:id', protect, requireTripRole('owner'), deleteTrip);
// Duplicating only needs read access; the copy becomes the caller's own trip.
router.post('/:id/duplicate', protect, requireTripRole('viewer'), duplicateTrip);
router.post('/:id/share', protect, requireTripRole('owner'), shareTrip);

// Granular itinerary editing endpoints (Milestone 1: Trip Management & Editing)
router.put(
  '/:id/activities',
  protect,
  requireTripRole('editor', { withVersions: true, revMode: 'optional' }),
  validate(updateActivitySchema),
  updateTripActivity
);
router.put(
  '/:id/activities/reorder',
  protect,
  requireTripRole('editor', { withVersions: true, revMode: 'optional' }),
  validate(reorderActivitiesSchema),
  reorderActivities
);
router.put(
  '/:id/days/reorder',
  protect,
  requireTripRole('editor', { withVersions: true, revMode: 'optional' }),
  validate(moveDaySchema),
  moveTripDay
);

// Version history endpoints
router.get(
  '/:id/versions',
  protect,
  requireTripRole('viewer', { withVersions: true }),
  getTripVersions
);
router.get(
  '/:id/versions/:version',
  protect,
  requireTripRole('viewer', { withVersions: true }),
  getTripVersionDetails
);
router.post(
  '/:id/versions/:version/restore',
  protect,
  requireTripRole('editor', { withVersions: true, revMode: 'optional' }),
  validate(restoreVersionSchema),
  restoreTripVersion
);

// Feedback endpoint (Milestone 2: AI prompt improvements / A-B insights)
router.post(
  '/:id/feedback',
  protect,
  requireTripRole('owner'),
  validate(tripFeedbackSchema),
  submitTripFeedback
);

// Expense ledger & travellers (Milestone 5: Budget & Financial)
router.get('/:id/expenses', protect, requireTripRole('viewer'), getTripExpenses);
router.post(
  '/:id/expenses',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(createExpenseSchema),
  addTripExpense
);
router.put(
  '/:id/expenses/:expenseId',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(updateExpenseSchema),
  updateTripExpense
);
router.delete(
  '/:id/expenses/:expenseId',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteTripExpense
);

// Receipt upload / removal (Milestone 5: Budget & Financial)
router.post(
  '/:id/expenses/:expenseId/receipt',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  handleReceiptUpload,
  uploadExpenseReceipt
);
router.delete(
  '/:id/expenses/:expenseId/receipt',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteExpenseReceipt
);

router.put(
  '/:id/participants',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(participantsSchema),
  updateTripParticipants
);

// Currency & rates (Milestone 5: Budget & Financial)
router.put(
  '/:id/finance',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(financeUpdateSchema),
  updateTripFinance
);

// Weather-aware day alternative (Milestone 4: Map & Geo)
router.post(
  '/:id/days/:day/indoor-alternative',
  protect,
  requireTripRole('editor'),
  suggestDayAlternative
);

// Weather-aware routing analysis (Milestone 4: Map & Geo)
router.get('/:id/weather-routing', protect, requireTripRole('viewer'), getWeatherRouting);

// User-drawn custom routes (Milestone 4: Map & Geo)
router.post(
  '/:id/routes',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(createRouteSchema),
  addTripRoute
);
router.put(
  '/:id/routes/:routeId',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(updateRouteSchema),
  updateTripRoute
);
router.delete(
  '/:id/routes/:routeId',
  protect,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteTripRoute
);

// --- Collaboration (Milestone 6, sprint E2) ---------------------------------

// Members: `me` MUST be declared before `:userId`, or `DELETE /members/me`
// would be captured by the remove-member route. Covered by the router-ordering
// test in `services/collab/routerCoverage.test.ts`.
router.get('/:id/members', protect, requireTripRole('viewer'), listTripMembers);
router.delete('/:id/members/me', protect, requireTripRole('viewer'), leaveTrip);
router.patch(
  '/:id/members/:userId',
  protect,
  requireTripRole('owner'),
  validate(changeMemberRoleSchema),
  changeMemberRole
);
router.delete('/:id/members/:userId', protect, requireTripRole('owner'), removeMember);

// Ownership transfer: only owners transfer.
router.post(
  '/:id/transfer',
  protect,
  requireTripRole('owner', { revMode: 'optional' }),
  validate(transferOwnershipSchema),
  transferOwnership
);

// Invites — owner creates/lists/revokes.
router.post(
  '/:id/invites',
  protect,
  requireTripRole('owner'),
  inviteManageLimiter,
  validate(createInviteSchema),
  createTripInviteHandler
);
router.get('/:id/invites', protect, requireTripRole('owner'), listTripInvites);
router.delete('/:id/invites/:inviteId', protect, requireTripRole('owner'), revokTripInviteHandler);

export default router;
