export interface ActivityItem {
  name?: string;
  title?: string;
  time?: string;
  description?: string;
  location?: string;
  location_name?: string;
  approx_cost?: number;
  coordinates?: [number, number];
}

export interface StayItem {
  name: string;
  location?: string;
  price_per_night?: string | number;
  vibe?: string;
  description?: string;
  coordinates?: [number, number];
}

export interface ItineraryData {
  trip_title: string;
  duration_days: number;
  budget_per_person: number;
  season: string;
  group_type: string;
  highlights: string[];
  weather_advisory: {
    expected_weather: string;
    packing_tips: string[];
    risks: string[];
    seasonal_highlights: string[];
  };
  day_by_day_itinerary: {
    day: number;
    title: string;
    activities: (string | ActivityItem)[];
    stay_recommendations: (string | StayItem)[];
    transport: string[];
    food_spots: string[];
    pro_tip: string[];
    permit_required: boolean;
  }[];
  budget_breakdown: {
    accommodation: number;
    food_and_drinks: number;
    activities_and_entry: number;
    local_transport: number;
    miscellaneous_buffer: number;
    total: number;
  };
  local_transport: {
    walking: string;
    auto_rickshaw: string;
    local_buses: string;
    shared_cabs: string;
    tips: string[];
  };
  footnotes_safety_tips: {
    cultural_etiquette: string[];
    safety: string[];
    payment: {
      upi: string;
      cash: string;
    };
    permits: {
      rohtang_pass_required: boolean;
      apply_online: string;
    };
    connectivity: {
      wifi: string;
      mobile_networks: string;
    };
  };
}

export type TripLanguage = 'en' | 'hi' | 'ta' | 'bn' | 'te' | 'mr' | 'kn' | 'ml' | 'gu';

export type TravelPace = 'relaxed' | 'balanced' | 'packed';

export interface TripPreferences {
  pace?: TravelPace;
  dietary?: string[];
  avoid?: string[];
  accessibility?: string[];
}

export interface TripFeedback {
  rating: 'up' | 'down';
  comment?: string;
  submittedAt: string;
}

export interface TripGenerationMeta {
  promptVersion?: string;
  variant?: 'A' | 'B';
  language?: string;
  season?: string;
  interestWeights?: Record<string, number>;
  historyUsed?: boolean;
  provider?: string;
  cached?: boolean;
  qualityScore?: number;
  qualityGrade?: 'excellent' | 'good' | 'fair' | 'poor';
  qualityIssues?: string[];
  generatedAt?: string;
}

export type ExpenseCategory =
  | 'accommodation'
  | 'food_and_drinks'
  | 'activities_and_entry'
  | 'local_transport'
  | 'miscellaneous_buffer'
  | 'other';

export type ExpenseSplitMode = 'none' | 'equal' | 'custom';

export interface ExpenseShare {
  participantId: string;
  amount: number;
}

export interface TripExpense {
  _id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  amountInBase: number;
  exchangeRate: number;
  date: string;
  day?: number;
  paidBy?: string;
  splitMode: ExpenseSplitMode;
  shares: ExpenseShare[];
  notes?: string;
  receiptUrl?: string;
  createdAt: string;
}

export interface TripParticipant {
  _id: string;
  name: string;
  isMe?: boolean;
}

export interface TripFinance {
  baseCurrency: string;
  exchangeRates?: Record<string, number>;
  ratesUpdatedAt?: string;
}

export interface ExpenseInput {
  label: string;
  amount: number;
  category?: ExpenseCategory;
  currency?: string;
  exchangeRate?: number;
  date?: string;
  day?: number;
  paidBy?: string;
  splitMode?: ExpenseSplitMode;
  shares?: ExpenseShare[];
  notes?: string;
}

export type RouteTravelMode = 'walk' | 'bike' | 'drive';

/** A user-drawn path on the map (Milestone 4). */
export interface CustomRoute {
  _id: string;
  name: string;
  day?: number;
  color: string;
  mode: RouteTravelMode;
  points: [number, number][];
  distanceKm: number;
  createdAt: string;
}

export interface RouteInput {
  name: string;
  day?: number | null;
  color?: string;
  mode?: RouteTravelMode;
  points: [number, number][];
}

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
}

export interface CurrencyRateSnapshot {
  success?: boolean;
  base: string;
  provider: string;
  updatedAt: string;
  rates: Record<string, number>;
}

