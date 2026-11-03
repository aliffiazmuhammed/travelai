import React from "react";
import {
  Check,
  Languages,
  Gauge,
  UtensilsCrossed,
  Mountain,
  Landmark,
  Waves,
  Trees,
  Camera,
  Music,
  ShoppingBag,
  Coffee,
  Footprints,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripLanguage, TravelPace } from "@/types/trip";

interface TravelStyleOption {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  tags: string[];
}

const STYLE_OPTIONS: TravelStyleOption[] = [
  {
    id: "Adventure",
    name: "Adventure & Thrill",
    icon: Mountain,
    description: "Trekking, water sports, paragliding, high passes & river rafting",
    tags: ["Trekking", "Rafting", "Outdoor"],
  },
  {
    id: "Culture",
    name: "Culture & Heritage",
    icon: Landmark,
    description: "Forts, royal palaces, UNESCO temples, heritage walks & folklore",
    tags: ["Heritage", "Monuments", "History"],
  },
  {
    id: "Relaxation",
    name: "Relaxation & Wellness",
    icon: Waves,
    description: "Serene beaches, tranquil backwaters, Ayurvedic massage & slow pace",
    tags: ["Spa", "Beaches", "Peaceful"],
  },
  {
    id: "Food",
    name: "Food & Culinary Trail",
    icon: UtensilsCrossed,
    description: "Authentic local dhabas, street food walks, traditional thalis & cafes",
    tags: ["Street Food", "Regional Thalis", "Cafes"],
  },
  {
    id: "Nature",
    name: "Nature & Wildlife",
    icon: Trees,
    description: "Lush tea gardens, wildlife safaris, misty waterfalls & lakes",
    tags: ["Safaris", "Flora", "Scenic"],
  },
  {
    id: "Photography",
    name: "Photography & Views",
    icon: Camera,
    description: "Breathtaking viewpoints, sunrise spots, vibrant streets & golden hours",
    tags: ["Landscape", "Golden Hour", "Insta-spots"],
  },
  {
    id: "Nightlife",
    name: "Nightlife & Social",
    icon: Music,
    description: "Beach shacks, rooftop lounges, live music & vibrant evening markets",
    tags: ["Music", "Clubs", "Evening Vibe"],
  },
  {
    id: "Shopping",
    name: "Shopping & Souvenirs",
    icon: ShoppingBag,
    description: "Local artisan bazaars, spice markets, textiles & authentic crafts",
    tags: ["Handicrafts", "Spices", "Bazaars"],
  },
];

const LANGUAGE_OPTIONS: { id: TripLanguage; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "bn", label: "Bengali", native: "বাংলা" },
  { id: "te", label: "Telugu", native: "తెలుగు" },
  { id: "mr", label: "Marathi", native: "मराठी" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { id: "ml", label: "Malayalam", native: "മലയാളം" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

const PACE_OPTIONS: {
  id: TravelPace;
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  { id: "relaxed", label: "Relaxed", icon: Coffee, description: "Fewer activities, long breaks" },
  { id: "balanced", label: "Balanced", icon: Footprints, description: "Highlights plus downtime" },
  { id: "packed", label: "Action-packed", icon: Zap, description: "See as much as possible" },
];

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Jain", "Halal", "Gluten-free"];

interface StepStyleProps {
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  language: TripLanguage;
  onLanguageChange: (language: TripLanguage) => void;
  pace: TravelPace;
  onPaceChange: (pace: TravelPace) => void;
  dietary: string[];
  onToggleDietary: (item: string) => void;
}

/** Shared pill for dietary and language choices. */
const pillClass = (isActive: boolean) =>
  cn(
    "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive
      ? "border-primary/50 bg-primary/10 text-primary"
      : "border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
  );

export const StepStyle: React.FC<StepStyleProps> = ({
  selectedInterests,
  onToggleInterest,
  onSelectAll,
  onClearAll,
  language,
  onLanguageChange,
  pace,
  onPaceChange,
  dietary,
  onToggleDietary,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          What kind of trip do you enjoy?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Pick one or more — this shapes your days
        </p>
      </div>

      {/* Selection Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">
          {selectedInterests.length === 0
            ? "Select at least one interest"
            : `${selectedInterests.length} selected`}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            className="font-semibold text-primary transition-colors hover:underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Styles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STYLE_OPTIONS.map((style) => {
          const isSelected = selectedInterests.includes(style.id);
          const StyleIcon = style.icon;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggleInterest(style.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <StyleIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">
                    {style.name}
                  </span>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/80 bg-background"
                  )}
                >
                  {isSelected && (
                    <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                  )}
                </span>
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                {style.description}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                {style.tags.join(" · ")}
              </p>
            </button>
          );
        })}
      </div>

      {/* Travel Pace */}
      <div className="space-y-3 border-t border-border/60 pt-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            Travel pace
          </h3>
          <p className="text-xs text-muted-foreground">
            How packed should each day be?
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PACE_OPTIONS.map((option) => {
            const isActive = pace === option.id;
            const PaceIcon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onPaceChange(option.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <PaceIcon
                    className={cn(
                      "h-5 w-5",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  {isActive && (
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {option.label}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dietary Preferences */}
      <div className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <UtensilsCrossed className="h-4 w-4 text-primary" aria-hidden="true" />
            Dietary preferences
          </h3>
          <p className="text-xs text-muted-foreground">Optional</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((item) => {
            const isActive = dietary.includes(item);
            return (
              <button
                key={item}
                type="button"
                aria-pressed={isActive}
                onClick={() => onToggleDietary(item)}
                className={pillClass(isActive)}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Language */}
      <div className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <Languages className="h-4 w-4 text-primary" aria-hidden="true" />
            Itinerary language
          </h3>
          <p className="text-xs text-muted-foreground">
            The language your plan is written in
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = language === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onLanguageChange(option.id)}
                className={pillClass(isActive)}
              >
                <span>{option.native}</span>
                {option.native !== option.label && (
                  <span className="text-[10px] font-normal opacity-70">
                    {option.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
