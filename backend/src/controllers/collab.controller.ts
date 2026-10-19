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
import {
  broadcastPresence,
  emitTypingFrame,
  heartbeat,
  removePresence,
  subscribe,
} from '../services/collab/presence.js';
import {
  createTripComment,
  editTripComment,
  listTripComments,
  loadTripComment,
  removeTripComment,
} from '../services/collab/comments.js';
import { markTripRead, resolveReadState } from '../services/collab/discussion.js';
import {
  listTripDecisions,
  promoteToDecision,
  removeTripDecision,
} from '../services/collab/decisions.js';

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
/*  Comments (trip-scoped, F6a)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Comments never touch the `Trip` document (§19.2), so — unlike every other
 * trip-scoped write below — these handlers deliberately ignore `req.rev` and
 * never bump it: posting a remark must not invalidate a collaborator's open
 * edit. Rank floors live on the router; authorship rules live in the service.
 */

/** GET /api/itinerary/:id/comments — newest-first page + day counts. */
export const getTripComments = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const result = await listTripComments(
      String((trip as any)._id),
      { before: req.query.before, limit: req.query.limit },
      String(req.userId)
    );
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/itinerary/:id/comments — commenter and above. */
export const postTripComment = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const comment = await createTripComment(trip, String(req.userId), {
      body: req.body?.body,
      day: req.body?.day,
    });
    res.status(201).json({ success: true, comment });
  }
);

/** PATCH /api/itinerary/:id/comments/:commentId — author only. */
export const patchTripComment = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const row = await loadTripComment(
      String((trip as any)._id),
      String(req.params.commentId)
    );
    const comment = await editTripComment(row, String(req.userId), req.body?.body);
    res.status(200).json({ success: true, comment });
  }
);

/** DELETE /api/itinerary/:id/comments/:commentId — author or owner (soft). */
export const deleteTripComment = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const row = await loadTripComment(
      String((trip as any)._id),
      String(req.params.commentId)
    );
    const comment = await removeTripComment(row, String(req.userId), role);
    res.status(200).json({ success: true, comment });
  }
);

/* -------------------------------------------------------------------------- */
/*  Discussion extras (F8a) — read state + typing                              */
/* -------------------------------------------------------------------------- */

/** GET /:id/comments/read-state — the caller's marker + unread count. */
export const getDiscussionReadState = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const state = await resolveReadState(String((trip as any)._id), String(req.userId));
    res.status(200).json({ success: true, ...state });
  }
);

/** POST /:id/comments/read — marks the whole stream read up to now. */
export const markDiscussionRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const state = await markTripRead(String((trip as any)._id), String(req.userId));
    res.status(200).json({ success: true, ...state });
  }
);

/**
 * POST /:id/events/typing — "I'm composing" fan-out. Stateless (no server
 * storage): every open client shows the indicator and expires it itself
 * ~5s after the last frame. Deemed presence-adjacent decoration, which is
 * why it shares the viewer rank with the rest of the live tier.
 */
export const sendTypingPing = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const user = await User.findOne({ _id: req.userId }).select('email');
    emitTypingFrame(String((trip as any)._id), {
      userId: String(req.userId),
      label: (user?.email || String(req.userId)).split('@')[0] || 'Traveler',
    });
    res.status(204).end();
  }
);

/* -------------------------------------------------------------------------- */
/*  Decisions (F9) — comments promoted into durable "what we agreed" cards     */
/* -------------------------------------------------------------------------- */

/** GET /:id/decisions — every active decision, newest first. */
export const getTripDecisions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const decisions = await listTripDecisions(String((trip as any)._id), String(req.userId));
    res.status(200).json({ success: true, decisions });
  }
);

/**
 * POST /:id/comments/:commentId/decision — promote a comment into a
 * decision (a body snapshot; the thread can keep moving afterwards).
 * Rank floor is `viewer`; author-or-owner is asserted inside the service,
 * exactly like comment removal.
 */
export const postTripCommentDecision = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const comment = await loadTripComment(
      String((trip as any)._id),
      String(req.params.commentId)
    );
    const decision = await promoteToDecision(
      String((trip as any)._id),
      comment,
      String(req.userId),
      role
    );
    res.status(201).json({ success: true, decision });
  }
);

/** DELETE /:id/decisions/:decisionId — unmark (soft); promoter or owner. */
export const deleteTripDecision = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const decision = await removeTripDecision(
      String((trip as any)._id),
      String(req.params.decisionId),
      String(req.userId),
      role
    );
    res.status(200).json({ success: true, decision });
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

/* -------------------------------------------------------------------------- */
/*  Live tier (trip-scoped, E4b) — presence only, never authorization          */
/* -------------------------------------------------------------------------- */

const PRESENCE_BROADCAST_MS = 15000;
const PRESENCE_ANNOUNCE_MS = 5000;

/**
 * GET /api/itinerary/:id/events — the SSE stream.
 *
 * Mounted behind `requireTripRole('viewer')` like every read. The guard has
 * already answered with JSON on 401/403/404 by the time the stream opens, so
 * once here we may only write SSE frames. Two frame kinds per §3.7:
 * `trip:updated` (from the Trip write hooks → `presence.ts`) and `presence`
 * (the live roster). A keepalive comment every 15s keeps proxies open, and
 * the local broadcast timer covers the "same roster" state-diff.
 */
export const subscribeTripEvents = async (req: AuthenticatedRequest, res: Response) => {
  const { trip, role } = tripContext(req);
  const tripId = String((trip as any)._id);
  const userId = String(req.userId);
  const user = await User.findOne({ _id: userId }).select('email');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  const writeEvent = (event: unknown) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // The close handler cleans up; writes after close are harmless no-ops.
    }
  };

  const unsubscribe = subscribe((eventTripId, event) => {
    if (eventTripId === tripId) writeEvent(event);
  });

  // Initial presence snapshot so avatars appear immediately.
  heartbeat(tripId, {
    userId,
    label: (user?.email || userId).split('@')[0] || 'Traveler',
    role,
  });
  const announce = () => broadcastPresence(tripId);
  announce();

  // Roster broadcast timer: catches TTL expiries that no heartbeat retriggers.
  const presenceTimer = setInterval(announce, PRESENCE_ANNOUNCE_MS);
  const keepAlive = setInterval(() => res.write(':ping\n\n'), PRESENCE_BROADCAST_MS);

  const cleanup = () => {
    clearInterval(presenceTimer);
    clearInterval(keepAlive);
    unsubscribe();
    removePresence(tripId, userId);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
};

/** POST /api/itinerary/:id/events/heartbeat — refresh the caller's presence TTL. */
export const sendPresenceHeartbeat = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const user = await User.findOne({ _id: req.userId }).select('email');
    heartbeat(String((trip as any)._id), {
      userId: String(req.userId),
      label: (user?.email || String(req.userId)).split('@')[0] || 'Traveler',
      role,
    });
    broadcastPresence(String((trip as any)._id));
    res.status(204).end();
  }
);