export interface PersonBalance {
  participantId: string;
  name?: string;
  paid: number;
  share: number;
  net: number;
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

/* -------------------------------------------------------------------------- */
/* Weather advisories (Milestone 4.4)                                          */
/* -------------------------------------------------------------------------- */

export type WeatherRiskLevel = "none" | "low" | "moderate" | "high";

export interface DailyWeather {
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  windKph: number | null;
  weatherCode: number | null;
  riskLevel: WeatherRiskLevel;
  advisories: string[];
  source: "forecast" | "seasonal";
}

export interface WeatherResponse {
  success?: boolean;
  days: DailyWeather[];
  provider: string;
  cached?: boolean;
  note?: string;
}

export interface DayAlternative {
  success?: boolean;
  day: number;
  activities: ActivityItem[];
  rationale: string;
  weather?: DailyWeather | null;
  provider?: string;
  cached?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Nearby search (Milestone 4.5)                                               */
/* -------------------------------------------------------------------------- */

export type NearbyCategory =
  | "restaurant"
  | "cafe"
  | "atm"
  | "pharmacy"
  | "fuel"
  | "attraction";

export interface NearbyPlaceTags {
  cuisine?: string;
  openingHours?: string;
  website?: string;
  phone?: string;
  address?: string;
}

export interface NearbyPlace {
  id: string;
  name: string;
  category: NearbyCategory;
  coordinates: [number, number];
  distanceKm: number;
  tags: NearbyPlaceTags;
}

export interface NearbyResponse {
  success?: boolean;
  places: NearbyPlace[];
  provider: string;
  radius: number;
  cached?: boolean;
  /** False when no provider could be reached — `places` is then not authoritative. */
  available?: boolean;
  note?: string;
  /** Attribution required by the provider that served the results. */
  attribution?: string;
  categories?: NearbyCategory[];
}

/* -------------------------------------------------------------------------- */
/* Weather-aware routing (Milestone 4.6)                                       */
/* -------------------------------------------------------------------------- */

export interface WeatherDayFlag {
  day: number;
  riskLevel: WeatherRiskLevel;
  weatherSafe: boolean;
  travelExposureKm: number;
  riskyLegCount: number;
}

export interface RiskyLeg {
  day: number;
  fromIndex: number;
  toIndex: number;
  riskLevel: WeatherRiskLevel;
  km: number;
  minutes: number;
  reason: string;
}

export type WeatherRoutingAction =
  | { kind: "swap_days"; fromDay: number; toDay: number }
  | { kind: "indoor_swap"; day: number };

export interface WeatherRoutingSuggestion {
  type: "swap_days" | "indoor_swap" | "buffer_time";
  day: number;
  withDay?: number;
  severity: WeatherRiskLevel;
  title: string;
  detail: string;
  action?: WeatherRoutingAction;
}

export type WeatherRoutingSuggestionType = WeatherRoutingSuggestion["type"];

export interface WeatherRoutingAnalysis {
  dayFlags: WeatherDayFlag[];
  riskyLegs: RiskyLeg[];
  suggestions: WeatherRoutingSuggestion[];
  summary: {
    riskyDayCount: number;
    totalRiskyLegs: number;
    exposureKm: number;
    worstDay: number | null;
    worstRiskLevel: WeatherRiskLevel;
    headline: string;
  };
}

export interface WeatherRoutingResponse {
  success?: boolean;
  startDate: string | null;
  endDate: string | null;
  weather: {
    provider: string;
    days: DailyWeather[];
    note?: string;
  };
  analysis: WeatherRoutingAnalysis;
}

/** Distance/travel-time result for a sequence of coordinates. */
export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  km: number;
  minutes: number;
}

export interface RouteResult {
  success?: boolean;
  legs: RouteLeg[];
  totalKm: number;
  totalMinutes: number;
  provider: string;
}

export interface Trip {
  _id: string;
  title?: string;
  /** Creator's user id (audit trail; Milestone 6 keeps authorization in members[]). */
  userId?: string;
  /** Planned trip window (drives per-day weather). */
  startDate?: string;
  endDate?: string;
  status?: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted?: boolean;
  version?: number;
  hasEdited?: boolean;
  /** Optimistic-concurrency counter (Milestone 6 §3.6) — moves on every write. */
  rev?: number;
  /** The caller's role on this trip (Milestone 6). Absent for legacy payloads. */
  role?: TripRole;
  /** Member list — visible to every member (used to render "who is on this trip"). */
  members?: TripMemberSummary[];
  tripDetails: ItineraryData;
  promptVersion?: string;
  generationMeta?: TripGenerationMeta;
  feedback?: TripFeedback;
  /** Group travellers used for expense splitting (Milestone 5). */
  participants?: TripParticipant[];
  /** Actual logged expenses against the planned budget (Milestone 5). */
  expenses?: TripExpense[];
  /** Base currency + cached FX rates for the trip (Milestone 5). */
  finance?: TripFinance;
  /** User-drawn custom routes on the map (Milestone 4). */
  customRoutes?: CustomRoute[];
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Collaboration (Milestone 6)                                                 */
/* -------------------------------------------------------------------------- */

export type TripRole = 'owner' | 'editor' | 'commenter' | 'viewer';

/** A member row as returned by `GET /:id/members`. */
export interface TripMember {
  userId: string;
  role: TripRole;
  joinedAt: string;
  /** Email — populated for the owner's view only (F6). */
  email?: string;
  /** True on the caller's own row. */
  isYou?: boolean;
}

/** Embedded member shape on sanitized trip payloads (no email). */
export interface TripMemberSummary {
  userId: string;
  role: TripRole;
  invitedBy?: string;
  joinedAt?: string;
}

/** An invitation as seen in the owner's list — token hints, never raw tokens. */
export interface TripInviteInfo {
  _id: string;
  role: Exclude<TripRole, 'owner'>;
  kind: 'link' | 'email';
  email?: string | null;
  tokenHint: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * F12b: ONE typed itinerary change TravelAI may SUGGEST. Never applied by the
 * bot — a human with edit access taps Apply through the normal save path (PUT
 * with required baseRev → versioned like any edit). Shape mirrors the server
 * `assistantProposalSchema` zod union exactly.
 */
export type AssistantProposal =
  | { kind: "title"; value: string }
  | { kind: "budget"; value: number }
  | { kind: "day_title"; day: number; value: string }
  | { kind: "day_tip"; day: number; value: string };

/** F12b: the JSON envelope encrypted into a bot row when the answer proposes a change. */
export interface BotBubblePayload {
  v: 1;
  text: string;
  proposal: AssistantProposal | null;
}

/**
 * One comment row as returned by the `/comments` endpoints (Milestone 6 §19.5,
 * F6a). `userId` is deliberately NOT on the wire: identity ships as `label`
 * (email local-part) + `isYou`. A tombstone keeps its slot with an empty body.
 * On SSE frames `isYou` is the *author's* view — clients must not trust it
 * (they dedupe by `_id` and know their own rows from POST responses).
 */
export interface TripComment {
  _id: string;
  tripId: string;
  label: string;
  /** Empty string on a tombstone; `<b64 iv>.<b64 ct>` when `e2ee` (F10). */
  body: string;
  /**
   * F10: true → `body` is end-to-end ciphertext ONLY decryptable by members
   * with the trip's conversation key. Absent/false → the legacy plaintext
   * format renders verbatim (no migration: old rows stay plaintext).
   */
  e2ee?: boolean;
  /**
   * F12a: persona flag — this row is a @TravelAI answer the asker's browser
   * encrypted and posted. Rendered as the "TravelAI" participant regardless
   * of the row's actual author.
   */
  bot?: boolean;
  /** Optional day anchor (1..day count); absent = about the trip in general. */
  day?: number;
  /** True on rows authored by the caller (reliable in HTTP responses only). */
  isYou: boolean;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
}

/**
 * A logged decision (Milestone 7, F9) — a comment promoted into a durable
 * "what we agreed" card. The server freezes `body` (a snapshot taken at
 * promotion), so it deliberately SURVIVES the comment being edited or even
 * tombstoned afterwards: decisions are history, not live thread state.
 *
 * `label` is the comment author (whose words are on record);
 * `markedByLabel` is whoever promoted it. On SSE frames `isYou` is the
 * promoter's view — same untrusted-on-frames rule as comments.
 */
export interface TripDecision {
  _id: string;
  tripId: string;
  /** The source comment; keeps the card linkable back to the thread. */
  commentId: string;
  label: string;
  markedByLabel: string;
  /** Snapshot of the comment body at promotion time. */
  body: string;
  /** F10: true → the snapshot body is end-to-end ciphertext. */
  e2ee?: boolean;
  day?: number;
  /** True when the caller promoted it (reliable in HTTP responses only). */
  isYou: boolean;
  createdAt: string;
  deletedAt?: string;
}

/** What the E2EE key state route (F10) returns for `GET /:id/chat/keys`. */
export interface ChatKeyMember {
  userId: string;
  label: string;
  /** Base64 SPKI when this member has published a chat identity. */
  pubKey?: string;
  /** Whether the CURRENT epoch already has an envelope for this member. */
  hasEnvelope: boolean;
}

export interface ChatKeysState {
  /** Current conversation-key epoch; absent until the first bootstrap. */
  epoch?: number;
  /** The caller's own envelope (base64), present when they hold the key. */
  mine?: string;
  members: ChatKeyMember[];
}

/** What a signed-in user sees before accepting an invite. */
export interface InvitePreview {
  trip: { title: string; destination?: string };
  role: Exclude<TripRole, 'owner'>;
  kind: 'link' | 'email';
  invitedBy?: string;
  expiresAt: string;
  emailBoundTo?: string;
}

export interface TripVersionSummary {
  version: number;
  title?: string;
  note?: string;
  savedAt: string;
  days: number;
  budget: number | null;
}

export interface TripVersionsResponse {
  success: boolean;
  currentVersion: number;
  hasEdited: boolean;
  versions: TripVersionSummary[];
}

export interface TripVersionDetails {
  success: boolean;
  version: number;
  title?: string;
  note?: string;
  savedAt: string;
  tripDetails: ItineraryData;
}

export interface TripInput {
  destination: string;
  days: number;
  budget: number | string;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
  language?: TripLanguage;
  preferences?: TripPreferences;
}

export interface TripInsights {
  success: boolean;
  totalTrips: number;
  feedback: { up: number; down: number; total: number };
  avgQualityScore: number | null;
  variantStats: Record<string, { up: number; down: number; count: number }>;
  topDestinations: { name: string; count: number }[];
}
