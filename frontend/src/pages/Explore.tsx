import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { PublicEventCard } from "@/components/events/PublicEventCard";
import { TripCover } from "@/components/gallery/TripCover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api, ApiError } from "@/services/api";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { DURATION_LABELS, formatGalleryDates } from "@/lib/galleryFormat";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  History,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ExploreWhen,
  GalleryDuration,
  GalleryTripSummary,
} from "@/types/gallery";
import type { PublicEventSummary } from "@/types/events";

/**
 * Public gallery index (Milestone 8 G3) and the events strip (M10 E1).
 *
 * Anonymous: no session is read and both payloads are public projections, so
 * this page can be linked from anywhere. Trip filters and the live/past
 * switch live in the URL (`?view=&q=&duration=&groupType=&tag=`) so a
 * filtered view is shareable; the page number stays in memory because a
 * shared link should start at the top.
 *
 * Paging is Previous/Next over fixed pages rather than an append-only "load
 * more". The live tab is ordered by departure, so the client asks by page
 * number instead of carrying a sort cursor. Upcoming events are a browse
 * affordance rather than search results, so they appear in the live tab only
 * when no trip filter is active.
 */

const PAGE_SIZE = 12;

const DURATION_OPTIONS: { value: GalleryDuration; label: string }[] = [
  { value: "short", label: DURATION_LABELS.short },
  { value: "week", label: DURATION_LABELS.week },
  { value: "fortnight", label: DURATION_LABELS.fortnight },
  { value: "long", label: DURATION_LABELS.long },
];

/** Values match the free-form `group_type` authors pick; the server ignores case. */
const GROUP_OPTIONS = ["Solo", "Couple", "Friends", "Family"];

/** Curated from the vocabulary the publish form and seeded trips use. */
const TAG_OPTIONS = [
  { value: "beaches", label: "Beaches" },
  { value: "hiking", label: "Hiking" },
  { value: "road-trip", label: "Road trips" },
  { value: "food", label: "Food" },
];

function isDuration(value: string | null): value is GalleryDuration {
  return value === "short" || value === "week" || value === "fortnight" || value === "long";
}

const DURATION_MENU = [
  { value: "", label: "Any length" },
  ...DURATION_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
];

const GROUP_MENU = GROUP_OPTIONS.map((option) => ({ value: option, label: option }));

/**
 * One filter in the compact toolbar. The trigger shows the chosen value so a
 * filtered view is readable without opening the menu, and the list only takes
 * space while it is open.
 */
const FilterMenu = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  /** Empty string means "no choice", which is what "Any length" selects. */
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => {
  const selected = value
    ? options.find((option) => option.value === value)
    : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${selected ? selected.label : "any"}`}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
            selected
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-border/80 bg-card text-foreground/80 hover:border-primary/30 hover:text-foreground"
          )}
        >
          {selected ? selected.label : label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 rounded-xl border-border/70 p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value || "any"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? "" : option.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors",
                active
                  ? "bg-primary/5 text-primary"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
            >
              {option.label}
              {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

const StatusCard = ({
  active,
  icon,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      active
        ? "border-primary/40 bg-card shadow-sm"
        : "border-transparent bg-transparent hover:bg-card/60"
    )}
  >
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}
    >
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block font-display text-lg font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
        {hint}
      </span>
    </span>
  </button>
);

const ExploreCard = ({ trip, past }: { trip: GalleryTripSummary; past?: boolean }) => (
  <article className="group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
    <Link to={`/explore/${trip._id}`} className="block" aria-label={`Open ${trip.title}`}>
      <TripCover destination={trip.destination} title={trip.title}>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-foreground shadow-xs backdrop-blur">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}
        </span>
        {past && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-muted-foreground shadow-xs backdrop-blur">
            <History className="h-3 w-3" aria-hidden="true" />
            Finished
          </span>
        )}
      </TripCover>
    </Link>

    <div className="space-y-2 p-4">
      <p className="inline-flex max-w-full items-center gap-1 text-[11px] font-semibold text-primary">
        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{trip.destination || "Somewhere new"}</span>
      </p>

      <Link to={`/explore/${trip._id}`} className="block">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
          {trip.title}
        </h3>
      </Link>

      {trip.summary && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {trip.summary}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          {formatGalleryDates(trip.dates)}
        </span>

        <Link
          to={`/travelers/${encodeURIComponent(trip.publisher.handle)}`}
          className="flex min-w-0 items-center gap-1.5 rounded-full px-1 py-0.5 transition-colors hover:bg-muted/70"
          title={`View ${trip.publisher.name}'s profile`}
        >
          <Avatar className="h-6 w-6 shrink-0">
            {trip.publisher.avatarUrl && (
              <AvatarImage
                src={avatarSrc(trip.publisher.avatarUrl)}
                alt={trip.publisher.name}
              />
            )}
            <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
              {initialsFor(trip.publisher.name || trip.publisher.handle)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] font-semibold text-muted-foreground">
            {trip.publisher.name}
          </span>
        </Link>
      </div>
    </div>
  </article>
);

