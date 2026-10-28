import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { tripContext } from '../middleware/tripAccess.middleware.js';
import {
  approveJoinRequest,
  blockFromJoinRequest,
  declineJoinRequest,
  getJoinRequestState,
  listJoinRequests,
  requestToJoin,
  withdrawJoinRequest,
} from '../services/gallery/joinRequests.js';

/**
 * Join requests (Milestone 8 G5).
 *
 * The requester handlers (`/join-request`) intentionally do **not** run
 * `requireTripRole`: the caller is a stranger asking to join a *published*
 * trip, so trip membership is exactly what they do not have yet. Their
 * authorization is the public-trip filter plus the service's block/membership
 * checks. The owner handlers (`/join-requests`) sit behind
 * `requireTripRole('owner')` on the router, like every other management route.
 */

/** POST /api/itinerary/:id/join-request — ask the owner. */
export const postJoinRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const request = await requestToJoin(
      String(req.params.id),
      String(req.userId),
      req.body?.message
    );
    res.status(201).json({ success: true, request });
  }
);

/** GET /api/itinerary/:id/join-request — my latest request + join state. */
export const getJoinRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const state = await getJoinRequestState(
      String(req.params.id),
      String(req.userId)
    );
    res.status(200).json({ success: true, ...state });
  }
);

/** DELETE /api/itinerary/:id/join-request — requester withdraws while pending. */
export const deleteJoinRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const request = await withdrawJoinRequest(
      String(req.params.id),
      String(req.userId)
    );
    res.status(200).json({ success: true, request });
  }
);

/** GET /api/itinerary/:id/join-requests — owner queue (owner guard). */
export const getJoinRequests = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const requests = await listJoinRequests(trip);
    res.status(200).json({ success: true, requests });
  }
);

/** POST /api/itinerary/:id/join-requests/:requestId/approve — commenter only. */
export const postApproveJoinRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const request = await approveJoinRequest(
      trip,
      String(req.params.requestId),
      String(req.userId)
    );
    res.status(200).json({ success: true, request });
  }
);

/** POST /api/itinerary/:id/join-requests/:requestId/decline — silent. */
export const postDeclineJoinRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const request = await declineJoinRequest(
      trip,
      String(req.params.requestId),
      String(req.userId)
    );
    res.status(200).json({ success: true, request });
  }
);

/** POST /api/itinerary/:id/join-requests/:requestId/block — block + decline. */
export const postBlockJoinRequester = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const block = await blockFromJoinRequest(
      trip,
      String(req.params.requestId),
      String(req.userId)
    );
    res.status(200).json({ success: true, block });
  }
);
