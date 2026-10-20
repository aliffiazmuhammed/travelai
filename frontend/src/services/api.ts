import { API_BASE_URL } from '@/config';
import type {
  Trip,
  TripInput,
  User,
  ItineraryData,
  TripVersionsResponse,
  TripVersionDetails,
  TripFeedback,
  TripInsights,
  ActivityItem,
  RouteResult,
  RouteInput,
  CurrencyRateSnapshot,
  ExpenseInput,
  TripExpense,
  TripParticipant,
  TripFinance,
  WeatherResponse,
  NearbyCategory,
  NearbyResponse,
  DayAlternative,
  WeatherRoutingResponse,
  TripRole,
  TripMember,
  TripInviteInfo,
  InvitePreview,
  TripComment,
  TripDecision,
  TripPoll,
  ChatKeysState,
  AssistantProposal,
} from '@/types';

export interface StreamProgressEvent {
  stage: number;
  progress: number;
  message: string;
}

/**
 * An error that keeps the server's status and structured fields around.
 * Milestone 6 uses `code === 'REV_CONFLICT'` for the optimistic-concurrency
 * flow (`docs/roadmap-milestone-6-collaboration.md` §3.6).
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  /** The server-side rev at conflict time — safe to resume from after reload. */
  currentRev?: number;

  constructor(message: string, status: number, code?: string, currentRev?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.currentRev = currentRev;
  }
}

class ApiClient {
  private baseUrl: string;

  /** CSRF token held in memory (never in localStorage — see csrf.middleware). */
  private csrfToken: string | null = null;

  /**
   * E4 — the last `rev` observed per trip, from any trip-shaped payload. The
   * rev-requiring mutations send it as `baseRev`; a 409 REV_CONFLICT means
   * someone else wrote first and the UI offers "Reload latest".
   */
  private tripRevs = new Map<string, number>();

  /** Records a fresher rev from any trip-shaped payload (`_id` + `rev`). */
  private noteRev(payload: any): void {
    if (Array.isArray(payload)) {
      payload.forEach((item) => this.noteRev(item));
      return;
    }
    const trip = payload?.trip;
    const id = payload?._id ?? trip?._id;
    const rev =
      typeof payload?.rev === 'number' ? payload.rev : typeof trip?.rev === 'number' ? trip.rev : undefined;
    if (id && typeof rev === 'number') {
      this.tripRevs.set(String(id), rev);
    }
  }

