import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  MapPin,
  Utensils,
  Bed,
  Car,
  Ticket,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Compass,
  Camera,
  Coffee,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItineraryData } from "@/types/trip";

interface DayTimelineProps {
  itinerary: ItineraryData["day_by_day_itinerary"];
  onUpdateItinerary?: (updated: ItineraryData["day_by_day_itinerary"]) => void;
}

const TIME_OF_DAY = [
  { label: "Morning", icon: <Sun className="w-3.5 h-3.5 text-amber-500" /> },
  { label: "Afternoon", icon: <Compass className="w-3.5 h-3.5 text-blue-500" /> },
  { label: "Sunset / Evening", icon: <Sunset className="w-3.5 h-3.5 text-orange-500" /> },
  { label: "Night", icon: <Moon className="w-3.5 h-3.5 text-indigo-500" /> },
];

export const DayTimeline: React.FC<DayTimelineProps> = ({
  itinerary,
  onUpdateItinerary,
}) => {
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [editingActivityIndex, setEditingActivityIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [newActivityText, setNewActivityText] = useState<string>("");
  const [activeNewDay, setActiveNewDay] = useState<number | null>(null);

  const daysToShow =
    selectedDay === "all"
      ? itinerary
      : itinerary.filter((d) => d.day === selectedDay);

  // Edit Activity Handlers
  const handleStartEdit = (dayIndex: number, actIndex: number, currentText: string) => {
    setEditingDayIndex(dayIndex);
    setEditingActivityIndex(actIndex);
    setEditingText(currentText);
  };

  const handleSaveEdit = (dayIndex: number, actIndex: number) => {
    if (!onUpdateItinerary || !editingText.trim()) return;
    const cloned = JSON.parse(JSON.stringify(itinerary));
    const current = cloned[dayIndex].activities[actIndex];
    if (typeof current === "object" && current !== null) {
      current.title = editingText.trim();
    } else {
      cloned[dayIndex].activities[actIndex] = editingText.trim();
    }
    onUpdateItinerary(cloned);
    setEditingDayIndex(null);
    setEditingActivityIndex(null);
    setEditingText("");
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number) => {
    if (!onUpdateItinerary) return;
    const cloned = JSON.parse(JSON.stringify(itinerary));
    cloned[dayIndex].activities.splice(actIndex, 1);
    onUpdateItinerary(cloned);
  };

  const handleAddActivity = (dayIndex: number) => {
    if (!onUpdateItinerary || !newActivityText.trim()) return;
    const cloned = JSON.parse(JSON.stringify(itinerary));
    cloned[dayIndex].activities.push(newActivityText.trim());
    onUpdateItinerary(cloned);
    setNewActivityText("");
    setActiveNewDay(null);
  };

  return (
    <div className="space-y-8">
      {/* Horizontal Day Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <Button
          type="button"
          size="sm"
          variant={selectedDay === "all" ? "default" : "outline"}
          onClick={() => setSelectedDay("all")}
          className={cn(
            "rounded-2xl px-4 text-xs font-bold shrink-0 transition-all",
            selectedDay === "all"
              ? "bg-primary text-primary-foreground shadow-md"
              : "border-border/80 hover:bg-muted/80 text-foreground"
          )}
        >
          All Days ({itinerary.length})
        </Button>

        {itinerary.map((d) => (
          <Button
            key={d.day}
            type="button"
            size="sm"
            variant={selectedDay === d.day ? "default" : "outline"}
            onClick={() => setSelectedDay(d.day)}
            className={cn(
              "rounded-2xl px-4 text-xs font-bold shrink-0 transition-all flex items-center gap-1.5",
              selectedDay === d.day
                ? "bg-primary text-primary-foreground shadow-md"
                : "border-border/80 hover:bg-muted/80 text-foreground"
            )}
          >
            <span>Day {d.day}</span>
            {d.permit_required && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </Button>
        ))}
      </div>

      {/* Vertical Timeline Feed */}
      <div className="relative pl-12 sm:pl-16 space-y-12 before:absolute before:left-4 sm:before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-accent before:to-muted">
        {daysToShow.map((dayData) => {
          const actualDayIndex = itinerary.findIndex((d) => d.day === dayData.day);
          const cleanTitle = dayData.title.replace(/^day\s*\d+\s*[:\-–]\s*/i, "");

          return (
            <div key={dayData.day} className="relative space-y-6">
              {/* Day Milestone Marker (Centered on vertical timeline line with safe spacing) */}
              <div className="absolute -left-12 sm:-left-16 top-0 w-8 sm:w-10 flex items-center justify-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-sky-500 to-primary text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-md ring-4 ring-background">
                  {dayData.day}
                </div>
              </div>

              {/* Day Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
                      Day {dayData.day}
                    </span>
                    {dayData.permit_required && (
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-300 dark:border-amber-700 text-[10px] font-semibold gap-1">
                        <Ticket className="w-3 h-3" />
                        <span>Permit Required</span>
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                    {cleanTitle}
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>{dayData.activities.length} Key Activities</span>
                </div>
              </div>

              {/* Activities Flow */}
              <div className="space-y-3">
                {dayData.activities.map((activity, actIdx) => {
                  const isEditing =
                    editingDayIndex === actualDayIndex &&
                    editingActivityIndex === actIdx;
                  const timeSlot = TIME_OF_DAY[actIdx % TIME_OF_DAY.length];

                  const isObj = typeof activity === "object" && activity !== null;
                  const actTitle = isObj
                    ? (activity.title || activity.name || "")
                    : String(activity);
                  const actDesc = isObj ? activity.description : null;
                  const actTime = isObj ? activity.time : null;
                  const actLoc = isObj ? (activity.location_name || activity.location) : null;
                  const actCost = isObj ? activity.approx_cost : null;

                  return (
                    <Card
                      key={actIdx}
                      className="border border-border/70 hover:border-primary/40 bg-card/70 backdrop-blur-sm shadow-xs rounded-2xl transition-all group"
                    >
                      <CardContent className="p-4 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          {/* Time / Category Icon */}
                          <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            {timeSlot.icon}
                          </div>

                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                                {actTime || timeSlot.label}
                              </span>
                              {actLoc && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0 border-border/60">
                                  <MapPin className="w-2.5 h-2.5 mr-1 text-primary" />
                                  {actLoc}
                                </Badge>
                              )}
                              {actCost != null && actCost > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0 text-emerald-600 dark:text-emerald-400">
                                  ₹{actCost}
                                </Badge>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="h-8 text-xs"
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                                  onClick={() => handleSaveEdit(actualDayIndex, actIdx)}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                  onClick={() => {
                                    setEditingDayIndex(null);
                                    setEditingActivityIndex(null);
                                  }}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-sm font-bold text-foreground leading-snug">
                                  {actTitle}
                                </p>
                                {actDesc && (
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    {actDesc}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline Actions (visible on group hover / mobile) */}
                        {onUpdateItinerary && !isEditing && (
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary rounded-lg"
                              onClick={() =>
                                handleStartEdit(actualDayIndex, actIdx, actTitle)
                              }
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                              onClick={() =>
                                handleDeleteActivity(actualDayIndex, actIdx)
                              }
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Add Custom Activity for Day */}
                {onUpdateItinerary && (
                  <div>
                    {activeNewDay === actualDayIndex ? (
                      <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-2xl border border-dashed border-primary/40">
                        <Input
                          placeholder="e.g. Visit local sunset viewpoint or cafe..."
                          value={newActivityText}
                          onChange={(e) => setNewActivityText(e.target.value)}
                          className="h-8 text-xs bg-card"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddActivity(actualDayIndex);
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="hero"
                          className="h-8 px-3 text-xs font-bold gap-1"
                          onClick={() => handleAddActivity(actualDayIndex)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            setActiveNewDay(null);
                            setNewActivityText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveNewDay(actualDayIndex)}
                        className="text-xs text-primary hover:text-primary/90 hover:bg-primary/5 rounded-xl gap-1.5 h-8 font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add custom activity to Day {dayData.day}</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Day Supplementary Grid: Stay, Dining & Transit */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {/* Stay Card */}
                <div className="p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
                    <Bed className="w-3.5 h-3.5" />
                    <span>Night Stay</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {dayData.stay_recommendations.map((stay, idx) => {
                      const stayName =
                        typeof stay === "object" && stay !== null ? stay.name : String(stay);
                      const stayPrice =
                        typeof stay === "object" && stay !== null ? stay.price_per_night : null;
                      return (
                        <li key={idx} className="line-clamp-2 font-medium text-foreground/80">
                          • {stayName} {stayPrice ? `(${stayPrice})` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Food Card */}
                <div className="p-3.5 rounded-2xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-900/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-300 text-xs font-bold uppercase tracking-wider">
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Food Spots</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {dayData.food_spots.map((spot, idx) => (
                      <li key={idx} className="line-clamp-2 font-medium text-foreground/80">
                        • {spot}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Transport Card */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
                    <Car className="w-3.5 h-3.5" />
                    <span>Transit Routes</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {dayData.transport.join(" • ") || "Local cab & walking"}
                  </p>
                </div>
              </div>

              {/* Day Pro-Tip Banner */}
              {dayData.pro_tip && dayData.pro_tip.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-primary">Insider Day Tip: </span>
                    <span className="text-foreground/80 font-medium">
                      {dayData.pro_tip.join(" ")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
