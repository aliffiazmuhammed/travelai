import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LandingChat from "@/components/LandingChat";
import { PublicEventCard } from "@/components/events/PublicEventCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/context/UserContext";
import { useLandingDiscovery } from "@/hooks/useLandingDiscovery";
import { useAgencyDirectoryEnabled } from "@/hooks/useAgencyDirectoryEnabled";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { formatGalleryDates } from "@/lib/galleryFormat";
import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarDays,
  CalendarRange,
  Compass,
  Globe2,
  Lock,
  Map,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GalleryTripSummary } from "@/types/gallery";
import heroImage from "@/assets/hero-travel.jpg";

/**
 * The homepage now leads with people: trips to join and events first, AI
 * planning as the door you take when nothing fits. Discovery strips are live
 * and disappear when their shelf is empty, so the page never sells a room it
 * cannot fill.
 */

const steps: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Compass,
    title: "Find a trip or an event",
    body: "Browse trips other travellers shared, or camps and retreats agencies are running. When one fits, say so in a short note.",
  },
  {
    icon: UserPlus,
    title: "Get a yes from the owner",
    body: "They decide who comes. A yes gives you a commenter seat: follow the plan, ask questions, join the trip chat.",
  },
  {
    icon: MessageCircle,
    title: "Plan the details together",
    body: "Take a copy and change anything you like, or start fresh with AI. Map, costs and chat come along.",
  },
];

const tools: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Map,
    title: "The whole day on a map",
    body: "Every stop in order, with the distance between them.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Money without the maths",
    body: "Planned vs. actual spend, and who owes whom at the end.",
  },
  {
    icon: Share2,
    title: "Out of the app when needed",
    body: "A clean PDF, a WhatsApp summary, or a link anyone can open.",
  },
  {
    icon: SlidersHorizontal,
    title: "Change it as you go",
    body: "Swap a stay, add a day, ask for a rainy-day alternative.",
  },
];

const trustRows: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Your chats stay private",
    body: "Messages are end-to-end encrypted, meaning only people on your trip can read them.",
  },
  {
    icon: ShieldCheck,
    title: "You control who comes",
    body: "Only the owner approves join requests. Approval never hands over edit rights.",
  },
  {
    icon: CalendarDays,
    title: "You control what's public",
    body: "A trip is private until you publish it, and budgets, expenses and chat are never part of it.",
  },
];

const faqs: { question: string; answer: string }[] = [
  {
    question: "Is it free to join a trip?",
    answer:
      "Yes. Browsing and joining don't cost anything. If you ask an agency for a proposal, the agency sets its own price and you accept or decline it in the thread — TravelAI never takes payments between travellers.",
  },
  {
    question: "Who can see my trip?",
    answer:
      "Only the people you invite, until you choose to publish it. A published trip shows your title, summary, destination, dates (or just the month if you hide them), tags and plan. Budgets, expenses and chat stay private.",
  },
  {
    question: "What happens when I ask to join?",
    answer:
      "The owner gets your note and decides. If they say yes, you can follow the plan, ask questions and join the chat as a commenter. Editing stays with the owner, so nobody can rewrite their trip from under them.",
  },
  {
    question: "Can I take a copy of a shared trip?",
    answer:
      "Yes. Take a copy and it becomes one of your trips, ready to change however you like. The original stays exactly as its owner left it.",
  },
  {
    question: "What if no trip fits?",
    answer:
      "Plan one with AI from a single message, or ask an agency through the directory. Either way you end up with the same plan, map, costs and group chat.",
  },
  {
    question: "How do agency events work?",
    answer:
      "Camps, retreats and group departures appear on Explore as events. Ask about a spot and the agency answers you directly; when you're ready, you can ask for a full proposal.",
  },
];

const SectionHeading = ({
  eyebrow,
  icon: Icon,
  title,
  description,
  className,
}: {
  eyebrow: string;
  icon: LucideIcon;
  title: React.ReactNode;
  description?: string;
  className?: string;
}) => (
  <div className={className ?? "mx-auto max-w-2xl space-y-3 text-center"}>
    <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {eyebrow}
    </p>
    <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
      {title}
    </h2>
    {description ? (
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
        {description}
      </p>
    ) : null}
  </div>
);

