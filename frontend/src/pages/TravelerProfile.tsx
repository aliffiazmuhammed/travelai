import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/gallery/ReportDialog";
import { api } from "@/services/api";
import { useAuth } from "@/context/UserContext";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { applyPageMeta } from "@/lib/meta";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Compass,
  Flag,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { GalleryDates, GalleryTravelerProfile } from "@/types/gallery";

/**
 * Public traveler page (Milestone 8 G2). Everything rendered here arrives from
 * `GET /api/travelers/:handle`, whose allow-list never carries the email, the
 * member list or any money field. Hidden-date trips only expose a month label.
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

const TravelerProfile = () => {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [traveler, setTraveler] = useState<GalleryTravelerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
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
      title: `${traveler.name} (@${traveler.handle}) · TravelAI`,
      description:
        traveler.bio || `Trips shared by @${traveler.handle} on TravelAI.`,
      ogType: "profile",
    });
  }, [traveler]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-5xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[420px] space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Opening this traveler's page…
              </h3>
              <p className="text-xs text-muted-foreground">
                Gathering their shared trips
              </p>
            </div>
          </div>
        ) : error || !traveler ? (
          <div className="p-8 sm:p-12 text-center rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card max-w-lg mx-auto my-12 space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">Traveler not found</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error ||
                  "That handle doesn't seem to belong to anyone — it may be mistyped, or no longer public."}
              </p>
            </div>
            <Button asChild variant="hero" className="rounded-2xl h-11 px-6 text-xs font-bold gap-2">
              <Link to="/">
                <Sparkles className="w-4 h-4" />
                Back to TravelAI
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Identity */}
            <section className="rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <Avatar className="h-20 w-20 ring-2 ring-primary/20 shrink-0">
                  {traveler.avatarUrl && (
                    <AvatarImage src={avatarSrc(traveler.avatarUrl)} alt={traveler.name} />
                  )}
                  <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                    {initialsFor(traveler.name || traveler.handle)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
                    <Globe className="w-3 h-3" />
                    Traveler profile
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">
                    {traveler.name}
                  </h1>
                  <p className="text-sm font-semibold text-muted-foreground">
                    @{traveler.handle}
                  </p>
                  {traveler.bio && (
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-2xl">
                      {traveler.bio}
                    </p>
                  )}
                </div>

                <div className="sm:ml-auto shrink-0 text-left sm:text-right space-y-2">
                  <div>
                    <p className="text-2xl font-black text-foreground">
                      {traveler.trips.length}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      shared {traveler.trips.length === 1 ? "trip" : "trips"}
                    </p>
                  </div>
                  {!isOwnProfile && (
                    <button
                      type="button"
                      onClick={handleReportClick}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Flag className="w-3 h-3" />
                      Report profile
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Published trips */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-lg sm:text-xl font-black text-foreground">
                    Trips {traveler.name.split(" ")[0]} is sharing
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Every trip they've chosen to share, past and upcoming.
                  </p>
                </div>
              </div>

              {traveler.trips.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Compass className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    Nothing shared yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When {traveler.name.split(" ")[0]} shares a trip, it'll show
                    up here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {traveler.trips.map((trip) => (
                    <article
                      key={trip._id}
                      className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs transition-shadow hover:shadow-md"
                    >
                      <Link
                        to={`/explore/${trip._id}`}
                        className="block space-y-3 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-primary truncate">
                              {trip.destination}
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
                            {dateLine(trip.dates)}
                          </span>
                          {trip.season && <span>{trip.season}</span>}
                          {trip.groupType && <span>{trip.groupType}</span>}
                        </div>

                        {trip.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {trip.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary group-hover:gap-1.5 transition-all">
                          See the trip
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="rounded-3xl bg-primary/5 border border-primary/15 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Planning something similar?
                </p>
                <p className="text-xs text-muted-foreground">
                  Build your own day-by-day plan with TravelAI.
                </p>
              </div>
              <Button asChild variant="hero" size="sm" className="rounded-xl text-xs font-bold gap-1.5 h-9">
                <Link to="/plan">
                  Plan a trip
                  <ArrowRight className="w-3.5 h-3.5" />
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
