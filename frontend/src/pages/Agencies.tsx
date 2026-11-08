import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { AgencyLogoTile } from "@/components/directory/AgencyLogoTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/services/api";
import { formatMoney } from "@/lib/currency";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Languages,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
 * &specialty=&city=&language=`) so a filtered view is shareable.
 *
 * Paging is Previous/Next over a cursor stack rather than "load more": the API
 * has no offset, so remembering the cursors already used is what makes going
 * back possible.
 */

const PAGE_SIZE = 12;

const FILTER_KEYS = ["q", "destination", "specialty", "city", "language"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface FacetGroup {
  key: FilterKey;
  title: string;
  icon: LucideIcon;
  facets: AgencyDirectoryFacet[];
}

interface PageResult {
  key: string;
  agencies: AgencyDirectoryCard[];
  total: number;
  nextCursor: string | null;
}

interface PagePosition {
  key: string;
  /** `cursors[0]` is the first page; each entry starts one page. */
  cursors: (string | undefined)[];
  index: number;
}

const AgencyCard = ({ agency }: { agency: AgencyDirectoryCard }) => {
  const profileHref = `/agencies/${encodeURIComponent(agency.slug)}`;
  const description = agency.services.map((service) => service.label).join(" · ");

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-6">
      <div className="flex items-start gap-4">
        <AgencyLogoTile
          name={agency.name}
          logoUrl={agency.logoUrl}
          className="h-16 w-16 rounded-2xl text-xl"
          imgClassName="p-2"
        />

        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-foreground">
            <Link
              to={profileHref}
              className="truncate transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              {agency.name}
            </Link>
            {agency.verified && (
              <BadgeCheck
                className="h-4 w-4 shrink-0 text-primary"
                aria-label="Verified agency"
              />
            )}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {agency.baseCity || "Plans trips across India"}
            </span>
          </p>
        </div>
      </div>

      {description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/80">
          {description}
        </p>
      )}

      {agency.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agency.specialties.slice(0, 3).map((specialty) => (
            <span
              key={specialty}
              className="rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {specialty}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="text-xs font-semibold text-foreground">
            {agency.fromPricePerPerson === null
              ? "Prices on request"
              : `From ${formatMoney(
                  agency.fromPricePerPerson,
                  agency.currency
                )} per person`}
          </span>
          <Link
            to={profileHref}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            View profile
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
};

const FilterDropdown = ({
  group,
  selected,
  onSelect,
}: {
  group: FacetGroup;
  selected: string;
  onSelect: (value: string) => void;
}) => {
  const Icon = group.icon;
  const activeFacet = group.facets.find((facet) => facet.value === selected);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-[40px] max-w-full items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
            activeFacet
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/80 bg-card text-foreground/80 hover:border-primary/30 hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {activeFacet ? activeFacet.label : group.title}
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 opacity-60"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto rounded-2xl"
      >
        {activeFacet && (
          <>
            <DropdownMenuItem
              onSelect={() => onSelect(activeFacet.value)}
              className="gap-2 text-xs font-semibold text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear {group.title.toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {group.facets.map((facet) => {
          const active = selected === facet.value;
          return (
            <DropdownMenuItem
              key={facet.value}
              onSelect={() => onSelect(facet.value)}
              className="gap-2 text-xs"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {active ? (
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  active && "font-bold text-primary"
                )}
              >
                {facet.label}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {facet.count}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Agencies = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);

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
  const [facets, setFacets] = useState<AgencyDirectoryFacets | null>(null);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const hasFilters = FILTER_KEYS.some((key) => Boolean(filters[key]));

  // A new filter set always starts at page one, even before state catches up.
  const filterKey = FILTER_KEYS.map((key) => filters[key]).join("|");
  const [position, setPosition] = useState<PagePosition>({
    key: filterKey,
    cursors: [undefined],
    index: 0,
  });
  const positionForFilters =
    position.key === filterKey
      ? position
      : { key: filterKey, cursors: [undefined], index: 0 };
  const cursor = positionForFilters.cursors[positionForFilters.index];
  const pageKey = `${filterKey}::${cursor ?? ""}`;

  // Results are tagged with the page they belong to, so a filter change never
  // shows the previous filter's agencies while the new page loads.
  const current = result?.key === pageKey ? result : null;
  const agencies = current?.agencies ?? [];
  const total = current?.total ?? 0;
  const nextCursor = current?.nextCursor ?? null;

  useEffect(() => {
    return applyPageMeta({
      title: "Travel agencies · waytowalk",
      description:
        "Browse travel agencies on waytowalk: the places they cover, the services they offer and how to reach them.",
      ogType: "website",
    });
  }, []);

  // Filter pills are a convenience: if facets fail, search and the listing work.
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
          cursor,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setResult({
          key: pageKey,
          agencies: page.agencies,
          total: page.total,
          nextCursor: page.nextCursor,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the agency directory:", err);
        setResult(null);
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
  }, [filters, cursor, pageKey, reloadKey]);

  const goToNext = () => {
    if (!nextCursor) return;
    setPosition({
      key: filterKey,
      cursors: [
        ...positionForFilters.cursors.slice(0, positionForFilters.index + 1),
        nextCursor,
      ],
      index: positionForFilters.index + 1,
    });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToPrevious = () => {
    if (positionForFilters.index === 0) return;
    setPosition({ ...positionForFilters, index: positionForFilters.index - 1 });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Only the facets the directory actually exposes: there is no group-size or
  // budget dimension in the public payload, so no pill pretends there is one.
  const facetGroups = useMemo<FacetGroup[]>(() => {
    if (!facets) return [];
    const groups: FacetGroup[] = [
      {
        key: "destination",
        title: "Destination",
        icon: MapPin,
        facets: facets.destinations.slice(0, 10),
      },
      {
        key: "specialty",
        title: "Trip type",
        icon: Compass,
        facets: facets.specialties.slice(0, 10),
      },
      {
        key: "city",
        title: "Based in",
        icon: Building2,
        facets: facets.cities.slice(0, 10),
      },
      {
        key: "language",
        title: "Languages",
        icon: Languages,
        facets: facets.languages,
      },
    ];
    return groups.filter((group) => group.facets.length > 0);
  }, [facets]);

  const startIndex = positionForFilters.index * PAGE_SIZE + 1;
  const endIndex = startIndex + agencies.length - 1;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 px-4 pb-20 pt-24">
        <header className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="font-display text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
                Find an agency that plans your kind of trip
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Local experts and small teams who plan trips for a living.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5 rounded-full text-xs font-bold"
            >
              <Link to="/agencies/apply">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                List your agency
              </Link>
            </Button>
          </div>

          <div className="max-w-2xl">
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Agency name, city or destination"
                aria-label="Search agencies"
                className="h-12 rounded-2xl border-border/80 bg-card pl-11 pr-11 text-sm shadow-sm"
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
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {facetGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {facetGroups.map((group) => (
                <FilterDropdown
                  key={group.key}
                  group={group}
                  selected={filters[group.key]}
                  onSelect={(value) => toggleFilter(group.key, value)}
                />
              ))}
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 min-h-[40px] rounded-full px-2 text-xs font-bold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </header>

        <div ref={resultsRef} className="mt-8 scroll-mt-24">
          <h2 className="sr-only">Agency directory results</h2>

          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center space-y-4">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <div className="space-y-1 text-center">
                <p className="text-base font-bold text-foreground">
                  Looking up agencies…
                </p>
                <p className="text-xs text-muted-foreground">
                  Only the ones that have published a profile
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="space-y-4 rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
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
            <div className="space-y-3 rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {hasFilters
                  ? "No agencies match those filters yet"
                  : "No agencies are listed yet"}
              </p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
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
                <Button
                  asChild
                  variant="hero"
                  size="sm"
                  className="gap-1.5 rounded-xl text-xs font-bold"
                >
                  <Link to="/explore">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Explore shared trips
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {agencies.map((agency) => (
                  <AgencyCard key={agency.slug} agency={agency} />
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
                <p className="text-xs font-semibold text-muted-foreground">
                  {total === 1
                    ? "1 agency"
                    : `${total} agencies${
                        total > PAGE_SIZE
                          ? ` · showing ${startIndex}–${endIndex}`
                          : ""
                      }`}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goToPrevious}
                    disabled={positionForFilters.index === 0}
                    className="h-10 gap-1.5 rounded-full px-4 text-xs font-bold"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goToNext}
                    disabled={!nextCursor}
                    className="h-10 gap-1.5 rounded-full border-primary/40 px-4 text-xs font-bold text-primary hover:bg-primary/5 disabled:border-border disabled:text-muted-foreground"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Agencies;
