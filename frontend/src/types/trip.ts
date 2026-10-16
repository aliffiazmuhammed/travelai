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

export interface Trip {
  _id: string;
  title?: string;
  status?: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted?: boolean;
  tripDetails: ItineraryData;
  createdAt: string;
  updatedAt: string;
}

export interface TripInput {
  destination: string;
  days: number;
  budget: number | string;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
}
