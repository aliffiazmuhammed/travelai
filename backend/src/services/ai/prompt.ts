export function buildPromptText(params: {
  destination: string;
  days: number;
  budget: number;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
}): string {
  const { destination, days, budget, startdate, enddate, interests, groupType } = params;
  const formattedInterests = Array.isArray(interests) ? interests.join(', ') : interests;

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
      "food_spots": ["string"],
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
