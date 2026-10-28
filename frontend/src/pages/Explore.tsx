import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/services/api";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { DURATION_LABELS, formatGalleryDates } from "@/lib/galleryFormat";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Compass,
  Globe,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  GalleryDuration,
  GalleryTripSummary,
} from "@/types/gallery";

/**
 * Public gallery index (Milestone 8 G3).
 *
 * Anonymous: no session is read and the payload is the card projection, so this
 * page can be linked from anywhere. Filters live in the URL (`?q=&duration=&
 * tag=`) so a filtered view is shareable; the cursor stays in memory because a
 * shared link should always start at the newest page.
 */

const PAGE_SIZE = 12;

const DURATION_OPTIONS: { value: GalleryDuration; label: string }[] = [
  { value: "short", label: DURATION_LABELS.short },
  { value: "week", label: DURATION_LABELS.week },
  { value: "fortnight", label: DURATION_LABELS.fortnight },
  { value: "long", label: DURATION_LABELS.long },
];

function isDuration(value: string | null): value is GalleryDuration {
  return value === "short" || value === "week" || value === "fortnight" || value === "long";
}

interface ExploreCardProps {
  trip: GalleryTripSummary;
  onTagClick: (tag: string) => void;
}

const ExploreCard = ({ trip, onTagClick }: ExploreCardProps) => (
  <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
    <Link to={`/explore/${trip._id}`} className="block space-y-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {trip.destination || "Somewhere new"}
          </p>
          <h3 className="text-base font-black text-foreground leading-snug group-hover:text-primary transition-colors">
            {trip.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
          {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}
        </span>
      </div>

      {trip.summary && (
        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
          {trip.summary}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-semibold">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatGalleryDates(trip.dates)}
        </span>
        {trip.season && <span className="capitalize">{trip.season}</span>}
        {trip.groupType && <span className="capitalize">{trip.groupType}</span>}
      </div>
    </Link>

    {trip.tags.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1">
        {trip.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            #{tag}
          </button>
        ))}
      </div>
    )}

    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
      <Link
        to={`/travelers/${encodeURIComponent(trip.publisher.handle)}`}
        className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-0.5 hover:bg-muted/60 transition-colors"
        title={`View ${trip.publisher.name}'s profile`}
      >
        <Avatar className="h-6 w-6 shrink-0">
          {trip.publisher.avatarUrl && (
            <AvatarImage
              src={avatarSrc(trip.publisher.avatarUrl)}
              alt={trip.publisher.name}
            />
          )}
          <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
            {initialsFor(trip.publisher.name || trip.publisher.handle)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-[11px] font-semibold text-muted-foreground">
          {trip.publisher.name}
        </span>
      </Link>

      <Link
        to={`/explore/${trip._id}`}
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-primary hover:gap-1.5 transition-all"
      >
        See the trip
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  </article>
);

const Explore = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const duration = isDuration(searchParams.get("duration"))
    ? (searchParams.get("duration") as GalleryDuration)
    : undefined;
  const groupType = searchParams.get("groupType") ?? "";
  const tag = searchParams.get("tag") ?? "";

  const [searchInput, setSearchInput] = useState(q);
  const [trips, setTrips] = useState<GalleryTripSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const hasFilters = Boolean(q || duration || groupType || tag);

  useEffect(() => {
    return applyPageMeta({
      title: "Explore trips to join · TravelAI",
      description:
        "Real trips people have planned and shared on TravelAI. Find one you fancy, ask the owner to join, or take a copy and make it your own.",
      ogType: "website",
    });
  }, []);

  /**
   * Writes filters into the URL. Any change other than the cursor restarts
   * paging, because a cursor is only valid for the filter set that produced it.
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

  // Search is debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === q) return;

    const timer = window.setTimeout(() => {
      applyFilters({ q: trimmed || null });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput, q, applyFilters]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.getExplore({
          q: q || undefined,
          duration,
          groupType: groupType || undefined,
          tag: tag || undefined,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setTrips(page.trips);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the gallery:", err);
        setTrips([]);
        setTotal(0);
        setNextCursor(null);
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "We couldn't load the gallery right now."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [q, duration, groupType, tag, reloadKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.getExplore({
        q: q || undefined,
        duration,
        groupType: groupType || undefined,
        tag: tag || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setTrips((previous) => {
        const seen = new Set(previous.map((trip) => trip._id));
        return [...previous, ...page.trips.filter((trip) => !seen.has(trip._id))];
      });
      setNextCursor(page.nextCursor);
      setTotal(page.total);
    } catch (err) {
      console.error("Failed to load more gallery trips:", err);
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "The next page could not be loaded."
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    applyFilters({ q: null, duration: null, groupType: null, tag: null });
  };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
    if (q) chips.push({ key: "q", label: `“${q}”`, clear: { q: null } });
    if (duration) {
      chips.push({
        key: "duration",
        label: DURATION_LABELS[duration],
        clear: { duration: null },
      });
    }
    if (groupType) {
      chips.push({ key: "groupType", label: groupType, clear: { groupType: null } });
    }
    if (tag) chips.push({ key: "tag", label: `#${tag}`, clear: { tag: null } });
    return chips;
  }, [q, duration, groupType, tag]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl space-y-8">
        <header className="rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card p-6 sm:p-8 space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
            <Globe className="w-3 h-3" />
            Trips people shared
          </div>
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Find a trip you'd like to join
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Real trips, shared by the people who planned them. Scroll until
              one catches your eye — then ask the owner to come along, or take
              a copy that's yours to change.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Where are you headed?"
                aria-label="Search shared trips"
                className="h-11 rounded-2xl pl-9 pr-10 bg-background/80"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    applyFilters({ q: null });
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={duration ? "outline" : "default"}
                onClick={() => applyFilters({ duration: null })}
                className="rounded-xl text-[11px] font-bold h-8 px-3"
              >
                Any length
              </Button>
              {DURATION_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={duration === option.value ? "default" : "outline"}
                  onClick={() =>
                    applyFilters({
                      duration: duration === option.value ? null : option.value,
                    })
                  }
                  className={cn(
                    "rounded-xl text-[11px] font-bold h-8 px-3",
                    duration !== option.value && "bg-background/60"
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activeFilters.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      if (chip.key === "q") setSearchInput("");
                      applyFilters(chip.clear);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15"
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-bold text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[320px] space-y-4">
            <Loader2 className="w-9 h-9 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Gathering trips people shared…
              </h3>
              <p className="text-xs text-muted-foreground">
                Only the ones their owners were happy to share
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
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
        ) : trips.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {hasFilters
                ? "Nothing matches those filters yet"
                : "No trips have been shared yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {hasFilters
                ? "Maybe try a wider search, a different trip length, or clear them?"
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
            ) : (
              <Button asChild variant="hero" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
                <Link to="/plan">
                  <Sparkles className="w-3.5 h-3.5" />
                  Plan a trip
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Showing {trips.length} of {total} shared{" "}
                {total === 1 ? "trip" : "trips"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <ExploreCard
                  key={trip._id}
                  trip={trip}
                  onTagClick={(nextTag) =>
                    applyFilters({ tag: tag === nextTag ? null : nextTag })
                  }
                />
              ))}
            </div>

            <div className="flex justify-center pt-2">
              {nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-2xl h-11 px-6 text-xs font-bold gap-2"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Load more trips
                </Button>
              ) : (
                <p className="text-[11px] font-semibold text-muted-foreground">
                  That's every shared trip for now.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Explore;
