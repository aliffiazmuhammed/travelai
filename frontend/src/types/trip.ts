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
  status?: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted?: boolean;
  version?: number;
  hasEdited?: boolean;
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
