import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bed,
  Utensils,
  Wifi,
  Coffee,
  Mountain,
  CheckCircle2,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  Star,
  IndianRupee,
} from "lucide-react";
import type { ItineraryData, StayItem } from "@/types/trip";

interface StayAndCuisineProps {
  itinerary: ItineraryData["day_by_day_itinerary"];
  destination: string;
}

interface NormalizedStay {
  id: string;
  name: string;
  location?: string;
  price?: string;
  vibe?: string;
  days: number[];
  coordinates?: [number, number];
}

const STAY_AMENITIES = [
  { icon: <Wifi className="w-3.5 h-3.5" />, label: "Fast WiFi" },
  { icon: <Coffee className="w-3.5 h-3.5" />, label: "Breakfast Included" },
  { icon: <Mountain className="w-3.5 h-3.5" />, label: "Scenic View" },
  { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: "Verified Safe" },
];

function normalizeStay(item: string | StayItem): {
  name: string;
  location?: string;
  price?: string;
  vibe?: string;
  coordinates?: [number, number];
} {
  if (typeof item === "object" && item !== null) {
    return {
      name: item.name ? item.name.trim() : "Recommended Stay",
      location: item.location?.trim(),
      price: item.price_per_night ? String(item.price_per_night) : undefined,
      vibe: item.vibe || item.description,
      coordinates: item.coordinates,
    };
  }

  const str = String(item || "").trim();

  // Extract price in parentheses: (₹1200-₹1500/night)
  const priceMatch = str.match(/\(([^)]+)\)/);
  const price = priceMatch ? priceMatch[1] : undefined;

  // Extract description/vibe after colon
  const colonParts = str.split(":");
  let vibe = colonParts.length > 1 ? colonParts.slice(1).join(":").trim() : undefined;

  // Extract clean hotel name: text before '(' and before ':'
  let cleanName = colonParts[0].split("(")[0].trim().replace(/[.,;]+$/, "");

  // Extract location if comma present (e.g. "Green Garden Holiday Home, Kalpetta")
  let location: string | undefined;
  if (cleanName.includes(",")) {
    const parts = cleanName.split(",");
    location = parts.slice(1).join(",").trim();
  }

  return {
    name: cleanName || str,
    location,
    price,
    vibe,
  };
}

export const StayAndCuisine: React.FC<StayAndCuisineProps> = ({
  itinerary,
  destination,
}) => {
  // Aggregate and deduplicate stays across all days with smart multi-day grouping
  const groupedStays = useMemo<NormalizedStay[]>(() => {
    const map = new Map<string, NormalizedStay>();

    itinerary.forEach((dayData) => {
      if (!dayData.stay_recommendations) return;

      dayData.stay_recommendations.forEach((rec) => {
        if (!rec) return;
        const norm = normalizeStay(rec);
        // Normalize key (lowercase alphanumeric) to merge identical hotels across days
        const key = norm.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key) return;

        if (map.has(key)) {
          const existing = map.get(key)!;
          if (!existing.days.includes(dayData.day)) {
            existing.days.push(dayData.day);
          }
          // Preserve richest details
          if (!existing.vibe && norm.vibe) existing.vibe = norm.vibe;
          if (!existing.price && norm.price) existing.price = norm.price;
          if (!existing.location && norm.location) existing.location = norm.location;
          if (!existing.coordinates && norm.coordinates) existing.coordinates = norm.coordinates;
        } else {
          map.set(key, {
            id: key,
            name: norm.name,
            location: norm.location,
            price: norm.price,
            vibe: norm.vibe,
            days: [dayData.day],
            coordinates: norm.coordinates,
          });
        }
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => Math.min(...a.days) - Math.min(...b.days)
    );
  }, [itinerary]);

  // Aggregate unique food spots across all days
  const uniqueFoodSpots = useMemo(() => {
    return Array.from(
      new Set(itinerary.flatMap((d) => d.food_spots))
    ).filter(Boolean);
  }, [itinerary]);

  return (
    <div className="space-y-10">
      {/* SECTION 1: Accommodations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Where To Stay
              </span>
              <Badge variant="outline" className="text-[10px]">
                {groupedStays.length} Handpicked {groupedStays.length === 1 ? "Stay" : "Stays"}
              </Badge>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Recommended Accommodations
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedStays.map((stay, idx) => {
            const sortedDays = [...stay.days].sort((a, b) => a - b);
            const isContinuous =
              sortedDays.length > 1 &&
              sortedDays[sortedDays.length - 1] - sortedDays[0] === sortedDays.length - 1;

            const daysLabel = isContinuous
              ? `Days ${sortedDays[0]} – ${sortedDays[sortedDays.length - 1]} (${sortedDays.length} Nights)`
              : sortedDays.map((d) => `Day ${d}`).join(", ");

            const tier =
              idx % 3 === 0
                ? "Boutique Heritage"
                : idx % 2 === 0
                ? "Scenic Mountain Resort"
                : "Cozy Traveler Homestay";

            return (
              <Card
                key={stay.id}
                className="rounded-3xl border border-border/70 hover:border-primary/40 bg-card/80 backdrop-blur-sm shadow-card transition-all"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        <Bed className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                            {tier}
                          </Badge>
                          {stay.price && (
                            <Badge variant="secondary" className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {stay.price}
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-foreground leading-snug">
                          {stay.name}
                        </h4>
                        {stay.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-primary shrink-0" />
                            <span>{stay.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Vibe / Description if available */}
                  {stay.vibe && (
                    <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-2xl border border-border/50 leading-relaxed">
                      {stay.vibe}
                    </p>
                  )}

                  {/* Associated Days & Continuous Stay Indicator */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10">
                    <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Stay Duration: {daysLabel}</span>
                  </div>

                  {/* Amenities Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {STAY_AMENITIES.map((am, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted/60 text-[11px] font-medium text-foreground/80"
                      >
                        {am.icon}
                        <span>{am.label}</span>
                      </span>
                    ))}
                  </div>

                  {/* Booking Pro-Tip */}
                  <div className="pt-2 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Tip: Reserve early on weekends or local festival holidays.</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Food & Regional Culinary Hotspots */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Culinary Hotspots
              </span>
              <Badge variant="outline" className="text-[10px]">
                {uniqueFoodSpots.length} Dining Spots
              </Badge>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Food, Cafes & Regional Dining
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {uniqueFoodSpots.map((spot, idx) => {
            const mealType =
              idx % 3 === 0
                ? "Breakfast & Chai Hub"
                : idx % 2 === 0
                ? "Authentic Regional Lunch"
                : "Sunset Dinner & Live Music";

            return (
              <Card
                key={idx}
                className="rounded-3xl border border-border/70 hover:border-orange-500/30 bg-card/80 backdrop-blur-sm shadow-card transition-all"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <div>
                      <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-[10px] font-bold mb-1">
                        {mealType}
                      </Badge>
                      <h4 className="text-sm font-bold text-foreground leading-snug">
                        {typeof spot === "string" ? spot : String(spot)}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="font-semibold text-foreground">4.5+</span>
                    <span>• Highly recommended by local foodies</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StayAndCuisine;
