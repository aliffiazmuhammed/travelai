import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import AgencyEnquiryDialog from "@/components/directory/AgencyEnquiryDialog";
import AgencyPackageDialog from "@/components/directory/AgencyPackageDialog";
import { AgencyLogoTile } from "@/components/directory/AgencyLogoTile";
import { ReportDialog } from "@/components/gallery/ReportDialog";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/services/api";
import { formatMoney } from "@/lib/currency";
import { spotsLabel } from "@/lib/events";
import { applyPageMeta } from "@/lib/meta";
import { tripCoverUrl } from "@/lib/tripCover";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Compass,
  ExternalLink,
  Flag,
  Globe2,
  Languages,
  Loader2,
  Mail,
  MapPin,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AgencyDirectoryPackage, AgencyDirectoryPublicProfile } from "@/types/agency";
import type { PublicEventSummary } from "@/types/events";

/**
 * Public agency page (Milestone 9 D3).
 *
 * Anonymous: the payload is the directory projection, and publishing readiness
 * guarantees the fields the page expects (about, city, destination, service,
 * logo). Photography is derived from the agency's own location text through
 * `tripCoverUrl`, so the hero never claims a place the profile does not name.
 *
 * D5 adds the two traveller actions: the enquiry form (profile-level, or scoped
 * to one package card) and the report link that feeds the manual moderation
 * queue. Neither action hides the page: M9 never auto-hides an agency profile.
 *
 * M10 E1 adds the agency's upcoming events, read through the public events
 * listing scoped by this slug, so a dated camp is one click from its own page.
 */

const nightsLabel = (nights: number): string =>
  nights <= 0 ? "Day trip" : `${nights} ${nights === 1 ? "night" : "nights"}`;

/** Calendar days are stored as UTC dates; read them in UTC so a tile never shifts. */
const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  timeZone: "UTC",
});
const weekdayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  timeZone: "UTC",
});

const eventDateTile = (startDate: string) => {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    month: monthFormatter.format(date).toUpperCase(),
    day: dayFormatter.format(date),
    weekday: weekdayFormatter.format(date).toUpperCase(),
  };
};

const SectionHeading = ({
  id,
  title,
  action,
}: {
  id: string;
  title: string;
  action?: { label: string; to: string };
}) => (
  <div className="flex flex-wrap items-end justify-between gap-2">
    <h2
      id={id}
      className="font-display text-2xl font-semibold tracking-tight text-foreground"
    >
      {title}
    </h2>
    {action ? (
      <Link
        to={action.to}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5"
      >
        {action.label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    ) : null}
  </div>
);

const PackageCard = ({
  pkg,
  destinations,
  coverText,
  onOpen,
}: {
  pkg: AgencyDirectoryPackage;
  destinations: string[];
  coverText: string;
  onOpen: () => void;
}) => {
  const title = pkg.title.trim() || "Trip package";
  const fallbackCover = tripCoverUrl(coverText, 800);
  const cover = pkg.coverUrl || fallbackCover;
  const chips = destinations.slice(0, 2);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="block aspect-[16/10] w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
        aria-label={`See the itinerary for ${title}`}
      >
        <img
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackCover;
          }}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </h3>
        <p className="text-xs font-medium text-muted-foreground">
          {nightsLabel(pkg.nights)}
        </p>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((destination) => (
              <span
                key={destination}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-semibold text-muted-foreground"
              >
                <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{destination}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="text-[11px] font-semibold text-foreground">
            {pkg.pricePerPerson === null
              ? "Price on request"
              : `From ${formatMoney(pkg.pricePerPerson, pkg.currency)} per person`}
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            See itinerary
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
};

const EventCard = ({ event }: { event: PublicEventSummary }) => {
  const tile = eventDateTile(event.dates.startDate);
  const place = [event.destination, event.venue].filter(Boolean).join(" · ");
  const spots = spotsLabel(event.spotsLeft);

  return (
    <Link
      to={`/explore/events/${event._id}`}
      className="group flex items-start gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      <div className="grid w-14 shrink-0 place-items-center gap-0.5 rounded-xl border border-border/70 bg-muted/50 px-2 py-2 text-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {tile?.month ?? ""}
        </span>
        <span className="font-display text-xl font-semibold leading-none text-foreground">
          {tile?.day ?? "—"}
        </span>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {tile?.weekday ?? ""}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
          {event.title}
        </h3>
        {place && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{place}</span>
          </p>
        )}
        {spots && (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
              event.spotsLeft !== null && event.spotsLeft > 0
                ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {spots}
          </span>
        )}
      </div>
    </Link>
  );
};