interface PageResult {
  key: string;
  trips: GalleryTripSummary[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface PagePosition {
  key: string;
  page: number;
}

const Explore = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);

  const q = searchParams.get("q") ?? "";
  const view: ExploreWhen = searchParams.get("view") === "past" ? "past" : "live";
  const duration = isDuration(searchParams.get("duration"))
    ? (searchParams.get("duration") as GalleryDuration)
    : undefined;
  const groupType = searchParams.get("groupType") ?? "";
  const tag = searchParams.get("tag") ?? "";

  const [searchInput, setSearchInput] = useState(q);
  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // A new filter set or tab always starts at page one, even before state
  // catches up. The page stays in memory so a shared link starts at the top.
  const filterKey = [view, q, duration ?? "", groupType, tag].join("|");
  const [position, setPosition] = useState<PagePosition>({
    key: filterKey,
    page: 1,
  });
  const positionForFilters =
    position.key === filterKey ? position : { key: filterKey, page: 1 };
  const page = positionForFilters.page;
  const pageKey = `${filterKey}::${page}`;

  // Results are tagged with the page they belong to, so a tab or filter change
  // never shows the previous page's trips while the new one loads.
  const current = result?.key === pageKey ? result : null;
  const trips = current?.trips ?? [];
  const total = current?.total ?? 0;
  const hasMore = current?.hasMore ?? false;

  const hasFilters = Boolean(q || duration || groupType || tag);
  const isPast = view === "past";

  useEffect(() => {
    return applyPageMeta({
      title: "Explore trips to join · TravelAI",
      description:
        "Real trips people have planned and shared on TravelAI, plus camps and retreats agencies are running. Ask to join a live trip, or take a copy of a finished one and make it your own.",
      ogType: "website",
    });
  }, []);

  /**
   * Writes filters into the URL. Any change restarts paging, because page N is
   * only meaningful for the tab and filter set that produced it.
   */
  const applyFilters = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setView = (next: ExploreWhen) =>
    applyFilters({ view: next === "past" ? "past" : null });

  // Search is debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === q) return;

    const timer = window.setTimeout(() => {
      applyFilters({ q: trimmed || null });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput, q, applyFilters]);

