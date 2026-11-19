import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Bed, Calendar, MapPin, Maximize2, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { withItineraryDefaults } from "@/lib/itineraryDefaults";
import { cn } from "@/lib/utils";
import { DayTimeline } from "@/components/dashboard/DayTimeline";
import { StayAndCuisine } from "@/components/dashboard/StayAndCuisine";
import { TravelGuideSafety } from "@/components/dashboard/TravelGuideSafety";
import type { CustomRoute, ItineraryData } from "@/types/trip";

/**
 * The map is the only heavy dependency a share link can reach (C-22). Vite
 * keeps it in its own chunk, and the rail only asks for it on a wide screen
 * once the section is actually in view.
 */
const TripMap = React.lazy(() => import("@/components/dashboard/TripMap"));

const TAB_TRIGGER_CLASS = cn(
  "group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors",
  "hover:bg-muted/60 hover:text-foreground",
  "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none",
  "after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-transparent",
  "data-[state=active]:after:bg-primary",
  "lg:flex-1"
);

const MAP_PREVIEW_CLASS = cn(
  "[&>div]:!space-y-0",
  "[&>div>*:first-child]:hidden",
  "[&>div>*:nth-child(n+3)]:hidden",
  "[&>div>*:nth-child(2)]:!h-[280px]",
  "[&>div>*:nth-child(2)]:!rounded-none",
  "[&>div>*:nth-child(2)]:!border-0",
  "[&>div>*:nth-child(2)]:!shadow-none",
  "[&_.absolute.bottom-4]:hidden"
);

/** Wide screen *and* in view: a hidden map must never mount Leaflet. */
function useMapRailReady<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const wide = window.matchMedia("(min-width: 1280px)");
    let visible = false;

    const update = () => setReady(wide.matches && visible);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              update();
            },
            { rootMargin: "200px" }
          );

    observer?.observe(element);
    wide.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      wide.removeEventListener("change", update);
    };
  }, []);

  return { ref, ready };
}

export interface PublicItineraryProps {
  data: ItineraryData;
  customRoutes?: CustomRoute[];
}

/**
 * The share-link itinerary: timeline, stays and the guide, with no workspace
 * header, expenses, versions, roster or chat. Keeping this component separate
 * is what removes Leaflet, Recharts and the chat/crypto graph from the
 * `/shared/:shareId` initial chunk (C-22).
 */
export const PublicItinerary: React.FC<PublicItineraryProps> = ({
  data,
  customRoutes,
}) => {
  const safeData = useMemo(() => withItineraryDefaults(data), [data]);
  const itinerary = safeData.day_by_day_itinerary ?? [];
  const [activeTab, setActiveTab] = useState("timeline");
  const { ref: railRef, ready: railReady } = useMapRailReady<HTMLElement>();

  const stops = itinerary.reduce(
    (total, day) => total + (day.activities?.length ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      {safeData.highlights && safeData.highlights.length > 0 && (
        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-none">
          <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Highlights
            </span>
            <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
            {safeData.highlights.map((highlight, index) => (
              <Badge
                key={`${highlight}-${index}`}
                variant="outline"
                className="rounded-full border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/80"
              >
                {highlight}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <div className="sticky top-16 z-30 flex items-start gap-2 bg-background py-2">
          <div className="relative min-w-0 flex-1">
            <TabsList
              aria-label="Trip views"
              className="flex h-auto w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-xs scrollbar-none"
            >
              <TabsTrigger value="timeline" className={TAB_TRIGGER_CLASS}>
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                <span>Day Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="map" className={TAB_TRIGGER_CLASS}>
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                <span>Interactive Map</span>
              </TabsTrigger>
              <TabsTrigger value="stays" className={TAB_TRIGGER_CLASS}>
                <Bed className="h-3.5 w-3.5" aria-hidden />
                <span>Stays &amp; Dining</span>
              </TabsTrigger>
              <TabsTrigger value="guide" className={TAB_TRIGGER_CLASS}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                <span>Guide &amp; Safety</span>
              </TabsTrigger>
            </TabsList>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1.5 right-1.5 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden"
            />
          </div>
        </div>

        <TabsContent value="timeline" className="outline-hidden animate-fade-in">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="min-w-0">
              <DayTimeline itinerary={itinerary} />
            </div>

            <aside ref={railRef} className="hidden xl:block" aria-label="Route at a glance">
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold leading-tight text-foreground">
                      Route map
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {itinerary.length} {itinerary.length === 1 ? "day" : "days"} ·{" "}
                      {stops} {stops === 1 ? "stop" : "stops"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveTab("map")}
                    title="Open the interactive map"
                    aria-label="Open the interactive map"
                    className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
                <div className={cn("border-t border-border", MAP_PREVIEW_CLASS)}>
                  {railReady ? (
                    <Suspense
                      fallback={
                        <div className="h-[280px] w-full skeleton-shimmer" aria-hidden="true" />
                      }
                    >
                      <TripMap
                        destination={safeData.trip_title}
                        itinerary={itinerary}
                        customRoutes={customRoutes}
                        canEdit={false}
                      />
                    </Suspense>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="map" className="outline-hidden animate-fade-in">
          <Suspense
            fallback={
              <div className="h-[420px] w-full rounded-xl border border-border skeleton-shimmer" aria-hidden="true" />
            }
          >
            <TripMap
              destination={safeData.trip_title}
              itinerary={itinerary}
              customRoutes={customRoutes}
              canEdit={false}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="stays" className="outline-hidden animate-fade-in">
          <StayAndCuisine itinerary={itinerary} />
        </TabsContent>

        <TabsContent value="guide" className="outline-hidden animate-fade-in">
          <TravelGuideSafety
            guide={safeData.local_transport}
            weather={safeData.weather_advisory}
            footnotes={safeData.footnotes_safety_tips}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PublicItinerary;
