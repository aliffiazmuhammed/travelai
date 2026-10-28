import { API_BASE_URL } from '@/config';
import type {
  ExploreFilters,
  ExplorePage,
  GalleryTravelerProfile,
  GalleryTrip,
  ProfileUpdateInput,
  Trip,
  TripInput,
  TripPublicationState,
  TripJoinRequest,
  JoinRequestState,
  BlockedAccount,
  ReportReason,
  ReportResult,
  ReportTargetType,
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
  Agency,
  AgencyAuthSession,
  AgencyAsset,
  AgencyAssetKind,
  AgencyBranding,
  AgencyClient,
  AgencyHealth,
  AgencyDirectoryProfileInput,
  AgencyDirectoryProfilePayload,
  AgencyDirectoryProfileResponse,
  AgencyDirectoryFacetsResponse,
  AgencyDirectoryFilters,
  AgencyDirectoryPage,
  AgencyDirectoryPublicProfileResponse,
  AgencyEnquiry,
  AgencyEnquiryAcknowledgement,
  AgencyEnquiryConversion,
  AgencyEnquiryFilters,
  AgencyEnquiryInput,
  AgencyEnquiryPage,
  AgencyEnquirySummary,
  AgencyEnquiryUpdateInput,
  AgencyEnquiryUpdateResult,
  AgencyPackage,
  AgencyPackageCreateInput,
  AgencyPackageInput,
  AgencyPackageListResponse,
  AgencyPackageResponse,
  AgencyInvite,
  AgencyInvitePreview,
  AgencyInvitableRole,
  AgencyLoginContext,
  AgencyMember,
  AgencyQuote,
  AgencyQuoteInput,
  AgencyRole,
  AgencyTerms,
  AgencyExport,
  AgencyExportInput,
  AgencyExportPreview,
  AgencyPdfSlotMap,
  AgencyPdfTokenOption,
  AgencyTemplate,
  AgencyTemplateAssetSelection,
  AgencyTemplateAudience,
  AgencyTemplateLayout,
  AgencyTemplateListStatus,
  AgencyTemplateSource,
  AgencyTemplateVersion,
  AgencyTemplateVersionPreview,
  AgencyProposalAcceptResult,
  AgencyProposalLink,
  AgencyProposalView,
  AgencyAuditEntry,
  AgencyUsage,
  PlatformAuthSession,
  PlatformHealth,
  PlatformAccountDetail,
  PlatformAccountList,
  PlatformAccountQuery,
  PlatformAccountRow,
  PlatformAccountStatus,
  PlatformAdminList,
  PlatformOverview,
  PlatformAgencyDetail,
  PlatformAgencyDirectoryMutation,
  PlatformAgencyInput,
  PlatformAgencyInviteResult,
  PlatformAgencyList,
  PlatformAgencyMemberInviteInput,
  PlatformAgencyQuery,
  PlatformAgencyRole,
  PlatformAgencyStatus,
  PlatformAuditList,
  PlatformAuditQuery,
  PlatformModerationAction,
  PlatformModerationList,
  PlatformModerationStatus,
  PlatformOwnerPreview,
  PlatformPlanTier,
  PlatformProvisionResult,
} from '@/types';

export interface StreamProgressEvent {
  stage: number;
  progress: number;
  message: string;
}

