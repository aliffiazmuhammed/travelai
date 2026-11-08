import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LandingChat from "@/components/LandingChat";
import { PublicEventCard } from "@/components/events/PublicEventCard";
import { TripCover } from "@/components/gallery/TripCover";
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
import type { GalleryTripSummary } from "@/types/gallery";
import groupCamp from "@/assets/landing-group-camp.jpg";
import agencyTeam from "@/assets/landing-agency-team.jpg";
import soloTraveller from "@/assets/landing-solo-traveller.jpg";

const CONTAINER = "container mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8";

const steps = [
  {
    title: "Find your starting point",
    body: "Browse a traveller's shared trip or an agency event. When one feels right, send a short note to the host.",
  },
  {
    title: "Get the yes, then talk",
    body: "Follow the plan, ask questions and join the private trip chat. Approval never hands over editing rights.",
  },
  {
    title: "Make the route yours",
    body: "Take a copy and adapt any day, or start fresh. The map, costs and group decisions stay together.",
  },
];

const tools = [
  {
    title: "A map everyone can read",
    body: "Every stop in order, realistic distances and weather where it matters.",
  },
  {
    title: "Money without the maths",
    body: "Planned versus actual spend, shared expenses and who owes whom.",
  },
  {
    title: "Decisions without scrolling",
    body: "Vote in chat and pin the final choice so the group stays in step.",
  },
  {
    title: "Share it beyond the app",
    body: "A clean PDF, a WhatsApp summary or a link anyone can open.",
  },
];

const trustRows = [
  {
    title: "Private conversations",
    body: "Trip messages are end-to-end encrypted. Only people on your trip can read them.",
  },
  {
    title: "You control who comes",
    body: "Only the owner approves requests. Approval never gives away edit rights.",
  },
  {
    title: "You control what's public",
    body: "Budgets, expenses and private chat never become part of a published trip.",
  },
];

