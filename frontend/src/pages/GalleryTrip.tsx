import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TravelGuideSafety } from "@/components/dashboard/TravelGuideSafety";
import { TripCover } from "@/components/gallery/TripCover";
import { api, ApiError } from "@/services/api";
import { JoinRequestDialog } from "@/components/gallery/JoinRequestDialog";
import { ReportDialog } from "@/components/gallery/ReportDialog";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { formatDate } from "@/lib/date";
import { DURATION_LABELS, formatGalleryDates } from "@/lib/galleryFormat";
import { buildLegs, formatDuration, isValidCoord } from "@/lib/geo";
import { withItineraryDefaults } from "@/lib/itineraryDefaults";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/context/UserContext";
import {
  AlertCircle,
  Bed,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Flag,
  Leaf,
  Loader2,
  Lock,
  MapPin,
  Route,
  Sparkles,
  Ticket,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type {
  GalleryStay,
  GalleryTrip,
  JoinRequestState,
  TripJoinRequest,
} from "@/types/gallery";
import type { ItineraryData } from "@/types/trip";

/**
 * Public trip page (Milestone 8 G3).
 *
 * The itinerary is rendered as a read-only day list built from the public
 * projection: route lines only repeat activity locations and the shared
 * transport note, and drive time only appears when both ends carry
 * coordinates. Money tabs are never mounted at all: the payload does not carry
 * them, and `withItineraryDefaults` only fills zeroes that nothing displays.
 *
 * Clone (G4) copies the public projection into a private draft owned by the
 * visitor and lands them in their dashboard. Join requests (G5) are a gated
 * ask: the owner queues them in the People tab and approval can only ever add
 * a commenter seat.
 */

const galleryDurationLabel = (days: number): string => {
  if (days <= 3) return DURATION_LABELS.short;
  if (days <= 7) return DURATION_LABELS.week;
  if (days <= 14) return DURATION_LABELS.fortnight;
  return DURATION_LABELS.long;
};

/** "Day 2: Arrive and settle in" → "Arrive and settle in". */
const cleanDayTitle = (title: string): string =>
  title.replace(/^day\s*\d+\s*[:\-–]\s*/i, "").trim();

/**
 * A compact route line for the day list. It only reports places the itinerary
 * already names: activity locations when a day moves between two of them, and
 * the shared transport note otherwise. Drive time is a straight-line estimate
 * and only appears when both ends carry coordinates.
 */
type ItineraryDay = ItineraryData["day_by_day_itinerary"][number];
type ItineraryActivity = Exclude<ItineraryDay["activities"][number], string>;

const activityObjects = (day: ItineraryDay): ItineraryActivity[] =>
  day.activities.filter(
    (activity): activity is ItineraryActivity => typeof activity !== "string"
  );

const summarizeDayRoute = (
  day: ItineraryDay
): {
  from: string | null;
  to: string | null;
  transport: string | null;
  driveTime: string | null;
} => {
  const places = activityObjects(day);
  const locations = places
    .map((activity) => activity.location?.trim() ?? "")
    .filter((location) => location.length > 0);
  const uniqueLocations = locations.filter(
    (location, index) => locations.indexOf(location) === index
  );
  const from = uniqueLocations[0] ?? null;
  const to =
    uniqueLocations.length > 1
      ? uniqueLocations[uniqueLocations.length - 1]
      : null;

  const points = places
    .map((activity) => activity.coordinates)
    .filter((point): point is [number, number] => isValidCoord(point));

  let driveTime: string | null = null;
  if (from && to && points.length >= 2) {
    const leg = buildLegs([points[0], points[points.length - 1]], "drive")[0];
    if (leg) driveTime = `~${formatDuration(leg.minutes)}`;
  }

  return {
    from,
    to: to === from ? null : to,
    transport: day.transport[0]?.trim() || null,
    driveTime,
  };
};

/** Deduplicates stays and food spots across days without adding anything. */
const collectStays = (days: ItineraryDay[]): GalleryStay[] => {
  const seen = new Set<string>();
  const stays: GalleryStay[] = [];

  days.forEach((day) => {
    day.stay_recommendations.forEach((entry) => {
      const stay: GalleryStay =
        typeof entry === "string" ? { name: entry } : entry;
      const name = stay.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      stays.push({ ...stay, name });
    });
  });

  return stays;
};

const collectFoodSpots = (days: ItineraryDay[]): string[] => {
  const seen = new Set<string>();
  const spots: string[] = [];

  days.forEach((day) => {
    day.food_spots.forEach((entry) => {
      const name = (typeof entry === "string" ? entry : entry.name)?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      spots.push(name);
    });
  });

  return spots;
};

const FactRow = ({
  icon: Icon,
  label,
  value,
  capitalize = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  capitalize?: boolean;
}) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <dt className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {label}
    </dt>
    <dd
      className={cn(
        "min-w-0 truncate text-right text-xs font-semibold text-foreground",
        capitalize && "capitalize"
      )}
    >
      {value}
    </dd>
  </div>
);

