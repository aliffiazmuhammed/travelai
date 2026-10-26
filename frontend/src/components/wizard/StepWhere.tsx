import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Search,
  Sparkles,
  Check,
  Map,
  Palmtree,
  Mountain,
  Landmark,
  Trees,
  MoonStar,
  Flame,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PopularDestination {
  id: string;
  name: string;
  state: string;
  tagline: string;
  icon: LucideIcon;
  tags: string[];
  gradient: string;
}

const POPULAR_DESTINATIONS: PopularDestination[] = [
  {
    id: "goa",
    name: "Goa",
    state: "Goa",
    tagline: "Sun-kissed beaches, coastal cafes & vibrant nightlife",
    icon: Palmtree,
    tags: ["Beaches", "Nightlife", "Seafood"],
    gradient: "from-amber-500/10 via-orange-500/10 to-rose-500/10",
  },
  {
    id: "manali",
    name: "Manali",
    state: "Himachal Pradesh",
    tagline: "Snow peaks, Solang Valley adventure & mountain breeze",
    icon: Mountain,
    tags: ["Mountains", "Adventure", "Snow"],
    gradient: "from-blue-500/10 via-cyan-500/10 to-teal-500/10",
  },
  {
    id: "jaipur",
    name: "Jaipur",
    state: "Rajasthan",
    tagline: "Royal palaces, majestic forts & vibrant bazaars",
    icon: Landmark,
    tags: ["Heritage", "Culture", "Royal"],
    gradient: "from-rose-500/10 via-pink-500/10 to-amber-500/10",
  },
  {
    id: "kerala",
    name: "Kerala (Munnar & Alleppey)",
    state: "Kerala",
    tagline: "Lush tea hills, tranquil backwaters & Ayurveda",
    icon: Trees,
    tags: ["Nature", "Backwaters", "Relaxation"],
    gradient: "from-emerald-500/10 via-green-500/10 to-teal-500/10",
  },
  {
    id: "ladakh",
    name: "Leh Ladakh",
    state: "Ladakh",
    tagline: "Pangong Tso, high passes, monasteries & raw landscapes",
    icon: MoonStar,
    tags: ["Biking", "Lakes", "Stargazing"],
    gradient: "from-indigo-500/10 via-purple-500/10 to-blue-500/10",
  },
  {
    id: "varanasi",
    name: "Varanasi",
    state: "Uttar Pradesh",
    tagline: "Spiritual ghats, Ganga Aarti & timeless heritage",
    icon: Flame,
    tags: ["Spiritual", "Ghats", "Culture"],
    gradient: "from-orange-500/10 via-amber-500/10 to-yellow-500/10",
  },
];

interface StepWhereProps {
  destination: string;
  onChange: (value: string) => void;
  onEnterNext?: () => void;
}

export const StepWhere: React.FC<StepWhereProps> = ({
  destination,
  onChange,
  onEnterNext,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && destination.trim() && onEnterNext) {
      e.preventDefault();
      onEnterNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>Where are you dreaming of going?</span>
          <Map className="w-6 h-6 text-primary" aria-hidden="true" />
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Choose a trending Indian hotspot or type any city, hill station, or country you want to explore.
        </p>
      </div>

      {/* Destination Search Box */}
      <div className="relative max-w-xl mx-auto">
        <div className="relative flex items-center">
          <MapPin className="absolute left-4 w-5 h-5 text-primary pointer-events-none" />
          <Input
            id="destination-input"
            type="text"
            autoFocus
            value={destination}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search destination (e.g. Udaipur, Shimla, Bali, Pondicherry)..."
            className="h-14 pl-12 pr-12 text-base font-medium rounded-2xl shadow-sm border-border/80 focus-visible:ring-primary/30"
          />
          {destination && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-4 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded-md"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Popular Trending Destinations Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Popular destinations</span>
          </div>
          <span className="text-xs text-muted-foreground">Click to select</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {POPULAR_DESTINATIONS.map((dest) => {
            const isSelected = destination.toLowerCase().includes(dest.name.toLowerCase());

            return (
              <div
                key={dest.id}
                onClick={() => onChange(dest.name)}
                className={cn(
                  "relative group p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 bg-gradient-to-br",
                  dest.gradient,
                  isSelected
                    ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20 scale-[1.02]"
                    : "border-border/60 hover:border-primary/50 hover:shadow-sm hover:scale-[1.01]"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-white/70 dark:bg-card/70 rounded-lg shadow-2xs flex items-center justify-center">
                      <dest.icon className="w-5 h-5 text-primary" />
                    </span>
                    <div>
                      <h4 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                        {dest.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        {dest.state}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                  {dest.tagline}
                </p>

                <div className="flex flex-wrap gap-1">
                  {dest.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-2 py-0.5 border-border/70 bg-card/60"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
