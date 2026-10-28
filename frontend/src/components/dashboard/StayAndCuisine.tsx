import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bed,
  Utensils,
  MapPin,
  Clock,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FoodItem, ItineraryData, StayItem } from "@/types/trip";

interface StayAndCuisineProps {
  itinerary: ItineraryData["day_by_day_itinerary"];
  /**
   * Present only for trip editors (owners, editors, agency staff with edit
   * access). Stays are saved through the itinerary autosave path, so the
   * revision guard and version snapshots apply exactly as for day edits.
   */
  onUpdateItinerary?: (itinerary: ItineraryData["day_by_day_itinerary"]) => void;
}

interface NormalizedStay {
  id: string;
  name: string;
  location?: string;
  price?: string;
  vibe?: string;
  days: number[];
  raw: string | StayItem;
}

interface StayDraft {
  name: string;
  location: string;
  price: string;
  vibe: string;
  days: number[];
}

interface NormalizedFood {
  id: string;
  name: string;
  cuisine?: string;
  price?: string;
  note?: string;
  days: number[];
  raw: string | FoodItem;
}

interface FoodDraft {
  name: string;
  cuisine: string;
  price: string;
  note: string;
  days: number[];
}

function normalizeStay(item: string | StayItem): {
  name: string;
  location?: string;
  price?: string;
  vibe?: string;
} {
  if (typeof item === "object" && item !== null) {
    return {
      name: item.name ? item.name.trim() : "Recommended Stay",
      location: item.location?.trim(),
      price: item.price_per_night ? String(item.price_per_night) : undefined,
      vibe: item.vibe || item.description,
    };
  }

  const str = String(item || "").trim();

  // Extract price in parentheses: (₹1200-₹1500/night)
  const priceMatch = str.match(/\(([^)]+)\)/);
  const price = priceMatch ? priceMatch[1] : undefined;

  // Extract description/vibe after colon
  const colonParts = str.split(":");
  const vibe = colonParts.length > 1 ? colonParts.slice(1).join(":").trim() : undefined;

  // Extract clean hotel name: text before '(' and before ':'
  const cleanName = colonParts[0].split("(")[0].trim().replace(/[.,;]+$/, "");

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

