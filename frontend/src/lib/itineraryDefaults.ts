import type { ItineraryData } from "@/types/trip";

/**
 * Fills in typed empty defaults for every section of the AI itinerary shape
 * (`docs/` Milestone 2 prompt contract). Production contains trips generated
 * by earlier prompt versions whose `tripDetails` lack whole sections — they
 * previously 404'd for non-owners, so this only started surfacing once the
 * member backfill made them openable.
 *
 * Deliberately an entire-shape normalizer, not a one-field guard: the next
 * missing section would otherwise be the next crash. Applied at the display
 * boundary (`ItineraryDisplay`) — it never mutates persisted data.
 */

const EMPTY_DAY: ItineraryData["day_by_day_itinerary"][number] = {
  day: 0,
  title: "",
  activities: [],
  stay_recommendations: [],
  transport: [],
  food_spots: [],
  pro_tip: [],
  permit_required: false,
};

const EMPTY_BUDGET: ItineraryData["budget_breakdown"] = {
  accommodation: 0,
  food_and_drinks: 0,
  activities_and_entry: 0,
  local_transport: 0,
  miscellaneous_buffer: 0,
  total: 0,
};

const EMPTY_LOCAL_TRANSPORT: ItineraryData["local_transport"] = {
  walking: "",
  auto_rickshaw: "",
  local_buses: "",
  shared_cabs: "",
  tips: [],
};

const EMPTY_WEATHER: ItineraryData["weather_advisory"] = {
  expected_weather: "",
  packing_tips: [],
  risks: [],
  seasonal_highlights: [],
};

const EMPTY_FOOTNOTES: ItineraryData["footnotes_safety_tips"] = {
  cultural_etiquette: [],
  safety: [],
  payment: { upi: "", cash: "" },
  permits: { rohtang_pass_required: false, apply_online: "" },
  connectivity: { wifi: "", mobile_networks: "" },
};

/** Normalizes one day, tolerating both missing day rows and partial fields. */
function normalizeDay(day: any, index: number): ItineraryData["day_by_day_itinerary"][number] {
  const source = typeof day === "object" && day !== null ? day : {};
  return {
    ...EMPTY_DAY,
    ...source,
    day: Number(source.day) || index + 1,
    activities: Array.isArray(source.activities) ? source.activities : [],
    stay_recommendations: Array.isArray(source.stay_recommendations)
      ? source.stay_recommendations
      : [],
    transport: Array.isArray(source.transport) ? source.transport : [],
    food_spots: Array.isArray(source.food_spots) ? source.food_spots : [],
    pro_tip: Array.isArray(source.pro_tip) ? source.pro_tip : [],
    permit_required: Boolean(source.permit_required),
  };
}

export function withItineraryDefaults(
  input?: Partial<ItineraryData> | null
): ItineraryData {
  const data = typeof input === "object" && input !== null ? input : {};

  return {
    trip_title: data.trip_title || "Your Trip",
    duration_days: Number(data.duration_days) || 1,
    budget_per_person: Number(data.budget_per_person) || 0,
    season: data.season || "",
    group_type: data.group_type || "",
    highlights: Array.isArray(data.highlights) ? data.highlights : [],
    weather_advisory:
      typeof data.weather_advisory === "object" && data.weather_advisory !== null
        ? { ...EMPTY_WEATHER, ...data.weather_advisory }
        : EMPTY_WEATHER,
    day_by_day_itinerary: Array.isArray(data.day_by_day_itinerary)
      ? data.day_by_day_itinerary.map(normalizeDay)
      : [],
    budget_breakdown:
      typeof data.budget_breakdown === "object" && data.budget_breakdown !== null
        ? { ...EMPTY_BUDGET, ...data.budget_breakdown }
        : EMPTY_BUDGET,
    local_transport:
      typeof data.local_transport === "object" && data.local_transport !== null
        ? { ...EMPTY_LOCAL_TRANSPORT, ...data.local_transport }
        : EMPTY_LOCAL_TRANSPORT,
    footnotes_safety_tips:
      typeof data.footnotes_safety_tips === "object" && data.footnotes_safety_tips !== null
        ? { ...EMPTY_FOOTNOTES, ...data.footnotes_safety_tips }
        : EMPTY_FOOTNOTES,
  };
}
