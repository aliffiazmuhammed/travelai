import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { applyPageMeta } from "@/lib/meta";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  Flag,
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

const Guidelines = () => {
  useEffect(() => {
    applyPageMeta({
      title: "Community guidelines · TravelAI",
      description:
        "What belongs in the TravelAI public gallery, how reporting works, and how we keep travellers safe.",
      ogType: "website",
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-4xl space-y-6">
        <TravellerBreadcrumbs items={[{ label: "Guidelines" }]} />

        <header className="rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card p-6 sm:p-10 space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
            <ShieldCheck className="w-3 h-3" />
            Public gallery
          </span>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Community guidelines
          </h1>
          <p className="text-sm text-foreground/80 leading-relaxed max-w-2xl">
            The gallery is a place to share real itineraries and meet travellers
            through owner-approved join requests. It is not a social feed, a
            marketplace, or a way to contact strangers directly.
          </p>
        </header>

        <section className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            What belongs here
          </h2>
          <ul className="space-y-2.5">
            {GOOD.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-destructive/25 bg-destructive/5 p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <Ban className="w-5 h-5 text-destructive" />
            What we remove
          </h2>
          <ul className="space-y-2.5">
            {BAD.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-3xl border border-border/70 bg-card p-5 space-y-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Protect your dates</h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Publishing a trip can expose when you will be away. Use “Hide exact
              dates” to show only a month and duration.
            </p>
          </section>
          <section className="rounded-3xl border border-border/70 bg-card p-5 space-y-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Never send money</h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A join request is not a booking. No owner should ask you for a
              deposit, and TravelAI never handles payments between travellers.
            </p>
          </section>
          <section className="rounded-3xl border border-border/70 bg-card p-5 space-y-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Keep control</h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Owners approve every join request. Approval grants a commenter seat
              only — never edit access. Use the block list if someone makes you
              uncomfortable.
            </p>
          </section>
        </div>

        <section className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <Flag className="w-5 h-5 text-amber-600" />
            Reporting and review
          </h2>
          <div className="space-y-3 text-xs leading-relaxed text-foreground/85">
            <p>
              Any signed-in traveller can report a published trip or a public
              profile. Choose a reason and add a short note if it helps. The
              person you report is never told who reported them.
            </p>
            <p>
              A trip with <strong>three distinct open reports</strong> is hidden
              from the gallery automatically while a platform admin reviews it.
              The owner still has their data and sees a banner on the trip; an
              admin can restore the listing if the reports are unfounded, or
              de-list it permanently.
            </p>
            <p>
              Reports are capped per account and one report per person per target
              is accepted, so reporting cannot be used to bury content you simply
              disagree with.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <AlertTriangle className="w-5 h-5 text-primary" />
            When we may act on an account
          </h2>
          <p className="text-xs leading-relaxed text-foreground/85">
            Repeated violations can lead to content removal, loss of publishing
            access, or account suspension. Imminent threats or illegal content
            may be reported to the relevant authorities. Decisions are recorded in
            the platform audit trail.
          </p>
        </section>

        <div className="rounded-3xl bg-primary/5 border border-primary/15 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Something in the gallery looks wrong? Report it from the trip or
            profile page.
          </p>
          <Button asChild variant="hero" size="sm" className="rounded-xl text-xs font-bold gap-1.5 h-9">
            <Link to="/explore">
              Browse the gallery
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Guidelines;