function stayKey(item: string | StayItem): string {
  return normalizeStay(item).name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeFood(item: string | FoodItem): {
  name: string;
  cuisine?: string;
  price?: string;
  note?: string;
} {
  if (typeof item === "object" && item !== null) {
    return {
      name: item.name ? item.name.trim() : "Recommended Spot",
      cuisine: item.cuisine?.trim() || undefined,
      price: item.price ? String(item.price).trim() || undefined : undefined,
      note: item.note?.trim() || undefined,
    };
  }
  return { name: String(item || "").trim() };
}

function foodKey(item: string | FoodItem): string {
  return normalizeFood(item).name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dayLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return "no nights";
  const continuous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  if (continuous && sorted.length > 2) {
    return `Days ${sorted[0]} – ${sorted[sorted.length - 1]}`;
  }
  return sorted.map((day) => `Day ${day}`).join(" & ");
}

function setOrClear(
  entry: StayItem,
  key: "location" | "price_per_night" | "vibe",
  value: string
) {
  const trimmed = value.trim();
  if (trimmed) {
    entry[key] = trimmed;
  } else {
    delete entry[key];
  }
}

const emptyDraft = (firstDay?: number): StayDraft => ({
  name: "",
  location: "",
  price: "",
  vibe: "",
  days: firstDay == null ? [] : [firstDay],
});

const emptyFoodDraft = (firstDay?: number): FoodDraft => ({
  name: "",
  cuisine: "",
  price: "",
  note: "",
  days: firstDay == null ? [] : [firstDay],
});

const DayPicker: React.FC<{
  days: number[];
  selected: number[];
  onToggle: (day: number) => void;
}> = ({ days, selected, onToggle }) => (
  <div className="flex flex-wrap gap-1.5">
    {days.map((day) => {
      const active = selected.includes(day);
      return (
        <button
          key={day}
          type="button"
          aria-pressed={active}
          aria-label={`Day ${day}`}
          onClick={() => onToggle(day)}
          className={cn(
            "h-8 px-3 rounded-xl text-xs font-semibold border transition-colors",
            active
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/40"
          )}
        >
          Day {day}
        </button>
      );
    })}
  </div>
);

export const StayAndCuisine: React.FC<StayAndCuisineProps> = ({
  itinerary,
  onUpdateItinerary,
}) => {
  const canEdit = Boolean(onUpdateItinerary);
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<NormalizedStay | null>(null);
  const [foodDraft, setFoodDraft] = useState<FoodDraft | null>(null);
  const [editingFoodKey, setEditingFoodKey] = useState<string | null>(null);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [removeFoodTarget, setRemoveFoodTarget] = useState<NormalizedFood | null>(null);

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
        } else {
          map.set(key, {
            id: key,
            name: norm.name,
            location: norm.location,
            price: norm.price,
            vibe: norm.vibe,
            days: [dayData.day],
            raw: rec,
          });
        }
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => Math.min(...a.days) - Math.min(...b.days)
    );
  }, [itinerary]);

  // Aggregate unique food spots across all days, keeping the days each one serves
  const foodSpots = useMemo<NormalizedFood[]>(() => {
    const map = new Map<string, NormalizedFood>();

    itinerary.forEach((dayData) => {
      (dayData.food_spots || []).forEach((spot) => {
        if (!spot) return;
        const norm = normalizeFood(spot);
        if (!norm.name) return;
        const key = norm.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key) return;

        const existing = map.get(key);
        if (existing) {
          if (!existing.days.includes(dayData.day)) existing.days.push(dayData.day);
          if (!existing.cuisine && norm.cuisine) existing.cuisine = norm.cuisine;
          if (!existing.price && norm.price) existing.price = norm.price;
          if (!existing.note && norm.note) existing.note = norm.note;
        } else {
          map.set(key, {
            id: key,
            name: norm.name,
            cuisine: norm.cuisine,
            price: norm.price,
            note: norm.note,
            days: [dayData.day],
            raw: spot,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.days[0] - b.days[0]);
  }, [itinerary]);

  const openAdd = () => {
    setEditingKey(null);
    setDraftError(null);
    setDraft(emptyDraft(itinerary[0]?.day));
  };

  const openEdit = (stay: NormalizedStay) => {
    setEditingKey(stay.id);
    setDraftError(null);
    setDraft({
      name: stay.name,
      location: stay.location ?? "",
      price: stay.price ?? "",
      vibe: stay.vibe ?? "",
      days: [...stay.days].sort((a, b) => a - b),
    });
  };

  const closeDraft = () => {
    setDraft(null);
    setEditingKey(null);
    setDraftError(null);
  };

  const toggleDraftDay = (day: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort((a, b) => a - b),
    });
  };

  const saveDraft = () => {
    if (!draft || !onUpdateItinerary) return;
    const name = draft.name.trim();
    if (!name) {
      setDraftError("Give the stay a name so travellers know where they're sleeping.");
      return;
    }
    if (draft.days.length === 0) {
      setDraftError("Pick at least one night for this stay.");
      return;
    }
    const nextKey = stayKey(name);
    if (
      editingKey === null &&
      groupedStays.some((stay) => stay.id === nextKey)
    ) {
      setDraftError("That stay is already on the trip — edit its card instead.");
      return;
    }

    const source = groupedStays.find((stay) => stay.id === editingKey);
    const template =
      source?.raw && typeof source.raw === "object" ? source.raw : undefined;

    const next = itinerary.map((dayData) => {
      const kept = (dayData.stay_recommendations || []).filter((rec) => {
        if (!rec) return false;
        const key = stayKey(rec);
        return key !== editingKey && key !== nextKey;
      });

      if (!draft.days.includes(dayData.day)) {
        return { ...dayData, stay_recommendations: kept };
      }

      const entry: StayItem = { ...(template ?? { name }) };
      entry.name = name;
      setOrClear(entry, "location", draft.location);
      setOrClear(entry, "price_per_night", draft.price);
      setOrClear(entry, "vibe", draft.vibe);

      return { ...dayData, stay_recommendations: [...kept, entry] };
    });

    onUpdateItinerary(next);
    toast.success(source ? `Updated ${name}` : `Added ${name}`);
    closeDraft();
  };

  const removeStay = (stay: NormalizedStay) => {
    if (!onUpdateItinerary) return;
    onUpdateItinerary(
      itinerary.map((dayData) => ({
        ...dayData,
        stay_recommendations: (dayData.stay_recommendations || []).filter(
          (rec) => rec && stayKey(rec) !== stay.id
        ),
      }))
    );
    setRemoveTarget(null);
    toast.success(`Removed ${stay.name}`);
  };

  const openAddFood = () => {
    setEditingFoodKey(null);
    setFoodError(null);
    setFoodDraft(emptyFoodDraft(itinerary[0]?.day));
  };

  const openEditFood = (spot: NormalizedFood) => {
    setEditingFoodKey(spot.id);
    setFoodError(null);
    setFoodDraft({
      name: spot.name,
      cuisine: spot.cuisine ?? "",
      price: spot.price ?? "",
      note: spot.note ?? "",
      days: [...spot.days].sort((a, b) => a - b),
    });
  };

  const closeFoodDraft = () => {
    setFoodDraft(null);
    setEditingFoodKey(null);
    setFoodError(null);
  };

  const toggleFoodDay = (day: number) => {
    if (!foodDraft) return;
    setFoodDraft({
      ...foodDraft,
      days: foodDraft.days.includes(day)
        ? foodDraft.days.filter((d) => d !== day)
        : [...foodDraft.days, day].sort((a, b) => a - b),
    });
  };

  const saveFoodDraft = () => {
    if (!foodDraft || !onUpdateItinerary) return;
    const name = foodDraft.name.trim();
    if (!name) {
      setFoodError("Give the spot a name so travellers can find it.");
      return;
    }
    if (foodDraft.days.length === 0) {
      setFoodError("Pick at least one day for this spot.");
      return;
    }
    const nextKey = foodKey(name);
    if (
      editingFoodKey === null &&
      foodSpots.some((spot) => spot.id === nextKey)
    ) {
      setFoodError("That spot is already on the trip — edit its card instead.");
      return;
    }

    const source = foodSpots.find((spot) => spot.id === editingFoodKey);
    const template =
      source?.raw && typeof source.raw === "object" ? source.raw : undefined;

    const next = itinerary.map((dayData) => {
      const kept = (dayData.food_spots || []).filter((rec) => {
        if (!rec) return false;
        const key = foodKey(rec);
        return key !== editingFoodKey && key !== nextKey;
      });

      if (!foodDraft.days.includes(dayData.day)) {
        return { ...dayData, food_spots: kept };
      }

      const entry: FoodItem = { ...(template ?? { name }) };
      entry.name = name;
      const cuisine = foodDraft.cuisine.trim();
      const price = foodDraft.price.trim();
      const note = foodDraft.note.trim();
      if (cuisine) entry.cuisine = cuisine;
      else delete entry.cuisine;
      if (price) entry.price = price;
      else delete entry.price;
      if (note) entry.note = note;
      else delete entry.note;

      return { ...dayData, food_spots: [...kept, entry] };
    });

    onUpdateItinerary(next);
    toast.success(source ? `Updated ${name}` : `Added ${name}`);
    closeFoodDraft();
  };

  const removeFoodSpot = (spot: NormalizedFood) => {
    if (!onUpdateItinerary) return;
    onUpdateItinerary(
      itinerary.map((dayData) => ({
        ...dayData,
        food_spots: (dayData.food_spots || []).filter(
          (rec) => rec && foodKey(rec) !== spot.id
        ),
      }))
    );
    setRemoveFoodTarget(null);
    toast.success(`Removed ${spot.name}`);
  };

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
                {groupedStays.length} {groupedStays.length === 1 ? "Stay" : "Stays"}
              </Badge>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Recommended Accommodations
            </h3>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 h-9 text-xs font-semibold"
              onClick={openAdd}
            >
              <Plus className="w-3.5 h-3.5" />
              Add a stay
            </Button>
          )}
        </div>

        {groupedStays.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border bg-card/60">
            <CardContent className="p-8 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
                <Bed className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-foreground">No beds picked out yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {canEdit
                  ? "Add the places you'd actually book and say why — travellers trust that more than a brochure."
                  : "The planner didn't suggest any stays for this trip."}
              </p>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  className="rounded-xl gap-1.5 h-9 text-xs font-semibold mt-2"
                  onClick={openAdd}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add the first stay
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupedStays.map((stay) => {
              const sortedDays = [...stay.days].sort((a, b) => a - b);
              const isContinuous =
                sortedDays.length > 1 &&
                sortedDays[sortedDays.length - 1] - sortedDays[0] === sortedDays.length - 1;

              const daysLabel = isContinuous
                ? `Days ${sortedDays[0]} – ${sortedDays[sortedDays.length - 1]} (${sortedDays.length} Nights)`
                : sortedDays.map((d) => `Day ${d}`).join(", ");

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
                          {stay.price && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                            >
                              {stay.price}
                            </Badge>
                          )}
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
                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={`Edit ${stay.name}`}
                            aria-label={`Edit ${stay.name}`}
                            className="h-8 w-8 text-muted-foreground hover:text-primary rounded-lg"
                            onClick={() => openEdit(stay)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={`Remove ${stay.name}`}
                            aria-label={`Remove ${stay.name}`}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => setRemoveTarget(stay)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
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
                {foodSpots.length} {foodSpots.length === 1 ? "Spot" : "Spots"}
              </Badge>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Food, Cafes & Regional Dining
            </h3>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 h-9 text-xs font-semibold"
              onClick={openAddFood}
            >
              <Plus className="w-3.5 h-3.5" />
              Add a spot
            </Button>
          )}
        </div>

        {foodSpots.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border bg-card/60">
            <CardContent className="p-8 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
                <Utensils className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-foreground">No dining picks yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {canEdit
                  ? "Add the tables you'd actually send people to — the dish to order beats a star rating."
                  : "The planner didn't suggest any food spots for this trip."}
              </p>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  className="rounded-xl gap-1.5 h-9 text-xs font-semibold mt-2"
                  onClick={openAddFood}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add the first spot
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {foodSpots.map((spot) => (
              <Card
                key={spot.id}
                className="rounded-3xl border border-border/70 hover:border-orange-500/30 bg-card/80 backdrop-blur-sm shadow-card transition-all"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Utensils className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {spot.cuisine && (
                            <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-[10px] font-bold">
                              {spot.cuisine}
                            </Badge>
                          )}
                          {spot.price && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                            >
                              {spot.price}
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-foreground leading-snug">
                          {spot.name}
                        </h4>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title={`Edit ${spot.name}`}
                          aria-label={`Edit ${spot.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-primary rounded-lg"
                          onClick={() => openEditFood(spot)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title={`Remove ${spot.name}`}
                          aria-label={`Remove ${spot.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                          onClick={() => setRemoveFoodTarget(spot)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {spot.note && (
                    <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-2xl border border-border/50 leading-relaxed">
                      {spot.note}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {[...spot.days]
                      .sort((a, b) => a - b)
                      .map((day) => (
                        <span
                          key={day}
                          className="inline-flex items-center rounded-lg bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                        >
                          Day {day}
                        </span>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Stay editor (owners, editors, agency staff with edit access) */}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) closeDraft();
        }}
      >
        <DialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingKey ? "Edit stay" : "Add a stay"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {editingKey
                ? "Update what travellers see — the name, the area, the rate and why you like it."
                : "Pick the nights it covers. Travellers see the name, area, rate and your one-liner."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              saveDraft();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="stay-name" className="text-xs font-semibold">
                Stay name
              </Label>
              <Input
                id="stay-name"
                value={draft?.name ?? ""}
                autoFocus
                placeholder="e.g. Kotagiri Homestay"
                className="h-10 text-sm"
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stay-area" className="text-xs font-semibold">
                  Area or neighbourhood
                </Label>
                <Input
                  id="stay-area"
                  value={draft?.location ?? ""}
                  placeholder="e.g. Fort Kochi"
                  className="h-10 text-sm"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, location: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stay-price" className="text-xs font-semibold">
                  Price per night
                </Label>
                <Input
                  id="stay-price"
                  value={draft?.price ?? ""}
                  placeholder="e.g. ₹2,800 / night"
                  className="h-10 text-sm"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, price: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stay-why" className="text-xs font-semibold">
                Why it's worth it
              </Label>
              <Textarea
                id="stay-why"
                value={draft?.vibe ?? ""}
                placeholder="e.g. Family-run, quiet garden, filter coffee at sunrise."
                className="min-h-[70px] text-sm rounded-xl"
                maxLength={280}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, vibe: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Which nights?</Label>
              <DayPicker
                days={itinerary.map((dayData) => dayData.day)}
                selected={draft?.days ?? []}
                onToggle={toggleDraftDay}
              />
            </div>

            {draftError && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {draftError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-xs font-semibold h-10"
                onClick={closeDraft}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="hero"
                className="rounded-xl text-xs font-semibold h-10"
              >
                {editingKey ? "Save stay" : "Add stay"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Remove {removeTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              It comes off {removeTarget ? dayLabel(removeTarget.days) : "this trip"} for
              this trip. You can add it back any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl text-xs font-semibold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeStay(removeTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Food spot editor */}
      <Dialog
        open={foodDraft !== null}
        onOpenChange={(open) => {
          if (!open) closeFoodDraft();
        }}
      >
        <DialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingFoodKey ? "Edit food spot" : "Add a food spot"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {editingFoodKey
                ? "Update what travellers see — the place, what it serves, the price and your one-liner."
                : "Pick the days it fits. Travellers see the name, what it serves, the price and your one-liner."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              saveFoodDraft();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="food-name" className="text-xs font-semibold">
                Place name
              </Label>
              <Input
                id="food-name"
                value={foodDraft?.name ?? ""}
                autoFocus
                placeholder="e.g. Cervejaria Ramiro"
                className="h-10 text-sm"
                onChange={(event) =>
                  setFoodDraft((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="food-cuisine" className="text-xs font-semibold">
                  What it serves
                </Label>
                <Input
                  id="food-cuisine"
                  value={foodDraft?.cuisine ?? ""}
                  placeholder="e.g. Garlic prawns, seafood rice"
                  className="h-10 text-sm"
                  onChange={(event) =>
                    setFoodDraft((current) =>
                      current ? { ...current, cuisine: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="food-price" className="text-xs font-semibold">
                  Price
                </Label>
                <Input
                  id="food-price"
                  value={foodDraft?.price ?? ""}
                  placeholder="e.g. €30 for two"
                  className="h-10 text-sm"
                  onChange={(event) =>
                    setFoodDraft((current) =>
                      current ? { ...current, price: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="food-note" className="text-xs font-semibold">
                Why it's worth a stop
              </Label>
              <Textarea
                id="food-note"
                value={foodDraft?.note ?? ""}
                placeholder="e.g. Go before 7pm or queue outside with the locals."
                className="min-h-[70px] text-sm rounded-xl"
                maxLength={280}
                onChange={(event) =>
                  setFoodDraft((current) =>
                    current ? { ...current, note: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Which days?</Label>
              <DayPicker
                days={itinerary.map((dayData) => dayData.day)}
                selected={foodDraft?.days ?? []}
                onToggle={toggleFoodDay}
              />
            </div>

            {foodError && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {foodError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-xs font-semibold h-10"
                onClick={closeFoodDraft}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="hero"
                className="rounded-xl text-xs font-semibold h-10"
              >
                {editingFoodKey ? "Save spot" : "Add spot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeFoodTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveFoodTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Remove {removeFoodTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              It comes off {removeFoodTarget ? dayLabel(removeFoodTarget.days) : "this trip"}{" "}
              for this trip. You can add it back any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl text-xs font-semibold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeFoodTarget && removeFoodSpot(removeFoodTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StayAndCuisine;