const RailFact = ({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) => (
  <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-muted/40 text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
    </div>
  </li>
);

const AgencyProfile = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AgencyDirectoryPublicProfile | null>(null);
  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryPackage, setEnquiryPackage] = useState<AgencyDirectoryPackage | null>(null);
  const [planPackage, setPlanPackage] = useState<AgencyDirectoryPackage | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const data = await api.getPublicAgencyProfile(slug);
        if (!cancelled) setProfile(data.profile);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the public agency profile:", err);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiError && err.message
              ? err.message
              : "This agency page could not be loaded right now."
          );
        }
        setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  // M10 E1: this agency's upcoming events, through the public listing scoped by
  // slug. A failed read hides the section instead of breaking the profile.
  useEffect(() => {
    if (!slug) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    api
      .getPublicEvents({ agency: slug, limit: 6 })
      .then((page) => {
        if (!cancelled) setEvents(page.events);
      })
      .catch((err) => {
        console.error("Failed to load this agency's events:", err);
        if (!cancelled) setEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Coming back from `/auth` after "Sign in to enquire": reopen the form, and
  // keep the package when the traveller started from a package card.
  useEffect(() => {
    if (!profile) return;
    const pending = (
      location.state as {
        openEnquiry?: { packageId?: string | null };
      } | null
    )?.openEnquiry;
    if (!pending) return;
    const pkg = pending.packageId
      ? profile.packages.find((entry) => entry.id === pending.packageId) ?? null
      : null;
    setEnquiryPackage(pkg);
    setEnquiryOpen(true);
    navigate(location.pathname, { replace: true });
  }, [location.state, location.pathname, navigate, profile]);

  // Meta tags wait for the real name, so a share preview never says "Loading".
  useEffect(() => {
    if (loading) return;

    if (profile) {
      return applyPageMeta({
        title: `${profile.name} · Travel agency · waytowalk`,
        description:
          profile.about.trim().slice(0, 160) ||
          `${profile.name} plans trips from ${profile.baseCity || "India"}.`,
        ogType: "profile",
      });
    }

    if (notFound) {
      return applyPageMeta({
        title: "Agency not found · waytowalk",
        description:
          "This agency page is not available. It may have been unpublished, or the agency may no longer be listed.",
        ogType: "website",
      });
    }
  }, [loading, profile, notFound]);

  const openProfileEnquiry = () => {
    setEnquiryPackage(null);
    setEnquiryOpen(true);
  };

  const locationText = profile
    ? [profile.baseCity, ...profile.destinations].filter(Boolean).join(" ")
    : "";
  const heroImage = profile ? tripCoverUrl(locationText, 1600) : undefined;

  const websiteHref = profile?.website
    ? /^https?:\/\//i.test(profile.website)
      ? profile.website
      : `https://${profile.website}`
    : null;
  const phoneHref = profile?.contactPhone
    ? `tel:${profile.contactPhone.replace(/\s+/g, "")}`
    : null;
  const contactHref = phoneHref ?? websiteHref;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 space-y-6 px-4 pb-20 pt-24">
        <TravellerBreadcrumbs
          items={[
            { label: "Agencies", to: "/agencies" },
            ...(profile ? [{ label: profile.name }] : []),
          ]}
        />

        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center space-y-4">
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Opening this agency…</p>
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-bold text-foreground">
                This agency page isn't available
              </h1>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                It may have been unpublished, or the agency may no longer be
                listed. Other agencies are still worth a look.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold">
              <Link to="/agencies">Browse agencies</Link>
            </Button>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                We couldn't open this agency page
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
        ) : profile ? (
          <>
            <section
              aria-label={`${profile.name} profile`}
              className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
            >
              <div className="relative h-44 w-full sm:h-60 lg:h-72">
                {heroImage && (
                  <img
                    src={heroImage}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-slate-900/45 via-slate-900/10 to-transparent dark:from-black/60"
                />
              </div>

              <div className="px-5 pb-6 sm:px-8 sm:pb-8">
                <div className="relative -mt-12 flex flex-col gap-5 sm:-mt-14 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex min-w-0 items-end gap-4 sm:gap-5">
                    <AgencyLogoTile
                      name={profile.name}
                      logoUrl={profile.logoUrl}
                      className="h-24 w-24 rounded-2xl border border-border/70 bg-card text-3xl shadow-sm sm:h-28 sm:w-28"
                      imgClassName="p-3"
                    />
                    <div className="min-w-0 pb-1">
                      <h1 className="flex min-w-0 items-center gap-2 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                        <span className="truncate">{profile.name}</span>
                        {profile.verified && (
                          <BadgeCheck
                            className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6"
                            aria-label="Verified agency"
                          />
                        )}
                      </h1>
                      {profile.baseCity.trim() && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
                          <MapPin
                            className="h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <span className="truncate">{profile.baseCity}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
                    <Button
                      type="button"
                      size="lg"
                      variant="hero"
                      className="h-11 gap-2 rounded-xl px-5 text-xs font-bold"
                      onClick={openProfileEnquiry}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      Ask for a proposal
                    </Button>

                    {contactHref ? (
                      <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="h-11 gap-2 rounded-xl border-primary/30 px-5 text-xs font-bold text-primary hover:bg-primary/5"
                      >
                        <a
                          href={contactHref}
                          target={contactHref.startsWith("tel:") ? undefined : "_blank"}
                          rel="noreferrer noopener"
                        >
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          Contact agency
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-11 gap-2 rounded-xl border-primary/30 px-5 text-xs font-bold text-primary hover:bg-primary/5"
                        onClick={openProfileEnquiry}
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        Contact agency
                      </Button>
                    )}
                  </div>
                </div>

                {profile.about.trim() && (
                  <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-foreground/80 sm:text-[15px]">
                    {profile.about.trim()}
                  </p>
                )}

                {profile.specialties.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {profile.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full bg-muted/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-10">
                {profile.packages.length > 0 ? (
                  <section
                    aria-labelledby="agency-packages-heading"
                    className="space-y-4"
                  >
                    <SectionHeading
                      id="agency-packages-heading"
                      title="Trips this agency plans"
                    />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {profile.packages.map((pkg) => (
                        <PackageCard
                          key={pkg.id}
                          pkg={pkg}
                          destinations={profile.destinations}
                          coverText={locationText}
                          onOpen={() => setPlanPackage(pkg)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {profile.packages.length === 0 && events.length === 0 ? (
                  <div className="space-y-4 rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Compass className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-semibold text-foreground">
                        No published trips just yet
                      </h2>
                      <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {profile.name} hasn't shared a package here yet. Tell them
                        what you have in mind and they'll plan from there.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 rounded-xl text-xs font-bold"
                      onClick={openProfileEnquiry}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      Ask for a proposal
                    </Button>
                  </div>
                ) : null}
              </div>

              <aside className="space-y-3 lg:sticky lg:top-24">
                {(profile.languages.length > 0 ||
                  profile.services.length > 0 ||
                  Boolean(websiteHref)) && (
                  <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                      Good to know
                    </h2>
                    <ul className="mt-4 divide-y divide-border/60">
                      {profile.languages.length > 0 && (
                        <RailFact icon={Languages} label="Languages">
                          {profile.languages.map((language) => language.label).join(", ")}
                        </RailFact>
                      )}
                      {profile.services.length > 0 && (
                        <RailFact icon={Users} label="Services">
                          {profile.services.map((service) => service.label).join(", ")}
                        </RailFact>
                      )}
                      {websiteHref && (
                        <RailFact icon={Globe2} label="Website">
                          <a
                            href={websiteHref}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-start gap-1 break-all font-medium text-primary hover:underline"
                          >
                            {profile.website}
                            <ExternalLink
                              className="mt-0.5 h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                          </a>
                        </RailFact>
                      )}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="inline-flex items-center gap-1.5 px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  Report this profile
                </button>
              </aside>
            </div>

            {events.length > 0 ? (
              <section
                aria-labelledby="agency-events-heading"
                className="space-y-4"
              >
                <SectionHeading
                  id="agency-events-heading"
                  title="Coming up"
                  action={{ label: "View all events", to: "/explore#events" }}
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {events.map((event) => (
                    <EventCard key={event._id} event={event} />
                  ))}
                </div>
              </section>
            ) : null}

            {slug ? (
              <>
                <AgencyPackageDialog
                  open={planPackage !== null}
                  onClose={() => setPlanPackage(null)}
                  slug={slug}
                  pkg={planPackage}
                  onEnquire={(pkg) => {
                    setPlanPackage(null);
                    setEnquiryPackage(pkg);
                    setEnquiryOpen(true);
                  }}
                />
                <AgencyEnquiryDialog
                  open={enquiryOpen}
                  onClose={() => setEnquiryOpen(false)}
                  slug={slug}
                  agencyName={profile.name}
                  packageId={enquiryPackage?.id}
                  packageTitle={enquiryPackage?.title}
                />
                <ReportDialog
                  open={reportOpen}
                  onClose={() => setReportOpen(false)}
                  targetType="agency_profile"
                  targetId={slug}
                  targetLabel={`${profile.name} · Travel agency`}
                />
              </>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
};

export default AgencyProfile;