const LiveTripCard = ({ trip }: { trip: GalleryTripSummary }) => (
  <Link
    to={`/explore/${trip._id}`}
    className="group flex flex-col rounded-3xl border border-border/70 bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
  >
    <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{trip.destination || "Somewhere new"}</span>
    </p>
    <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
      {trip.title}
    </h3>
    {trip.summary ? (
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {trip.summary}
      </p>
    ) : null}
    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4 text-[11px]">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <CalendarDays className="h-3 w-3" aria-hidden="true" />
        {formatGalleryDates(trip.dates)}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Avatar className="h-5 w-5 shrink-0">
          {trip.publisher.avatarUrl && (
            <AvatarImage
              src={avatarSrc(trip.publisher.avatarUrl)}
              alt={trip.publisher.name}
            />
          )}
          <AvatarFallback className="bg-primary/10 text-[8px] font-bold text-primary">
            {initialsFor(trip.publisher.name || trip.publisher.handle)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate font-semibold text-muted-foreground">
          {trip.publisher.name}
        </span>
      </span>
    </div>
  </Link>
);

const Landing = () => {
  const discovery = useLandingDiscovery();
  const { isAuthenticated } = useAuth();
  const directoryEnabled = useAgencyDirectoryEnabled();
  const hasAnything = discovery.trips.length > 0 || discovery.events.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero
        tripCount={discovery.tripTotal}
        eventCount={discovery.eventTotal}
        discovering={discovery.loading}
        directoryEnabled={directoryEnabled === true}
      />

      {/* Live discovery */}
      <section className="px-4 pb-16 sm:pb-24" aria-labelledby="live-now">
        <div className="container mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Live right now"
            icon={Globe2}
            title={
              <span id="live-now">
                What people are up to
                <span className="block text-primary">right now</span>
              </span>
            }
            description="Trips shared by other travellers and events with spots open. No sign-up needed to look."
          />

          {discovery.loading ? (
            <p className="text-center text-xs font-medium text-muted-foreground">
              Checking the trips and events people shared…
            </p>
          ) : hasAnything ? (
            <div className="space-y-10">
              {discovery.trips.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="space-y-0.5">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
                        Trips to join
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {discovery.tripTotal} shared{" "}
                        {discovery.tripTotal === 1 ? "trip" : "trips"} so far
                      </p>
                    </div>
                    <Link
                      to="/explore"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5"
                    >
                      See every trip
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {discovery.trips.map((trip) => (
                      <LiveTripCard key={trip._id} trip={trip} />
                    ))}
                  </div>
                </div>
              )}

              {discovery.events.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="space-y-0.5">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
                        On the calendar
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Camps, retreats and group departures
                      </p>
                    </div>
                    <Link
                      to="/explore#events"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-all hover:gap-1.5"
                    >
                      See every event
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {discovery.events.map((event) => (
                      <PublicEventCard key={event._id} event={event} showAgency />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-border/80 bg-card/60 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarRange className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold tracking-tight text-foreground">
                The shelves are empty for now
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing has been shared yet. Plan something and publish it — or
                check back when travellers and agencies start posting.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button asChild variant="hero" size="sm" className="rounded-xl text-xs font-bold">
                  <Link to="/plan">
                    <Sparkles className="h-3.5 w-3.5" />
                    Plan the first trip
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold">
                  <Link to="/agencies">Browse agencies</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* How it goes */}
      <section
        className="border-y border-border/60 bg-muted/30 px-4 py-16 sm:py-24"
        aria-labelledby="how-it-works"
      >
        <div className="container mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="How it usually goes"
            icon={Users}
            title={
              <span id="how-it-works">
                A trip, from someone's idea
                <span className="block text-primary">to everyone's plan</span>
              </span>
            }
            description="Three steps. The owner keeps the final say, and you never have to build a plan from nothing."
          />

          <ol className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide text-primary">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-3 right-4 select-none font-display text-7xl font-semibold text-primary/5"
                >
                  {index + 1}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The AI door */}
      <section className="px-4 py-16 sm:py-24" aria-labelledby="plan-with-ai">
        <div className="container mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="space-y-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              When nothing fits
            </p>
            <h2
              id="plan-with-ai"
              className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              A blank page,
              <span className="block text-primary">answered in one message</span>
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Say where you're going, who's coming and what you like. TravelAI
              writes a day-by-day plan with places, timings and costs — then
              stays in your trip chat for the questions that come later.
            </p>
            <ul className="space-y-2.5">
              {[
                "One message to a day-by-day plan",
                "Change any day yourself, no starting over",
                "The map, the costs and the chat in the same place",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-foreground/85"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="hero" className="rounded-2xl font-bold">
                <Link to="/plan">
                  Plan with AI
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl font-semibold">
                <Link to="/explore">See what others planned</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card p-3 shadow-card sm:p-4">
            <LandingChat />
          </div>
        </div>
      </section>

      {/* Group tools, bento */}
      <section
        className="border-y border-border/60 bg-muted/30 px-4 py-16 sm:py-24"
        aria-labelledby="group-tools"
      >
        <div className="container mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Then the boring parts are handled"
            icon={SlidersHorizontal}
            title={
              <span id="group-tools">
                Everything the group needs,
                <span className="block text-primary">minus the confusion</span>
              </span>
            }
            description="If something feels like admin, it happens quietly. If it feels like deciding, you do it together."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-card sm:col-span-2 sm:p-8">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-foreground/15">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">
                Decide it together
              </h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-primary-foreground/85">
                Vote in chat on hotels, days or dinner spots. The option everyone
                agreed on gets pinned, so nobody has to scroll back for it.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold">
                {["Votes in chat", "Pinned decisions", "@TravelAI answers"].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="rounded-full bg-primary-foreground/15 px-3 py-1"
                    >
                      {chip}
                    </span>
                  )
                )}
              </div>
            </div>

            {tools.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs transition-colors hover:border-primary/30"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="px-4 py-16 sm:py-24" aria-labelledby="privacy">
        <div className="container mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              In plain words
            </p>
            <h2
              id="privacy"
              className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Your trip stays yours
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Joining someone else's trip doesn't hand over your own. And
              publishing one doesn't expose the parts you kept to yourself.
            </p>
            <Link
              to="/guidelines"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-all hover:gap-1.5"
            >
              Read the community guidelines
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ul className="grid gap-3">
            {trustRows.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-xs"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section
        className="border-y border-border/60 bg-muted/30 px-4 py-16 sm:py-24"
        aria-labelledby="faq"
      >
        <div className="container mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Before you ask
            </p>
            <h2
              id="faq"
              className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Questions people actually have
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Still unsure about something? The community guidelines cover what
              belongs in the gallery and how reporting works.
            </p>
          </div>

          <Accordion type="single" collapsible className="rounded-3xl border border-border/70 bg-card px-6 shadow-xs">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question} className="border-border/60 last:border-0">
                <AccordionTrigger className="py-5 text-left text-sm font-semibold text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-4 py-16 sm:py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="relative isolate overflow-hidden rounded-3xl bg-primary text-center shadow-2xl">
            <img
              src={heroImage}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-primary/80" />
            <div className="px-6 py-14 sm:px-14 sm:py-20">
              <h2 className="mx-auto max-w-2xl font-display text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                Your next trip could start
                <span className="block text-sky-100">with someone else's plan</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm font-medium leading-relaxed text-sky-100 sm:text-base">
                Take a look at what's already going. If nothing fits, plan it
                yourself — it still only takes one message.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="xl"
                  className="rounded-2xl bg-white font-bold text-sky-950 shadow-xl hover:bg-white/90"
                >
                  <Link to="/explore">
                    Browse trips
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="rounded-2xl border-white/40 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white"
                >
                  <Link to="/plan">Plan with AI</Link>
                </Button>
              </div>
              <p className="mt-5 text-[11px] font-medium text-sky-100/80">
                Free to start · No card needed · You choose who comes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70 px-4 py-14">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div className="space-y-3">
              <p className="font-display text-lg font-semibold tracking-tight text-foreground">
                TravelAI
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                Find a trip worth joining, meet the people going, and keep the
                plan, the map and the chat in one place.
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold tracking-wide text-foreground">
                Discover
              </p>
              {[
                { label: "Explore trips", to: "/explore" },
                { label: "Events", to: "/explore#events" },
                { label: "Agencies", to: "/agencies" },
                { label: "Community guidelines", to: "/guidelines" },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold tracking-wide text-foreground">
                Plan
              </p>
              {[
                { label: "Plan a trip", to: "/plan" },
                isAuthenticated
                  ? { label: "My trips", to: "/dashboard" }
                  : { label: "Create an account", to: "/auth" },
                isAuthenticated
                  ? { label: "Enquiries", to: "/enquiries" }
                  : { label: "Sign in", to: "/auth" },
              ].map((link) => (
                <Link
                  key={link.to + link.label}
                  to={link.to}
                  className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold tracking-wide text-foreground">
                For agencies
              </p>
              {[
                { label: "Agency sign in", to: "/agency/login" },
                { label: "Directory profiles", to: "/agencies" },
              ].map((link) => (
                <Link
                  key={link.to + link.label}
                  to={link.to}
                  className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 TravelAI. Built with care for travellers.</p>
            <p className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Shared on purpose, private by default.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
