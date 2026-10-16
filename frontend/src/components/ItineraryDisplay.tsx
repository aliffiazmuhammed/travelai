import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TripHeader } from "./dashboard/TripHeader";
import { DayTimeline } from "./dashboard/DayTimeline";
import { TripMap } from "./dashboard/TripMap";
import { BudgetVisualizer } from "./dashboard/BudgetVisualizer";
import { StayAndCuisine } from "./dashboard/StayAndCuisine";
import { TravelGuideSafety } from "./dashboard/TravelGuideSafety";
import type { ItineraryData } from "@/types/trip";
export type { ItineraryData } from "@/types/trip";

interface ItineraryDisplayProps {
  data: ItineraryData;
  tripId?: string;
  status?: "draft" | "planned" | "ongoing" | "completed";
  onStatusChange?: (newStatus: "draft" | "planned" | "ongoing" | "completed") => void;
  onSave?: (updatedDetails: ItineraryData) => Promise<void>;
  isSaving?: boolean;
  onBackToList?: () => void;
  onNewPlan?: () => void;
}

const ItineraryDisplay: React.FC<ItineraryDisplayProps> = ({
  data,
  tripId,
  status,
  onStatusChange,
  onSave,
  isSaving,
  onBackToList,
  onNewPlan,
}) => {
  // Allow interactive in-memory customization of itinerary activities
  const [itinerary, setItinerary] = useState<ItineraryData["day_by_day_itinerary"]>(
    data.day_by_day_itinerary
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

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

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-16">
      {/* 1. Enhanced Hero Header with Quick Stats & Share Actions */}
      <TripHeader
        data={data}
        tripId={tripId}
        status={status}
        onStatusChange={onStatusChange}
        onSave={onSave ? handleSaveTrigger : undefined}
        isSaving={isSaving}
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

      {/* 2. Main Multi-View Tabs Navigation */}
      <Tabs defaultValue="timeline" className="w-full space-y-6">
        <div className="sticky top-16 z-30 bg-background/85 backdrop-blur-md py-2 -mx-2 px-2">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto p-1.5 bg-muted/60 border border-border/60 rounded-2xl shadow-xs gap-1">
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
              className="py-2.5 rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all col-span-2 sm:col-span-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Guide & Safety</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: Day Timeline View */}
        <TabsContent value="timeline" className="outline-hidden animate-fade-in">
          <DayTimeline
            itinerary={itinerary}
            onUpdateItinerary={handleUpdateItinerary}
          />
        </TabsContent>

        {/* TAB 2: Interactive Map View */}
        <TabsContent value="map" className="outline-hidden animate-fade-in">
          <TripMap destination={data.trip_title} itinerary={itinerary} />
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
      </Tabs>
    </div>
  );
};

export default ItineraryDisplay;
