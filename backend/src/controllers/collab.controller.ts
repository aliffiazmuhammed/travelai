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
  linkOriginHints,
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
  userLabel,
} from '../services/collab/comments.js';
import { markTripRead, resolveReadState } from '../services/collab/discussion.js';
import {
  listTripDecisions,
  promoteToDecision,
  removeTripDecision,
} from '../services/collab/decisions.js';
import {
  closeTripPoll,
  createTripPoll,
  listTripPolls,
  removeTripPoll,
  voteTripPoll,
} from '../services/collab/polls.js';
import {
  getTripChatKeyState,
  setTripChatKeys,
  addTripChatEnvelopes,
} from '../services/collab/chatKeys.js';
import { answerTravelAI } from '../services/collab/assistant.js';

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

    // Agency trips are owned by the tenant, not transferable to a client.
    if (trip.workspace === 'agency') {
      throw new AppError(
        'Agency trip ownership stays with the agency team. Manage client access with invitations instead.',
        400
      );
    }

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
      // Build the invite link from the origin the owner's browser is on, so a
      // Render deployment without `FRONTEND_URL` never hands out localhost.
      linkOrigins: linkOriginHints(req),
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
      e2ee: req.body?.e2ee,
      bot: req.body?.bot,
    });    res.status(201).json({ success: true, comment });
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
    const comment = await editTripComment(
      row,
      String(req.userId),
      req.body?.body,
      req.body?.e2ee
    );
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
    const user = await User.findOne({ _id: req.userId }).select('email name');
    emitTypingFrame(String((trip as any)._id), {
      userId: String(req.userId),
      label: userLabel(user),
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
/*  Polls (F13a) — sealed questions/votes, tallied on members' devices          */
/* -------------------------------------------------------------------------- */

/** GET /:id/polls — active polls (closed included), newest first. */
export const getTripPolls = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const polls = await listTripPolls(String((trip as any)._id), String(req.userId));
    res.status(200).json({ success: true, polls });
  }
);

/**
 * POST /:id/polls — start a poll. `body` is the sealed `{ q, o[] }` payload
 * produced by the caller's browser; this route and the service never see the
 * question or the options, only their shape.
 */
export const postTripPoll = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const poll = await createTripPoll(
      String((trip as any)._id),
      String(req.userId),
      req.body?.body
    );
    res.status(201).json({ success: true, poll });
  }
);

/**
 * POST /:id/polls/:pollId/votes — cast or change this member's vote. The
 * sealed `choice` is stored as-is; one row per member, replaced on a change.
 */
export const postTripPollVote = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const poll = await voteTripPoll(
      String((trip as any)._id),
      String(req.params.pollId),
      String(req.userId),
      req.body?.choice
    );
    res.status(200).json({ success: true, poll });
  }
);

/** POST /:id/polls/:pollId/close — stop voting (creator or owner). */
export const postTripPollClose = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const poll = await closeTripPoll(
      String((trip as any)._id),
      String(req.params.pollId),
      String(req.userId),
      role
    );
    res.status(200).json({ success: true, poll });
  }
);

/** DELETE /:id/polls/:pollId — remove (soft); creator or owner. */
export const deleteTripPoll = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const poll = await removeTripPoll(
      String((trip as any)._id),
      String(req.params.pollId),
      String(req.userId),
      role
    );
    res.status(200).json({ success: true, poll });
  }
);

/* -------------------------------------------------------------------------- */
/*  Chat keys (F10) — blind-carrier key distribution for end-to-end chat       */
/* -------------------------------------------------------------------------- */

/**
 * GET /:id/chat/keys — the current epoch, the caller's envelope (if any),
 * and per-member public keys + envelope coverage. `viewer` floor like the
 * rest of the live tier: reading key material is conditionally harmless,
 * since envelopes only unwrap to their intended recipient.
 */
export const getTripChatKeys = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const state = await getTripChatKeyState(trip, String(req.userId));
    res.status(200).json({ success: true, ...state });
  }
);

/**
 * PUT /:id/chat/keys — bootstrap (epoch 1, no doc yet) or rotate (higher
 * epoch). Any current member may wire keys (the self-healing F10 design);
 * the envelope targets are asserted against the member list, and the
 * unique (tripId, epoch) index arbitrates bootstrap races with a 409.
 */
export const putTripChatKeys = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const state = await setTripChatKeys(trip, String(req.userId), {
      epoch: req.body?.epoch,
      envelopes: req.body?.envelopes,
    });
    res.status(200).json({ success: true, ...state });
  }
);

/**
 * POST /:id/chat/envelopes — self-healing distribution into the CURRENT
 * epoch: a member who holds the conversation key wraps it for everybody
 * missing an envelope (fresh invitees get full history this way).
 */
export const postTripChatEnvelopes = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const state = await addTripChatEnvelopes(trip, String(req.userId), req.body?.envelopes);
    res.status(200).json({ success: true, ...state });
  }
);

/**
 * POST /:id/chat/assistant — one @TravelAI ask (F12a).
 *
 * The client-fed grounding is the F10 story: the asker's browser ships the
 * decrypted recent messages it wants grounded; the server adds the trip
 * document (which it owns) and calls the provider. The PLAINTEXT answer comes
 * back ONLY HERE — the client encrypts it with the trip conversation key and
 * posts it as a `bot: true` comment through the normal endpoint, so what gets
 * stored and broadcast is ciphertext, same as every other row.
 *
 * Deliberately ignores `req.rev` and bumps nothing (same rule as comments):
 * an assistant answer must never invalidate a collaborator's open edit.
 */
export const postChatAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);
    const result = await answerTravelAI(trip, String(req.userId), {
      prompt: req.body?.prompt,
      contextItems: req.body?.context,
      dayAnchor: req.body?.day,
    });
    // Hygiene: the prompt/context are never logged anywhere in this handler.
    res.status(200).json({ success: true, ...result });
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
  const user = await User.findOne({ _id: userId }).select('email name avatarUrl');

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
    label: userLabel(user),
    ...(user?.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
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
    const user = await User.findOne({ _id: req.userId }).select('email name avatarUrl');
    heartbeat(String((trip as any)._id), {
      userId: String(req.userId),
      label: userLabel(user),
      ...(user?.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      role,
    });
    broadcastPresence(String((trip as any)._id));
    res.status(204).end();
  }
);

