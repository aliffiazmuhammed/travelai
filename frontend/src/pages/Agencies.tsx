import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { TravellerPageHeader } from "@/components/traveller/TravellerPageHeader";
import { AgencyLogoTile } from "@/components/directory/AgencyLogoTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/services/api";
import { formatMoney } from "@/lib/currency";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AgencyDirectoryCard,
  AgencyDirectoryFacet,
  AgencyDirectoryFacets,
} from "@/types/agency";

/**
 * Public agency directory (Milestone 9 D3).
 *
 * Anonymous: no session is read and the payload is the card projection, so the
 * page can be linked from anywhere. Filters live in the URL (`?q=&destination=
 * &specialty=&city=&language=`) so a filtered view is shareable; the cursor
 * stays in memory because a shared link should always start at the newest page.
 */

const PAGE_SIZE = 12;

const FILTER_KEYS = ["q", "destination", "specialty", "city", "language"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface FacetGroup {
  key: FilterKey;
  title: string;
  facets: AgencyDirectoryFacet[];
}

const AgencyCard = ({ agency }: { agency: AgencyDirectoryCard }) => (
  <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
    <Link
      to={`/agencies/${encodeURIComponent(agency.slug)}`}
      className="block space-y-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        <AgencyLogoTile
          name={agency.name}
          logoUrl={agency.logoUrl}
          className="h-12 w-12 text-base"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="flex items-center gap-1.5 text-base font-black leading-snug text-foreground">
            <span className="truncate">{agency.name}</span>
            {agency.verified && (
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-teal-600"
                aria-label="Verified agency"
              />
            )}
          </h3>
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {agency.baseCity ? `Based in ${agency.baseCity}` : "Plans trips across India"}
          </p>
        </div>
      </div>

      {agency.services.length > 0 && (
        <p className="text-[11px] font-bold text-primary">
          {agency.services
            .slice(0, 3)
            .map((service) => service.label)
            .join(" · ")}
        </p>
      )}

      {agency.specialties.length > 0 && (
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
          Known for {agency.specialties.join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-xs font-bold text-foreground">
          {agency.fromPricePerPerson === null
            ? "Prices on request"
            : `From ${formatMoney(agency.fromPricePerPerson, agency.currency)} per person`}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
          See their profile
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  </article>
);
const FilterChips = ({
  group,
  selected,
  onToggle,
}: {
  group: FacetGroup;
  selected: string;
  onToggle: (key: FilterKey, value: string) => void;
}) => (
  <div className="space-y-1.5">
    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      {group.title}
    </p>
    <div className="flex flex-wrap gap-1.5">
      {group.facets.map((facet) => {
        const active = selected === facet.value;
        return (
          <button
            key={facet.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(group.key, facet.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors min-h-[28px]",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-background/60 text-foreground/80 hover:border-primary/40 hover:text-primary"
            )}
          >
            {facet.label}
            <span
              className={cn(
                "text-[10px]",
                active ? "text-primary-foreground/80" : "text-muted-foreground"
              )}
            >
              {facet.count}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

const Agencies = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") ?? "",
      destination: searchParams.get("destination") ?? "",
      specialty: searchParams.get("specialty") ?? "",
      city: searchParams.get("city") ?? "",
      language: searchParams.get("language") ?? "",
    }),
    [searchParams]
  );

  const [searchInput, setSearchInput] = useState(filters.q);
  const [agencies, setAgencies] = useState<AgencyDirectoryCard[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [facets, setFacets] = useState<AgencyDirectoryFacets | null>(null);

  const hasFilters = FILTER_KEYS.some((key) => Boolean(filters[key]));

  useEffect(() => {
    return applyPageMeta({
      title: "Travel agencies · TravelAI",
      description:
        "Browse travel agencies on TravelAI: the places they cover, the services they offer and how to reach them.",
      ogType: "website",
    });
  }, []);

  // Chips are a convenience: if facets fail, search and the listing still work.
  useEffect(() => {
    let cancelled = false;
    api
      .getAgencyFacets()
      .then((response) => {
        if (!cancelled) setFacets(response.facets);
      })
      .catch((err) => {
        console.error("Failed to load directory facets:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Writes filters into the URL. Any change restarts paging, because a cursor
   * is only valid for the filter set that produced it.
   */
  const applyFilters = useCallback(
    (changes: Partial<Record<FilterKey, string | null>>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Search is debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === filters.q) return;

    const timer = window.setTimeout(() => {
      applyFilters({ q: trimmed || null });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput, filters.q, applyFilters]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.getAgencies({
          q: filters.q || undefined,
          destination: filters.destination || undefined,
          specialty: filters.specialty || undefined,
          city: filters.city || undefined,
          language: filters.language || undefined,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setAgencies(page.agencies);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the agency directory:", err);
        setAgencies([]);
        setTotal(0);
        setNextCursor(null);
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "We couldn't load the directory right now."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.getAgencies({
        q: filters.q || undefined,
        destination: filters.destination || undefined,
        specialty: filters.specialty || undefined,
        city: filters.city || undefined,
        language: filters.language || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setAgencies((previous) => {
        const seen = new Set(previous.map((agency) => agency.slug));
        return [...previous, ...page.agencies.filter((agency) => !seen.has(agency.slug))];
      });
      setNextCursor(page.nextCursor);
      setTotal(page.total);
    } catch (err) {
      console.error("Failed to load more agencies:", err);
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
    applyFilters({
      q: null,
      destination: null,
      specialty: null,
      city: null,
      language: null,
    });
  };

  const toggleFilter = (key: FilterKey, value: string) => {
    if (key === "q") return;
    applyFilters({ [key]: filters[key] === value ? null : value });
  };

  const facetGroups = useMemo<FacetGroup[]>(() => {
    if (!facets) return [];
    const groups: FacetGroup[] = [
      { key: "destination", title: "Destinations", facets: facets.destinations.slice(0, 8) },
      { key: "specialty", title: "Specialties", facets: facets.specialties.slice(0, 6) },
      { key: "city", title: "Based in", facets: facets.cities.slice(0, 6) },
      { key: "language", title: "Languages", facets: facets.languages },
    ];
    return groups.filter((group) => group.facets.length > 0);
  }, [facets]);

  const activeFilters = useMemo(() => {
    const chips: { key: FilterKey; label: string }[] = [];
    if (filters.q) chips.push({ key: "q", label: `“${filters.q}”` });
    for (const group of facetGroups) {
      const value = filters[group.key];
      if (!value) continue;
      const facet = group.facets.find((entry) => entry.value === value);
      chips.push({ key: group.key, label: facet?.label ?? value });
    }
    return chips;
  }, [filters, facetGroups]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl space-y-8">
        <TravellerPageHeader
          tone="hero"
          eyebrow="Travel agencies"
          icon={Building2}
          title="Find an agency that plans your kind of trip"
          description="People who plan trips for a living, with the places they cover and the services they offer. Have a look around until one feels like a good fit."
          crumbs={[{ label: "Agencies" }]}
          actions={
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs font-bold gap-1.5"
            >
              <Link to="/agencies/apply">
                <Building2 className="h-3.5 w-3.5" />
                List your agency
              </Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Agency name, city or destination"
                aria-label="Search agencies"
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

            {facetGroups.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {facetGroups.map((group) => (
                  <FilterChips
                    key={group.key}
                    group={group}
                    selected={filters[group.key]}
                    onToggle={toggleFilter}
                  />
                ))}
              </div>
            )}

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      if (chip.key === "q") setSearchInput("");
                      applyFilters({ [chip.key]: null });
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 min-h-[28px]"
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
        </TravellerPageHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[320px] space-y-4">
            <Loader2 className="w-9 h-9 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h2 className="text-base font-bold text-foreground">
                Looking up agencies…
              </h2>
              <p className="text-xs text-muted-foreground">
                Only the ones that have published a profile
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
                We couldn't load the directory
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
        ) : agencies.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {hasFilters
                ? "No agencies match those filters yet"
                : "No agencies are listed yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {hasFilters
                ? "Maybe widen the search, or clear a filter or two."
                : "Agencies are still setting up their public profiles. In the meantime, see where other travellers are heading."}
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
                <Link to="/explore">
                  <Sparkles className="w-3.5 h-3.5" />
                  Explore shared trips
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <section className="space-y-5">
            <p className="text-xs font-semibold text-muted-foreground">
              Showing {agencies.length} of {total}{" "}
              {total === 1 ? "agency" : "agencies"}
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agencies.map((agency) => (
                <AgencyCard key={agency.slug} agency={agency} />
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
                  Load more agencies
                </Button>
              ) : (
                <p className="text-[11px] font-semibold text-muted-foreground">
                  That's every agency for now.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Agencies;