/** Builds the PA2 directory query string, dropping empty/default filters. */
function platformQueryString(params: PlatformAccountQuery): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.realm && params.realm !== 'all') search.set('realm', params.realm);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** PA4 agency directory filters. */
function agencyQueryString(params: PlatformAgencyQuery): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.profile && params.profile !== 'all') {
    search.set('profile', params.profile);
  }
  if (params.planTierId && params.planTierId !== 'all') {
    search.set('planTierId', params.planTierId);
  }
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** PA4 audit viewer filters. */
function auditQueryString(params: PlatformAuditQuery): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.action) search.set('action', params.action);
  if (params.targetType) search.set('targetType', params.targetType);
  if (params.targetId) search.set('targetId', params.targetId);
  if (params.actorId) search.set('actorId', params.actorId);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return query ? `?${query}` : '';
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
        payload.error || payload.message || 'We could not upload that file. Please try again.'
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

  // Profile (Milestone 7, F14; Milestone 8 G2 adds handle + bio)
  /** Saves only the fields present in `input`; empty strings clear them. */
  async updateProfile(input: ProfileUpdateInput): Promise<{ user: User }> {
    return this.request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  /** Non-throwing live check for the traveler handle field. */
  async checkHandleAvailability(handle: string): Promise<{
    success: boolean;
    handle: string;
    available: boolean;
    reason?: 'invalid' | 'reserved' | 'taken';
  }> {
    return this.request(
      `/api/auth/profile/handle-available?handle=${encodeURIComponent(handle)}`
    );
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

  // Agency Workspace A1. The namespace 404s when the server feature flag is
  // off; the UI probes `/api/health` and never renders the shell in that case.
  async getHealth(): Promise<{ agency?: AgencyHealth; platform?: PlatformHealth }> {
    return this.request('/api/health');
  }

  // PA0 agency realm auth. Login resolves the tenant from the workspace slug,
  // then authenticates the tenant-scoped agency account. These calls use the
  // separate `agency_token` cookie and never touch the personal session.
  async getAgencyLoginContext(workspace: string): Promise<AgencyLoginContext> {
    return this.request(
      `/api/agency/auth/context?workspace=${encodeURIComponent(workspace.trim().toLowerCase())}`
    );
  }

  async signinAgency(
    workspace: string,
    email: string,
    password: string
  ): Promise<AgencyAuthSession> {
    return this.request('/api/agency/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        workspace: workspace.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password,
      }),
    });
  }

  async getAgencyMe(): Promise<AgencyAuthSession> {
    return this.request('/api/agency/auth/me');
  }

  async logoutAgency(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/agency/auth/logout', { method: 'POST' });
  }

  async updateAgencyProfile(name: string): Promise<AgencyAuthSession> {
    return this.request('/api/agency/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async changeAgencyPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/api/agency/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /** Agency accounts publish their own M7 chat identity keys. */
  async setAgencyChatKey(pubKey: string): Promise<{ success: boolean }> {
    return this.request('/api/agency/auth/chat-key', {
      method: 'PUT',
      body: JSON.stringify({ pubKey }),
    });
  }

  // PA1 platform realm auth. The namespace 404s while `PLATFORM_ADMIN_ENABLED`
  // is off; these calls use the separate `platform_token` cookie and never
  // touch the personal or agency sessions.
  async signinPlatform(email: string, password: string): Promise<PlatformAuthSession> {
    return this.request('/api/admin/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
  }

  async getPlatformMe(): Promise<PlatformAuthSession> {
    return this.request('/api/admin/auth/me');
  }

  async logoutPlatform(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/admin/auth/logout', { method: 'POST' });
  }

  async changePlatformPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/api/admin/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // PA2 platform directory. Metadata only: no tenant/personal trip content is
  // ever returned by these endpoints.
  async getPlatformOverview(): Promise<PlatformOverview> {
    return this.request('/api/admin/overview');
  }

  async listPlatformAccounts(
    params: PlatformAccountQuery = {}
  ): Promise<PlatformAccountList> {
    return this.request(`/api/admin/accounts${platformQueryString(params)}`);
  }

  async getPlatformAccount(
    id: string
  ): Promise<{ success: boolean; account: PlatformAccountDetail }> {
    return this.request(`/api/admin/accounts/${encodeURIComponent(id)}`);
  }

  async updatePlatformAccountStatus(
    id: string,
    status: PlatformAccountStatus
  ): Promise<{ success: boolean; account: PlatformAccountRow; changed: boolean }> {
    return this.request(`/api/admin/accounts/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async resetPlatformAccountPassword(id: string): Promise<{
    success: boolean;
    message: string;
    temporaryPassword: string;
    email: string;
    workspace?: string;
    agencyName?: string;
  }> {
    return this.request(
      `/api/admin/accounts/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST' }
    );
  }

  async listPlatformAdmins(
    params: PlatformAccountQuery = {}
  ): Promise<PlatformAdminList> {
    return this.request(
      `/api/admin/platform-accounts${platformQueryString({ ...params, realm: 'platform' })}`
    );
  }

  async createPlatformAdmin(input: {
    email: string;
    name?: string;
  }): Promise<{
    success: boolean;
    message: string;
    account: PlatformAccountRow;
    temporaryPassword: string;
  }> {
    return this.request('/api/admin/platform-accounts', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email.trim().toLowerCase(),
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      }),
    });
  }

  async updatePlatformAdmin(
    id: string,
    input: { status?: PlatformAccountStatus; name?: string | null }
  ): Promise<{ success: boolean; account: PlatformAccountRow; changed: boolean }> {
    return this.request(
      `/api/admin/platform-accounts/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  }

  async getAgency(id: string): Promise<{ success: boolean; agency: Agency }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}`);
  }

  // PA3 agency provisioning. Plan limits and owner warnings are metadata only.
  async getAgencyPlanTiers(): Promise<{
    success: boolean;
    tiers: PlatformPlanTier[];
  }> {
    return this.request('/api/admin/agencies/plans');
  }

  async previewAgencyOwner(email: string): Promise<{
    success: boolean;
    preview: PlatformOwnerPreview;
  }> {
    return this.request(
      `/api/admin/agencies/owner-preview?email=${encodeURIComponent(email)}`
    );
  }

  async provisionAgency(
    input: PlatformAgencyInput
  ): Promise<PlatformProvisionResult> {
    return this.request('/api/admin/agencies', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // PA4 agency lifecycle, access operations and audit. Each mutation writes a
  // platform and a tenant audit row; tenant content is never returned.
  async listAdminAgencies(
    params: PlatformAgencyQuery = {}
  ): Promise<PlatformAgencyList> {
    return this.request(`/api/admin/agencies${agencyQueryString(params)}`);
  }

  async getAdminAgency(
    id: string
  ): Promise<{ success: boolean; agency: PlatformAgencyDetail }> {
    return this.request(`/api/admin/agencies/${encodeURIComponent(id)}`);
  }

  async updateAdminAgencyStatus(
    id: string,
    status: PlatformAgencyStatus
  ): Promise<{ success: boolean; agency: PlatformAgencyDetail; changed: boolean }> {
    return this.request(`/api/admin/agencies/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async updateAdminAgencyPlan(
    id: string,
    plan: {
      tierId: string;
      seats?: number;
      monthlyExports?: number;
      storageMb?: number;
    }
  ): Promise<{
    success: boolean;
    message: string;
    agency: PlatformAgencyDetail;
    previous: PlatformAgencyDetail['plan'];
  }> {
    return this.request(`/api/admin/agencies/${encodeURIComponent(id)}/plan`, {
      method: 'PATCH',
      body: JSON.stringify(plan),
    });
  }

  async inviteAdminAgencyMember(
    id: string,
    input: PlatformAgencyMemberInviteInput
  ): Promise<PlatformAgencyInviteResult> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/members/invite`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }

  async updateAdminAgencyMemberRole(
    id: string,
    userId: string,
    role: PlatformAgencyRole
  ): Promise<{ success: boolean; agency: PlatformAgencyDetail }> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    );
  }

  async removeAdminAgencyMember(
    id: string,
    userId: string
  ): Promise<{ success: boolean; agency: PlatformAgencyDetail }> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  }

  async transferAdminAgencyOwner(
    id: string,
    userId: string,
    fromUserId?: string
  ): Promise<{ success: boolean; message: string; agency: PlatformAgencyDetail }> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/transfer-owner`,
      {
        method: 'POST',
        body: JSON.stringify(fromUserId ? { fromUserId } : {}),
      }
    );
  }

  async resetAdminAgencyMemberPassword(
    id: string,
    userId: string
  ): Promise<{
    success: boolean;
    message: string;
    temporaryPassword: string;
    email: string;
    workspace?: string;
    agencyName?: string;
  }> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/reset-password`,
      { method: 'POST' }
    );
  }

  // M9 D7 directory operations. Verification changes the public badge only;
  // hide/restore removes or returns a profile/package on every public surface.
  async verifyAdminAgencyProfile(
    id: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/verify`,
      { method: 'POST' }
    );
  }

  async unverifyAdminAgencyProfile(
    id: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/unverify`,
      { method: 'POST' }
    );
  }

  async hideAdminAgencyProfile(
    id: string,
    reason: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/hide`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
  }

  async restoreAdminAgencyProfile(
    id: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/restore`,
      { method: 'POST' }
    );
  }

  async hideAdminAgencyPackage(
    id: string,
    packageId: string,
    reason: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/packages/${encodeURIComponent(packageId)}/hide`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
  }

  async restoreAdminAgencyPackage(
    id: string,
    packageId: string
  ): Promise<PlatformAgencyDirectoryMutation> {
    return this.request(
      `/api/admin/agencies/${encodeURIComponent(id)}/directory/packages/${encodeURIComponent(packageId)}/restore`,
      { method: 'POST' }
    );
  }

  async listAdminAudit(params: PlatformAuditQuery = {}): Promise<PlatformAuditList> {
    return this.request(`/api/admin/audit${auditQueryString(params)}`);
  }

  // G6 moderation console. Reported content only; every decision is audited.
  async listModerationQueue(
    status: PlatformModerationStatus = 'open',
    limit = 50
  ): Promise<PlatformModerationList> {
    const query = new URLSearchParams({ status, limit: String(limit) });
    return this.request(`/api/admin/reports?${query.toString()}`);
  }

  async hideReportedContent(
    targetType: 'trip' | 'profile' | 'agency_profile',
    targetId: string
  ): Promise<PlatformModerationAction> {
    return this.request(
      `/api/admin/reports/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/hide`,
      { method: 'POST' }
    );
  }

  async dismissReportedContent(
    targetType: 'trip' | 'profile' | 'agency_profile',
    targetId: string
  ): Promise<PlatformModerationAction> {
    return this.request(
      `/api/admin/reports/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/dismiss`,
      { method: 'POST' }
    );
  }

  async updateAgency(
    id: string,
    payload: {
      name?: string;
      gstin?: string;
      branding?: Partial<AgencyBranding>;
      defaultTerms?: Partial<AgencyTerms>;
    }
  ): Promise<{ success: boolean; agency: Agency }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /** A3: the tenant's private brand asset library. */
  async getAgencyAssets(
    id: string
  ): Promise<{ success: boolean; assets: AgencyAsset[] }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/assets`);
  }

  async uploadAgencyAsset(
    id: string,
    file: File,
    meta: { kind: AgencyAssetKind; fontFamily?: string; licenseNote?: string }
  ): Promise<{ success: boolean; asset: AgencyAsset; agency?: Agency }> {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', meta.kind);
    if (meta.fontFamily) form.append('fontFamily', meta.fontFamily);
    if (meta.licenseNote) form.append('licenseNote', meta.licenseNote);
    return this.requestForm(
      `/api/agency/${encodeURIComponent(id)}/assets`,
      form
    );
  }

  async deleteAgencyAsset(
    id: string,
    assetId: string
  ): Promise<{ success: boolean; asset: AgencyAsset; agency?: Agency }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' }
    );
  }

  /** M9 D2: the tenant's own public-directory profile + publish readiness. */
  async getAgencyDirectoryProfile(
    id: string
  ): Promise<AgencyDirectoryProfileResponse> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/profile`);
  }

  async saveAgencyDirectoryProfile(
    id: string,
    payload: AgencyDirectoryProfileInput
  ): Promise<AgencyDirectoryProfilePayload> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async publishAgencyDirectoryProfile(
    id: string
  ): Promise<AgencyDirectoryProfilePayload> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/profile/publish`,
      { method: 'POST' }
    );
  }

  async unpublishAgencyDirectoryProfile(
    id: string
  ): Promise<AgencyDirectoryProfilePayload> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/profile/unpublish`,
      { method: 'POST' }
    );
  }

  /** M9 D4: the tenant's package snapshots (planners edit, admins publish). */
  async listAgencyPackages(id: string): Promise<AgencyPackageListResponse> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/packages`);
  }

  async createAgencyPackage(
    id: string,
    payload: AgencyPackageCreateInput
  ): Promise<AgencyPackageResponse> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/packages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateAgencyPackage(
    id: string,
    packageId: string,
    payload: AgencyPackageInput
  ): Promise<AgencyPackageResponse> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  }

  async publishAgencyPackage(
    id: string,
    packageId: string
  ): Promise<AgencyPackageResponse> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}/publish`,
      { method: 'POST' }
    );
  }

  async unpublishAgencyPackage(
    id: string,
    packageId: string
  ): Promise<AgencyPackageResponse> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}/unpublish`,
      { method: 'POST' }
    );
  }

  async deleteAgencyPackage(
    id: string,
    packageId: string
  ): Promise<{ success: boolean; id: string }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}`,
      { method: 'DELETE' }
    );
  }

  /**
   * M9 D5: the tenant enquiry inbox. Workspace-addressed (no tenant id in the
   * path) because the signed-in agency session already names the tenant.
   */
  async getAgencyEnquiries(
    filters: AgencyEnquiryFilters = {}
  ): Promise<AgencyEnquiryPage> {
    const query = new URLSearchParams();
    if (filters.status) query.append('status', filters.status);
    if (filters.cursor) query.append('cursor', filters.cursor);
    if (filters.limit) query.append('limit', String(filters.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/agency/enquiries${suffix}`);
  }

  async getAgencyEnquiry(
    enquiryId: string
  ): Promise<{ success: boolean; enquiry: AgencyEnquiry }> {
    return this.request(
      `/api/agency/enquiries/${encodeURIComponent(enquiryId)}`
    );
  }

  /** D6: dashboard counters for the inbox (rolling seven-day window). */
  async getAgencyEnquirySummary(): Promise<AgencyEnquirySummary> {
    return this.request('/api/agency/enquiries/summary');
  }

  /** D6: move status, claim or release a lead. */
  async updateAgencyEnquiry(
    enquiryId: string,
    payload: AgencyEnquiryUpdateInput
  ): Promise<AgencyEnquiryUpdateResult> {
    return this.request(
      `/api/agency/enquiries/${encodeURIComponent(enquiryId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  }

  /** D6: idempotent convert to a directory client, marked won. */
  async convertAgencyEnquiry(
    enquiryId: string
  ): Promise<AgencyEnquiryConversion> {
    return this.request(
      `/api/agency/enquiries/${encodeURIComponent(enquiryId)}/convert`,
      { method: 'POST' }
    );
  }

  /** A4: the tenant's private client directory. */
  async getAgencyClients(
    id: string,
    search?: string
  ): Promise<{ success: boolean; clients: AgencyClient[] }> {
    const suffix = search?.trim()
      ? `?search=${encodeURIComponent(search.trim())}`
      : '';
    return this.request(`/api/agency/${encodeURIComponent(id)}/clients${suffix}`);
  }

  async createAgencyClient(
    id: string,
    payload: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; client: AgencyClient }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/clients`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateAgencyClient(
    id: string,
    clientId: string,
    payload: {
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; client: AgencyClient }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/clients/${encodeURIComponent(clientId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  }

  async deleteAgencyClient(
    id: string,
    clientId: string
  ): Promise<{ success: boolean; client: AgencyClient; message: string }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/clients/${encodeURIComponent(clientId)}`,
      { method: 'DELETE' }
    );
  }

  /**
   * Uploaded branding files are private: an `<img src>` would lose the session
   * in cross-site deployments. Fetching with credentials and handing the UI an
   * object URL keeps the auth check on every byte. Only same-API asset paths
   * are accepted so a hostile branding value cannot redirect credentials.
   */
  async fetchAgencyAssetBlob(url: string): Promise<Blob> {
    const isAssetPath =
      url.startsWith('/api/agency/') &&
      url.includes('/assets/') &&
      !url.startsWith('//') &&
      !url.includes('\\');
    if (!isAssetPath) {
      throw new Error('That brand asset link is not valid.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${url}`, { credentials: 'include' });
    } catch {
      throw new Error('Unable to load that brand asset. Please try again shortly.');
    }

    if (!response.ok) {
      let message = 'We could not load that brand asset.';
      try {
        const data = await response.json();
        message = data?.error || data?.message || message;
      } catch {
        /* Binary or empty error body. */
      }
      throw new ApiError(message, response.status);
    }

    return response.blob();
  }

  async getAgencyMembers(
    id: string
  ): Promise<{ success: boolean; members: AgencyMember[] }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/members`);
  }

  /** A2: the tenant trip library (agency-wide visibility). */
  async getAgencyTrips(
    id: string,
    params?: {
      search?: string;
      status?: string;
      assignedTo?: string;
      archived?: boolean;
    }
  ): Promise<{ success: boolean; trips: Trip[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.assignedTo) query.append('assignedTo', params.assignedTo);
    if (params?.archived) query.append('archived', 'true');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/trips${suffix}`
    );
  }

  async createAgencyTrip(
    id: string,
    payload: {
      title: string;
      startDate?: string;
      endDate?: string;
      assignedTo?: string;
    }
  ): Promise<{ success: boolean; trip: Trip }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/trips`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Owner/admin-only tenant trash. */
  async getAgencyTrip(agencyId: string, tripId: string): Promise<Trip> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}`
    );
  }

  async updateAgencyTrip(
    agencyId: string,
    tripId: string,
    payload: { assignedTo?: string | null; clientId?: string | null }
  ): Promise<{ success: boolean; trip: Trip }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  }

  /** A8: owner/admin operations surfaces. */
  async getAgencyUsage(
    id: string
  ): Promise<{ success: boolean; usage: AgencyUsage }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/usage`);
  }

  async getAgencyAudit(
    id: string,
    params?: { page?: number; limit?: number; action?: string }
  ): Promise<{
    success: boolean;
    entries: AgencyAuditEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.action) query.append('action', params.action);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/agency/${encodeURIComponent(id)}/audit${suffix}`);
  }

  /** A8: archive moves a trip to a read-only state (not the A2 trash). */
  async archiveAgencyTrip(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; message: string; trip: Trip }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/archive`,
      { method: 'POST' }
    );
  }

  async unarchiveAgencyTrip(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; message: string; trip: Trip }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/unarchive`,
      { method: 'POST' }
    );
  }

  /** A4: the latest quote version for an agency trip (null before the first save). */
  async getAgencyQuote(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; quote: AgencyQuote | null }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote`
    );
  }

  async getAgencyQuoteVersions(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; versions: AgencyQuote[] }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote/versions`
    );
  }

  /** Totals are always recomputed server-side; drafts are replaced in place. */
  async saveAgencyQuote(
    agencyId: string,
    tripId: string,
    payload: AgencyQuoteInput
  ): Promise<{ success: boolean; quote: AgencyQuote }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote`,
      { method: 'PUT', body: JSON.stringify(payload) }
    );
  }

  async sendAgencyQuote(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; quote: AgencyQuote }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote/send`,
      { method: 'POST' }
    );
  }

  async acceptAgencyQuote(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; quote: AgencyQuote }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote/accept`,
      { method: 'POST' }
    );
  }

  async cancelAgencyQuote(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; quote: AgencyQuote }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/quote/cancel`,
      { method: 'POST' }
    );
  }

  /** A5/A6: managed document templates. Internal templates need an admin. */
  async getAgencyTemplates(
    id: string,
    params?: {
      audience?: AgencyTemplateAudience;
      status?: AgencyTemplateListStatus;
    }
  ): Promise<{ success: boolean; templates: AgencyTemplate[] }> {
    const query = new URLSearchParams();
    if (params?.audience) query.append('audience', params.audience);
    if (params?.status) query.append('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates${suffix}`
    );
  }

  /** A6c: upload a custom template as a draft (version 1). */
  async createAgencyTemplate(
    id: string,
    input: {
      file: File;
      name: string;
      description?: string;
      audience: AgencyTemplateAudience;
      assets?: AgencyTemplateAssetSelection;
    }
  ): Promise<{
    success: boolean;
    message?: string;
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }> {
    const form = new FormData();
    form.append('file', input.file);
    form.append('name', input.name);
    form.append('audience', input.audience);
    if (input.description?.trim()) {
      form.append('description', input.description.trim());
    }
    if (input.assets) form.append('assets', JSON.stringify(input.assets));
    return this.requestForm(
      `/api/agency/${encodeURIComponent(id)}/templates`,
      form
    );
  }

  /**
   * A6f: upload a PDF design plus the slot map that binds TravelAI data onto
   * it. The server sanitises the PDF and validates the layout against the
   * real page geometry before storing anything.
   */
  async createAgencyPdfTemplate(
    id: string,
    input: {
      file: File;
      name: string;
      description?: string;
      audience: AgencyTemplateAudience;
      slotMap: AgencyPdfSlotMap;
      assets?: AgencyTemplateAssetSelection;
    }
  ): Promise<{
    success: boolean;
    message?: string;
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }> {
    const form = new FormData();
    form.append('file', input.file);
    form.append('name', input.name);
    form.append('audience', input.audience);
    if (input.description?.trim()) {
      form.append('description', input.description.trim());
    }
    form.append('slotMap', JSON.stringify(input.slotMap));
    if (input.assets) form.append('assets', JSON.stringify(input.assets));
    return this.requestForm(
      `/api/agency/${encodeURIComponent(id)}/templates/pdf`,
      form
    );
  }

  /** The tokens a layout may bind for one audience. */
  async getAgencyPdfTokenCatalog(
    id: string,
    audience: AgencyTemplateAudience
  ): Promise<{
    success: boolean;
    audience: AgencyTemplateAudience;
    tokens: AgencyPdfTokenOption[];
  }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/pdf-tokens?audience=${encodeURIComponent(audience)}`
    );
  }

  async getAgencyTemplateLayout(
    id: string,
    templateId: string,
    version: number
  ): Promise<{ success: boolean; layout: AgencyTemplateLayout }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(String(version))}/layout`
    );
  }

  /**
   * The pinned background PDF is private, so it is fetched with credentials
   * and handed to the mapper as a local blob rather than linked directly.
   */
  async fetchAgencyTemplateBackground(
    id: string,
    templateId: string,
    version: number
  ): Promise<Blob> {
    const url = `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(String(version))}/background`;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${url}`, {
        credentials: 'include',
      });
    } catch {
      throw new Error('Unable to load that PDF design. Please try again shortly.');
    }
    if (!response.ok) {
      let message = 'We could not load that PDF design.';
      try {
        const data = await response.json();
        message = data?.error || data?.message || message;
      } catch {
        /* Binary or empty error body. */
      }
      throw new ApiError(message, response.status);
    }
    return response.blob();
  }

  /** Saves an edited layout as the next immutable version of the template. */
  async saveAgencyTemplateLayout(
    id: string,
    templateId: string,
    payload: { baseVersion: number; slotMap: AgencyPdfSlotMap }
  ): Promise<{
    success: boolean;
    message?: string;
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/from-layout`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  /** Uploads the next immutable version; its audience comes from the template. */
  async addAgencyTemplateVersion(
    id: string,
    templateId: string,
    input: { file: File; assets?: AgencyTemplateAssetSelection }
  ): Promise<{
    success: boolean;
    message?: string;
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }> {
    const form = new FormData();
    form.append('file', input.file);
    if (input.assets) form.append('assets', JSON.stringify(input.assets));
    return this.requestForm(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions`,
      form
    );
  }

  async getAgencyTemplateVersions(
    id: string,
    templateId: string
  ): Promise<{
    success: boolean;
    template: AgencyTemplate;
    versions: AgencyTemplateVersion[];
  }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions`
    );
  }

  /** A6d: the private source of one version, for the in-app editor. */
  async getAgencyTemplateSource(
    id: string,
    templateId: string,
    version: number
  ): Promise<{ success: boolean } & AgencyTemplateSource> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(String(version))}/source`
    );
  }

  /** Saves edited HTML as the next immutable version; assets carry over. */
  async saveAgencyTemplateSource(
    id: string,
    templateId: string,
    payload: { baseVersion: number; source: string }
  ): Promise<{
    success: boolean;
    message?: string;
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/from-source`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async previewAgencyTemplateVersion(
    id: string,
    templateId: string,
    version: number,
    payload: { tripId: string; quoteId?: string | null }
  ): Promise<{ success: boolean; preview: AgencyTemplateVersionPreview }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(String(version))}/preview`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async activateAgencyTemplateVersion(
    id: string,
    templateId: string,
    version: number
  ): Promise<{ success: boolean; message?: string; template: AgencyTemplate }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(String(version))}/activate`,
      { method: 'POST' }
    );
  }

  async archiveAgencyTemplate(
    id: string,
    templateId: string
  ): Promise<{ success: boolean; message?: string; template: AgencyTemplate }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/archive`,
      { method: 'POST' }
    );
  }

  async setDefaultAgencyTemplate(
    id: string,
    templateId: string
  ): Promise<{ success: boolean; message?: string; template: AgencyTemplate }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}/default`,
      { method: 'POST' }
    );
  }

  async updateAgencyTemplate(
    id: string,
    templateId: string,
    payload: { name?: string; description?: string }
  ): Promise<{ success: boolean; template: AgencyTemplate }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  }

  async getAgencyExports(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; exports: AgencyExport[] }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/exports`
    );
  }

  async previewAgencyExport(
    agencyId: string,
    tripId: string,
    payload: AgencyExportInput
  ): Promise<{ success: boolean; preview: AgencyExportPreview }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/exports/preview`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async createAgencyExport(
    agencyId: string,
    tripId: string,
    payload: AgencyExportInput
  ): Promise<{ success: boolean; message: string; export: AgencyExport }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/exports`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async retryAgencyExport(
    agencyId: string,
    tripId: string,
    exportId: string
  ): Promise<{ success: boolean; message: string; export: AgencyExport }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/exports/${encodeURIComponent(exportId)}/retry`,
      { method: 'POST' }
    );
  }

  /**
   * Export links are signed and session-bound. Fetch with credentials instead
   * of handing the URL to an `<a href>`/`window.open`, which would drop the
   * session cookie in cross-site deployments.
   */
  async downloadAgencyExport(url: string): Promise<Blob> {
    const isExportPath =
      url.startsWith('/api/agency/') &&
      !url.startsWith('//') &&
      !url.includes('\\') &&
      /\/exports\/[^/?#]+\/download(?:\?[^#]*)?$/.test(url);
    if (!isExportPath) {
      throw new Error('That export link is not valid.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${url}`, { credentials: 'include' });
    } catch {
      throw new Error('Unable to download that export. Please try again shortly.');
    }

    if (!response.ok) {
      let message = 'We could not download that export.';
      try {
        const data = await response.json();
        message = data?.error || data?.message || message;
      } catch {
        /* Binary or empty error body. */
      }
      throw new ApiError(message, response.status);
    }

    return response.blob();
  }

  // Public proposal shares (A7). The token is the capability, so these are
  // unauthenticated; management endpoints sit behind the usual session.
  async getAgencyProposal(
    token: string
  ): Promise<{ success: boolean; proposal: AgencyProposalView }> {
    return this.request(
      `/api/agency/proposals/${encodeURIComponent(token)}`
    );
  }

  async acceptAgencyProposal(
    token: string
  ): Promise<{
    success: boolean;
    message: string;
    acceptance: AgencyProposalAcceptResult;
  }> {
    return this.request(
      `/api/agency/proposals/${encodeURIComponent(token)}/accept`,
      { method: 'POST' }
    );
  }

  /**
   * The public PDF route needs no session, so a plain anchor navigation
   * downloads it (Content-Disposition attachment). The link is safe to open
   * cross-origin and never embeds query state.
   */
  getAgencyProposalPdfUrl(token: string): string {
    return `${this.baseUrl}/api/agency/proposals/${encodeURIComponent(token)}/pdf`;
  }

  /**
   * PDF-design proposals render the pinned export itself. The token-only route
   * needs no session, and fetching it here keeps the document inside the app
   * shell instead of handing the URL to a PDF viewer plugin.
   */
  async getAgencyProposalPdfBlob(token: string): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(this.getAgencyProposalPdfUrl(token));
    } catch {
      throw new Error(
        'Unable to load this proposal document. Please try again shortly.'
      );
    }
    if (!response.ok) {
      throw new ApiError(
        'This proposal document could not be loaded.',
        response.status
      );
    }
    return response.blob();
  }

  async createAgencyProposalLink(
    agencyId: string,
    tripId: string,
    exportId: string,
    payload: { ttlDays?: number } = {}
  ): Promise<{ success: boolean; message: string; link: AgencyProposalLink; url: string }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/exports/${encodeURIComponent(exportId)}/share`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async getAgencyProposalLinks(
    agencyId: string,
    tripId: string
  ): Promise<{ success: boolean; links: AgencyProposalLink[] }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/shares`
    );
  }

  async revokeAgencyProposalLink(
    agencyId: string,
    tripId: string,
    shareId: string
  ): Promise<{ success: boolean; message: string; link: AgencyProposalLink }> {
    return this.request(
      `/api/agency/${encodeURIComponent(agencyId)}/trips/${encodeURIComponent(tripId)}/shares/${encodeURIComponent(shareId)}`,
      { method: 'DELETE' }
    );
  }

  async changeAgencyMemberRole(
    id: string,
    userId: string,
    role: AgencyRole
  ): Promise<{ success: boolean; members: AgencyMember[] }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    );
  }

  async removeAgencyMember(
    id: string,
    userId: string
  ): Promise<{ success: boolean; members: AgencyMember[] }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  }

  async getAgencyInvites(
    id: string
  ): Promise<{ success: boolean; invites: AgencyInvite[] }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/invites`);
  }

  async createAgencyInvite(
    id: string,
    payload: {
      role: AgencyInvitableRole;
      kind?: 'link' | 'email';
      email?: string;
      maxUses?: number;
      ttlHours?: number;
    }
  ): Promise<{ success: boolean; invite: AgencyInvite; link: string }> {
    return this.request(`/api/agency/${encodeURIComponent(id)}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async revokeAgencyInvite(
    id: string,
    inviteId: string
  ): Promise<{ success: boolean; invite: AgencyInvite }> {
    return this.request(
      `/api/agency/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
      { method: 'DELETE' }
    );
  }

  async getAgencyInvitePreview(
    token: string
  ): Promise<{ success: boolean } & AgencyInvitePreview> {
    return this.request(`/api/agency/invites/${encodeURIComponent(token)}`);
  }

  /**
   * PA0 activation: the invite token authorizes creating (or signing into) an
   * agency account for that tenant. A password is always required so a
   * forwarded link cannot take over an existing account. Never attaches or
   * converts a personal account.
   */
  async acceptAgencyInvite(
    token: string,
    credentials: { email: string; password: string; name?: string }
  ): Promise<
    AgencyAuthSession & {
      alreadyMember: boolean;
      message: string;
    }
  > {
    return this.request(
      `/api/agency/invites/${encodeURIComponent(token)}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
          ...(credentials.name?.trim() ? { name: credentials.name.trim() } : {}),
        }),
      }
    );
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

  /** M7.7: deleted trips the caller still owns, newest deletion first. */
  async getDeletedTrips(): Promise<Trip[]> {
    return this.request('/api/itinerary/trash');
  }

  /** M7.7: recover a soft-deleted trip. Share links and invites stay revoked. */
  async restoreTrip(id: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/restore`, {
      method: 'POST',
    });
  }

  /** M7.7: permanently remove a deleted trip and its chat, polls and receipts. */
  async purgeTrip(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/itinerary/${id}/purge`, {
      method: 'DELETE',
    });
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

  /** Milestone 8 G1/G2 — publish, update gallery copy, or unpublish (owner only). */
  async setTripPublication(
    id: string,
    payload: {
      published: boolean;
      hideExactDates?: boolean;
      summary?: string;
      tags?: string[];
    }
  ): Promise<{ success: boolean; publication: TripPublicationState }> {
    return this.request(`/api/itinerary/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /** Anonymous public profile: name, bio, avatar and published future trips. */
  async getTravelerProfile(
    handle: string
  ): Promise<{ success: boolean; traveler: GalleryTravelerProfile }> {
    return this.request(`/api/travelers/${encodeURIComponent(handle)}`);
  }

  /**
   * Milestone 8 G3 — anonymous gallery listing. Filters map 1:1 to the server
   * schema; `total` is the size of the whole filtered set (not the page), which
   * is what the nav threshold in `useGalleryEnabled` reads.
   */
  async getExplore(
    filters: ExploreFilters = {}
  ): Promise<{ success: boolean } & ExplorePage> {
    const query = new URLSearchParams();
    if (filters.q?.trim()) query.append('q', filters.q.trim());
    if (filters.duration) query.append('duration', filters.duration);
    if (filters.groupType?.trim()) query.append('groupType', filters.groupType.trim());
    if (filters.tag?.trim()) query.append('tags', filters.tag.trim());
    if (filters.cursor) query.append('cursor', filters.cursor);
    if (filters.limit) query.append('limit', String(filters.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/explore${suffix}`);
  }

  /** One public trip page. 404 once unpublished, expired or deleted. */
  async getGalleryTrip(
    tripId: string
  ): Promise<{ success: boolean; trip: GalleryTrip }> {
    return this.request(`/api/explore/${encodeURIComponent(tripId)}`);
  }

  /** M9 D3: anonymous agency directory listing. */
  async getAgencies(
    filters: AgencyDirectoryFilters = {}
  ): Promise<AgencyDirectoryPage> {
    const query = new URLSearchParams();
    if (filters.q?.trim()) query.append('q', filters.q.trim());
    if (filters.city?.trim()) query.append('city', filters.city.trim());
    if (filters.destination?.trim()) {
      query.append('destination', filters.destination.trim());
    }
    if (filters.specialty?.trim()) query.append('specialty', filters.specialty.trim());
    if (filters.language?.trim()) query.append('language', filters.language.trim());
    if (filters.cursor) query.append('cursor', filters.cursor);
    if (filters.limit) query.append('limit', String(filters.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/agencies${suffix}`);
  }

  /** M9 D3: filter chips with counts for the directory page. */
  async getAgencyFacets(): Promise<AgencyDirectoryFacetsResponse> {
    return this.request('/api/agencies/facets');
  }

  /** M9 D3: one published agency profile. 404 once unpublished or suspended. */
  async getPublicAgencyProfile(
    slug: string
  ): Promise<AgencyDirectoryPublicProfileResponse> {
    return this.request(`/api/agencies/${encodeURIComponent(slug)}`);
  }

  /**
   * M9 D5: send an enquiry to a published agency. Anonymous by design — when the
   * visitor happens to be signed in the server also attributes the row to their
   * account, so it appears in `getMyEnquiries`. The response carries an id and
   * status only, never the contact details.
   */
  async submitAgencyEnquiry(
    slug: string,
    payload: AgencyEnquiryInput
  ): Promise<{ success: boolean; enquiry: AgencyEnquiryAcknowledgement }> {
    return this.request(
      `/api/agencies/${encodeURIComponent(slug)}/enquiries`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          phone: payload.phone?.trim() || undefined,
          startDate: payload.startDate || undefined,
          endDate: payload.endDate || undefined,
          flexible: payload.flexible === true,
          packageId: payload.packageId || undefined,
        }),
      }
    );
  }

  /** M9 D5: the signed-in traveller's own enquiry history. */
  async getMyEnquiries(
    filters: { cursor?: string; limit?: number } = {}
  ): Promise<AgencyEnquiryPage> {
    const query = new URLSearchParams();
    if (filters.cursor) query.append('cursor', filters.cursor);
    if (filters.limit) query.append('limit', String(filters.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/enquiries${suffix}`);
  }

  /**
   * Milestone 8 G4 — copy a published trip into a fresh private draft owned by
   * the caller. The server reads only the public projection, records
   * `clonedFrom` attribution and caps clones at 10/day/account.
   */
  async cloneGalleryTrip(tripId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${encodeURIComponent(tripId)}/clone`, {
      method: 'POST',
    });
  }

  /**
   * Milestone 8 G5 — ask the owner of a published trip to join. Approval grants
   * **commenter** only; the server enforces one pending request per trip and
   * 5 requests/day/account, and refuses blocked accounts.
   */
  async requestToJoinTrip(
    tripId: string,
    message?: string
  ): Promise<{ success: boolean; request: TripJoinRequest }> {
    return this.request(`/api/itinerary/${encodeURIComponent(tripId)}/join-request`, {
      method: 'POST',
      body: JSON.stringify({ message: message?.trim() || undefined }),
    });
  }

  /** My latest request for this trip plus membership flags. */
  async getJoinRequestState(
    tripId: string
  ): Promise<{ success: boolean } & JoinRequestState> {
    return this.request(`/api/itinerary/${encodeURIComponent(tripId)}/join-request`);
  }

  /** Withdraw my pending request. */
  async withdrawJoinRequest(
    tripId: string
  ): Promise<{ success: boolean; request: TripJoinRequest }> {
    return this.request(`/api/itinerary/${encodeURIComponent(tripId)}/join-request`, {
      method: 'DELETE',
    });
  }

  /** Owner queue (owner-only server-side). */
  async getJoinRequests(
    tripId: string
  ): Promise<{ success: boolean; requests: TripJoinRequest[] }> {
    return this.request(`/api/itinerary/${encodeURIComponent(tripId)}/join-requests`);
  }

  /** Owner approval — the server always adds a commenter, never an editor. */
  async approveJoinRequest(
    tripId: string,
    requestId: string
  ): Promise<{ success: boolean; request: TripJoinRequest }> {
    return this.request(
      `/api/itinerary/${encodeURIComponent(tripId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
      { method: 'POST' }
    );
  }

  async declineJoinRequest(
    tripId: string,
    requestId: string
  ): Promise<{ success: boolean; request: TripJoinRequest }> {
    return this.request(
      `/api/itinerary/${encodeURIComponent(tripId)}/join-requests/${encodeURIComponent(requestId)}/decline`,
      { method: 'POST' }
    );
  }

  /** Block straight from the queue; the server also declines the request. */
  async blockJoinRequester(
    tripId: string,
    requestId: string
  ): Promise<{ success: boolean; block: BlockedAccount }> {
    return this.request(
      `/api/itinerary/${encodeURIComponent(tripId)}/join-requests/${encodeURIComponent(requestId)}/block`,
      { method: 'POST' }
    );
  }

  // Blocks (Milestone 8 G5) — personal account settings, not trip resources.
  async getBlocks(): Promise<{ success: boolean; blocks: BlockedAccount[] }> {
    return this.request('/api/blocks');
  }

  async blockUser(
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; block: BlockedAccount }> {
    return this.request(`/api/blocks/${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    });
  }

  async unblockUser(
    userId: string
  ): Promise<{ success: boolean; removed: boolean }> {
    return this.request(`/api/blocks/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Milestone 8 G6 — report a published trip or traveler profile. Reporting is
   * an accountable personal action: the server requires a session, caps reports
   * at 10/day and stores one report per reporter+target.
   */
  async reportContent(input: {
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    note?: string;
  }): Promise<ReportResult> {
    return this.request('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      }),
    });
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
