import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/gallery/TripCover";
import { ReportDialog } from "@/components/gallery/ReportDialog";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { api } from "@/services/api";
import { useAuth } from "@/context/UserContext";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { applyPageMeta } from "@/lib/meta";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  Flag,
  Link2,
  Loader2,
  MapPin,
  Share2,
  Sparkles,
  Tag,
} from "lucide-react";
import type { GalleryDates, GalleryTravelerProfile } from "@/types/gallery";

/**
 * Public traveler page (Milestone 8 G2). Everything rendered here arrives from
 * `GET /api/travelers/:handle`, whose allow-list never carries the email, the
 * member list or any money field. Hidden-date trips only expose a month label.
 *
 * The hero wash is drawn from theme tokens rather than a photo: the payload has
 * no cover or city field, and a stock destination image would imply a place the
 * traveler never claimed. Trip cards use the shared `tripCoverUrl` helper.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dateLine(dates: GalleryDates): string {
  if (!dates.exact || !dates.startDate) return dates.label;
  const start = new Date(dates.startDate);
  if (Number.isNaN(start.getTime())) return dates.label;
  const format = (date: Date) =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const end = dates.endDate ? new Date(dates.endDate) : null;
  if (!end || Number.isNaN(end.getTime()) || dates.startDate === dates.endDate) {
    return format(start);
  }
  return `${format(start)} → ${format(end)}`;
}

/** Month + year only, for the "last shared" stat on real `publishedAt` values. */
function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const TravelerProfile = () => {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [traveler, setTraveler] = useState<GalleryTravelerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const isOwnProfile = Boolean(
    user?.handle &&
      traveler &&
      user.handle.toLowerCase() === traveler.handle.toLowerCase()
  );

  useEffect(() => {
    // G6: resume the report composer after a sign-in redirect, once.
    const wantsReport = Boolean(
      (location.state as { report?: boolean } | null)?.report
    );
    if (!wantsReport || !traveler || !isAuthenticated || isOwnProfile) return;
    navigate(location.pathname, { replace: true, state: null });
    setReportOpen(true);
  }, [location.state, location.pathname, traveler, isAuthenticated, isOwnProfile, navigate]);

  const handleReportClick = () => {
    if (!traveler || isOwnProfile) return;
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
  };

  useEffect(() => {
    if (!handle) {
      setError("No traveler handle provided.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTravelerProfile(handle);
        setTraveler(data.traveler);
      } catch (err: any) {
        console.error("Failed to load traveler profile:", err);
        setError(
          err?.status === 404
            ? "We could not find a traveler with that handle."
            : err?.message || "This profile could not be loaded right now."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [handle]);

  // Public profile pages keep their tab title and share preview in step with
  // the gallery pages (G3), which already apply page meta.
  useEffect(() => {
    if (!traveler) return;
    return applyPageMeta({
      title: `${traveler.name} (@${traveler.handle}) · waytowalk`,
      description:
        traveler.bio || `Trips shared by @${traveler.handle} on waytowalk.`,
      ogType: "profile",
    });
  }, [traveler]);

  const copyProfileLink = async () => {
    if (!traveler) return;
    const url = `${window.location.origin}/travelers/${encodeURIComponent(traveler.handle)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy profile link:", err);
      toast.error("Couldn't copy the link. You can copy it from the address bar.");
    }
  };

  const trips = traveler?.trips ?? [];
  // The list is already newest-first; reduce keeps this correct regardless.
  const lastSharedAt = trips.reduce<string | null>((latest, trip) => {
    const publishedAt = trip.publishedAt;
    if (!publishedAt) return latest;
    if (!latest) return publishedAt;
    return new Date(publishedAt) > new Date(latest) ? publishedAt : latest;
  }, null);
  const lastSharedLabel = monthYear(lastSharedAt);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto max-w-6xl px-4 pb-20 pt-24 space-y-6">
        <TravellerBreadcrumbs
          items={[{ label: handle ? `@${handle}` : "Traveler" }]}
        />
        {loading ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="space-y-1 text-center">
              <h3 className="font-display text-lg font-semibold text-foreground">
                Opening this traveler's page…
              </h3>
              <p className="text-xs text-muted-foreground">
                Gathering their shared trips
              </p>
            </div>
          </div>
        ) : error || !traveler ? (
          <div className="mx-auto my-12 max-w-lg space-y-6 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Traveler not found
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {error ||
                  "That handle doesn't seem to belong to anyone — it may be mistyped, or no longer public."}
              </p>
            </div>
            <Button asChild variant="hero" className="h-11 gap-2 rounded-2xl px-6 text-xs font-bold">
              <Link to="/">
                <Sparkles className="h-4 w-4" />
                Back to waytowalk
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Identity — soft sky wash from theme tokens, no faux destination photo */}
            <section className="relative rounded-3xl border border-border/60 bg-card shadow-card">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_8%_-10%,hsl(var(--primary)/0.26),transparent_58%),radial-gradient(90%_110%_at_96%_0%,hsl(var(--primary)/0.18),transparent_55%)]" />
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/50 to-transparent" />
              </div>

              <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
                <Avatar className="relative z-10 h-24 w-24 shrink-0 shadow-soft ring-4 ring-card sm:h-28 sm:w-28 lg:-ml-10 lg:h-32 lg:w-32">
                  {traveler.avatarUrl && (
                    <AvatarImage src={avatarSrc(traveler.avatarUrl)} alt={traveler.name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
                    {initialsFor(traveler.name || traveler.handle)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-2">
                  <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                    {traveler.name}
                  </h1>
                  <p className="text-sm font-medium text-muted-foreground">
                    @{traveler.handle}
                  </p>
                  {traveler.bio && (
                    <p
                      className="line-clamp-2 max-w-xl text-sm leading-relaxed text-foreground/80"
                      title={traveler.bio}
                    >
                      {traveler.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="leading-tight">
                        <p className="text-base font-semibold text-foreground">
                          {trips.length}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {trips.length === 1 ? "trip shared" : "trips shared"}
                        </p>
                      </div>
                    </div>

                    {lastSharedLabel && (
                      <>
                        <span
                          className="hidden h-8 w-px bg-border/70 sm:block"
                          aria-hidden="true"
                        />
                        <div className="flex items-center gap-2">
                          <CalendarDays
                            className="h-4 w-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <div className="leading-tight">
                            <p className="text-[11px] text-muted-foreground">
                              Last shared
                            </p>
                            <p className="text-base font-semibold text-foreground">
                              {lastSharedLabel}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <button
                      type="button"
                      onClick={copyProfileLink}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                      {linkCopied ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span aria-live="polite">
                        {linkCopied ? "Profile link copied" : "Copy profile link"}
                      </span>
                    </button>

                    {!isOwnProfile && (
                      <>
                        <span
                          className="h-3.5 w-px bg-border/70"
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={handleReportClick}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                          Report profile
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Published trips */}
            <section className="space-y-5" aria-labelledby="traveler-trips-heading">
              <header className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2
                    id="traveler-trips-heading"
                    className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
                  >
                    Trips they've shared
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Published by {traveler.name} — dates shown as month when hidden.
                  </p>
                </div>
              </header>

              {trips.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Compass className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="mt-4 font-display text-xl font-semibold text-foreground">
                    Nothing shared yet
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    When {traveler.name.split(" ")[0]} shares a trip, it'll show
                    up here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {trips.map((trip) => (
                    <article
                      key={trip._id}
                      className="group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
                    >
                      <Link
                        to={`/explore/${trip._id}`}
                        className="flex h-full flex-col"
                        aria-label={`Open ${trip.title}`}
                      >
                        <TripCover
                          destination={trip.destination}
                          title={trip.title}
                          width={600}
                        />

                        <div className="flex flex-1 flex-col gap-2 p-4">
                          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {trip.destination || "Somewhere new"}
                          </p>
                          <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                            {trip.title}
                          </h3>
                          {trip.summary && (
                            <p
                              className="line-clamp-1 text-xs leading-relaxed text-muted-foreground"
                              title={trip.summary}
                            >
                              {trip.summary}
                            </p>
                          )}

                          <div className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{dateLine(trip.dates)}</span>
                          </div>

                          {trip.tags[0] && (
                            <div className="pt-1">
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                                <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{trip.tags[0]}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="flex flex-col items-start justify-between gap-3 rounded-3xl border border-primary/15 bg-primary/5 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-display text-lg font-semibold text-foreground">
                  Planning something similar?
                </p>
                <p className="text-xs text-muted-foreground">
                  Build your own day-by-day plan with waytowalk.
                </p>
              </div>
              <Button asChild variant="hero" size="sm" className="h-9 gap-1.5 rounded-xl text-xs font-bold">
                <Link to="/plan">
                  Plan a trip
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>

      {traveler && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="profile"
          targetId={traveler.handle}
          targetLabel={`@${traveler.handle}`}
        />
      )}
    </div>
  );
};

export default TravelerProfile;