const GalleryTrip = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [trip, setTrip] = useState<GalleryTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cloning, setCloning] = useState(false);
  const autoCloneRef = useRef(false);
  // G5: my request state on this trip (only fetched while signed in).
  const [joinState, setJoinState] = useState<JoinRequestState | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const autoJoinRef = useRef(false);
  // G6: reporting a published trip (personal account only).
  const [reportOpen, setReportOpen] = useState(false);
  const autoReportRef = useRef(false);

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
          `A ${trip.durationDays}-day itinerary in ${trip.destination || "the gallery"}, shared by ${trip.publisher.name}.`,
        ogType: "article",
      });
    }

    if (notFound) {
      return applyPageMeta({
        title: "Trip not found · TravelAI",
        description:
          "This shared trip is no longer public. It may have been unshared, or its travel dates have passed.",
        ogType: "website",
      });
    }
  }, [loading, trip, notFound]);

  const itinerary = useMemo(
    () => (trip ? withItineraryDefaults(trip.itinerary) : null),
    [trip]
  );

  // G5: ask the server whether I already have a request / membership. A failure
  // here is non-fatal — the page still renders and the CTA simply shows the
  // default "request to join" state.
  const tripIdForJoin = trip?._id;
  useEffect(() => {
    if (!tripIdForJoin || !isAuthenticated) {
      setJoinState(null);
      return;
    }

    let cancelled = false;
    api
      .getJoinRequestState(tripIdForJoin)
      .then((state) => {
        if (!cancelled) setJoinState(state);
      })
      .catch(() => {
        if (!cancelled) setJoinState(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tripIdForJoin, isAuthenticated]);

  /**
   * G4: signed-in visitors get a private draft immediately; anonymous ones are
   * sent through sign-in with the clone intent attached, so they land back on
   * this page and the copy is created without a second click.
   */
  const handleClone = useCallback(async () => {
    if (!trip) return;

    if (!isAuthenticated) {
      navigate("/auth", {
        state: {
          from: {
            pathname: location.pathname,
            state: { clone: true },
          },
        },
      });
      return;
    }

    setCloning(true);
    try {
      const cloned = await api.cloneGalleryTrip(trip._id);
      toast.success("Your private copy is ready.");
      navigate("/dashboard", { state: { tripId: cloned._id } });
    } catch (err) {
      console.error("Failed to clone the public trip:", err);
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : "This trip could not be cloned right now. Please try again."
      );
    } finally {
      setCloning(false);
    }
  }, [trip, isAuthenticated, navigate, location.pathname]);

  // Resume the flow after the sign-in redirect, exactly once per history entry.
  useEffect(() => {
    const wantsClone = Boolean(
      (location.state as { clone?: boolean } | null)?.clone
    );
    if (!wantsClone || !trip || !isAuthenticated || autoCloneRef.current) return;

    autoCloneRef.current = true;
    // Consume the intent so pressing Back never clones a second time.
    navigate(location.pathname, { replace: true, state: null });
    void handleClone();
  }, [location.state, location.pathname, trip, isAuthenticated, navigate, handleClone]);

  /**
   * G5: join needs a written note, so returning from sign-in opens the dialog
   * instead of sending a request silently (the clone flow can act immediately).
   */
  useEffect(() => {
    const wantsJoin = Boolean(
      (location.state as { join?: boolean } | null)?.join
    );
    if (!wantsJoin || !trip || !isAuthenticated || autoJoinRef.current) return;

    autoJoinRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    setJoinDialogOpen(true);
  }, [location.state, location.pathname, trip, isAuthenticated, navigate]);

  const handleJoinClick = useCallback(() => {
    if (!trip) return;

    if (!isAuthenticated) {
      navigate("/auth", {
        state: {
          from: {
            pathname: location.pathname,
            state: { join: true },
          },
        },
      });
      return;
    }

    setJoinDialogOpen(true);
  }, [trip, isAuthenticated, navigate, location.pathname]);

  /**
   * G6: reporting needs a signed-in personal account too. The post-sign-in
   * resume reopens the composer instead of submitting anything silently.
   */
  const handleReportClick = useCallback(() => {
    if (!trip) return;

    if (!isAuthenticated) {
      navigate("/auth", {
        state: {
          from: {
            pathname: location.pathname,
            state: { report: true },
          },
        },
      });
      return;
    }

    setReportOpen(true);
  }, [trip, isAuthenticated, navigate, location.pathname]);

  useEffect(() => {
    const wantsReport = Boolean(
      (location.state as { report?: boolean } | null)?.report
    );
    if (!wantsReport || !trip || !isAuthenticated || autoReportRef.current) return;

    autoReportRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    setReportOpen(true);
  }, [location.state, location.pathname, trip, isAuthenticated, navigate]);

  const handleWithdraw = useCallback(async () => {
    if (!trip) return;

    setJoinBusy(true);
    try {
      const result = await api.withdrawJoinRequest(trip._id);
      setJoinState((previous) =>
        previous
          ? { ...previous, request: result.request }
          : { request: result.request, isMember: false, isOwner: false }
      );
      toast.success("Your request was withdrawn.");
    } catch (err) {
      console.error("Failed to withdraw the join request:", err);
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : "That request could not be withdrawn right now."
      );
    } finally {
      setJoinBusy(false);
    }
  }, [trip]);

  const handleJoinSubmitted = useCallback(
    (request: TripJoinRequest) => {
      setJoinState((previous) =>
        previous
          ? { ...previous, request }
          : { request, isMember: false, isOwner: false }
      );
    },
    []
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-foreground">
              Opening this trip…
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
                {notFound ? "This trip isn't here anymore" : "Something went wrong"}
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {notFound
                  ? "The owner may have unshared it, or the trip has already happened. Shared trips leave the gallery once they're over."
                  : error || "This trip could not be loaded right now."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button asChild variant="hero" className="rounded-2xl h-11 px-6 text-xs font-bold gap-2">
                <Link to="/explore">
                  <Compass className="w-4 h-4" />
                  See other shared trips
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
  const stays = collectStays(itinerary.day_by_day_itinerary);
  const eats = collectFoodSpots(itinerary.day_by_day_itinerary);
  const sharedOn = trip.publishedAt ? formatDate(trip.publishedAt) : "";
  const hostName = trip.publisher.name || trip.publisher.handle || "The trip owner";

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 pb-20">
        <div className="pt-16">
          <section className="relative" aria-label="Trip photo">
            <TripCover
              destination={trip.destination}
              title={trip.title}
              width={1600}
              className="aspect-auto h-[320px] w-full sm:h-[420px]"
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 via-black/20 to-transparent"
              aria-hidden="true"
            />
            <nav
              aria-label="Breadcrumb"
              className="absolute left-4 top-4 min-w-0 sm:left-6 sm:top-6"
            >
              <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-semibold text-white/85">
                <li>
                  <Link
                    to="/explore"
                    className="rounded-md px-1.5 py-0.5 transition-colors hover:text-white"
                  >
                    Explore
                  </Link>
                </li>
                <li className="flex min-w-0 items-center gap-1">
                  <ChevronRight
                    className="h-3 w-3 shrink-0 text-white/60"
                    aria-hidden="true"
                  />
                  <span
                    aria-current="page"
                    className="max-w-[65vw] truncate rounded-md bg-black/20 px-1.5 py-0.5 text-white sm:max-w-md"
                  >
                    {trip.title}
                  </span>
                </li>
              </ol>
            </nav>
          </section>
        </div>

        <div className="container mx-auto max-w-6xl px-4">
          {/* Trip header, pulled up over the hero */}
          <header className="relative z-10 -mt-16 rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:-mt-20 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {trip.title}
                </h1>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-semibold text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {trip.destination || "Somewhere new"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {formatGalleryDates(trip.dates)}
                  </span>
                </div>

                {trip.summary && (
                  <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {trip.summary}
                  </p>
                )}

                <Link
                  to={`/travelers/${encodeURIComponent(trip.publisher.handle)}`}
                  className="group/host -m-1.5 flex w-fit min-w-0 items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-muted/60"
                >
                  <Avatar className="h-11 w-11 shrink-0 ring-2 ring-primary/15">
                    {trip.publisher.avatarUrl && (
                      <AvatarImage
                        src={avatarSrc(trip.publisher.avatarUrl)}
                        alt={trip.publisher.name || trip.publisher.handle}
                      />
                    )}
                    <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                      {initialsFor(
                        trip.publisher.name || trip.publisher.handle
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Shared by{" "}
                      {trip.publisher.name || trip.publisher.handle}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Trip host · @{trip.publisher.handle}
                    </p>
                  </div>
                  <ChevronRight
                    className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/host:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </div>

              <div className="flex w-full flex-col gap-3 lg:w-[22rem] lg:shrink-0 lg:items-end">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                  {joinState?.isOwner ? (
                    <div className="w-full rounded-2xl border border-border/70 bg-muted/40 px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground sm:w-auto">
                      This is your trip — you already have full access.
                    </div>
                  ) : joinState?.isMember ? (
                    <Button
                      asChild
                      variant="hero"
                      className="h-11 w-full rounded-2xl px-5 text-xs font-bold sm:w-auto"
                    >
                      <Link to="/dashboard" state={{ tripId: trip._id }}>
                        <CheckCircle2 className="h-4 w-4" />
                        You're in — open the trip
                      </Link>
                    </Button>
                  ) : joinState?.request?.status === "pending" ? (
                    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="h-11 w-full rounded-2xl px-5 text-xs font-bold"
                      >
                        <Clock className="h-4 w-4" />
                        Waiting to hear back
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={joinBusy}
                        onClick={() => void handleWithdraw()}
                        className="h-8 w-full rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                      >
                        {joinBusy ? "Withdrawing…" : "Withdraw request"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="hero"
                      onClick={handleJoinClick}
                      className="h-11 w-full rounded-2xl px-5 text-xs font-bold sm:w-auto"
                    >
                      <UserPlus className="h-4 w-4" />
                      Ask to join
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={cloning}
                    onClick={handleClone}
                    className="h-11 w-full rounded-2xl px-5 text-xs font-bold sm:w-auto"
                  >
                    {cloning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {cloning ? "Making your copy…" : "Take a copy"}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {trip.groupType && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-[11px] font-semibold capitalize text-foreground/80">
                      <Users
                        className="h-3 w-3 text-primary"
                        aria-hidden="true"
                      />
                      {trip.groupType}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-[11px] font-semibold text-foreground/80">
                    <CalendarDays
                      className="h-3 w-3 text-primary"
                      aria-hidden="true"
                    />
                    {trip.durationDays}{" "}
                    {trip.durationDays === 1 ? "day" : "days"}
                  </span>
                  {trip.season && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-[11px] font-semibold capitalize text-foreground/80">
                      <Leaf
                        className="h-3 w-3 text-primary"
                        aria-hidden="true"
                      />
                      {trip.season}
                    </span>
                  )}
                </div>

                <p className="max-w-sm text-[10px] leading-relaxed text-muted-foreground lg:text-right">
                  Your copy is private and yours to change however you like —
                  the original stays as it is. Asking to join sends a note to
                  the owner; if they say yes, you can follow the trip and
                  comment.
                </p>
              </div>
            </div>

            {trip.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border/60 pt-4">
                {trip.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/explore?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0 space-y-6">
              {/* Day by day */}
              <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Day by day
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {days} {days === 1 ? "day" : "days"}, exactly as{" "}
                    {trip.publisher.name || "the host"} planned{" "}
                    {days === 1 ? "it" : "them"}.
                  </p>
                </div>

                {days > 0 ? (
                  <ol
                    className={cn(
                      "relative mt-6",
                      days > 1 &&
                        "before:absolute before:bottom-5 before:left-4 before:top-5 before:w-px before:bg-border"
                    )}
                  >
                    {itinerary.day_by_day_itinerary.map((day, index) => {
                      const route = summarizeDayRoute(day);
                      const theme =
                        cleanDayTitle(day.title) ||
                        day.activities
                          .map((activity) =>
                            typeof activity === "string"
                              ? activity
                              : activity.name || activity.title || ""
                          )
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(" · ");

                      return (
                        <li
                          key={`${day.day}-${index}`}
                          className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 sm:gap-4"
                        >
                          <span
                            className={cn(
                              "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
                              index === 0
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-muted-foreground"
                            )}
                          >
                            {day.day}
                          </span>

                          <div
                            className={cn(
                              "flex min-w-0 flex-col gap-1.5 pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
                              index < days - 1 && "border-b border-border/50"
                            )}
                          >
                            <div className="min-w-0 sm:w-44 sm:shrink-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-sm font-semibold text-foreground">
                                  Day {day.day}
                                </p>
                                {day.permit_required && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                    <Ticket
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Permit
                                  </span>
                                )}
                              </div>
                              {theme && (
                                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                  {theme}
                                </p>
                              )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1 text-xs text-foreground/80">
                              {route.from && route.to ? (
                                <>
                                  <span className="inline-flex min-w-0 items-center gap-1">
                                    <MapPin
                                      className="h-3.5 w-3.5 shrink-0 text-primary/80"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">
                                      {route.from}
                                    </span>
                                  </span>
                                  <ChevronRight
                                    className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60"
                                    aria-hidden="true"
                                  />
                                  <span className="inline-flex min-w-0 items-center gap-1">
                                    <MapPin
                                      className="h-3.5 w-3.5 shrink-0 text-primary/80"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">{route.to}</span>
                                  </span>
                                </>
                              ) : route.transport ? (
                                <span className="inline-flex min-w-0 items-start gap-1.5">
                                  <Car
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80"
                                    aria-hidden="true"
                                  />
                                  <span className="line-clamp-2">
                                    {route.transport}
                                  </span>
                                </span>
                              ) : route.from ? (
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <MapPin
                                    className="h-3.5 w-3.5 shrink-0 text-primary/80"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">
                                    {route.from}
                                  </span>
                                </span>
                              ) : null}
                            </div>

                            {route.driveTime && (
                              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                <Car
                                  className="h-3.5 w-3.5 text-primary/70"
                                  aria-hidden="true"
                                />
                                {route.driveTime}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center">
                    <p className="text-sm font-bold text-foreground">
                      No day-by-day plan was shared
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The owner shared the trip without the day-by-day details.
                    </p>
                  </div>
                )}
              </section>

              {/* Stays and food, only when the itinerary names them */}
              {(stays.length > 0 || eats.length > 0) && (
                <div
                  className={cn(
                    "grid gap-4",
                    stays.length > 0 && eats.length > 0 && "sm:grid-cols-2"
                  )}
                >
                  {stays.length > 0 && (
                    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
                        <Bed
                          className="h-4 w-4 text-primary"
                          aria-hidden="true"
                        />
                        Where you'll stay
                      </h2>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {stays.slice(0, 2).map((stay, index) => (
                          <figure
                            key={`${stay.name}-${index}`}
                            className="group min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-background"
                          >
                            <TripCover
                              destination={stay.location || trip.destination}
                              title={stay.name}
                              width={600}
                              className="aspect-[4/3]"
                            />
                            <figcaption className="space-y-1 p-3">
                              <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                                {stay.name}
                              </p>
                              {(stay.location ||
                                stay.vibe ||
                                stay.description) && (
                                <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                                  {[
                                    stay.location,
                                    stay.vibe || stay.description,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                      {stays.length > 2 && (
                        <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          Also on the plan:{" "}
                          {stays
                            .slice(2)
                            .map((stay) => stay.name)
                            .join(" · ")}
                        </p>
                      )}
                    </section>
                  )}

                  {eats.length > 0 && (
                    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
                        <Utensils
                          className="h-4 w-4 text-primary"
                          aria-hidden="true"
                        />
                        Where you'll eat
                      </h2>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {eats.slice(0, 2).map((spot, index) => (
                          <figure
                            key={`${spot}-${index}`}
                            className="group min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-background"
                          >
                            <TripCover
                              destination={trip.destination}
                              title={spot}
                              width={600}
                              className="aspect-[4/3]"
                            />
                            <figcaption className="p-3">
                              <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                                {spot}
                              </p>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                      {eats.length > 2 && (
                        <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          Also on the plan: {eats.slice(2).join(" · ")}
                        </p>
                      )}
                    </section>
                  )}
                </div>
              )}

              {itinerary.highlights.length > 0 && (
                <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
                  <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
                    <Sparkles
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    Trip highlights
                  </h2>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {itinerary.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {trip.customRoutes.length > 0 && (
                <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
                  <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
                    <Route
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    Routes on this trip
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {trip.customRoutes.map((route, index) => (
                      <li
                        key={`${route.name}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                          {route.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {route.day ? `Day ${route.day} · ` : ""}
                          {route.distanceKm > 0
                            ? `${route.distanceKm.toFixed(1)} km`
                            : route.mode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
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

            {/* Trip facts and next steps */}
            <aside className="space-y-4 lg:sticky lg:top-24">
              <section
                aria-labelledby="trip-facts-heading"
                className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm"
              >
                <h2
                  id="trip-facts-heading"
                  className="font-display text-xl font-semibold tracking-tight text-foreground"
                >
                  Trip facts
                </h2>
                <dl className="mt-2 divide-y divide-border/60">
                  {sharedOn && (
                    <FactRow
                      icon={CalendarDays}
                      label="Shared"
                      value={sharedOn}
                    />
                  )}
                  {trip.groupType && (
                    <FactRow
                      icon={Users}
                      label="Group"
                      value={trip.groupType}
                      capitalize
                    />
                  )}
                  <FactRow
                    icon={Clock}
                    label="Duration"
                    value={`${trip.durationDays} ${
                      trip.durationDays === 1 ? "day" : "days"
                    } · ${galleryDurationLabel(trip.durationDays)}`}
                  />
                  {trip.season && (
                    <FactRow
                      icon={Leaf}
                      label="Season"
                      value={trip.season}
                      capitalize
                    />
                  )}
                </dl>

                <p className="mt-3 border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground">
                  {joinState?.isOwner
                    ? "You're the host — join requests arrive in your dashboard."
                    : `${hostName} reviews join requests so the trip stays a good fit for everyone.`}
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Lock
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  Shared on purpose, private by default.
                </p>
              </section>

              <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                <p className="text-xs font-bold text-foreground">
                  What's shared — and what isn't
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  You're seeing the itinerary, the dates the owner chose to share
                  and their public profile. Budgets, expenses and travel companions
                  stay private. The{" "}
                  <Link
                    to="/guidelines"
                    className="font-bold text-primary hover:underline"
                  >
                    community guidelines
                  </Link>{" "}
                  cover the rest.
                </p>
              </section>

              <button
                type="button"
                onClick={handleReportClick}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-destructive"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                Report this trip
              </button>

              <Button
                asChild
                variant="outline"
                className="h-11 w-full rounded-2xl text-xs font-bold"
              >
                <Link to="/plan">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Plan your own trip
                </Link>
              </Button>
            </aside>
          </div>
        </div>
      </main>

      {/* G5: join request composer (owner identity + short note + safety copy) */}
      <JoinRequestDialog
        open={joinDialogOpen}
        onClose={() => setJoinDialogOpen(false)}
        trip={trip}
        onSubmitted={handleJoinSubmitted}
      />

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="trip"
        targetId={trip._id}
        targetLabel={trip.title}
      />
    </div>
  );
};

export default GalleryTrip;
