import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarRange,
  Check,
  Compass,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface HeroProps {
  tripCount: number;
  eventCount: number;
  discovering: boolean;
  /** Without a directory there is somewhere real to send the empty-event door. */
  directoryEnabled: boolean;
}

interface Door {
  to: string;
  icon: LucideIcon;
  kicker: string;
  headline: string;
  note: string;
  cta: string;
}

/**
 * The homepage's first screen. Three doors instead of one pitch: trips to join
 * and events come first, and AI planning is the door you take when nothing
 * fits. Counts are live, and each door degrades to an invitation when its
 * shelf is empty.
 */
const Hero = ({
  tripCount,
  eventCount,
  discovering,
  directoryEnabled,
}: HeroProps) => {
  const tripsDoor: Door = discovering
    ? {
        to: "/explore",
        icon: Compass,
        kicker: "Find a trip",
        headline: "Looking for what's on…",
        note: "Checking the trips and events people shared.",
        cta: "Browse anyway",
      }
    : tripCount === 0
    ? {
        to: "/plan",
        icon: Compass,
        kicker: "Find a trip",
        headline: "Nobody has shared one yet",
        note: "Plan something and publish it — yours could be the first trip someone else joins.",
        cta: "Start the first trip",
      }
    : tripCount < 5
    ? {
        to: "/explore",
        icon: Compass,
        kicker: "Find a trip",
        headline: `${tripCount} ${tripCount === 1 ? "trip" : "trips"} to look at`,
        note: "The gallery is just warming up. Read one, ask the owner to come along, or take a copy.",
        cta: "See the trips",
      }
    : {
        to: "/explore",
        icon: Compass,
        kicker: "Find a trip",
        headline: `${tripCount} trips to join`,
        note: "Real trips, shared by the people who planned them. Ask the owner and join the plan.",
        cta: "Browse the trips",
      };

  const eventsDoor: Door = discovering
    ? {
        to: "/explore",
        icon: CalendarRange,
        kicker: "Find an event",
        headline: "Checking the calendar…",
        note: "Looking for camps, retreats and group departures.",
        cta: "Browse anyway",
      }
    : eventCount === 0
    ? {
        to: directoryEnabled ? "/agencies" : "/explore",
        icon: CalendarRange,
        kicker: "Find an event",
        headline: "No events on the calendar",
        note: directoryEnabled
          ? "Agencies post camps and retreats here. Browse the directory in the meantime."
          : "When an agency posts a camp or retreat, it shows up here. Trips are open in the meantime.",
        cta: directoryEnabled ? "Meet the agencies" : "Browse trips instead",
      }
    : {
        to: "/explore#events",
        icon: CalendarRange,
        kicker: "Find an event",
        headline: `${eventCount} ${eventCount === 1 ? "event" : "events"} open`,
        note: "Camps, retreats and group departures you can ask about — no plan of your own needed.",
        cta: "See what's on",
      };

  const planDoor: Door = {
    to: "/plan",
    icon: Sparkles,
    kicker: "Or start from scratch",
    headline: "Plan it with AI",
    note: "Tell us where and who. Get a day-by-day plan with a map and costs in one message.",
    cta: "Plan a trip",
  };

  const doors = [tripsDoor, eventsDoor, planDoor];

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-background"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(ellipse_60%_60%_at_15%_0%,hsl(var(--primary)/0.20),transparent_70%),radial-gradient(ellipse_50%_50%_at_85%_5%,hsl(var(--accent)/0.16),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(hsl(var(--foreground)/0.07)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_65%)]"
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/70 px-4 py-2 text-[11px] font-semibold text-primary shadow-xs backdrop-blur">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Trips, events and the people going
          </span>

          <h1 className="mt-7 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Find your people.
            <span className="block bg-gradient-to-r from-primary via-sky-500 to-accent bg-clip-text text-transparent">
              Then plan the trip.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
            Browse trips other travellers already shared, join a camp or retreat,
            or hand a blank page to AI. Wherever you start, the plan, the map and
            the group chat end up in one place.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:mt-14 sm:grid-cols-3">
          {doors.map((door) => (
            <Link
              key={door.kicker}
              to={door.to}
              className="group flex flex-col rounded-3xl border border-border/70 bg-card/85 p-6 text-left shadow-card backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <door.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-[11px] font-semibold tracking-wide text-primary">
                {door.kicker}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
                {door.headline}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {door.note}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                {door.cta}
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>

        <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-muted-foreground">
          {["Free to start", "No card needed", "You choose who comes"].map(
            (item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {item}
              </li>
            )
          )}
        </ul>
      </div>
    </section>
  );
};

export default Hero;
