import { Request, Response } from 'express';
import TripInvite from '../models/TripInvite.js';
import User from '../models/User.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import { tripContext } from '../middleware/tripAccess.middleware.js';
import type { TripRole } from '../services/collab/access.js';
import {
  createTripInvite,
  projectInvite,
  previewInvite,
  redeemInvite,
  revokeTripInvite,
} from '../services/collab/invites.js';
import {
  assertLeave,
  assertMemberRemoval,
  assertRoleChange,
  linkParticipant,
  performTransfer,
  projectMembers,
  resolveTransfer,
  unlinkParticipant,
} from '../services/collab/members.js';

/**
 * Collaboration endpoints (Milestone 6, sprint E2).
 *
 * Trip-scoped handlers below are mounted behind `requireTripRole` — they
 * consume `req.trip`/`req.tripRole` exactly like the other controllers. The
 * token routes (`/api/invites`) are authenticated but token-identified, so
 * they never go through the trip guard; the invite lookup IS the
 * authorization there.
 */

/* -------------------------------------------------------------------------- */
/*  Members (trip-scoped)                                                      */
/* -------------------------------------------------------------------------- */

/** GET /api/itinerary/:id/members */
export const listTripMembers = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const members = await projectMembers(trip, String(req.userId), role);
    res.status(200).json({ success: true, members });
  }
);

/** DELETE /api/itinerary/:id/members/me — declared BEFORE /members/:userId */
export const leaveTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const userId = String(req.userId);

    assertLeave(trip, userId);

    const index = (trip.members as any[]).findIndex(
      (member) => String(member?.userId) === userId
    );
    if (index === -1) {
      // Not a member at all is a 404, consistent with the rest of the router.
      throw new AppError('Trip not found', 404);
    }
    (trip.members as any[]).splice(index, 1);
    trip.markModified('members');
    unlinkParticipant(trip, userId);
    await trip.save();

    res.status(200).json({ success: true, message: 'You have left this trip.' });
  }
);

/** PATCH /api/itinerary/:id/members/:userId */
export const changeMemberRole = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const targetUserId = String(req.params.userId);
    const nextRole = req.body.role as TripRole;

    assertRoleChange(trip, targetUserId, nextRole);

    const member = (trip.members as any[]).find(
      (entry) => String(entry?.userId) === targetUserId
    );
    member.role = nextRole;
    trip.markModified('members');
    await trip.save();

    res.status(200).json({
      success: true,
      members: await projectMembers(trip, String(req.userId), 'owner'),
    });
  }
);

/** DELETE /api/itinerary/:id/members/:userId */
export const removeMember = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const targetUserId = String(req.params.userId);
    assertMemberRemoval(trip, targetUserId);

    const index = (trip.members as any[]).findIndex(
      (member) => String(member?.userId) === targetUserId
    );
    (trip.members as any[]).splice(index, 1);
    trip.markModified('members');
    unlinkParticipant(trip, targetUserId);
    await trip.save();

    res.status(200).json({
      success: true,
      members: await projectMembers(trip, String(req.userId), 'owner'),
    });
  }
);

/** POST /api/itinerary/:id/transfer — promote first, then demote, then re-read. */
export const transferOwnership = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const fromUserId = String(req.userId);
    const toUserId = String(req.body?.toUserId || '');

    resolveTransfer(trip, { trip, fromUserId, toUserId });
    const fresh = await performTransfer(trip, fromUserId, toUserId);

    res.status(200).json({
      success: true,
      message: 'Ownership transferred.',
      members: await projectMembers(fresh ?? trip, fromUserId, 'owner'),
    });
  }
);

/* -------------------------------------------------------------------------- */
/*  Invites (trip-scoped)                                                      */
/* -------------------------------------------------------------------------- */

/** POST /api/itinerary/:id/invites */
export const createTripInviteHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const membersCount = (trip.members || []).length;

    // An owner who already sits in `members[]` counts toward the cap.
    if (membersCount >= 25) {
      throw new AppError('This trip has reached its collaborator limit.', 409);
    }

    const { invite, link } = await createTripInvite({
      tripId: String(trip._id),
      createdBy: String(req.userId),
      role: req.body?.role,
      kind: req.body?.kind,
      email: req.body?.email,
      maxUses: req.body?.maxUses,
      ttlHours: req.body?.ttlHours,
    });

    res.status(201).json({ success: true, invite: projectInvite(invite), link });
  }
);

/** GET /api/itinerary/:id/invites — hints only; raw tokens never come back. */
export const listTripInvites = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const invites = await TripInvite.find({ tripId: trip._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      invites: invites.map((invite) => projectInvite(invite)),
    });
  }
);

/** DELETE /api/itinerary/:id/invites/:inviteId */
export const revokTripInviteHandler = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const invite = await revokeTripInvite(String(trip._id), String(req.params.inviteId));
    res.status(200).json({ success: true, invite: projectInvite(invite) });
  }
);

/* -------------------------------------------------------------------------- */
/*  Invites (token-identified, mounted at /api/invites)                        */
/* -------------------------------------------------------------------------- */

/** GET /api/invites/:token — preview without consuming anything. */
export const getInvitePreview = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findOne({ _id: req.userId }).select('email');
    const preview = await previewInvite(String(req.params.token), String(user?.email || ''));
    res.status(200).json({ success: true, ...preview });
  }
);

/** POST /api/invites/:token/accept — join (idempotent for existing members). */
export const acceptInvite = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findOne({ _id: req.userId }).select('email');
    const result = await redeemInvite(String(req.params.token), {
      id: String(req.userId),
      email: String(user?.email || ''),
    });

    // Link the ledger participant when names align (§3.9) — best effort only.
    const linked = linkParticipant(result.trip, String(req.userId), user?.email);
    if (linked) await result.trip.save();

    res.status(200).json({
      success: true,
      role: result.role,
      alreadyMember: result.alreadyMember,
      tripId: String((result.trip as any)._id),
      trip: { title: (result.trip as any).title, rev: (result.trip as any).rev },
      message: result.alreadyMember
        ? 'You are already part of this trip.'
        : `Welcome aboard — you joined as ${result.role}.`,
    });
  }
);

