import React, { useEffect, useMemo, useState } from "react";
import {
  CloudOff,
  Coffee,
  Fuel,
  Landmark,
  Loader2,
  MapPin,
  Navigation,
  Pill,
  Plus,
  RefreshCw,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { dayAnchor, itineraryAnchor } from "@/lib/weather";
import { formatDistance } from "@/lib/geo";
import type {
  ItineraryData,
  NearbyCategory,
  NearbyPlace,
  NearbyResponse,
} from "@/types/trip";

interface NearbyExplorerProps {
  itinerary: ItineraryData["day_by_day_itinerary"];
  canEdit: boolean;
  /** Publishes the current results so the map can render them as markers. */
  onResults?: (places: NearbyPlace[]) => void;
  /** Appends a nearby place to a day as a new activity. */
  onAddToDay?: (dayNumber: number, place: NearbyPlace) => void;
  /** Shows a busy state on a specific day's "Add" button. */
  busyDay?: number | null;
}

const CATEGORY_META: { id: NearbyCategory; label: string; icon: React.ElementType }[] = [
  { id: "restaurant", label: "Restaurants", icon: UtensilsCrossed },
  { id: "cafe", label: "Cafés", icon: Coffee },
  { id: "attraction", label: "Attractions", icon: Landmark },
  { id: "atm", label: "ATMs", icon: Wallet },
  { id: "pharmacy", label: "Pharmacies", icon: Pill },
  { id: "fuel", label: "Fuel", icon: Fuel },
];

const RADIUS_OPTIONS = [500, 1000, 2000, 5000];

/**
 * "Nearby" panel (Milestone 4.5): finds real places around a chosen day and
 * lets the traveller drop them straight into the itinerary.
 */
export const NearbyExplorer: React.FC<NearbyExplorerProps> = ({
  itinerary,
  canEdit,
  onResults,
  onAddToDay,
  busyDay,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(
    () => itinerary.find((day) => dayAnchor(day))?.day ?? itinerary[0]?.day ?? 1
  );
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [radius, setRadius] = useState<number>(2000);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** True when the lookup failed upstream (vs. genuinely finding nothing). */
  const [unavailable, setUnavailable] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const selectedDayData = useMemo(
    () => itinerary.find((day) => day.day === selectedDay) ?? itinerary[0],
    [itinerary, selectedDay]
  );

  const anchor = useMemo(
    () => dayAnchor(selectedDayData) ?? itineraryAnchor(itinerary),
    [selectedDayData, itinerary]
  );

  useEffect(() => {
    if (!category) {
      setPlaces([]);
      setNote(null);
      setUnavailable(false);
      onResults?.([]);
      return;
    }
    if (!anchor) {
      setPlaces([]);
      setNote(null);
      setUnavailable(false);
      onResults?.([]);
      setError("This itinerary has no located activities to search around.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getNearby(anchor[0], anchor[1], category, radius)
      .then((response: NearbyResponse) => {
        if (cancelled) return;
        const results = response.places || [];
        // `available: false` means the provider could not be reached — an empty
        // list is then "we don't know", not "there is nothing here".
        const failed = response.available === false;
        setPlaces(results);
        setUnavailable(failed);
        setNote(failed ? response.note || null : null);
        onResults?.(results);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlaces([]);
        setNote(null);
        setUnavailable(false);
        onResults?.([]);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Nearby search failed. Please try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, radius, anchor, reloadToken]);

  return (
    <Card className="rounded-2xl border-border/70 bg-card/70 backdrop-blur-sm shadow-xs">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Navigation className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Nearby Places</p>
              <p className="text-[11px] text-muted-foreground font-medium">
                Real places from OpenStreetMap around your day
              </p>
            </div>
          </div>

          {category && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => setReloadToken((token) => token + 1)}
              className="rounded-xl text-xs font-semibold h-8 gap-1.5"
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          )}
        </div>

        {/* Day picker */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {itinerary.map((day) => (
            <Button
              key={day.day}
              type="button"
              size="sm"
              variant={selectedDay === day.day ? "default" : "outline"}
              onClick={() => setSelectedDay(day.day)}
              className={cn(
                "rounded-2xl px-3 h-8 text-[11px] font-bold shrink-0",
                selectedDay === day.day
                  ? "bg-primary text-primary-foreground"
                  : "border-border/80 text-foreground hover:bg-muted/80"
              )}
            >
              Day {day.day}
            </Button>
          ))}
        </div>

        {/* Category + radius */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORY_META.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={category === id ? "default" : "outline"}
              onClick={() => setCategory(category === id ? null : id)}
              className={cn(
                "rounded-2xl h-8 px-3 text-[11px] font-bold gap-1.5",
                category !== id && "border-border/80 text-foreground hover:bg-muted/80"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </Button>
          ))}
        </div>

        {category && (
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span>Within</span>
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRadius(option)}
                className={cn(
                  "px-2 py-0.5 rounded-lg border transition-colors",
                  radius === option
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 hover:bg-muted/70"
                )}
              >
                {option >= 1000 ? `${option / 1000} km` : `${option} m`}
              </button>
            ))}
          </div>
        )}

        {!category && (
          <p className="text-xs text-muted-foreground font-medium py-1">
            Pick a category to find places near Day {selectedDayData?.day ?? selectedDay}.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Searching nearby…</span>
          </div>
        )}

        {!loading && error && (
          <p className="text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && unavailable && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {note || "Nearby search is temporarily unavailable. Please try again in a moment."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setReloadToken((token) => token + 1)}
              className="rounded-xl text-[11px] font-bold h-8 gap-1.5 shrink-0 sm:ml-auto border-amber-400/60 text-amber-800 dark:text-amber-200 hover:bg-amber-500/10"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Try again</span>
            </Button>
          </div>
        )}

        {!loading && !error && !unavailable && category && places.length === 0 && (
          <p className="text-xs text-muted-foreground font-medium py-1">
            No places found nearby. Try a wider radius.
          </p>
        )}

        {!loading && places.length > 0 && (
          <ul className="grid sm:grid-cols-2 gap-2">
            {places.map((place) => (
              <li
                key={place.id}
                className="p-3 rounded-2xl border border-border/60 bg-background/60 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {place.name}
                  </p>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-border/60 shrink-0 font-bold"
                  >
                    {formatDistance(place.distanceKm)}
                  </Badge>
                </div>

                {place.tags?.address && (
                  <p className="text-[11px] text-muted-foreground font-medium inline-flex items-start gap-1">
                    <MapPin className="w-2.5 h-2.5 mt-0.5 text-primary shrink-0" />
                    <span className="line-clamp-2">{place.tags.address}</span>
                  </p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {place.tags?.cuisine && (
                    <span className="text-[10px] font-semibold text-muted-foreground capitalize">
                      {place.tags.cuisine}
                    </span>
                  )}
                  {place.tags?.openingHours && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      · {place.tags.openingHours}
                    </span>
                  )}
                </div>

                {canEdit && onAddToDay && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyDay === selectedDay}
                    onClick={() => onAddToDay(selectedDay, place)}
                    className="rounded-xl h-7 px-2.5 text-[11px] font-bold gap-1 w-full mt-1 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    {busyDay === selectedDay ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    <span>Add to Day {selectedDay}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default NearbyExplorer;
