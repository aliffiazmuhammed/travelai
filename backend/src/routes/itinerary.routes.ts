import { Router } from 'express';
import {
  generateItinerary,
  generateItineraryStream,
  getUserTrips,
  getDeletedTrips,
  getTripById,
  updateTrip,
  saveTripItinerary,
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
  restoreTrip,
  purgeTrip,
  duplicateTrip,
  cloneGalleryTrip,
  shareTrip,
  revokeShareTrip,
  getSharedTrip,
  updateTripPublication,
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
  sendPresenceHeartbeat,
  subscribeTripEvents,
  getTripComments,
  postTripComment,
  patchTripComment,
  deleteTripComment,
  getDiscussionReadState,
  markDiscussionRead,
  sendTypingPing,
  getTripDecisions,
  postTripCommentDecision,
  deleteTripDecision,
  getTripPolls,
  postTripPoll,
  postTripPollVote,
  postTripPollClose,
  deleteTripPoll,
  getTripChatKeys,
  putTripChatKeys,
  postTripChatEnvelopes,
  postChatAssistant,
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
import { protectPersonal, protectSession } from '../middleware/auth.middleware.js';
import { requireTripRole } from '../middleware/tripAccess.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  generateItinerarySchema,
  updateTripSchema,
  saveItinerarySchema,
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
import { createCommentSchema, updateCommentSchema } from '../schemas/comments.schema.js';
import { tripPublishSchema } from '../schemas/gallery.schema.js';
import { createPollSchema, votePollSchema } from '../schemas/polls.schema.js';
import {
  setTripChatKeysSchema,
  addChatEnvelopesSchema,
} from '../schemas/chatKey.schema.js';
import { assistantRequestSchema } from '../schemas/assistant.schema.js';
import { assistantAskLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  commentCreateLimiter,
  dayAlternativeLimiter,
  generateLimiter,
  inviteManageLimiter,
  publicShareLimiter,
  tripCloneLimiter,
  typingPingLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { handleReceiptUpload } from '../middleware/upload.middleware.js';

const router = Router();

// --- Public / non-trip-scoped endpoints (no role guard by design) -----------

// Generation Endpoints
router.post(
  '/generate',
  protectSession,
  generateLimiter,
  validate(generateItinerarySchema),
  generateItinerary
);

router.post(
  '/generate-stream',
  protectSession,
  generateLimiter,
  validate(generateItinerarySchema),
  generateItineraryStream
);

// Public Shared Trip Endpoint (No auth required). IP-limited (F11, E5).
router.get('/shared/:shareId', publicShareLimiter, getSharedTrip);

// Full CRUD Endpoints
router.get('/', protectPersonal, getUserTrips);

// Insights must be declared before the generic /:id route
router.get('/insights', protectPersonal, getTripInsights);

// M7.7: Recently deleted is a collection route, not a trip id; declare it before
// `GET /:id` so Express does not try to load a trip called "trash".
router.get('/trash', protectPersonal, getDeletedTrips);

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

router.get('/:id', protectSession, requireTripRole('viewer'), getTripById);

// Owner: rename / change status / replace itinerary content.
// E4: `baseRev` is REQUIRED here — a whole-document PUT with a stale view
// would destroy anyone's concurrent edits wholesale.
router.put(
  '/:id',
  protectSession,
  requireTripRole('owner', { withVersions: true, revMode: 'required' }),
  validate(updateTripSchema),
  updateTrip
);
router.delete('/:id', protectSession, requireTripRole('owner'), deleteTrip);

// M7.7: trash-only routes. `includeDeleted` is what lets the guard find the row;
// `onlyDeleted` keeps them from acting on a live trip.
router.post(
  '/:id/restore',
  protectSession,
  requireTripRole('owner', { includeDeleted: true, onlyDeleted: true }),
  restoreTrip
);
router.delete(
  '/:id/purge',
  protectSession,
  requireTripRole('owner', { includeDeleted: true, onlyDeleted: true }),
  purgeTrip
);

// Editor: save itinerary content only (add / delete / rename / AI Apply).
// `title` and `status` are NOT accepted here — they stay owner-only above.
// The required `baseRev` makes this conflict-safe; the controller snapshots the
// previous content so every save remains undoable.
router.put(
  '/:id/itinerary',
  protectSession,
  requireTripRole('editor', { withVersions: true, revMode: 'required' }),
  validate(saveItinerarySchema),
  saveTripItinerary
);

// Duplicating only needs read access; the copy becomes the caller's own trip.
router.post('/:id/duplicate', protectSession, requireTripRole('viewer'), duplicateTrip);

// Gallery clone (Milestone 8 G4) is personal-realm only: the source is a
// *published* trip the caller may not belong to, so there is no trip-role guard.
// Ownership is "whoever calls" — the service copies only the public projection
// and the new draft is owned by the caller. 10 clones/day/account.
router.post('/:id/clone', protectPersonal, tripCloneLimiter, cloneGalleryTrip);

router.post('/:id/share', protectSession, requireTripRole('owner'), shareTrip);
router.delete('/:id/share', protectSession, requireTripRole('owner'), revokeShareTrip);

// Gallery publish/unpublish (Milestone 8 G1) — owner-only, personal trips only
// (the service rejects agency rows before any write).
router.patch(
  '/:id/publish',
  protectSession,
  requireTripRole('owner'),
  validate(tripPublishSchema),
  updateTripPublication
);

// Granular itinerary editing endpoints (Milestone 1: Trip Management & Editing)
// E4: content mutations carry required `baseRev` so two collaborators cannot
// silently overwrite each other; id-addressed writes (expense/route) below
// stay `optional` per §3.6 — worst case is losing a concurrent edit to that
// one item.
router.put(
  '/:id/activities',
  protectSession,
  requireTripRole('editor', { withVersions: true, revMode: 'required' }),
  validate(updateActivitySchema),
  updateTripActivity
);
router.put(
  '/:id/activities/reorder',
  protectSession,
  requireTripRole('editor', { withVersions: true, revMode: 'required' }),
  validate(reorderActivitiesSchema),
  reorderActivities
);
router.put(
  '/:id/days/reorder',
  protectSession,
  requireTripRole('editor', { withVersions: true, revMode: 'required' }),
  validate(moveDaySchema),
  moveTripDay
);

// Version history endpoints
router.get(
  '/:id/versions',
  protectSession,
  requireTripRole('viewer', { withVersions: true }),
  getTripVersions
);
router.get(
  '/:id/versions/:version',
  protectSession,
  requireTripRole('viewer', { withVersions: true }),
  getTripVersionDetails
);
router.post(
  '/:id/versions/:version/restore',
  protectSession,
  requireTripRole('editor', { withVersions: true, revMode: 'required' }),
  validate(restoreVersionSchema),
  restoreTripVersion
);

// Live tier (E4): SSE stream + presence heartbeat. Declared before the
// version paths is irrelevant (distinct subpaths); both sit behind the same
// viewer guard as every other read. The SSE handler is not catchAsync — once
// stream headers are set, error responses must not be JSON.
router.post(
  '/:id/events/heartbeat',
  protectSession,
  requireTripRole('viewer'),
  sendPresenceHeartbeat
);
router.get('/:id/events', protectSession, requireTripRole('viewer'), subscribeTripEvents);

// Feedback endpoint (Milestone 2: AI prompt improvements / A-B insights)
router.post(
  '/:id/feedback',
  protectSession,
  requireTripRole('owner'),
  validate(tripFeedbackSchema),
  submitTripFeedback
);

// Expense ledger & travellers (Milestone 5: Budget & Financial)
router.get('/:id/expenses', protectSession, requireTripRole('viewer'), getTripExpenses);
router.post(
  '/:id/expenses',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(createExpenseSchema),
  addTripExpense
);
router.put(
  '/:id/expenses/:expenseId',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(updateExpenseSchema),
  updateTripExpense
);
router.delete(
  '/:id/expenses/:expenseId',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteTripExpense
);

// Receipt upload / removal (Milestone 5: Budget & Financial)
router.post(
  '/:id/expenses/:expenseId/receipt',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  handleReceiptUpload,
  uploadExpenseReceipt
);
router.delete(
  '/:id/expenses/:expenseId/receipt',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteExpenseReceipt
);

router.put(
  '/:id/participants',
  protectSession,
  requireTripRole('editor', { revMode: 'required' }),
  validate(participantsSchema),
  updateTripParticipants
);

// Currency & rates (Milestone 5: Budget & Financial)
router.put(
  '/:id/finance',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(financeUpdateSchema),
  updateTripFinance
);

// Weather-aware day alternative (Milestone 4: Map & Geo)
router.post(
  '/:id/days/:day/indoor-alternative',
  protectSession,
  requireTripRole('editor'),
  dayAlternativeLimiter,
  suggestDayAlternative
);

// Weather-aware routing analysis (Milestone 4: Map & Geo)
router.get('/:id/weather-routing', protectSession, requireTripRole('viewer'), getWeatherRouting);

// User-drawn custom routes (Milestone 4: Map & Geo)
router.post(
  '/:id/routes',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(createRouteSchema),
  addTripRoute
);
router.put(
  '/:id/routes/:routeId',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  validate(updateRouteSchema),
  updateTripRoute
);
router.delete(
  '/:id/routes/:routeId',
  protectSession,
  requireTripRole('editor', { revMode: 'optional' }),
  deleteTripRoute
);

// --- Collaboration (Milestone 6, sprint E2) ---------------------------------

// Members: `me` MUST be declared before `:userId`, or `DELETE /members/me`
// would be captured by the remove-member route. Covered by the router-ordering
// test in `services/collab/routerCoverage.test.ts`.
router.get('/:id/members', protectSession, requireTripRole('viewer'), listTripMembers);
router.delete('/:id/members/me', protectSession, requireTripRole('viewer'), leaveTrip);
router.patch(
  '/:id/members/:userId',
  protectSession,
  requireTripRole('owner'),
  validate(changeMemberRoleSchema),
  changeMemberRole
);
router.delete('/:id/members/:userId', protectSession, requireTripRole('owner'), removeMember);

// Ownership transfer: only owners transfer; required `baseRev` so a stale
// owner cannot clobber a concurrent members change.
router.post(
  '/:id/transfer',
  protectSession,
  requireTripRole('owner', { revMode: 'required' }),
  validate(transferOwnershipSchema),
  transferOwnership
);

// Invites — owner creates/lists/revokes.
router.post(
  '/:id/invites',
  protectSession,
  requireTripRole('owner'),
  inviteManageLimiter,
  validate(createInviteSchema),
  createTripInviteHandler
);
router.get('/:id/invites', protectSession, requireTripRole('owner'), listTripInvites);
router.delete('/:id/invites/:inviteId', protectSession, requireTripRole('owner'), revokTripInviteHandler);

// Comments (Milestone 6, sprint F6a §19). Reads are viewer-level; posting needs
// `commenter`. The PATCH/DELETE pair sits at `viewer` because authorship — not
// rank — is the rule there: an ex-editor demoted to viewer still owns their
// words, and an owner moderates anyone's. The service decides 403/404; the
// guard only guarantees the caller belongs to the trip at all.
router.get('/:id/comments', protectSession, requireTripRole('viewer'), getTripComments);
router.post(
  '/:id/comments',
  protectSession,
  requireTripRole('commenter'),
  commentCreateLimiter,
  validate(createCommentSchema),
  postTripComment
);
router.patch(
  '/:id/comments/:commentId',
  protectSession,
  requireTripRole('viewer'),
  validate(updateCommentSchema),
  patchTripComment
);
router.delete('/:id/comments/:commentId', protectSession, requireTripRole('viewer'), deleteTripComment);

// Discussion extras (Milestone 7, F8a). Read state is its own collection —
// marking read must never touch Trip.rev (§F8a). Typing is viewer-ranked like
// the rest of the live tier and entirely stateless server-side.
router.get(
  '/:id/comments/read-state',
  protectSession,
  requireTripRole('viewer'),
  getDiscussionReadState
);
router.post('/:id/comments/read', protectSession, requireTripRole('viewer'), markDiscussionRead);
router.post(
  '/:id/events/typing',
  protectSession,
  requireTripRole('viewer'),
  typingPingLimiter,
  sendTypingPing
);

// Decisions (Milestone 7, F9). Snapshot records — never on the Trip document,
// so promote/unmark can never 409 an open edit. `viewer` is the rank floor;
// the authorship rules (comment author-or-owner to promote, promoter-or-owner
// to unmark) live in the service, like comment edit/delete.
router.get('/:id/decisions', protectSession, requireTripRole('viewer'), getTripDecisions);
router.post(
  '/:id/comments/:commentId/decision',
  protectSession,
  requireTripRole('viewer'),
  postTripCommentDecision
);
router.delete(
  '/:id/decisions/:decisionId',
  protectSession,
  requireTripRole('viewer'),
  deleteTripDecision
);

// Polls (Milestone 7, F13a). Reading is `viewer`; creating and voting need
// `commenter` (participating in the conversation, exactly like posting a
// message); close/remove sit at `viewer` because creator-or-owner is the rule,
// not rank — the service decides 403/404. The sealed payload is opaque to the
// server; the routes validate shape and size only.
router.get('/:id/polls', protectSession, requireTripRole('viewer'), getTripPolls);
router.post(
  '/:id/polls',
  protectSession,
  requireTripRole('commenter'),
  validate(createPollSchema),
  postTripPoll
);
router.post(
  '/:id/polls/:pollId/votes',
  protectSession,
  requireTripRole('commenter'),
  validate(votePollSchema),
  postTripPollVote
);
router.post('/:id/polls/:pollId/close', protectSession, requireTripRole('viewer'), postTripPollClose);
router.delete('/:id/polls/:pollId', protectSession, requireTripRole('viewer'), deleteTripPoll);

// Chat keys (Milestone 7, F10) — the blind-carrier plumbing of end-to-end
// chat. All three routes sit at the `viewer` floor like the live tier: the
// server stores nothing it can read, so key *distribution* is membership +
// shape, enforced by the service (envelope recipients must be current
// members; epochs may only go forward).
router.get('/:id/chat/keys', protectSession, requireTripRole('viewer'), getTripChatKeys);
router.put('/:id/chat/keys', protectSession, requireTripRole('viewer'), validate(setTripChatKeysSchema), putTripChatKeys);
router.post(
  '/:id/chat/envelopes',
  protectSession,
  requireTripRole('viewer'),
  validate(addChatEnvelopesSchema),
  postTripChatEnvelopes
);

// @TravelAI asks (Milestone 7, F12a) — viewer floor, burst-limited (5/min);
// the daily budget + mention gate live in the service. Same "never touches
// Trip.rev" rule as the rest of the live tier.
router.post(
  '/:id/chat/assistant',
  protectSession,
  requireTripRole('viewer'),
  assistantAskLimiter,
  validate(assistantRequestSchema),
  postChatAssistant
);

export default router;