  /** Injects the client's best-known `baseRev` into a mutation body (E4). */
  private withBaseRev(tripId: string, body?: Record<string, unknown>): string {
    const rev = this.tripRevs.get(String(tripId));
    return JSON.stringify({ ...(body ?? {}), baseRev: rev });
  }

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Ensures a CSRF token is available for state-changing requests (backend
   * double-submit defense). The token comes from `GET /api/auth/csrf`, which
   * works cross-origin because the response body is CORS-protected.
   */
  private async ensureCsrf(): Promise<string | null> {
    if (this.csrfToken) return this.csrfToken;

    // Same-origin deployments can read the `csrf` cookie directly.
    try {
      const match = /(?:^|;\s*)csrf=([^;]+)/.exec(document.cookie || '');
      if (match?.[1]) {
        this.csrfToken = decodeURIComponent(match[1]);
        return this.csrfToken;
      }
    } catch {
      /* non-browser context — fall through to the endpoint */
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/csrf`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = (await response.json()) as { csrfToken?: string };
        if (data?.csrfToken) {
          this.csrfToken = data.csrfToken;
          return this.csrfToken;
        }
      }
    } catch {
      /* network hiccup — the backend will respond 403 with a friendly trigger */
    }

    return null;
  }

  /** Attaches the CSRF header to a mutable headers object for unsafe methods. */
  private async applyCsrf(method: string | undefined, headers: Record<string, string>) {
    if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return;
    const token = await this.ensureCsrf();
    if (token) headers['X-CSRF-Token'] = token;
  }

  /** Whether a 403 hints that the CSRF token must be refetched. */
  private static isCsrfRecovery(status: number, message: string): boolean {
    return status === 403 && /refresh/i.test(message);
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    await this.applyCsrf(options.method, headers);

    const config: RequestInit = {
      credentials: 'include',
      ...options,
      headers,
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch {
      throw new Error(
        'Unable to connect to the server. Please check your internet connection or try again shortly.'
      );
    }

    let data: any = {};
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
        if (response.status >= 500) {
          throw new Error('Our servers are temporarily unavailable. Please try again shortly.');
        }
        throw new Error('The server returned an unexpected response. Please try again.');
      }
      return {} as T;
    }

    if (!response.ok) {
      const detailMsg = Array.isArray(data.details) && data.details.length > 0 ? data.details[0] : '';
      const message =
        detailMsg ||
        data.error ||
        data.message ||
        (response.status >= 500
          ? 'Something went wrong on our end. Please try again in a few moments.'
          : 'Request could not be completed. Please try again.');
      // A CSRF refresh hint means our in-memory token went stale — drop it so
      // the caller's next attempt fetches a fresh one.
      if (ApiClient.isCsrfRecovery(response.status, message)) {
        this.csrfToken = null;
      }
      throw new ApiError(message, response.status, data?.code, data?.currentRev);
    }

    // E4: rev tracking. Every trip-shaped payload carries `rev`; remember the
    // freshest one per trip so mutation methods can send `baseRev` without
    // every component having to thread it through.
    if (data && typeof data === 'object') {
      this.noteRev(data);
    }

    return data;
  }

  /**
   * Like `request`, but for `FormData` bodies. The browser must set the
   * multipart boundary itself, so no `Content-Type` header is added here.
   */
  private async requestForm<T>(endpoint: string, body: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {};
    await this.applyCsrf('POST', headers);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body,
      });
    } catch {
      throw new Error(
        'Unable to connect to the server. Please check your internet connection or try again shortly.'
      );
    }

    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('That file is too large to upload.');
        }
        if (response.status >= 500) {
          throw new Error('Our servers are temporarily unavailable. Please try again shortly.');
        }
        throw new Error('The server returned an unexpected response. Please try again.');
      }
      return {} as T;
    }

    if (!response.ok) {
      const payload = (data ?? {}) as { error?: string; message?: string };
      throw new Error(
        payload.error || payload.message || 'We could not upload that receipt. Please try again.'
      );
    }

    return data as T;
  }

  // Auth endpoints
  async getMe(): Promise<{ user: User }> {
    return this.request('/api/auth/me');
  }

  async signup(email: string, password: string): Promise<{ user: User }> {
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signin(email: string, password: string): Promise<{ user: User }> {
    return this.request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<{ message: string }> {
    return this.request('/api/auth/logout', {
      method: 'POST',
    });
  }

  // Profile (Milestone 7, F14)
  /** Saves the display name; an empty string clears it (email local part). */
  async updateProfile(name: string): Promise<{ user: User }> {
    return this.request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  /** Uploads a JPEG/PNG/WebP photo (server sniffs the bytes and caps the size). */
  async uploadAvatar(file: File): Promise<{ user: User }> {
    const form = new FormData();
    form.append('avatar', file);
    return this.requestForm('/api/auth/avatar', form);
  }

  /** Removes the profile photo, falling back to initials. */
  async removeAvatar(): Promise<{ user: User }> {
    return this.request('/api/auth/avatar', { method: 'DELETE' });
  }

  /** Changes the password; the current one is re-checked server-side. */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.request('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Trip endpoints
  async generateItinerary(input: TripInput): Promise<Trip> {
    return this.request('/api/itinerary/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async generateItineraryStream(
    input: TripInput,
    callbacks: {
      onProgress: (data: StreamProgressEvent) => void;
      onComplete: (trip: Trip) => void;
      onError: (errorMessage: string) => void;
    }
  ): Promise<void> {
    const url = `${this.baseUrl}/api/itinerary/generate-stream`;

    try {
      const streamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      await this.applyCsrf('POST', streamHeaders);
      const response = await fetch(url, {
        method: 'POST',
        headers: streamHeaders,
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        let errMessage = 'Unable to begin itinerary generation. Please try again.';
        try {
          const errorData = await response.json();
          errMessage = errorData.error || errorData.message || errMessage;
        } catch {
          if (response.status === 429) {
            errMessage = 'Generation limit reached. Please wait a few minutes before trying again.';
          } else if (response.status >= 500) {
            errMessage = 'Our AI service is experiencing high traffic. Please try again shortly.';
          }
        }
        throw new Error(errMessage);
      }

      if (!response.body) {
        throw new Error('Unable to read streaming response from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonText = trimmed.slice(5).trim();
            if (!jsonText) continue;

            try {
              const event = JSON.parse(jsonText);
              if (event.type === 'progress') {
                callbacks.onProgress({
                  stage: event.stage || 1,
                  progress: event.progress || 10,
                  message: event.message || 'Crafting itinerary...',
                });
              } else if (event.type === 'complete') {
                callbacks.onComplete(event.trip);
                return;
              } else if (event.type === 'error') {
                const isTechnical =
                  event.message &&
                  (event.message.includes('GoogleGenerativeAI') ||
                    event.message.includes('API key') ||
                    event.message.includes('JSON') ||
                    event.message.includes('at position'));
                callbacks.onError(
                  isTechnical
                    ? 'We encountered an issue preparing your travel plan. Please try generating again.'
                    : event.message || 'Generation encountered an error. Please try again.'
                );
                return;
              }
            } catch (err) {
              console.warn('Unable to parse streaming chunk:', err);
            }
          }
        }
      }
    } catch (err: any) {
      const isNetwork =
        err.message &&
        (err.message.includes('fetch') ||
          err.message.includes('Network') ||
          err.message.includes('connection'));
      callbacks.onError(
        isNetwork
          ? 'Connection interrupted while generating your itinerary. Please check your internet connection and try again.'
          : err.message || 'Unable to complete itinerary generation. Please try again.'
      );
    }
  }

  async getTrips(params?: { search?: string; status?: string; scope?: 'owned' | 'shared' | 'all' }): Promise<Trip[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.scope) query.append('scope', params.scope);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/itinerary${queryString}`);
  }

