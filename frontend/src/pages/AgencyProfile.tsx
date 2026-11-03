import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import AgencyEnquiryDialog from "@/components/directory/AgencyEnquiryDialog";
import AgencyPackageCard from "@/components/directory/AgencyPackageCard";
import AgencyPackageDialog from "@/components/directory/AgencyPackageDialog";
import {
  DirectoryProfileFacts,
  DirectoryProfileHero,
} from "@/components/directory/DirectoryProfilePreview";
import type { DirectoryProfilePreviewModel } from "@/components/directory/DirectoryProfilePreview";
import { PublicEventCard } from "@/components/events/PublicEventCard";
import { ReportDialog } from "@/components/gallery/ReportDialog";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/services/api";
import { applyPageMeta } from "@/lib/meta";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Compass,
  Flag,
  Loader2,
  MessageCircle,
} from "lucide-react";
import type { AgencyDirectoryPackage, AgencyDirectoryPublicProfile } from "@/types/agency";
import type { PublicEventSummary } from "@/types/events";

/**
 * Public agency page (Milestone 9 D3).
 *
 * Anonymous: the payload is the directory projection, and publishing readiness
 * guarantees the fields the preview expects (about, city, destination, service,
 * logo). The hero and facts blocks are the same components the agency sees in
 * its settings preview, so the two can never drift.
 *
 * D5 adds the two traveller actions: the enquiry form (profile-level, or scoped
 * to one package card) and the report link that feeds the manual moderation
 * queue. Neither action hides the page: M9 never auto-hides an agency profile.
 *
 * M10 E1 adds the agency's upcoming events, read through the public events
 * listing scoped by this slug, so a dated camp is one click from its own page.
 */
const toProfileModel = (
  profile: AgencyDirectoryPublicProfile
): DirectoryProfilePreviewModel => ({
  name: profile.name,
  about: profile.about,
  baseCity: profile.baseCity,
  destinations: profile.destinations,
  specialties: profile.specialties,
  services: profile.services,
  languages: profile.languages,
  logoUrl: profile.logoUrl,
  website: profile.website,
  contactPhone: profile.contactPhone,
  gstin: profile.gstin,
  verified: profile.verified,
  replyTimeHours: profile.replyTimeHours,
});

const SectionHeader = ({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="space-y-1.5">
    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
      {eyebrow}
    </p>
    <h2
      id={id}
      className="font-display text-2xl font-black tracking-tight text-foreground"
    >
      {title}
    </h2>
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
      {description}
    </p>
  </div>
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
        title: `${profile.name} · Travel agency · TravelAI`,
        description:
          profile.about.trim().slice(0, 160) ||
          `${profile.name} plans trips from ${profile.baseCity || "India"}.`,
        ogType: "profile",
      });
    }

    if (notFound) {
      return applyPageMeta({
        title: "Agency not found · TravelAI",
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

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto max-w-6xl px-4 pt-24 pb-20 space-y-6">
        <TravellerBreadcrumbs
          items={[
            { label: "Agencies", to: "/agencies" },
            ...(profile ? [{ label: profile.name }] : []),
          ]}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[320px] space-y-4">
            <Loader2 className="w-9 h-9 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Opening this agency…</p>
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-bold text-foreground">
                This agency page isn't available
              </h1>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                It may have been unpublished, or the agency may no longer be
                listed. Other agencies are still worth a look.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold">
              <Link to="/agencies">Browse agencies</Link>
            </Button>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
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
            <DirectoryProfileHero
              headingAs="h1"
              ariaLabel={`${profile.name} profile`}
              profile={toProfileModel(profile)}
              actions={
                <>
                  <Button
                    type="button"
                    size="lg"
                    variant="hero"
                    className="rounded-xl text-sm font-bold gap-2"
                    onClick={openProfileEnquiry}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enquire about a trip
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="ghost"
                    className="rounded-xl text-sm font-bold gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setReportOpen(true)}
                  >
                    <Flag className="h-4 w-4" />
                    Report
                  </Button>
                </>
              }
            />

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-10">
                {profile.packages.length > 0 ? (
                  <section
                    aria-labelledby="agency-packages-heading"
                    className="space-y-4"
                  >
                    <SectionHeader
                      id="agency-packages-heading"
                      eyebrow="Trip packages"
                      title="Trips this agency plans"
                      description="A few of the trips they run. Open one for the day-by-day plan, or ask about the one you like."
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      {profile.packages.map((pkg) => (
                        <AgencyPackageCard
                          key={pkg.id}
                          package={{
                            title: pkg.title,
                            summary: pkg.summary,
                            nights: pkg.nights,
                            pricePerPerson: pkg.pricePerPerson,
                            currency: pkg.currency,
                            coverUrl: pkg.coverUrl,
                            highlights: pkg.highlights,
                            inclusions: pkg.inclusions,
                          }}
                          onOpen={() => setPlanPackage(pkg)}
                          onEnquire={() => {
                            setEnquiryPackage(pkg);
                            setEnquiryOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {events.length > 0 ? (
                  <section
                    aria-labelledby="agency-events-heading"
                    className="space-y-4"
                  >
                    <SectionHeader
                      id="agency-events-heading"
                      eyebrow="Dated departures"
                      title="Coming up"
                      description="Camps, retreats and group trips with a fixed date — open the one you like and ask about a spot."
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      {events.map((event) => (
                        <PublicEventCard key={event._id} event={event} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {profile.packages.length === 0 && events.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 p-10 text-center space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Compass className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-black text-foreground">
                        No published trips just yet
                      </h2>
                      <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {profile.name} hasn't shared a package here yet. Tell
                        them what you have in mind and they'll plan from there.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl text-xs font-bold gap-1.5"
                      onClick={openProfileEnquiry}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Start a conversation
                    </Button>
                  </div>
                ) : null}

                <div className="flex justify-center border-t border-border/60 pt-8">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Link to="/agencies">
                      Browse more agencies
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>

              <aside className="lg:sticky lg:top-24">
                <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs">
                  <DirectoryProfileFacts
                    profile={toProfileModel(profile)}
                    showEmptyHints={false}
                  />
                </div>
              </aside>
            </div>

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