const faqs = [
  {
    question: "Is it free to join a trip?",
    answer:
      "Yes. Browsing and joining don't cost anything. An agency sets its own price for a proposal; waytowalk never takes payments between travellers.",
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

const Eyebrow = ({ children, light = false }: { children: React.ReactNode; light?: boolean }) => (
  <p
    className={`mb-5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
      light ? "text-[#F7F3EA]/70" : "text-primary"
    }`}
  >
    <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
    {children}
  </p>
);

const TextLink = ({ to, children, light = false }: { to: string; children: React.ReactNode; light?: boolean }) => (
  <Link
    to={to}
    className={`inline-flex items-center gap-2 text-[13px] font-bold transition-all hover:gap-3 ${
      light ? "text-[#F7F3EA]/75 hover:text-[#F7F3EA]" : "text-primary"
    }`}
  >
    {children}
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  </Link>
);

const LiveTripCard = ({ trip }: { trip: GalleryTripSummary }) => (
  <Link
    to={`/explore/${trip._id}`}
    className="group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/60 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
  >
    <div className="relative h-[230px] overflow-hidden">
      <TripCover
        destination={trip.destination}
        title={trip.title}
        width={640}
        className="h-full w-full rounded-none border-0"
      />
      {trip.durationDays > 0 && (
        <span className="absolute right-4 top-4 rounded-full bg-[#F7F3EA]/95 px-3 py-2 text-[10px] font-bold text-[#173F35]">
          {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}
        </span>
      )}
    </div>
    <div className="flex flex-1 flex-col p-5 sm:p-6">
      <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{trip.destination || "Somewhere new"}</span>
      </p>
      <h3 className="font-display text-[27px] font-medium leading-[1.08] tracking-[-0.02em] text-foreground transition-colors group-hover:text-primary">
        {trip.title}
      </h3>
      <p className="mb-5 mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {trip.summary || "A shared route, ready to explore and make your own."}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-4 text-[10px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2 font-bold text-foreground">
          <Avatar className="h-7 w-7 shrink-0">
            {trip.publisher.avatarUrl && (
              <AvatarImage src={avatarSrc(trip.publisher.avatarUrl)} alt={trip.publisher.name} />
            )}
            <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
              {initialsFor(trip.publisher.name || trip.publisher.handle)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{trip.publisher.name}</span>
        </span>
        <span className="shrink-0 text-right">
          {formatGalleryDates(trip.dates)}
          {trip.groupType ? ` · ${trip.groupType}` : ""}
        </span>
      </div>
    </div>
  </Link>
);

const TripSkeleton = () => (
  <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/60">
    <div className="h-[230px] animate-pulse bg-muted" />
    <div className="space-y-4 p-6">
      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-8 w-4/5 animate-pulse rounded bg-muted" />
      <div className="h-10 animate-pulse rounded bg-muted" />
      <div className="h-8 animate-pulse rounded bg-muted" />
    </div>
  </div>
);

const Landing = () => {
  const discovery = useLandingDiscovery();
  const { isAuthenticated } = useAuth();
  const directoryEnabled = useAgencyDirectoryEnabled();
  const location = useLocation();

  const eventCta = discovery.loading
    ? { to: "/explore#events", label: "Explore events" }
    : discovery.eventTotal > 0
    ? { to: "/explore#events", label: "Explore events" }
    : directoryEnabled
    ? { to: "/agencies", label: "Meet the agencies" }
    : { to: "/explore", label: "Browse trips instead" };

  useEffect(() => {
    if (location.hash !== "#how-it-works") return;
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Navbar />
      <Hero
        tripCount={discovery.tripTotal}
        eventCount={discovery.eventTotal}
        discovering={discovery.loading}
        directoryEnabled={directoryEnabled === true}
      />

      <main>
        <section id="trips" className="scroll-mt-20 py-20 sm:py-24 lg:py-28" aria-labelledby="fresh-title">
          <div className={CONTAINER}>
            <div className="mb-10 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end lg:gap-10">
              <div>
                <Eyebrow>Live discovery</Eyebrow>
                <h2 id="fresh-title" className="mb-3 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[50px]">
                  Fresh from the trail.
                </h2>
                <p className="max-w-[570px] text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  Real plans from people you can actually talk to. Read the route, meet the host, then ask to join or take a copy.
                </p>
              </div>
              <TextLink to={!discovery.loading && discovery.tripTotal === 0 ? "/plan" : "/explore"}>
                {discovery.loading
                  ? "Explore all trips"
                  : discovery.tripTotal > 0
                  ? `See all ${discovery.tripTotal} ${discovery.tripTotal === 1 ? "trip" : "trips"}`
                  : "Start the first trip"}
              </TextLink>
            </div>

            {discovery.loading ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((item) => <TripSkeleton key={item} />)}
              </div>
            ) : discovery.trips.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {discovery.trips.slice(0, 3).map((trip) => (
                  <LiveTripCard key={trip._id} trip={trip} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
                <h3 className="font-display text-2xl font-medium text-foreground">The trail is wide open.</h3>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
                  No shared trips are here yet. Start one, publish it when you're ready, and give someone else a real journey to join.
                </p>
                <Button asChild variant="hero" className="mt-6 rounded-full px-6 font-bold">
                  <Link to="/plan">Start the first trip <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        <section id="events" className="scroll-mt-20 pb-20 sm:pb-24 lg:pb-28" aria-labelledby="events-title">
          <div className={CONTAINER}>
            <div className="grid overflow-hidden rounded-[28px] bg-muted/50 md:grid-cols-[1.08fr_0.92fr]">
              <img
                src={groupCamp}
                alt="A group gathered around a mountain campfire"
                className="h-[280px] w-full object-cover sm:h-[330px] md:h-full md:min-h-[430px]"
              />
              <div className="flex flex-col items-start justify-center p-7 sm:p-10 lg:p-[55px]">
                <Eyebrow>On the calendar</Eyebrow>
                <h2 id="events-title" className="mb-5 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-[45px]">
                  Some journeys already have a date.
                </h2>
                <p className="mb-7 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  Discover agency-led camps, retreats and group departures. Ask about a place without building a trip of your own first.
                </p>
                <Button asChild variant="hero" size="lg" className="w-full rounded-full px-6 text-[13px] font-bold sm:w-auto">
                  <Link to={eventCta.to}>{eventCta.label} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            </div>

            {discovery.events.length > 0 && (
              <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {discovery.events.slice(0, 3).map((event) => (
                  <PublicEventCard key={event._id} event={event} showAgency />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y border-border/70 py-20 sm:py-24 lg:py-28" aria-labelledby="how-title">
          <div className={CONTAINER}>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start lg:gap-10">
              <div>
                <Eyebrow>How it works</Eyebrow>
                <h2 id="how-title" className="font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[50px]">
                  Someone's idea.<br />Your way forward.
                </h2>
              </div>
              <p className="max-w-[370px] text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8 md:mt-9">
                The owner keeps the final say. You get a real starting point and a clear way to take part.
              </p>
            </div>
            <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-12 lg:gap-[70px]">
              <span className="absolute left-[9%] right-[9%] top-7 hidden h-px bg-secondary md:block" aria-hidden="true" />
              {steps.map((step, index) => (
                <li key={step.title} className="relative pl-[75px] md:pl-0 md:pt-[82px]">
                  <span className="absolute left-0 top-0 z-10 flex h-14 w-14 items-center justify-center rounded-full border border-secondary bg-background font-display text-[22px] font-medium text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mb-3 font-display text-[27px] font-medium leading-[1.1] text-foreground sm:text-[29px]">{step.title}</h3>
                  <p className="text-[13px] leading-7 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="agencies" className="scroll-mt-20 py-20 sm:py-24 lg:py-28" aria-labelledby="agencies-title">
          <div className={CONTAINER}>
            <div className="grid overflow-hidden rounded-[30px] bg-[#173F35] md:grid-cols-[1.08fr_0.92fr]">
              <img
                src={agencyTeam}
                alt="A travel agency team working together"
                className="h-[280px] w-full object-cover sm:h-[330px] md:h-full md:min-h-[530px]"
              />
              <div className="flex flex-col items-start justify-center p-7 text-[#F7F3EA]/80 sm:p-10 lg:p-[58px]">
                <Eyebrow light>Travel agencies</Eyebrow>
                <h2 id="agencies-title" className="mb-5 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-[#F7F3EA] sm:text-[47px]">
                  Prefer a professional to shape it?
                </h2>
                <p className="text-sm leading-7 sm:text-[15px] sm:leading-8">
                  Find an agency, ask a question, and receive a branded proposal you can review with your group.
                </p>
                <ul className="my-7 grid gap-3 text-xs text-[#F7F3EA]">
                  {["Compare detailed directory profiles", "Talk directly before you decide", "Review quotes and proposals in one place"].map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="w-full rounded-full bg-[#F7F3EA] px-6 text-[13px] font-bold text-[#173F35] hover:bg-[#F7F3EA]/90 sm:w-auto">
                  <Link to="/agencies">Meet travel agencies <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <div className="mt-5">
                  <TextLink to="/agencies/apply" light>For agencies: apply to join</TextLink>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="scroll-mt-20 bg-muted/50 py-20 sm:py-24 lg:py-28" aria-labelledby="ai-title">
          <div className={`${CONTAINER} grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-[70px] xl:gap-[90px]`}>
            <div>
              <Eyebrow>When nothing fits</Eyebrow>
              <h2 id="ai-title" className="mb-5 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[48px]">
                Start with a blank page. Leave with a plan.
              </h2>
              <p className="mb-6 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                Say where you're going, who's coming and what you like. AI creates the first route; you and your group shape what happens next.
              </p>
              <ul className="mb-7 grid gap-3 text-xs font-semibold text-primary">
                {["A day-by-day route from one message", "Maps, timings and estimated costs together", "Change anything without starting over"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="hero" size="lg" className="rounded-full px-6 text-[13px] font-bold">
                  <Link to="/plan">Plan with AI <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full border-primary/30 bg-transparent px-6 text-[13px] font-bold text-primary hover:bg-primary/5">
                  <Link to="/explore">See what others planned</Link>
                </Button>
              </div>
            </div>
            <LandingChat />
          </div>
        </section>

        <section className="bg-[#102D26] py-20 text-[#F7F3EA]/75 sm:py-24 lg:py-28" aria-labelledby="tools-title">
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-[70px] xl:gap-[90px]`}>
            <div>
              <Eyebrow light>One shared plan</Eyebrow>
              <h2 id="tools-title" className="mb-5 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-[#F7F3EA] sm:text-5xl lg:text-[52px]">
                The admin stays out of the adventure.
              </h2>
              <p className="max-w-[400px] text-sm leading-7 sm:text-[15px] sm:leading-8">
                When something feels like deciding, do it together. When it feels like admin, waytowalk keeps it quietly organised.
              </p>
            </div>
            <div className="grid border-l border-t border-[#F7F3EA]/20 sm:grid-cols-2">
              {tools.map((tool, index) => (
                <article key={tool.title} className="min-h-[200px] border-b border-r border-[#F7F3EA]/20 p-7 sm:min-h-[220px] sm:p-[30px]">
                  <span className="mb-8 block font-display text-lg font-medium text-accent sm:mb-10">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mb-3 font-display text-[26px] font-medium leading-[1.1] text-[#F7F3EA]">{tool.title}</h3>
                  <p className="text-xs leading-6">{tool.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24 lg:py-28" aria-labelledby="trust-title">
          <div className={CONTAINER}>
            <div className="mb-12 grid items-end gap-5 md:grid-cols-2 lg:gap-[60px]">
              <div>
                <Eyebrow>In plain words</Eyebrow>
                <h2 id="trust-title" className="font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[50px]">Your trip stays yours.</h2>
              </div>
              <p className="max-w-[480px] text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                Publishing a route doesn't expose the parts you kept private. Joining someone else's trip doesn't hand over your own.
              </p>
            </div>
            <div className="grid border-t border-border/70 md:grid-cols-3">
              {trustRows.map((row, index) => (
                <article key={row.title} className="border-b border-border/70 py-8 md:border-b-0 md:px-8 md:py-8 md:pr-8 md:first:pl-0 md:[&:not(:first-child)]:border-l lg:px-10 lg:first:pl-0">
                  <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 font-display text-[17px] font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mb-3 font-display text-[27px] font-medium text-foreground">{row.title}</h3>
                  <p className="text-xs leading-6 text-muted-foreground">{row.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/50 py-20 sm:py-24 lg:py-28" aria-labelledby="faq-title">
          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-[70px] xl:gap-[100px]`}>
            <div>
              <Eyebrow>Before you ask</Eyebrow>
              <h2 id="faq-title" className="mb-5 font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-foreground sm:text-[46px]">Good questions, straight answers.</h2>
              <p className="mb-5 max-w-[340px] text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                The essentials about joining, publishing and planning with other people.
              </p>
              <TextLink to="/guidelines">Read the community guidelines</TextLink>
            </div>
            <Accordion type="single" collapsible defaultValue={faqs[0].question} className="border-t border-border">
              {faqs.map((faq) => (
                <AccordionItem key={faq.question} value={faq.question} className="border-border">
                  <AccordionTrigger className="py-6 text-left text-[13px] font-bold text-primary hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-[620px] pb-6 pr-8 text-xs leading-6 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="py-20 sm:py-24 lg:py-28">
          <div className={CONTAINER}>
            <div className="relative flex min-h-[430px] items-center overflow-hidden rounded-[30px] bg-[#173F35]">
              <div className="relative z-10 w-full p-7 sm:p-12 md:w-[70%] lg:p-[60px]">
                <Eyebrow light>Real journeys. Your way.</Eyebrow>
                <h2 className="mb-5 max-w-[660px] font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] text-[#F7F3EA] sm:text-5xl lg:text-[52px]">
                  Your next trip could start with someone else's plan.
                </h2>
                <p className="mb-7 max-w-[550px] text-sm leading-7 text-[#F7F3EA]/75">
                  Take a look at what's already going. If nothing fits, plan it yourself—it still only takes one message.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="rounded-full bg-[#F7F3EA] px-6 text-[13px] font-bold text-[#173F35] hover:bg-[#F7F3EA]/90">
                    <Link to="/explore">Browse trips <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full border-white/40 bg-transparent px-6 text-[13px] font-bold text-white hover:bg-white/10 hover:text-white">
                    <Link to="/plan">Plan with AI</Link>
                  </Button>
                </div>
                <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold text-[#F7F3EA]/60">
                  {["Free to start", "No card needed"].map((item) => (
                    <li key={item} className="inline-flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-secondary" aria-hidden="true" />{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="absolute inset-y-0 right-0 hidden w-[36%] md:block">
                <img src={soloTraveller} alt="A traveller walking beside a desert stream" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#173F35] via-[#173F35]/20 to-transparent" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 pb-7 pt-16">
        <div className={CONTAINER}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:gap-x-12 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-[55px]">
            <div className="col-span-2 lg:col-span-1">
              <Link to="/" aria-label="waytowalk home" className="mb-5 inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <img src="/brand/waytowalk-logo-name.svg" alt="waytowalk" width="164" height="34" className="h-[34px] w-[164px] dark:hidden" />
                <img src="/brand/waytowalk-logo-reverse.svg" alt="waytowalk" width="164" height="34" className="hidden h-[34px] w-[164px] dark:block" />
              </Link>
              <p className="font-display text-[23px] font-medium text-primary">Real journeys. Your way.</p>
              <p className="mt-4 max-w-[320px] text-[11px] leading-6 text-muted-foreground">
                Find a trip worth joining, meet the people going, and keep the plan, map and chat in one place.
              </p>
            </div>
            <div>
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Discover</h3>
              {[
                { label: "Explore trips", to: "/explore" },
                { label: "Events", to: "/explore#events" },
                { label: "Agencies", to: "/agencies" },
                { label: "Community guidelines", to: "/guidelines" },
              ].map((link) => (
                <Link key={link.to} to={link.to} className="mb-3 block text-[11px] text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link>
              ))}
            </div>
            <div>
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Plan</h3>
              {[
                { label: "Plan a trip", to: "/plan" },
                isAuthenticated ? { label: "My trips", to: "/dashboard" } : { label: "Create an account", to: "/auth" },
                isAuthenticated ? { label: "Enquiries", to: "/enquiries" } : { label: "Sign in", to: "/auth" },
              ].map((link) => (
                <Link key={link.to + link.label} to={link.to} className="mb-3 block text-[11px] text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link>
              ))}
            </div>
            <div>
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">For agencies</h3>
              {[
                { label: "Agency sign in", to: "/agency/login" },
                { label: "Apply to join", to: "/agencies/apply" },
                { label: "Directory profiles", to: "/agencies" },
              ].map((link) => (
                <Link key={link.to + link.label} to={link.to} className="mb-3 block text-[11px] text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link>
              ))}
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 waytowalk. Built with care for travellers.</p>
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
