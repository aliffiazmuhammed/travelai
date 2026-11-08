import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import ItineraryDisplay from "@/components/ItineraryDisplay";
import { TripCover } from "@/components/gallery/TripCover";
import { applyPageMeta } from "@/lib/meta";
import {
  AlertCircle,
  ArrowDown,
  CalendarDays,
  Copy,
  Leaf,
  Loader2,
  Lock,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import type { Trip } from "@/types/trip";

const PLAN_PATH = "/plan";

/**
 * Public, read-only view of a share link (`/shared/:shareId`).
 *
 * The public projection carries only the title, itinerary and drawn routes, so
 * this page never claims more than that: no owner name, no travel dates. The
 * itinerary itself is the shared `ItineraryDisplay`; only its workspace header
 * (title, planned-budget strip, owner actions) is suppressed here so the public
 * page has a single heading.
 */
const SharedTrip: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError("No share ID provided.");
      setLoading(false);
      return;
    }

    const fetchShared = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getSharedTrip(shareId);
        setTrip(data);
      } catch (err: any) {
        console.error("Failed to load shared trip:", err);
        setError(
          err.message ||
            "This shared itinerary could not be found or may have been revoked by the author."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchShared();
  }, [shareId]);

  const details = trip?.tripDetails;
  const title =
    trip?.title?.trim() || details?.trip_title?.trim() || "Shared itinerary";
  const dayCount =
    details?.day_by_day_itinerary?.length || details?.duration_days || 0;
  const nightCount = Math.max(0, dayCount - 1);
  const durationLabel =
    dayCount > 0
      ? `${dayCount} ${dayCount === 1 ? "day" : "days"}${
          nightCount > 0
            ? ` · ${nightCount} ${nightCount === 1 ? "night" : "nights"}`
            : ""
        }`
      : "";
  const groupLabel = details?.group_type?.trim();
  const seasonLabel = details?.season?.trim();

  // Meta tags are written once the real title arrives — never while loading.
  useEffect(() => {
    if (loading) return;

    if (trip) {
      return applyPageMeta({
        title: `${title} · Shared itinerary · waytowalk`,
        description:
          dayCount > 0
            ? `A ${dayCount}-day itinerary shared on waytowalk. Read-only: budgets and chat stay private.`
            : "An itinerary shared on waytowalk. Read-only: budgets and chat stay private.",
        ogType: "article",
      });
    }

    return applyPageMeta({
      title: "Shared itinerary not found · waytowalk",
      description:
        error || "The link you followed may be invalid or has been revoked.",
      ogType: "website",
    });
  }, [loading, trip, title, dayCount, error]);

  /**
   * The public projection exposes no copy endpoint. Share-token pages can only
   * send a visitor through the existing own-trip path (`/plan`), which is
   * session-gated and returns them there after sign-in.
   */
  const handleTakeCopy = () => navigate(PLAN_PATH);

  const scrollToPlan = () => {
    document
      .getElementById("shared-plan")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex min-h-[60vh] flex-1 flex-col items-center justify-center space-y-4 pt-16">
          <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
          <div className="space-y-1 text-center">
            <h1 className="text-base font-semibold text-foreground">
              Opening the shared trip…
            </h1>
            <p className="text-xs text-muted-foreground">
              Fetching the itinerary and map
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !trip || !details) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="container mx-auto mt-16 max-w-lg flex-1 px-4 py-16">
          <div className="space-y-6 rounded-2xl border border-border bg-card p-8 text-center shadow-xs sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" aria-hidden />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Itinerary not found
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {error || "The link you followed may be invalid or expired."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => navigate(PLAN_PATH)}
              className="h-11 gap-2 rounded-xl px-5 text-xs font-semibold"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              <span>Create your own trip</span>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Public-view framing: one slim strip under the navbar. */}
        <div className="border-b border-primary/10 bg-primary/[0.05]">
          <div className="container mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold text-foreground sm:text-xs">
              <Lock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              Public view · Shared itinerary
            </p>
            <span
              className="hidden h-4 w-px bg-border sm:block"
              aria-hidden
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              You're seeing a read-only copy. Budgets and chat stay private.
            </p>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl px-4 pb-20 pt-8 sm:pt-10">
          <div className="space-y-8 sm:space-y-10">
            <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_32rem]">
              <div className="min-w-0">
                <h1 className="break-words font-display text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-[3.1rem]">
                  {title}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-medium text-muted-foreground">
                  {durationLabel && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      {durationLabel}
                    </span>
                  )}
                  {groupLabel && (
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <Users
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      {groupLabel}
                    </span>
                  )}
                  {seasonLabel && (
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <Leaf
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      {seasonLabel}
                    </span>
                  )}
                </div>

                <div className="mt-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                    <User className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Shared by the trip owner
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      A read-only copy of the plan they shared. Nothing else
                      travels with the link.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    onClick={handleTakeCopy}
                    className="h-11 w-full gap-2 rounded-xl px-5 text-xs font-semibold sm:w-auto"
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    <span>Take a copy</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={scrollToPlan}
                    className="h-11 w-full gap-2 rounded-xl border-border bg-card px-5 text-xs font-semibold text-foreground sm:w-auto"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                    <span>View full plan</span>
                  </Button>
                </div>
              </div>

              {/* Photo comes from the trip's own title — the public projection
                  carries no separate destination field. */}
              <div className="w-full min-w-0 lg:shrink-0">
                <div className="overflow-hidden rounded-2xl border border-border bg-muted shadow-xs">
                  <TripCover title={title} width={1200} />
                </div>
              </div>
            </header>

            <section
              id="shared-plan"
              aria-label="Shared itinerary"
              className="min-w-0 scroll-mt-20"
            >
              {/* The shared itinerary opens with its own workspace title/stat
                  strip. The public page owns the heading (and the plan's budget
                  stays private), so that strip is suppressed at the wrapper
                  level — the component's file and props are untouched. The
                  bottom padding is trimmed so the prompt below follows on. */}
              <div className="[&>div>*:first-child]:hidden [&>div]:pb-0">
                <ItineraryDisplay
                  data={details}
                  customRoutes={trip.customRoutes}
                  onNewPlan={() => navigate(PLAN_PATH)}
                />
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3.5 sm:px-5">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                  <Sparkles
                    className="h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span>Want your own version?</span>
                  <button
                    type="button"
                    onClick={handleTakeCopy}
                    className="rounded font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Take a copy
                  </button>
                  <span>and change anything.</span>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SharedTrip;
