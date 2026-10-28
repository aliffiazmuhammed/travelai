/**
 * Prompt engineering for the itinerary generator.
 *
 * Milestone 2 (AI Prompt Improvements) adds:
 *  - Multi-language output directives (JSON keys stay English for parsing)
 *  - Interest weighting based on the selected styles
 *  - Seasonal adaptation derived from the travel start date
 *  - Traveller preference injection (pace, dietary, accessibility, avoid-list)
 *  - Personalization from the user's past trips (history summary)
 *  - A/B prompt variants for experimentation
 */

/** Bump whenever the prompt structure meaningfully changes (stored on each trip). */
export const PROMPT_VERSION = 'v2.1';

/* -------------------------------------------------------------------------- */
/*  Languages                                                                  */
/* -------------------------------------------------------------------------- */

export type LanguageCode = 'en' | 'hi' | 'ta' | 'bn' | 'te' | 'mr' | 'kn' | 'ml' | 'gu';

export interface LanguageMeta {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const LANGUAGES: Record<LanguageCode, LanguageMeta> = {
  en: { code: 'en', label: 'English', nativeLabel: 'English' },
  hi: { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  ta: { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  bn: { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  te: { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  mr: { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  kn: { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  ml: { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  gu: { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
};

/** Resolves a language code to its metadata, defaulting to English. */
export function resolveLanguage(code?: string): LanguageMeta {
  const normalized = String(code || 'en').trim().toLowerCase() as LanguageCode;
  return LANGUAGES[normalized] || LANGUAGES.en;
}

/* -------------------------------------------------------------------------- */
/*  Traveller preferences                                                      */
/* -------------------------------------------------------------------------- */

export type TravelPace = 'relaxed' | 'balanced' | 'packed';

export interface TripPreferences {
  pace?: TravelPace;
  dietary?: string[];
  avoid?: string[];
  accessibility?: string[];
}

const PACE_GUIDANCE: Record<TravelPace, string> = {
  relaxed: 'Keep a relaxed pace: 2–3 unhurried activities per day with generous buffers, late starts and long meal breaks.',
  balanced: 'Keep a balanced pace: 3–4 well-spaced activities per day mixing highlights with downtime.',
  packed: 'Keep an action-packed pace: 5–6 activities per day, early starts and efficient routing between nearby spots.',
};

/* -------------------------------------------------------------------------- */
/*  Interest weighting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Typical "activity density" weight per canonical style. Combined with a focus
 * factor so that choosing fewer interests concentrates activities more strongly.
 */
const BASE_INTEREST_WEIGHTS: Record<string, number> = {
  Adventure: 1.15,
  Culture: 1.1,
  Food: 1.15,
  Nature: 1.1,
  Photography: 1.0,
  Nightlife: 0.95,
  Shopping: 0.9,
  Relaxation: 0.95,
};

/**
 * Produces a per-interest weight map (rounded to 2 decimals). Fewer selected
 * interests produce higher individual weights (a more focused trip).
 */
export function computeInterestWeights(interests: string[] | string): Record<string, number> {
  const list = (Array.isArray(interests) ? interests : String(interests).split(','))
    .map((i) => String(i).trim())
    .filter(Boolean);

  if (list.length === 0) return {};

  // Focus factor: 1 interest -> 1.6, 3 -> 1.33, 8 -> 0.6 (clamped)
  const focus = Math.max(0.6, Math.min(1.6, 4 / list.length));

  const weights: Record<string, number> = {};
  for (const interest of list) {
    const base = BASE_INTEREST_WEIGHTS[interest] ?? 1.0;
    weights[interest] = Number((base * focus).toFixed(2));
  }
  return weights;
}

/* -------------------------------------------------------------------------- */
/*  Seasonal adaptation                                                        */
/* -------------------------------------------------------------------------- */

export interface SeasonalContext {
  name: string;
  months: string;
  advisory: string;
  packingHints: string[];
}

function monthFromDate(startdate?: string): number {
  if (startdate) {
    const parsed = new Date(startdate);
    if (!Number.isNaN(parsed.getTime())) return parsed.getMonth() + 1;
  }
  return new Date().getMonth() + 1;
}

/** Derives an India-centric seasonal advisory from the travel start date. */
export function adaptPromptForSeason(startdate?: string, _destination?: string): SeasonalContext {
  const month = monthFromDate(startdate);

  if ([12, 1, 2].includes(month)) {
    return {
      name: 'Winter',
      months: 'December – February',
      advisory:
        'Cold and dry across the north; snow possible in the higher Himalayas. South India is comfortably mild. Mornings and nights are chilly.',
      packingHints: ['Thermal layers', 'Heavy jacket for hills', 'Lip balm & moisturiser', 'Sun protection for daytime'],
    };
  }

  if ([3, 4, 5].includes(month)) {
    return {
      name: 'Summer / Pre-Monsoon',
      months: 'March – May',
      advisory:
        'Hot and dry in the plains. Hill stations and coastal areas are the best choices. Occasional pre-monsoon thunderstorms.',
      packingHints: ['Light cotton clothing', 'Sunscreen SPF 50+', 'Wide-brim hat', 'Reusable water bottle'],
    };
  }

  if ([6, 7, 8, 9].includes(month)) {
    return {
      name: 'Monsoon',
      months: 'June – September',
      advisory:
        'Heavy rainfall; landslide and flash-flood risk in hill regions. Greenery is at its peak and waterfalls are spectacular. Some treks and boat rides may be closed.',
      packingHints: ['Waterproof jacket & poncho', 'Quick-dry footwear', 'Dry bags for electronics', 'Insect repellent'],
    };
  }

  return {
    name: 'Post-Monsoon / Autumn',
    months: 'October – November',
    advisory:
      'Clear skies and pleasant temperatures — widely regarded as the best window for most of India. Festival season may mean higher prices and crowds.',
    packingHints: ['Light layers for cool evenings', 'Comfortable walking shoes', 'Light rain jacket', 'Festival-ready clothing'],
  };
}

/* -------------------------------------------------------------------------- */
/*  Personalization history                                                    */
/* -------------------------------------------------------------------------- */

export interface TripHistorySummary {
  totalTrips: number;
  recentDestinations: string[];
  topInterests: string[];
  avgBudgetPerPerson?: number;
  preferredGroupType?: string;
  likedHighlights?: string[];
  /** Variants ('A' | 'B') of trips the user rated positively. */
  likedVariants?: string[];
}

/* -------------------------------------------------------------------------- */
/*  A/B variants                                                               */
/* -------------------------------------------------------------------------- */

export type PromptVariant = 'A' | 'B';

/** Deterministically assigns a prompt variant (50/50) from the user id. */
export function assignVariant(userId?: string): PromptVariant {
  if (!userId) return 'A';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? 'A' : 'B';
}

const VARIANT_INSTRUCTIONS: Record<PromptVariant, string> = {
  A: 'Favour rich, descriptive detail. Give each activity 2 vivid sentences and add local colour wherever useful.',
  B: 'Favour concise, high-signal output. Give each activity 1 crisp sentence, and concentrate activities around the highest-weighted interests first.',
};

/* -------------------------------------------------------------------------- */
/*  Prompt builder                                                             */
/* -------------------------------------------------------------------------- */

export interface BuildPromptParams {
  destination: string;
  days: number;
  budget: number;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
  language?: LanguageCode | string;
  preferences?: TripPreferences;
  history?: TripHistorySummary | null;
  variant?: PromptVariant;
}

/** Builds the personalization block from a user's past-trip summary. */
function buildHistoryBlock(history?: TripHistorySummary | null): string {
  if (!history || history.totalTrips === 0) return '';

  const lines: string[] = [
    '## Returning Traveller Personalization',
    `This traveller has generated ${history.totalTrips} previous itinerary(ies). Personalise using these signals:`,
  ];

  if (history.recentDestinations?.length) {
    lines.push(`- Recently visited/planned: ${history.recentDestinations.join(', ')}. Avoid repeating the exact same highlights.`);
  }
  if (history.topInterests?.length) {
    lines.push(`- Historically enjoys: ${history.topInterests.join(', ')}. Lean into these where relevant.`);
  }
  if (history.avgBudgetPerPerson) {
    lines.push(`- Typical budget per person: ₹${Math.round(history.avgBudgetPerPerson)}. Match this comfort level in every recommendation.`);
  }
  if (history.preferredGroupType) {
    lines.push(`- Usually travels as: ${history.preferredGroupType}.`);
  }
  if (history.likedHighlights?.length) {
    lines.push(`- Previously loved: ${history.likedHighlights.slice(0, 5).join('; ')}. Suggest complementary experiences.`);
  }

  return lines.join('\n');
}

/** Builds the preference block from pace / dietary / accessibility / avoid inputs. */
function buildPreferenceBlock(prefs?: TripPreferences): string {
  if (!prefs) return '';
  const lines: string[] = [];

  if (prefs.pace && PACE_GUIDANCE[prefs.pace]) {
    lines.push(`- ${PACE_GUIDANCE[prefs.pace]}`);
  }
  if (prefs.dietary?.length) {
    lines.push(`- Dietary requirements: ${prefs.dietary.join(', ')}. EVERY food spot must offer suitable options and mention it.`);
  }
  if (prefs.avoid?.length) {
    lines.push(`- Strictly avoid: ${prefs.avoid.join(', ')}. Do not suggest these anywhere in the itinerary.`);
  }
  if (prefs.accessibility?.length) {
    lines.push(`- Accessibility needs: ${prefs.accessibility.join(', ')}. Choose step-free/accessible options and note them.`);
  }

  if (lines.length === 0) return '';
  return ['## Traveller Preferences', ...lines].join('\n');
}

/**
 * Builds the complete prompt sent to the AI provider. The JSON schema is kept
 * stable (English keys) so downstream parsing/rendering never breaks; only the
 * human-readable *values* follow the requested language.
 */
export function buildPromptText(params: BuildPromptParams): string {
  const {
    destination,
    days,
    budget,
    startdate,
    enddate,
    interests,
    groupType,
    language,
    preferences,
    history,
    variant = 'A',
  } = params;

  const formattedInterests = Array.isArray(interests) ? interests.join(', ') : interests;
  const langMeta = resolveLanguage(language);
  const weights = computeInterestWeights(interests);
  const season = adaptPromptForSeason(startdate, destination);

  const weightBlock =
    Object.keys(weights).length > 0
      ? [
          '## Interest Focus (activity weighting)',
          'Apportion activities roughly in proportion to these weights (higher = more activities):',
          ...Object.entries(weights).map(([interest, weight]) => `- ${interest}: ${weight}`),
        ].join('\n')
      : '';

  const historyBlock = buildHistoryBlock(history);
  const preferenceBlock = buildPreferenceBlock(preferences);

  const languageBlock = [
    '## Output Language',
    langMeta.code === 'en'
      ? 'Write all human-readable text values in clear, natural English.'
      : `Write ALL human-readable text values (titles, descriptions, tips, food names, advice) in ${langMeta.label} (${langMeta.nativeLabel}).`,
    'Keep every JSON key exactly as written below in English — do not translate or rename keys.',
    'Keep numeric values, currency amounts and GPS coordinates unchanged.',
  ].join('\n');

  return `
You are a professional AI travel assistant helping Indian travelers plan customized itineraries.

Please generate a **detailed travel itinerary** for a group of ${groupType}, based on the following preferences:

- Destination: ${destination}
- Number of Days: ${days}
- Start Date: ${startdate}
- End Date: ${enddate}
- Budget: ₹${budget} (Indian Rupees)
- Interests: ${formattedInterests}
- Group Type: ${groupType}

## Seasonal Context (${season.name}, ${season.months})
- ${season.advisory}
- Suggested packing: ${season.packingHints.join(', ')}
Reflect this season accurately in the weather advisory, packing tips and activity choices.

${weightBlock}

${preferenceBlock}

${historyBlock}

${languageBlock}

## Style Directive
${VARIANT_INSTRUCTIONS[variant]}

## Your Output Must Include:

1. **Itinerary Title & Summary**
   - Title for the trip
   - Short description (2–3 lines) summarizing vibe, theme, and budget usage

2. **Weather & Travel Advisory**
   - Current weather Status
   - Packing tips, risks (e.g., landslides), seasonal highlights according to current weather

3. **Day-by-Day Plan**
For each day, include:
- Title for the day (e.g., “Day 1: Arrival in Wayanad & Chembra Peak Trek”)
- **Activities**: Structured objects with realistic geographical details:
  * title: Specific activity name (e.g., "Trek to Chembra Peak & Heart-Shaped Lake")
  * time: Optimal time slot (e.g., "Morning (08:30 AM)")
  * description: 1–2 engaging sentences detailing what to do
  * location_name: Exact location/town name
  * approx_cost: Approximate entry/activity cost in ₹ INR per person (number)
  * coordinates: Real-world GPS [latitude, longitude] numbers (e.g., [11.5516, 76.0874])
- **Stay Recommendations**:
  * ⚠️ **CRITICAL MULTI-DAY STAY RULE**: If travelers stay at the same hotel/homestay for multiple consecutive nights (e.g., Days 1–4), use the **EXACT SAME** hotel name, location, and price across all those days so it correctly groups as a continuous stay. Do not change the name or omit fields on subsequent days.
  * name: Clean hotel/resort/homestay name (e.g., "Green Garden Holiday Home")
  * location: Neighborhood/city (e.g., "Kalpetta, Wayanad")
  * price_per_night: Estimated price range (e.g., "₹1200 - ₹1500")
  * vibe: Brief description of vibe, amenities, and target travelers
  * coordinates: Real-world GPS [latitude, longitude] numbers (e.g., [11.6094, 76.0825])
- **Food Recommendations**: Authentic local restaurants, dhabas, local dishes with locations
- **Transport**: Distance between spots and recommended mode (auto, cab, walking)
- **Pro Tips**: Practical insider advice (best visiting times, permits, crowd avoidance)

4. **Budget Breakdown (₹)**
Split the ₹${budget} per person into:
- Accommodation
- Activities
- Food
- Transport
- Miscellaneous/Buffer

5. **Local Transport Suggestions**
- How to get around (walking, autos, buses, shared cabs)
- Cost-saving tips for intercity or local travel

6. **Footnotes & Safety Tips**
- Cultural etiquette
- Safety suggestions (esp. altitude, monsoon)
- Cash vs UPI tips
- Permit info (if needed for places like Rohtang)
- Internet connectivity

7. **Format**: Use clear markdown with sections and bullet points. Add emoji icons (e.g., 🚗, 🏞️, 🍴) for readability.

Do not include links or markdown links in the response.

Ensure this is written in a natural, local-friendly tone that feels authentic and is easy to follow. Make sure to **fill all details and avoid vague instructions like “explore nearby” or “eat somewhere”** — be specific.

For every "food_spots" entry, keep the meal, venue and area in "name" only (e.g. "Dinner at Artjuna Cafe, Anjuna"). Put the cuisine style in "cuisine" as a short label, and any practical reasoning, dietary notes or ordering tips in "note" as one sentence. Never paste the whole recommendation into "name", and never mention prices.

give the output in this json schema:
{
  "trip_title": "string",
  "duration_days": "number",
  "budget_per_person": "number",
  "season": "string",
  "group_type": "string",
  "highlights": ["string"],

  "weather_advisory": {
    "expected_weather": "string",
    "packing_tips": ["string"],
    "risks": ["string"],
    "seasonal_highlights": ["string"]
  },

  "day_by_day_itinerary": [
    {
      "day": "number",
      "title": "string",
      "activities": [
        {
          "title": "string",
          "time": "string",
          "description": "string",
          "location_name": "string",
          "approx_cost": "number",
          "coordinates": ["number (latitude)", "number (longitude)"]
        }
      ],
      "stay_recommendations": [
        {
          "name": "string",
          "location": "string",
          "price_per_night": "string",
          "vibe": "string",
          "coordinates": ["number (latitude)", "number (longitude)"]
        }
      ],
      "transport": ["string"],
      "food_spots": [
        {
          "name": "string",
          "cuisine": "string",
          "note": "string"
        }
      ],
      "pro_tip": ["string"],
      "permit_required": "boolean"
    }
  ],

  "budget_breakdown": {
    "accommodation": "number",
    "food_and_drinks": "number",
    "activities_and_entry": "number",
    "local_transport": "number",
    "miscellaneous_buffer": "number",
    "total": "number"
  },

  "local_transport": {
    "walking": "string",
    "auto_rickshaw": "string",
    "local_buses": "string",
    "shared_cabs": "string",
    "tips": ["string"]
  },

  "footnotes_safety_tips": {
    "cultural_etiquette": ["string"],
    "safety": ["string"],
    "payment": {
      "upi": "string",
      "cash": "string"
    },
    "permits": {
      "rohtang_pass_required": "boolean",
      "apply_online": "string"
    },
    "connectivity": {
      "wifi": "string",
      "mobile_networks": "string"
    }
  }
}

dont include anything else it should be like a json file
  `;
}

/* -------------------------------------------------------------------------- */
/*  Weather-aware day alternative (Milestone 4.4)                              */
/* -------------------------------------------------------------------------- */

export interface DayAlternativeParams {
  destination: string;
  dayNumber: number;
  dayTitle?: string;
  /** Titles of the activities the traveller already has on that day. */
  activities: string[];
  /** `none` | `low` | `moderate` | `high` (from the weather service). */
  riskLevel?: string;
  advisories?: string[];
  preferences?: TripPreferences;
}

/**
 * Builds a focused prompt asking for a single replacement day. Used by the
 * "Suggest indoor alternative" action on high-risk (rain/heat/wind) days: the
 * response is a strict JSON object with a `rationale` and an `activities` array
 * shaped like the main itinerary's activity items.
 */
export function buildDayAlternativePrompt(params: DayAlternativeParams): string {
  const {
    destination,
    dayNumber,
    dayTitle,
    activities,
    riskLevel = 'none',
    advisories = [],
    preferences,
  } = params;

  const isHighRisk = riskLevel === 'high' || riskLevel === 'moderate';
  const weatherBlock = advisories.length
    ? advisories.map((line) => `- ${line}`).join('\n')
    : '- No significant weather risk.';
  const preferenceBlock = buildPreferenceBlock(preferences);

  return `You are an expert local travel planner for ${destination}.

A traveller already has this plan for **Day ${dayNumber}**${dayTitle ? ` ("${dayTitle}")` : ''}:
${activities.length ? activities.map((title) => `- ${title}`).join('\n') : '- (no activities recorded)'}

## Weather Risk: ${riskLevel.toUpperCase()}
${weatherBlock}

## Task
Replace ONLY Day ${dayNumber} with a ${isHighRisk ? 'weather-safe' : 'fresh and complementary'} alternative.
- ${
    isHighRisk
      ? 'Prioritise INDOOR or covered experiences (museums, galleries, temples, cooking classes, cafés, shopping arcades, spas, indoor markets). Keep outdoor segments short and shelter-adjacent.'
      : 'Keep the day well-paced and offer a different mix from the existing plan.'
  }
- Stay within ${destination} or a short, safe transfer away. Never propose activities that require the risky outdoor conditions the advisories warn about.
- Do not repeat the traveller's existing activities listed above.
- Provide 3 to 4 activities, ordered through the day, each with a realistic approximate cost in Indian Rupees (numbers only).
${preferenceBlock ? `\n${preferenceBlock}\n` : ''}
Reply with ONLY this JSON (no markdown fences, no commentary):
{
  "rationale": "string (1-2 sentences explaining why this alternative suits the conditions)",
  "activities": [
    {
      "title": "string",
      "time": "string (e.g. '9:00 AM')",
      "description": "string (1-2 sentences, specific and practical)",
      "location_name": "string",
      "approx_cost": "number (INR, 0 for free)"
    }
  ]
}`;
}