  // Upcoming events load once and never touch the trip filters: they are a
  // browse affordance, and a failed call simply leaves the strip out.
  useEffect(() => {
    let cancelled = false;

    api
      .getPublicEvents({ limit: 6 })
      .then((page) => {
        if (!cancelled) setEvents(page.events);
      })
      .catch((err) => {
        console.error("Failed to load upcoming events:", err);
        if (!cancelled) setEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The homepage links straight to the events strip (`/explore#events`), and
  // SPA navigation does not scroll to a hash on its own.
  useEffect(() => {
    if (location.hash !== "#events" || events.length === 0) return;
    document
      .getElementById("events")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, events.length]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    api
      .getExplore({
        q: q || undefined,
        duration,
        groupType: groupType || undefined,
        tag: tag || undefined,
        when: view,
        page,
        limit: PAGE_SIZE,
      })
      .then((pageResult) => {
        if (cancelled) return;
        setResult({
          key: pageKey,
          trips: pageResult.trips,
          total: pageResult.total,
          page: pageResult.page,
          hasMore: pageResult.hasMore,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load the gallery:", err);
        setResult(null);
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "We couldn't load the gallery right now."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, duration, groupType, tag, view, page, pageKey, reloadKey]);

  const goToNext = () => {
    if (!hasMore) return;
    setPosition({ key: filterKey, page: page + 1 });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToPrevious = () => {
    if (page <= 1) return;
    setPosition({ key: filterKey, page: page - 1 });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearFilters = () => {
    setSearchInput("");
    applyFilters({ q: null, duration: null, groupType: null, tag: null });
  };

  const activeGroupType = useMemo(
    () =>
      GROUP_OPTIONS.find(
        (option) => option.toLowerCase() === groupType.toLowerCase()
      ) ?? groupType,
    [groupType]
  );

  const startIndex = (page - 1) * PAGE_SIZE + 1;
  const endIndex = startIndex + trips.length - 1;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 px-4 pb-20 pt-24">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            Find a trip you'd like to join
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Real trips, shared by the people who planned them. Ask to join one
            that's still ahead, or borrow the plan from a trip that's already
            happened — the copy is yours to change.
          </p>
          <div
            role="group"
            aria-label="Trip status"
            className="mx-auto mt-7 grid max-w-3xl gap-1.5 rounded-3xl border border-border/60 bg-secondary/40 p-1.5 sm:grid-cols-2"
          >
            <StatusCard
              active={view === "live"}
              icon={<Compass className="h-5 w-5" aria-hidden="true" />}
              title="Live trips"
              hint="Happening soon — ask to join"
              onClick={() => setView("live")}
            />
            <StatusCard
              active={isPast}
              icon={<History className="h-5 w-5" aria-hidden="true" />}
              title="Copy a plan"
              hint="Finished trips — take the plan"
              onClick={() => setView("past")}
            />
          </div>
        </header>

        <div className="mx-auto mt-8 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Where are you headed?"
              aria-label="Search shared trips"
              className="h-12 rounded-full border-border/80 bg-card pl-11 pr-11 text-sm shadow-xs"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  applyFilters({ q: null });
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <FilterMenu
            label="Duration"
            value={duration ?? ""}
            options={DURATION_MENU}
            onChange={(next) =>
              applyFilters({ duration: isDuration(next) ? next : null })
            }
          />
          <FilterMenu
            label="Group type"
            value={activeGroupType}
            options={GROUP_MENU}
            onChange={(next) => applyFilters({ groupType: next || null })}
          />
          <FilterMenu
            label="Tags"
            value={tag}
            options={TAG_OPTIONS}
            onChange={(next) => applyFilters({ tag: next || null })}
          />

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[11px] font-bold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div ref={resultsRef} className="mt-10 scroll-mt-24 space-y-5">
          <h2 className="sr-only">Shared trips</h2>

          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center space-y-4">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <div className="space-y-1 text-center">
                <h3 className="text-base font-bold text-foreground">
                  Gathering trips people shared…
                </h3>
                <p className="text-xs text-muted-foreground">
                  Only the ones their owners were happy to share
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="space-y-4 rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  We couldn't load the gallery
                </p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
            </div>
          ) : total === 0 ? (
            <div className="space-y-3 rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Compass className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {hasFilters
                  ? "Nothing matches those filters yet"
                  : isPast
                    ? "No finished trips to copy yet"
                    : "No trips have been shared yet"}
              </p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                {hasFilters
                  ? "Maybe try a wider search, a different trip length, or clear them?"
                  : isPast
                    ? "Once a shared trip wraps up, its plan stays here so you can borrow it."
                    : "Be the first — plan a trip, then share it once you're happy with it."}
              </p>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              ) : isPast ? (
                <Button
                  type="button"
                  variant="hero"
                  size="sm"
                  className="gap-1.5 rounded-xl text-xs font-bold"
                  onClick={() => setView("live")}
                >
                  <Compass className="h-3.5 w-3.5" />
                  See live trips
                </Button>
              ) : (
                <Button
                  asChild
                  variant="hero"
                  size="sm"
                  className="gap-1.5 rounded-xl text-xs font-bold"
                >
                  <Link to="/plan">
                    <Sparkles className="h-3.5 w-3.5" />
                    Plan a trip
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              {isPast && (
                <p className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  These trips have already happened, so joining is closed — but
                  the plan is still yours to borrow. Open one and take a copy.
                </p>
              )}

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {trips.map((trip) => (
                  <ExploreCard key={trip._id} trip={trip} past={isPast} />
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Showing {startIndex}–{endIndex} of {total}{" "}
                  {total === 1 ? "trip" : "trips"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goToPrevious}
                    disabled={page <= 1}
                    className="h-10 gap-1.5 rounded-xl px-4 text-xs font-bold"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goToNext}
                    disabled={!hasMore}
                    className="h-10 gap-1.5 rounded-xl border-primary/40 px-4 text-xs font-bold text-primary hover:bg-primary/5 disabled:border-border disabled:text-muted-foreground"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {view === "live" && !hasFilters && events.length > 0 && (
          <section
            id="events"
            aria-labelledby="explore-events-heading"
            className="mt-12 scroll-mt-24 space-y-4 rounded-3xl border border-border/70 bg-muted/40 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <h2
                  id="explore-events-heading"
                  className="font-display text-lg font-semibold tracking-tight text-foreground"
                >
                  On the calendar
                </h2>
                <p className="text-xs text-muted-foreground">
                  Camps, retreats and group trips agencies are running. Ask them
                  about a spot.
                </p>
              </div>
              <Link
                to="/agencies"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5"
              >
                Browse agencies
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <PublicEventCard key={event._id} event={event} showAgency />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Explore;
