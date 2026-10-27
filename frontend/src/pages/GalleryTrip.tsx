import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DayTimeline } from "@/components/dashboard/DayTimeline";
import { TravelGuideSafety } from "@/components/dashboard/TravelGuideSafety";
import { api, ApiError } from "@/services/api";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { DURATION_LABELS, formatGalleryDates } from "@/lib/galleryFormat";
import { withItineraryDefaults } from "@/lib/itineraryDefaults";
import { applyPageMeta } from "@/lib/meta";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Compass,
  Copy,
  Globe,
  Loader2,
  MapPin,
  Route,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { GalleryTrip } from "@/types/gallery";

/**
 * Public trip page (Milestone 8 G3).
 *
 * The itinerary is rendered with the same read-only components the dashboard
 * uses, but without any mutation callback — `DayTimeline` hides every edit
 * control when `onUpdateItinerary` is absent. Money tabs are never mounted at
 * all: the payload does not carry them, and `withItineraryDefaults` only fills
 * zeroes that nothing displays.
 *
 * Clone (G4) and join requests (G5) are placeholders here; they are disabled
 * rather than hidden so the page communicates what comes next.
 */

const galleryDurationLabel = (days: number): string => {
  if (days <= 3) return DURATION_LABELS.short;
  if (days <= 7) return DURATION_LABELS.week;
  if (days <= 14) return DURATION_LABELS.fortnight;
  return DURATION_LABELS.long;
};

