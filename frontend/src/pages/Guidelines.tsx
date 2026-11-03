import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { applyPageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarDays,
  Compass,
  Flag,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";

/**
 * Public community guidelines (Milestone 8 G6).
 *
 * Deliberately plain-language and concrete: the gallery shows itineraries and a
 * public traveler identity, not a social feed. The page explains what is
 * allowed, what gets removed, and how reporting and blocking work.
 */

const GOOD = [
  "Itineraries you actually planned or travelled, with useful day-by-day detail.",
  "Honest summaries and tags that help someone decide whether the trip fits.",
  "Photos and profile details that belong to you or that you have permission to share.",
  "Respectful notes in join requests. Say who you are and why you want to come.",
  "Corrections when a place has changed — update the trip instead of leaving stale advice.",
];

const BAD = [
  "Spam, copied itineraries presented as your own, or advertising disguised as a trip.",
  "Harassment, threats, hate speech, or targeting a traveller in requests or comments.",
  "Scams: off-platform payment requests, deposits, or anything that asks a stranger for money.",
  "Private information about someone else — home addresses, phone numbers, workplace details.",
  "Content that is illegal, sexual, or unsafe to publish to a general audience.",
];

const SECTIONS = [
  { id: "what-belongs-here", label: "What belongs here" },
  { id: "protect-your-dates", label: "Protect your dates" },
  { id: "never-send-money", label: "Never send money" },
  { id: "keep-control", label: "Keep control" },
  { id: "what-we-remove", label: "What we remove" },
  { id: "reporting", label: "Reporting" },
  { id: "when-we-act", label: "When we act" },
] as const;

const BODY = "text-sm leading-relaxed text-muted-foreground";

const GuidelineList = ({
  items,
  marker = "primary",
}: {
  items: string[];
  marker?: "primary" | "destructive";
}) => (
  <ul className="space-y-2.5">
    {items.map((item) => (
      <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn(
            "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
            marker === "primary" ? "bg-primary" : "bg-destructive"
          )}
        />
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ul>
);

const SectionCard = ({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-heading`}
    className="scroll-mt-28 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-8"
  >
    <div className="flex gap-4 sm:gap-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-14 sm:w-14">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <h2
          id={`${id}-heading`}
          className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  </section>
);

const Guidelines = () => {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    applyPageMeta({
      title: "Community guidelines · TravelAI",
      description:
        "What belongs in the TravelAI public gallery, how reporting works, and how we keep travellers safe.",
      ogType: "website",
    });
  }, []);

  // Highlight the section currently being read. Anchors keep working without
  // this; it is only the "where am I" cue for the sticky list.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => Boolean(element)
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="relative flex-1 pb-20 pt-24">
        {/* Quiet air at the top of the page; clipped so it never widens the viewport. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden">
          <div className="absolute -top-32 right-4 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -top-16 left-1/4 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container relative mx-auto max-w-6xl px-4">
          <header className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Community
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Travel well, together.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              A few things that keep shared trips safe and worth joining.
            </p>
          </header>

          {/* Small screens get a swipeable version of the same anchor list. */}
          <nav aria-label="On this page" className="mt-8 lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              On this page
            </p>
            <div className="no-scrollbar -mx-4 mt-2 overflow-x-auto px-4 pb-1">
              <ul className="flex w-max items-center gap-2">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      aria-current={activeId === section.id ? "location" : undefined}
                      className={cn(
                        "inline-flex min-h-[32px] items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        activeId === section.id
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/80 bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="mt-6 grid gap-8 lg:mt-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
            <aside className="hidden lg:block">
              <nav aria-label="On this page" className="sticky top-24">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  On this page
                </p>
                <ul className="mt-3 space-y-0.5 border-l border-border/70">
                  {SECTIONS.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        aria-current={activeId === section.id ? "location" : undefined}
                        className={cn(
                          "-ml-px block border-l-2 py-1.5 pl-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          activeId === section.id
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {section.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <div className="min-w-0 space-y-4">
              <SectionCard id="what-belongs-here" icon={Compass} title="What belongs here">
                <p className={BODY}>
                  The gallery is a place to share real itineraries and meet
                  travellers through owner-approved join requests. It is not a
                  social feed, a marketplace, or a way to contact strangers
                  directly.
                </p>
                <p className={BODY}>In practice, that means:</p>
                <GuidelineList items={GOOD} />
              </SectionCard>

              <SectionCard id="protect-your-dates" icon={CalendarDays} title="Protect your dates">
                <p className={BODY}>
                  Publishing a trip can expose when you will be away. Use “Hide
                  exact dates” to show only a month and duration.
                </p>
                <p className={BODY}>
                  Keep home addresses, phone numbers and workplace details out of
                  itineraries and join requests. Share the dates and places you
                  are comfortable making public — nothing more.
                </p>
              </SectionCard>

              <SectionCard id="never-send-money" icon={Wallet} title="Never send money">
                <p className={BODY}>
                  A join request is not a booking. No owner should ask you for a
                  deposit, and TravelAI never handles payments between travellers.
                </p>
                <p className={BODY}>
                  A request to send money, gift cards or bank details off the
                  platform is a red flag, however convincing the profile looks.
                </p>
                <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold leading-relaxed text-foreground">
                      TravelAI has no in-app payments between travellers.
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">
                      No deposit is ever part of joining a trip. If someone asks
                      you to pay outside the app, stop the conversation and report
                      it.
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard id="keep-control" icon={ShieldCheck} title="Keep control of your trip">
                <p className={BODY}>
                  Owners approve every join request. Approval grants a commenter
                  seat only — never edit access. Use the block list if someone
                  makes you uncomfortable.
                </p>
                <p className={BODY}>You decide how much to share, and when to commit:</p>
                <GuidelineList
                  items={[
                    "Choose who you travel with and what you share with them.",
                    "Take your time — there is no pressure to commit to a request or a reply.",
                    "Trust your instincts. If something does not feel right, step back and report it.",
                  ]}
                />
              </SectionCard>

              <SectionCard id="what-we-remove" icon={Ban} title="What we remove">
                <p className={BODY}>
                  These are the things that get a trip or a profile removed from
                  the gallery:
                </p>
                <GuidelineList items={BAD} marker="destructive" />
              </SectionCard>

              <SectionCard id="reporting" icon={Flag} title="Reporting and review">
                <p className={BODY}>
                  Any signed-in traveller can report a published trip or a public
                  profile. Choose a reason and add a short note if it helps. The
                  person you report is never told who reported them.
                </p>
                <p className={BODY}>
                  A trip with three distinct open reports is hidden from the
                  gallery automatically while a platform admin reviews it. The
                  owner still has their data and sees a banner on the trip; an
                  admin can restore the listing if the reports are unfounded, or
                  de-list it permanently.
                </p>
                <p className={BODY}>
                  Reports are capped per account and one report per person per
                  target is accepted, so reporting cannot be used to bury content
                  you simply disagree with.
                </p>
              </SectionCard>

              <SectionCard
                id="when-we-act"
                icon={AlertTriangle}
                title="When we may act on an account"
              >
                <p className={BODY}>
                  Repeated violations can lead to content removal, loss of
                  publishing access, or account suspension. Imminent threats or
                  illegal content may be reported to the relevant authorities.
                  Decisions are recorded in the platform audit trail.
                </p>
              </SectionCard>

              <section
                aria-labelledby="something-feels-off-heading"
                className="mt-8 rounded-3xl border border-accent/25 bg-accent/5 p-5 sm:p-7"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                      <Flag className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h2
                        id="something-feels-off-heading"
                        className="font-display text-xl font-semibold tracking-tight text-foreground"
                      >
                        Something feels off?
                      </h2>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        If you see behaviour that looks unsafe, suspicious or
                        against these guidelines, report it from the trip or
                        profile page. Reporting is private.
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-10 shrink-0 gap-1.5 self-start rounded-full border-primary/40 px-5 text-xs font-bold text-primary hover:bg-primary/5 sm:self-auto"
                  >
                    <Link to="/explore">
                      Browse the gallery
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </section>

              <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                <span>Last updated November 2026</span>
                <span aria-hidden="true">·</span>
                <span>
                  Reports are private — the person you report is never told who
                  reported them.
                </span>
              </footer>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Guidelines;
