import React from "react";
import { Input } from "@/components/ui/input";
import { CalendarDays, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PopularDestination {
  id: string;
  name: string;
}

/** The suggestion chips shown under the search field. */
const POPULAR_DESTINATIONS: PopularDestination[] = [
  { id: "goa", name: "Goa" },
  { id: "manali", name: "Manali" },
  { id: "jaipur", name: "Jaipur" },
  { id: "kerala", name: "Kerala (Munnar & Alleppey)" },
  { id: "ladakh", name: "Leh Ladakh" },
  { id: "varanasi", name: "Varanasi" },
];

/**
 * Rough trip-length shortcuts. The day counts match the quick presets on the
 * When step, so choosing one here moves the real start/end dates there.
 */
const DURATION_OPTIONS: { id: string; label: string; days: number }[] = [
  { id: "weekend", label: "Weekend", days: 3 },
  { id: "week", label: "4–7 days", days: 7 },
  { id: "fortnight", label: "2 weeks+", days: 14 },
];

interface StepWhereProps {
  destination: string;
  onChange: (value: string) => void;
  onEnterNext?: () => void;
  /** Current trip length in days, derived from the shared date state. */
  durationDays?: number;
  /** Apply a rough duration; the parent writes the real start/end dates. */
  onSelectDuration?: (days: number) => void;
}

export const StepWhere: React.FC<StepWhereProps> = ({
  destination,
  onChange,
  onEnterNext,
  durationDays,
  onSelectDuration,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && destination.trim() && onEnterNext) {
      e.preventDefault();
      onEnterNext();
    }
  };

  // Collapse any real trip length into the three rough buckets above.
  const activeDuration =
    !durationDays || durationDays <= 0
      ? null
      : durationDays <= 3
      ? 3
      : durationDays <= 7
      ? 7
      : 14;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Where do you want to go?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Search destinations, regions or countries
        </p>
      </div>

      {/* Destination Search Box */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="destination-input"
          type="text"
          autoFocus
          aria-label="Destination"
          value={destination}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search destination (e.g. Udaipur, Shimla, Bali, Pondicherry)..."
          className="h-14 rounded-2xl border-border/80 bg-background pl-12 pr-12 text-base font-medium shadow-xs focus-visible:ring-primary/30"
        />
        {destination && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear destination"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Popular Destinations */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Popular right now
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_DESTINATIONS.map((dest) => {
            const isSelected = destination
              .toLowerCase()
              .includes(dest.name.toLowerCase());

            return (
              <button
                key={dest.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChange(dest.name)}
                className={cn(
                  "inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/80 bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground"
                )}
              >
                {dest.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rough Duration */}
      <div className="space-y-3 border-t border-border/60 pt-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            How long?
          </h3>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Choose a rough duration (you can fine-tune later)
          </p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border/80">
          {DURATION_OPTIONS.map((option) => {
            const isActive = activeDuration === option.days;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectDuration?.(option.days)}
                className={cn(
                  "flex min-h-[52px] items-center justify-center gap-2 border-r border-border/60 px-2 py-3 text-xs font-semibold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:text-sm",
                  isActive
                    ? "bg-primary/5 text-primary"
                    : "bg-card text-foreground/80 hover:bg-muted/50"
                )}
              >
                <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