  async getTrip(id: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}`);
  }

  async updateTrip(
    id: string,
    updates: { title?: string; status?: string; tripDetails?: any }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}`, {
      method: 'PUT',
      // revMode 'required' (E4): the owner's metadata PUT must say which
      // version it was looking at.
      body: this.withBaseRev(id, updates),
    });
  }

  /**
   * M7.2: editor-ranked itinerary content save. Used by add / delete / rename
   * and TravelAI Apply, which cannot be expressed as one activity patch.
   * `title` and `status` stay on the owner-only `updateTrip` route.
   */
  async saveTripItinerary(id: string, tripDetails: ItineraryData): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/itinerary`, {
      method: 'PUT',
      body: this.withBaseRev(id, { tripDetails }),
    });
  }

  async deleteTrip(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/itinerary/${id}`, {
      method: 'DELETE',
    });
  }

  async duplicateTrip(id: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async shareTrip(id: string): Promise<{ success: boolean; shareId: string; message: string }> {
    return this.request(`/api/itinerary/${id}/share`, {
      method: 'POST',
    });
  }

  /** F7 (E5): revokes the public link — `isPublic` off + `shareId` cleared. */
  async revokeShare(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/itinerary/${id}/share`, {
      method: 'DELETE',
    });
  }

  async getSharedTrip(shareId: string): Promise<Trip> {
    return this.request(`/api/itinerary/shared/${shareId}`);
  }

  // Collaboration (Milestone 6: members, invites, ownership)
  async getTripMembers(id: string): Promise<{ success: boolean; members: TripMember[] }> {
    return this.request(`/api/itinerary/${id}/members`);
  }

  async leaveTrip(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/itinerary/${id}/members/me`, { method: 'DELETE' });
  }

  async changeMemberRole(id: string, userId: string, role: TripRole): Promise<{ success: boolean; members: TripMember[] }> {
    return this.request(`/api/itinerary/${id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(id: string, userId: string): Promise<{ success: boolean; members: TripMember[] }> {
    return this.request(`/api/itinerary/${id}/members/${userId}`, { method: 'DELETE' });
  }

  async transferOwnership(id: string, toUserId: string): Promise<{ success: boolean; message: string; members: TripMember[] }> {
    return this.request(`/api/itinerary/${id}/transfer`, {
      method: 'POST',
      body: this.withBaseRev(id, { toUserId }),
    });
  }

  async createTripInvite(
    id: string,
    payload: { role: Exclude<TripRole, 'owner'>; kind?: 'link' | 'email'; email?: string; maxUses?: number; ttlHours?: number }
  ): Promise<{ success: boolean; invite: TripInviteInfo; link: string }> {
    return this.request(`/api/itinerary/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTripInvites(id: string): Promise<{ success: boolean; invites: TripInviteInfo[] }> {
    return this.request(`/api/itinerary/${id}/invites`);
  }

  async revokeTripInvite(id: string, inviteId: string): Promise<{ success: boolean; invite: TripInviteInfo }> {
    return this.request(`/api/itinerary/${id}/invites/${inviteId}`, { method: 'DELETE' });
  }

  async getInvitePreview(token: string): Promise<{ success: boolean } & InvitePreview> {
    return this.request(`/api/invites/${encodeURIComponent(token)}`);
  }

  async acceptInvite(
    token: string
  ): Promise<{ success: boolean; role: Exclude<TripRole, 'owner'>; alreadyMember: boolean; tripId: string; message: string }> {
    return this.request(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
  }

  // Comments (Milestone 6, sprint F6a / F6b). No baseRev: comment writes never
  // touch the Trip document, so nothing here can trigger a REV_CONFLICT.
  async getTripComments(
    id: string,
    params?: { before?: string; limit?: number }
  ): Promise<{ success: boolean; comments: TripComment[]; nextCursor: string | null; dayCounts: Record<string, number> }> {
    const search = new URLSearchParams();
    if (params?.before) search.set('before', params.before);
    if (params?.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return this.request(`/api/itinerary/${id}/comments${query ? `?${query}` : ''}`);
  }

  async addTripComment(
    id: string,
    payload: { body: string; day?: number; e2ee?: boolean; bot?: boolean }
  ): Promise<{ success: boolean; comment: TripComment }> {
    return this.request(`/api/itinerary/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async editTripComment(
    id: string,
    commentId: string,
    body: string,
    e2ee?: boolean
  ): Promise<{ success: boolean; comment: TripComment }> {
    return this.request(`/api/itinerary/${id}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, e2ee }),
    });
  }

  async removeTripComment(id: string, commentId: string): Promise<{ success: boolean; comment: TripComment }> {
    return this.request(`/api/itinerary/${id}/comments/${commentId}`, { method: 'DELETE' });
  }

  // Discussion extras (Milestone 7, F8a/F8b).
  /** The caller's read marker + unread count (server truth; seeds the FAB badge). */
  async getTripReadState(
    id: string
  ): Promise<{ success: boolean; lastReadAt: string; unread: number }> {
    return this.request(`/api/itinerary/${id}/comments/read-state`);
  }

  /** Marks the whole stream read up to now (flushed when a chat surface opens). */
  async markTripRead(id: string): Promise<{ success: boolean; lastReadAt: string; unread: number }> {
    return this.request(`/api/itinerary/${id}/comments/read`, { method: 'POST' });
  }

  /** F8a — best-effort "I'm composing" ping (decoration; errors swallowed). */
  async sendTypingPing(id: string): Promise<void> {
    try {
      await this.request(`/api/itinerary/${id}/events/typing`, { method: 'POST' });
    } catch {
      /* a dropped ping only skips one indicator blink — never worth surfacing */
    }
  }

  // Decisions (Milestone 7, F9). Snapshot records — no baseRev, like comments:
  // promote/unmark never touches the Trip document. Rank notes: PROMOTE is
  // author-or-owner (403 otherwise), UNMARK is promoter-or-owner.
  async getTripDecisions(id: string): Promise<{ success: boolean; decisions: TripDecision[] }> {
    return this.request(`/api/itinerary/${id}/decisions`);
  }

  async markCommentDecision(
    id: string,
    commentId: string
  ): Promise<{ success: boolean; decision: TripDecision }> {
    return this.request(`/api/itinerary/${id}/comments/${commentId}/decision`, {
      method: 'POST',
    });
  }

  async removeTripDecision(
    id: string,
    decisionId: string
  ): Promise<{ success: boolean; decision: TripDecision }> {
    return this.request(`/api/itinerary/${id}/decisions/${decisionId}`, { method: 'DELETE' });
  }

  /* ------------------------------------------------------------------------ */
  /*  Polls (Milestone 7, F13a). Every payload here is SEALED ciphertext — the  */
  /*  server validates shape and size only, and never counts a vote.            */
  /* ------------------------------------------------------------------------ */

  async getTripPolls(id: string): Promise<{ success: boolean; polls: TripPoll[] }> {
    return this.request(`/api/itinerary/${id}/polls`);
  }

  async createTripPoll(
    id: string,
    body: string
  ): Promise<{ success: boolean; poll: TripPoll }> {
    return this.request(`/api/itinerary/${id}/polls`, {
      method: 'POST',
      body: JSON.stringify({ body, e2ee: true }),
    });
  }

  async voteTripPoll(
    id: string,
    pollId: string,
    choice: string
  ): Promise<{ success: boolean; poll: TripPoll }> {
    return this.request(`/api/itinerary/${id}/polls/${pollId}/votes`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    });
  }

  async closeTripPoll(
    id: string,
    pollId: string
  ): Promise<{ success: boolean; poll: TripPoll }> {
    return this.request(`/api/itinerary/${id}/polls/${pollId}/close`, { method: 'POST' });
  }

  async removeTripPoll(
    id: string,
    pollId: string
  ): Promise<{ success: boolean; poll: TripPoll }> {
    return this.request(`/api/itinerary/${id}/polls/${pollId}`, { method: 'DELETE' });
  }

  /* ------------------------------------------------------------------------ */
  /*  Chat keys (Milestone 7, F10) — the blind-carrier plumbing. Everything    */
  /*  here is opaque base64 the server stores verbatim.                        */
  /* ------------------------------------------------------------------------ */

  /** PUT /api/auth/chat-key — publish this browser's public key (idempotent). */
  async setMyChatKey(pubKey: string): Promise<{ success: boolean }> {
    return this.request('/api/auth/chat-key', {
      method: 'PUT',
      body: JSON.stringify({ pubKey }),
    });
  }

  async getTripChatKeys(tripId: string): Promise<ChatKeysState> {
    return this.request(`/api/itinerary/${tripId}/chat/keys`, { method: 'GET' });
  }

  async putTripChatKeys(
    tripId: string,
    epoch: number,
    envelopes: Record<string, string>
  ): Promise<ChatKeysState> {
    return this.request(`/api/itinerary/${tripId}/chat/keys`, {
      method: 'PUT',
      body: JSON.stringify({ epoch, envelopes }),
    });
  }

  async addTripChatEnvelopes(
    tripId: string,
    envelopes: Record<string, string>
  ): Promise<ChatKeysState> {
    return this.request(`/api/itinerary/${tripId}/chat/envelopes`, {
      method: 'POST',
      body: JSON.stringify({ envelopes }),
    });
  }

  /**
   * POST /:id/chat/assistant (F12a) — one @TravelAI ask with client-fed
   * grounding. The reply comes back PLAINTEXT to this caller's browser ONLY;
   * the caller then encrypts it with the trip conversation key and posts it
   * through addTripComment as a bot:true row (the server stores no plaintext).
   * F12b: `proposal` carries ONE typed itinerary change (or null); the client
   * envelope-wraps it into the bubble and a human applies it through the
   * normal save path.
   */
  async askTravelAI(
    tripId: string,
    payload: { prompt: string; context?: Array<{ label: string; text: string }>; day?: number }
  ): Promise<{
    success: boolean;
    reply: string;
    proposal: AssistantProposal | null;
    provider: string;
    cached: boolean;
  }> {
    return this.request(`/api/itinerary/${tripId}/chat/assistant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** E4b — keep the SSE presence entry alive (decoration only; errors ignored). */
  async sendPresenceHeartbeat(id: string): Promise<void> {
    try {
      await this.request(`/api/itinerary/${id}/events/heartbeat`, { method: 'POST' });
    } catch {
      /* presence is decoration — a missed heartbeat only freezes our own avatar */
    }
  }

  // Granular itinerary editing endpoints (Milestone 1)
  // These routes run with revMode 'required' (E4) — baseRev injected.
  async updateActivity(
    id: string,
    payload: { day: number; activityIndex: number; activity: ActivityItem }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/activities`, {
      method: 'PUT',
      body: this.withBaseRev(id, payload),
    });
  }

  async reorderActivities(
    id: string,
    payload: { day: number; order: number[] }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/activities/reorder`, {
      method: 'PUT',
      body: this.withBaseRev(id, payload),
    });
  }

  async moveTripDay(
    id: string,
    payload: { fromIndex: number; toIndex: number }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/days/reorder`, {
      method: 'PUT',
      body: this.withBaseRev(id, payload),
    });
  }

  // Version history endpoints (Milestone 1)
  async getTripVersions(id: string): Promise<TripVersionsResponse> {
    return this.request(`/api/itinerary/${id}/versions`);
  }

  async getTripVersion(id: string, version: number): Promise<TripVersionDetails> {
    return this.request(`/api/itinerary/${id}/versions/${version}`);
  }

  async restoreTripVersion(
    id: string,
    version: number,
    note?: string
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/versions/${version}/restore`, {
      method: 'POST',
      body: this.withBaseRev(id, { note }),
    });
  }

  // Feedback & insights endpoints (Milestone 2: AI prompt improvements)
  async submitFeedback(
    id: string,
    payload: { rating: 'up' | 'down'; comment?: string }
  ): Promise<{ success: boolean; feedback: TripFeedback }> {
    return this.request(`/api/itinerary/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTripInsights(): Promise<TripInsights> {
    return this.request('/api/itinerary/insights');
  }

  // Geo / distance endpoints (Milestone 4: Map & Geo)
  async getRoute(
    points: [number, number][],
    mode: 'walk' | 'bike' | 'drive' = 'drive'
  ): Promise<RouteResult> {
    return this.request('/api/geo/route', {
      method: 'POST',
      body: JSON.stringify({ points, mode }),
    });
  }

  // Expense ledger & travellers (Milestone 5: Budget & Financial)
  async getTripExpenses(id: string): Promise<{
    success: boolean;
    expenses: TripExpense[];
    participants: TripParticipant[];
    finance: TripFinance;
  }> {
    return this.request(`/api/itinerary/${id}/expenses`);
  }

  async addExpense(id: string, payload: ExpenseInput): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateExpense(
    id: string,
    expenseId: string,
    payload: Partial<ExpenseInput>
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteExpense(id: string, expenseId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  }

  /** Uploads (or replaces) a receipt image/PDF for an expense (Milestone 5.5). */
  async uploadExpenseReceipt(id: string, expenseId: string, file: File): Promise<Trip> {
    const form = new FormData();
    form.append('receipt', file);
    return this.requestForm(`/api/itinerary/${id}/expenses/${expenseId}/receipt`, form);
  }

  /** Removes an expense's receipt (Milestone 5.5). */
  async deleteExpenseReceipt(id: string, expenseId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}/receipt`, {
      method: 'DELETE',
    });
  }

  async updateParticipants(
    id: string,
    participants: { _id?: string; name: string; isMe?: boolean }[]
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/participants`, {
      method: 'PUT',
      // Whole-list replacement → revMode 'required' (E4).
      body: this.withBaseRev(id, { participants }),
    });
  }

  // Currency & rates (Milestone 5: Budget & Financial)
  async updateFinance(
    id: string,
    payload: { baseCurrency?: string; refresh?: boolean }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/finance`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getCurrencyRates(base: string, symbols?: string[]): Promise<CurrencyRateSnapshot> {
    const query = new URLSearchParams({ base });
    if (symbols?.length) query.append('symbols', symbols.join(','));
    return this.request(`/api/geo/currency/rates?${query.toString()}`);
  }

  // Weather advisories (Milestone 4: Map & Geo)
  async getWeather(
    lat: number,
    lng: number,
    start: string,
    end: string
  ): Promise<WeatherResponse> {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      start,
      end,
    });
    return this.request(`/api/geo/weather?${query.toString()}`);
  }

  // Nearby search (Milestone 4: Map & Geo)
  async getNearby(
    lat: number,
    lng: number,
    category: NearbyCategory,
    radius?: number
  ): Promise<NearbyResponse> {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      category,
    });
    if (radius) query.append('radius', String(radius));
    return this.request(`/api/geo/nearby?${query.toString()}`);
  }

  /** Asks the AI for a weather-aware replacement for a single day. */
  async suggestIndoorAlternative(id: string, day: number): Promise<DayAlternative> {
    return this.request(`/api/itinerary/${id}/days/${day}/indoor-alternative`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** Weather-aware routing analysis for a trip (Milestone 4.6). */
  async getWeatherRouting(id: string): Promise<WeatherRoutingResponse> {
    return this.request(`/api/itinerary/${id}/weather-routing`);
  }

  // User-drawn custom routes (Milestone 4: Map & Geo)
  async addRoute(id: string, payload: RouteInput): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRoute(
    id: string,
    routeId: string,
    payload: Partial<RouteInput>
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes/${routeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteRoute(id: string, routeId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes/${routeId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