const GalleryTrip = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<GalleryTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tripId) {
      setError("No trip was requested.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const data = await api.getGalleryTrip(tripId);
        if (!cancelled) setTrip(data.trip);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the public trip:", err);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiError && err.message
              ? err.message
              : "This trip could not be loaded right now."
          );
        }
        setTrip(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // Meta tags are written only once the real title arrives, so a share preview
  // never says "Loading trip".
  useEffect(() => {
    if (loading) return;

    if (trip) {
      return applyPageMeta({
        title: `${trip.title} · ${trip.destination || "TravelAI"}`,
        description:
          trip.summary ||
          `A ${trip.durationDays}-day itinerary in ${trip.destination || "the gallery"}, published by ${trip.publisher.name}.`,
        ogType: "article",
      });
    }

    if (notFound) {
      return applyPageMeta({
        title: "Trip not found · TravelAI",
        description:
          "This published trip is no longer public. It may have been unpublished, or its travel dates have passed.",
        ogType: "website",
      });
    }
  }, [loading, trip, notFound]);

  const itinerary = useMemo(
    () => (trip ? withItineraryDefaults(trip.itinerary) : null),
    [trip]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-foreground">
              Opening this published trip…
            </h3>
            <p className="text-xs text-muted-foreground">
              Loading the itinerary its owner shared
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || error || !trip || !itinerary) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-xl">
          <div className="p-8 sm:p-12 text-center rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-foreground">
                {notFound ? "This trip is not public" : "Something went wrong"}
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {notFound
                  ? "The owner may have unpublished it, or its travel dates have passed. Published trips leave the gallery once they are over."
                  : error || "This trip could not be loaded right now."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button asChild variant="hero" className="rounded-2xl h-11 px-6 text-xs font-bold gap-2">
                <Link to="/explore">
                  <Compass className="w-4 h-4" />
                  Browse the gallery
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl h-11 px-6 text-xs font-bold">
                <Link to="/">Back to TravelAI</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const days = itinerary.day_by_day_itinerary.length;

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl space-y-8">
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to the gallery
        </Link>

        {/* Trip header */}
        <header className="rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
              <MapPin className="w-3 h-3" />
              {trip.destination || "Somewhere new"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
              <Globe className="w-3 h-3" />
              Public trip
            </span>
          </div>

          <div className="space-y-3 max-w-3xl">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">
              {trip.title}
            </h1>
            {trip.summary && (
              <p className="text-sm text-foreground/80 leading-relaxed">
                {trip.summary}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
              <CalendarDays className="w-4 h-4" />
              {formatGalleryDates(trip.dates)}
            </span>
            <span className="font-semibold text-foreground/80">
              {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"} ·{" "}
              {galleryDurationLabel(trip.durationDays)}
            </span>
            {trip.season && <span className="capitalize">{trip.season}</span>}
            {trip.groupType && <span className="capitalize">{trip.groupType}</span>}
          </div>

          {trip.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trip.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/explore?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-8 min-w-0">
            {itinerary.highlights.length > 0 && (
              <section className="rounded-3xl border border-border/70 bg-card p-6 space-y-3">
                <h2 className="text-base font-black text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Trip highlights
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {itinerary.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-foreground">Day by day</h2>
                <p className="text-xs text-muted-foreground">
                  {days} {days === 1 ? "day" : "days"} as published by the owner.
                  This preview is read-only.
                </p>
              </div>
              {days > 0 ? (
                <DayTimeline itinerary={itinerary.day_by_day_itinerary} />
              ) : (
                <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-8 text-center">
                  <p className="text-sm font-bold text-foreground">
                    No day-by-day plan was published
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The owner shared the trip without day details.
                  </p>
                </div>
              )}
            </section>

            {trip.customRoutes.length > 0 && (
              <section className="rounded-3xl border border-border/70 bg-card p-6 space-y-3">
                <h2 className="text-base font-black text-foreground flex items-center gap-2">
                  <Route className="w-4 h-4 text-primary" />
                  Routes on this trip
                </h2>
                <ul className="space-y-2">
                  {trip.customRoutes.map((route, index) => (
                    <li
                      key={`${route.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                        {route.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {route.day ? `Day ${route.day} · ` : ""}
                        {route.distanceKm > 0 ? `${route.distanceKm.toFixed(1)} km` : route.mode}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-foreground">
                  Practicalities &amp; safety
                </h2>
                <p className="text-xs text-muted-foreground">
                  Weather, local transport and safety notes from the itinerary.
                </p>
              </div>
              <TravelGuideSafety
                guide={itinerary.local_transport}
                weather={itinerary.weather_advisory}
                footnotes={itinerary.footnotes_safety_tips}
              />
            </section>
          </div>

          {/* Publisher + next steps */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="rounded-3xl border border-border/70 bg-card p-5 space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Published by
              </p>
              <Link
                to={`/travelers/${encodeURIComponent(trip.publisher.handle)}`}
                className="flex items-center gap-3 rounded-2xl p-2 -m-2 hover:bg-muted/60 transition-colors min-w-0"
              >
                <Avatar className="h-12 w-12 ring-2 ring-primary/15 shrink-0">
                  {trip.publisher.avatarUrl && (
                    <AvatarImage
                      src={avatarSrc(trip.publisher.avatarUrl)}
                      alt={trip.publisher.name}
                    />
                  )}
                  <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                    {initialsFor(trip.publisher.name || trip.publisher.handle)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {trip.publisher.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    @{trip.publisher.handle}
                  </p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>

              <div className="space-y-2 pt-1">
                <Button
                  type="button"
                  variant="hero"
                  disabled
                  className="w-full rounded-2xl h-11 text-xs font-bold gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Clone &amp; customize
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="w-full rounded-2xl h-11 text-xs font-bold gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Request to join
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground text-center">
                  Cloning and join requests arrive in an upcoming update. For now
                  you can read this trip and plan your own.
                </p>
              </div>
            </section>

            <section className="rounded-3xl bg-primary/5 border border-primary/15 p-5 space-y-2">
              <p className="text-xs font-bold text-foreground">
                A public preview, nothing more
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Budgets, logged expenses and traveler lists are never part of a
                published trip. Only the itinerary, the dates the owner chose to
                show and their public profile are visible.
              </p>
            </section>

            <Button
              asChild
              variant="outline"
              className="w-full rounded-2xl h-11 text-xs font-bold gap-2"
            >
              <Link to="/plan">
                <Sparkles className="w-4 h-4" />
                Plan your own trip
              </Link>
            </Button>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default GalleryTrip;
