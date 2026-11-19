import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/ui/app-image";
import heroGroupHike from "@/assets/hero-group-hike.jpg";

export interface HeroProps {
  tripCount: number;
  eventCount: number;
  discovering: boolean;
  directoryEnabled: boolean;
}

const Hero = ({
  tripCount,
  eventCount,
  discovering,
  directoryEnabled,
}: HeroProps) => {
  const discoveryItems = [
    {
      label: "Trips to join",
      shortLabel: "Trips",
      meta: discovering
        ? "Finding shared trips…"
        : tripCount > 0
        ? `${tripCount} ${tripCount === 1 ? "trip" : "trips"} shared`
        : "Start the first trip",
      shortMeta: discovering
        ? "Finding…"
        : tripCount > 0
        ? `${tripCount} ${tripCount === 1 ? "trip" : "trips"}`
        : "Start one",
      to: !discovering && tripCount === 0 ? "/plan" : "/explore",
    },
    {
      label: "Events",
      shortLabel: "Events",
      meta: discovering
        ? "Checking the calendar…"
        : eventCount > 0
        ? `${eventCount} ${eventCount === 1 ? "event" : "events"} open`
        : directoryEnabled
        ? "Meet the agencies"
        : "Browse trips instead",
      shortMeta: discovering
        ? "Checking…"
        : eventCount > 0
        ? `${eventCount} ${eventCount === 1 ? "event" : "events"}`
        : directoryEnabled
        ? "Agencies"
        : "Browse",
      to:
        eventCount > 0
          ? "/explore#events"
          : directoryEnabled
          ? "/agencies"
          : "/explore",
    },
    // Same content gate as the navbar: the directory appears only once it has
    // enough published profiles to be worth a first visit.
    ...(directoryEnabled
      ? [
          {
            label: "Agencies",
            shortLabel: "Agencies",
            meta: "Professional trip planning",
            shortMeta: "Directory",
            to: "/agencies",
          },
        ]
      : []),
  ];
  const heroColumns = {
    "--hero-cols": discoveryItems.length,
  } as CSSProperties;

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32">
      <div className="container relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="relative z-10 max-w-[900px]">
          <p className="mb-5 flex items-center gap-2.5 text-overline font-bold text-primary">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            Real trips. Real people.
          </p>
          <h1 className="font-display text-6xl font-medium leading-[0.95] tracking-[-0.045em] text-foreground sm:text-7xl">
            Find a journey.
            <span className="block">Walk it your way.</span>
          </h1>
          <p className="mb-7 mt-7 max-w-[650px] text-base leading-8 text-muted-foreground">
            Join a trip, find your people, or shape a route of your own. Keep the
            map, costs and conversations together from first idea to final day.
          </p>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              variant="hero"
              size="lg"
              className="w-full rounded-full px-6 text-sm font-bold sm:w-auto"
            >
              <Link to="/explore">
                Explore real trips
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-full border-primary/30 bg-transparent px-6 text-sm font-bold text-primary hover:bg-primary/5 sm:w-auto"
            >
              <Link to="/plan">Start planning</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground">
            {["Free to start", "No card needed", "You choose who comes"].map((item) => (
              <li key={item} className="inline-flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-secondary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside className="absolute right-8 top-32 hidden w-[220px] border-l border-border pl-6 xl:block">
          <p className="font-display text-2xl font-medium leading-[1.1] text-primary">
            Start with something real.
          </p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Trips shared by travellers and agencies, ready to join or make your own.
          </p>
        </aside>

        <div className="relative mt-12 h-[470px] rounded-[26px] bg-[#173F35] sm:mt-14 sm:h-[430px] sm:rounded-[30px]">
          <AppImage
            src={heroGroupHike}
            alt="Travellers walking together on a mountain trail"
            priority
            width={1920}
            height={1080}
            className="h-full w-full rounded-[inherit] object-cover object-[42%_center] sm:object-center"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-b-[inherit] bg-gradient-to-t from-[#102D26]/50 to-transparent" />
          <svg
            className="absolute right-[8%] top-12 h-[250px] w-[130px] sm:right-[16%] sm:top-14 sm:h-[270px] sm:w-[160px]"
            viewBox="0 0 160 270"
            aria-hidden="true"
          >
            <path
              d="M121 6 C159 27 54 42 78 68 C100 91 29 93 46 124 C66 157 127 135 112 172 C98 207 18 198 29 259"
              fill="none"
              stroke="#E87656"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>

          <span className="absolute bottom-[104px] left-4 rounded-2xl bg-[#F7F3EA] px-4 py-3 text-xs font-bold tracking-[0.12em] text-[#173F35] sm:bottom-6 sm:left-6">
            GO FURTHER, TOGETHER
          </span>

          <div
            style={heroColumns}
            className="absolute inset-x-4 bottom-4 grid min-h-[76px] grid-cols-[repeat(var(--hero-cols),minmax(0,1fr))] overflow-hidden rounded-[20px] border border-white/50 bg-[#F7F3EA]/95 shadow-hover sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[590px] sm:grid-cols-[repeat(var(--hero-cols),minmax(0,1fr))_54px]"
          >
            {discoveryItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex min-w-0 flex-col items-center justify-center gap-1 border-r border-[#D9E1DC] px-1 py-3 text-center text-[#173F35] transition-colors hover:bg-white/60 sm:px-3"
              >
                <span className="flex items-center gap-2 text-xs font-bold sm:text-xs">
                  {item.label === "Trips to join" && (
                    <span className="hidden h-1.5 w-1.5 rounded-full bg-accent sm:block" aria-hidden="true" />
                  )}
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
                <span className="max-w-full truncate text-xs font-medium leading-tight text-[#52665F] sm:hidden">
                  {item.shortMeta}
                </span>
                <span className="hidden max-w-full truncate text-xs font-medium text-[#52665F] sm:block">
                  {item.meta}
                </span>
              </Link>
            ))}
            <Link
              to="/explore"
              aria-label="Explore real trips"
              className="hidden h-full items-center justify-center sm:flex"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#173F35] text-white transition-transform hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
