import React, { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  MapPin,
  Wallet,
  Compass,
  Bed,
  ShieldCheck,
  Sparkles,
  Camera,
  History,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/services/api";
import { TripHeader } from "./dashboard/TripHeader";
import { DayTimeline } from "./dashboard/DayTimeline";
import { TripMap } from "./dashboard/TripMap";
import { BudgetVisualizer } from "./dashboard/BudgetVisualizer";
import { StayAndCuisine } from "./dashboard/StayAndCuisine";
import { TravelGuideSafety } from "./dashboard/TravelGuideSafety";
import { TripVersions } from "./dashboard/TripVersions";
import { TripFeedback } from "./dashboard/TripFeedback";
import { ExpenseTracker } from "./dashboard/ExpenseTracker";
import type {
  ActivityItem,
  CustomRoute,
  ItineraryData,
  Trip,
  TripExpense,
  TripFeedback as TripFeedbackType,
  TripFinance,
  TripGenerationMeta,
  TripParticipant,
} from "@/types/trip";
export type { ItineraryData } from "@/types/trip";

interface ItineraryDisplayProps {
  data: ItineraryData;
  tripId?: string;
  status?: "draft" | "planned" | "ongoing" | "completed";
  /** Current version number of the trip (shown in the history tab). */
  version?: number;
  /** Whether the trip has ever been edited. */
  hasEdited?: boolean;
  onStatusChange?: (newStatus: "draft" | "planned" | "ongoing" | "completed") => void;
  onSave?: (updatedDetails: ItineraryData) => Promise<void>;
  isSaving?: boolean;
  /** Called whenever the server returns an updated trip (granular edit or version restore). */
  onTripUpdated?: (trip: Trip) => void;
  /** Persisted user rating of the generated itinerary, if any. */
  feedback?: TripFeedbackType;
  /** AI generation metadata (quality score, variant, language, ...). */
  generationMeta?: TripGenerationMeta;
  /** Actual logged expenses (Milestone 5). */
  expenses?: TripExpense[];
  /** Group travellers used for expense splitting (Milestone 5). */
  participants?: TripParticipant[];
  /** Base currency + cached FX rates (Milestone 5). */
  finance?: TripFinance;
  /** User-drawn custom routes shown on the map (Milestone 4). */
  customRoutes?: CustomRoute[];
  /** Called after the user rates the itinerary. */
  onFeedbackSubmitted?: (feedback: TripFeedbackType) => void;
  onBackToList?: () => void;
  onNewPlan?: () => void;
}

/** Debounce window (ms) for automatic background saving of local edits. */
const AUTOSAVE_DELAY = 1500;

/** Immutably replaces a single activity within a day (matched by day number). */
function replaceActivity(
  itinerary: ItineraryData["day_by_day_itinerary"],
  dayNumber: number,
  activityIndex: number,
  activity: ActivityItem
): ItineraryData["day_by_day_itinerary"] {
  return itinerary.map((d) => {
    if (Number(d.day) !== Number(dayNumber)) return d;
    const activities = [...d.activities];
    activities[activityIndex] = activity;
    return { ...d, activities };
  });
}

const ItineraryDisplay: React.FC<ItineraryDisplayProps> = ({
  data,
  tripId,
  status,
  version,
  hasEdited,
  onStatusChange,
  onSave,
  isSaving,
  onTripUpdated,
  feedback,
  generationMeta,
  expenses,
  participants,
  finance,
  customRoutes,
  onFeedbackSubmitted,
  onBackToList,
  onNewPlan,
}) => {
  // Allow interactive in-memory customization of itinerary activities
  const [itinerary, setItinerary] = useState<ItineraryData["day_by_day_itinerary"]>(
    data.day_by_day_itinerary
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isPersisting, setIsPersisting] = useState<boolean>(false);

  const isRealTrip = Boolean(tripId && !tripId.startsWith("temp-"));
  const autoSaveEnabled = Boolean(onSave && isRealTrip);

  useEffect(() => {
    setItinerary(data.day_by_day_itinerary);
    setHasUnsavedChanges(false);
  }, [data]);

  const handleUpdateItinerary = (
    updated: ItineraryData["day_by_day_itinerary"]
  ) => {
    setItinerary(updated);
    setHasUnsavedChanges(true);
  };

  const handleSaveTrigger = async () => {
    if (!onSave) return;
    const updatedDetails: ItineraryData = {
      ...data,
      day_by_day_itinerary: itinerary,
    };
    await onSave(updatedDetails);
    setHasUnsavedChanges(false);
  };

  // Debounced autosave for local-only edits (add / delete / rename)
  useEffect(() => {
    if (!hasUnsavedChanges || !autoSaveEnabled || !onSave || isSaving || isPersisting) {
      return;
    }
    const timer = setTimeout(() => {
      onSave({ ...data, day_by_day_itinerary: itinerary })
        .then(() => setHasUnsavedChanges(false))
        .catch(() => {
          /* Error toast is raised by the parent save handler */
        });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, itinerary, autoSaveEnabled, onSave, isSaving, isPersisting, data]);

  /**
   * Persists a granular change (single activity / reorder / day move).
   * Flushes any pending local edits first so nothing is lost, applies the
   * optimistic update, then reconciles with the server response.
   */
  const persistGranular = useCallback(
    async (
      previous: ItineraryData["day_by_day_itinerary"],
      call: () => Promise<Trip>,
      successMessage: string
    ) => {
      try {
        setIsPersisting(true);

        // Ensure any pending add/delete/rename changes are saved first
        if (hasUnsavedChanges && onSave) {
          await onSave({ ...data, day_by_day_itinerary: itinerary });
          setHasUnsavedChanges(false);
        }

        const trip = await call();
        setItinerary(trip.tripDetails.day_by_day_itinerary);
        setHasUnsavedChanges(false);
        onTripUpdated?.(trip);
        toast.success(successMessage);
      } catch (err) {
        console.error("Failed to persist itinerary change:", err);
        setItinerary(previous);
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not save your changes. Please try again."
        );
      } finally {
        setIsPersisting(false);
      }
    },
    [hasUnsavedChanges, onSave, data, itinerary, onTripUpdated]
  );

  const handleUpdateActivity = (
    dayNumber: number,
    activityIndex: number,
    activity: ActivityItem
  ) => {
    const previous = itinerary;
    setItinerary((prev) => replaceActivity(prev, dayNumber, activityIndex, activity));

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.updateActivity(tripId, { day: dayNumber, activityIndex, activity }),
      "Activity updated"
    );
  };

  const handleReorderActivities = (dayNumber: number, order: number[]) => {
    const previous = itinerary;
    const next = itinerary.map((d) => {
      if (Number(d.day) !== Number(dayNumber)) return d;
      return { ...d, activities: order.map((i) => d.activities[i]) };
    });
    setItinerary(next);

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.reorderActivities(tripId, { day: dayNumber, order }),
      "Activities reordered"
    );
  };

  const handleMoveDay = (fromIndex: number, toIndex: number) => {
    const previous = itinerary;
    const reordered = [...itinerary];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const renumbered = reordered.map((d, i) => ({ ...d, day: i + 1 }));
    setItinerary(renumbered);

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.moveTripDay(tripId, { fromIndex, toIndex }),
      "Days reordered"
    );
  };

  const handleVersionRestored = (trip: Trip) => {
    setItinerary(trip.tripDetails.day_by_day_itinerary);
    setHasUnsavedChanges(false);
    onTripUpdated?.(trip);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-16">
      {/* 1. Enhanced Hero Header with Quick Stats & Share Actions */}
      <TripHeader
        data={data}
        tripId={tripId}
        status={status}
        version={version}
        hasEdited={hasEdited}
        onStatusChange={onStatusChange}
        onSave={onSave ? handleSaveTrigger : undefined}
        isSaving={isSaving || isPersisting}
        hasUnsavedChanges={hasUnsavedChanges}
        onBackToList={onBackToList}
        onNewPlan={onNewPlan}
      />

      {/* Highlights Bar */}
      {data.highlights && data.highlights.length > 0 && (
        <Card className="rounded-3xl border border-border/70 bg-card/60 backdrop-blur-sm shadow-xs overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider shrink-0 pr-2">
              <Camera className="w-4 h-4" />
              <span>Key Highlights:</span>
            </div>
            {data.highlights.map((h, i) => (
              <Badge
                key={i}
                variant="outline"
                className="bg-background/80 hover:bg-background border-border/80 text-xs font-semibold px-3 py-1 rounded-full text-foreground/90 transition-colors"
              >
                {h}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feedback bar — only shown for persisted (non-temp) trips */}
      {isRealTrip && tripId && (
        <TripFeedback
          tripId={tripId}
          initialFeedback={feedback}
          qualityScore={generationMeta?.qualityScore}
          onSubmitted={onFeedbackSubmitted}
        />
      )}

      {/* 2. Main Multi-View Tabs Navigation */}
      <Tabs defaultValue="timeline" className="w-full space-y-6">
        <div className="sticky top-16 z-30 bg-background/85 backdrop-blur-md py-2 -mx-2 px-2">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 h-auto p-1.5 bg-muted/60 border border-border/60 rounded-2xl shadow-xs gap-1">
            <TabsTrigger
              value="timeline"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Day Timeline</span>
            </TabsTrigger>

            <TabsTrigger
              value="map"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </TabsTrigger>

            <TabsTrigger
              value="budget"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Budget Analytics</span>
            </TabsTrigger>

            <TabsTrigger
              value="stays"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <Bed className="w-3.5 h-3.5" />
              <span>Stays & Dining</span>
            </TabsTrigger>

            <TabsTrigger
              value="guide"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Guide & Safety</span>
            </TabsTrigger>

            <TabsTrigger
              value="expenses"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Expenses</span>
            </TabsTrigger>

            <TabsTrigger
              value="history"
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all"
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: Day Timeline View */}
        <TabsContent value="timeline" className="outline-hidden animate-fade-in">
          <DayTimeline
            itinerary={itinerary}
            onUpdateItinerary={onSave ? handleUpdateItinerary : undefined}
            onUpdateActivity={handleUpdateActivity}
            onReorderActivities={handleReorderActivities}
            onMoveDay={handleMoveDay}
            isPersisting={isPersisting}
          />
        </TabsContent>

        {/* TAB 2: Interactive Map View */}
        <TabsContent value="map" className="outline-hidden animate-fade-in">
          <TripMap
            destination={data.trip_title}
            itinerary={itinerary}
            tripId={tripId}
            customRoutes={customRoutes}
            canEdit={isRealTrip && Boolean(onSave)}
            onUpdated={onTripUpdated}
          />
        </TabsContent>

        {/* TAB 3: Budget Analytics View */}
        <TabsContent value="budget" className="outline-hidden animate-fade-in">
          <BudgetVisualizer
            budget={data.budget_breakdown}
            daysCount={data.duration_days}
            groupType={data.group_type}
            paymentTips={data.footnotes_safety_tips.payment}
            perPersonBudget={data.budget_per_person}
          />
        </TabsContent>

        {/* TAB 4: Stays & Culinary Hotspots View */}
        <TabsContent value="stays" className="outline-hidden animate-fade-in">
          <StayAndCuisine itinerary={itinerary} destination={data.trip_title} />
        </TabsContent>

        {/* TAB 5: Travel Guide & Safety View */}
        <TabsContent value="guide" className="outline-hidden animate-fade-in">
          <TravelGuideSafety
            guide={data.local_transport}
            weather={data.weather_advisory}
            footnotes={data.footnotes_safety_tips}
          />
        </TabsContent>

        {/* TAB 6: Expense Tracker View */}
        <TabsContent value="expenses" className="outline-hidden animate-fade-in">
          <ExpenseTracker
            tripId={tripId}
            expenses={expenses || []}
            participants={participants || []}
            baseCurrency={finance?.baseCurrency || "INR"}
            exchangeRates={finance?.exchangeRates}
            ratesUpdatedAt={finance?.ratesUpdatedAt}
            plannedBudget={data.budget_breakdown}
            daysCount={data.duration_days}
            canEdit={isRealTrip && Boolean(onSave)}
            onUpdated={onTripUpdated}
          />
        </TabsContent>

        {/* TAB 7: Version History View */}
        <TabsContent value="history" className="outline-hidden animate-fade-in">
          <TripVersions
            tripId={tripId}
            currentVersion={version}
            hasEdited={hasEdited}
            onRestored={handleVersionRestored}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ItineraryDisplay;
