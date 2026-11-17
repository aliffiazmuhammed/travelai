import { apiRequest, type RequestOptions } from './client';

/** Pin account-sensitive work: a queued request must never pick up the next login. */
function sessionOptions(sessionToken?: string): RequestOptions {
  return sessionToken === undefined
    ? {}
    : { auth: false, handleUnauthorized: false, headers: { Authorization: `Bearer ${sessionToken}` } };
}

/**
 * The trip discussion, mirrored from `backend/src/services/collab/*`.
 *
 * Bodies arrive as ciphertext when `e2ee` is set — the server never reads them.
 * This module only moves bytes; `useDiscussionCrypto` turns them into words.
 */

export interface DiscussionComment {
  _id: string;
  tripId: string;
  label: string;
  avatarUrl?: string;
  body: string;
  e2ee?: boolean;
  bot?: boolean;
  day?: number;
  isYou: boolean;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
}

export interface CommentPage {
  comments: DiscussionComment[];
  nextCursor: string | null;
  dayCounts: Record<string, number>;
}

export interface DiscussionReadState {
  lastReadAt: string;
  unread: number;
}

export interface TripDecision {
  _id: string;
  tripId: string;
  commentId: string;
  label: string;
  markedByLabel: string;
  body: string;
  e2ee?: boolean;
  day?: number;
  isYou: boolean;
  createdAt: string;
  deletedAt?: string;
}

export interface PollVote {
  userId: string;
  label: string;
  choice: string;
  at: string;
}

export interface TripPoll {
  _id: string;
  tripId: string;
  createdBy: string;
  createdByLabel: string;
  isYou: boolean;
  body: string;
  e2ee: boolean;
  votes: PollVote[];
  createdAt: string;
  closedAt?: string;
  deletedAt?: string;
}

export interface ChatKeySlot {
  pub: string;
  wrapper: string | null;
  wrapperPub: string | null;
}

export interface ChatKeyMember {
  userId: string;
  label: string;
  pubKey?: string;
  pubKeys: string[];
  envelopedPubKeys: string[];
  slots: ChatKeySlot[];
  hasEnvelope: boolean;
}

export interface ChatKeysState {
  epoch?: number;
  mine?: string;
  mineAll?: string[];
  members: ChatKeyMember[];
}

export interface CommentInput {
  body: string;
  day?: number;
  e2ee?: boolean;
}

function tripPath(tripId: string, suffix: string): string {
  return `/itinerary/${encodeURIComponent(tripId)}${suffix}`;
}

/* Comments ----------------------------------------------------------------- */

export function fetchComments(
  tripId: string,
  options: { before?: string | null; limit?: number } = {}
): Promise<CommentPage> {
  const query: string[] = [];
  if (options.limit) query.push(`limit=${options.limit}`);
  if (options.before) query.push(`before=${encodeURIComponent(options.before)}`);
  const suffix = `/comments${query.length ? `?${query.join('&')}` : ''}`;
  return apiRequest<{ success: true } & CommentPage>(tripPath(tripId, suffix));
}

export async function postComment(
  tripId: string,
  input: CommentInput,
  sessionToken?: string
): Promise<DiscussionComment> {
  const response = await apiRequest<{ success: true; comment: DiscussionComment }>(
    tripPath(tripId, '/comments'),
    { ...sessionOptions(sessionToken), method: 'POST', body: input }
  );
  return response.comment;
}

export async function editComment(
  tripId: string,
  commentId: string,
  input: CommentInput,
  sessionToken?: string
): Promise<DiscussionComment> {
  const response = await apiRequest<{ success: true; comment: DiscussionComment }>(
    tripPath(tripId, `/comments/${encodeURIComponent(commentId)}`),
    { ...sessionOptions(sessionToken), method: 'PATCH', body: input }
  );
  return response.comment;
}

export async function removeComment(
  tripId: string,
  commentId: string,
  sessionToken?: string
): Promise<DiscussionComment> {
  const response = await apiRequest<{ success: true; comment: DiscussionComment }>(
    tripPath(tripId, `/comments/${encodeURIComponent(commentId)}`),
    { ...sessionOptions(sessionToken), method: 'DELETE' }
  );
  return response.comment;
}

/* Read markers ------------------------------------------------------------- */

export function fetchReadState(tripId: string): Promise<DiscussionReadState> {
  return apiRequest<{ success: true } & DiscussionReadState>(
    tripPath(tripId, '/comments/read-state')
  );
}

export function markDiscussionRead(tripId: string, sessionToken?: string): Promise<DiscussionReadState> {
  return apiRequest<{ success: true } & DiscussionReadState>(tripPath(tripId, '/comments/read'), {
    ...sessionOptions(sessionToken),
    method: 'POST',
  });
}

/* Decisions ---------------------------------------------------------------- */

export async function fetchDecisions(tripId: string): Promise<TripDecision[]> {
  const response = await apiRequest<{ success: true; decisions: TripDecision[] }>(
    tripPath(tripId, '/decisions')
  );
  return response.decisions;
}

export async function promoteDecision(
  tripId: string,
  commentId: string,
  sessionToken?: string
): Promise<TripDecision> {
  const response = await apiRequest<{ success: true; decision: TripDecision }>(
    tripPath(tripId, `/comments/${encodeURIComponent(commentId)}/decision`),
    { ...sessionOptions(sessionToken), method: 'POST' }
  );
  return response.decision;
}

export async function removeDecision(
  tripId: string,
  decisionId: string,
  sessionToken?: string
): Promise<TripDecision> {
  const response = await apiRequest<{ success: true; decision: TripDecision }>(
    tripPath(tripId, `/decisions/${encodeURIComponent(decisionId)}`),
    { ...sessionOptions(sessionToken), method: 'DELETE' }
  );
  return response.decision;
}

/* Polls -------------------------------------------------------------------- */

export async function fetchPolls(tripId: string): Promise<TripPoll[]> {
  const response = await apiRequest<{ success: true; polls: TripPoll[] }>(
    tripPath(tripId, '/polls')
  );
  return response.polls;
}

/** `body` is the sealed `{ q, o[] }` payload — this client can read it, the server cannot. */
export async function createPoll(tripId: string, body: string, sessionToken?: string): Promise<TripPoll> {
  const response = await apiRequest<{ success: true; poll: TripPoll }>(
    tripPath(tripId, '/polls'),
    { ...sessionOptions(sessionToken), method: 'POST', body: { body } }
  );
  return response.poll;
}

/** `choice` is the sealed option index. */
export async function votePoll(
  tripId: string,
  pollId: string,
  choice: string,
  sessionToken?: string
): Promise<TripPoll> {
  const response = await apiRequest<{ success: true; poll: TripPoll }>(
    tripPath(tripId, `/polls/${encodeURIComponent(pollId)}/votes`),
    { ...sessionOptions(sessionToken), method: 'POST', body: { choice } }
  );
  return response.poll;
}

export async function closePoll(tripId: string, pollId: string, sessionToken?: string): Promise<TripPoll> {
  const response = await apiRequest<{ success: true; poll: TripPoll }>(
    tripPath(tripId, `/polls/${encodeURIComponent(pollId)}/close`),
    { ...sessionOptions(sessionToken), method: 'POST' }
  );
  return response.poll;
}

export async function deletePoll(tripId: string, pollId: string, sessionToken?: string): Promise<TripPoll> {
  const response = await apiRequest<{ success: true; poll: TripPoll }>(
    tripPath(tripId, `/polls/${encodeURIComponent(pollId)}`),
    { ...sessionOptions(sessionToken), method: 'DELETE' }
  );
  return response.poll;
}

/* Chat keys (E2EE distribution) -------------------------------------------- */

export function fetchChatKeys(tripId: string, sessionToken?: string): Promise<ChatKeysState> {
  return apiRequest<{ success: true } & ChatKeysState>(
    tripPath(tripId, '/chat/keys'), sessionOptions(sessionToken)
  );
}

export function putChatKeys(
  tripId: string,
  epoch: number,
  envelopes: Record<string, string>,
  sessionToken?: string
): Promise<ChatKeysState> {
  return apiRequest<{ success: true } & ChatKeysState>(tripPath(tripId, '/chat/keys'), {
    ...sessionOptions(sessionToken),
    method: 'PUT',
    body: { epoch, envelopes },
  });
}

export function addChatEnvelopes(
  tripId: string,
  expectedEpoch: number,
  envelopes: Record<string, string>,
  sessionToken?: string
): Promise<ChatKeysState> {
  return apiRequest<{ success: true } & ChatKeysState>(tripPath(tripId, '/chat/envelopes'), {
    ...sessionOptions(sessionToken),
    method: 'POST',
    body: { expectedEpoch, envelopes },
  });
}

/** Publishes this device's public half; the private half never leaves the device. */
export async function publishChatKey(pubKey: string, sessionToken?: string): Promise<void> {
  await apiRequest<{ success: true }>('/auth/chat-key', {
    ...sessionOptions(sessionToken),
    method: 'PUT',
    body: { pubKey },
  });
}
